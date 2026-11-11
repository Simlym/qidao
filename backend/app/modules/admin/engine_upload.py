"""管理员 ZIP 上传暂存：有界流式写入，按 PC 固定清单匹配后交给共用安装器。"""
import asyncio
import hashlib
import tempfile
import time
from pathlib import Path

from fastapi import HTTPException, Request

MAX_UPLOAD = 256 * 1024 * 1024


async def receive_package(request: Request, root: Path, packages: list[dict]):
    limit = min(MAX_UPLOAD, max(p["size"] for p in packages))
    declared = request.headers.get("content-length")
    if declared:
        try:
            size = int(declared)
        except ValueError as error:
            raise HTTPException(400, "上传文件大小无效") from error
        if size <= 0 or size > limit:
            raise HTTPException(413, "文件过大，请选择适配当前服务器的棋岛 ZIP 包")
    root.mkdir(parents=True, exist_ok=True)
    temporary = tempfile.TemporaryDirectory(prefix=".upload-", dir=root)
    archive = Path(temporary.name) / "package.zip"
    digest = hashlib.sha256()
    size = 0
    deadline = time.monotonic() + 300
    source = request.stream().__aiter__()
    try:
        with archive.open("wb") as output:
            while True:
                try:
                    chunk = await asyncio.wait_for(anext(source), max(0.01, deadline - time.monotonic()))
                except StopAsyncIteration:
                    break
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, "上传文件超过大小限制，未安装该文件")
                output.write(chunk)
                digest.update(chunk)
        package = next((p for p in packages if p["size"] == size and p["sha256"] == digest.hexdigest()), None)
        if package is None:
            raise HTTPException(400, "文件未匹配当前棋种和服务器平台的固定版本，或内容已损坏。请选择对应的棋岛 ZIP 安装包。")
        return temporary, archive, package
    except asyncio.TimeoutError as error:
        temporary.cleanup()
        raise HTTPException(408, "上传超时，请重试") from error
    except BaseException:
        temporary.cleanup()
        raise
