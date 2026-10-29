"""game 领域的 SQLAlchemy 表定义（共享 app.core.database.Base）。"""

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

class Game(Base):
    """棋局复盘记录。"""

    __tablename__ = "games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    variant: Mapped[str] = mapped_column(String(12), default="xiangqi", index=True)
    user_id: Mapped[str] = mapped_column(String(40), default="default", index=True)  # 棋局归属，匿名回退 default
    initial_fen: Mapped[str] = mapped_column(Text, default="")
    positions_json: Mapped[str] = mapped_column(Text, default="")
    played_on: Mapped[str] = mapped_column(String(20), nullable=True)
    red_player: Mapped[str] = mapped_column(String(80), default="")
    black_player: Mapped[str] = mapped_column(String(80), default="")
    result: Mapped[str] = mapped_column(String(10), default="未知")
    moves: Mapped[str] = mapped_column(Text, default="")
    opening: Mapped[str] = mapped_column(String(80), default="")
    source: Mapped[str] = mapped_column(String(80), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    report: Mapped[str] = mapped_column(Text, default="")  # LLM 综合复盘报告（整局总评）


class GameAnalysis(Base):
    """棋局逐步引擎分析结果。"""

    __tablename__ = "game_analysis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), index=True)
    move_index: Mapped[int] = mapped_column(Integer)          # 0-based，第几步
    fen_before: Mapped[str] = mapped_column(Text)              # 走这步前的局面
    move_played: Mapped[str] = mapped_column(String(10))       # 实际走法 UCI
    best_move: Mapped[str] = mapped_column(String(10), default="")  # 引擎最优
    score_cp: Mapped[int | None] = mapped_column(Integer, nullable=True)   # 走这步前评分（当前方视角）
    score_mate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eval_drop: Mapped[int] = mapped_column(Integer, default=0)  # 失分（正=失误）
    is_blunder: Mapped[bool] = mapped_column(Boolean, default=False)  # eval_drop > 200
    is_mistake: Mapped[bool] = mapped_column(Boolean, default=False)  # eval_drop > 80
    explanation: Mapped[str] = mapped_column(Text, default="")        # LLM 解释
    puzzle_id: Mapped[int | None] = mapped_column(ForeignKey("puzzles.id"), nullable=True)
