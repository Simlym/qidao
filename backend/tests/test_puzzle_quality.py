"""反馈隔离、审核快照与题解修订的 HTTP 和数据库回归。"""
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.dependencies import get_db
from app.core.models import Base, Puzzle, PuzzleReport, PuzzleQualityReview, User, Attempt, Review, Game, GameAnalysis
from app.core.rate_limit import limiter
from app.modules.auth.service import make_token
from app.modules.puzzles import quality
from app.modules.puzzles.validation import validate_item

FEN = "4k4/R7R/9/9/9/9/9/9/9/3K5 w"
ITEM = dict(fen=FEN,solution="a8a9",kind="杀法",category="双车错",difficulty=2)
ADMIN = "operator"


def headers(user=ADMIN,key=None):
    return {"Authorization":"Bearer "+make_token(user),**({"Idempotency-Key":key} if key else {})}


@pytest.fixture()
def env():
    limiter._storage.reset()
    engine = create_engine("sqlite:///:memory:",connect_args={"check_same_thread":False},poolclass=StaticPool)
    @event.listens_for(engine,"connect")
    def foreign_keys(connection,_):
        connection.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine,autoflush=False)
    with factory() as db:
        db.add_all([User(username=name,password_hash="unused",role="admin" if name==ADMIN else "user") for name in (ADMIN,"alice","bob")])
        db.add(Puzzle(**validate_item(ITEM),status="published"))
        db.commit()
    def override():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = override
    try:
        yield TestClient(app),factory
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
        engine.dispose()


def detail(client,pid=1):
    return client.get(f"/api/admin/puzzle-library/puzzles/{pid}",headers=headers()).json()


def report(client,user="alice",key="report-one",**changes):
    return client.post("/api/puzzles/1/reports",headers=headers(user,key),json={"category":"alternative","description":"另一辆车也可以杀棋","proposed_solution":"i8i9",**changes})


def revise(client,base=1,**changes):
    p=detail(client,base)
    body={k:p[k] for k in quality.CONTENT_FIELDS}
    body.update({"reason":"补充另一条可接受杀法","expected_sha256":p["content_sha256"],"solution":"a8a9|i8i9",**changes})
    return client.post(f"/api/admin/puzzle-library/puzzles/{base}/revisions",headers=headers(),json=body)


def review(client,pid,verdict="approved",note="两条杀法均已逐手核对",key=None,**changes):
    p=detail(client,pid)
    return client.post(f"/api/admin/puzzle-library/puzzles/{pid}/reviews",headers=headers(key=key),json={"verdict":verdict,"note":note,"expected_sha256":p["content_sha256"],**changes})


def publish(client,pid):
    return client.post("/api/admin/puzzle-library/status",headers=headers(),json={"ids":[pid],"status":"published"})


def test_feedback_login_scope_dedup_and_payload_idempotency(env):
    client,factory=env
    assert client.post("/api/puzzles/1/reports",json={"category":"other","description":"题目需要核对"}).status_code==401
    first=report(client)
    assert first.status_code==200 and first.json()["status"]=="open"
    rid=first.json()["id"]
    assert report(client).json()["id"]==rid
    assert report(client,key="new-key").json()["id"]==rid
    assert report(client,description="不同内容但复用请求标识").status_code==409
    own=client.get("/api/puzzles/reports/mine",headers=headers("alice")).json()
    assert own["total"]==1 and "reporter" not in own["items"][0] and "fen" not in own["items"][0]
    assert client.get("/api/puzzles/reports/mine",headers=headers("bob")).json()["total"]==0
    assert client.get("/api/admin/puzzle-library/reports",headers=headers("bob")).status_code==403
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(PuzzleReport))==1


def test_private_unpublished_feedback_and_queue_bounds(env):
    client,factory=env
    with factory() as db:
        db.add(Puzzle(**{k:v for k,v in validate_item(ITEM).items() if k!="content_key"},user_id="alice"))
        db.get(Puzzle,1).status="draft"
        db.commit()
    assert report(client).status_code==404
    body={"category":"position","description":"局面需要核对"}
    assert client.post("/api/puzzles/2/reports",headers=headers("alice"),json=body).status_code==404
    assert client.get("/api/admin/puzzle-library/reports?limit=1000",headers=headers()).status_code==422
    assert client.get("/api/admin/puzzle-library/reports?status=unknown",headers=headers()).status_code==400


def test_resolution_user_reply_and_repeated_resolution(env):
    client,_=env
    rid=report(client).json()["id"]
    path=f"/api/admin/puzzle-library/reports/{rid}/resolve"
    body={"status":"resolved","note":"确认多解，将补充题解版本"}
    assert client.post(path,headers=headers("bob"),json=body).status_code==403
    assert client.post(path,headers=headers(),json=body).status_code==200
    assert client.post(path,headers=headers(),json=body).status_code==200
    assert client.post(path,headers=headers(),json={**body,"status":"dismissed"}).status_code==409
    mine=client.get("/api/puzzles/reports/mine",headers=headers("alice")).json()["items"][0]
    assert mine["resolution_note"]==body["note"] and mine["resolved_at"]
    assert client.get("/api/admin/puzzle-library/reports",headers=headers()).json()["open_count"]==0
    assert report(client,key="follow-up").json()["id"]!=rid


def test_deleted_reporter_anonymized_and_same_username_does_not_inherit(env):
    client,factory=env
    report(client)
    with factory() as db:
        uid=db.scalar(select(User.id).where(User.username=="alice"))
    assert client.delete(f"/api/admin/users/{uid}",headers=headers()).status_code==200
    with factory() as db:
        record=db.scalar(select(PuzzleReport))
        assert record.user_id is None and record.open_key is None
        db.add(User(username="alice",password_hash="new"))
        db.commit()
    assert client.get("/api/puzzles/reports/mine",headers=headers("alice")).json()["total"]==0
    assert report(client).status_code==200


def test_review_snapshot_stale_replay_and_rejection_archives(env):
    client,factory=env
    old=detail(client)
    assert review(client,1,expected_sha256="0"*64).status_code==409
    assert review(client,1,key="review-one").status_code==200
    assert review(client,1,key="review-one").status_code==200
    assert review(client,1,key="review-one",note="不同审核说明").status_code==409
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(PuzzleQualityReview))==1
        assert db.get(Puzzle,1).verified is True
    body={"kind":"杀法","category":"新的分类","difficulty":2,"tags":""}
    assert client.put("/api/admin/puzzle-library/puzzles/1",headers=headers(),json=body).status_code==200
    assert detail(client)["review_status"]=="pending"
    assert client.get("/api/admin/puzzle-library/puzzles/1/reviews",headers=headers()).json()[0]["current"] is False
    assert review(client,1,verdict="needs_changes",note="另一分支需要补充解释").status_code==200
    assert detail(client)["status"]=="archived"
    assert publish(client,1).status_code==409


def test_revision_publish_preserves_old_answers_attempts_review_and_game_refs(env):
    client,factory=env
    oldsession=client.get("/api/training/puzzle/1",headers=headers("alice")).json()["session_id"]
    with factory() as db:
        game=Game(user_id="alice");db.add(game);db.flush()
        db.add(GameAnalysis(game_id=game.id,move_index=0,fen_before=FEN,move_played="a8a9",puzzle_id=1))
        db.add_all([Attempt(puzzle_id=1,user_id="alice",correct=True),Review(puzzle_id=1,user_id="alice")]);db.commit()
    created=revise(client)
    assert created.status_code==200,created.text
    revision=created.json();pid=revision["id"]
    assert revision["status"]=="draft" and revision["revision_number"]==2
    assert detail(client)["status"]=="published"
    assert revise(client).json()["id"]==pid
    assert publish(client,pid).status_code==409
    assert review(client,pid).status_code==200
    assert publish(client,pid).status_code==200
    assert detail(client)["status"]=="archived" and detail(client,pid)["status"]=="published"
    assert publish(client,1).status_code==409
    assert client.get("/api/training/puzzle/1",headers=headers("alice")).status_code==404
    session=client.get(f"/api/training/puzzle/{pid}",headers=headers("alice")).json()["session_id"]
    for move in ("a8a9","i8i9"):
        if move=="i8i9": session=client.get(f"/api/training/puzzle/{pid}",headers=headers("alice")).json()["session_id"]
        result=client.post("/api/training/check_move",headers=headers("alice"),json={"puzzle_id":pid,"session_id":session,"step":0,"move":move})
        assert result.status_code==200 and result.json()["correct"] is True
    with factory() as db:
        assert db.get(Puzzle,1).solution=="a8a9" and db.get(Puzzle,1).content_key is None
        assert db.get(Puzzle,pid).content_key is not None
        assert db.scalar(select(Attempt.puzzle_id))==1
        assert db.scalar(select(Review.puzzle_id))==1
        assert db.scalar(select(GameAnalysis.puzzle_id))==1


def test_draft_revision_edit_does_not_steal_unique_key_and_invalidates_review(env):
    client,factory=env
    pid=revise(client).json()["id"]
    review(client,pid)
    body={"kind":"杀法","category":"双车错","difficulty":2,"tags":"","solution":"i8i9"}
    assert client.put(f"/api/admin/puzzle-library/puzzles/{pid}",headers=headers(),json=body).status_code==200
    assert detail(client,pid)["review_status"]=="pending"
    with factory() as db:
        assert db.get(Puzzle,pid).content_key is None and db.get(Puzzle,1).content_key
    assert publish(client,pid).status_code==409


def test_revision_noop_invalid_answers_and_cannot_modify_superseded(env):
    client,_=env
    assert revise(client,solution="a8a9").status_code==400
    assert revise(client,solution="a0a1").status_code==400
    assert revise(client,expected_sha256="0"*64).status_code==409
    pid=revise(client).json()["id"]
    assert revise(client,solution="i8i9").status_code==409
    assert client.post("/api/admin/puzzle-library/status",headers=headers(),json={"ids":[1],"status":"draft"}).status_code==200
    assert client.put("/api/admin/puzzle-library/puzzles/1",headers=headers(),json={"kind":"杀法","category":"双车错","difficulty":2,"tags":"","solution":"i8i9"}).status_code==409
    assert len(client.get(f"/api/admin/puzzle-library/puzzles/{pid}/versions",headers=headers()).json())==2


def test_batch_archive_affects_every_version_and_old_versions_cannot_publish(env):
    client,factory=env
    pid=revise(client).json()["id"]
    response=client.post("/api/admin/puzzle-library/status",headers=headers(),json={"ids":[1,pid],"status":"archived"})
    assert response.json()["updated"]==2
    assert detail(client)["status"]==detail(client,pid)["status"]=="archived"
    assert publish(client,1).status_code==409


def test_publish_revision_rolls_back_if_same_position_owned_by_other_question(env):
    client,factory=env
    pid=revise(client).json()["id"]
    review(client,pid)
    with factory() as db:
        db.add(Puzzle(**{k:v for k,v in validate_item(ITEM).items() if k!="content_key"},status="draft"));db.commit()
    assert publish(client,pid).status_code==409
    assert detail(client)["status"]=="published" and detail(client,pid)["status"]=="draft"


def test_real_previous_schema_upgrade_and_data_preserved(tmp_path):
    import subprocess
    path=tmp_path/"quality-migration.db"
    backend=Path(__file__).resolve().parents[1]
    environment={**os.environ,"DATABASE_URL":f"sqlite:///{path}"}
    def alembic(*args):
        result=subprocess.run([sys.executable,"-m","alembic",*args],cwd=backend,env=environment,capture_output=True,text=True,timeout=30)
        assert result.returncode==0,result.stdout+result.stderr
    alembic("upgrade","head")
    alembic("downgrade","202610290005")
    engine=create_engine(f"sqlite:///{path}")
    with engine.begin() as connection:
        connection.exec_driver_sql("INSERT INTO puzzles (id,variant,fen,solution,side_to_move,kind,category,difficulty,steps,source,verified,user_id,ai_explanation,tags,status) VALUES (1,'xiangqi',?,'a8a9','w','杀法','双车错',2,1,'test',1,'default','','','published')",(FEN,))
    alembic("upgrade","head")
    alembic("check")
    with engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT revision_number,review_status,status FROM puzzles WHERE id=1").one()==(1,"pending","published")
    engine.dispose()


def test_reviewed_content_requires_new_approval_after_edit(env):
    client,_=env
    assert review(client,1).status_code==200
    body={"kind":"杀法","category":"更新教学分类","difficulty":2,"tags":"子力配合"}
    assert client.put("/api/admin/puzzle-library/puzzles/1",headers=headers(),json=body).status_code==200
    assert publish(client,1).status_code==409
    assert review(client,1).status_code==200
    assert publish(client,1).status_code==200


def test_postgres_revision_and_review_concurrency():
    import subprocess
    from concurrent.futures import ThreadPoolExecutor
    from uuid import uuid4
    from sqlalchemy.engine import make_url
    from app.modules.puzzles.schemas import PuzzleRevisionBody,QualityReviewBody
    dsn=os.getenv("XIANGQIDAO_TEST_POSTGRES_URL")
    if not dsn:
        pytest.skip("未提供独立 PostgreSQL 测试连接")
    schema="quality_test_"+uuid4().hex
    control=create_engine(dsn)
    with control.begin() as connection:
        connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
    url=make_url(dsn).update_query_dict({"options":f"-csearch_path={schema}"})
    engine=create_engine(url)
    backend=Path(__file__).resolve().parents[1]
    try:
        for args in (("upgrade","head"),("downgrade","202610290005"),("upgrade","head"),("check",)):
            result=subprocess.run([sys.executable,"-m","alembic",*args],cwd=backend,
                env={**os.environ,"DATABASE_URL":url.render_as_string(hide_password=False)},text=True,capture_output=True,timeout=30)
            assert result.returncode==0,result.stdout+result.stderr
        factory=sessionmaker(bind=engine,autoflush=False)
        with factory() as db:
            p=Puzzle(**validate_item(ITEM),status="published");db.add(p);db.commit()
            pid=p.id
            body=PuzzleRevisionBody(**{**{key:getattr(p,key) for key in quality.CONTENT_FIELDS},"solution":"a8a9|i8i9","reason":"并发补充另一条杀法","expected_sha256":quality.fingerprint(p)})
        def create(_):
            with factory() as db:
                return quality.create_revision(db,pid,body,"operator").id
        with ThreadPoolExecutor(max_workers=8) as pool:
            ids=list(pool.map(create,range(8)))
        assert len(set(ids))==1
        rid=ids[0]
        with factory() as db:
            approved=QualityReviewBody(verdict="approved",note="所有分支均已逐手核对",expected_sha256=quality.fingerprint(db.get(Puzzle,rid)))
        def audit(_):
            with factory() as db:
                return quality.record_review(db,rid,approved,"operator","same-review").id
        with ThreadPoolExecutor(max_workers=8) as pool:
            reviews=list(pool.map(audit,range(8)))
        assert len(set(reviews))==1
        with factory() as db:
            quality.set_status(db,[db.get(Puzzle,rid)],"published")
            assert db.get(Puzzle,pid).status=="archived"
        rejected=approved.model_copy(update={"verdict":"needs_changes","note":"发现应手需要再次核对"})
        def race(task):
            with factory() as db:
                if task=="reject":
                    quality.record_review(db,rid,rejected,"operator","reject-review")
                    return "rejected"
                try:
                    quality.set_status(db,[db.get(Puzzle,rid)],"published")
                    return "published"
                except quality.QualityError:
                    return "blocked"
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(race,["reject","publish"]))
        with factory() as db:
            assert db.get(Puzzle,rid).status=="archived"
            assert db.get(Puzzle,rid).review_status=="needs_changes"
            assert db.scalar(select(func.count()).select_from(Puzzle))==2
    finally:
        engine.dispose()
        with control.begin() as connection:
            connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
        control.dispose()


def test_revision_chain_can_restore_old_answer_as_new_version(env):
    client,_=env
    second=revise(client).json()["id"]
    assert review(client,second).status_code==200
    assert publish(client,second).status_code==200
    third=revise(client,base=second,solution="a8a9",reason="恢复已核对的原先教学主线").json()["id"]
    assert review(client,third).status_code==200
    assert publish(client,third).status_code==200
    versions=client.get(f"/api/admin/puzzle-library/puzzles/{third}/versions",headers=headers()).json()
    assert [p["revision_number"] for p in versions]==[1,2,3]
    assert [p["status"] for p in versions]==["archived","archived","published"]
    assert detail(client,third)["solution"]=="a8a9"


def test_batch_publish_skips_invalid_superseded_original(env):
    from app.core.models import PuzzleImportBatch
    from uuid import uuid4
    client,factory=env
    batch_id=str(uuid4())
    with factory() as db:
        db.add(PuzzleImportBatch(id=batch_id,name="历史生成题",actor="operator",license="自编",attribution="测试数据",content_sha256="0"*64))
        db.flush()
        p=db.get(Puzzle,1)
        p.fen="3k5/1R7/1R7/9/9/9/R8/9/4K4/9 w"
        p.source,p.status,p.content_key,p.import_batch_id="generated","archived",None,batch_id
        db.commit()
    revised=revise(client,fen=FEN,reason="修正历史三辆红车的非法局面")
    assert revised.status_code==200,revised.text
    pid=revised.json()["id"]
    assert review(client,pid).status_code==200
    response=client.post("/api/admin/puzzle-library/status",headers=headers(),json={"batch_id":batch_id,"status":"published"})
    assert response.status_code==200 and response.json()["updated"]==1
    assert detail(client)["status"]=="archived" and detail(client,pid)["status"]=="published"
