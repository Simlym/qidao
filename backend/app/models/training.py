"""training 领域的 SQLAlchemy 表定义（共享 app.core.database.Base）。"""

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

class Review(Base):
    """SM-2 复习状态（每用户每题一行）。"""

    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("puzzle_id", "user_id", name="uq_reviews_puzzle_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    puzzle_id: Mapped[int] = mapped_column(ForeignKey("puzzles.id"))
    user_id: Mapped[str] = mapped_column(String(40), default="default", index=True)

    repetitions: Mapped[int] = mapped_column(Integer, default=0)
    interval: Mapped[int] = mapped_column(Integer, default=0)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    next_review: Mapped[date] = mapped_column(Date, default=date.today, index=True)
    created_at: Mapped[date] = mapped_column(Date, default=date.today, index=True)  # 首次学习日，用于每日新题上限


class Attempt(Base):
    """每次作答记录，用于统计与弱点分析。"""

    __tablename__ = "attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    puzzle_id: Mapped[int] = mapped_column(ForeignKey("puzzles.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(40), default="default", index=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    correct: Mapped[bool] = mapped_column(Boolean)
    time_spent_ms: Mapped[int] = mapped_column(Integer, default=0)
    wrong_move: Mapped[str] = mapped_column(String(10), default="")
    had_retry: Mapped[bool] = mapped_column(Boolean, default=False)  # 是否中途重试，用于首答正确率
    # training / review / challenge / blunder / assessment:<pack_id>
    context: Mapped[str] = mapped_column(String(80), default="training", index=True)


class PuzzleSession(Base):
    """一次可信解题会话。

    正确步骤、重试次数与是否完成均由服务端推进，最终结算不再相信客户端传入的
    correct / had_retry。训练与闯关共用该模型，通过 context 区分来源。
    """

    __tablename__ = "puzzle_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    puzzle_id: Mapped[int] = mapped_column(ForeignKey("puzzles.id"), index=True)
    context: Mapped[str] = mapped_column(String(80), default="training")
    # 多变着题当前采用的分支；-1 表示尚未由玩家首着确定。
    line_index: Mapped[int] = mapped_column(Integer, default=-1)
    step: Mapped[int] = mapped_column(Integer, default=0)
    wrong_count: Mapped[int] = mapped_column(Integer, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    settled: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)


class UserStat(Base):
    """用户评分档案（每用户一行，按 user_id 字符串归属，含匿名 default）。

    与 User 表解耦：匿名访客也能有评分，且评分逻辑不依赖账号体系。
    """

    __tablename__ = "user_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    rating: Mapped[int] = mapped_column(Integer, default=1200)   # 当前 ELO
    peak: Mapped[int] = mapped_column(Integer, default=1200)     # 历史最高
    solved: Mapped[int] = mapped_column(Integer, default=0)      # 已结算评分的题数
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class LearningPack(Base):
    """阶段测评或单局关键问题组成的可追踪训练包。"""

    __tablename__ = "learning_packs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    pack_type: Mapped[str] = mapped_column(String(20), index=True)  # assessment / game_review
    title: Mapped[str] = mapped_column(String(100), default="")
    source_game_id: Mapped[int | None] = mapped_column(ForeignKey("games.id"), nullable=True)
    puzzle_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    baseline_json: Mapped[str] = mapped_column(Text, default="{}")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
