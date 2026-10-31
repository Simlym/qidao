import { SERVER_ID } from "../../shared/api/server.js";

const PREFIX = "xq_local_game_v1:";
export const LOCAL_GAMES_CHANGED = "xq-local-games-changed";
export { newOfflineId as newLocalGameId, offlineOwner as localOwner } from "../../shared/offlineIdentity.js";

export function createLocalGames(storage, server = SERVER_ID) {
  const prefix = `${PREFIX}${encodeURIComponent(server)}:`;
  const key = (owner, id) => `${prefix}${encodeURIComponent(owner)}:${id}`;
  return {
    list(owner) {
      const records = [];
      for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i);
        if (!name?.startsWith(prefix)) continue;
        try {
          const record = JSON.parse(storage.getItem(name));
          if (record && record.owner === owner && record.id && Array.isArray(record.moves)) records.push(record);
        } catch { /* 单条损坏不影响其他棋谱。 */ }
      }
      return records.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    write(record) {
      // 写入失败必须向界面报告，不能误报本机保存成功。
      storage.setItem(key(record.owner, record.id), JSON.stringify(record));
      globalThis.dispatchEvent?.(new Event(LOCAL_GAMES_CHANGED));
      return record;
    },
    remove(record) {
      storage.removeItem(key(record.owner, record.id));
      globalThis.dispatchEvent?.(new Event(LOCAL_GAMES_CHANGED));
    },
    guests() {
      const owners = new Set();
      for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i);
        if (name?.startsWith(prefix)) {
          try { const record = JSON.parse(storage.getItem(name)); if (record.owner?.startsWith("guest:")) owners.add(record.owner); } catch { /* 忽略损坏项 */ }
        }
      }
      return [...owners].flatMap((owner) => this.list(owner));
    },
    claim(record, owner) {
      if (!record.owner.startsWith("guest:") || !owner.startsWith("user:")) throw new Error("只能认领游客棋谱");
      this.write({ ...record, owner });
      storage.removeItem(key(record.owner, record.id));
    },
  };
}

export const localGames = () => createLocalGames(localStorage);

// 每条棋谱使用固定 client_id；即使响应丢失或多个窗口同时上传，服务端也只保存一次。
export async function uploadLocalGames({ store, owner, currentOwner, verify, upload, signal, onUploaded }) {
  if (!owner.startsWith("user:") || currentOwner() !== owner) return;
  const pending = store.list(owner).filter((r) => r.payload && !r.serverId);
  if (!pending.length) return;
  const user = await verify();
  if (`user:${user.username}` !== owner) return;
  for (const record of pending) {
    if (signal?.aborted || currentOwner() !== owner) return;
    try {
      const result = await upload({ ...record.payload, client_id: record.id }, signal);
      if (!Number.isInteger(result.id) || result.id <= 0) throw new Error("服务器未返回有效棋谱编号");
      store.write({ ...record, serverId: result.id, syncError: "" });
      if (!signal?.aborted && currentOwner() === owner) onUploaded?.(result.id);
    } catch (error) {
      if (!signal?.aborted) store.write({ ...record, syncError: error.status === 404
        ? "服务器尚未支持离线同步，请升级服务器" : error.message || "连接失败，将自动重试" });
      if (!error.status || [401, 403, 404, 429].includes(error.status)) throw error;
    }
  }
}
