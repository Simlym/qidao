"""记录本地引擎基线，或只读校验文件与已记录基线一致；不执行引擎、不下载文件。"""

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "docs/engines/baseline-sources.json"
LOCK = ROOT / "docs/engines/baseline-lock.json"


def inventory():
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    result = {"schemaVersion": 1, "packages": []}
    for package in sources["packages"]:
        directory = (ROOT / package["directory"]).resolve()
        if not directory.is_relative_to((ROOT / "local-engines").resolve()):
            raise ValueError("引擎目录必须位于 local-engines 内")
        if not directory.is_dir():
            raise ValueError(f"缺少本地引擎目录：{package['directory']}")
        files = []
        for path in sorted(directory.rglob("*")):
            if not path.is_file():
                continue
            if not path.resolve().is_relative_to(directory):
                raise ValueError(f"文件不能指向引擎目录外：{path.name}")
            digest = hashlib.sha256()
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            files.append({"path": path.relative_to(directory).as_posix(),
                          "size": path.stat().st_size, "sha256": digest.hexdigest()})
        if not files:
            raise ValueError(f"引擎目录为空：{package['directory']}")
        result["packages"].append({"id": package["id"], "files": files})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="只读比对已记录基线，不覆盖清单")
    args = parser.parse_args()
    try:
        result = inventory()
        if args.check:
            if result != json.loads(LOCK.read_text(encoding="utf-8")):
                raise ValueError("本地文件与基线不一致；请先检查变更，再有意更新清单")
            print("本地引擎文件与基线一致")
        else:
            LOCK.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print("已记录本地引擎大小和 SHA-256；此操作不代表运行验证或允许分发")
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f"校验失败：{error}\n")


if __name__ == "__main__":
    main()
