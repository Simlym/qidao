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


class PuzzleReportBody(BaseModel):
    category: Literal["wrong_solution", "alternative", "position", "difficulty", "other"]
    description: str = Field(min_length=4, max_length=1000)
    proposed_solution: str = Field(default="", max_length=2000)


class PuzzleReportOut(BaseModel):
    id: str
    puzzle_id: int
    category: str
    description: str
    proposed_solution: str
    status: str
    resolution_note: str
    created_at: str
    resolved_at: str | None
    reused: bool = False


class AdminPuzzleReportOut(PuzzleReportOut):
    reporter: str | None
    resolved_by: str


class ReportList(BaseModel):
    total: int
    items: list[PuzzleReportOut]


class AdminReportList(BaseModel):
    total: int
    open_count: int
    items: list[AdminPuzzleReportOut]


class ReportResolution(BaseModel):
    status: Literal["resolved", "dismissed"]
    note: str = Field(min_length=4, max_length=1000)


class QualityReviewBody(BaseModel):
    verdict: Literal["approved", "needs_changes"]
    note: str = Field(min_length=4, max_length=1000)
    expected_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class QualityReviewOut(BaseModel):
    id: str
    puzzle_id: int
    actor: str
    verdict: str
    note: str
    content_sha256: str
    created_at: str
    current: bool


class PuzzleRevisionBody(BaseModel):
    fen: str = Field(min_length=1, max_length=120)
    solution: str = Field(min_length=1, max_length=2000)
    side_to_move: Literal["w", "b"]
    kind: Literal["杀法", "开局", "中局", "残局"]
    category: str = Field(min_length=1, max_length=40)
    difficulty: int = Field(ge=1, le=5)
    tags: str = Field(default="", max_length=1000)
    reason: str = Field(min_length=4, max_length=500)
    expected_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
