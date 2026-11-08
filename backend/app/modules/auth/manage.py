"""服务器用户管理：查看账号、创建账号、重置密码与调整角色。

在 backend 目录执行 python -m app.modules.auth.manage --help。
"""

from __future__ import annotations

import argparse
import sys
import warnings
from getpass import GetPassWarning, getpass

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import SessionLocal
from app.models.user import User
from .service import hash_password


def _read_password() -> str:
    # 无交互终端时拒绝回退为明文输入，避免管道或日志意外记录密码。
    with warnings.catch_warnings():
        warnings.simplefilter("error", GetPassWarning)
        try:
            password = getpass("新密码（输入不回显）：")
            if not 8 <= len(password) <= 128:
                raise ValueError("密码长度须为 8～128 位")
            if password != getpass("再次输入新密码："):
                raise ValueError("两次密码不一致，未修改账号")
        except GetPassWarning:
            raise ValueError("需要可隐藏输入的交互终端；Docker Compose 命令请勿添加 -T") from None
    return password


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="棋岛服务器用户管理（直接使用后端数据库配置）")
    commands = parser.add_subparsers(dest="command", required=True, title="管理命令")
    listing = commands.add_parser("list", help="列出用户，不显示密码哈希")
    listing.add_argument("--role", choices=("admin", "user"), help="按角色筛选")
    create = commands.add_parser("create", help="创建账号，交互输入密码")
    create.add_argument("username", help="用户名（2～40 位）")
    create.add_argument("--role", choices=("admin", "user"), default="user", help="角色，默认为普通用户")
    reset = commands.add_parser("reset-password", help="重置已有账号的密码")
    reset.add_argument("username", help="用户名")
    role = commands.add_parser("set-role", help="调整账号角色，保留至少一名管理员")
    role.add_argument("username", help="用户名")
    role.add_argument("role", choices=("admin", "user"), help="目标角色")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        # 成功时统一提交，校验失败或中断时回滚；不自动建库或执行迁移。
        with SessionLocal.begin() as db:
            if args.command == "list":
                query = select(User).order_by(User.id)
                if args.role:
                    query = query.where(User.role == args.role)
                print("编号\t用户名\t角色\t注册时间（UTC）\t最近登录（UTC）")
                for user in db.scalars(query):
                    print(f"{user.id}\t{user.username}\t{user.role}\t{user.created_at}\t{user.last_login or '从未登录'}")
                return 0

            username = args.username.strip()
            user = db.scalar(select(User).where(User.username == username))
            if args.command == "create":
                if not 2 <= len(username) <= 40:
                    raise ValueError("用户名长度须为 2～40 位")
                if username == "default" or username.startswith("guest:"):
                    raise ValueError("不能使用游客数据保留的用户名")
                if user:
                    raise ValueError("用户名已存在，请使用 reset-password 重置密码")
                db.add(User(username=username, password_hash=hash_password(_read_password()), role=args.role))
                message = f"已创建账号：{username}，角色：{args.role}"
            else:
                if user is None:
                    raise ValueError(f"用户不存在：{username}")
                if args.command == "reset-password":
                    user.password_hash = hash_password(_read_password())
                    message = f"已重置密码：{username}，可立即使用新密码登录"
                else:
                    if user.role == "admin" and args.role == "user":
                        admins = db.scalar(select(func.count()).select_from(User).where(User.role == "admin"))
                        if admins <= 1:
                            raise ValueError("不能降级最后一名管理员，请先创建或指定另一名管理员")
                    user.role = args.role
                    message = f"已调整角色：{username} → {args.role}"
        print(message)
        return 0
    except ValueError as exc:
        print(f"操作失败：{exc}", file=sys.stderr)
    except (EOFError, KeyboardInterrupt):
        print("\n操作已取消，未提交修改", file=sys.stderr)
    except SQLAlchemyError:
        # 数据库异常可能含连接信息或绑定参数，不向终端输出原始异常。
        print("数据库操作失败，未提交修改；请检查数据库连接、迁移状态或账号是否已存在", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
