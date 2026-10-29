"""统一加载并导出全部 ORM 模型，使 Alembic 可以发现完整 metadata。"""

from .user import User
from .puzzle import PuzzleImportBatch, Puzzle, PuzzleQualityReview, PuzzleReport
from .training import Review, Attempt, PuzzleSession, UserStat, LearningPack
from .game import Game, GameAnalysis
from .coach import CoachPlan
from .credits import CreditAccount, CreditLog, CosmeticPurchase
from .ai_usage import LLMCallLog, AIQuotaAccount, AIQuotaMonth, AIOperation, AIQuotaAdjustment
from .system import SecurityLog, AppSetting

__all__ = [
    'User',
    'PuzzleImportBatch',
    'Puzzle',
    'PuzzleQualityReview',
    'PuzzleReport',
    'Review',
    'Attempt',
    'PuzzleSession',
    'UserStat',
    'LearningPack',
    'Game',
    'GameAnalysis',
    'CoachPlan',
    'CreditAccount',
    'CreditLog',
    'CosmeticPurchase',
    'LLMCallLog',
    'AIQuotaAccount',
    'AIQuotaMonth',
    'AIOperation',
    'AIQuotaAdjustment',
    'SecurityLog',
    'AppSetting'
]
