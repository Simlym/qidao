import { runtime, RUNTIME } from "./runtime.js";

export async function setupServiceWorker(value = runtime, {
  worker = globalThis.navigator?.serviceWorker,
  storage = globalThis.caches,
} = {}) {
  if (value === RUNTIME.DESKTOP) {
    // PC 页面由安装包提供。WebView 的旧 SW 可能无法更新，直接注销，
    // 不依赖新 SW 激活来清理旧页面；保留导入的引擎与用户数据。
    const registrations = await worker?.getRegistrations() || [];
    await Promise.all(registrations.filter((registration) => {
      const script = registration.active || registration.waiting || registration.installing;
      return script && new URL(script.scriptURL).pathname === "/sw.js";
    }).map((registration) => registration.unregister()));
    const keys = await storage?.keys() || [];
    await Promise.all(keys.filter((key) => key.startsWith("xq-shell-")).map((key) => storage.delete(key)));
    return;
  }
  await worker?.register("/sw.js");
}
