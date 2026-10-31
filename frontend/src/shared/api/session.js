import { DEFAULT_API_BASE_URL, SERVER_ID } from "./server.js";

function makeGuestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll("-", "");
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function serverStorageKey(name, serverId = SERVER_ID) {
  return `xq_server:${encodeURIComponent(serverId)}:${name}`;
}

export function createSessionStore(storage, serverId, defaultServerId) {
  // 旧版本只有一个构建时服务器。旧凭据只迁移至默认实例，绝不交给自定义实例。
  for (const name of ["token", "guest_id"]) {
    const legacy = storage.getItem(`xq_${name}`);
    if (legacy !== null) {
      const target = serverStorageKey(name, defaultServerId);
      if (storage.getItem(target) === null) storage.setItem(target, legacy);
      storage.removeItem(`xq_${name}`);
    }
  }
  const key = (name) => serverStorageKey(name, serverId);
  return {
    getToken: () => storage.getItem(key("token")),
    setToken(token) {
      if (token) storage.setItem(key("token"), token);
      else storage.removeItem(key("token"));
    },
    getGuestId() {
      let id = storage.getItem(key("guest_id"));
      if (!/^[a-f0-9]{32}$/.test(id || "")) {
        id = makeGuestId();
        storage.setItem(key("guest_id"), id);
      }
      return id;
    },
    resetGuestId() { storage.setItem(key("guest_id"), makeGuestId()); },
  };
}

const store = () => createSessionStore(localStorage, SERVER_ID, DEFAULT_API_BASE_URL);
export const getToken = () => store().getToken();
export const SESSION_CHANGED = "xq-session-changed";
export const setToken = (token) => {
  store().setToken(token);
  globalThis.dispatchEvent?.(new Event(SESSION_CHANGED));
};
export const getGuestId = () => store().getGuestId();
export const resetGuestId = () => store().resetGuestId();
