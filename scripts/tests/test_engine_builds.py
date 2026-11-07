"""源码构建工具的下载完整性、权重选择及发布边界回归。"""

import hashlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SCRIPT = Path(__file__).resolve().parents[1] / "build_engines.py"
SPEC = importlib.util.spec_from_file_location("build_engines", SCRIPT)
build = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build)


class EngineBuildTests(unittest.TestCase):
    def test_缓存文件仍需校验(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "net.zip"
            target.write_bytes(b"tampered")
            with patch.object(build.urllib.request, "build_opener") as opener:
                opener.return_value.open.side_effect = OSError("禁止测试访问网络")
                with self.assertRaises(OSError):
                    build.download("https://example.invalid/net.zip", target, hashlib.sha256(b"correct").hexdigest())
                opener.return_value.open.assert_called_once()

    def test_校验通过的缓存不重复下载(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "net.zip"
            target.write_bytes(b"correct")
            with patch.object(build.urllib.request, "build_opener") as opener:
                build.download("https://example.invalid/net.zip", target, build.sha256(target))
                opener.assert_not_called()

    def test_缺少固定哈希时禁止下载(self):
        with patch.object(build.urllib.request, "build_opener") as opener:
            with self.assertRaises(ValueError):
                build.download("https://example.invalid/net.zip", Path("unused"), None)
            opener.assert_not_called()

    def test_下载内容哈希不符时保留原文件(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "net.zip"
            target.write_bytes(b"previous")
            with patch.object(build.urllib.request, "build_opener") as opener:
                opener.return_value.open.return_value = io.BytesIO(b"wrong-download")
                with self.assertRaises(ValueError):
                    build.download("https://example.invalid/net.zip", target, hashlib.sha256(b"expected").hexdigest())
            self.assertEqual(target.read_bytes(), b"previous")

    def test_仅提取权重不使用官方预编译程序(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "upstream.zip"
            payload = b"network" * 1000
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr("release/pikafish.nnue", payload)
                package.writestr("release/pikafish.exe", b"not-used")
            build.extract_network(archive, root / "pikafish.nnue")
            self.assertEqual((root / "pikafish.nnue").read_bytes(), payload)
            self.assertFalse((root / "release").exists())

    def test_多个权重时拒绝猜测(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "upstream.zip"
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr("a/pikafish.nnue", b"a" * 2000)
                package.writestr("b/pikafish.nnue", b"b" * 2000)
            with self.assertRaises(ValueError):
                build.extract_network(archive, root / "pikafish.nnue")
            self.assertFalse((root / "pikafish.nnue").exists())

    def test_待审核版本不能进入发布流程(self):
        result = subprocess.run([sys.executable, str(SCRIPT), "--engine", "xiangqi", "--output", "unused",
                                 "--check-distribution", "--preflight"], capture_output=True,
                                env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("尚未核准".encode(), result.stderr)

    def test_拒绝非法发行标签(self):
        result = subprocess.run([sys.executable, str(SCRIPT), "--output", "unused", "--release-tag", "latest",
                                 "--preflight"], capture_output=True,
                                env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("标签必须".encode(), result.stderr)


if __name__ == "__main__":
    unittest.main()
