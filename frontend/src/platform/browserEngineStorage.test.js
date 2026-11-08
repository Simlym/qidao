import test from "node:test";
import assert from "node:assert/strict";
import { ensureBrowserEngineStorage } from "./browserEngineStorage.js";

function worker(register = async () => {}) {
  const sw = new EventTarget();
  sw.controller = null;
  sw.ready = new Promise(() => {});
  sw.register = register;
  return sw;
}

test("已有接管页面的资源服务时直接使用，不等待未完成的 ready", async () => {
  const sw = worker(() => { throw new Error("不应重新注册"); });
  sw.controller = {};
  await ensureBrowserEngineStorage(undefined, { worker: sw, storage: {}, secureContext: true });
});

test("首次注册后接管页面即可继续，不受 ready 等待阻塞", async () => {
  let options;
  const sw = worker(async (path, next) => { assert.equal(path, "/sw.js"); options = next; sw.controller = {}; });
  await ensureBrowserEngineStorage(undefined, { worker: sw, storage: {}, secureContext: true, timeoutMs: 100 });
  assert.equal(options.updateViaCache, "none");
});

test("初始化支持页面接管事件、取消以及明确的超时操作提示", async () => {
  const sw = worker();
  const pending = ensureBrowserEngineStorage(undefined, { worker: sw, storage: {}, secureContext: true });
  sw.controller = {};
  sw.dispatchEvent(new Event("controllerchange"));
  await pending;
  const abort = new AbortController();
  const cancelled = ensureBrowserEngineStorage(abort.signal, { worker: worker(), storage: {}, secureContext: true });
  abort.abort();
  await assert.rejects(cancelled, { name: "AbortError" });
  await assert.rejects(ensureBrowserEngineStorage(undefined, { worker: worker(), storage: {}, secureContext: true, timeoutMs: 5 }), { code: "STORAGE_NOT_READY" });
});

test("区分不安全网址、不支持存储与注册失败，不混用安卓提示", async () => {
  await assert.rejects(ensureBrowserEngineStorage(undefined, { secureContext: false }), { code: "INSECURE_CONTEXT" });
  await assert.rejects(ensureBrowserEngineStorage(undefined, { worker: null, storage: {}, secureContext: true }), { code: "STORAGE_UNSUPPORTED" });
  await assert.rejects(ensureBrowserEngineStorage(undefined, { worker: worker(async () => { throw new Error("资源文件不存在"); }), storage: {}, secureContext: true }), { code: "STORAGE_REGISTRATION_FAILED" });
});

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
  await assert.rejects(ensureBrowserEngineStorage(), { code: "STORAGE_UNSUPPORTED" });
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
