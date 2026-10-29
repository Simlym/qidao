import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

function excludeBundledEngines() {
  return {
    name: "exclude-bundled-engines",
    apply: "build",
    closeBundle() {
      // public/ 下的本机测试文件绝不能进入 Web、PC 或 Android 发行产物。
      rmSync(resolve(process.cwd(), "dist/engine"), { recursive: true, force: true });
      rmSync(resolve(process.cwd(), "dist-tauri/engine"), { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const tauriDevHost = process.env.TAURI_DEV_HOST;
  const apiBase = (env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const packagedClient = mode === "tauri" || mode === "android";
  const label = mode === "android" ? "Android" : "PC";
  const configFile = mode === "android" ? ".env.android.local" : ".env.tauri.local";
  const release = command === "build";

  if (packagedClient && (release || mode === "android" || apiBase)) {
    let url;
    try { url = new URL(apiBase); } catch { /* 由下方统一给出配置错误 */ }
    const valid = url
      && (release ? url.protocol === "https:" : ["http:", "https:"].includes(url.protocol))
      && url.pathname.endsWith("/api")
      && !url.search && !url.hash && !url.username && !url.password;
    const loopback = url && /^(localhost|127(?:\.\d+){3}|\[::1\])$/i.test(url.hostname);
    if (!valid || (release && loopback)) {
      throw new Error(`${label} ${release ? "发布构建" : "调试"}请在 frontend/${configFile} 或构建环境变量中配置 VITE_API_BASE_URL：完整 ${release ? "HTTPS" : "HTTP/HTTPS"} 地址，以 /api 结尾，不含账号、查询参数或片段${release ? "，且不能使用 localhost/回环地址" : ""}。`);
    }
  }

  return {
    plugins: [react(), excludeBundledEngines()],
    define: {
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBase),
    },
    server: {
      port: 5173,
      strictPort: true,
      host: tauriDevHost || undefined,
      // Tauri 移动端从模拟器/真机连回开发电脑，HMR 不能使用设备自身的 localhost。
      hmr: tauriDevHost
        ? { protocol: "ws", host: tauriDevHost, port: 5173 }
        : undefined,
      // 多线程 WASM 引擎依赖 SharedArrayBuffer，需要跨源隔离响应头；
      // 单线程引擎构建不受影响。生产部署时需在 Web 服务器上配置同样的头。
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
      // 开发时把 /api 代理到后端，免去跨域配置
      proxy: {
        "/api": "http://localhost:8000",
      },
    },
  };
});
