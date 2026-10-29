"""题库导入批次、来源追踪与发布状态。

Revision ID: 202610290005
Revises: 202610290004
"""
import sqlalchemy as sa
from alembic import op

revision = "202610290005"
down_revision = "202610290004"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    # 历史基线使用当前 metadata.create_all，空库可能已有新结构。
    if not sa.inspect(bind).has_table("puzzle_import_batches"):
        op.create_table("puzzle_import_batches",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("actor", sa.String(40), nullable=False),
            sa.Column("source_url", sa.String(1000), nullable=False),
            sa.Column("source_revision", sa.String(40), nullable=False),
            sa.Column("license", sa.String(100), nullable=False),
            sa.Column("attribution", sa.String(500), nullable=False),
            sa.Column("content_sha256", sa.String(64), nullable=False),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("imported_at", sa.DateTime(), nullable=True),
            sa.Column("report_json", sa.Text(), nullable=False),
            sa.Column("items_json", sa.Text(), nullable=False),
            sa.Column("added_count", sa.Integer(), nullable=False))
    columns = {c["name"] for c in sa.inspect(bind).get_columns("puzzles")}
    with op.batch_alter_table("puzzles") as batch:
        if "status" not in columns:
            batch.add_column(sa.Column("status", sa.String(16), server_default="published", nullable=False))
        if "import_batch_id" not in columns:
            batch.add_column(sa.Column("import_batch_id", sa.String(36), nullable=True))
            batch.create_foreign_key("fk_puzzle_import_batch", "puzzle_import_batches", ["import_batch_id"], ["id"])
        if "content_key" not in columns:
            batch.add_column(sa.Column("content_key", sa.String(64), nullable=True))
            batch.create_unique_constraint("uq_puzzles_content_key", ["content_key"])
    indexes = {i["name"] for i in sa.inspect(bind).get_indexes("puzzles")}
    for name in ("status", "import_batch_id"):
        if f"ix_puzzles_{name}" not in indexes:
            op.create_index(f"ix_puzzles_{name}", "puzzles", [name])
    # 旧生成器可抽到三辆红车；下架已知非法类型，保留题号和学习历史。
    puzzles = sa.table("puzzles", sa.column("fen"), sa.column("source"), sa.column("status"))
    red_rooks = sa.func.length(puzzles.c.fen) - sa.func.length(sa.func.replace(puzzles.c.fen, "R", ""))
    bind.execute(sa.update(puzzles).where(puzzles.c.source == "generated", red_rooks > 2).values(status="archived"))


def downgrade():
    with op.batch_alter_table("puzzles") as batch:
        batch.drop_index("ix_puzzles_status")
        batch.drop_index("ix_puzzles_import_batch_id")
        batch.drop_column("content_key")
        batch.drop_column("import_batch_id")
        batch.drop_column("status")
    op.drop_table("puzzle_import_batches")
