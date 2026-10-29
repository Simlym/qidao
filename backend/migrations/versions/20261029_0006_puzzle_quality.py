"""题目反馈、人工审核证据与保留历史的题解版本。

Revision ID: 202610290006
Revises: 202610290005
"""
import sqlalchemy as sa
from alembic import op

revision = "202610290006"
down_revision = "202610290005"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("puzzles")}
    with op.batch_alter_table("puzzles") as batch:
        for name in ("revision_of_id", "revision_root_id"):
            if name not in columns:
                batch.add_column(sa.Column(name, sa.Integer(), nullable=True))
                batch.create_foreign_key("fk_puzzle_"+name[:-3], "puzzles", [name], ["id"])
                if name == "revision_of_id":
                    batch.create_unique_constraint("uq_puzzle_revision_of", [name])
        for column in (
            sa.Column("revision_number", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("revision_note", sa.String(500), nullable=False, server_default=""),
            sa.Column("revision_actor", sa.String(40), nullable=False, server_default=""),
            sa.Column("revision_created_at", sa.DateTime(), nullable=True),
            sa.Column("review_status", sa.String(20), nullable=False, server_default="pending")):
            if column.name not in columns:
                batch.add_column(column)
    for name in ("revision_root_id", "review_status"):
        if f"ix_puzzles_{name}" not in {i["name"] for i in sa.inspect(bind).get_indexes("puzzles")}:
            op.create_index(f"ix_puzzles_{name}", "puzzles", [name])
    # 基线迁移使用当前 metadata.create_all，空库可能已包含下列表。
    if not sa.inspect(bind).has_table("puzzle_quality_reviews"):
        op.create_table("puzzle_quality_reviews",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("puzzle_id", sa.Integer(), sa.ForeignKey("puzzles.id"), nullable=False),
            sa.Column("actor", sa.String(40), nullable=False),
            sa.Column("verdict", sa.String(20), nullable=False),
            sa.Column("note", sa.String(1000), nullable=False),
            sa.Column("content_sha256", sa.String(64), nullable=False),
            sa.Column("request_key", sa.String(80), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("puzzle_id", "request_key", name="uq_puzzle_quality_request"))
    if not sa.inspect(bind).has_table("puzzle_reports"):
        op.create_table("puzzle_reports",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("puzzle_id", sa.Integer(), sa.ForeignKey("puzzles.id"), nullable=False),
            sa.Column("user_id", sa.String(40), sa.ForeignKey("users.username", ondelete="SET NULL"), nullable=True),
            sa.Column("category", sa.String(30), nullable=False),
            sa.Column("description", sa.String(1000), nullable=False),
            sa.Column("proposed_solution", sa.String(2000), nullable=False),
            sa.Column("request_key", sa.String(80), nullable=False),
            sa.Column("request_sha256", sa.String(64), nullable=False),
            sa.Column("open_key", sa.String(64), nullable=True, unique=True),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("resolution_note", sa.String(1000), nullable=False),
            sa.Column("resolved_by", sa.String(40), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("user_id", "request_key", name="uq_puzzle_report_request"))
    for table, names in (("puzzle_quality_reviews", ("puzzle_id",)), ("puzzle_reports", ("puzzle_id", "user_id", "status"))):
        indexes = {i["name"] for i in sa.inspect(bind).get_indexes(table)}
        for name in names:
            if f"ix_{table}_{name}" not in indexes:
                op.create_index(f"ix_{table}_{name}", table, [name])


def downgrade():
    op.drop_table("puzzle_reports")
    op.drop_table("puzzle_quality_reviews")
    with op.batch_alter_table("puzzles") as batch:
        batch.drop_index("ix_puzzles_revision_root_id")
        batch.drop_index("ix_puzzles_review_status")
        for name in ("review_status", "revision_created_at", "revision_actor", "revision_note", "revision_number", "revision_root_id", "revision_of_id"):
            batch.drop_column(name)
