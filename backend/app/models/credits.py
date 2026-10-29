"""credits 领域的 SQLAlchemy 表定义（共享 app.core.database.Base）。"""

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

class CreditAccount(Base):
    """用户训练积分账户，独立于 AI 使用额度。

    积分用于外观等训练奖励；签到、对弈与做题赚取，不兑换模型调用。
    访客不参与训练积分结算；模型调用必须经过独立 AI 额度账本。
    """

    __tablename__ = "credit_accounts"

    user_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    balance: Mapped[int] = mapped_column(Integer, default=0)
    total_earned: Mapped[int] = mapped_column(Integer, default=0)  # 累计获取（不含初始赠送外的统计口径）
    last_checkin: Mapped[date | None] = mapped_column(Date, nullable=True)  # 最近签到日
    checkin_streak: Mapped[int] = mapped_column(Integer, default=0)  # 连续签到天数
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CreditLog(Base):
    """积分流水（append-only）：用于审计与「每日上限」统计，防止刷分。

    kind 形如 'earn:checkin' / 'earn:game' / 'spend:coach_plan' / 'refund:puzzle_explain'。
    amount 正为入账、负为扣减；balance_after 记录变动后余额，便于对账。
    """

    __tablename__ = "credit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    day: Mapped[date] = mapped_column(Date, default=date.today, index=True)  # 本地日期，按日聚合算上限
    kind: Mapped[str] = mapped_column(String(40), index=True)
    amount: Mapped[int] = mapped_column(Integer, default=0)
    balance_after: Mapped[int] = mapped_column(Integer, default=0)
    ref: Mapped[str] = mapped_column(String(80), default="")  # 关联对象，如 puzzle:123 / game:45


class CosmeticPurchase(Base):
    """用户已解锁的外观资源。

    付费外观买断后永久保留；免费外观不入库。唯一约束同时避免
    重复购买和并发请求重复扣费。
    """

    __tablename__ = "cosmetic_purchases"
    __table_args__ = (UniqueConstraint("user_id", "asset_key", name="uq_cosmetic_user_asset"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    asset_key: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    price_paid: Mapped[int] = mapped_column(Integer, default=0)
    purchased_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
