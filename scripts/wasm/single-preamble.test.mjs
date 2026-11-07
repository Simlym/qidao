import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function runtime() {
  const Module = {};
  runInNewContext(readFileSync(new URL("./single-preamble.js", import.meta.url), "utf8"), { Module });
  return Module;
}

test("单线程 UCI 队列等待输入且保持先进先出", async () => {
  const module = runtime();
  const waiting = module.queue.get();
  module.postMessage("uci");
  module.postMessage("isready");
  assert.equal(await waiting, "uci");
  assert.equal(await module.queue.get(), "isready");
});

test("新搜索排队不会清除旧搜索的停止标志", async () => {
  const module = runtime();
  module.postMessage("go infinite");
  assert.equal(await module.queue.get(), "go infinite");
  module.postMessage("stop");
  module.postMessage("position fen new-position");
  module.postMessage("go depth 2");
  assert.equal(module.qidaoStopRequested, true);
  assert.equal(module.queue.pendingStop(), true);
  assert.equal(await module.queue.get(), "stop");
  assert.equal(await module.queue.get(), "position fen new-position");
  assert.equal(await module.queue.get(), "go depth 2");
  assert.equal(module.queue.pendingStop(), false);
});

test("初始化期间已排队的停止生效，但后续搜索的停止不提前影响当前搜索", async () => {
  const module = runtime();
  for (const command of ["go infinite", "stop", "go depth 3", "quit"]) module.postMessage(command);
  assert.equal(await module.queue.get(), "go infinite");
  assert.equal(module.queue.pendingStop(), true);
  assert.equal(await module.queue.get(), "stop");
  assert.equal(module.queue.pendingStop(), false);
  assert.equal(await module.queue.get(), "go depth 3");
  assert.equal(module.queue.pendingStop(), true);
});

test("ponderhit 与输出监听不需要线程或共享内存", () => {
  const module = runtime();
  module.postMessage("ponderhit");
  assert.equal(module.qidaoPonderhit, true);
  const lines = [];
  const listener = (line) => lines.push(line);
  module.addMessageListener(listener);
  module.print("bestmove h2e2");
  module.removeMessageListener(listener);
  module.print("ignored");
  assert.deepEqual(lines, ["bestmove h2e2"]);
});
