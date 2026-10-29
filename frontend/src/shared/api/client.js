import { API_BASE_URL, withApiConnection } from "./server.js";
import { getGuestId, getToken } from "./session.js";
export { API_BASE_URL } from "./server.js";

export function authHeaders(extra = {}) {
  const token = getToken();
  return {
    ...extra,
    "X-Guest-ID": getGuestId(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function readableErrorDetail(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const message = item?.msg || item?.message;
        const location = Array.isArray(item?.loc)
          ? item.loc.map((part) => part === "body" ? "请求体" : part).join(".")
          : "";
        if (message && location) return `${location}：${message}`;
        return message || JSON.stringify(item);
      })
      .filter(Boolean)
      .join("；");
  }
  if (value && typeof value === "object") return value.msg || value.message || JSON.stringify(value);
  return "请求失败";
}

export async function request(path, { method = "GET", body, signal } = {}) {
  return withApiConnection(async (requestSignal) => {
    const options = { method, headers: authHeaders(), signal: requestSignal, credentials: "omit", redirect: "error", cache: "no-store" };
    if (body !== undefined) {
      options.headers = authHeaders({ "Content-Type": "application/json" });
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`${API_BASE_URL}${path}`, options);
    if (!response.ok) {
      let detail = "请求失败";
      try { detail = readableErrorDetail((await response.json()).detail); } catch { /* 非 JSON 响应 */ }
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }, signal);
}
