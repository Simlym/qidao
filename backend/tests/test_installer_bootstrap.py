"""未安装 Rust 的 Windows 后端：按需准备组件与下载完整性边界。"""

import asyncio
import hashlib
import io
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from app.engine import installation, installer_bootstrap as bootstrap


@pytest.fixture
def pinned(tmp_path, monkeypatch):
    payload = b"fixed installer fixture"
    spec = {"releaseTag": "engines-20261114.2", "fileName": "fixture.exe", "size": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest()}
    metadata = tmp_path / "metadata.json"
    metadata.write_text(json.dumps(spec), encoding="utf-8")
    monkeypatch.setattr(bootstrap, "METADATA", metadata)
    monkeypatch.setattr(bootstrap.platform, "system", lambda: "Windows")
    monkeypatch.setattr(bootstrap.platform, "machine", lambda: "AMD64")
    monkeypatch.delenv("ENGINE_INSTALLER", raising=False)
    monkeypatch.setenv("ENGINE_INSTALL_DIR", str(tmp_path / "managed"))
    return spec, payload


def test_status_can_offer_windows_jieqi_without_downloading(pinned, tmp_path, monkeypatch):
    import cpuinfo
    catalog = tmp_path / "catalog.json"
    packages = [{"id": "windows", "variant": "jieqi", "requiresFeatures": ["sse4.1", "popcnt"]},
                {"id": "linux", "variant": "jieqi", "os": "linux", "requiresFeatures": []}]
    catalog.write_text(json.dumps({"packages": packages}), encoding="utf-8")
    monkeypatch.setattr(bootstrap, "CATALOG", catalog)
    monkeypatch.setattr(cpuinfo, "get_cpu_info", lambda: {"flags": ["sse4_1", "popcnt"]})
    monkeypatch.setattr(bootstrap.urllib.request, "urlopen", lambda *a, **k: pytest.fail("读取状态不应下载"))
    info = bootstrap.catalog_info("jieqi")
    assert info["installer_available"] and info["installer_bootstrap"]
    assert [p["id"] for p in info["packages"]] == ["windows"]
    monkeypatch.setattr(cpuinfo, "get_cpu_info", lambda: {"flags": []})
    assert bootstrap.catalog_info("jieqi")["packages"] == []


def test_verified_component_is_cached_without_repeat_download(pinned, monkeypatch):
    spec, payload = pinned
    calls = []
    def download(*args, **kwargs):
        calls.append(args[0])
        return io.BytesIO(payload)
    monkeypatch.setattr(bootstrap.urllib.request, "urlopen", download)
    path = bootstrap.ensure_installer()
    assert bootstrap._target(spec).read_bytes() == payload
    assert bootstrap.cached_path() == path
    assert bootstrap.ensure_installer() == path
    assert len(calls) == 1


@pytest.mark.parametrize("payload", [b"wrong", b"x" * 100])
def test_invalid_download_never_replaces_previous_component(pinned, monkeypatch, payload):
    spec, _ = pinned
    target = bootstrap._target(spec)
    target.parent.mkdir(parents=True)
    target.write_bytes(b"previous")
    monkeypatch.setattr(bootstrap.urllib.request, "urlopen", lambda *a, **k: io.BytesIO(payload))
    with pytest.raises(ValueError):
        bootstrap.ensure_installer()
    assert target.read_bytes() == b"previous"
    assert not list(target.parent.glob(".prepare-*"))
    assert bootstrap.cached_path() is None


def test_explicit_installer_configuration_is_not_replaced(pinned, monkeypatch):
    monkeypatch.setenv("ENGINE_INSTALLER", "/custom/installer")
    assert bootstrap.package() is None
    assert bootstrap.catalog_info("jieqi") is None
    with pytest.raises(ValueError, match="ENGINE_INSTALLER"):
        bootstrap.ensure_installer()


def test_failed_bootstrap_never_starts_engine_process(pinned, monkeypatch):
    monkeypatch.setattr(installation, "installer_path", lambda: "missing-installer")
    monkeypatch.setattr(installation.shutil, "which", lambda name: None)
    def reject():
        raise ValueError("校验失败")
    monkeypatch.setattr(bootstrap, "ensure_installer", reject)
    async def unexpected(*args, **kwargs):
        pytest.fail("校验失败不应启动进程")
    monkeypatch.setattr(installation.asyncio, "create_subprocess_exec", unexpected)
    async def collect():
        events = installation.events("jieqi", "download", "fixed")
        assert (await anext(events))["data"]["phase"] == "preparing"
        with pytest.raises(ValueError, match="校验失败"):
            await anext(events)
    asyncio.run(collect())
