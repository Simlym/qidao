import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function startup({ desktop = false, href = "https://test.example/" } = {}) {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const elements = Object.fromEntries(["startup", "startup-message", "startup-retry", "startup-details", "startup-error"]
    .map((id) => [id, { hidden: id === "startup-retry" || id === "startup-details", style: {} }]));
  const events = {};
  let timer;
  let reloads = 0;
  const replacements = [];
  const deleted = [];
  let unregistered = 0;
  class Script {}
  const window = {
    __TAURI_INTERNALS__: desktop ? {} : undefined,
    caches: { async keys() { return ["xq-shell-v3", "xiangqidao-user-engines-v1"]; }, async delete(key) { deleted.push(key); } },
    addEventListener(name, fn) { events[name] = fn; },
  };
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    window, document: { getElementById: (id) => elements[id] }, HTMLScriptElement: Script,
    URL, navigator: { userAgent: "test", serviceWorker: { async getRegistrations() { return [{
      active: { scriptURL: "http://tauri.localhost/sw.js" }, async unregister() { unregistered++; },
    }]; } } },
    location: { href, replace(url) { replacements.push(url); }, reload() { reloads++; } },
    setTimeout(fn) { timer = fn; return 1; }, clearTimeout() { timer = null; },
  });
  return { elements, events, window, Script, replacements, deleted, unregistered: () => unregistered,
    timeout() { timer?.(); }, reloads: () => reloads };
}

test("入口脚本加载失败时显示详情并允许重试", () => {
  const app = startup();
  const script = new app.Script();
  script.src = "http://tauri.localhost/assets/missing.js";
  app.events.error({ target: script });
  assert.equal(app.elements["startup-retry"].hidden, false);
  assert.match(app.elements["startup-error"].textContent, /missing\.js/);
  app.elements["startup-retry"].onclick();
  assert.equal(app.reloads(), 1);
});

test("启动异常和超时不会留下空白页面", () => {
  const failed = startup();
  failed.events.unhandledrejection({ reason: new Error("初始化失败") });
  assert.match(failed.elements["startup-error"].textContent, /初始化失败/);
  const slow = startup();
  slow.timeout();
  assert.equal(slow.elements["startup-retry"].hidden, false);
  assert.match(slow.elements["startup-error"].textContent, /15 秒/);
});

test("成功挂载后隐藏启动提示，渲染崩溃仍可显示重试", () => {
  const app = startup();
  app.window.qidaoStartup.ready();
  app.timeout();
  app.events.unhandledrejection({ reason: "非启动请求失败" });
  assert.equal(app.elements.startup.style.display, "none");
  app.window.qidaoStartup.fail(new Error("页面渲染失败"));
  assert.equal(app.elements.startup.style.display, "grid");
  assert.match(app.elements["startup-error"].textContent, /页面渲染失败/);
});

test("PC 入口脚本失效时自动清理旧页面并仅恢复一次", async () => {
  const app = startup({ desktop: true, href: "http://tauri.localhost/index.html?build=old" });
  app.events.error({ target: new app.Script() });
  app.events.error({ target: new app.Script() });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.unregistered(), 1);
  assert.deepEqual(app.deleted, ["xq-shell-v3"]);
  assert.equal(app.replacements.length, 1);
  const next = new URL(app.replacements[0]);
  assert.ok(next.searchParams.has("qidao-startup-retry"));
  const retried = startup({ desktop: true, href: next.href });
  retried.events.error({ target: new retried.Script() });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(retried.replacements.length, 0);
  assert.equal(retried.elements["startup-retry"].hidden, false);
});
