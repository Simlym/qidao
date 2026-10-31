"""为离线棋谱补传增加持久化去重标识。"""
from alembic import op
import sqlalchemy as sa

revision = "202610300007"
down_revision = "202610290006"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("games")}
    constraints = {c["name"] for c in sa.inspect(bind).get_unique_constraints("games")}
    with op.batch_alter_table("games") as batch:
        # 空库基线按当前 ORM 建表，旧库则需要在此补齐。
        if "client_id" not in columns:
            batch.add_column(sa.Column("client_id", sa.String(64), nullable=True))
        if "uq_games_user_client" not in constraints:
            batch.create_unique_constraint("uq_games_user_client", ["user_id", "client_id"])


def downgrade():
    with op.batch_alter_table("games") as batch:
        batch.drop_constraint("uq_games_user_client", type_="unique")
        batch.drop_column("client_id")
