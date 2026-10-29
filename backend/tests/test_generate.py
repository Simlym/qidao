"""一步杀生成器测试：生成的每道题都必须经内置规则校验为成立的一步杀。"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.modules.puzzles.importer.generate import generate
from app.shared.xiangqi.validation import is_mate_in_one
from app.modules.puzzles.validation import validate_item


def test_generated_puzzles_are_valid_mates():
    puzzles = generate(10, seed=2024)
    assert len(puzzles) == 10
    for p in puzzles:
        assert p["side_to_move"] == "w"
        assert len(p["solution"]) == 1
        ok, why = is_mate_in_one(p["fen"], p["solution"][0])
        assert ok, f"非一步杀: {p['fen']} {p['solution']} -> {why}"
        assert 1 <= p["difficulty"] <= 5
        assert validate_item(p)["verified"] is True


def test_generator_never_places_more_than_two_rooks():
    from app.modules.puzzles.importer.generate import _random_position
    from random import Random
    rng = Random(1234)
    for _ in range(500):
        board = _random_position(rng)
        if board:
            assert sum(cell == "R" for row in board for cell in row) <= 2


def test_generate_is_deterministic_with_seed():
    a = generate(5, seed=7)
    b = generate(5, seed=7)
    assert [x["fen"] for x in a] == [x["fen"] for x in b]


def test_generated_puzzles_are_unique():
    puzzles = generate(20, seed=99)
    fens = [p["fen"] for p in puzzles]
    assert len(fens) == len(set(fens))
