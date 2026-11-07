"""WASM 静态发行材料的完整性与不可变路径测试。"""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("wasm_site", Path(__file__).resolve().parents[1] / "prepare_wasm_site.py")
site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site)

class WasmSiteTests(unittest.TestCase):
    def test_仅复制已公开且校验通过的固定包(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = b'{"runtime":"wasm"}'
            with zipfile.ZipFile(root / "test.zip", "w") as zip:
                zip.writestr("engine-manifest.json", manifest)
            archive = (root / "test.zip").read_bytes()
            item = {"publicDownload": True, "releaseTag": "engines-20261107.3", "fileName": "test.zip",
                    "size": len(archive), "sha256": hashlib.sha256(archive).hexdigest(),
                    "manifestSha256": hashlib.sha256(manifest).hexdigest()}
            output = root / "site"
            site.prepare({"packages": [{**item, "publicDownload": False}]}, root, output)
            self.assertFalse(output.exists())
            site.prepare({"packages": [item]}, root, output)
            target = output / "engines-20261107.3/test.zip"
            self.assertEqual(target.read_bytes(), archive)
            target.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "不同内容"):
                site.prepare({"packages": [item]}, root, output)
            self.assertEqual(target.read_bytes(), b"changed")

    def test_拒绝损坏和穿越路径(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ["../escape.zip", "test.zip"]:
                (root / "test.zip").write_bytes(b"bad")
                item = {"publicDownload": True, "releaseTag": "engines-20261107.3", "fileName": name,
                        "size": 3, "sha256": "0" * 64}
                with self.assertRaises(ValueError):
                    site.prepare({"packages": [item]}, root, root / "site")

if __name__ == "__main__":
    unittest.main()
