"""产品运行事件目录：只记录关键结果和必要诊断，不采集请求正文。"""

from contextvars import ContextVar
import logging
import re
import time
from uuid import uuid4

CATEGORIES = {
    "auth": ("账号与安全", "注册、登录与访问拦截"),
    "games": ("对弈与棋谱", "开局、存盘、导入与删除"),
    "analysis": ("复盘分析", "任务提交、完成与失败"),
    "ai": ("AI 服务", "模型调用、生成结果与额度退回"),
    "puzzles": ("题库管理", "导入、编辑与审核"),
    "training": ("训练学习", "训练提交与教练计划"),
    "engines": ("引擎服务", "安装、检测与启用"),
    "system": ("系统运行", "启动、请求异常与服务告警"),
    "admin": ("后台管理", "账号、配置与维护操作"),
}

# 新增业务事件先登记名称和归属，页面无需维护另一套动作翻译。
EVENTS = {
    "auth.registered": ("auth", "账号注册"), "auth.login": ("auth", "账号登录"),
    "auth.login_failed": ("auth", "登录失败"), "auth.denied": ("auth", "访问被拒绝"),
    "game.started": ("games", "开始对弈"), "game.imported": ("games", "导入棋谱"),
    "game.saved": ("games", "保存棋谱"), "game.deleted": ("games", "删除棋谱"),
    "analysis.requested": ("analysis", "提交棋局复盘"), "analysis.completed": ("analysis", "棋局复盘完成"),
    "analysis.failed": ("analysis", "棋局复盘失败"),
    "ai.call": ("ai", "模型服务调用"), "ai.generated": ("ai", "AI 内容生成"),
    "ai.refunded": ("ai", "AI 生成失败，额度已退回"), "ai.declined": ("ai", "AI 生成请求未执行"),
    "training.submitted": ("training", "提交训练结果"), "training.plan": ("training", "更新教练计划"),
    "system.started": ("system", "后端服务启动"), "system.request_failed": ("system", "服务请求失败"),
    "system.rate_limited": ("system", "请求过于频繁"),
    "engine.operation": ("engines", "服务器引擎操作"),
}

ADMIN_ACTIONS = {
    "install_server_engine": ("engines", "安装或检测服务器引擎"),
    "update_user_engine": ("engines", "修改服务器引擎配置"),
    "update_llm_settings": ("ai", "修改 AI 服务设置"),
    "update_ai_policy": ("ai", "修改 AI 额度策略"), "adjust_ai_quota": ("ai", "调整用户 AI 额度"),
    "recover_ai_quota": ("ai", "恢复未结算的 AI 额度"),
    "preview_puzzle_import": ("puzzles", "预览题库导入"), "confirm_puzzle_import": ("puzzles", "确认题库导入"),
    "puzzle_status": ("puzzles", "调整题目状态"), "edit_puzzle": ("puzzles", "编辑题目"),
    "revise_puzzle": ("puzzles", "修订题目"), "review_puzzle": ("puzzles", "审核题目"),
    "delete_puzzle": ("puzzles", "归档题目"), "resolve_puzzle_report": ("puzzles", "处理题目反馈"),
    "delete_user": ("auth", "删除账号"), "update_membership": ("auth", "调整账号会员"),
    "extend_membership": ("auth", "开通或续期会员"), "cancel_membership": ("auth", "取消会员"),
    "adjust_credits": ("admin", "调整用户积分"),
}

request_context = ContextVar("product_log_request", default=None)
operation_context = ContextVar("product_log_operation", default="")
_SENSITIVE = re.compile(r"(?i)(password|passwd|authorization|api[_-]?key|secret|token)([\"']?\s*[:=]\s*[\"']?)([^\s,;\"']+)")
_SENSITIVE_KEY = re.compile(r"(?i)(password.*|passwd|authorization|api[_-]?key|secret.*|(?:access_|refresh_)?token)")


def redact(value):
    value = re.sub(r"(?i)Bearer\s+[\w.~-]+", "Bearer [已隐藏]", str(value))
    value = re.sub(r"(https?://)[^\s/@:]+:[^\s/@]+@", r"\1[已隐藏]@", value)
    value = re.sub(r"pbkdf2\$[^\s,'\")]+", "[已隐藏密码摘要]", value)
    return _SENSITIVE.sub(r"\1\2[已隐藏]", value)[:24000]


def safe_details(values):
    return {str(key): "[已隐藏]" if _SENSITIVE_KEY.fullmatch(str(key)) else redact(value) for key, value in values.items()}


def emit_event(event, *, status="success", actor="", resource="", duration_ms=None,
               operation_id="", category=None, title=None, details=None, exc_info=False):
    defined_category, defined_title = EVENTS.get(event, ("admin", "管理操作"))
    actor = "访客" if actor == "default" or actor.startswith("guest:") else actor
    logger = logging.getLogger(f"xiangqidao.{category or defined_category}")
    level = logging.ERROR if status == "failed" else logging.WARNING if status in ("warning", "rejected") else logging.INFO
    request = request_context.get() or {}
    operation = operation_id or operation_context.get() or request.get("state", {}).get("log_operation_id") or request.get("request_id", "")
    suffix = f" 编号={operation}" if operation else ""
    logger.log(level, "%s%s", title or defined_title, suffix, extra={"product_event": {
        "event": event, "category": category or defined_category, "title": title or defined_title,
        "status": status, "actor": actor, "resource": resource, "duration_ms": duration_ms,
        "operation_id": operation_id, "context": details or {},
    }}, exc_info=exc_info)


# 正常轮询、逐步走棋和连续评分不记成功日志；仅其异常进入系统事件。
REQUEST_EVENTS = (
    ("POST", r"/api/auth/register", "auth.registered"),
    ("POST", r"/api/auth/login", "auth.login"),
    ("POST", r"/api/play/new", "game.started"),
    ("POST", r"/api/games/import", "game.imported"),
    ("POST", r"/api/games/sync", "game.saved"),
    ("DELETE", r"/api/games/\d+", "game.deleted"),
    ("POST", r"/api/training/submit", "training.submitted"),
    ("POST", r"/api/coach/plan", "training.plan"),
)


def request_category(path):
    if path.startswith("/api/admin/engine"):
        return "engines"
    if "/analy" in path:
        return "analysis"
    for prefixes, category in ((('/api/auth', '/api/account'), 'auth'), (('/api/play', '/api/games', '/api/variants'), 'games'),
                               (('/api/training', '/api/coach', '/api/learning'), 'training'),
                               (('/api/admin/puzzle', '/api/puzzles'), 'puzzles'),
                               (('/api/ai', '/api/admin/ai', '/api/admin/settings/llm'), 'ai'), (('/api/admin',), 'admin')):
        if path.startswith(prefixes):
            return category
    return "system"


class ProductLogMiddleware:
    """纯 ASGI 包装，保留流式响应、断开与取消语义。"""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope.get("path", "").startswith("/api/"):
            return await self.app(scope, receive, send)
        state = scope.setdefault("state", {})
        request_id = uuid4().hex[:12]
        context = {"request_id": request_id, "state": state}
        token = request_context.set(context)
        started = time.monotonic()
        status = 500
        async def capture(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message = {**message, "headers": [*message.get("headers", []), (b"x-request-id", request_id.encode())]}
            await send(message)
        try:
            await self.app(scope, receive, capture)
        except Exception:
            emit_event("system.request_failed", status="failed", duration_ms=round((time.monotonic() - started) * 1000), exc_info=True)
            raise
        else:
            path, method = scope["path"], scope["method"]
            event = next((e for m, pattern, e in REQUEST_EVENTS if m == method and re.fullmatch(pattern, path)), None)
            if event in ("auth.registered", "auth.login") and (status < 400 or state.get("log_auth_failure_recorded")):
                event = None
            if status >= 500:
                event = "system.request_failed"
            elif status == 429:
                event = "system.rate_limited"
            elif status in (401, 403) and path.startswith("/api/admin/"):
                event = "auth.denied"
            if event:
                from app.modules.auth.service import _username_from_header
                authorization = next((v.decode("latin1") for k, v in scope.get("headers", []) if k == b"authorization"), None)
                actor = _username_from_header(authorization) or "访客"
                route = getattr(scope.get("route"), "path", "未匹配路由")
                outcome = "failed" if status >= 500 else "rejected" if status >= 400 else "success"
                emit_event(event, status=outcome, actor=actor, resource=route,
                           category=request_category(path) if status >= 500 else None,
                           duration_ms=round((time.monotonic() - started) * 1000), details={"http_status": status, "method": method})
        finally:
            request_context.reset(token)
