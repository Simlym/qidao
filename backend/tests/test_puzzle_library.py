"""题库导入与发布回归：来源快照、去重、下架隔离和历史保留。"""
import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.dependencies import get_db
from app.core.models import Base, Puzzle, User, Attempt, Review, PuzzleSession, PuzzleImportBatch
from app.modules.auth.service import require_admin, make_token
from app.modules.puzzles import github_source, management, repository
from app.modules.puzzles.schemas import ImportPreview
from app.modules.puzzles.validation import validate_item
from app.core.rate_limit import limiter

FEN = "4k4/R7R/9/9/9/9/9/9/9/3K5 w"
ITEM = dict(fen=FEN, solution=["a8a9"], kind="杀法", category="双车错", difficulty=2)
LEARNER = {"Authorization": "Bearer " + make_token("learner")}


@pytest.fixture()
def env():
    limiter._storage.reset()
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread":False}, poolclass=StaticPool)
    @event.listens_for(engine,"connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False)
    with factory() as db:
        db.add(User(username="learner", password_hash="unused"))
        db.commit()
    def override():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = override
    app.dependency_overrides[require_admin] = lambda: User(username="operator", role="admin")
    try:
        yield TestClient(app), factory
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
        engine.dispose()


def preview(client, items=None, **extra):
    return client.post("/api/admin/puzzle-library/preview", json={"name":"首批", "license":"MIT", "attribution":"测试作者", "json_text":json.dumps(items or [ITEM]), **extra})


def confirm(client, batch_id):
    return client.post(f"/api/admin/puzzle-library/batches/{batch_id}/confirm")


def test_import_snapshot_draft_publish_archive_preserves_history(env):
    client, factory = env
    batch = preview(client).json()
    assert batch["report"]["ready"] == 1 and batch["source_url"] == ""
    assert batch["sample"][0]["verified"] is True
    result = confirm(client,batch["id"])
    assert result.status_code == 200 and result.json()["added_count"] == 1
    assert confirm(client,batch["id"]).json()["added_count"] == 1
    with factory() as db:
        puzzle = db.scalar(select(Puzzle))
        pid = puzzle.id
        assert puzzle.status == "draft" and repository.get_visible_puzzle(db,pid,"default") is None
    assert client.get("/api/stats/catalog",headers=LEARNER).json() == []
    assert client.post("/api/admin/puzzle-library/status",json={"batch_id":batch["id"],"status":"published"}).json()["updated"] == 1
    session = client.get(f"/api/training/puzzle/{pid}",headers=LEARNER).json()
    with factory() as db:
        db.add_all([Review(puzzle_id=pid,user_id="guest:"+"a"*32,next_review=date.today()),Attempt(puzzle_id=pid,user_id="guest:"+"a"*32,correct=True)])
        db.commit()
        assert repository.count_due(db,"guest:"+"a"*32,date.today()) == 1
    # 兼容旧删除入口：改为下架，外键启用时也不能破坏引用。
    assert client.delete(f"/api/admin/puzzles/{pid}").status_code == 200
    assert client.get(f"/api/training/puzzle/{pid}",headers=LEARNER).status_code == 404
    assert client.post("/api/training/check_move",headers=LEARNER,json={"puzzle_id":pid,"session_id":session["session_id"],"move":"a8a9","step":0}).status_code == 404
    assert client.get("/api/learning/curriculum",headers=LEARNER).json()[0]["total"] == 0
    assert client.get("/api/challenge/levels",headers=LEARNER).json() == []
    assert client.post("/api/learning/assessment/start",headers=LEARNER).status_code == 409
    with factory() as db:
        assert repository.count_due(db,"guest:"+"a"*32,date.today()) == 0
        assert repository.first_due_puzzle(db,"guest:"+"a"*32,date.today()) is None
        assert db.scalar(select(func.count()).select_from(Attempt)) == 1
        assert db.scalar(select(func.count()).select_from(Review)) == 1
        assert db.scalar(select(func.count()).select_from(PuzzleSession)) == 1


def test_duplicates_conflicts_invalid_and_private_do_not_poison_import(env):
    client, factory = env
    with factory() as db:
        db.add(Puzzle(**{**ITEM,"solution":"a8a9"},user_id="someone"))
        db.commit()
    result = preview(client,[ITEM,dict(ITEM,fen=FEN+" - - 12 34"),dict(ITEM,solution="i8i9"),dict(ITEM,solution="a0a1"),{"fen":"bad","solution":[]}]).json()
    report = result["report"]
    assert (report["ready"],report["duplicates"],report["conflicts"],report["invalid"]) == (1,1,1,2)
    assert result["sample"][0]["fen"] == FEN
    confirm(client,result["id"])
    assert preview(client).json()["report"]["duplicates"] == 1
    private = client.get("/api/admin/puzzles").json()
    assert private["total"] == 1 and private["items"][0]["user_id"] == "default"


def test_legacy_position_and_new_batch_race_are_rechecked(env):
    client, factory = env
    first, second = preview(client).json(), preview(client).json()
    assert confirm(client,first["id"]).json()["added_count"] == 1
    final = confirm(client,second["id"]).json()
    assert final["added_count"] == 0 and final["report"]["skipped_at_confirm"] == 1
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Puzzle)) == 1
        db.scalar(select(Puzzle)).content_key = None  # 模拟旧题没有指纹字段
        db.commit()
    assert preview(client).json()["report"]["duplicates"] == 1


def test_edit_draft_validates_new_answer_and_locks_used_answer(env):
    client, factory = env
    batch = preview(client).json()
    confirm(client,batch["id"])
    puzzle = client.get("/api/admin/puzzles").json()["items"][0]
    body = dict(kind="杀法",category="改名",difficulty=4,tags="先手",solution="a0a1")
    path = f"/api/admin/puzzle-library/puzzles/{puzzle['id']}"
    assert client.put(path,json=body).status_code == 400
    body["solution"] = "i8i9"
    assert client.put(path,json=body).status_code == 200
    with factory() as db:
        edited = db.get(Puzzle,puzzle["id"])
        assert edited.solution == "i8i9" and edited.category == "改名" and edited.difficulty == 4
    client.post("/api/admin/puzzle-library/status",json={"ids":[puzzle["id"]],"status":"published"})
    body["solution"] = "a8a9"
    assert client.put(path,json=body).status_code == 409
    del body["solution"]
    assert client.put(path,json=body).status_code == 200


def test_export_includes_source_and_excludes_private_data(env):
    client, factory = env
    batch = preview(client,source_url="https://github.com/test/data").json()
    confirm(client,batch["id"])
    exported = client.get("/api/admin/puzzle-library/export",params={"batch_id":batch["id"]}).json()
    assert exported["format"] == "xiangqidao-puzzles-v1"
    assert exported["sources"][0]["license"] == "MIT"
    assert exported["sources"][0]["attribution"] == "测试作者"
    assert "actor" not in exported["sources"][0]
    assert len(exported["items"]) == 1
    with factory() as db:
        private = Puzzle(fen=FEN,solution="a8a9",user_id="private")
        db.add(private); db.commit(); pid = private.id
    assert client.get("/api/admin/puzzle-library/export",params={"ids":pid}).json()["items"] == []
    assert client.post("/api/admin/puzzle-library/status",json={"ids":[pid],"status":"archived"}).status_code == 400
    assert client.delete(f"/api/admin/puzzles/{pid}").status_code == 400


def test_github_preview_resolves_and_stores_commit_snapshot(env,monkeypatch):
    client, _ = env
    calls = []
    sha = "1"*40
    def read(url, maximum):
        calls.append(url)
        return json.dumps({"sha":sha}).encode() if "api.github.com" in url else json.dumps([ITEM]).encode()
    monkeypatch.setattr(github_source,"read_public",read)
    result = preview(client,json_text="",github_url="https://github.com/test/data/blob/main/题库.json")
    assert result.status_code == 200
    data = result.json()
    assert data["source_revision"] == sha
    assert f"/{sha}/" in data["source_url"] and "%E9" in data["source_url"]
    assert len(calls) == 2
    calls.clear()
    assert confirm(client,data["id"]).status_code == 200 and not calls  # 确认不重新拉取远端可变文件


@pytest.mark.parametrize("url",[
    "http://raw.githubusercontent.com/a/b/main/a.json", "https://localhost/a.json",
    "https://github.com.evil.test/a/b/blob/main/a.json", "https://user:secret@github.com/a/b/blob/main/a.json",
    "https://github.com:443/a/b/blob/main/a.json", "https://github.com/a/b/blob/main/../a.json",
    "https://raw.githubusercontent.com/a/b/main/%2e%2e/a.json", "https://github.com/a/b/blob/main/a.js",
    "https://github.com/a/b/blob/main/a.json?token=secret",
])
def test_github_rejects_other_hosts_credentials_redirect_paths(url,monkeypatch):
    monkeypatch.setattr(github_source,"read_public",lambda *a: pytest.fail("不应访问网络"))
    with pytest.raises(ValueError):
        github_source.fetch_json(url)


def test_input_size_format_auth_and_bounds(env):
    client, _ = env
    assert preview(client,license=" ").status_code == 400
    assert preview(client,json_text="{}").status_code == 400
    assert preview(client,[ITEM]*501).status_code == 400
    assert preview(client,json_text="not json").status_code == 400
    assert client.get("/api/admin/puzzles?limit=-1").status_code == 422
    assert client.get("/api/admin/puzzles?limit=10000").status_code == 422
    app.dependency_overrides.pop(require_admin)
    assert client.get("/api/admin/puzzle-library/batches",headers={"X-Guest-ID": "a"*32}).status_code == 401
    assert client.get("/api/admin/puzzle-library/batches",headers=LEARNER).status_code == 403
    assert preview(client).status_code == 401


def test_legal_master_line_not_mislabeled_as_engine_or_forced_mate():
    opening = dict(fen="rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w",solution="h2e2,h9g7",kind="开局",verified=True)
    item = validate_item(opening)
    assert item["verified"] is False and item["steps"] == 1
    with pytest.raises(ValueError,match="非走子方"):
        validate_item(dict(ITEM,fen="9/9/5k1R1/9/9/9/9/9/7R1/4K4 w",solution="h7f7"))
    with pytest.raises(ValueError,match="不一致"):
        validate_item(dict(ITEM,side_to_move="b"))
    with pytest.raises(ValueError):
        validate_item(dict(ITEM,difficulty=True))
    with pytest.raises(ValueError):
        validate_item(dict(ITEM,solution="a8a9!"))


def test_upgrade_real_previous_schema_keeps_puzzles_and_learning_records(tmp_path):
    import subprocess
    database = tmp_path/"old-library.db"
    environment = {**os.environ,"DATABASE_URL":f"sqlite:///{database}"}
    root = Path(__file__).resolve().parents[1]
    def alembic(*args):
        result = subprocess.run([sys.executable,"-m","alembic",*args],cwd=root,env=environment,capture_output=True,text=True)
        assert result.returncode == 0,result.stdout+result.stderr
    alembic("upgrade","head")
    alembic("downgrade","202610290004")
    engine = create_engine(f"sqlite:///{database}")
    with engine.begin() as connection:
        connection.exec_driver_sql("INSERT INTO puzzles (id,variant,fen,solution,side_to_move,kind,category,difficulty,steps,source,verified,user_id,ai_explanation,tags) VALUES (1,'xiangqi',?,'a8a9','w','杀法','双车错',2,1,'legacy',1,'default','','')",(FEN,))
        connection.exec_driver_sql("INSERT INTO attempts (puzzle_id,user_id,ts,correct,time_spent_ms,wrong_move,had_retry,context) VALUES (1,'legacy',CURRENT_TIMESTAMP,1,0,'',0,'training')")
        connection.exec_driver_sql("INSERT INTO puzzles (id,variant,fen,solution,side_to_move,kind,category,difficulty,steps,source,verified,user_id,ai_explanation,tags) VALUES (2,'xiangqi','3k5/1R7/1R7/9/9/9/R8/9/4K4/9 w','b7d7','w','杀法','实用残杀',3,1,'generated',0,'default','','')")
        connection.exec_driver_sql("INSERT INTO attempts (puzzle_id,user_id,ts,correct,time_spent_ms,wrong_move,had_retry,context) VALUES (2,'legacy',CURRENT_TIMESTAMP,1,0,'',0,'training')")
    alembic("upgrade","head")
    alembic("check")
    with engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT status FROM puzzles WHERE id=1").scalar() == "published"
        assert connection.exec_driver_sql("SELECT COUNT(*) FROM attempts").scalar() == 2
        assert connection.exec_driver_sql("SELECT status FROM puzzles WHERE id=2").scalar() == "archived"
    engine.dispose()


def test_export_roundtrip_preserves_upstream_attribution(env):
    client, factory = env
    batch = preview(client).json()
    confirm(client,batch["id"])
    exported = client.get("/api/admin/puzzle-library/export",params={"batch_id":batch["id"]}).json()
    with factory() as db:
        # 独立实例会没有原题；此处只验证预览与来源保留，不删除真实记录。
        body = ImportPreview(name="再导入",license="原始署名见来源",attribution="整理者",json_text=json.dumps(exported))
        report = management.preview(db,body,"operator")
        assert json.loads(report.report_json)["upstream_sources"][0]["attribution"] == "测试作者"


def test_prepare_batches_and_legacy_loader_dedup(env):
    from app.modules.puzzles.importer.prepare import split_batches
    from app.modules.puzzles.importer.load import import_items
    _, factory = env
    source = {"license":"MIT","attribution":"测试作者"}
    batches = split_batches([ITEM]*501,source)
    assert [len(b["items"]) for b in batches] == [500,1]
    assert all(b["sources"][0] == source for b in batches)
    with factory() as db:
        db.add(Puzzle(fen=FEN,solution="a8a9",user_id="private"))
        db.commit()
        assert import_items(db,[ITEM,ITEM]) == (1,1,0)
        db.commit()
        assert import_items(db,[ITEM]) == (0,1,0)


def test_postgres_import_concurrency_and_previous_schema_upgrade():
    """独立 schema：检验真实 PostgreSQL 唯一约束、并发批次和旧版本升级。"""
    import subprocess
    from concurrent.futures import ThreadPoolExecutor
    from uuid import uuid4
    from sqlalchemy.engine import make_url
    dsn = os.getenv("XIANGQIDAO_TEST_POSTGRES_URL")
    if not dsn:
        pytest.skip("未提供独立 PostgreSQL 测试连接")
    schema = "puzzle_test_"+uuid4().hex
    control = create_engine(dsn)
    with control.begin() as connection:
        connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
    url = make_url(dsn).update_query_dict({"options":f"-csearch_path={schema}"})
    engine = create_engine(url)
    root = Path(__file__).resolve().parents[1]
    def alembic(*args):
        result = subprocess.run([sys.executable,"-m","alembic",*args],cwd=root,
            env={**os.environ,"DATABASE_URL":url.render_as_string(hide_password=False)},text=True,capture_output=True)
        assert result.returncode == 0,result.stdout+result.stderr
    try:
        alembic("upgrade","head")
        alembic("downgrade","202610290004")
        alembic("upgrade","head")
        alembic("check")
        factory = sessionmaker(bind=engine)
        body = ImportPreview(name="并发批次",license="MIT",attribution="测试作者",json_text=json.dumps([ITEM]))
        with factory() as db:
            batch_ids = [management.preview(db,body,"operator").id for _ in range(8)]
        def run(batch_id):
            with factory() as db:
                return management.confirm(db,db.get(PuzzleImportBatch,batch_id)).added_count
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(run,batch_ids))
            retries = list(pool.map(run,[batch_ids[0]]*8))
        assert sum(results) == 1 and len(set(retries)) == 1
        with factory() as db:
            assert db.scalar(select(func.count()).select_from(Puzzle)) == 1
            assert db.scalar(select(func.count()).select_from(PuzzleImportBatch).where(PuzzleImportBatch.status == "imported")) == 8
    finally:
        engine.dispose()
        with control.begin() as connection:
            connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
        control.dispose()
