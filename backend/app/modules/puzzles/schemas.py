"""题库管理、导入与来源追踪的 HTTP 结构。"""
from typing import Literal

from pydantic import BaseModel, Field


class ImportPreview(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    license: str = Field(min_length=1, max_length=100)
    attribution: str = Field(min_length=1, max_length=500)
    source_url: str = Field(default="", max_length=1000)
    github_url: str = Field(default="", max_length=1000)
    json_text: str = Field(default="", max_length=2*1024*1024)


class BatchMutation(BaseModel):
    ids: list[int] = Field(default_factory=list, max_length=500)
    batch_id: str | None = Field(default=None, max_length=36)
    status: Literal["draft", "published", "archived"]


class PuzzleEdit(BaseModel):
    kind: Literal["杀法", "开局", "中局", "残局"]
    category: str = Field(min_length=1, max_length=40)
    difficulty: int = Field(ge=1, le=5)
    tags: str = Field(default="", max_length=1000)
    fen: str | None = Field(default=None, max_length=120)
    solution: str | None = Field(default=None, max_length=2000)
    side_to_move: Literal["w", "b"] | None = None


class ImportBatchOut(BaseModel):
    id: str
    name: str
    actor: str
    source_url: str
    source_revision: str
    license: str
    attribution: str
    content_sha256: str
    status: str
    created_at: str
    imported_at: str | None
    added_count: int
    report: dict
    sample: list[dict] = Field(default_factory=list)
