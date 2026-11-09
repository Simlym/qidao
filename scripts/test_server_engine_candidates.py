"""在隔离的 CI 工作区把本次候选编入共用安装器，真实安装、重验和服务端试算。"""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def run_installer(binary, *args):
    # 保持 stdin 打开；EOF 在安装器协议中表示取消。
    with subprocess.Popen([str(binary), *map(str, args)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          text=True, encoding="utf-8") as process:
        events = [json.loads(line) for line in process.stdout]
        code = process.wait(timeout=360)
        if code or not events or events[-1].get("type") != "result":
            raise ValueError(f"候选验收失败：{events}")
        return events[-1]["data"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directories", nargs="+", type=Path)
    args = parser.parse_args()
    catalog_path = ROOT / "docs/engines/native-packages.json"
    previous = catalog_path.read_bytes()
    catalog = json.loads(previous)
    candidates = [(p, directory.resolve()) for directory in args.directories
                  for p in json.loads((directory / "native-packages.candidate.json").read_text(encoding="utf-8"))]
    try:
        catalog["packages"].extend(p for p, _ in candidates)
        catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
        subprocess.run(["cargo", "build", "--locked", "--manifest-path", str(ROOT / "src-tauri/engine-installer/Cargo.toml"),
                        "--bin", "qidao-engine-installer"], check=True)
        binary = ROOT / "src-tauri/engine-installer/target/debug/qidao-engine-installer"
        for package, directory in candidates:
            with tempfile.TemporaryDirectory() as temporary:
                installed = run_installer(binary, "import", package["variant"], temporary,
                                          package["id"], directory / package["fileName"])
                run_installer(binary, "verify", package["variant"], temporary, package["id"])
                # 服务端生产封装也必须正确初始化变体、坐标和网络。
                import sys
                sys.path.insert(0, str(ROOT / "backend"))
                from app.engine.uci import Engine
                from build_engines import FENS
                engine = Engine(installed["enginePath"])
                try:
                    assert engine.analyze(FENS[package["variant"]], depth=1).best_move
                finally:
                    engine.close()
    finally:
        catalog_path.write_bytes(previous)


if __name__ == "__main__":
    main()
