"""题库管理服务：先检查快照，再幂等导入；公共题去重不受私人错题影响。"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.models import Puzzle, PuzzleImportBatch
from .github_source import MAX_BYTES, fetch_json
from .validation import validate_item, position_key

MAX_ITEMS = 500


def public_positions(db: Session) -> dict[str, str]:
    return {position_key(fen, side): solution for fen, side, solution in db.execute(
        select(Puzzle.fen, Puzzle.side_to_move, Puzzle.solution)
        .where(Puzzle.user_id == "default", Puzzle.variant == "xiangqi").order_by(Puzzle.id))}


def batch_view(batch: PuzzleImportBatch, sample: bool = False) -> dict:
    return dict(id=batch.id, name=batch.name, actor=batch.actor, source_url=batch.source_url,
        source_revision=batch.source_revision, license=batch.license, attribution=batch.attribution,
        content_sha256=batch.content_sha256, status=batch.status,
        created_at=batch.created_at.isoformat(), imported_at=batch.imported_at.isoformat() if batch.imported_at else None,
        added_count=batch.added_count, report=json.loads(batch.report_json),
        sample=json.loads(batch.items_json)[:5] if sample else [])


def preview(db: Session, body, actor: str) -> PuzzleImportBatch:
    if not body.name.strip() or not body.license.strip() or not body.attribution.strip():
        raise ValueError("请填写批次名称、许可证和来源署名")
    if bool(body.github_url.strip()) == bool(body.json_text.strip()):
        raise ValueError("请选择 GitHub 文件或本地 JSON 中的一种")
    revision = ""
    source_url = body.source_url.strip()
    if body.github_url.strip():
        raw, source_url, revision = fetch_json(body.github_url.strip())
    else:
        raw = body.json_text.encode("utf-8")
    if len(raw) > MAX_BYTES:
        raise ValueError("单次 JSON 不得超过 2 MiB")
    try:
        document = json.loads(raw.decode("utf-8-sig"))
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise ValueError("文件必须是 UTF-8 JSON；其他格式请先使用转换工具") from exc
    items = document.get("items") if isinstance(document, dict) else document
    if not isinstance(items, list) or not 1 <= len(items) <= MAX_ITEMS:
        raise ValueError(f"每次导入 1–{MAX_ITEMS} 题，可使用题目数组或包含 items 的对象")
    upstream = document.get("sources", []) if isinstance(document, dict) else []
    if not isinstance(upstream, list) or len(upstream) > 50:
        raise ValueError("来源记录须为最多 50 项的数组")
    provenance = []
    for source in upstream:
        if not isinstance(source, dict):
            raise ValueError("来源记录格式不正确")
        clean = {}
        for key, limit in (("id",36),("name",100),("source_url",1000),("source_revision",40),("license",100),("attribution",500),("content_sha256",64)):
            value = source.get(key, "")
            if not isinstance(value,str) or len(value) > limit:
                raise ValueError("来源记录字段格式不正确")
            clean[key] = value
        if not clean["license"].strip() or not clean["attribution"].strip():
            raise ValueError("导出文件中的原始许可证和署名不能为空")
        provenance.append(clean)
    plies = 0
    for item in items:
        solution = item.get("solution", "") if isinstance(item,dict) else ""
        plies += len(re.split(r"[,|\s]+", solution.strip())) if isinstance(solution,str) else len(solution) if isinstance(solution,list) else 0
    if plies > 5000:
        raise ValueError("本批次题解总长度超过 5000 手，请拆小批次")
    existing = public_positions(db)
    seen = {}
    accepted, errors = [], []
    duplicates = conflicts = invalid = 0
    for index, raw_item in enumerate(items, start=1):
        try:
            item = validate_item(raw_item)
        except ValueError as exc:
            invalid += 1
            if len(errors) < 50:
                errors.append(dict(row=index, reason=str(exc)))
            continue
        key = position_key(item["fen"])
        previous = seen.get(key, existing.get(key))
        if previous is not None:
            # 相同局面不同题解不擅自合并；由管理员核对多解或不同教学目标。
            if previous == item["solution"]:
                duplicates += 1
            else:
                conflicts += 1
                if len(errors) < 50:
                    errors.append(dict(row=index, reason="相同局面已有不同题解，请人工核对"))
            continue
        seen[key] = item["solution"]
        accepted.append(item)
    report = dict(total=len(items), ready=len(accepted), duplicates=duplicates, conflicts=conflicts,
        invalid=invalid, errors=errors, rule_verified=sum(p["verified"] for p in accepted),
        upstream_sources=provenance,
        note="所有候选题均已逐手检查；多步主线合法与终局将死不代表唯一解或强制杀。")
    batch = PuzzleImportBatch(id=str(uuid4()), name=body.name.strip(), actor=actor,
        source_url=source_url, source_revision=revision, license=body.license.strip(),
        attribution=body.attribution.strip(), content_sha256=hashlib.sha256(raw).hexdigest(),
        report_json=json.dumps(report, ensure_ascii=False), items_json=json.dumps(accepted, ensure_ascii=False))
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def confirm(db: Session, batch: PuzzleImportBatch) -> PuzzleImportBatch:
    # 同一批次串行确认；状态和新增题同事务提交，失败不留下半个批次。
    claimed = db.execute(update(PuzzleImportBatch).where(PuzzleImportBatch.id == batch.id,
        PuzzleImportBatch.status == "preview").values(status="imported").execution_options(synchronize_session=False)).rowcount
    db.refresh(batch)
    if not claimed:
        if batch.status == "imported":
            return batch
        raise ValueError("批次状态无效")
    existing = public_positions(db)
    added = 0
    for item in json.loads(batch.items_json):
        key = position_key(item["fen"])
        if key in existing:
            continue
        try:
            # 唯一局面键兜底不同批次同时导入；已存在的旧题仍由上面的规范局面匹配识别。
            with db.begin_nested():
                db.add(Puzzle(**item, status="draft", user_id="default", import_batch_id=batch.id))
                db.flush()
        except IntegrityError:
            if db.scalar(select(Puzzle.id).where(Puzzle.content_key == item["content_key"])) is None:
                raise
            continue
        existing[key] = item["solution"]
        added += 1
    batch.added_count = added
    batch.imported_at = datetime.utcnow()
    report = json.loads(batch.report_json)
    report["skipped_at_confirm"] = report["ready"] - added
    batch.report_json = json.dumps(report, ensure_ascii=False)
    db.commit()
    db.refresh(batch)
    return batch
