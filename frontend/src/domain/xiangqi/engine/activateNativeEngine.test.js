import test from "node:test";
import assert from "node:assert/strict";
import { activateNativeEngine, verifyNativeEngineReadiness } from "./activateNativeEngine.js";

function harness(previous, kinds) {
  let saved = previous;
  let disposed = 0;
  return {
    options: {
      manager: { dispose: async () => { disposed++; }, availableKinds: async () => kinds, errorFor: () => "CPU 不兼容" },
      readProfile: () => saved, writeProfile: (value) => { saved = value; }, removeProfile: () => { saved = null; },
    },
    saved: () => saved, disposed: () => disposed,
  };
}

test("自动检测原生引擎不重写配置或重启已就绪的引擎", async () => {
  const previous = { path: "installed.exe", nnuePath: "installed.nnue", threads: 4 };
  const h = harness(previous, ["native", "remote"]);
  assert.equal(await verifyNativeEngineReadiness(h.options), true);
  assert.equal(h.saved(), previous);
  assert.equal(h.disposed(), 0);
});

test("自动检测失败保留原生配置，云端可用也不能显示本地就绪", async () => {
  const previous = { path: "missing.exe" };
  const h = harness(previous, ["remote"]);
  await assert.rejects(verifyNativeEngineReadiness(h.options), /CPU 不兼容/);
  assert.equal(h.saved(), previous);
  assert.equal(h.disposed(), 0);
});

test("切换设置后丢弃迟到的检测结果，后续启用等待检测结束", async () => {
  const h = harness({ path: "old.exe" }, ["native"]);
  let current = true;
  let release, entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const checking = verifyNativeEngineReadiness({ manager: { availableKinds: async () => { entered(); await pending; return ["native"]; } }, isCurrent: () => current });
  await started;
  current = false;
  const next = activateNativeEngine({ path: "next.exe" }, h.options);
  assert.equal(h.saved().path, "old.exe");
  release();
  await assert.rejects(checking, /已取消/);
  await next;
  assert.equal(h.saved().path, "next.exe");
  const disposed = h.disposed();
  await assert.rejects(verifyNativeEngineReadiness({ ...h.options, isCurrent: () => false }), /已取消/);
  assert.equal(h.disposed(), disposed);
});

test("启用成功后保存象棋变体和无权重选项", async () => {
  const h = harness(null, ["native", "remote"]);
  const profile = { path: "new-engine.exe", uciVariant: "xiangqi", useNnue: false };
  await activateNativeEngine(profile, h.options);
  assert.equal(h.saved(), profile);
  assert.equal(h.disposed(), 1);
});

test("本地启动失败时恢复原配置，即使云端仍可用也不视为安装成功", async () => {
  const previous = { path: "old.exe", nnuePath: "old.nnue" };
  const h = harness(previous, ["remote"]);
  await assert.rejects(activateNativeEngine({ path: "new.exe" }, h.options), /CPU 不兼容/);
  assert.equal(h.saved(), previous);
  assert.equal(h.disposed(), 2);
});

test("首次安装启用失败后移除失败配置", async () => {
  const h = harness(null, []);
  await assert.rejects(activateNativeEngine({ path: "new.exe" }, h.options));
  assert.equal(h.saved(), null);
});

test("离开页面后到达的引擎就绪结果不会保留新配置", async () => {
  const previous = { path: "old.exe" };
  const h = harness(previous, ["native"]);
  let current = true;
  h.options.isCurrent = () => current;
  h.options.manager.availableKinds = async () => { current = false; return ["native"]; };
  await assert.rejects(activateNativeEngine({ path: "new.exe" }, h.options), /已取消/);
  assert.equal(h.saved(), previous);
});

test("页面已离开时不开始启用引擎", async () => {
  const h = harness({ path: "old.exe" }, ["native"]);
  h.options.isCurrent = () => false;
  await assert.rejects(activateNativeEngine({ path: "new.exe" }, h.options), /已取消/);
  assert.equal(h.disposed(), 0);
  assert.equal(h.saved().path, "old.exe");
});

test("新页面的启用等待旧事务回滚，不被迟到结果覆盖", async () => {
  const h = harness({ path: "old.exe" }, ["native"]);
  let current = true;
  let started;
  let release;
  const entered = new Promise((resolve) => { started = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const first = activateNativeEngine({ path: "stale.exe" }, {
    ...h.options,
    isCurrent: () => current,
    manager: { dispose: async () => {}, availableKinds: async () => { started(); await pending; return ["native"]; } },
  });
  await entered;
  current = false;
  const second = activateNativeEngine({ path: "latest.exe" }, h.options);
  release();
  await assert.rejects(first, /已取消/);
  await second;
  assert.equal(h.saved().path, "latest.exe");
});
