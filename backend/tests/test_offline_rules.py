"""双端棋规共用回归样本，防止本地规则与服务端逐渐偏离。"""
import json
from pathlib import Path

from app.shared.xiangqi.validation import parse_fen, legal_moves, in_check, FILES


def test_offline_rule_fixtures():
    path = Path(__file__).resolve().parents[2] / "frontend/src/domain/xiangqi/rules.fixtures.json"
    for sample in json.loads(path.read_text(encoding="utf-8")):
        board = parse_fen(sample["fen"])
        side = sample["fen"].split()[1]
        moves = legal_moves(board, side)
        assert sorted(FILES[fc] + str(9-fr) + FILES[tc] + str(9-tr)
                      for fr, fc, tr, tc in moves) == sample["legal_moves"]
        checked = in_check(board, side)
        status = ("check" if checked else "ongoing") if moves else ("checkmate" if checked else "stalemate")
        assert status == sample["status"]
