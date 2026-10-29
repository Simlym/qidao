"""HTTP 请求标识的边界校验。"""
from fastapi import HTTPException
from . import service


def http_request_key(request):
    try:
        return service.request_key(request.headers.get("Idempotency-Key"))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
