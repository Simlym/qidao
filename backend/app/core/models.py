"""向后兼容的 ORM 导出入口。实体定义已归入 app.models。

历史代码继续使用 `from app.core.models import Puzzle`；
新代码优先使用 `from app.models import Puzzle`。
这只是代码移动，不修改数据表、主键或 Alembic revision。
"""

from .database import Base, SessionLocal, engine, init_db  # noqa: F401
from app.models import (
    User,
    PuzzleImportBatch,
    Puzzle,
    PuzzleQualityReview,
    PuzzleReport,
    Review,
    Attempt,
    PuzzleSession,
    UserStat,
    LearningPack,
    Game,
    GameAnalysis,
    CoachPlan,
    CreditAccount,
    CreditLog,
    CosmeticPurchase,
    LLMCallLog,
    AIQuotaAccount,
    AIQuotaMonth,
    AIOperation,
    AIQuotaAdjustment,
    SecurityLog,
    AppSetting,
)

__all__ = [
    "Base", "SessionLocal", "engine", "init_db",
    "User",
    "PuzzleImportBatch",
    "Puzzle",
    "PuzzleQualityReview",
    "PuzzleReport",
    "Review",
    "Attempt",
    "PuzzleSession",
    "UserStat",
    "LearningPack",
    "Game",
    "GameAnalysis",
    "CoachPlan",
    "CreditAccount",
    "CreditLog",
    "CosmeticPurchase",
    "LLMCallLog",
    "AIQuotaAccount",
    "AIQuotaMonth",
    "AIOperation",
    "AIQuotaAdjustment",
    "SecurityLog",
    "AppSetting",
]
