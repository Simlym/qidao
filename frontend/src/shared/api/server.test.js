import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeServerAddress, probeServer, saveServerAddress,
  API_BASE_URL, DEFAULT_API_BASE_URL, connectionController, SERVER_STORAGE_KEY,
} from "./server.js";
import { createSessionStore, serverStorageKey } from "./session.js";
import { request } from "./client.js";
import { streamEvalPosition } from "./engine.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("地址规范化与 HTTPS 限制，开发允许 HTTP", () => {
  assert.equal(normalizeServerAddress(" https://CHESS.example:443/prefix/api/// "), "https://chess.example/prefix/api");
  for (const value of ["/api", "http://chess.example/api", "https://chess.example", "https://a:b@chess.example/api", "https://chess.example/api?q=1", "https://chess.example/api#x"]) {
    assert.throws(() => normalizeServerAddress(value));
  }
  assert.equal(normalizeServerAddress("http://localhost:8000/api", { allowHttp: true }), "http://localhost:8000/api");
});

test("默认和自建实例的 token、游客 ID 独立，旧凭据仅迁移至默认实例", () => {
  const db = storage();
  db.setItem("xq_token", "legacy-default-token");
  db.setItem("xq_guest_id", "a".repeat(32));
  const custom = createSessionStore(db, "https://custom.example/api", "https://default.example/api");
  const defaultSession = createSessionStore(db, "https://default.example/api", "https://default.example/api");
  assert.equal(custom.getToken(), null);
  assert.equal(defaultSession.getToken(), "legacy-default-token");
  assert.equal(defaultSession.getGuestId(), "a".repeat(32));
  assert.notEqual(custom.getGuestId(), defaultSession.getGuestId());
  custom.setToken("custom-token");
  assert.equal(defaultSession.getToken(), "legacy-default-token");
  custom.setToken(null);
  assert.equal(defaultSession.getToken(), "legacy-default-token");
  assert.equal(db.getItem("xq_token"), null);
});

test("迁移不覆盖已存在的默认实例会话，不同 API 前缀使用不同命名空间", () => {
  const db = storage();
  db.setItem(serverStorageKey("token", "https://host.example/api"), "new-token");
  db.setItem("xq_token", "old-token");
  const session = createSessionStore(db, "https://host.example/api", "https://host.example/api");
  assert.equal(session.getToken(), "new-token");
  const other = createSessionStore(db, "https://host.example/other/api", "https://host.example/api");
  assert.equal(other.getToken(), null);
});

test("检测不带旧实例凭据，拒绝旧后端和不兼容 API", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  let payload = { status: "ok", service: "xiangqidao", api_version: 1, version: "test" };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://custom.example/api/health");
    assert.equal(options.headers, undefined);
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    return new Response(JSON.stringify(payload));
  };
  assert.equal((await probeServer("https://custom.example/api")).version, "test");
  payload = { status: "ok" };
  await assert.rejects(probeServer("https://custom.example/api"), /升级后端/);
  payload = { status: "ok", service: "xiangqidao", api_version: 2 };
  await assert.rejects(probeServer("https://custom.example/api"), /不兼容/);
});

test("检测连接可以取消、超时且失败不写入当前服务器设置", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = (_, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) reject(new DOMException("取消", "AbortError"));
    else signal.addEventListener("abort", () => reject(new DOMException("取消", "AbortError")), { once: true });
  });
  await assert.rejects(probeServer("https://custom.example/api", { timeoutMs: 5 }), { name: "AbortError" });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(probeServer("https://custom.example/api", { signal: controller.signal }), { name: "AbortError" });
});

test("普通和流式 API 均禁用缓存、cookie与重定向，使用当前实例凭据", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = storage();
  createSessionStore(localStorage, API_BASE_URL, DEFAULT_API_BASE_URL).setToken("only-this-server");
  t.after(() => { globalThis.fetch = previousFetch; globalThis.localStorage = previousStorage; });
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer only-this-server");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers["X-Guest-ID"].length, 32);
    return url.endsWith("/stream")
      ? new Response(JSON.stringify({ type: "complete", data: { best_move: "h2e2" } }) + "\n")
      : new Response('{"status":"ok"}');
  };
  assert.equal((await request("/health")).status, "ok");
  assert.equal((await streamEvalPosition("fen")).bestMove, "h2e2");
});

test("切换中断普通和流式请求，丢弃迟到结果；离线恢复默认不发网络请求", async (t) => {
  const previousStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  globalThis.localStorage = storage();
  t.after(() => { globalThis.localStorage = previousStorage; globalThis.fetch = previousFetch; });
  let finish;
  let requestSignal;
  let streamController;
  let updateCount = 0;
  globalThis.fetch = (url, options) => {
    if (url.endsWith("/stream")) return Promise.resolve(new Response(new ReadableStream({
      start(controller) { streamController = controller; },
    })));
    requestSignal = options.signal;
    return new Promise((resolve) => { finish = () => resolve(new Response('{"oldUser":"旧用户"}')); });
  };
  const pending = request("/slow");
  const stream = streamEvalPosition("fen", { onUpdate() { updateCount++; } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  localStorage.setItem(SERVER_STORAGE_KEY, "https://custom.example/api");
  saveServerAddress(DEFAULT_API_BASE_URL);
  assert.equal(localStorage.getItem(SERVER_STORAGE_KEY), null);
  assert.equal(connectionController.signal.aborted, true);
  assert.equal(requestSignal.aborted, true);
  finish();
  streamController.enqueue(new TextEncoder().encode(JSON.stringify({ type: "info", data: { best_move: "h2e2" } }) + "\n"));
  streamController.close();
  await Promise.all([
    assert.rejects(pending, { name: "AbortError" }),
    assert.rejects(stream, { name: "AbortError" }),
  ]);
  assert.equal(updateCount, 0);
  globalThis.fetch = async () => { throw new Error("已停止的连接不得继续发请求"); };
  await assert.rejects(request("/health"), { name: "AbortError" });
  await assert.rejects(streamEvalPosition("fen"), { name: "AbortError" });
});
