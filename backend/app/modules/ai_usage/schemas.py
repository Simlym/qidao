"""额度策略与个人账单的 API 契约。"""
from datetime import datetime
from pydantic import BaseModel, Field, model_validator


class UsagePolicy(BaseModel):
    free_monthly_units: int = Field(ge=0, le=1_000_000)
    pro_monthly_units: int = Field(ge=0, le=1_000_000)
    costs: dict[str, int]

    @model_validator(mode="after")
    def validate_costs(self):
        from .service import DEFAULT_COSTS
        if set(self.costs) != set(DEFAULT_COSTS) or any(type(v) is not int or not 1 <= v <= 1_000_000 for v in self.costs.values()):
            raise ValueError("必须提供全部已知 AI 动作的正整数额度")
        return self


class OperationOut(BaseModel):
    id: str
    action: str
    ref: str
    units: int
    status: str
    created_at: datetime
    error_code: str


class AdjustmentOut(BaseModel):
    delta: int
    reason: str
    created_at: datetime


class UsageSummary(BaseModel):
    plan: str
    period: str
    resets_at: str
    expires_at: datetime | None
    monthly_limit: int
    monthly_used: int
    monthly_remaining: int
    extra_balance: int
    available_units: int
    costs: dict[str, int]
    operations: list[OperationOut]
    adjustments: list[AdjustmentOut]


class AdjustmentIn(BaseModel):
    delta: int = Field(ge=-1_000_000, le=1_000_000)
    reason: str = Field(min_length=1, max_length=80)


class CostSummary(BaseModel):
    calls: int
    failed_calls: int
    total_tokens: int
    estimated_cost_usd: float
    unknown_cost_calls: int
