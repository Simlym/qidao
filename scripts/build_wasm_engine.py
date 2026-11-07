"""从官方固定 WASM 移植构建 Fairy 象棋候选；Linux + Docker，不发布附件。"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
COMMIT = "d062eec1681dc8c805fed80dfa0528eeb554312b"
REPO = "https://github.com/fairy-stockfish/fairy-stockfish.wasm.git"
IMAGE = "emscripten/emsdk:2.0.26"
NETWORK_SHA = "c07e94a5c7cbeae443ed79a8fa412875d833a7f8e04333815e39729c59d52e11"
NETWORK_URL = "https://raw.githubusercontent.com/fairy-stockfish/Fairy-Stockfish-NNUE/5fbbb9e15fd882cec18a2a5c3d4bfa25dc07169b/xiangqi-c07e94a5c7cb.nnue"

def run(*args, **kwargs):
    subprocess.run([str(x) for x in args], check=True, **kwargs)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    source = output / "source"
    run("git", "clone", "--no-checkout", REPO, source)
    run("git", "-C", source, "checkout", "--detach", COMMIT)
    run("docker", "pull", IMAGE)
    image = subprocess.check_output(["docker", "image", "inspect", IMAGE, "--format", "{{index .RepoDigests 0}}"], text=True).strip()
    arguments = ["make", "-C", "/src/src", "-j2", "emscripten_build", "ARCH=wasm", "largeboards=yes",
                 "nnue=no", "embedded_nnue=no", "wasm_simd=no", "minify_js=no"]
    run("docker", "run", "--rm", "-v", f"{source}:/src", image, *arguments)
    stage = output / "package"
    stage.mkdir()
    for name in ["stockfish.js", "stockfish.wasm", "stockfish.worker.js"]:
        shutil.copyfile(source / "src/emscripten/public" / name, stage / name)
    shutil.copyfile(ROOT / "scripts/wasm/engine.worker.js", stage / "engine.worker.js")
    network = stage / "xiangqi-c07e94a5c7cb.nnue"
    with urllib.request.urlopen(NETWORK_URL, timeout=120) as response:
        network.write_bytes(response.read(12 * 1024 * 1024))
    if sha(network) != NETWORK_SHA:
        raise ValueError("NNUE 哈希不符")
    licenses = stage / "licenses"
    licenses.mkdir()
    shutil.copyfile(source / "Copying.txt", licenses / "GPL-3.0.txt")
    shutil.copyfile(source / "AUTHORS", licenses / "AUTHORS.txt")
    for name in ["CC0-1.0.txt", "Fairy-Xiangqi-NNUE.md"]:
        shutil.copyfile(ROOT / "docs/licenses" / name, licenses / name)
    (stage / "SOURCE.md").write_text(f"# Fairy WASM 候选\n\n源码：{REPO}\n提交：{COMMIT}\n"
        f"工具镜像：{image}\n构建参数：{' '.join(arguments)}\n权重：{NETWORK_URL}\n"
        "构建脚本和棋岛 Worker 适配见配套 qidao-wasm-build-source.zip；上游源码见 fairy-wasm-source.zip。\n"
        "线程版，要求 SharedArrayBuffer / COOP / COEP；Threads=1 仍需要线程运行时。尚未公开发布。\n", encoding="utf-8")
    manifest = {"schemaVersion": 1, "id": "fairy-xiangqi-c07e94a5-wasm-threads", "name": "Fairy-Stockfish NNUE",
                "version": f"c07e94a5-{COMMIT[:8]}", "variant": "xiangqi", "runtime": "wasm", "protocol": "uci",
                "entrypoint": "engine.worker.js", "threads": True, "sourceCommit": COMMIT, "sourceUrl": REPO,
                "engineLicense": "GPL-3.0", "networkLicense": "CC0-1.0", "buildImage": image, "assets": []}
    for path in sorted(stage.rglob("*")):
        if path.is_file():
            manifest["assets"].append({"path": path.relative_to(stage).as_posix(), "size": path.stat().st_size,
                "sha256": sha(path), "role": "evaluation-network" if path == network else "file"})
    (stage / "engine-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    archive = output / "xiangqi-fairy-stockfish-c07e94a5-d062eec1-wasm-threads.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zip:
        for path in sorted(stage.rglob("*")):
            if path.is_file(): zip.write(path, path.relative_to(stage))
    run("git", "-C", source, "archive", "--format=zip", f"--output={output / 'fairy-wasm-source.zip'}", COMMIT)
    with zipfile.ZipFile(output / "qidao-wasm-build-source.zip", "w", zipfile.ZIP_DEFLATED) as zip:
        for name in ["scripts/build_wasm_engine.py", "scripts/wasm/engine.worker.js"]:
            zip.write(ROOT / name, name)
    (output / "build-result.json").write_text(json.dumps({"fileName": archive.name, "size": archive.stat().st_size,
        "sha256": sha(archive), "manifestSha256": sha(stage / "engine-manifest.json"), "manifest": manifest}, ensure_ascii=False, indent=2), encoding="utf-8")
    files = sorted(output.glob("*.zip")) + [output / "build-result.json"]
    (output / "SHA256SUMS.txt").write_text("".join(f"{sha(p)}  {p.name}\n" for p in files), encoding="utf-8")

if __name__ == "__main__":
    main()
