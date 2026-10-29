"""个人额度与管理员策略、补充额度、成本汇总。"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func, case
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.core.models import User, LLMCallLog
from app.core.settings import set_setting
from app.core.security_log import admin_action
from app.modules.auth.service import current_user, require_admin
from . import service
from .schemas import UsageSummary, UsagePolicy, AdjustmentIn, CostSummary
from .http import http_request_key

router = APIRouter(tags=["ai-usage"])


@router.get("/api/account/ai-usage", response_model=UsageSummary)
def my_usage(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.summary(db, user.username)


@router.get("/api/admin/ai-usage/policy", response_model=UsagePolicy)
def get_policy(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return service.policy(db)


@router.put("/api/admin/ai-usage/policy", response_model=UsagePolicy)
def update_policy(body: UsagePolicy, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    set_setting(db, "ai_free_monthly_units", str(body.free_monthly_units))
    set_setting(db, "ai_pro_monthly_units", str(body.pro_monthly_units))
    for action, units in body.costs.items():
        set_setting(db, f"ai_cost_{action}", str(units))
    db.commit()
    admin_action(request, admin.username, "update_ai_policy", "ai_usage", db=db)
    return service.policy(db)


@router.get("/api/admin/ai-usage/costs", response_model=CostSummary)
def costs(user_id: str = "", db: Session = Depends(get_db), _: User = Depends(require_admin)):
    # 自然月按部署 TZ 定义，与额度周期一致。
    period, _ = service._calendar()
    from zoneinfo import ZoneInfo
    import os
    try:
        zone = ZoneInfo(os.getenv("TZ", "Asia/Shanghai"))
    except Exception:
        zone = ZoneInfo("Asia/Shanghai")
    start = datetime.strptime(period, "%Y-%m").replace(tzinfo=zone).astimezone(timezone.utc).replace(tzinfo=None)
    query = select(
        func.count(LLMCallLog.id),
        func.coalesce(func.sum(case((LLMCallLog.success.is_(False), 1), else_=0)), 0),
        func.coalesce(func.sum(LLMCallLog.total_tokens), 0),
        func.coalesce(func.sum(case((LLMCallLog.cost_known.is_(True), LLMCallLog.cost_usd), else_=0.0)), 0),
        func.coalesce(func.sum(case((LLMCallLog.cost_known.is_(False), 1), else_=0)), 0),
    ).where(LLMCallLog.ts >= start)
    if user_id:
        query = query.where(LLMCallLog.user_id == user_id)
    calls, failed, tokens, cost, unknown = db.execute(query).one()
    return CostSummary(calls=calls, failed_calls=failed, total_tokens=tokens,
        estimated_cost_usd=cost, unknown_cost_calls=unknown)



@router.get("/api/admin/ai-usage/users/{username}", response_model=UsageSummary)
def user_usage(username: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    try:
        return service.summary(db, username)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e


@router.post("/api/admin/ai-usage/users/{username}/adjust", response_model=UsageSummary)
def adjust(username: str, body: AdjustmentIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if body.delta == 0 or not body.reason.strip():
        raise HTTPException(400, "额度变动不能为零，且必须填写原因")
    try:
        actual = service.adjust(db, username, body.delta, body.reason.strip(), admin.username, http_request_key(request))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    admin_action(request, admin.username, "adjust_ai_quota", f"{username}:{actual:+d} {body.reason}"[:120], db=db)
    return service.summary(db, username)


@router.post("/api/admin/ai-usage/users/{username}/recover")
def recover(username: str, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if not db.scalar(select(User.id).where(User.username == username)):
        raise HTTPException(404, "用户不存在")
    count = service.recover(db, username)
    admin_action(request, admin.username, "recover_ai_quota", f"{username}:{count}", db=db)
    return {"recovered": count}
