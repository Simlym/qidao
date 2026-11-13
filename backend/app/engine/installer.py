"""管理员触发的服务端引擎安装；仅使用固定的官方发布源。"""

import hashlib
import json
import logging
import os
import platform
from pathlib import Path, PurePosixPath
import queue
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
import uuid

from .profiles import platform_info

VERSION = "Pikafish-2026-09-06"
URL = f"https://github.com/official-pikafish/Pikafish/releases/download/{VERSION}/Pikafish.2026-09-06.7z"
SIZE = 53603424
SHA256 = "41952bbfe2520faceb5902c69e6ab4845cc999841d2b49a95cc1be7867a25e5b"
_LOG = logging.getLogger(__name__)


def install_root():
    return Path(os.getenv("ENGINE_INSTALL_DIR") or Path(__file__).resolve().parents[2] / "data/engine/installed").resolve()


def package_info(variant):
    info = platform_info()
    supported = variant == "xiangqi" and info["os"] in ("linux", "windows") and info["arch"] in ("x86_64", "amd64")
    reason = "暂无此棋种或服务器平台的在线安装包，可继续配置服务器已有的引擎。"
    if supported and info["os"] == "linux":
        libc, version = platform.libc_ver()
        numbers = tuple(int(x) for x in version.split(".")[:2]) if re.fullmatch(r"\d+(?:\.\d+)+", version) else ()
        if libc != "glibc" or numbers < (2, 38):
            supported = False
            reason = "此官方 Linux 包需要 glibc 2.38 或更新版本。可使用项目的 Docker 部署，或手动配置兼容当前系统的引擎。"
    return {"supported": supported, "name": "Pikafish", "version": VERSION, "size": SIZE,
            "source_url": f"https://github.com/official-pikafish/Pikafish/releases/tag/{VERSION}",
            "reason": "" if supported else reason}


def acquire_lock():
    """与已有安装、上传和路径配置共用跨进程锁。"""
    from .installation import acquire_lock as shared_lock

    install_root().mkdir(parents=True, exist_ok=True)
    return shared_lock()


def _write_status(**value):
    path = install_root() / "installation.json"
    temporary = path.with_suffix(f".{uuid.uuid4().hex}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)
    return value


def installation_status():
    try:
        value = json.loads((install_root() / "installation.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"phase": "idle"}
    if value.get("phase") in ("downloading", "extracting", "testing", "activating"):
        try:
            handle = acquire_lock()
        except ValueError:
            return value
        try:
            value = json.loads((install_root() / "installation.json").read_text(encoding="utf-8"))
            if value.get("phase") in ("downloading", "extracting", "testing", "activating"):
                return _write_status(phase="failed", error="安装被服务重启中断，请重试。")
            return value
        finally:
            handle.close()
    return value


def _download(path):
    digest = hashlib.sha256()
    received = 0
    started = time.monotonic()
    with urllib.request.urlopen(URL, timeout=30) as response, path.open("wb") as output:
        while chunk := response.read(256 * 1024):
            received += len(chunk)
            if received > SIZE or time.monotonic() - started > 1800:
                raise ValueError("下载超出预期大小或时间，请重试")
            digest.update(chunk)
            output.write(chunk)
            _write_status(phase="downloading", received=received, total=SIZE)
    if received != SIZE or digest.hexdigest() != SHA256:
        raise ValueError("安装包完整性校验失败，请重试")


def _extract(archive, destination):
    import py7zr

    with py7zr.SevenZipFile(archive) as package:
        names = package.getnames()
        # 官方通用程序会按 CPU 能力选择实现，不要求服务器具备 AVX2/BMI2。
        suffix = ".exe" if platform_info()["os"] == "windows" else ""
        system = "Windows" if suffix else "Linux"
        binaries = [name for name in names if name == f"Pikafish-{system}-x86-64-universal{suffix}"]
        networks = [name for name in names if PurePosixPath(name).name.lower() == "pikafish.nnue"]
        if len(binaries) != 1 or len(networks) != 1:
            raise ValueError("发布包中的通用引擎或权重不唯一，无法安装")
        selected = binaries + networks + ["Copying.txt", "NNUE-License.md", "README.md"]
        if any(name not in names for name in selected):
            raise ValueError("安装包缺少许可或说明文件")
        for name in selected:
            if "\\" in name or PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts:
                raise ValueError("安装包路径不安全")
        if sum(item.uncompressed for item in package.list()) > 1024 * 1024 * 1024:
            raise ValueError("安装包解压大小异常")
        package.extract(path=destination / "unpacked", targets=selected)
    executable = destination / f"pikafish{suffix}"
    shutil.copyfile(destination / "unpacked" / binaries[0], executable)
    shutil.copyfile(destination / "unpacked" / networks[0], destination / "pikafish.nnue")
    for name in ("Copying.txt", "NNUE-License.md", "README.md"):
        shutil.copyfile(destination / "unpacked" / name, destination / name)
    shutil.rmtree(destination / "unpacked")
    executable.chmod(0o755)
    return executable


def _probe(executable):
    """真实握手及试算均受总超时约束，失败不会修改现有配置。"""
    process = subprocess.Popen([str(executable)], cwd=executable.parent, stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                               encoding="utf-8", errors="replace")
    lines = queue.Queue(maxsize=4096)

    def read():
        try:
            for line in process.stdout:
                try:
                    lines.put_nowait(line.strip())
                except queue.Full:
                    break
        finally:
            try:
                lines.put_nowait(None)
            except queue.Full:
                pass

    reader = threading.Thread(target=read, daemon=True)
    reader.start()
    deadline = time.monotonic() + 30
    try:
        for command, expected in (("uci", "uciok"),
                                  (f"setoption name Threads value 1\nsetoption name Hash value 16\nsetoption name EvalFile value {executable.parent / 'pikafish.nnue'}\nisready", "readyok"),
                                  ("position startpos\ngo depth 1", "bestmove ")):
            process.stdin.write(command + "\n")
            process.stdin.flush()
            while True:
                line = lines.get(timeout=max(0.01, deadline - time.monotonic()))
                if line is None or time.monotonic() >= deadline:
                    raise ValueError("引擎未能完成握手或试算")
                if line.startswith(expected):
                    if expected == "bestmove " and not re.match(r"bestmove [a-i][0-9][a-i][0-9](?:\s|$)", line):
                        raise ValueError("引擎未返回有效象棋着法")
                    break
    except queue.Empty:
        raise ValueError("引擎检测超时") from None
    finally:
        process.kill()
        process.wait(timeout=5)
        reader.join(timeout=2)
        process.stdin.close()
        process.stdout.close()


def _activate(path):
    from app.core import models
    from app.core.settings import KEY_XIANGQI_ENGINE_PATH, set_setting
    from .uci import reset_shared_engine

    with models.SessionLocal() as db:
        set_setting(db, KEY_XIANGQI_ENGINE_PATH, str(path))
        db.commit()
    reset_shared_engine()


def _run(handle):
    try:
        with tempfile.TemporaryDirectory(prefix="download-", dir=install_root()) as work:
            work = Path(work)
            archive = work / "engine.7z"
            _download(archive)
            _write_status(phase="extracting")
            candidate = work / "candidate"
            candidate.mkdir()
            executable = _extract(archive, candidate)
            _write_status(phase="testing")
            _probe(executable)
            # 使用新目录，任何失败都不会覆盖正在使用的引擎文件。
            target = install_root() / f"{VERSION}-{uuid.uuid4().hex}"
            candidate.rename(target)
            _write_status(phase="activating")
            _activate(target / executable.name)
            _write_status(phase="completed")
    except Exception as error:
        _LOG.exception("服务器引擎安装失败")
        detail = str(error) if isinstance(error, ValueError) else "下载或安装失败，请检查服务器网络、目录权限及运行环境后重试。"
        _write_status(phase="failed", error=detail)
    finally:
        handle.close()


def start_installation(variant):
    if not package_info(variant)["supported"]:
        raise ValueError("当前棋种或服务器平台暂无在线安装包")
    handle = acquire_lock()
    try:
        value = _write_status(phase="downloading", received=0, total=SIZE)
        threading.Thread(target=_run, args=(handle,), daemon=True).start()
        return value
    except Exception:
        handle.close()
        raise
