import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function harness() {
  const events = {};
  const deleted = [];
  runInNewContext(readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8"), {
    URL, Headers, Response,
    self: {
      location: { origin: "https://app.example" },
      addEventListener(name, handler) { events[name] = handler; },
      clients: { claim() {} },
    },
    caches: {
      keys: async () => ["xq-shell-v2", "xq-shell-v3", "xiangqidao-user-engines-v1"],
      delete: async (key) => deleted.push(key),
    },
  });
  return { events, deleted };
}

test("离线缓存不拦截默认/前缀 API、带凭据或 no-store 请求", () => {
  const { events } = harness();
  for (const [path, options] of [
    ["/api/health", {}], ["/prefix/api/games", {}],
    ["/private", { headers: { Authorization: "Bearer token" } }],
    ["/private", { headers: { "X-Guest-ID": "guest" } }],
    ["/health", { cache: "no-store" }],
  ]) {
    events.fetch({ request: new Request(`https://app.example${path}`, options), respondWith() {
      assert.fail(`不能缓存业务响应：${path}`);
    } });
  }
});

test("升级清理旧壳缓存但保留用户引擎", async () => {
  const { events, deleted } = harness();
  let work;
  events.activate({ waitUntil(promise) { work = promise; } });
  await work;
  assert.deepEqual(deleted, ["xq-shell-v2"]);
});
