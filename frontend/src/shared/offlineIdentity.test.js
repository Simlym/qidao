import test from "node:test";
import assert from "node:assert/strict";
import { offlineOwner } from "./offlineIdentity.js";
import { setToken } from "./api/session.js";

test("登录身份变化后本机归属立即更新，损坏凭据不能降级到游客", (t) => {
  const previous = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = { getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) };
  t.after(() => { globalThis.localStorage = previous; });
  const guest = offlineOwner();
  assert.match(guest, /^guest:[a-f0-9]{32}$/);
  setToken(`${Buffer.from(JSON.stringify({ u: "棋手甲", exp: 0 })).toString("base64url")}.signature`);
  // 本机记录保留原归属；过期凭据的补传仍须通过服务端验证。
  assert.equal(offlineOwner(), "user:棋手甲");
  setToken("broken-token");
  assert.equal(offlineOwner(), "invalid-token");
  setToken(null);
  assert.equal(offlineOwner(), guest);
});
