"""测试鉴权与管理员后台。"""

import os
import tempfile

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    # 用独立的临时数据库，避免污染开发库
    tmp = tempfile.mkdtemp()
    db_path = os.path.join(tmp, "test.db")
    monkeypatch.setenv("SECRET_KEY", "test-secret")

    from app.core import models
    import app.core.dependencies as deps
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    eng = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(bind=eng, autoflush=False)
    models.Base.metadata.create_all(eng)

    # 用 setattr，测试结束后自动还原，避免污染其它测试
    monkeypatch.setattr(models, "engine", eng)
    monkeypatch.setattr(models, "SessionLocal", SessionLocal)
    monkeypatch.setattr(deps, "SessionLocal", SessionLocal)

    from app.main import app
    from app.core.rate_limit import limiter
    limiter._storage.reset()
    return TestClient(app)


def test_first_user_is_admin(client):
    r = client.post("/api/auth/register", json={"username": "alice", "password": "password1"})
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_second_user_is_normal(client):
    client.post("/api/auth/register", json={"username": "alice", "password": "password1"})
    r = client.post("/api/auth/register", json={"username": "bob", "password": "password2"})
    assert r.status_code == 200
    assert r.json()["role"] == "user"


def test_login_and_me(client):
    client.post("/api/auth/register", json={"username": "alice", "password": "password1"})
    r = client.post("/api/auth/login", json={"username": "alice", "password": "password1"})
    token = r.json()["token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "alice"


def test_wrong_password_rejected(client):
    client.post("/api/auth/register", json={"username": "alice", "password": "password1"})
    r = client.post("/api/auth/login", json={"username": "alice", "password": "nope"})
    assert r.status_code == 401


def test_admin_required(client):
    client.post("/api/auth/register", json={"username": "alice", "password": "password1"})  # admin
    bob = client.post("/api/auth/register", json={"username": "bob", "password": "password2"})
    token = bob.json()["token"]
    r = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_admin_can_list_and_create_puzzle(client):
    a = client.post("/api/auth/register", json={"username": "alice", "password": "password1"})
    token = a.json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    # 列用户
    assert client.get("/api/admin/users", headers=h).status_code == 200
    # 新增一道合法一步杀
    r = client.post("/api/admin/puzzles", headers=h, json={
        "fen": "4k4/R8/8R/9/9/9/9/9/9/3K5", "solution": "i7i9",
        "category": "双车错", "difficulty": 1,
    })
    assert r.status_code == 200
    assert r.json()["verified"] is True
    # 非杀法应被拒
    bad = client.post("/api/admin/puzzles", headers=h, json={
        "fen": "4k4/9/9/9/9/9/9/9/9/3KR4", "solution": "e1e2", "category": "x",
    })
    assert bad.status_code == 400


def test_admin_can_configure_jieqi_engine(client, tmp_path):
    admin = client.post("/api/auth/register", json={"username": "alice", "password": "password1"})
    headers = {"Authorization": f"Bearer {admin.json()['token']}"}
    engine = tmp_path / "jieqi-uci-engine"
    engine.write_bytes(b"test executable placeholder")

    saved = client.put(
        "/api/admin/engine/jieqi",
        headers=headers,
        json={"path": str(engine)},
    )
    assert saved.status_code == 200
    assert saved.json()["configured_path"] == str(engine)
    assert saved.json()["available"] is True

    cleared = client.put("/api/admin/engine/jieqi", headers=headers, json={"path": ""})
    assert cleared.status_code == 200
    assert cleared.json()["configured_path"] == ""


def test_jieqi_engine_path_must_exist(client, tmp_path):
    admin = client.post("/api/auth/register", json={"username": "alice", "password": "password1"})
    headers = {"Authorization": f"Bearer {admin.json()['token']}"}
    missing = tmp_path / "missing-uci-engine"
    response = client.put(
        "/api/admin/engine/jieqi",
        headers=headers,
        json={"path": str(missing)},
    )
    assert response.status_code == 400
    assert "找不到" in response.json()["detail"]


def test_admin_can_configure_xiangqi_engine(client, tmp_path):
    admin = client.post("/api/auth/register", json={"username": "alice", "password": "password1"})
    headers = {"Authorization": f"Bearer {admin.json()['token']}"}
    engine = tmp_path / "xiangqi-uci-engine"
    engine.write_bytes(b"test executable placeholder")

    saved = client.put("/api/admin/engine/xiangqi", headers=headers, json={"path": str(engine)})
    assert saved.status_code == 200
    assert saved.json()["configured_path"] == str(engine)
    assert saved.json()["variant"] == "xiangqi"
    assert saved.json()["available"] is True


def test_server_engine_online_install_requires_admin(client, monkeypatch):
    from app.engine import installer

    calls = []
    monkeypatch.setattr(installer, "start_installation", lambda variant: calls.append(variant))
    assert client.post("/api/admin/engine/xiangqi/install").status_code == 401
    client.post("/api/auth/register", json={"username": "alice", "password": "password1"})
    user = client.post("/api/auth/register", json={"username": "bob", "password": "password2"}).json()
    response = client.post("/api/admin/engine/xiangqi/install", headers={"Authorization": f"Bearer {user['token']}"})
    assert response.status_code == 403
    assert not calls


def test_runtime_logs_require_admin_and_include_engine_failure(client):
    import logging
    from app.core import log_config

    assert client.get("/api/admin/logs/runtime").status_code == 401
    admin = client.post("/api/auth/register", json={"username": "alice", "password": "password1"}).json()
    user = client.post("/api/auth/register", json={"username": "bob", "password": "password2"}).json()
    assert client.get("/api/admin/logs/runtime", headers={"Authorization": f"Bearer {user['token']}"}).status_code == 403
    log_config.setup_buffer()
    logger = logging.getLogger("xiangqidao.engine.installation")
    logger.warning("安装诊断测试 编号=runtime-log-test")
    headers = {"Authorization": f"Bearer {admin['token']}"}
    response = client.get("/api/admin/logs/runtime", headers=headers)
    assert response.status_code == 200
    record = next(row for row in response.json() if "runtime-log-test" in row["message"])
    assert record["logger"] == "xiangqidao.engine.installation"
    newer = client.get(f"/api/admin/logs/runtime?after_seq={record['seq']}", headers=headers)
    assert all(row["seq"] > record["seq"] for row in newer.json())


def test_admin_starts_install_and_reads_progress(client, monkeypatch, tmp_path):
    from app.engine import installer

    monkeypatch.setenv("ENGINE_INSTALL_DIR", str(tmp_path / "managed"))
    monkeypatch.setattr(installer, "platform_info", lambda: {"os": "linux", "arch": "x86_64"})
    monkeypatch.setattr(installer.platform, "libc_ver", lambda: ("glibc", "2.41"))
    calls = []

    def start(variant):
        calls.append(variant)
        return {"phase": "downloading", "received": 0, "total": 100}

    monkeypatch.setattr(installer, "start_installation", start)
    admin = client.post("/api/auth/register", json={"username": "alice", "password": "password1"}).json()
    headers = {"Authorization": f"Bearer {admin['token']}"}
    response = client.post("/api/admin/engine/xiangqi/install", headers=headers)
    assert response.status_code == 202
    assert calls == ["xiangqi"]
    assert response.json()["phase"] == "downloading"
    status = client.get("/api/admin/engine/xiangqi", headers=headers).json()
    assert status["online_package"]["supported"] is True
    assert status["installation"]["phase"] == "idle"
    assert client.post("/api/admin/engine/unknown/install", headers=headers).status_code == 404


def test_install_lock_prevents_manual_config_change(client, monkeypatch, tmp_path):
    from app.engine import installer

    monkeypatch.setenv("ENGINE_INSTALL_DIR", str(tmp_path / "managed"))
    admin = client.post("/api/auth/register", json={"username": "alice", "password": "password1"}).json()
    headers = {"Authorization": f"Bearer {admin['token']}"}
    handle = installer.acquire_lock()
    try:
        response = client.put("/api/admin/engine/xiangqi", headers=headers, json={"path": ""})
        assert response.status_code == 409
    finally:
        handle.close()


def test_per_user_data_isolation(client):
    a = client.post("/api/auth/register", json={"username": "alice", "password": "password1"})
    ta = a.json()["token"]
    # alice 取一题并作答
    nxt = client.get("/api/training/next", headers={"Authorization": f"Bearer {ta}"}).json()
    if nxt["puzzle"]:
        client.post("/api/training/submit",
                    headers={"Authorization": f"Bearer {ta}"},
                    json={"puzzle_id": nxt["puzzle"]["id"], "self_rating": "good"})
    ov_a = client.get("/api/stats/overview", headers={"Authorization": f"Bearer {ta}"}).json()
    b = client.post("/api/auth/register", json={"username": "bob", "password": "password2"})
    tb = b.json()["token"]
    ov_b = client.get("/api/stats/overview", headers={"Authorization": f"Bearer {tb}"}).json()
    # bob 没有作答记录，learned 为 0，与 alice 隔离
    assert ov_b["learned"] == 0
