"""coach 领域的 SQLAlchemy 表定义（共享 app.core.database.Base）。"""

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

class CoachPlan(Base):
    """AI 教练训练计划：基于用户画像（评分/弱点/近期对局失误）生成，按时间保留历史。

    画像与建议由规则引擎确定性产出（profile_json / recommendations_json），
    plan_text 为 LLM 教练叙述——未配置大模型时为空，计划仍可用（纯数据版）。
    """

    __tablename__ = "coach_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(40), default="default", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    trigger: Mapped[str] = mapped_column(String(40), default="manual")  # manual / game:<id>
    profile_json: Mapped[str] = mapped_column(Text, default="")           # 生成时的画像快照
    recommendations_json: Mapped[str] = mapped_column(Text, default="")   # 结构化训练建议
    progress_json: Mapped[str] = mapped_column(Text, default="")          # 与历史基线的进步对比
    plan_text: Mapped[str] = mapped_column(Text, default="")              # LLM 教学叙述
