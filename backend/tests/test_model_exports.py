"""模型搬迁的元数据与兼容性回归测试。"""

from app import models
from app.core import models as legacy_models
from app.core.database import Base


def test_all_models_still_share_one_metadata():
    for name in models.__all__:
        obj = getattr(models, name)
        assert getattr(legacy_models, name) is obj
        assert obj.metadata is Base.metadata
        assert obj.__table__.name in Base.metadata.tables


def test_critical_tables_not_lost_after_split():
    assert {
        "users", "puzzles", "reviews", "games", "ai_quota_accounts",
    }.issubset(Base.metadata.tables)
