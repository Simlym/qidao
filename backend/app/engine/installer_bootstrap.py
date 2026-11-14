"""Windows 源码部署按固定校验值准备预编译组件；读取页面时不下载或执行。"""

import hashlib
import json
import os
from pathlib import Path
import platform
import tempfile
import time
import urllib.request

METADATA = Path(__file__).with_name("server-installer.json")
CATALOG = Path(__file__).resolve().parents[3] / "docs/engines/native-packages.json"


def package():
    if os.getenv("ENGINE_INSTALLER", "").strip() or platform.system() != "Windows" or platform.machine().lower() not in ("amd64", "x86_64"):
        return None
    try:
        return json.loads(METADATA.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _target(spec):
    from .installation import install_root

    return install_root("xiangqi").parent / ".installer" / spec["sha256"][:16] / "qidao-engine-installer.exe"


def _verified(path, spec):
    try:
        if path.stat().st_size != spec["size"]:
            return False
        with path.open("rb") as source:
            digest = hashlib.sha256()
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
        return digest.hexdigest() == spec["sha256"]
    except OSError:
        return False


def cached_path():
    spec = package()
    if not spec:
        return None
    target = _target(spec)
    return str(target) if _verified(target, spec) else None


def catalog_info(variant):
    if not package() or variant not in ("xiangqi", "jieqi"):
        return None
    try:
        from cpuinfo import get_cpu_info

        flags = {flag.replace("_", ".") for flag in get_cpu_info().get("flags", [])}
        packages = json.loads(CATALOG.read_text(encoding="utf-8"))["packages"]
        packages = [p for p in packages if p["variant"] == variant and p.get("os", "windows") == "windows"
                    and p.get("arch", "x86_64") == "x86_64" and set(p["requiresFeatures"]) <= flags]
        return {"packages": packages, "installed": [], "installer_available": True,
                "installer_bootstrap": True, "message": "首次操作会自动准备服务器安装组件。"}
    except (OSError, ValueError):
        return None


def ensure_installer():
    spec = package()
    if not spec:
        raise ValueError("服务器安装组件未就绪，请更新部署或检查 ENGINE_INSTALLER 配置。")
    target = _target(spec)
    if _verified(target, spec):
        return str(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://github.com/Simlym/qidao/releases/download/{spec['releaseTag']}/{spec['fileName']}"
    # 同目录暂存，全部校验后再原子替换；失败不会执行下载文件。
    with tempfile.TemporaryDirectory(prefix=".prepare-", dir=target.parent) as temporary:
        candidate = Path(temporary) / target.name
        started = time.monotonic()
        received = 0
        try:
            with urllib.request.urlopen(url, timeout=30) as response, candidate.open("wb") as output:
                while chunk := response.read(256 * 1024):
                    received += len(chunk)
                    if received > spec["size"] or time.monotonic() - started > 180:
                        raise ValueError("服务器安装组件下载超出预期大小或时间，请重试。")
                    output.write(chunk)
        except OSError as error:
            raise ValueError("服务器安装组件下载失败，请检查服务器访问 GitHub 的网络后重试。") from error
        if not _verified(candidate, spec):
            raise ValueError("服务器安装组件校验失败，未执行下载文件，请重试。")
        candidate.replace(target)
    return str(target)
