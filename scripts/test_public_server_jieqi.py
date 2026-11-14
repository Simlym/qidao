"""经管理员 API 匿名下载当前平台揭棋包，验证启用、重验与篡改拒绝。"""

import json
import os
import platform
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def main():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.core import models
    from app.core.dependencies import get_db
    from app.core.settings import KEY_JIEQI_ENGINE_PATH, KEY_XIANGQI_ENGINE_PATH, get_setting, set_setting
    from app.engine.jieqi import get_shared_jieqi_engine, reset_shared_jieqi_engine
    from app.modules.admin.engine_router import router
    from app.modules.auth.service import require_admin
    from build_engines import FENS

    database = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(database)
    sessions = sessionmaker(bind=database)
    previous_sessions = models.SessionLocal
    previous_root = os.environ.get("ENGINE_INSTALL_DIR")
    models.SessionLocal = sessions

    def get_session():
        with sessions() as db:
            yield db

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = get_session
    app.dependency_overrides[require_admin] = lambda: SimpleNamespace(username="服务器安装验收")

    try:
        with tempfile.TemporaryDirectory(prefix="qidao-public-jieqi-") as temporary:
            os.environ["ENGINE_INSTALL_DIR"] = temporary
            with sessions() as db:
                set_setting(db, KEY_XIANGQI_ENGINE_PATH, "/preserved/xiangqi-engine")
                db.commit()
            with TestClient(app) as client:
                response = client.get("/api/admin/engine/jieqi/installation")
                response.raise_for_status()
                info = response.json()
                assert info["installer_available"], info
                system = "windows" if platform.system() == "Windows" else "linux"
                package = next(p for p in info["packages"] if p.get("os", "windows") == system and p["publicDownload"])

                def operation(action):
                    result = client.post("/api/admin/engine/jieqi/installation", json={"action": action, "package_id": package["id"]})
                    result.raise_for_status()
                    return [json.loads(line) for line in result.text.splitlines() if line.strip()]

                events = operation("download")
                assert any(e["type"] == "progress" and e["data"].get("downloaded", 0) > 0 for e in events), events
                assert events[-1]["type"] == "complete", events
                path = Path(events[-1]["data"]["effective_path"])
                assert path.is_file() and os.access(path, os.X_OK)
                assert not list(path.parent.glob("*.nnue")), "传统评估揭棋包不应依赖象棋权重"
                with sessions() as db:
                    assert get_setting(db, KEY_JIEQI_ENGINE_PATH) == str(path)
                    assert get_setting(db, KEY_XIANGQI_ENGINE_PATH) == "/preserved/xiangqi-engine"

                engine = get_shared_jieqi_engine()
                assert engine is not None
                for turn, expected in (("w", "g3g4"), ("b", "g6g5")):
                    engine.new_game()
                    fen = FENS["jieqi"].replace(" w ", f" {turn} ")
                    result = engine.analyze(fen, depth=2, search_moves=[expected])
                    assert result.best_move == expected, result
                reset_shared_jieqi_engine()

                verified = operation("verify")
                assert verified[-1]["type"] == "complete", verified
                path.write_bytes(b"tampered")
                rejected = operation("verify")
                assert rejected[-1]["type"] == "error", rejected
                with sessions() as db:
                    assert get_setting(db, KEY_JIEQI_ENGINE_PATH) == str(path)
                    assert get_setting(db, KEY_XIANGQI_ENGINE_PATH) == "/preserved/xiangqi-engine"
                print(json.dumps({"status": "passed", "package": package["id"],
                                  "checks": ["管理员API匿名在线下载", "校验安装及自动启用", "无权重红黑限知局面试算", "安装重验", "篡改拒绝", "双棋种配置隔离"]}, ensure_ascii=False))
    finally:
        reset_shared_jieqi_engine()
        models.SessionLocal = previous_sessions
        if previous_root is None:
            os.environ.pop("ENGINE_INSTALL_DIR", None)
        else:
            os.environ["ENGINE_INSTALL_DIR"] = previous_root
        database.dispose()


if __name__ == "__main__":
    main()
