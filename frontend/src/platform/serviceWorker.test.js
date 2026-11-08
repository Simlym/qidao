import test from "node:test";
import assert from "node:assert/strict";
import { setupServiceWorker } from "./serviceWorker.js";

test("PC 注销旧页面 SW，无需更新即可清理页面缓存并保留用户引擎", async () => {
  const deleted = [];
  let unregistered = 0;
  await setupServiceWorker("desktop", {
    worker: {
      register() { assert.fail("PC 不应注册网页离线缓存"); },
      async getRegistrations() { return [{
        active: { scriptURL: "http://tauri.localhost/sw.js" },
        async unregister() { unregistered++; },
      }]; },
    },
    storage: {
      async keys() { return ["xq-shell-v2", "xq-shell-v3", "xiangqidao-user-engines-v1"]; },
      async delete(key) { deleted.push(key); },
    },
  });
  assert.equal(unregistered, 1);
  assert.deepEqual(deleted, ["xq-shell-v2", "xq-shell-v3"]);
});

test("Web 与安卓保留浏览器引擎所需的 SW 注册", async () => {
  for (const value of ["web", "android"]) {
    const registered = [];
    await setupServiceWorker(value, { worker: { async register(path) { registered.push(path); } } });
    assert.deepEqual(registered, ["/sw.js"]);
  }
});
