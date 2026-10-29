"""短事务预留与幂等结算；网络调用期间不持有数据库写锁。"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.models import AIQuotaAccount, AIQuotaMonth, AIOperation, AIQuotaAdjustment, User
from app.core.settings import get_setting
from app.modules.auth.entitlements import membership_active
from .context import current_operation

logger = logging.getLogger(__name__)
DEFAULT_COSTS = {"coach_plan": 20, "game_report": 10, "mistake_explain": 2, "puzzle_explain": 8, "play_coach": 4}
DEFAULT_FREE_MONTHLY = 20
DEFAULT_PRO_MONTHLY = 600
RESERVATION_TTL = timedelta(minutes=15)


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _calendar(now=None):
    try:
        zone = ZoneInfo(os.getenv("TZ", "Asia/Shanghai"))
    except Exception:
        zone = ZoneInfo("Asia/Shanghai")
    current = (now or _now()).replace(tzinfo=timezone.utc).astimezone(zone)
    reset = current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    reset = reset.replace(year=reset.year + 1, month=1) if reset.month == 12 else reset.replace(month=reset.month + 1)
    return current.strftime("%Y-%m"), reset.isoformat()


def _value(db, key, default, minimum=0):
    raw = get_setting(db, key, os.getenv(key.upper(), str(default)))
    try:
        value = int(raw)
        return value if minimum <= value <= 1_000_000 else default
    except (ValueError, TypeError):
        return default


def policy(db):
    return {
        "free_monthly_units": _value(db, "ai_free_monthly_units", DEFAULT_FREE_MONTHLY),
        "pro_monthly_units": _value(db, "ai_pro_monthly_units", DEFAULT_PRO_MONTHLY),
        "costs": {action: _value(db, f"ai_cost_{action}", units, 1) for action, units in DEFAULT_COSTS.items()},
    }


def request_key(value=None):
    if value is None:
        return str(uuid4())
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", value):
        raise ValueError("请求标识必须是 1–80 位字母、数字或 _ . : -")
    return value


def _insert_once(db, model, values, columns):
    dialect = db.get_bind().dialect.name
    if dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    elif dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        raise RuntimeError("AI 额度账本目前支持 SQLite 与 PostgreSQL")
    db.execute(insert(model).values(**values).on_conflict_do_nothing(index_elements=columns))


def _lock_account(db, user_id):
    _insert_once(db, AIQuotaAccount, {"user_id": user_id, "extra_balance": 0, "revision": 0}, ["user_id"])
    # PostgreSQL 持有该行写锁；SQLite 持有数据库写锁。所有额度写入都先走这里。
    db.execute(update(AIQuotaAccount).where(AIQuotaAccount.user_id == user_id)
               .values(revision=AIQuotaAccount.revision + 1))
    return db.get(AIQuotaAccount, user_id, populate_existing=True)


def _refund(db, account, operation, code):
    if operation.status != "reserved":
        return False
    month = db.get(AIQuotaMonth, (operation.user_id, operation.period))
    month.used_units -= operation.monthly_units
    account.extra_balance += operation.extra_units
    operation.status = "refunded"
    operation.error_code = code
    operation.finished_at = _now()
    return True


def _recover(db, account):
    pending = db.scalars(select(AIOperation).where(
        AIOperation.user_id == account.user_id, AIOperation.status == "reserved",
        AIOperation.created_at < _now() - RESERVATION_TTL,
    )).all()
    for operation in pending:
        _refund(db, account, operation, "reservation_expired")
    return len(pending)


@dataclass
class Reservation:
    status: str
    operation_id: str = ""
    text: str = ""


def reserve(source_db, user_id, action, ref="", key=None):
    if action not in DEFAULT_COSTS:
        raise ValueError("未知的 AI 动作")
    key = request_key(key)
    if len(ref) > 80:
        raise ValueError("AI 关联标识过长")
    # 独立短事务，与业务缓存、题目及棋谱事务分离。
    with Session(bind=source_db.get_bind(), expire_on_commit=False) as db, db.begin():
        user = db.scalar(select(User).where(User.username == user_id))
        if not user or user_id == "default" or user_id.startswith("guest:"):
            return Reservation("login_required")
        account = _lock_account(db, user_id)
        # 等待锁期间账号可能已被删除；不能向同名新账号遗留孤立额度。
        user = db.scalar(select(User).where(User.username == user_id).execution_options(populate_existing=True))
        if user is None:
            db.delete(account)
            return Reservation("login_required")
        _recover(db, account)
        existing = db.scalar(select(AIOperation).where(AIOperation.user_id == user_id, AIOperation.request_key == key))
        if existing:
            if existing.action != action or existing.ref != ref:
                return Reservation("conflict", existing.id)
            return Reservation("cached" if existing.status == "succeeded" else "pending" if existing.status == "reserved" else existing.status, existing.id, existing.result_text)
        config = policy(db)
        limit = config["pro_monthly_units" if membership_active(user) else "free_monthly_units"]
        period, _ = _calendar()
        _insert_once(db, AIQuotaMonth, {"user_id": user_id, "period": period, "used_units": 0}, ["user_id", "period"])
        month = db.get(AIQuotaMonth, (user_id, period))
        units = config["costs"][action]
        monthly = min(units, max(limit - month.used_units, 0))
        extra = units - monthly
        if extra > account.extra_balance:
            return Reservation("insufficient")
        month.used_units += monthly
        account.extra_balance -= extra
        operation = AIOperation(
            id=str(uuid4()), user_id=user_id, request_key=key, action=action, ref=ref,
            period=period, units=units, monthly_units=monthly, extra_units=extra,
            status="reserved", created_at=_now(), result_text="", error_code="",
        )
        db.add(operation)
        return Reservation("reserved", operation.id)


def settle(source_db, operation_id, text="", error_code="generation_failed"):
    with Session(bind=source_db.get_bind()) as db, db.begin():
        operation = db.get(AIOperation, operation_id)
        if not operation:
            return False
        account = _lock_account(db, operation.user_id)
        db.refresh(operation)
        if operation.status != "reserved":
            return False
        if text:
            operation.status = "succeeded"
            operation.result_text = text
            operation.finished_at = _now()
            return True
        return _refund(db, account, operation, error_code)


def generate(db, user_id, action, ref, producer, key=None):
    reservation = reserve(db, user_id, action, ref, key)
    if reservation.status != "reserved":
        return reservation
    token = current_operation.set((reservation.operation_id, db.get_bind()))
    text = ""
    try:
        text = producer() or ""
        if not isinstance(text, str):
            text = ""
        text = text.strip()
    except Exception:
        logger.exception("AI 生成失败，退回预留额度，operation=%s", reservation.operation_id)
    finally:
        current_operation.reset(token)
    committed = settle(db, reservation.operation_id, text)
    return Reservation("succeeded" if text and committed else "refunded", reservation.operation_id, text if committed else "")


def summary(source_db, user_id, history_limit=20):
    with Session(bind=source_db.get_bind()) as db:
        user = db.scalar(select(User).where(User.username == user_id))
        if not user:
            raise ValueError("用户不存在")
        config = policy(db)
        active = membership_active(user)
        period, reset = _calendar()
        limit = config["pro_monthly_units" if active else "free_monthly_units"]
        month = db.get(AIQuotaMonth, (user_id, period))
        used = month.used_units if month else 0
        account = db.get(AIQuotaAccount, user_id)
        extra = account.extra_balance if account else 0
        operations = db.scalars(select(AIOperation).where(AIOperation.user_id == user_id)
            .order_by(AIOperation.created_at.desc()).limit(history_limit)).all()
        adjustments = db.scalars(select(AIQuotaAdjustment).where(AIQuotaAdjustment.user_id == user_id)
            .order_by(AIQuotaAdjustment.created_at.desc()).limit(10)).all()
        return {
            "plan": "pro" if active else "free", "period": period, "resets_at": reset,
            "expires_at": user.membership_expires_at, "monthly_limit": limit, "monthly_used": used,
            "monthly_remaining": max(limit - used, 0), "extra_balance": extra,
            "available_units": max(limit - used, 0) + extra, "costs": config["costs"],
            "operations": [{"id": row.id, "action": row.action, "ref": row.ref, "units": row.units,
                "status": row.status, "created_at": row.created_at, "error_code": row.error_code} for row in operations],
            "adjustments": [{"delta": row.actual_delta, "reason": row.reason, "created_at": row.created_at} for row in adjustments],
        }


def adjust(source_db, user_id, delta, reason, actor, key=None):
    key = request_key(key)
    with Session(bind=source_db.get_bind()) as db, db.begin():
        if not db.scalar(select(User.id).where(User.username == user_id)):
            raise ValueError("用户不存在")
        account = _lock_account(db, user_id)
        if not db.scalar(select(User.id).where(User.username == user_id)):
            raise ValueError("用户不存在")
        existing = db.scalar(select(AIQuotaAdjustment).where(AIQuotaAdjustment.user_id == user_id, AIQuotaAdjustment.request_key == key))
        if existing:
            if existing.requested_delta != delta or existing.reason != reason or existing.actor != actor:
                raise ValueError("同一请求标识已用于其他调整")
            return existing.actual_delta
        actual = max(delta, -account.extra_balance)
        account.extra_balance += actual
        db.add(AIQuotaAdjustment(id=str(uuid4()), user_id=user_id, request_key=key,
            requested_delta=delta, actual_delta=actual, reason=reason, actor=actor, created_at=_now()))
        return actual


def recover(source_db, user_id):
    with Session(bind=source_db.get_bind()) as db, db.begin():
        account = _lock_account(db, user_id)
        if not db.scalar(select(User.id).where(User.username == user_id)):
            db.delete(account)
            return 0
        return _recover(db, account)


def lock_account_for_deletion(db, user_id):
    """调用者持有此锁直到账号与关联数据一并提交删除。"""
    return _lock_account(db, user_id)
