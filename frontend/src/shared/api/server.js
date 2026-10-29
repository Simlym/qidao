import { defaultApiBase, runtime } from "../../platform/runtime.js";

export const SERVER_STORAGE_KEY = "xq_server_api_v1";
export const API_VERSION = 1;
const origin = globalThis.location?.href || "http://localhost/";

export function normalizeServerAddress(value, { allowHttp = false } = {}) {
  let url;
  try { url = new URL(value.trim().replace(/\/+$/, "")); } catch {
    throw new Error("请输入完整服务器地址，例如 https://chess.example.com/api");
  }
  if (!(url.protocol === "https:" || (allowHttp && url.protocol === "http:"))
      || url.username || url.password || url.search || url.hash
      || !url.pathname.endsWith("/api")) {
    throw new Error("服务器地址须使用 HTTPS、以 /api 结尾，且不包含账号、查询参数或片段。HTTP 仅限开发调试。");
  }
  return url.href;
}

const configured = (import.meta.env?.VITE_API_BASE_URL || defaultApiBase(runtime)).trim().replace(/\/+$/, "");
export const DEFAULT_API_BASE_URL = new URL(configured || defaultApiBase(runtime), origin).href;
export const allowHttpServer = Boolean(import.meta.env?.DEV);

function readServer() {
  try {
    const saved = globalThis.localStorage?.getItem(SERVER_STORAGE_KEY);
    return saved ? normalizeServerAddress(saved, { allowHttp: allowHttpServer }) : DEFAULT_API_BASE_URL;
  } catch { return DEFAULT_API_BASE_URL; }
}

// 每个页面生命周期固定连接；切换必须重新加载，防止旧回调使用新服务器的凭据。
export const API_BASE_URL = readServer();
export const SERVER_ID = API_BASE_URL;
export const connectionController = new AbortController();

export function saveServerAddress(value) {
  const next = value === DEFAULT_API_BASE_URL
    ? DEFAULT_API_BASE_URL : normalizeServerAddress(value, { allowHttp: allowHttpServer });
  if (next === DEFAULT_API_BASE_URL) localStorage.removeItem(SERVER_STORAGE_KEY);
  else localStorage.setItem(SERVER_STORAGE_KEY, next);
  connectionController.abort();
}

export function reloadForServerChange() {
  connectionController.abort();
  globalThis.location.reload();
}

// 多个标签页共用同一设备设置，变化时同步终止旧请求并重载。
globalThis.addEventListener?.("storage", (event) => {
  if (event.key === SERVER_STORAGE_KEY || event.key === null) reloadForServerChange();
});

export async function withApiConnection(run, callerSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const signals = [connectionController.signal, callerSignal].filter(Boolean);
  for (const signal of signals) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abort, { once: true });
  }
  try {
    controller.signal.throwIfAborted();
    const result = await run(controller.signal);
    controller.signal.throwIfAborted();
    return result;
  } finally {
    for (const signal of signals) signal.removeEventListener("abort", abort);
  }
}

export async function probeServer(value, { signal, allowHttp = allowHttpServer, timeoutMs = 8000 } = {}) {
  const base = value === DEFAULT_API_BASE_URL ? value : normalizeServerAddress(value, { allowHttp });
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(`${base}/health`, {
      signal: controller.signal, credentials: "omit", redirect: "error", cache: "no-store",
    });
    if (!response.ok) throw new Error(`服务器返回 HTTP ${response.status}`);
    const info = await response.json();
    controller.signal.throwIfAborted();
    if (info.status !== "ok" || info.service !== "xiangqidao") {
      throw new Error("该地址未返回棋岛服务信息；请检查 /api 路径或升级后端。");
    }
    if (info.api_version !== API_VERSION) throw new Error("服务器 API 版本与客户端不兼容，请更新客户端或后端。");
    return { base, version: info.version || "未知版本" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
