"""管理员公共题库：来源、导入批次、批量发布与下架、导出。"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.core.models import Puzzle, PuzzleImportBatch, User, Attempt, Review, PuzzleSession
from app.core.rate_limit import limiter
from app.core.security_log import admin_action
from app.modules.auth.service import require_admin
from . import management, quality
from .schemas import ImportPreview, ImportBatchOut, BatchMutation, PuzzleEdit, QualityReviewBody, QualityReviewOut, PuzzleRevisionBody
from app.modules.admin.schemas import AdminPuzzle
from .validation import validate_item, position_key

router = APIRouter(prefix="/api/admin/puzzle-library", tags=["puzzle-library"], dependencies=[Depends(require_admin)])

SOURCES = [
    dict(id="wukong", name="Wukong 实战杀局", repository="https://github.com/maksimKorzh/wukong-xiangqi",
        license="MIT", attribution="Maksym Korzh / wukong-xiangqi (2021)",
        format="FEN 与杀棋步数，无着法题解", adapter="import_wukong", revision="9ef8db735e78ec640a64d50240698087b44c5294",
        note="已有转换器；须离线求解并审计，再上传生成的 JSON。不能把局面列表直接作为可练题。"),
    dict(id="ccpd", name="CCPD 大师实战棋谱", repository="https://github.com/Yvonne761/Chinese-Chess-Practical-Dataset",
        license="CC-BY-4.0", attribution="Yu-Han Tseng and Bo-Nian Chen (2026), CCPD",
        format="Big5 中文记谱 PGN", adapter="import_ccpd", revision="368a47a947773dd8692c026e286dd19b6277b993",
        note="已有转换器；先转为 JSON。适合开局、中局、残局主线学习，实战着法不代表唯一最优解。"),
]


@router.get("/sources")
def sources():
    return SOURCES


@router.get("/batches", response_model=list[ImportBatchOut])
def batches(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    return [management.batch_view(b) for b in db.scalars(select(PuzzleImportBatch)
        .order_by(PuzzleImportBatch.created_at.desc(), PuzzleImportBatch.id).offset(offset).limit(limit))]


@router.post("/preview", response_model=ImportBatchOut)
@limiter.limit("10/minute")
def preview(request: Request, body: ImportPreview, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    try:
        batch = management.preview(db, body, admin.username)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    admin_action(request, admin.username, "preview_puzzle_import", batch.id, db=db)
    return management.batch_view(batch, sample=True)


@router.post("/batches/{batch_id}/confirm", response_model=ImportBatchOut)
def confirm(batch_id: str, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    batch = db.get(PuzzleImportBatch, batch_id)
    if not batch:
        raise HTTPException(404, "导入批次不存在")
    try:
        batch = management.confirm(db, batch)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    admin_action(request, admin.username, "confirm_puzzle_import", batch.id, db=db)
    return management.batch_view(batch)


@router.post("/status")
def change_status(body: BatchMutation, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if bool(body.ids) == bool(body.batch_id):
        raise HTTPException(400, "请选择题目或指定一个批次")
    query = select(Puzzle).where(Puzzle.user_id == "default")
    query = query.where(Puzzle.import_batch_id == body.batch_id) if body.batch_id else query.where(Puzzle.id.in_(body.ids))
    puzzles = list(db.scalars(query.order_by(Puzzle.id)))
    if body.ids and {p.id for p in puzzles} != set(body.ids):
        raise HTTPException(400, "仅可操作公共题目，部分题目不存在或属于私人题库")
    try:
        updated = quality.set_status(db,puzzles,body.status,batch=bool(body.batch_id))
    except quality.QualityError as exc:
        raise HTTPException(exc.status,str(exc)) from exc
    admin_action(request, admin.username, "puzzle_status", f"{body.status}:{body.batch_id or ','.join(map(str,body.ids))}"[:200], db=db)
    return {"updated": updated}


@router.put("/puzzles/{puzzle_id}")
def edit(puzzle_id: int, body: PuzzleEdit, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    try:
        puzzle, versions = quality.lock_family(db,puzzle_id)
    except quality.QualityError as exc:
        raise HTTPException(exc.status,str(exc)) from exc
    answer_changed = body.kind != puzzle.kind or any(value is not None and value != getattr(puzzle, key)
        for key, value in (("fen", body.fen), ("solution", body.solution), ("side_to_move", body.side_to_move)))
    if answer_changed:
        if puzzle.id != versions[-1].id:
            raise HTTPException(409, "旧版本已有后续修订，不能改写原题解")
        used = any(db.scalar(select(model.id).where(model.puzzle_id == puzzle.id).limit(1)) is not None
            for model in (Attempt, Review, PuzzleSession))
        if puzzle.status != "draft" or used:
            raise HTTPException(409, "已有学习记录或非待审核题不能改写题解，请先下架并保留记录")
        values = {k: getattr(puzzle,k) for k in ("fen","solution","side_to_move","source")}
        values.update(body.model_dump(exclude_none=True))
        try:
            item = validate_item(values)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        other = db.scalars(select(Puzzle).where(Puzzle.id.not_in([p.id for p in versions]), Puzzle.user_id == "default")).all()
        if any(position_key(p.fen, p.side_to_move) == position_key(item["fen"]) for p in other):
            raise HTTPException(409, "公共题库已有相同局面")
        for key, value in item.items():
            if key == "content_key" and puzzle.revision_of_id:
                value = None
            setattr(puzzle, key, value)
        puzzle.ai_explanation = ""
        puzzle.review_status = "pending"
    if not body.category.strip():
        raise HTTPException(400, "分类不能为空")
    if (puzzle.category, puzzle.difficulty, puzzle.tags) != (body.category.strip(), body.difficulty, body.tags.strip()):
        puzzle.ai_explanation = ""
        puzzle.review_status = "pending"
    puzzle.category, puzzle.difficulty, puzzle.tags = body.category.strip(), body.difficulty, body.tags.strip()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "相同局面已由其他管理员写入，请刷新") from exc
    admin_action(request, admin.username, "edit_puzzle", str(puzzle.id), db=db)
    return {"ok": True}


@router.get("/puzzles/{puzzle_id}", response_model=AdminPuzzle)
def puzzle_detail(puzzle_id: int, db: Session = Depends(get_db)):
    try:
        return quality.puzzle_view(quality.public_puzzle(db,puzzle_id))
    except quality.QualityError as exc:
        raise HTTPException(exc.status,str(exc)) from exc


@router.get("/puzzles/{puzzle_id}/versions", response_model=list[AdminPuzzle])
def versions(puzzle_id: int, db: Session = Depends(get_db)):
    try:
        puzzle = quality.public_puzzle(db,puzzle_id)
        return [quality.puzzle_view(p) for p in quality.family(db,puzzle)]
    except quality.QualityError as exc:
        raise HTTPException(exc.status,str(exc)) from exc


@router.post("/puzzles/{puzzle_id}/revisions", response_model=AdminPuzzle)
def revise(puzzle_id: int, body: PuzzleRevisionBody, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    try:
        revision = quality.create_revision(db,puzzle_id,body,admin.username)
        admin_action(request,admin.username,"revise_puzzle",f"{puzzle_id}:{revision.id}",db=db)
        return quality.puzzle_view(revision)
    except quality.QualityError as exc:
        raise HTTPException(exc.status,str(exc)) from exc


@router.get("/puzzles/{puzzle_id}/reviews", response_model=list[QualityReviewOut])
def quality_reviews(puzzle_id: int, db: Session = Depends(get_db)):
    try:
        puzzle = quality.public_puzzle(db,puzzle_id)
    except quality.QualityError as exc:
        raise HTTPException(exc.status,str(exc)) from exc
    from app.core.models import PuzzleQualityReview
    rows = db.scalars(select(PuzzleQualityReview).where(PuzzleQualityReview.puzzle_id == puzzle.id)
        .order_by(PuzzleQualityReview.created_at.desc(),PuzzleQualityReview.id).limit(50))
    return [quality.review_view(r,quality.fingerprint(puzzle)) for r in rows]


@router.post("/puzzles/{puzzle_id}/reviews", response_model=QualityReviewOut)
def review_puzzle(puzzle_id: int, body: QualityReviewBody, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    try:
        row = quality.record_review(db,puzzle_id,body,admin.username,quality.request_key(request))
        admin_action(request,admin.username,"review_puzzle",f"{puzzle_id}:{body.verdict}",db=db)
        return quality.review_view(row,quality.fingerprint(quality.public_puzzle(db,puzzle_id)))
    except quality.QualityError as exc:
        raise HTTPException(exc.status,str(exc)) from exc


@router.get("/export")
def export(ids: str = Query("", max_length=4000), batch_id: str = Query("", max_length=36), db: Session = Depends(get_db)):
    if bool(ids) == bool(batch_id):
        raise HTTPException(400, "请选择题目或一个批次导出")
    query = select(Puzzle).where(Puzzle.user_id == "default")
    if batch_id:
        query = query.where(Puzzle.import_batch_id == batch_id)
    else:
        try:
            selected = [int(v) for v in ids.split(",")]
        except ValueError as exc:
            raise HTTPException(400, "题目编号无效") from exc
        if len(selected) > 500:
            raise HTTPException(400, "每次最多导出 500 题")
        query = query.where(Puzzle.id.in_(selected))
    puzzles = db.scalars(query.order_by(Puzzle.id).limit(501)).all()
    if len(puzzles) > 500:
        raise HTTPException(400, "批次过大，请分批选择题目导出")
    batch_ids = {p.import_batch_id for p in puzzles if p.import_batch_id}
    metadata = [management.batch_view(b) for b in db.scalars(select(PuzzleImportBatch).where(PuzzleImportBatch.id.in_(batch_ids)))]
    # 导出保留来源署名和内容指纹，不包含操作员身份、内部审核记录及用户作答。
    provenance = [{k: b[k] for k in ("id", "name", "source_url", "source_revision", "license", "attribution", "content_sha256")} for b in metadata]
    for b in metadata:
        provenance.extend(b["report"].get("upstream_sources", []))
    provenance = list({json.dumps(p, sort_keys=True): p for p in provenance}.values())
    return dict(format="xiangqidao-puzzles-v1", exported_at=datetime.utcnow().isoformat(), sources=provenance,
        items=[{k: getattr(p,k) for k in ("fen","solution","side_to_move","kind","category","difficulty","steps","source","tags","verified")} for p in puzzles])
