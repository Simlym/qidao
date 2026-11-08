import test from "node:test";
import assert from "node:assert/strict";
import { createReplyPacer } from "./replyPacer.js";

function clock() {
  let time = 0;
  const timers = new Map();
  const pacer = createReplyPacer({ now: () => time, schedule: (fn, delay) => { const id = Symbol(); timers.set(id, { fn, at: time + delay }); return id; }, clear: (id) => timers.delete(id) });
  return { pacer, timers, advance(ms) { time += ms; for (const [id, timer] of timers) if (timer.at <= time) { timers.delete(id); timer.fn(); } } };
}

test("快速应着等待玩家动画结束，慢速搜索不再追加等待", async () => {
  const c = clock();
  c.advance(100);
  let complete = false;
  const reply = c.pacer.waitSince(0).then((value) => { complete = value; });
  c.advance(399); await Promise.resolve(); assert.equal(complete, false);
  c.advance(1); await reply; assert.equal(complete, true);
  c.advance(700); assert.equal(await c.pacer.waitSince(500), true);
  assert.equal(c.timers.size, 0);
});

test("认输、重开或离开时取消待展示的应着并清除计时器", async () => {
  const c = clock();
  const reply = c.pacer.waitSince(0);
  c.pacer.cancel();
  assert.equal(await reply, false);
  assert.equal(c.timers.size, 0);
  c.advance(1000);
});

test("新回合替换旧等待时旧应着不会继续展示", async () => {
  const c = clock();
  const old = c.pacer.waitSince(0);
  c.advance(100);
  const current = c.pacer.waitSince(100);
  assert.equal(await old, false);
  c.advance(500);
  assert.equal(await current, true);
});
