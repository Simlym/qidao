import test from "node:test";
import assert from "node:assert/strict";
import { activateNativeEngine } from "./activateNativeEngine.js";

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
