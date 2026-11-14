"""管理后台：通过 PC 共用安装器安装与管理服务器象棋、揭棋引擎。"""

import os
import asyncio
import json
import logging
import time
import uuid
from contextlib import aclosing

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from fastapi.responses import StreamingResponse
from app.engine import installation, installer
from .engine_upload import receive_package

from app.core.dependencies import get_db
from app.core.models import User
from app.core.security_log import admin_action
from app.core.settings import KEY_JIEQI_ENGINE_PATH, KEY_XIANGQI_ENGINE_PATH, set_setting
from app.engine.jieqi import reset_shared_jieqi_engine
from app.engine.uci import reset_shared_engine
from app.engine.profiles import profile_status
from app.modules.auth.service import require_admin
from .schemas import EnginePathUpdate, EngineInstallRequest, EngineInstallationStatus, ServerEngineStatus

router = APIRouter(
    prefix="/api/admin/engine", tags=["admin"], dependencies=[Depends(require_admin)]
)

_KEYS = {"xiangqi": KEY_XIANGQI_ENGINE_PATH, "jieqi": KEY_JIEQI_ENGINE_PATH}
logger = logging.getLogger("xiangqidao.engine.installation")


@router.get("")
def get_status():
    """返回平台信息和双棋种配置；不访问第三方下载服务。"""
    return {
        "distribution": "managed",
        "xiangqi": profile_status("xiangqi"),
        "jieqi": profile_status("jieqi"),
    }


@router.get("/{variant}", response_model=ServerEngineStatus)
def get_variant_status(variant: str):
    if variant not in _KEYS:
        raise HTTPException(404, "不支持的棋种")
    return {**profile_status(variant), "online_package": installer.package_info(variant),
            "installation": installer.installation_status() if variant == "xiangqi" else {"phase": "idle"}}


@router.post("/{variant}/install", status_code=202, response_model=EngineInstallationStatus)
def install_engine(variant: str, request: Request, db: Session = Depends(get_db),
                   admin: User = Depends(require_admin)):
    if variant not in _KEYS:
        raise HTTPException(404, "不支持的棋种")
    try:
        status = installer.start_installation(variant)
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    except OSError as error:
        raise HTTPException(400, "服务器安装目录不可写，请检查权限") from error
    admin_action(request, admin.username, "install_server_engine", variant, db=db)
    return status


@router.get("/{variant}/installation")
def get_installation(variant: str):
    if variant not in _KEYS:
        raise HTTPException(404, "不支持的棋种")
    return {**installation.install_info(variant), "status": profile_status(variant)}


@router.post("/{variant}/installation")
def manage_installation(
    variant: str, body: EngineInstallRequest, request: Request,
    admin: User = Depends(require_admin), db: Session = Depends(get_db),
):
    if variant not in _KEYS:
        raise HTTPException(404, "不支持的棋种")
    if body.action in {"probe", "import"} and (not os.path.isabs(body.path) or not os.path.isfile(body.path)):
        raise HTTPException(400, "请填写服务器上已存在文件的绝对路径")
    try:
        guard = installation.acquire_lock()
    except ValueError as error:
        raise HTTPException(409, str(error)) from error

    return installation_response(variant, body.action, body.path if body.action == "probe" else body.package_id,
                                 body.path if body.action == "import" else "", request, admin, db, guard)


@router.post("/{variant}/upload")
async def upload_installation(
    variant: str, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db),
):
    """接收电脑选择的 ZIP 文件，按固定清单自动匹配棋种和服务器平台。"""
    if variant not in _KEYS:
        raise HTTPException(404, "不支持的棋种")
    info = await asyncio.to_thread(installation.install_info, variant)
    if not info["installer_available"] or not info["packages"]:
        raise HTTPException(409, "当前服务器暂无适配的引擎安装包，暂不能上传导入")
    try:
        guard = installation.acquire_lock()
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    try:
        temporary, archive, package = await receive_package(request, installation.install_root(variant), info["packages"])
    except BaseException:
        guard.close()
        raise
    return installation_response(variant, "import", package["id"], str(archive), request, admin, db, guard, temporary)


def installation_response(variant, action, value, archive, request, admin, db, guard, temporary=None):
    operation_id = uuid.uuid4().hex[:12]
    started = time.monotonic()
    logger.info("安装操作开始 编号=%s 棋种=%s 操作=%s 目标=%s 管理员=%s", operation_id, variant, action, value, admin.username)

    async def stream():
        def encode(event):
            return json.dumps(event, ensure_ascii=False) + "\n"

        result = None
        phase = None
        try:
            async with aclosing(installation.events(
                variant, action, value, archive,
            )) as source:
                async for event in source:
                    if event["type"] == "error":
                        logger.error("安装器报告失败 编号=%s 错误=%s", operation_id, event.get("data", {}).get("message"))
                        yield encode(event)
                        return
                    if event["type"] == "result":
                        result = event["data"]
                    else:
                        next_phase = event.get("data", {}).get("phase")
                        if next_phase and next_phase != phase:
                            phase = next_phase
                            logger.info("安装阶段变化 编号=%s 阶段=%s 耗时=%.2f秒", operation_id, phase, time.monotonic() - started)
                        yield encode(event)
            if not result:
                raise ValueError("安装器未返回检测结果")
            if await request.is_disconnected():
                logger.warning("客户端已断开，未切换配置 编号=%s 耗时=%.2f秒", operation_id, time.monotonic() - started)
                return
            # 安装和试算全部成功后才切换配置，失败时原路径保持不变。
            set_setting(db, _KEYS[variant], result["enginePath"])
            db.commit()
            reset = reset_shared_jieqi_engine if variant == "jieqi" else reset_shared_engine
            await asyncio.to_thread(reset)
            admin_action(request, admin.username, "install_server_engine", f"{variant}:{action}", db=db)
            logger.info("安装并启用成功 编号=%s 路径=%s 耗时=%.2f秒", operation_id, result["enginePath"], time.monotonic() - started)
            yield encode({"type": "complete", "data": profile_status(variant)})
        except asyncio.CancelledError:
            logger.warning("客户端取消安装 编号=%s 阶段=%s 耗时=%.2f秒", operation_id, phase or "启动", time.monotonic() - started)
            raise
        except Exception as error:
            logger.exception("安装操作异常 编号=%s 阶段=%s 耗时=%.2f秒", operation_id, phase or "启动", time.monotonic() - started)
            detail = str(error) or type(error).__name__
            yield encode({"type": "error", "data": {"message": f"{detail}（操作编号：{operation_id}，可在后台日志查看原因）"}})
        finally:
            guard.close()
            if temporary is not None:
                temporary.cleanup()
            logger.info("安装操作结束 编号=%s 耗时=%.2f秒", operation_id, time.monotonic() - started)

    return StreamingResponse(stream(), media_type="application/x-ndjson", headers={"X-Accel-Buffering": "no", "Cache-Control": "no-store", "X-Engine-Operation-ID": operation_id})


@router.put("/{variant}")
def update_engine(
    variant: str,
    body: EnginePathUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """保存服务器上由管理员自行放置的引擎绝对路径。"""
    if variant not in _KEYS:
        raise HTTPException(404, "不支持的棋种")
    path = body.path.strip()
    if path:
        if not os.path.isabs(path):
            raise HTTPException(400, "请填写服务器上的绝对路径")
        path = os.path.abspath(path)
        if not os.path.isfile(path):
            raise HTTPException(400, "服务器上找不到该引擎文件")
    try:
        guard = installation.acquire_lock()
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    with guard:
        set_setting(db, _KEYS[variant], path)
        db.commit()
        if variant == "jieqi":
            reset_shared_jieqi_engine()
        else:
            reset_shared_engine()
    action = f"{variant}:configured" if path else f"{variant}:cleared"
    admin_action(request, admin.username, "update_user_engine", action, db=db)
    return profile_status(variant)
