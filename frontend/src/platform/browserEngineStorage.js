// Web 和支持 Service Worker 的 Android WebView 共用缓存资源路径。
export async function ensureBrowserEngineStorage(signal) {
  if (!globalThis.navigator?.serviceWorker || typeof caches === "undefined") {
    throw new Error("当前浏览器或安卓 WebView 不支持引擎缓存，请升级客户端或使用远程引擎");
  }
  signal?.throwIfAborted();
  await new Promise((resolve, reject) => {
    const sw = navigator.serviceWorker;
    const finish = (error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      sw.removeEventListener("controllerchange", changed);
      if (error) reject(error); else resolve();
    };
    const changed = () => { if (sw.controller) finish(); };
    const abort = () => finish(new DOMException("已取消安装", "AbortError"));
    const timer = setTimeout(() => finish(new Error("引擎缓存尚未接管页面，请刷新后重试；安卓 WebView 需支持 Service Worker")), 15000);
    sw.addEventListener("controllerchange", changed);
    signal?.addEventListener("abort", abort, { once: true });
    sw.register("/sw.js").then(() => sw.ready).then(changed, finish);
    if (signal?.aborted) abort();
  });
}
