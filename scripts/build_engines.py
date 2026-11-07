"""从固定 GitHub 提交构建 Windows 测试包，不读取 local-engines，不发布文件。"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import threading
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / ".engine-build"
CONFIG = ROOT / "docs/engines/source-builds.json"
ARCH = "x86-64-sse41-popcnt"
FENS = {
    "xiangqi": "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1",
    "jieqi": "xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w A2B2N2R2C2P5a2b2n2r2c2p5 - 0 1",
}


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def run(args, **kwargs):
    return subprocess.run([str(x) for x in args], check=True, **kwargs)


def download(url, target, expected):
    if not re.fullmatch(r"[0-9a-f]{64}", expected or ""):
        raise ValueError("下载前必须先固定 SHA-256")
    if target.exists() and sha256(target) == expected:
        return
    temporary = target.with_suffix(target.suffix + ".partial")
    # 使用系统 TLS 校验；不依赖本机遗留的代理环境变量。
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=120) as response, temporary.open("wb") as output:
        shutil.copyfileobj(response, output, 1024 * 1024)
    if sha256(temporary) != expected:
        raise ValueError(f"下载校验失败：{target.name}")
    temporary.replace(target)


def checkout(variant, spec, repository):
    path = BUILD / f"{variant}-source"
    if not path.exists():
        run(["git", "init", path], stdout=subprocess.DEVNULL)
        run(["git", "-C", path, "remote", "add", "origin", repository])
    git = ["git", "-c", "http.proxy=", "-c", "https.proxy=", "-C", path]
    # Windows 云端 runner 也保留上游 shell 脚本的 LF 换行。
    run(git + ["config", "core.autocrlf", "false"])
    present = subprocess.run([str(x) for x in git + ["cat-file", "-e", spec["commit"]]],
                             capture_output=True).returncode == 0
    if not present:
        run(git + ["fetch", "--depth", "1", "origin", spec["commit"]])
    if present:
        run(git + ["diff", "--exit-code", "HEAD"], stdout=subprocess.DEVNULL)
    run(git + ["checkout", "--detach", spec["commit"]])
    actual = subprocess.check_output([str(x) for x in git + ["rev-parse", "HEAD"]], text=True).strip()
    if actual != spec["commit"]:
        raise ValueError("源码提交不一致")
    return path


def extract_network(archive, destination):
    names = subprocess.check_output(["tar", "-tf", str(archive)], text=True).splitlines()
    matches = [name for name in names if name.replace("\\", "/").split("/")[-1] == "pikafish.nnue"]
    if len(matches) != 1:
        raise ValueError("上游发布包必须包含唯一的 pikafish.nnue")
    with destination.open("wb") as output:
        run(["tar", "-xOf", archive, matches[0]], stdout=output)
    if destination.stat().st_size < 1024:
        raise ValueError("权重文件大小异常")


def smoke(executable, variant, network_file="pikafish.nnue", uci_options=None, uci_protocol=None):
    """逐条等待协议响应，避免提前 quit 导致假阳性；超时后终止进程。"""
    process = subprocess.Popen([str(executable)], cwd=executable.parent,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    lines = queue.Queue()
    transcript = []

    def read():
        for line in process.stdout:
            lines.put(line.rstrip())
        lines.put(None)

    threading.Thread(target=read, daemon=True).start()

    def command(value):
        process.stdin.write(value + "\n")
        process.stdin.flush()

    def wait(prefix, timeout=60):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                line = lines.get(timeout=max(0.01, deadline - time.monotonic()))
            except queue.Empty:
                break
            if line is None:
                raise ValueError("引擎提前退出：" + "\n".join(transcript[-10:]))
            transcript.append(line)
            if line.startswith(prefix):
                return line
        raise ValueError(f"等待 {prefix} 超时")

    try:
        if uci_protocol == "ucicyclone":
            command("ucicyclone")
        command("uci")
        wait("uciok")
        for name, value in (uci_options or {}).items():
            command(f"setoption name {name} value {str(value).lower() if isinstance(value, bool) else value}")
        command("setoption name Threads value 1")
        command("setoption name Hash value 32")
        if network_file:
            command(f"setoption name EvalFile value {executable.parent / network_file}")
        command("isready")
        wait("readyok")
        command("ucinewgame")
        command("position fen " + FENS[variant])
        command("go depth 2")
        bestmove = wait("bestmove ")
        if not re.fullmatch(r"bestmove [a-i][0-9][a-i][0-9](?: ponder [a-i][0-9][a-i][0-9])?", bestmove):
            raise ValueError("引擎未返回有效坐标着法：" + bestmove)
        command("quit")
        process.wait(timeout=10)
        if process.returncode != 0:
            raise ValueError("引擎退出码异常")
        return {"status": "smoke-passed", "position": FENS[variant], "depth": 2,
                "bestmove": bestmove, "transcript": transcript,
                "note": "仅验证握手、权重加载和浅层试算，完整应用验收待用户测试"}
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        process.stdin.close()
        process.stdout.close()


def build(variant, config, toolchain, output, jobs):
    build_key = variant
    spec = config["engines"][variant]
    repository = spec.get("repository", config["repository"])
    source = checkout(variant, spec, repository)
    variant = spec.get("variant", variant)
    engine_id = spec.get("engineId", "pikafish")
    classical = spec.get("evaluation") == "classical"
    network_file = None if classical else spec.get("networkFileName", "pikafish.nnue")
    if classical:
        if variant != "jieqi" or not re.search(r"#define\s+USE_NNUEEVAL\s+0\b", (source / "src/types.h").read_text(encoding="utf-8")):
            raise ValueError("无权重构建仅适用于已确认关闭 NNUE 的揭棋源码")
        network_source = None
    elif spec.get("networkUrl"):
        download(spec["networkUrl"], BUILD / network_file, spec["networkSha256"])
        shutil.copyfile(BUILD / network_file, source / "src" / network_file)
        network_source = {"url": spec["networkUrl"], "sha256": spec["networkSha256"]}
    else:
        archive = BUILD / spec["networkArchiveUrl"].rsplit("/", 1)[-1]
        download(spec["networkArchiveUrl"], archive, spec["networkArchiveSha256"])
        extract_network(archive, source / "src" / network_file)
        network_source = {"url": spec["networkArchiveUrl"], "sha256": spec["networkArchiveSha256"]}
    env = os.environ.copy()
    env["PATH"] = str(toolchain) + os.pathsep + env["PATH"]
    env["OS"] = "Windows_NT"
    env["LC_ALL"] = "C"
    # w64devkit 不提供 LTO 和 GBK 转码；通过额外 Makefile 适配，不修改上游源码。
    overlay = source / "src/qidao-build.mk"
    overlay.write_text("include Makefile\n"
                       "override CXXFLAGS := $(filter-out -flto -flto=full -flto=jobserver -flto-partition=one -fexec-charset=GBK,$(CXXFLAGS)) -fexec-charset=UTF-8\n"
                       "override LDFLAGS := $(filter-out -flto -flto=full -flto=jobserver -flto-partition=one -save-temps -fexec-charset=GBK,$(LDFLAGS)) -fexec-charset=UTF-8\n", encoding="utf-8")
    make = (toolchain / "make.exe").as_posix()
    # 子 make 继续使用相同覆盖文件，避免重新引入 LTO。
    common = ["-f", "qidao-build.mk", f"ARCH={ARCH}", "COMP=mingw", "CXX=g++",
              f'MAKE="{make}" -f qidao-build.mk', *spec.get("makeOptions", [])]
    command = [make, f"-j{jobs}", "build", *common]
    log = output / f"{build_key}-build.log"
    with log.open("w", encoding="utf-8") as stream:
        run([make, "objclean", *common], cwd=source / "src", env=env, stdout=stream, stderr=subprocess.STDOUT)
        run(command, cwd=source / "src", env=env, stdout=stream, stderr=subprocess.STDOUT)
    binary = source / "src" / spec["executable"]
    run([toolchain / "strip.exe", binary])
    name = f"{variant}-{engine_id}-{spec['version']}-windows-x64-sse41-popcnt"
    stage = output / name
    stage.mkdir(exist_ok=False)
    shutil.copyfile(binary, stage / spec["executable"])
    if network_file:
        shutil.copyfile(source / "src" / network_file, stage / network_file)
    licenses = stage / "licenses"
    licenses.mkdir()
    shutil.copyfile(source / "Copying.txt", licenses / "GPL-3.0.txt")
    if (source / "AUTHORS").exists():
        shutil.copyfile(source / "AUTHORS", licenses / "AUTHORS.txt")
    for license_file in spec.get("licenseFiles", []):
        shutil.copyfile(ROOT / license_file, licenses / Path(license_file).name)
    shutil.copyfile(overlay, stage / "qidao-build.mk")
    report = smoke(stage / spec["executable"], variant, network_file, spec.get("uciOptions"), spec.get("uciProtocol"))
    (stage / "smoke-test.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if engine_id == "fairy-stockfish":
        from engine_protocol import validate_fairy
        protocol_report = validate_fairy(stage / spec["executable"], stage / network_file)
        (stage / "protocol-test.json").write_text(json.dumps(protocol_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    compiler = subprocess.check_output([str(toolchain / "g++.exe"), "--version"], text=True).splitlines()[0]
    manifest = {"schemaVersion": 1, "id": name, "name": spec.get("name", "Pikafish" if variant == "xiangqi" else "PikaJieQi"),
                "version": spec["version"], "variant": variant, "runtime": "native", "protocol": "uci",
                "entrypoint": spec["executable"], "coordinates": "a0-i9", "uciOptions": spec.get("uciOptions", {}),
                "uciVariant": spec.get("uciOptions", {}).get("UCI_Variant"), "uciProtocol": spec.get("uciProtocol"),
                "platform": "windows-x64", "requiresFeatures": ["sse4.1", "popcnt"],
                "sourceUrl": repository, "sourceCommit": spec["commit"],
                "engineLicense": "GPL-3.0", "networkLicenseUrl": spec.get("networkLicenseUrl"),
                "evaluation": "classical" if classical else "nnue",
                "distribution": spec["distribution"], "verification": {"status": "smoke-passed", "application": "pending-user-test"},
                "build": {"compiler": compiler, "toolchain": config["toolchain"], "arguments": command[1:]},
                "networkLicense": spec.get("networkLicense"), "networkSource": network_source,
                "assets": []}
    source_name = name + "-source.zip"
    run(["git", "-C", source, "archive", "--format=zip", f"--output={output / source_name}", spec["commit"]])
    (stage / "SOURCE.md").write_text(
        f"# 源码构建测试包\n\n源码：{repository}\n\n提交：`{spec['commit']}`\n\n"
        f"对应源码附件：`{source_name}`\n\n编译器：{compiler}\n\n"
        f"编译参数：`{' '.join(command[1:])}`\n\n权重来源：{network_source['url'] if network_source else '不适用；固定源码 USE_NNUEEVAL=0，采用传统评估，不附带权重'}\n\n"
        f"权重许可依据：{spec.get('networkLicenseUrl', '不适用')}\n\n"
        "构建：将包内 qidao-build.mk 复制到源码 src，执行上述参数；覆盖文件关闭工具链不支持的 LTO，并统一 UTF-8 输出编码。\n\n"
        f"用途：客户端兼容性测试，分发状态为 {spec['distribution']}；实际许可见 licenses。完整构建步骤见棋岛 scripts/build_engines.py。\n",
        encoding="utf-8")
    for path in sorted(stage.rglob("*")):
        if path.is_file():
            manifest["assets"].append({"path": path.relative_to(stage).as_posix(), "size": path.stat().st_size,
                                       "sha256": sha256(path), "role": "evaluation-network" if path.name == network_file else "file"})
    (stage / "engine-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with zipfile.ZipFile(output / (name + ".zip"), "w", zipfile.ZIP_DEFLATED) as package:
        for path in sorted(stage.rglob("*")):
            if path.is_file():
                package.write(path, path.relative_to(stage).as_posix())
    print(f"已生成测试包：{stage}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", choices=["xiangqi", "jieqi", "fairy-xiangqi", "all"], default="all")
    parser.add_argument("--toolchain", type=Path, default=BUILD / "w64devkit/bin")
    parser.add_argument("--output", type=Path, required=True, help="新的输出目录，不覆盖已有测试包")
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument("--check-distribution", action="store_true", help="发布前检查，未核准的构建直接拒绝")
    parser.add_argument("--preflight", action="store_true", help="只检查固定来源和分发条件，不下载或构建")
    parser.add_argument("--release-tag", help="固定发行标签；本地测试可省略")
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    variants = list(config["engines"]) if args.engine == "all" else [args.engine]
    if args.release_tag and not re.fullmatch(r"engines-\d{8}\.[1-9]\d*", args.release_tag):
        parser.exit(1, "标签必须为 engines-YYYYMMDD.修订号\n")
    for variant in variants:
        spec = config["engines"][variant]
        if not re.fullmatch(r"[0-9a-f]{40}", spec["commit"]) or (spec.get("evaluation") != "classical" and not re.fullmatch(r"[0-9a-f]{64}", spec.get("networkSha256", spec.get("networkArchiveSha256")) or "")):
            parser.exit(1, f"{variant} 必须固定源码提交和权重来源 SHA-256\n")
    if args.check_distribution:
        for variant in variants:
            spec = config["engines"][variant]
            if spec["distribution"] != "approved" or (spec.get("evaluation") != "classical" and not spec.get("networkLicenseEvidence")) or not spec.get("applicationTestEvidence"):
                parser.exit(1, f"{variant} 尚未核准公开分发；可不带 --check-distribution 进行本地构建\n")
    if args.preflight:
        print("固定来源和请求的分发条件检查通过")
        return
    if os.name != "nt" or not (args.toolchain / "make.exe").is_file():
        parser.exit(1, "需要 Windows 和 w64devkit；准备步骤见 docs/engines/source-builds.md\n")
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=False)
    BUILD.mkdir(exist_ok=True)
    try:
        for variant in variants:
            build(variant, config, args.toolchain.resolve(), args.output, max(1, min(args.jobs, 16)))
        entries = []
        for path in sorted(args.output.glob("*/engine-manifest.json")):
            manifest = json.loads(path.read_text(encoding="utf-8"))
            package = args.output / (path.parent.name + ".zip")
            entries.append({**manifest, "releaseTag": args.release_tag, "fileName": package.name,
                            "size": package.stat().st_size, "sha256": sha256(package),
                            "sourceArchive": path.parent.name + "-source.zip"})
        (args.output / "engine-release.json").write_text(json.dumps({"schemaVersion": 1, "packages": entries}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        archives = sorted(args.output.glob("*.zip"))
        (args.output / "SHA256SUMS.txt").write_text("".join(f"{sha256(p)}  {p.name}\n" for p in archives + [args.output / "engine-release.json"]), encoding="utf-8")
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        parser.exit(1, f"构建失败：{error}\n")


if __name__ == "__main__":
    main()
