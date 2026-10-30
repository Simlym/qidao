import assert from "node:assert/strict";
import test from "node:test";
import { createGameEpoch } from "./gameEpoch.js";

test("新对局使旧的开局和落子响应失效", () => {
  const guard = createGameEpoch();
  const oldGame = guard.begin();
  assert.equal(guard.isCurrent(oldGame), true);
  const newGame = guard.begin();
  assert.equal(guard.isCurrent(oldGame), false);
  assert.equal(guard.isCurrent(newGame), true);
});

test("重开与组件卸载都禁止旧异步结果写回", async () => {
  const guard = createGameEpoch();
  const request = guard.begin();
  const response = Promise.resolve({ fen: "old" });
  guard.invalidate();
  let applied = false;
  const data = await response;
  if (guard.isCurrent(request)) applied = Boolean(data);
  assert.equal(applied, false);
  const next = guard.begin();
  guard.dispose();
  assert.equal(guard.isCurrent(next), false);
});
