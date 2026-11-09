"""通过 PC 共用的 Rust 安装器管理服务器原生引擎，不接受任意下载地址。"""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import time
import anyio


def installer_path() -> str:
    return os.getenv("ENGINE_INSTALLER", "qidao-engine-installer")


def install_root(variant: str) -> Path:
    return Path(os.getenv("ENGINE_INSTALL_DIR", "data/engines")).resolve() / variant


def acquire_lock():
    """操作系统锁跨进程互斥，进程退出后自动释放。"""
    root = install_root("xiangqi").parent
    root.mkdir(parents=True, exist_ok=True)
    stream = (root / ".installation.lock").open("a+b")
    try:
        if os.name == "nt":
            import msvcrt
            if stream.tell() == 0:
                stream.write(b"0")
                stream.flush()
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        stream.close()
        raise ValueError("已有服务器引擎操作正在进行，请稍后重试")
    return stream


def install_info(variant: str) -> dict:
    try:
        result = subprocess.run(
            [installer_path(), "info", variant, str(install_root(variant))],
            capture_output=True, text=True, encoding="utf-8", timeout=15,
        )
        if result.returncode:
            raise ValueError("无法读取服务器引擎发行清单")
        info = json.loads(result.stdout)
        info["installer_available"] = True
        return info
    except (OSError, subprocess.TimeoutExpired):
        return {"packages": [], "installed": [], "installer_available": False,
                "message": "服务器尚未部署共用引擎安装器，请更新后端部署；已有路径配置仍可使用。"}


async def events(variant: str, action: str, value: str, archive: str = ""):
    """流式传回进度；取消连接时先请求安装器清理，再终止超时进程。"""
    process = await asyncio.create_subprocess_exec(
        installer_path(), action, variant, str(install_root(variant)), value,
        *([archive] if archive else []), stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        deadline = time.monotonic() + 360
        while line := await asyncio.wait_for(process.stdout.readline(), max(0.01, deadline - time.monotonic())):
            event = json.loads(line)
            yield event
        code = await asyncio.wait_for(process.wait(), max(0.01, deadline - time.monotonic()))
        if code:
            raise ValueError("引擎操作失败，原配置已保留")
    finally:
        # StreamingResponse 的取消域已被取消，清理必须屏蔽该取消。
        with anyio.CancelScope(shield=True):
            if process.returncode is None:
                try:
                    process.stdin.write(b"cancel\n")
                    await process.stdin.drain()
                except (BrokenPipeError, ConnectionResetError):
                    pass
                try:
                    await asyncio.wait_for(process.wait(), 5)
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()
            if process.stdin:
                process.stdin.close()
