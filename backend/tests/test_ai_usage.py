"""真实账本与 HTTP 边界测试，不请求外部模型。"""
import sys
from pathlib import Path
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.main import app
from app.core.dependencies import get_db
from app.core.models import Base, User, CreditAccount, AIQuotaMonth, AIQuotaAccount, AIOperation, LLMCallLog
from app.core.settings import set_setting, KEY_LLM_API_KEY
from app.modules.auth.service import make_token
from app.modules.ai_usage import service as usage


@pytest.fixture()
def env():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add_all([User(username="alice", password_hash="x", role="user"),
            User(username="boss", password_hash="x", role="admin")])
        db.commit()
    def override():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = override
    try:
        yield factory, TestClient(app)
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def headers(name="alice", key=None):
    return {"Authorization": f"Bearer {make_token(name)}", **({"Idempotency-Key": key} if key else {})}


def test_training_points_do_not_grant_ai_and_pro_is_capped(env):
    factory, _ = env
    with factory() as db:
        db.add(CreditAccount(user_id="alice", balance=100000))
        set_setting(db, "ai_free_monthly_units", "0")
        set_setting(db, "ai_pro_monthly_units", "20")
        db.commit()
        assert usage.reserve(db, "alice", "coach_plan").status == "insufficient"
        user = db.scalar(select(User).where(User.username == "alice"))
        user.plan = "pro"
        user.membership_expires_at = datetime.utcnow() + timedelta(days=1)
        db.commit()
        first = usage.generate(db, "alice", "coach_plan", "coach", lambda: "计划")
        assert first.status == "succeeded"
        assert usage.reserve(db, "alice", "coach_plan").status == "insufficient"
        assert db.get(CreditAccount, "alice").balance == 100000
        assert usage.summary(db, "alice")["monthly_remaining"] == 0
        # 管理员同样受套餐额度约束。
        assert usage.generate(db, "boss", "coach_plan", "coach", lambda: "计划").status == "succeeded"
        assert usage.reserve(db, "boss", "coach_plan").status == "insufficient"


def test_reserve_retry_and_result_replay_are_idempotent(env):
    factory, _ = env
    with factory() as db:
        first = usage.reserve(db, "alice", "puzzle_explain", "puzzle:1", "key")
        assert usage.reserve(db, "alice", "puzzle_explain", "puzzle:1", "key").status == "pending"
        called = []
        assert usage.generate(db, "alice", "puzzle_explain", "puzzle:1", lambda: called.append(True), "key").status == "pending"
        assert not called
        assert usage.reserve(db, "alice", "game_report", "game:1", "key").status == "conflict"
        assert usage.settle(db, first.operation_id, "原始结果") is True
        assert usage.settle(db, first.operation_id, "重复结果") is False
        replay = usage.generate(db, "alice", "puzzle_explain", "puzzle:1", lambda: pytest.fail("不应重复调用"), "key")
        assert replay.status == "cached" and replay.text == "原始结果"
        assert usage.summary(db, "alice")["monthly_used"] == 8


def test_refunds_original_split_after_price_plan_and_month_change(env, monkeypatch):
    factory, _ = env
    clock = datetime(2026, 10, 30)
    monkeypatch.setattr(usage, "_now", lambda: clock)
    with factory() as db:
        set_setting(db, "ai_free_monthly_units", "3")
        db.commit()
        usage.adjust(db, "alice", 10, "测试", "boss")
        reservation = usage.reserve(db, "alice", "puzzle_explain", "puzzle:1")
        assert usage.summary(db, "alice")["extra_balance"] == 5
        set_setting(db, "ai_cost_puzzle_explain", "100")
        db.commit()
        clock = datetime(2026, 11, 2)
        assert usage.settle(db, reservation.operation_id) is True
        assert usage.settle(db, reservation.operation_id) is False
        assert usage.summary(db, "alice")["extra_balance"] == 10
        assert usage.summary(db, "alice")["monthly_used"] == 0
        with factory() as check:
            assert check.get(AIQuotaMonth, ("alice", "2026-10")).used_units == 0


def test_exception_empty_output_and_stale_reservation_refund(env):
    factory, _ = env
    with factory() as db:
        def fail():
            raise RuntimeError("测试失败")
        assert usage.generate(db, "alice", "coach_plan", "coach", fail).status == "refunded"
        assert usage.generate(db, "alice", "coach_plan", "coach", lambda: "   ").status == "refunded"
        reservation = usage.reserve(db, "alice", "coach_plan")
        with factory() as change:
            op = change.get(AIOperation, reservation.operation_id)
            op.created_at = datetime.utcnow() - timedelta(minutes=16)
            change.commit()
        assert usage.recover(db, "alice") == 1
        assert usage.recover(db, "alice") == 0
        assert usage.settle(db, reservation.operation_id, "迟到结果") is False
        assert usage.summary(db, "alice")["monthly_used"] == 0


def test_adjustment_idempotency_and_membership_downgrade(env):
    factory, _ = env
    with factory() as db:
        assert usage.adjust(db, "alice", 50, "补偿", "boss", "adjust-key") == 50
        assert usage.adjust(db, "alice", 50, "补偿", "boss", "adjust-key") == 50
        assert usage.summary(db, "alice")["extra_balance"] == 50
        with pytest.raises(ValueError):
            usage.adjust(db, "alice", 60, "补偿", "boss", "adjust-key")
        user = db.scalar(select(User).where(User.username == "alice"))
        user.plan, user.membership_expires_at = "pro", datetime.utcnow() + timedelta(days=1)
        db.commit()
        for _ in range(2):
            usage.generate(db, "alice", "coach_plan", "coach", lambda: "计划")
        user.plan = "free"
        db.commit()
        assert usage.summary(db, "alice")["monthly_remaining"] == 0
        assert usage.summary(db, "alice")["extra_balance"] == 50
        # 升级不会清空同月用量。
        user.plan = "pro"
        db.commit()
        assert usage.summary(db, "alice")["monthly_used"] == 40


def test_concurrent_reservations_do_not_overspend(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'quota.db'}", connect_args={"timeout": 20})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add(User(username="alice", password_hash="x", role="user"))
        db.commit()
    def worker(index):
        with factory() as db:
            return usage.reserve(db, "alice", "play_coach", "play", f"concurrent:{index}").status
    with ThreadPoolExecutor(max_workers=8) as pool:
        statuses = list(pool.map(worker, range(12)))
    assert statuses.count("reserved") == 5
    with factory() as db:
        assert usage.summary(db, "alice")["monthly_used"] == 20
    engine.dispose()


def test_usage_permissions_and_admin_policy(env):
    _, client = env
    assert client.get("/api/account/ai-usage").status_code == 401
    assert client.get("/api/admin/ai-usage/policy", headers=headers()).status_code == 403
    policy = client.get("/api/admin/ai-usage/policy", headers=headers("boss")).json()
    policy["free_monthly_units"] = 0
    assert client.put("/api/admin/ai-usage/policy", json=policy, headers=headers("boss")).status_code == 200
    me = client.get("/api/account/ai-usage", headers=headers()).json()
    assert me["monthly_limit"] == 0 and me["extra_balance"] == 0
    bad = {**policy, "costs": {"unknown": 0}}
    assert client.put("/api/admin/ai-usage/policy", json=bad, headers=headers("boss")).status_code == 422
    for _ in range(2):
        result = client.post("/api/admin/ai-usage/users/alice/adjust", json={"delta": 9, "reason": "补偿"}, headers=headers("boss", "one-grant"))
        assert result.status_code == 200 and result.json()["extra_balance"] == 9
    assert client.get("/api/admin/ai-usage/costs", headers=headers("boss")).status_code == 200


def test_real_llm_cost_logger_uses_operation_bind_and_unknown_price(env):
    from app.integrations.llm import _record_call
    factory, client = env
    with factory() as db:
        def produce():
            _record_call("coach_plan", "alice", "unpriced-model", {"prompt_tokens": 20, "completion_tokens": 5}, 10, True, "", "coach")
            return "测试结果"
        result = usage.generate(db, "alice", "coach_plan", "coach", produce)
    with factory() as db:
        log = db.scalar(select(LLMCallLog))
        assert log.operation_id == result.operation_id
        assert log.total_tokens == 25 and log.cost_known is False
    summary = client.get("/api/admin/ai-usage/costs", headers=headers("boss")).json()
    assert summary["unknown_cost_calls"] == 1 and summary["total_tokens"] == 25


def test_play_coach_replay_refund_and_insufficient(env, monkeypatch):
    factory, client = env
    monkeypatch.setattr("app.modules.play.router.coach_move", lambda *a, **k: "测试点评")
    with factory() as db:
        set_setting(db, KEY_LLM_API_KEY, "test-key")
        set_setting(db, "ai_free_monthly_units", "4")
        db.commit()
    payload = {"fen": "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1", "move": "h2e2"}
    for _ in range(2):
        result = client.post("/api/play/coach", json=payload, headers=headers(key="same-call"))
        assert result.status_code == 200 and result.json()["text"] == "测试点评"
    assert client.post("/api/play/coach", json=payload, headers=headers(key="another-call")).status_code == 402
    assert client.get("/api/account/ai-usage", headers=headers()).json()["monthly_used"] == 4


@pytest.mark.parametrize("legacy", [False, True])
def test_migration_preserves_old_points_and_matches_models(tmp_path, legacy):
    import os
    import subprocess
    from sqlalchemy import inspect, text
    path = tmp_path / "migration.db"
    engine = create_engine(f"sqlite:///{path}")
    if legacy:
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            connection.execute(CreditAccount.__table__.insert().values(user_id="legacy", balance=123, total_earned=123, checkin_streak=0, updated_at=datetime.utcnow()))
            for table in ("ai_quota_adjustments", "ai_operations", "ai_quota_months", "ai_quota_accounts"):
                connection.exec_driver_sql(f"DROP TABLE {table}")
            # 模拟尚未加入日志迁移的旧实例，验证新 revision 也会补建成本表。
            connection.exec_driver_sql("DROP TABLE llm_call_logs")
            connection.exec_driver_sql("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)")
            connection.exec_driver_sql("INSERT INTO alembic_version VALUES ('202608310003')")
    backend = Path(__file__).resolve().parents[1]
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{path}"}
    for args in (("upgrade", "head"), ("check",)):
        result = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=backend, env=env, text=True, capture_output=True)
        assert result.returncode == 0, result.stdout + result.stderr
    assert inspect(engine).has_table("ai_operations")
    if legacy:
        with engine.connect() as connection:
            assert connection.execute(text("SELECT balance FROM credit_accounts WHERE user_id='legacy'")).scalar() == 123
    engine.dispose()


def test_postgres_migration_concurrent_budget_and_idempotency():
    """可选集成测试：仅创建并清理自己的随机 schema，不修改既有表。"""
    import os
    import subprocess
    from uuid import uuid4
    from sqlalchemy import text
    from sqlalchemy.engine import make_url
    dsn = os.getenv("XIANGQIDAO_TEST_POSTGRES_URL")
    if not dsn:
        pytest.skip("未提供独立 PostgreSQL 测试连接")
    schema = "quota_test_" + uuid4().hex
    control = create_engine(dsn)
    with control.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    url = make_url(dsn).update_query_dict({"options": f"-csearch_path={schema}"})
    engine = create_engine(url)
    try:
        backend = Path(__file__).resolve().parents[1]
        for args in (("upgrade", "head"), ("check",)):
            result = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=backend,
                env={**os.environ, "DATABASE_URL": url.render_as_string(hide_password=False)}, text=True, capture_output=True)
            assert result.returncode == 0, result.stdout + result.stderr
        factory = sessionmaker(bind=engine)
        with factory() as db:
            db.add_all([User(username=name, password_hash="x", role="user") for name in ("budget", "retry")])
            db.commit()
        def run(args):
            user, key = args
            with factory() as db:
                return usage.reserve(db, user, "play_coach", "play", key).status
        with ThreadPoolExecutor(max_workers=8) as pool:
            statuses = list(pool.map(run, [("budget", f"key:{i}") for i in range(12)]))
            retries = list(pool.map(run, [("retry", "same-key")] * 12))
        assert statuses.count("reserved") == 5
        assert retries.count("reserved") == 1 and retries.count("pending") == 11
        with factory() as db:
            assert usage.summary(db, "budget")["monthly_used"] == 20
            assert usage.summary(db, "retry")["monthly_used"] == 4
    finally:
        engine.dispose()
        with control.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        control.dispose()


def test_deleting_user_clears_quota_and_late_settlement_cannot_revive_it(env):
    factory, client = env
    with factory() as db:
        usage.adjust(db, "alice", 50, "测试", "boss")
        reserved = usage.reserve(db, "alice", "play_coach", "play")
        user_id = db.scalar(select(User.id).where(User.username == "alice"))
    response = client.delete(f"/api/admin/users/{user_id}", headers=headers("boss"))
    assert response.status_code == 200
    with factory() as db:
        assert usage.settle(db, reserved.operation_id, "迟到结果") is False
        assert db.get(AIQuotaAccount, "alice") is None
        assert db.scalar(select(func.count()).select_from(AIOperation).where(AIOperation.user_id == "alice")) == 0
        db.add(User(username="alice", password_hash="new", role="user"))
        db.commit()
        restored = usage.summary(db, "alice")
        assert restored["extra_balance"] == restored["monthly_used"] == 0
