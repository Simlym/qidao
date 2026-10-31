import test from "node:test";
import assert from "node:assert/strict";
import { createLocalGames, uploadLocalGames } from "./localGames.js";

function storage() {
  const data = new Map();
  return { get length() { return data.size; }, key: (i) => [...data.keys()][i],
    getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
}
const record = (owner = "user:甲") => ({ id: "fixed-id", owner, moves: ["a3a4"], updatedAt: 1,
  fen: "局面", times: [100], history: [], payload: { moves: "a3a4" } });

test("重建存储后仍能恢复记录，服务器和账号相互隔离", () => {
  const disk = storage(), store = createLocalGames(disk, "服务器甲");
  store.write(record());
  assert.deepEqual(createLocalGames(disk, "服务器甲").list("user:甲"), [record()]);
  assert.deepEqual(store.list("user:乙"), []);
  assert.deepEqual(createLocalGames(disk, "服务器乙").list("user:甲"), []);
});

test("响应丢失保留待传记录，重试复用标识并标记已同步", async () => {
  const store = createLocalGames(storage()); store.write(record());
  const calls = [], options = { store, owner: "user:甲", currentOwner: () => "user:甲", verify: async () => ({ username: "甲" }) };
  await assert.rejects(uploadLocalGames({ ...options, upload: async (body) => { calls.push(body); throw Error("断网"); } }));
  assert.equal(store.list("user:甲")[0].serverId, undefined);
  await uploadLocalGames({ ...options, upload: async (body) => { calls.push(body); return { id: 12 }; } });
  assert.equal(calls[0].client_id, calls[1].client_id);
  assert.equal(store.list("user:甲")[0].serverId, 12);
  await uploadLocalGames({ ...options, upload: async () => assert.fail("已同步不得再传") });
});

test("身份验证期间切换账号或取消时不上传", async () => {
  const store = createLocalGames(storage()); store.write(record());
  let owner = "user:甲";
  const options = { store, owner, currentOwner: () => owner, upload: async () => assert.fail("身份变化不得上传") };
  await uploadLocalGames({ ...options, verify: async () => { owner = "user:乙"; return { username: "甲" }; } });
  owner = "user:甲";
  await uploadLocalGames({ ...options, signal: AbortSignal.abort(), verify: async () => ({ username: "甲" }) });
});

test("游客不自动上传，主动认领仅移动当前服务器下的游客记录", async () => {
  const disk = storage(), store = createLocalGames(disk, "甲");
  store.write(record("guest:设备"));
  await uploadLocalGames({ store, owner: "guest:设备", currentOwner: () => "guest:设备", verify: () => assert.fail("游客不得同步") });
  assert.equal(createLocalGames(disk, "乙").guests().length, 0);
  store.claim(store.guests()[0], "user:甲");
  assert.equal(store.guests().length, 0);
  assert.equal(store.list("user:甲")[0].id, "fixed-id");
});

test("设备写入失败时抛出错误，不能误报保存成功", () => {
  const disk = storage(); disk.setItem = () => { throw Error("空间不足"); };
  assert.throws(() => createLocalGames(disk).write(record()), /空间不足/);
});
