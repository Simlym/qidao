"""服务器在线安装的完整性、生命周期和失败隔离。"""

import hashlib
import io
from pathlib import Path
import subprocess
import sys

import pytest

from app.engine import installer


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setenv("ENGINE_INSTALL_DIR", str(tmp_path / "managed"))
    return installer.install_root()


def test_platform_and_variant_selection(monkeypatch):
    monkeypatch.setattr(installer.platform, "libc_ver", lambda: ("glibc", "2.41"))
    monkeypatch.setattr(installer, "platform_info", lambda: {"os": "linux", "arch": "x86_64"})
    assert installer.package_info("xiangqi")["supported"]
    assert not installer.package_info("jieqi")["supported"]
    monkeypatch.setattr(installer, "platform_info", lambda: {"os": "linux", "arch": "aarch64"})
    assert not installer.package_info("xiangqi")["supported"]


@pytest.mark.parametrize("libc,version", [("musl", "1.2"), ("glibc", "2.35"), ("", "")])
def test_incompatible_linux_libc_is_explained(monkeypatch, libc, version):
    monkeypatch.setattr(installer, "platform_info", lambda: {"os": "linux", "arch": "x86_64"})
    monkeypatch.setattr(installer.platform, "libc_ver", lambda: (libc, version))
    result = installer.package_info("xiangqi")
    assert not result["supported"]
    assert "glibc 2.38" in result["reason"]


def test_download_requires_size_and_digest(root, monkeypatch):
    root.mkdir()
    data = b"official fixture"
    monkeypatch.setattr(installer, "SIZE", len(data))
    monkeypatch.setattr(installer, "SHA256", hashlib.sha256(data).hexdigest())
    monkeypatch.setattr(installer.urllib.request, "urlopen", lambda *a, **k: io.BytesIO(data))
    installer._download(root / "ok.7z")
    monkeypatch.setattr(installer.urllib.request, "urlopen", lambda *a, **k: io.BytesIO(b"modified"))
    with pytest.raises(ValueError, match="校验失败"):
        installer._download(root / "bad.7z")
    monkeypatch.setattr(installer.urllib.request, "urlopen", lambda *a, **k: io.BytesIO(data + b"extra"))
    with pytest.raises(ValueError, match="超出"):
        installer._download(root / "oversized.7z")


def test_lock_and_interrupted_installation(root):
    handle = installer.acquire_lock()
    try:
        installer._write_status(phase="testing")
        with pytest.raises(ValueError, match="操作正在进行"):
            installer.acquire_lock()
        assert installer.installation_status()["phase"] == "testing"
    finally:
        handle.close()
    assert installer.installation_status()["phase"] == "failed"


@pytest.mark.parametrize("fails", [True, False])
def test_activate_only_after_probe(root, monkeypatch, fails):
    activated = []
    monkeypatch.setattr(installer, "_download", lambda path: path.write_bytes(b"fixture"))

    def extract(archive, candidate):
        path = candidate / "engine"
        path.write_bytes(b"fixture")
        return path

    def probe(path):
        assert path.is_file()
        assert not activated
        if fails:
            raise ValueError("试算失败")

    monkeypatch.setattr(installer, "_extract", extract)
    monkeypatch.setattr(installer, "_probe", probe)
    monkeypatch.setattr(installer, "_activate", lambda path: activated.append(path))
    installer._run(installer.acquire_lock())
    status = installer.installation_status()
    assert status["phase"] == ("failed" if fails else "completed")
    if fails:
        assert not activated
    else:
        assert len(activated) == 1
        assert activated[0].is_file()
    assert not list(root.glob("download-*"))


def test_extract_only_matching_platform_and_preserve_licenses(root, monkeypatch):
    import py7zr

    root.mkdir()
    monkeypatch.setattr(installer, "platform_info", lambda: {"os": "linux", "arch": "x86_64"})
    archive = root / "fixture.7z"
    with py7zr.SevenZipFile(archive, "w") as package:
        for name in ("Pikafish-Linux-x86-64-universal", "Pikafish-Windows-x86-64-universal.exe",
                     "pikafish.nnue", "Copying.txt", "NNUE-License.md", "README.md"):
            package.writestr(name.encode(), name)
    destination = root / "out"
    path = installer._extract(archive, destination)
    assert path.read_bytes() == b"Pikafish-Linux-x86-64-universal"
    assert (destination / "pikafish.nnue").is_file()
    assert (destination / "Copying.txt").is_file()
    assert not list(destination.rglob("*.exe"))
    assert not (destination / "unpacked").exists()


@pytest.mark.parametrize("move,valid", [("a0a1", True), ("0000", False)])
def test_probe_waits_for_search_and_rejects_invalid_move(tmp_path, monkeypatch, move, valid):
    script = tmp_path / "protocol.py"
    script.write_text(f'''import sys
for line in sys.stdin:
    command = line.strip()
    if command == "uci": print("uciok", flush=True)
    elif command == "isready": print("readyok", flush=True)
    elif command == "go depth 1": print("bestmove {move}", flush=True)
''', encoding="utf-8")
    launch = subprocess.Popen
    monkeypatch.setattr(installer.subprocess, "Popen", lambda args, **kwargs: launch([sys.executable, str(script)], **kwargs))
    if valid:
        installer._probe(tmp_path / "engine")
    else:
        with pytest.raises(ValueError, match="有效象棋着法"):
            installer._probe(tmp_path / "engine")
