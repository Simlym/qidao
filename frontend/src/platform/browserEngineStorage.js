// Web 和支持 Service Worker 的 Android WebView 共用缓存资源路径。
export class BrowserEngineStorageError extends Error {
  constructor(code, message) { super(message); this.name = "BrowserEngineStorageError"; this.code = code; }
}

export async function ensureBrowserEngineStorage(signal, {
  worker = globalThis.navigator?.serviceWorker, storage = globalThis.caches,
  secureContext = globalThis.isSecureContext, timeoutMs = 15000,
} = {}) {
  signal?.throwIfAborted();
  if (secureContext === false) {
    throw new BrowserEngineStorageError("INSECURE_CONTEXT", "当前网址无法保存本地引擎，请通过 HTTPS 或本机 localhost 打开棋岛。");
  }
  if (!worker || !storage) {
    throw new BrowserEngineStorageError("STORAGE_UNSUPPORTED", "当前浏览器不支持保存本地引擎，请更换浏览器；安卓设备可升级系统浏览器组件后重试。");
  }
  // 已接管的页面可直接使用，避免无关的 ready 等待阻塞已有引擎。
  if (worker.controller) return;
  await new Promise((resolve, reject) => {
    const sw = worker;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      sw.removeEventListener("controllerchange", changed);
      if (error) reject(error); else resolve();
    };
    const changed = () => { if (sw.controller) finish(); };
    const abort = () => finish(new DOMException("已取消安装", "AbortError"));
    const timer = setTimeout(() => finish(new BrowserEngineStorageError("STORAGE_NOT_READY", "本机存储尚未准备好，请刷新页面后重试。")), timeoutMs);
    sw.addEventListener("controllerchange", changed);
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => sw.register("/sw.js", { updateViaCache: "none" }))
      .then(() => { changed(); return sw.ready; }).then(changed, (error) => finish(
        new BrowserEngineStorageError("STORAGE_REGISTRATION_FAILED", `无法准备本机存储：${error.message || error}`)));
    changed();
    if (signal?.aborted) abort();
  });
}
