"""分离 AI 额度与训练积分，新增预留结算及请求审计。

Revision ID: 202610290004
Revises: 202608310003
"""
import sqlalchemy as sa
from alembic import op

revision = "202610290004"
down_revision = "202608310003"
branch_labels = None
depends_on = None


def create_table(name, *columns):
    # 历史基线使用当前 metadata.create_all；空库可能已经具有新表。
    if not sa.inspect(op.get_bind()).has_table(name):
        op.create_table(name, *columns)


def create_index(name, table, columns):
    if name not in {item["name"] for item in sa.inspect(op.get_bind()).get_indexes(table)}:
        op.create_index(name, table, columns)


def upgrade():
    # 旧积分余额和流水原样保留。AI 额度按新策略懒初始化，不复制积分。
    create_table("ai_quota_accounts",
        sa.Column("user_id", sa.String(40), sa.ForeignKey("users.username", ondelete="CASCADE"), primary_key=True),
        sa.Column("extra_balance", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.CheckConstraint("extra_balance >= 0", name="ck_ai_extra_nonnegative"))
    create_table("ai_quota_months",
        sa.Column("user_id", sa.String(40), sa.ForeignKey("users.username", ondelete="CASCADE"), primary_key=True),
        sa.Column("period", sa.String(7), primary_key=True),
        sa.Column("used_units", sa.Integer(), nullable=False),
        sa.CheckConstraint("used_units >= 0", name="ck_ai_month_nonnegative"))
    create_table("ai_operations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(40), sa.ForeignKey("users.username", ondelete="CASCADE"), nullable=False),
        sa.Column("request_key", sa.String(80), nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("ref", sa.String(80), nullable=False),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("units", sa.Integer(), nullable=False),
        sa.Column("monthly_units", sa.Integer(), nullable=False),
        sa.Column("extra_units", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("result_text", sa.Text(), nullable=False),
        sa.Column("error_code", sa.String(40), nullable=False),
        sa.UniqueConstraint("user_id", "request_key", name="uq_ai_operation_request"))
    for column in ("user_id", "status", "created_at"):
        create_index(f"ix_ai_operations_{column}", "ai_operations", [column])
    create_table("ai_quota_adjustments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(40), sa.ForeignKey("users.username", ondelete="CASCADE"), nullable=False),
        sa.Column("request_key", sa.String(80), nullable=False),
        sa.Column("requested_delta", sa.Integer(), nullable=False),
        sa.Column("actual_delta", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(80), nullable=False),
        sa.Column("actor", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "request_key", name="uq_ai_adjustment_request"))
    create_index("ix_ai_quota_adjustments_user_id", "ai_quota_adjustments", ["user_id"])
    create_table("llm_call_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ts", sa.DateTime(), nullable=False),
        sa.Column("feature", sa.String(40), nullable=False),
        sa.Column("user_id", sa.String(40), nullable=False),
        sa.Column("model", sa.String(40), nullable=False),
        *[sa.Column(name, sa.Integer(), nullable=False) for name in (
            "prompt_tokens", "cached_tokens", "completion_tokens", "reasoning_tokens", "total_tokens", "duration_ms")],
        sa.Column("cost_usd", sa.Float(), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("error", sa.String(200), nullable=False),
        sa.Column("ref", sa.String(80), nullable=False))
    columns = {item["name"] for item in sa.inspect(op.get_bind()).get_columns("llm_call_logs")}
    if "operation_id" not in columns:
        op.add_column("llm_call_logs", sa.Column("operation_id", sa.String(36), nullable=True))
    if "cost_known" not in columns:
        op.add_column("llm_call_logs", sa.Column("cost_known", sa.Boolean(), server_default=sa.false(), nullable=False))
    for column in ("ts", "feature", "user_id", "operation_id"):
        create_index(f"ix_llm_call_logs_{column}", "llm_call_logs", [column])


def downgrade():
    with op.batch_alter_table("llm_call_logs") as batch:
        batch.drop_index("ix_llm_call_logs_operation_id")
        batch.drop_column("operation_id")
        batch.drop_column("cost_known")
    for table in ("ai_quota_adjustments", "ai_operations", "ai_quota_months", "ai_quota_accounts"):
        op.drop_table(table)
