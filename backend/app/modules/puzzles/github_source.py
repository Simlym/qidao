"""只读取 GitHub 公共文件，固定实际提交并限制响应大小；不执行远程脚本。"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request

MAX_BYTES = 2 * 1024 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_public(url: str, maximum: int) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "xiangqidao-puzzle-import", "Accept": "application/json", "Accept-Encoding": "identity"})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
            raw = response.read(maximum + 1)
    except (OSError, urllib.error.URLError) as exc:
        raise ValueError("无法读取 GitHub 文件，请检查网络、仓库权限和地址后重试") from exc
    if len(raw) > maximum:
        raise ValueError("GitHub 文件过大，请拆成不超过 2 MiB 的 JSON 文件")
    return raw


def fetch_json(url: str) -> tuple[bytes, str, str]:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port or parsed.query or parsed.fragment:
        raise ValueError("请输入不带凭据、端口和查询参数的 GitHub HTTPS 文件链接")
    parts = [urllib.parse.unquote(p) for p in parsed.path.strip("/").split("/")]
    if parsed.netloc == "github.com" and len(parts) >= 5 and parts[2] == "blob":
        owner, repo, _, ref, *path = parts
    elif parsed.netloc == "raw.githubusercontent.com" and len(parts) >= 4:
        owner, repo, ref, *path = parts
    else:
        raise ValueError("仅支持 github.com/.../blob/... 或 raw.githubusercontent.com 文件链接")
    if not all(re.fullmatch(r"[A-Za-z0-9_.-]+", p) and p not in (".", "..") for p in (owner, repo, ref)):
        raise ValueError("仓库名或版本格式无效；含斜杠的分支请改用提交 SHA")
    if any(not p or p in (".", "..") or any(c in p for c in ("/", "\\", "\x00")) for p in path) or not path[-1].endswith(".json"):
        raise ValueError("请选择 JSON 文件，路径不能包含上级目录")
    if re.fullmatch(r"[0-9a-fA-F]{40}", ref):
        sha = ref.lower()
    else:
        try:
            metadata = json.loads(read_public(f"https://api.github.com/repos/{owner}/{repo}/commits/{ref}", 65536))
            sha = metadata["sha"]
        except (ValueError, KeyError, TypeError) as exc:
            raise ValueError("无法解析 GitHub 版本，请重试或使用完整提交 SHA") from exc
        if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise ValueError("GitHub 返回的提交版本无效")
    file_path = "/".join(urllib.parse.quote(p, safe="") for p in path)
    resolved = f"https://raw.githubusercontent.com/{owner}/{repo}/{sha}/{file_path}"
    return read_public(resolved, MAX_BYTES), resolved, sha
