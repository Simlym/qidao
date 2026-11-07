"""从固定 GitHub 揭棋源码构建无权重单线程 WASM；只生成未发布候选。"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import zipfile
from build_wasm_engine import IMAGE, ROOT, run, sha
from wasm.jieqi_single import apply

COMMIT = "23b9466c981f0f3a1133f92de1a6f86406c4eccc"
REPO = "https://github.com/official-pikafish/Pikafish.git"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    source = output / "source"
    run("git", "clone", "--no-checkout", REPO, source)
    run("git", "-C", source, "checkout", "--detach", COMMIT)
    apply(source)
    run("docker", "pull", IMAGE)
    # 不启用 IS_64BIT、SIMD 或 pthread；使用上游已有的可移植双 uint64 位棋盘。
    sources = "benchmark bitboard evaluate main material misc movegen movepick position psqt search thread timeman tt uci ucioption tune".split()
    sources = [name + ".cpp" for name in sources] + ["nnue/evaluate_nnue.cpp", "nnue/features/half_ka_v2_hm.cpp", "compression/zip.cpp"]
    flags = ["-std=c++17", "-O3", "-DNDEBUG", "--pre-js", "qidao-preamble.js", "-s", "MODULARIZE=1", "-s", "EXPORT_NAME=PikaJieqi",
             "-s", "ENVIRONMENT=web,worker,node", "-s", "ASYNCIFY=1", "-s", 'ASYNCIFY_IMPORTS=["qidao_getline_impl","emscripten_sleep"]',
             "-s", "ASYNCIFY_STACK_SIZE=262144", "-s", "ALLOW_MEMORY_GROWTH=1", "-s", "INITIAL_MEMORY=134217728",
             "-s", "MAXIMUM_MEMORY=2147483648", "-s", "ALLOW_UNIMPLEMENTED_SYSCALLS=1", "--minify", "0", "-o", "pikajieqi.js"]
    run("docker", "run", "--rm", "-v", f"{source}:/src", "-w", "/src/src", IMAGE, "em++", *sources, *flags)
    stage = output / "package"
    stage.mkdir()
    for name in ["pikajieqi.js", "pikajieqi.wasm"]:
        shutil.copyfile(source / "src" / name, stage / name)
    shutil.copyfile(ROOT / "scripts/wasm/jieqi.worker.js", stage / "engine.worker.js")
    # git diff 不含新增文件；完整适配输入另在构建源码附件中提供。
    for name in ["qidao_getline.h", "qidao-preamble.js"]:
        run("git", "-C", source, "add", "-N", f"src/{name}")
    (stage / "qidao-jieqi-single.patch").write_bytes(subprocess.check_output(["git", "-C", str(source), "diff", "--binary"]))
    (stage / "licenses").mkdir()
    for original, name in [("Copying.txt", "GPL-3.0.txt"), ("AUTHORS", "AUTHORS.txt")]:
        shutil.copyfile(source / original, stage / "licenses" / name)
    (stage / "SOURCE.md").write_text(f"# 揭棋 WASM 传统评估候选\n\n源码：{REPO}\n提交：{COMMIT}\n工具镜像：{IMAGE}\n"
        "上游 USE_NNUEEVAL=0；本候选不含权重、不加载 NNUE，不代表 NNUE 棋力。\n"
        "单线程协作适配 v1；完整补丁随包提供。配套 jieqi-wasm-source.zip 为原始源码，"
        "qidao-jieqi-wasm-build-source.zip 包含全部构建脚本。尚未公开发布。\n", encoding="utf-8")
    manifest = dict(schemaVersion=1, id="pikajieqi-23b9466-classical-wasm-single-v1", name="PikaJieQi 传统评估", version="23b9466-classical-single-v1",
        variant="jieqi", runtime="wasm", protocol="uci", entrypoint="engine.worker.js", threads=False, sourceCommit=COMMIT, sourceUrl=REPO,
        sourceModified=True, engineLicense="GPL-3.0", networkLicense="not-applicable", evaluation="classical", buildImage=IMAGE, assets=[])
    for path in sorted(stage.rglob("*")):
        if path.is_file(): manifest["assets"].append(dict(path=path.relative_to(stage).as_posix(), size=path.stat().st_size, sha256=sha(path), role="file"))
    (stage / "engine-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    archive = output / "jieqi-pikajieqi-23b9466-classical-wasm-single-v1.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zip:
        for path in sorted(stage.rglob("*")):
            if path.is_file(): zip.write(path, path.relative_to(stage))
    run("git", "-C", source, "archive", "--format=zip", f"--output={output / 'jieqi-wasm-source.zip'}", COMMIT)
    with zipfile.ZipFile(output / "qidao-jieqi-wasm-build-source.zip", "w", zipfile.ZIP_DEFLATED) as zip:
        for name in ["scripts/build_jieqi_wasm.py", "scripts/build_wasm_engine.py", "scripts/wasm/jieqi_single.py", "scripts/wasm/single_thread.py", "scripts/wasm/single-preamble.js", "scripts/wasm/jieqi.worker.js"]:
            zip.write(ROOT / name, name)
    (output / "build-result.json").write_text(json.dumps(dict(fileName=archive.name, size=archive.stat().st_size, sha256=sha(archive), manifestSha256=sha(stage / "engine-manifest.json"), manifest=manifest), ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "SHA256SUMS.txt").write_text("".join(f"{sha(p)}  {p.name}\n" for p in sorted(output.glob("*.zip")) + [output / "build-result.json"]), encoding="utf-8")

if __name__ == "__main__":
    main()
