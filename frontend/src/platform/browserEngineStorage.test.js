import test from "node:test";
import assert from "node:assert/strict";
import { ensureBrowserEngineStorage } from "./browserEngineStorage.js";

function environment(t, worker) {
  const navigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const caches = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker: worker } });
  Object.defineProperty(globalThis, "caches", { configurable: true, value: {} });
  t.after(() => {
    if (navigator) Object.defineProperty(globalThis, "navigator", navigator); else delete globalThis.navigator;
    if (caches) Object.defineProperty(globalThis, "caches", caches); else delete globalThis.caches;
  });
}

test("不支持缓存的安卓 WebView 明确拒绝，不等待永久就绪", async (t) => {
  environment(t, undefined);
  await assert.rejects(ensureBrowserEngineStorage(), /WebView/);
});

test("首次安装需等到 Service Worker 接管页面；等待可取消", async (t) => {
  const worker = new EventTarget();
  worker.register = async () => {};
  worker.ready = Promise.resolve();
  environment(t, worker);
  let done = false;
  const install = ensureBrowserEngineStorage().then(() => { done = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(done, false);
  worker.controller = {};
  worker.dispatchEvent(new Event("controllerchange"));
  await install;
  worker.controller = null;
  const controller = new AbortController();
  const cancelled = ensureBrowserEngineStorage(controller.signal);
  controller.abort();
  await assert.rejects(cancelled, { name: "AbortError" });
});
