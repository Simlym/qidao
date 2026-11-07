"""核验正式 WASM 发行清单后，将 ZIP 放入独立静态站点目录；不下载、不发布。"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "frontend/src/domain/xiangqi/engine/wasm-packages.json"

def prepare(catalog, artifacts, output):
    for spec in catalog["packages"]:
        if not spec.get("publicDownload"):
            continue
        tag, name = spec["releaseTag"], spec["fileName"]
        if not re.fullmatch(r"engines-\d{8}\.[1-9]\d*", tag) or not re.fullmatch(r"[A-Za-z0-9_.-]+\.zip", name):
            raise ValueError("发行路径无效")
        source = artifacts / name
        if source.stat().st_size != spec["size"] or hashlib.sha256(source.read_bytes()).hexdigest() != spec["sha256"]:
            raise ValueError("ZIP 校验失败")
        with zipfile.ZipFile(source) as zip:
            info = zip.getinfo("engine-manifest.json")
            if info.file_size > 1024 * 1024:
                raise ValueError("清单过大")
            if hashlib.sha256(zip.read(info)).hexdigest() != spec["manifestSha256"]:
                raise ValueError("清单校验失败")
        destination = output / tag / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            if hashlib.sha256(destination.read_bytes()).hexdigest() != spec["sha256"]:
                raise ValueError("固定发行路径已存在不同内容，须递增发行标签")
            continue
        temporary = destination.with_suffix(".part")
        try:
            shutil.copyfile(source, temporary)
            if hashlib.sha256(temporary.read_bytes()).hexdigest() != spec["sha256"]:
                raise ValueError("复制后校验失败")
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "dist-engine-site")
    parser.add_argument("--download", action="store_true", help="通过 gh 下载固定公开 Releases 附件，再核验并准备 GitHub Pages")
    args = parser.parse_args()
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    if args.download:
        args.artifacts.mkdir(parents=True, exist_ok=True)
        for spec in catalog["packages"]:
            if spec.get("publicDownload"):
                subprocess.run(["gh", "release", "download", spec["releaseTag"], "--repo", "Simlym/qidao",
                                "--pattern", spec["fileName"], "--dir", str(args.artifacts), "--skip-existing"], check=True)
    prepare(catalog, args.artifacts, args.output)

if __name__ == "__main__":
    main()
