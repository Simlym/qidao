"""服务器安装与 PC 共用安装器的边界：鉴权、失败保留配置、成功启用和互斥。"""
import os
import sys
import asyncio
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_db
from app.core.models import Base
from app.core.settings import set_setting, get_setting, KEY_XIANGQI_ENGINE_PATH
from app.modules.auth.service import require_admin
from app.modules.admin import engine_router as routes
from app.engine import installation


def client_database(monkeypatch, tmp_path):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    with sessions() as db:
        set_setting(db, KEY_XIANGQI_ENGINE_PATH, "/old/engine")
        db.commit()
    app = FastAPI()
    app.include_router(routes.router)
    def database():
        with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = database
    app.dependency_overrides[require_admin] = lambda: SimpleNamespace(username="管理员")
    monkeypatch.setenv("ENGINE_INSTALL_DIR", str(tmp_path))
    monkeypatch.setattr(routes, "profile_status", lambda variant: {"variant": variant})
    monkeypatch.setattr(routes, "reset_shared_engine", lambda: None)
    return TestClient(app), sessions


def test_failed_installation_preserves_original_path(monkeypatch, tmp_path):
    client, sessions = client_database(monkeypatch, tmp_path)
    async def events(*args):
        yield {"type": "error", "data": {"message": "校验失败"}}
    monkeypatch.setattr(installation, "events", events)
    response = client.post("/api/admin/engine/xiangqi/installation", json={"package_id": "fixed"})
    assert "校验失败" in response.text
    with sessions() as db:
        assert get_setting(db, KEY_XIANGQI_ENGINE_PATH) == "/old/engine"
    installation.acquire_lock().close()


def test_installs_only_after_successful_process_exit(monkeypatch, tmp_path):
    client, sessions = client_database(monkeypatch, tmp_path)
    async def events(*args):
        yield {"type": "progress", "data": {"phase": "testing"}}
        yield {"type": "result", "data": {"enginePath": "/new/engine"}}
        with sessions() as db:
            assert get_setting(db, KEY_XIANGQI_ENGINE_PATH) == "/old/engine"
    monkeypatch.setattr(installation, "events", events)
    response = client.post("/api/admin/engine/xiangqi/installation", json={"package_id": "fixed"})
    assert '"type": "complete"' in response.text
    with sessions() as db:
        assert get_setting(db, KEY_XIANGQI_ENGINE_PATH) == "/new/engine"


def test_abnormal_exit_after_result_does_not_activate(monkeypatch, tmp_path):
    client, sessions = client_database(monkeypatch, tmp_path)
    async def events(*args):
        yield {"type": "result", "data": {"enginePath": "/new/engine"}}
        raise ValueError("进程异常退出")
    monkeypatch.setattr(installation, "events", events)
    assert "进程异常退出" in client.post("/api/admin/engine/xiangqi/installation", json={}).text
    with sessions() as db:
        assert get_setting(db, KEY_XIANGQI_ENGINE_PATH) == "/old/engine"


def test_parallel_installations_rejected(monkeypatch, tmp_path):
    client, _ = client_database(monkeypatch, tmp_path)
    with installation.acquire_lock():
        assert client.post("/api/admin/engine/xiangqi/installation", json={}).status_code == 409


def test_installation_requires_admin():
    app = FastAPI()
    app.include_router(routes.router)
    client = TestClient(app)
    assert client.get("/api/admin/engine/xiangqi/installation").status_code in (401, 403)
    assert client.post("/api/admin/engine/xiangqi/installation", json={}).status_code in (401, 403)


def test_disconnected_stream_closes_installer_and_preserves_path(monkeypatch, tmp_path):
    _, sessions = client_database(monkeypatch, tmp_path)
    closed = []
    async def events(*args):
        try:
            yield {"type": "progress", "data": {"phase": "downloading"}}
            yield {"type": "result", "data": {"enginePath": "/new/engine"}}
        finally:
            closed.append(True)
    monkeypatch.setattr(installation, "events", events)
    async def disconnect():
        with sessions() as db:
            response = routes.manage_installation("xiangqi", routes.EngineInstallRequest(),
                                                 None, SimpleNamespace(username="管理员"), db)
            await anext(response.body_iterator)
            await response.body_iterator.aclose()
            assert get_setting(db, KEY_XIANGQI_ENGINE_PATH) == "/old/engine"
    asyncio.run(disconnect())
    assert closed == [True]
    installation.acquire_lock().close()
