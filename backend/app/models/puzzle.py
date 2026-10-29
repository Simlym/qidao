"""puzzle 领域的 SQLAlchemy 表定义（共享 app.core.database.Base）。"""

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

class PuzzleImportBatch(Base):
    """导入预览快照与来源记录；确认时只使用服务端保存的快照。"""

    __tablename__ = "puzzle_import_batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    actor: Mapped[str] = mapped_column(String(40))
    source_url: Mapped[str] = mapped_column(String(1000), default="")
    source_revision: Mapped[str] = mapped_column(String(40), default="")
    license: Mapped[str] = mapped_column(String(100))
    attribution: Mapped[str] = mapped_column(String(500))
    content_sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="preview")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    imported_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    report_json: Mapped[str] = mapped_column(Text, default="{}")
    items_json: Mapped[str] = mapped_column(Text, default="[]")
    added_count: Mapped[int] = mapped_column(Integer, default=0)


class Puzzle(Base):
    """战术题。

    solution 为正解着法序列，UCI 坐标制，逗号分隔，如 'h2e2,a9a8,...'。
    多步题按「己方/对方交替」排列：偶数位（0,2,4…）是玩家要走的着法，
    奇数位是对方的应着——做题时由系统自动走出，玩家只需输入己方着法。
    一步杀题即长度为 1 的特例。
    """

    __tablename__ = "puzzles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    variant: Mapped[str] = mapped_column(String(12), default="xiangqi", index=True)
    fen: Mapped[str] = mapped_column(String(120), nullable=False)
    solution: Mapped[str] = mapped_column(Text, nullable=False)
    side_to_move: Mapped[str] = mapped_column(String(1), default="w")  # w=红 b=黑
    # 两级分类：kind 为大类（杀法/开局/中局/残局），category 为具体战术名目
    # （卧槽马/双车错/对面笑…）。弱点专项与雷达图按 category，题库浏览/筛选按 kind。
    kind: Mapped[str] = mapped_column(String(10), default="杀法", index=True)
    category: Mapped[str] = mapped_column(String(40), default="未分类")  # 具体战术名目
    difficulty: Mapped[int] = mapped_column(Integer, default=3)         # 1-5
    steps: Mapped[int] = mapped_column(Integer, default=1)              # 解题回合数（mate-in-N 的 N）
    # 题目 ELO：随作答动态收敛到「真实难度」；空表示尚未初始化（按难度回填）
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(String(80), default="")
    verified: Mapped[bool] = mapped_column(Boolean, default=False)      # 基础规则或离线引擎校验；人工审核另存
    # 归属：'default' 表示公共题库（所有人可练）；其他值为某用户的私有题
    # （如实战漏着自动生成题），仅本人可见。
    user_id: Mapped[str] = mapped_column(String(40), default="default", index=True)
    # LLM 生成的解题讲解缓存：同一道题只调用一次大模型，之后直接复用
    ai_explanation: Mapped[str] = mapped_column(Text, default="")
    # 逗号分隔的教学标签（如“子力协调,开放线,先手”），用于跨模式掌握度画像。
    tags: Mapped[str] = mapped_column(Text, default="")
    # 旧题默认已发布；新批量导入题先进入待审核，不删除已有训练历史。
    status: Mapped[str] = mapped_column(String(16), default="published", server_default="published", index=True)
    import_batch_id: Mapped[str | None] = mapped_column(ForeignKey("puzzle_import_batches.id"), nullable=True, index=True)
    # 仅管理导入写入规范局面键；历史重复题保留，不强制改写用户记录。
    content_key: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    revision_of_id: Mapped[int | None] = mapped_column(ForeignKey("puzzles.id", name="fk_puzzle_revision_of"), nullable=True, unique=True)
    revision_root_id: Mapped[int | None] = mapped_column(ForeignKey("puzzles.id", name="fk_puzzle_revision_root"), nullable=True, index=True)
    revision_number: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    revision_note: Mapped[str] = mapped_column(String(500), default="", server_default="")
    revision_actor: Mapped[str] = mapped_column(String(40), default="", server_default="")
    revision_created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    review_status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending", index=True)


class PuzzleQualityReview(Base):
    """人工审核证据绑定题目快照，不能冒充引擎证明。"""

    __tablename__ = "puzzle_quality_reviews"
    __table_args__ = (UniqueConstraint("puzzle_id", "request_key", name="uq_puzzle_quality_request"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    puzzle_id: Mapped[int] = mapped_column(ForeignKey("puzzles.id"), index=True)
    actor: Mapped[str] = mapped_column(String(40))
    verdict: Mapped[str] = mapped_column(String(20))
    note: Mapped[str] = mapped_column(String(1000))
    content_sha256: Mapped[str] = mapped_column(String(64))
    request_key: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PuzzleReport(Base):
    """用户反馈与处理结果；删除账号后匿名保留题目质量记录。"""

    __tablename__ = "puzzle_reports"
    __table_args__ = (UniqueConstraint("user_id", "request_key", name="uq_puzzle_report_request"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    puzzle_id: Mapped[int] = mapped_column(ForeignKey("puzzles.id"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.username", ondelete="SET NULL"), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(String(1000))
    proposed_solution: Mapped[str] = mapped_column(String(2000), default="")
    request_key: Mapped[str] = mapped_column(String(80))
    request_sha256: Mapped[str] = mapped_column(String(64))
    open_key: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    resolution_note: Mapped[str] = mapped_column(String(1000), default="")
    resolved_by: Mapped[str] = mapped_column(String(40), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
