"""产品事件归类、隐私边界与常用请求的取舍。"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI, Response
from fastapi.testclient import TestClient
from app.core import log_config
from app.core.product_log import ProductLogMiddleware, emit_event, operation_context, redact
from app.modules.auth.service import make_token


def test_business_event_keeps_result_and_operation_but_masks_credentials():
    log_config.setup_buffer()
    token = operation_context.set("operation-test")
    try:
        emit_event("ai.call", status="warning", actor="alice", resource="game_report",
                   details={"diagnostic": "api_key=super-secret Authorization: Bearer abc.def.ghi", "password": "never-show-this", "total_tokens": 42})
    finally:
        operation_context.reset(token)
    row = log_config.get_records()[-1]
    assert row["category"] == "ai" and row["status"] == "warning"
    assert row["operation_id"] == "operation-test"
    assert row["actor"] == "alice"
    assert "super-secret" not in json.dumps(row)
    assert "abc.def.ghi" not in json.dumps(row)
    assert "never-show-this" not in json.dumps(row)
    assert row["context"]["total_tokens"] == "42"
    assert operation_context.get() == ""


def test_common_requests_are_logged_without_bodies_tokens_or_polling_noise():
    log_config.setup_buffer()
    app = FastAPI()
    app.add_middleware(ProductLogMiddleware)
    @app.post("/api/play/new")
    def start():
        return {"ok": True}
    @app.post("/api/play/move")
    def move():
        return {"ok": True}
    @app.get("/api/health")
    def health():
        return {"ok": True}
    before = log_config.get_records()[-1]["seq"] if log_config.get_records() else 0
    client = TestClient(app)
    secret_token = make_token("alice")
    response = client.post("/api/play/new?key=private-query", headers={"Authorization": f"Bearer {secret_token}"}, json={"password": "private-password", "fen": "hidden-identities"})
    assert response.headers["x-request-id"]
    client.post("/api/play/move")
    client.get("/api/health")
    rows = log_config.get_records(before)
    assert len(rows) == 1 and rows[0]["event"] == "game.started"
    assert rows[0]["actor"] == "alice"
    assert rows[0]["category"] == "games"
    serialized = json.dumps(rows)
    assert all(value not in serialized for value in (secret_token, "private-query", "private-password", "hidden-identities"))


def test_failing_high_frequency_requests_remain_visible_in_their_business_area():
    log_config.setup_buffer()
    app = FastAPI()
    app.add_middleware(ProductLogMiddleware)
    @app.post("/api/play/move")
    def unavailable():
        return Response(status_code=503)
    response = TestClient(app).post("/api/play/move")
    assert response.status_code == 503
    row = log_config.get_records()[-1]
    assert row["status"] == "failed" and row["category"] == "games"
    assert row["context"]["http_status"] == "503"


def test_password_hashes_are_not_exposed_in_exception_text():
    assert "saltvalue" not in redact("parameters=('alice','pbkdf2$120000$saltvalue$hashvalue')")
