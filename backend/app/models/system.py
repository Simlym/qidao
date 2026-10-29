"""system 领域的 SQLAlchemy 表定义（共享 app.core.database.Base）。"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    false,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class SecurityLog(Base):
    """安全审计日志：登录失败与管理员敏感操作，落库供后台查看。

    刻意只记录「谁、何时、从哪、做了什么」，绝不写入密码、token、API key 等敏感值。
    """

    __tablename__ = "security_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    level: Mapped[str] = mapped_column(String(10), default="info")   # info / warning
    event: Mapped[str] = mapped_column(String(40), index=True)       # login_failed / admin_action
    ip: Mapped[str] = mapped_column(String(45), default="-")
    actor: Mapped[str] = mapped_column(String(40), default="")       # 操作者 / 尝试登录的用户名
    action: Mapped[str] = mapped_column(String(40), default="")      # admin_action 的具体动作
    target: Mapped[str] = mapped_column(String(120), default="")


class AppSetting(Base):
    """运行时全局配置（键值对），供管理员在后台修改而无需重启或改环境变量。

    用于 AI 复盘的协议、服务地址、模型、开关与密钥；DB 中的值优先于环境变量。
    """

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
