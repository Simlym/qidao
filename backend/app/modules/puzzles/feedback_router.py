"""用户题目反馈与管理员处理队列；只向用户返回自己的反馈。"""
import hashlib
import json
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.core.models import PuzzleReport, User
from app.core.rate_limit import limiter
from app.core.security_log import admin_action
from app.modules.auth.service import current_user, require_admin
from . import quality
from .schemas import PuzzleReportBody, PuzzleReportOut, ReportList, AdminReportList, AdminPuzzleReportOut, ReportResolution

router = APIRouter(prefix="/api/puzzles", tags=["puzzle-feedback"])
admin_router = APIRouter(prefix="/api/admin/puzzle-library", tags=["puzzle-feedback-admin"], dependencies=[Depends(require_admin)])


def report_view(report: PuzzleReport, *, admin=False, reused=False) -> dict:
    value = dict(id=report.id, puzzle_id=report.puzzle_id, category=report.category,
        description=report.description, proposed_solution=report.proposed_solution, status=report.status,
        resolution_note=report.resolution_note, created_at=report.created_at.isoformat(),
        resolved_at=report.resolved_at.isoformat() if report.resolved_at else None, reused=reused)
    if admin:
        value.update(reporter=report.user_id, resolved_by=report.resolved_by)
    return value


@router.post("/{puzzle_id}/reports", response_model=PuzzleReportOut)
@limiter.limit("10/minute")
def report_puzzle(puzzle_id: int, body: PuzzleReportBody, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        key = quality.request_key(request)
        sha = hashlib.sha256(json.dumps({"puzzle_id":puzzle_id, **body.model_dump()},sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        existing = db.scalar(select(PuzzleReport).where(PuzzleReport.user_id == user.username, PuzzleReport.request_key == key))
        if existing:
            if existing.request_sha256 != sha:
                raise quality.QualityError("同一请求标识不能用于不同反馈",409)
            return report_view(existing,reused=True)
        puzzle, _ = quality.lock_family(db,puzzle_id)
        if puzzle.status != "published":
            raise quality.QualityError("题目已下架或尚未发布",404)
        if not db.scalar(select(User.id).where(User.username == user.username)):
            raise quality.QualityError("账号已失效，请重新登录",401)
        if len(body.description.strip()) < 4:
            raise quality.QualityError("请说明至少 4 个字符的问题描述")
        open_key = hashlib.sha256(f"{user.username}:{puzzle.id}:{body.category}".encode()).hexdigest()
        existing = db.scalar(select(PuzzleReport).where(PuzzleReport.open_key == open_key))
        if existing and existing.user_id == user.username:
            return report_view(existing,reused=True)
        if existing and existing.user_id is None:
            existing.open_key = None
            db.flush()
        report = PuzzleReport(id=str(uuid4()),puzzle_id=puzzle.id,user_id=user.username,category=body.category,
            description=body.description.strip(),proposed_solution=body.proposed_solution.strip(),request_key=key,
            request_sha256=sha,open_key=open_key)
        db.add(report)
        quality.commit(db)
        db.refresh(report)
        return report_view(report)
    except quality.QualityError as exc:
        raise HTTPException(exc.status,str(exc)) from exc


@router.get("/reports/mine", response_model=ReportList)
def my_reports(puzzle_id: int | None = None, limit: int = Query(20,ge=1,le=100), offset: int = Query(0,ge=0), db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = select(PuzzleReport).where(PuzzleReport.user_id == user.username)
    if puzzle_id is not None:
        query = query.where(PuzzleReport.puzzle_id == puzzle_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(query.order_by(PuzzleReport.created_at.desc(),PuzzleReport.id).offset(offset).limit(limit))
    return dict(total=total,items=[report_view(r) for r in items])


@admin_router.get("/reports",response_model=AdminReportList)
def reports(status: str = "open", puzzle_id: int | None = None, limit: int = Query(20,ge=1,le=100), offset: int = Query(0,ge=0), db: Session = Depends(get_db)):
    if status not in ("", "open", "resolved", "dismissed"):
        raise HTTPException(400,"反馈状态无效")
    query = select(PuzzleReport)
    if status:
        query = query.where(PuzzleReport.status == status)
    if puzzle_id is not None:
        query = query.where(PuzzleReport.puzzle_id == puzzle_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    open_count = db.scalar(select(func.count()).select_from(PuzzleReport).where(PuzzleReport.status == "open")) or 0
    items = db.scalars(query.order_by(PuzzleReport.created_at,PuzzleReport.id).offset(offset).limit(limit))
    return dict(total=total,open_count=open_count,items=[report_view(r,admin=True) for r in items])


@admin_router.post("/reports/{report_id}/resolve",response_model=AdminPuzzleReportOut)
def resolve(report_id: str, body: ReportResolution, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    report = db.get(PuzzleReport,report_id)
    if not report:
        raise HTTPException(404,"反馈不存在")
    try:
        quality.lock_family(db,report.puzzle_id)
        db.refresh(report)
        if len(body.note.strip()) < 4:
            raise quality.QualityError("请填写至少 4 个字符的处理说明")
        if report.status != "open":
            if (report.status,report.resolution_note) != (body.status,body.note.strip()):
                raise quality.QualityError("该反馈已处理，请刷新查看结果",409)
            return report_view(report,admin=True)
        report.status, report.resolution_note = body.status,body.note.strip()
        report.resolved_by,report.resolved_at,report.open_key = admin.username,datetime.utcnow(),None
        quality.commit(db)
        admin_action(request,admin.username,"resolve_puzzle_report",report.id,db=db)
        return report_view(report,admin=True)
    except quality.QualityError as exc:
        raise HTTPException(exc.status,str(exc)) from exc
