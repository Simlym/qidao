import { API_BASE_URL, authHeaders, readableErrorDetail, request } from "./client.js";
import { withApiConnection } from "./server.js";

export const serverEngineInstallation = (variant) => request(`/admin/engine/${variant}/installation`);

export function installServerEngine(variant, body, { signal, onProgress } = {}) {
  return withApiConnection(async (connectionSignal) => {
    const response = await fetch(`${API_BASE_URL}/admin/engine/${variant}/installation`, {
      method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body), signal: connectionSignal, credentials: "omit", redirect: "error", cache: "no-store",
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(readableErrorDetail(error.detail));
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
