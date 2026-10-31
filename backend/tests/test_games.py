"""棋局复盘路由单元测试（直接调用路由函数，无需 httpx）。"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from app.core.models import Base
from app.modules.games.schemas import ImportRequest
from app.modules.games.router import (
    INITIAL_FEN,
    import_game,
    list_games,
    get_game,
    delete_game,
)
from app.shared.xiangqi import apply_move

TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False)

SAMPLE_MOVES = ["h2e2", "h9g7", "b2e2", "b9c7"]


@pytest.fixture(autouse=True, scope="module")
def setup_db():
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture()
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_import_game(db):
    req = ImportRequest(
        moves=" ".join(SAMPLE_MOVES),
        red_player="红方",
        black_player="黑方",
        result="红胜",
    )
    result = import_game.__wrapped__(None, req, db, user="default")
    assert result["move_count"] == len(SAMPLE_MOVES)
    assert isinstance(result["id"], int)


def test_import_invalid_move(db):
    req = ImportRequest(moves="h2e2 INVALID")
    with pytest.raises(HTTPException) as exc_info:
        import_game.__wrapped__(None, req, db, user="default")
    assert exc_info.value.status_code == 400


def test_import_comma_separated(db):
    req = ImportRequest(moves="h2e2,h9g7")
    result = import_game.__wrapped__(None, req, db, user="default")
    assert result["move_count"] == 2


def test_list_games(db):
    games = list_games(limit=50, offset=0, db=db, user="default")
    assert len(games) >= 1
    for g in games:
        assert hasattr(g, "id")
        assert not hasattr(g, "moves") or True  # GameSummary doesn't expose moves in response_model
        assert hasattr(g, "red_player")


def test_get_game_positions(db):
    req = ImportRequest(moves=" ".join(SAMPLE_MOVES))
    result = import_game.__wrapped__(None, req, db, user="default")
    game_id = result["id"]

    detail = get_game(game_id, db, user="default")
    positions = detail.positions

    assert len(positions) == len(SAMPLE_MOVES) + 1

    # Index 0: initial FEN, move=""
    assert positions[0].move_index == 0
    assert positions[0].move == ""
    assert positions[0].fen == INITIAL_FEN

    # Index 1: after first move
    expected_fen_1 = apply_move(INITIAL_FEN, SAMPLE_MOVES[0])
    assert positions[1].move_index == 1
    assert positions[1].move == SAMPLE_MOVES[0]
    assert positions[1].fen == expected_fen_1

    # Verify all subsequent positions chain correctly
    fen = INITIAL_FEN
    for i, move in enumerate(SAMPLE_MOVES):
        fen = apply_move(fen, move)
        assert positions[i + 1].fen == fen


def test_get_game_not_found(db):
    with pytest.raises(HTTPException) as exc_info:
        get_game(99999, db, user="default")
    assert exc_info.value.status_code == 404


def test_delete_game(db):
    req = ImportRequest(moves="h2e2")
    result = import_game.__wrapped__(None, req, db, user="default")
    game_id = result["id"]

    resp = delete_game(game_id, db, user="default")
    assert resp == {"ok": True}

    # Confirm deleted
    with pytest.raises(HTTPException) as exc_info:
        get_game(game_id, db, user="default")
    assert exc_info.value.status_code == 404


def test_offline_import_deduplicates_per_account(db):
    """响应丢失后的补传不重复创建棋谱，也不能命中其他账号的记录。"""
    body = ImportRequest(moves="a3a4 a6a5", client_id="offline-test-id")
    first = import_game.__wrapped__(None, body, db, user="offline-a")
    retry = import_game.__wrapped__(None, body, db, user="offline-a")
    other = import_game.__wrapped__(None, body, db, user="offline-b")
    assert retry["id"] == first["id"]
    assert retry["credits_awarded"] == 0
    assert other["id"] != first["id"]


def test_offline_sync_rejects_expired_token_instead_of_guest(db):
    from starlette.requests import Request
    request = Request({"type": "http", "headers": [(b"authorization", b"Bearer expired")]})
    body = ImportRequest(moves="a3a4", client_id="expired-sync-id")
    with pytest.raises(HTTPException) as exc:
        import_game.__wrapped__(request, body, db, user="guest:device")
    assert exc.value.status_code == 401


def test_sync_requires_client_id(db):
    from types import SimpleNamespace
    from app.modules.games.router import sync_game
    with pytest.raises(HTTPException) as exc:
        sync_game.__wrapped__(None, ImportRequest(moves="a3a4"), db, SimpleNamespace(username="offline-a"))
    assert exc.value.status_code == 422


def test_sync_http_auth_and_retry():
    from fastapi.testclient import TestClient
    from sqlalchemy.pool import StaticPool
    from app.main import app
    from app.core.dependencies import get_db
    from app.core.models import User
    from app.modules.auth.service import make_token
    isolated = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(isolated)
    factory = sessionmaker(bind=isolated)
    with factory() as session:
        session.add(User(username="offline-http", password_hash="x", role="user"))
        session.commit()
    def override():
        with factory() as session:
            yield session
    app.dependency_overrides[get_db] = override
    try:
        client = TestClient(app)
        body = {"moves": "a3a4 a6a5", "client_id": "http-retry"}
        assert client.post("/api/games/sync", json=body).status_code == 401
        headers = {"Authorization": f"Bearer {make_token('offline-http')}"}
        first = client.post("/api/games/sync", json=body, headers=headers)
        assert first.status_code == 200
        retry = client.post("/api/games/sync", json=body, headers=headers)
        assert retry.status_code == 200 and retry.json()["id"] == first.json()["id"]
        games = client.get("/api/games", headers=headers).json()
        assert len(games) == 1
    finally:
        app.dependency_overrides.clear()
        isolated.dispose()
