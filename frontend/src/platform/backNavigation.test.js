import test from "node:test";
import assert from "node:assert/strict";
import { createBackDispatcher, dismissTopDialog } from "./backNavigation.js";

test("对局先处理返回，未消费时才回到应用导航", () => {
  const back = createBackDispatcher();
  const calls = [];
  back.register(() => { calls.push("导航"); return true; });
  const removeGame = back.register(() => { calls.push("对局"); return true; }, 100);
  assert.equal(back.dispatch(), true);
  assert.deepEqual(calls, ["对局"]);
  removeGame();
  back.dispatch();
  assert.deepEqual(calls, ["对局", "导航"]);
});

test("未处理的返回交由原生退出确认，卸载后不再调用旧页面", () => {
  const back = createBackDispatcher();
  const remove = back.register(() => true, 100);
  remove();
  back.register(() => false);
  assert.equal(back.dispatch(), false);
});

test("优先关闭翻子选择，同级按最新面板顺序处理", () => {
  const back = createBackDispatcher();
  back.register(() => assert.fail("不应先离开对局"), 100);
  back.register(() => assert.fail("不应先关闭旧面板"), 200);
  back.register(() => true, 200);
  assert.equal(back.dispatch(), true);
});

test("返回只关闭最上层确认框，取消处理可阻止默认关闭", () => {
  const calls = [];
  const lower = { close() { assert.fail("不应关闭底层菜单"); } };
  const top = { dispatchEvent(event) { calls.push(event.type); return true; }, close() { calls.push("关闭"); } };
  assert.equal(dismissTopDialog({ querySelectorAll: () => [lower, top] }), true);
  assert.deepEqual(calls, ["cancel", "关闭"]);
  top.dispatchEvent = () => false;
  top.close = () => assert.fail("取消处理已阻止关闭");
  assert.equal(dismissTopDialog({ querySelectorAll: () => [top] }), true);
  assert.equal(dismissTopDialog({ querySelectorAll: () => [] }), false);
});
