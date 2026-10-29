"""管理入口的有界格式、局面和逐手合法性检查，不把主线合法冒充唯一解。"""
from __future__ import annotations

import hashlib
import re

from app.modules.puzzles.importer.audit_puzzles import _strict_position
from app.shared.xiangqi import apply_move, _gen_placement
from app.shared.xiangqi.validation import parse_fen, legal_moves, is_checkmate, is_mate_in_one, in_check

KINDS = {"杀法", "开局", "中局", "残局"}
STATUSES = {"draft", "published", "archived"}
MOVE = re.compile(r"[a-i][0-9][a-i][0-9]\Z")


def position_key(fen: str, side: str = "w") -> str:
    parts = fen.split()
    placement = parts[0].translate(str.maketrans("hHeE", "nNbB")) if parts else ""
    if len(placement.split("/")) == 10:
        placement = _gen_placement(parse_fen(placement))
    return f"{placement} {parts[1] if len(parts) > 1 else side}"


def content_key(fen: str, side: str = "w") -> str:
    return hashlib.sha256(position_key(fen, side).encode()).hexdigest()


def text(item: dict, name: str, default: str, limit: int) -> str:
    value = item.get(name, default)
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError(f"{name} 必须为不超过 {limit} 字符的文本")
    return value.strip()


def validate_item(item: dict, *, mate_check: bool = True) -> dict:
    if not isinstance(item, dict):
        raise ValueError("每题必须是对象")
    if item.get("variant", "xiangqi") != "xiangqi":
        raise ValueError("当前批量导入仅支持标准象棋")
    raw_fen = text(item, "fen", "", 120)
    side = item.get("side_to_move")
    parts = raw_fen.split()
    if side is not None and side not in ("w", "b"):
        raise ValueError("走子方必须是 w 或 b")
    if len(parts) > 1 and side and parts[1] != side:
        raise ValueError("FEN 与走子方不一致")
    fen = position_key(raw_fen, side or "w")
    ok, why = _strict_position(fen)
    if not ok:
        raise ValueError(why)
    # 合并相邻空位，避免等价 FEN 逃过去重；忽略半回合等不影响训练的字段。
    fen = f"{_gen_placement(parse_fen(fen))} {fen.split()[1]}"
    if in_check(parse_fen(fen), "b" if fen.split()[1] == "w" else "w"):
        raise ValueError("初始局面中非走子方已被将军，走子方或局面有误")
    raw = item.get("solution", "")
    if isinstance(raw, list) and all(isinstance(m, str) for m in raw):
        raw = ",".join(raw)
    if not isinstance(raw, str) or len(raw) > 2000:
        raise ValueError("正解必须是着法数组或文本")
    branches = [re.split(r"[,\s]+", line.strip()) for line in raw.split("|")]
    if not 1 <= len(branches) <= 8 or any(not 1 <= len(b) <= 31 or any(not MOVE.fullmatch(m) for m in b) for b in branches):
        raise ValueError("正解须使用 a0 到 i9 的四位坐标，每分支 1–31 手，最多 8 分支")
    kind = text(item, "kind", "杀法", 10)
    if kind not in KINDS:
        raise ValueError("大类须为杀法、开局、中局或残局")
    for branch in branches:
        current = fen
        for index, move in enumerate(branch):
            board = parse_fen(current)
            turn = current.split()[1]
            coordinates = (9-int(move[1]), ord(move[0])-97, 9-int(move[3]), ord(move[2])-97)
            if board[coordinates[2]][coordinates[3]] in ("K", "k"):
                raise ValueError("题解不能以吃掉帅将代替将死")
            if coordinates not in legal_moves(board, turn):
                raise ValueError(f"第 {index+1} 手 {move} 不合法")
            current = apply_move(current, move)
        if mate_check and kind == "杀法":
            if len(branch) % 2 == 0 or not is_checkmate(parse_fen(current), current.split()[1]):
                raise ValueError("杀法分支必须以出题方将死对手结束")
    # 单步杀可由规则证明；多步主线即使终局成立，也不能证明对手所有应手均必败。
    verified = kind == "杀法" and all(len(b) == 1 and is_mate_in_one(fen, b[0])[0] for b in branches)
    difficulty = item.get("difficulty", 3)
    if isinstance(difficulty, bool) or not isinstance(difficulty, int) or not 1 <= difficulty <= 5:
        raise ValueError("难度须为 1–5 的整数")
    return dict(fen=fen, solution="|".join(dict.fromkeys(",".join(b) for b in branches)),
        side_to_move=fen.split()[1], kind=kind, category=text(item,"category","未分类",40) or "未分类",
        difficulty=difficulty, steps=max((len(b)+1)//2 for b in branches),
        source=text(item,"source","",80), tags=text(item,"tags","",1000), verified=verified,
        content_key=content_key(fen))
