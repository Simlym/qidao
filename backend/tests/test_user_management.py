"""用户管理命令：密码恢复、角色保护与失败回滚。"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core.models import Base, User
from app.modules.auth import manage
from app.modules.auth.service import hash_password, verify_password


def _database(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False)
    monkeypatch.setattr(manage, "SessionLocal", sessions)
    with sessions.begin() as db:
        db.add_all([
            User(username="管理员", role="admin", password_hash=hash_password("old-password")),
            User(username="普通用户", role="user", password_hash=hash_password("user-password")),
        ])
    return sessions


def _passwords(monkeypatch, *values):
    values = iter(values)
    monkeypatch.setattr(manage, "getpass", lambda prompt: next(values))


def test_reset_password_preserves_account(monkeypatch, capsys):
    sessions = _database(monkeypatch)
    _passwords(monkeypatch, "新密码-123456", "新密码-123456")
    with sessions() as db:
        original = db.scalar(select(User).where(User.role == "admin"))
        original_id, created_at = original.id, original.created_at
    assert manage.main(["reset-password", "管理员"]) == 0
    with sessions() as db:
        user = db.get(User, original_id)
        assert verify_password("新密码-123456", user.password_hash)
        assert not verify_password("old-password", user.password_hash)
        assert user.role == "admin"
        assert user.created_at == created_at
        other = db.scalar(select(User).where(User.username == "普通用户"))
        assert verify_password("user-password", other.password_hash)
    output = capsys.readouterr()
    assert "新密码-123456" not in output.out + output.err


@pytest.mark.parametrize("values", [("short",), ("x" * 129,), ("new-password", "different-password")])
def test_invalid_password_does_not_change_account(monkeypatch, values):
    sessions = _database(monkeypatch)
    _passwords(monkeypatch, *values)
    assert manage.main(["reset-password", "管理员"]) == 1
    with sessions() as db:
        user = db.scalar(select(User).where(User.role == "admin"))
        assert verify_password("old-password", user.password_hash)


@pytest.mark.parametrize("error", [EOFError, KeyboardInterrupt])
def test_cancel_does_not_change_account(monkeypatch, error):
    sessions = _database(monkeypatch)

    def cancel(prompt):
        raise error()

    monkeypatch.setattr(manage, "getpass", cancel)
    assert manage.main(["reset-password", "管理员"]) == 1
    with sessions() as db:
        user = db.scalar(select(User).where(User.role == "admin"))
        assert verify_password("old-password", user.password_hash)


def test_list_filters_admins_and_hides_hashes(monkeypatch, capsys):
    _database(monkeypatch)
    assert manage.main(["list", "--role", "admin"]) == 0
    output = capsys.readouterr().out
    assert "管理员" in output
    assert "普通用户" not in output
    assert "pbkdf2" not in output


def test_no_terminal_refuses_echoed_password(monkeypatch):
    import warnings
    from getpass import GetPassWarning

    sessions = _database(monkeypatch)

    def no_terminal(prompt):
        warnings.warn("无法关闭回显", GetPassWarning)
        pytest.fail("不能继续读取明文密码")

    monkeypatch.setattr(manage, "getpass", no_terminal)
    assert manage.main(["reset-password", "管理员"]) == 1
    with sessions() as db:
        user = db.scalar(select(User).where(User.role == "admin"))
        assert verify_password("old-password", user.password_hash)


def test_create_accounts_with_explicit_roles(monkeypatch):
    sessions = _database(monkeypatch)
    for username, options, role in [("new-user", [], "user"), ("new-admin", ["--role", "admin"], "admin")]:
        _passwords(monkeypatch, "new-password", "new-password")
        assert manage.main(["create", username, *options]) == 0
        with sessions() as db:
            user = db.scalar(select(User).where(User.username == username))
            assert user.role == role
            assert verify_password("new-password", user.password_hash)


@pytest.mark.parametrize("username", ["管理员", "x", "x" * 41, "default", "guest:abc"])
def test_create_rejects_duplicate_invalid_or_reserved_name(monkeypatch, username):
    sessions = _database(monkeypatch)
    _passwords(monkeypatch)  # 校验失败时不应提示输入密码。
    assert manage.main(["create", username]) == 1
    with sessions() as db:
        assert len(db.scalars(select(User)).all()) == 2


def test_missing_user_does_not_prompt_or_create(monkeypatch):
    sessions = _database(monkeypatch)
    _passwords(monkeypatch)
    assert manage.main(["reset-password", "missing"]) == 1
    assert manage.main(["set-role", "missing", "admin"]) == 1
    with sessions() as db:
        assert db.scalar(select(User).where(User.username == "missing")) is None


def test_role_changes_preserve_last_admin(monkeypatch):
    sessions = _database(monkeypatch)
    assert manage.main(["set-role", "管理员", "user"]) == 1
    with sessions() as db:
        assert db.scalar(select(User).where(User.username == "管理员")).role == "admin"
    assert manage.main(["set-role", "普通用户", "admin"]) == 0
    assert manage.main(["set-role", "管理员", "user"]) == 0
    assert manage.main(["set-role", "普通用户", "user"]) == 1
    with sessions() as db:
        assert db.scalar(select(User).where(User.username == "管理员")).role == "user"
        assert db.scalar(select(User).where(User.username == "普通用户")).role == "admin"


def test_failed_commit_returns_error_without_secrets(monkeypatch, capsys):
    from sqlalchemy import event
    from sqlalchemy.exc import IntegrityError

    sessions = _database(monkeypatch)
    _passwords(monkeypatch, "new-password", "new-password")

    def fail_commit(db):
        raise IntegrityError("敏感 SQL", {"password": "new-password"}, Exception("敏感连接信息"))

    event.listen(sessions, "before_commit", fail_commit)
    try:
        assert manage.main(["reset-password", "管理员"]) == 1
    finally:
        event.remove(sessions, "before_commit", fail_commit)
    output = capsys.readouterr()
    assert "已重置密码" not in output.out
    assert "new-password" not in output.err
    assert "敏感" not in output.err
    with sessions() as db:
        user = db.scalar(select(User).where(User.role == "admin"))
        assert verify_password("old-password", user.password_hash)
