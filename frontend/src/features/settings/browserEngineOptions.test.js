import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { browserEngineOptions, recommendedBrowserEngine } from "./browserEngineOptions.js";

const { packages } = JSON.parse(readFileSync(new URL("../../domain/xiangqi/engine/wasm-packages.json", import.meta.url), "utf8"));
const capabilities = { webAssembly: true, worker: true, cacheStorage: true, threads: true };

test("Web 与安卓默认使用适配的单线程版，并隔离棋种", () => {
  for (const variant of ["xiangqi", "jieqi"]) {
    const options = browserEngineOptions(packages, variant, capabilities);
    assert.ok(options.every(({ spec }) => spec.variant === variant));
    const selected = recommendedBrowserEngine(options);
    assert.ok(selected);
    assert.equal(Boolean(selected.threads), false);
  }
});

test("无跨源隔离时禁止多线程选择，缺少浏览器能力时不提供可下载版本", () => {
  const options = browserEngineOptions(packages, "xiangqi", { ...capabilities, threads: false });
  assert.ok(options.some(({ spec, available }) => spec.threads && !available));
  assert.equal(Boolean(recommendedBrowserEngine(options).threads), false);
  assert.equal(recommendedBrowserEngine(browserEngineOptions(packages, "xiangqi", { ...capabilities, worker: false })), null);
});
