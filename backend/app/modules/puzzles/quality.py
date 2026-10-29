"""题目人工审核与版本生命周期；所有写操作先锁版本根节点。"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from uuid import uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.models import Puzzle, PuzzleQualityReview
from .validation import validate_item, position_key, content_key

CONTENT_FIELDS = ("fen", "solution", "side_to_move", "kind", "category", "difficulty", "tags")
VIEW_FIELDS = ("id", "fen", "solution", "side_to_move", "kind", "category", "difficulty", "steps", "source", "verified", "tags",
    "status", "import_batch_id", "user_id", "revision_of_id", "revision_root_id", "revision_number", "revision_note", "revision_actor", "review_status")


class QualityError(ValueError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def fingerprint(puzzle) -> str:
    data = {key: (puzzle[key] if isinstance(puzzle, dict) else getattr(puzzle, key)) for key in CONTENT_FIELDS}
    return hashlib.sha256(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def puzzle_view(puzzle: Puzzle) -> dict:
    result = {key: getattr(puzzle, key) for key in VIEW_FIELDS}
    result["revision_created_at"] = puzzle.revision_created_at.isoformat() if puzzle.revision_created_at else None
    result["content_sha256"] = fingerprint(puzzle)
    return result


def public_puzzle(db: Session, puzzle_id: int) -> Puzzle:
    puzzle = db.get(Puzzle, puzzle_id)
    if puzzle is None or puzzle.user_id != "default" or puzzle.variant != "xiangqi":
        raise QualityError("公共象棋题目不存在", 404)
    return puzzle


def family_id(puzzle: Puzzle) -> int:
    return puzzle.revision_root_id or puzzle.id


def lock_roots(db: Session, roots) -> None:
    for root in sorted(set(roots)):
        # 空更新在 SQLite 和 PostgreSQL 都取得写锁，避免两个管理员同时修订同一题。
        db.execute(update(Puzzle).where(Puzzle.id == root).values(status=Puzzle.status).execution_options(synchronize_session=False))


def family(db: Session, puzzle: Puzzle) -> list[Puzzle]:
    root = family_id(puzzle)
    return list(db.scalars(select(Puzzle).where(or_(Puzzle.id == root, Puzzle.revision_root_id == root))
        .order_by(Puzzle.revision_number, Puzzle.id).execution_options(populate_existing=True)))


def lock_family(db: Session, puzzle_id: int) -> tuple[Puzzle, list[Puzzle]]:
    puzzle = public_puzzle(db, puzzle_id)
    lock_roots(db, [family_id(puzzle)])
    db.refresh(puzzle)
    return puzzle, family(db, puzzle)


def request_key(request) -> str:
    value = request.headers.get("Idempotency-Key", "").strip() or str(uuid4())
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", value):
        raise QualityError("请求标识无效")
    return value


def commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise QualityError("内容已由其他操作更新，请刷新后重试", 409) from exc


def review_view(review: PuzzleQualityReview, sha: str) -> dict:
    return dict(id=review.id, puzzle_id=review.puzzle_id, actor=review.actor, verdict=review.verdict,
        note=review.note, content_sha256=review.content_sha256, created_at=review.created_at.isoformat(), current=review.content_sha256 == sha)


def record_review(db: Session, puzzle_id: int, body, actor: str, key: str) -> PuzzleQualityReview:
    puzzle, _ = lock_family(db, puzzle_id)
    sha = fingerprint(puzzle)
    existing = db.scalar(select(PuzzleQualityReview).where(PuzzleQualityReview.puzzle_id == puzzle.id, PuzzleQualityReview.request_key == key))
    if existing:
        if (existing.actor, existing.verdict, existing.note, existing.content_sha256) != (actor, body.verdict, body.note.strip(), body.expected_sha256):
            raise QualityError("同一请求标识不能用于不同审核", 409)
        return existing
    if sha != body.expected_sha256:
        raise QualityError("题目已被修改，请重新查看后审核", 409)
    if len(body.note.strip()) < 4:
        raise QualityError("请填写至少 4 个字符的审核依据")
    if body.verdict == "approved":
        try:
            validate_item({key: getattr(puzzle,key) for key in (*CONTENT_FIELDS, "source")})
        except ValueError as exc:
            raise QualityError(f"基础校验未通过：{exc}") from exc
    review = PuzzleQualityReview(id=str(uuid4()), puzzle_id=puzzle.id, actor=actor, verdict=body.verdict,
        note=body.note.strip(), content_sha256=sha, request_key=key)
    db.add(review)
    puzzle.review_status = body.verdict
    if body.verdict == "needs_changes":
        puzzle.status = "archived" if puzzle.status == "published" else puzzle.status
    commit(db)
    db.refresh(review)
    return review


def create_revision(db: Session, puzzle_id: int, body, actor: str) -> Puzzle:
    original, versions = lock_family(db, puzzle_id)
    if fingerprint(original) != body.expected_sha256:
        raise QualityError("原题已被修改，请刷新后创建修订", 409)
    if len(body.reason.strip()) < 4:
        raise QualityError("请填写至少 4 个字符的修订原因")
    try:
        item = validate_item({**body.model_dump(), "source": original.source})
    except ValueError as exc:
        raise QualityError(str(exc)) from exc
    children = [p for p in versions if p.revision_of_id == original.id]
    if children:
        child = children[0]
        if fingerprint(child) == fingerprint(item) and child.revision_note == body.reason.strip() and child.revision_actor == actor:
            return child
        raise QualityError(f"此题已有后续版本 #{child.id}，请查看或编辑该版本", 409)
    if original.id != versions[-1].id:
        raise QualityError("请基于最新版本继续修订", 409)
    if fingerprint(original) == fingerprint(item):
        raise QualityError("修订内容与原题相同，请修改后再创建")
    # 待审核副本不抢占原版的局面唯一键，发布时再原子交接。
    item["content_key"] = None
    revision = Puzzle(**item, user_id="default", status="draft", import_batch_id=original.import_batch_id,
        revision_of_id=original.id, revision_root_id=family_id(original), revision_number=original.revision_number + 1,
        revision_note=body.reason.strip(), revision_actor=actor, revision_created_at=datetime.utcnow())
    db.add(revision)
    commit(db)
    db.refresh(revision)
    return revision


def set_status(db: Session, puzzles: list[Puzzle], status: str, *, batch: bool = False) -> int:
    lock_roots(db, [family_id(p) for p in puzzles])
    changed = 0
    for puzzle in puzzles:
        db.refresh(puzzle)
        versions = family(db, puzzle)
        if status == "published":
            if puzzle.id != versions[-1].id:
                if batch:
                    continue
                raise QualityError(f"题目 #{puzzle.id} 已有新版 #{versions[-1].id}，不能发布旧版", 409)
            try:
                validate_item({key:getattr(puzzle,key) for key in (*CONTENT_FIELDS,"source")})
            except ValueError as exc:
                raise QualityError(f"题目 #{puzzle.id} 基础校验未通过：{exc}") from exc
            if puzzle.review_status == "needs_changes":
                raise QualityError(f"题目 #{puzzle.id} 审核要求修改，不能发布", 409)
            if puzzle.review_status != "approved" and db.scalar(select(PuzzleQualityReview.id).where(PuzzleQualityReview.puzzle_id == puzzle.id).limit(1)):
                raise QualityError(f"题目 #{puzzle.id} 内容已修改，需要重新审核", 409)
            if puzzle.revision_of_id and puzzle.review_status != "approved":
                raise QualityError(f"修订版 #{puzzle.id} 需要先记录人工审核通过", 409)
            if puzzle.revision_of_id:
                key = position_key(puzzle.fen, puzzle.side_to_move)
                others = db.execute(select(Puzzle.fen, Puzzle.side_to_move).where(Puzzle.user_id == "default", Puzzle.variant == "xiangqi",
                    Puzzle.id.not_in([p.id for p in versions]))).all()
                if any(position_key(fen, side) == key for fen, side in others):
                    raise QualityError(f"修订版 #{puzzle.id} 与其他题目的局面冲突，请人工核对", 409)
            for previous in versions:
                if previous.id != puzzle.id:
                    previous.status, previous.content_key = "archived", None
            db.flush()  # 先释放旧版唯一键，随后由新版取得。
            if puzzle.revision_of_id:
                puzzle.content_key = content_key(puzzle.fen, puzzle.side_to_move)
        puzzle.status = status
        changed += 1
        db.flush()
    commit(db)
    return changed
