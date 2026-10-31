"""基础对弈允许游客；题库与高级服务必须验证注册账号。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.dependencies import get_db
from app.core.models import Base, User, Puzzle, PuzzleSession, Attempt
from app.modules.auth.service import make_token


@pytest.fixture()
def env():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add(User(username="learner", password_hash="unused"))
        db.add(Puzzle(fen="9/9/5k1R1/9/9/9/9/9/7R1/4K4 w", solution="h7f7", category="双车错"))
        db.commit()
    def override():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = override
    try:
        yield TestClient(app), factory
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


@pytest.mark.parametrize("headers", [
    {}, {"X-Guest-ID": "a" * 32}, {"Authorization": "Bearer expired"},
    {"Authorization": "Bearer " + make_token("removed-account")},
])
def test_guest_cannot_access_managed_training_or_advanced_services(env, headers):
    client, factory = env
    endpoints = [
        ("GET", "/api/training/next", None),
        ("GET", "/api/training/puzzle/1", None),
        ("POST", "/api/training/check_move", {"puzzle_id": 1, "session_id": "x", "step": 0, "move": "h7f7"}),
        ("POST", "/api/training/submit", {"puzzle_id": 1, "session_id": "x", "self_rating": "good"}),
        ("POST", "/api/training/explain", {"puzzle_id": 1}),
        ("GET", "/api/challenge/levels", None),
        ("GET", "/api/challenge/level/0", None),
        ("GET", "/api/learning/curriculum", None),
        ("POST", "/api/learning/assessment/start", None),
        ("GET", "/api/coach/plan", None),
        ("POST", "/api/coach/plan", None),
        ("POST", "/api/play/coach", {"fen": "9/9/5k1R1/9/9/9/9/9/7R1/4K4 w", "move": "h7f7"}),
        ("POST", "/api/games/1/analyze", {}),
    ]
    for method, path, body in endpoints:
        result = client.request(method, path, headers=headers, **({"json": body} if body is not None else {}))
        assert result.status_code == 401, (path, result.text)
    with factory() as db:
        assert db.query(PuzzleSession).count() == 0
        assert db.query(Attempt).count() == 0


def test_registered_account_can_train_and_guest_can_start_basic_game(env):
    client, _ = env
    auth = {"Authorization": "Bearer " + make_token("learner")}
    puzzle = client.get("/api/training/next", headers=auth)
    assert puzzle.status_code == 200 and puzzle.json()["puzzle"]
    assert client.get("/api/learning/curriculum", headers=auth).status_code == 200
    basic = client.post("/api/play/new", json={"human_side": "w", "level": "easy"})
    assert basic.status_code == 200 and basic.json()["legal_moves"]
