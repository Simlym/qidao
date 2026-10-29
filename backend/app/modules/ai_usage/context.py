"""把一次已预留的业务调用关联到实际模型成本日志。"""
from contextvars import ContextVar

# (operation_id, SQLAlchemy bind)，每个线程/异步上下文独立。
current_operation: ContextVar[tuple | None] = ContextVar("ai_operation", default=None)
