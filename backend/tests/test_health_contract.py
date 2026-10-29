"""客户端连接检测依赖的最小公开协议。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from app.main import app


def test_health_identifies_service_and_api_without_auth():
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok", "service": "xiangqidao", "api_version": 1, "version": app.version,
    }
