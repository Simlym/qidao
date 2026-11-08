import test from "node:test";
import assert from "node:assert/strict";
import { hasLocalEngineConfiguration } from "./localEngineConfiguration.js";

test("PC、Web、安卓分别读取正确棋种及运行时的配置", (t) => {
  const previous = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) || null };
  t.after(() => { globalThis.localStorage = previous; });
  for (const platform of ["desktop", "web", "android"]) assert.equal(hasLocalEngineConfiguration("xiangqi", platform), false);
  values.set("xq.browserEngine.xiangqi", JSON.stringify({ base: "/__user-engines__/xiangqi/test/", entrypoint: "worker.js" }));
  assert.equal(hasLocalEngineConfiguration("xiangqi", "web"), true);
  assert.equal(hasLocalEngineConfiguration("xiangqi", "android"), true);
  assert.equal(hasLocalEngineConfiguration("xiangqi", "desktop"), false);
  values.set("xq.nativeEngine.jieqi", JSON.stringify({ path: "D:/engines/jieqi.exe" }));
  assert.equal(hasLocalEngineConfiguration("jieqi", "desktop"), true);
  assert.equal(hasLocalEngineConfiguration("jieqi", "web"), false);
  assert.equal(hasLocalEngineConfiguration("xiangqi", "desktop"), false);
  values.set("xq.nativeEngine.xiangqi", "{}");
  assert.equal(hasLocalEngineConfiguration("xiangqi", "desktop"), false);
  values.set("xq.browserEngine.xiangqi", "损坏的配置");
  assert.equal(hasLocalEngineConfiguration("xiangqi", "web"), false);
});
