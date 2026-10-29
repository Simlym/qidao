"""ai_usage 领域的 SQLAlchemy 表定义（共享 app.core.database.Base）。"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    false,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class LLMCallLog(Base):
    """LLM 调用流水（append-only）：审计每一次大模型调用的 token 与费用。

    LLM 是按量计费的额外开销，必须可逐笔追溯：何时、什么事项、谁触发、用了哪个模型、
    各类 token 用量、折算费用（USD）、耗时与成败。供后台「LLM 用量」页查询与按月对账。
    """

    __tablename__ = "llm_call_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    feature: Mapped[str] = mapped_column(String(40), index=True)   # explain_mistake / coach_move / ...
    user_id: Mapped[str] = mapped_column(String(40), default="", index=True)  # 触发者，空串=系统/未知
    model: Mapped[str] = mapped_column(String(40), default="")
    # token 用量：prompt 再细分缓存命中/未命中（部分服务对缓存 token 单独计价）
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cached_tokens: Mapped[int] = mapped_column(Integer, default=0)   # prompt 中命中缓存的部分
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    reasoning_tokens: Mapped[int] = mapped_column(Integer, default=0)  # thinking 思考 token（计入 completion）
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)      # 按内置价格表折算的美元费用
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)    # 端到端耗时（毫秒）
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    error: Mapped[str] = mapped_column(String(200), default="")     # 失败原因（成功为空）
    ref: Mapped[str] = mapped_column(String(80), default="")        # 关联对象，如 game:45 / puzzle:123

    operation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    cost_known: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())


class AIQuotaAccount(Base):
    """补充额度与每用户的数据库写锁；不与训练积分兑换。"""
    __tablename__ = "ai_quota_accounts"
    __table_args__ = (CheckConstraint("extra_balance >= 0", name="ck_ai_extra_nonnegative"),)
    user_id: Mapped[str] = mapped_column(String(40), ForeignKey("users.username", ondelete="CASCADE"), primary_key=True)
    extra_balance: Mapped[int] = mapped_column(Integer, default=0)
    revision: Mapped[int] = mapped_column(Integer, default=0)


class AIQuotaMonth(Base):
    """自然月使用量包含处理中预留；退款总是冲回原月份。"""
    __tablename__ = "ai_quota_months"
    __table_args__ = (CheckConstraint("used_units >= 0", name="ck_ai_month_nonnegative"),)
    user_id: Mapped[str] = mapped_column(String(40), ForeignKey("users.username", ondelete="CASCADE"), primary_key=True)
    period: Mapped[str] = mapped_column(String(7), primary_key=True)
    used_units: Mapped[int] = mapped_column(Integer, default=0)


class AIOperation(Base):
    """AI 请求预留/成功/退款流水；保存原单价及分摊，幂等结算。"""
    __tablename__ = "ai_operations"
    __table_args__ = (UniqueConstraint("user_id", "request_key", name="uq_ai_operation_request"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(40), ForeignKey("users.username", ondelete="CASCADE"), index=True)
    request_key: Mapped[str] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(40))
    ref: Mapped[str] = mapped_column(String(80), default="")
    period: Mapped[str] = mapped_column(String(7))
    units: Mapped[int] = mapped_column(Integer)
    monthly_units: Mapped[int] = mapped_column(Integer)
    extra_units: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="reserved", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    result_text: Mapped[str] = mapped_column(Text, default="")
    error_code: Mapped[str] = mapped_column(String(40), default="")


class AIQuotaAdjustment(Base):
    """管理员发放/扣回补充额度，独立审计并支持重试幂等。"""
    __tablename__ = "ai_quota_adjustments"
    __table_args__ = (UniqueConstraint("user_id", "request_key", name="uq_ai_adjustment_request"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(40), ForeignKey("users.username", ondelete="CASCADE"), index=True)
    request_key: Mapped[str] = mapped_column(String(80))
    requested_delta: Mapped[int] = mapped_column(Integer)
    actual_delta: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(80))
    actor: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
