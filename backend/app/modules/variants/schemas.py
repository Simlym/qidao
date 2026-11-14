"""多棋类引擎的公开状态。"""
from pydantic import BaseModel


class EngineStatus(BaseModel):
    available: bool
    label: str
