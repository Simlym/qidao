import { getToken, getGuestId } from "./api/session.js";

export const newOfflineId = () => globalThis.crypto?.randomUUID?.()
  || `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// 只用于本机数据隔离，真实身份和有效期仍由服务器验证。
export function offlineOwner() {
  const token = getToken();
  if (token) {
    try {
      const part = token.split(".")[0].replaceAll("-", "+").replaceAll("_", "/");
      const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")), (c) => c.charCodeAt(0))));
      if (payload.u) return `user:${payload.u}`;
    } catch { /* 损坏凭据不能降级认作游客数据。 */ }
    return "invalid-token";
  }
  return `guest:${getGuestId()}`;
}
