import { API_BASE_URL, authHeaders, readableErrorDetail, request } from "./client.js";
import { withApiConnection } from "./server.js";

export const serverEngineInstallation = (variant) => request(`/admin/engine/${variant}/installation`);

export function installServerEngine(variant, body, { signal, onProgress } = {}) {
  return serverEngineOperation(variant, "installation", JSON.stringify(body), "application/json", { signal, onProgress });
}

export function uploadServerEngine(variant, file, options = {}) {
  return serverEngineOperation(variant, "upload", file, "application/zip", options);
}

function serverEngineOperation(variant, action, body, contentType, { signal, onProgress } = {}) {
  return withApiConnection(async (connectionSignal) => {
    const response = await fetch(`${API_BASE_URL}/admin/engine/${variant}/${action}`, {
      method: "POST", headers: authHeaders({ "Content-Type": contentType }),
      body, signal: connectionSignal, credentials: "omit", redirect: "error", cache: "no-store",
    });
    if (!response.ok) {
      let message = response.status === 413 ? "文件超过服务器上传限制，请检查部署配置或选择适配的 ZIP 包。" : "引擎操作请求失败，请重试。";
      try { message = readableErrorDetail((await response.json()).detail); } catch { /* 反向代理可能返回 HTML，保留可读提示。 */ }
      throw new Error(message);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result;
    const consume = (line) => {
      if (!line.trim()) return;
      connectionSignal.throwIfAborted();
      const event = JSON.parse(line);
      if (event.type === "error") throw new Error(event.data.message);
      if (event.type === "progress") onProgress?.(event.data);
      if (event.type === "complete") result = event.data;
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        lines.forEach(consume);
        if (done) break;
      }
      consume(buffer);
      if (!result) throw new Error("服务器未返回启用结果，请重新检测当前状态");
      return result;
    } finally { await reader.cancel().catch(() => {}); }
  }, signal);
}
