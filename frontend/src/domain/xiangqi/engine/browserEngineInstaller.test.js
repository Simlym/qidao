import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { installBrowserEngine, validateWasmDownload } from "./browserEngineInstaller.js";

const hash = (data) => createHash("sha256").update(data).digest("hex");
const capabilities = { webAssembly: true, worker: true, cacheStorage: true, threads: false };
function fixture(change = () => {}) {
  const worker = strToU8("worker");
  const manifest = { schemaVersion: 1, id: "fixture", version: "1", variant: "xiangqi", runtime: "wasm", protocol: "uci",
    entrypoint: "engine.worker.js", assets: [{ path: "engine.worker.js", size: worker.length, sha256: hash(worker) }] };
  const files = { "engine-manifest.json": strToU8(JSON.stringify(manifest)), "engine.worker.js": worker };
  change(files);
  const bytes = zipSync(files);
  const spec = { id: "fixture-release", packageId: "fixture", name: "测试", version: "1", variant: "xiangqi", runtime: "wasm",
    threads: false, publicDownload: true, releaseTag: "engines-20261107.9", fileName: "fixture.zip", size: bytes.length,
    sha256: hash(bytes), manifestSha256: hash(files["engine-manifest.json"]),
    url: "https://github.com/Simlym/qidao/releases/download/engines-20261107.9/fixture.zip" };
  return { bytes, spec };
}
function environment(t) {
  const storage = globalThis.localStorage, caches = globalThis.caches;
  const previous = { id: "old", variant: "xiangqi", base: "/__user-engines__/xiangqi/old/" };
  const values = new Map([["xq.browserEngine.xiangqi", JSON.stringify(previous)]]);
  const entries = new Map([[`${previous.base}worker.js`, new Response("old")]]);
  globalThis.localStorage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const cache = {
    put: async (key, value) => { entries.set(key, value); },
    keys: async () => [...entries.keys()].map((path) => new Request(`https://test.example${path}`)),
    delete: async (request) => entries.delete(new URL(request.url).pathname),
  };
  globalThis.caches = { open: async () => cache };
  t.after(() => { globalThis.localStorage = storage; globalThis.caches = caches; });
  return { values, entries, cache, previous };
}
const options = (bytes, extra = {}) => ({ capabilities, deliveryUrl: (spec) => spec.url, download: async () => bytes, probe: async () => true, ...extra });

test("在线 WASM 在全部校验和候选握手后才切换并清理旧包", async (t) => {
  const { values, entries, previous } = environment(t);
  const { bytes, spec } = fixture();
  const profile = await installBrowserEngine(spec, "xiangqi", options(bytes, { probe: async (candidate) => {
    assert.equal(JSON.parse(values.get("xq.browserEngine.xiangqi")).id, "old");
    assert.ok(entries.has(`${candidate.base}engine.worker.js`));
    assert.ok(entries.has(`${previous.base}worker.js`));
    return true;
  } }));
  assert.equal(JSON.parse(values.get("xq.browserEngine.xiangqi")).base, profile.base);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(entries.size, 2);
});

test("校验失败、握手失败和缓存空间不足都保留旧引擎", async (t) => {
  const { entries, values, cache } = environment(t);
  const { bytes, spec } = fixture();
  await assert.rejects(installBrowserEngine({ ...spec, sha256: "0".repeat(64) }, "xiangqi", options(bytes)), /校验失败/);
  await assert.rejects(installBrowserEngine(spec, "xiangqi", options(bytes, { probe: async () => false })), /握手失败/);
  let writes = 0;
  const put = cache.put;
  cache.put = async (...args) => { if (++writes === 2) throw new Error("缓存空间不足"); await put(...args); };
  await assert.rejects(installBrowserEngine(spec, "xiangqi", options(bytes)), /缓存空间不足/);
  assert.equal(JSON.parse(values.get("xq.browserEngine.xiangqi")).id, "old");
  assert.equal(entries.size, 1);
});

test("离开页面或在候选握手期间取消，不启用迟到的包", async (t) => {
  const { entries, values } = environment(t);
  const { bytes, spec } = fixture();
  const controller = new AbortController();
  await assert.rejects(installBrowserEngine(spec, "xiangqi", options(bytes, { signal: controller.signal, probe: async () => {
    controller.abort(); return true;
  } })), { name: "AbortError" });
  await assert.rejects(installBrowserEngine(spec, "xiangqi", options(bytes, { isCurrent: () => false })), { name: "AbortError" });
  assert.equal(JSON.parse(values.get("xq.browserEngine.xiangqi")).id, "old");
  assert.equal(entries.size, 1);
});

test("WASM 拒绝跨棋种、未发布、多线程不兼容和外部下载地址", () => {
  const { spec } = fixture();
  for (const modified of [{ ...spec, variant: "jieqi" }, { ...spec, publicDownload: false },
    { ...spec, threads: true }, { ...spec, url: "https://other.example/engine.zip" }]) {
    assert.throws(() => validateWasmDownload(modified, "xiangqi", capabilities));
  }
});

test("即使 ZIP 哈希匹配也拒绝穿越路径、额外文件和资源哈希错误", async (t) => {
  const { entries } = environment(t);
  for (const change of [(files) => { files["../evil.js"] = strToU8("evil"); },
    (files) => { files["extra.js"] = strToU8("extra"); },
    (files) => { files["engine.worker.js"] = strToU8("changed"); }]) {
    const { bytes, spec } = fixture(change);
    await assert.rejects(installBrowserEngine(spec, "xiangqi", options(bytes)));
    assert.equal(entries.size, 1);
  }
});

test("写配置失败时清理候选缓存，旧配置与文件仍在", async (t) => {
  const { entries, values } = environment(t);
  const { bytes, spec } = fixture();
  globalThis.localStorage.setItem = () => { throw new Error("配置写入失败"); };
  await assert.rejects(installBrowserEngine(spec, "xiangqi", options(bytes)), /配置写入失败/);
  assert.equal(JSON.parse(values.get("xq.browserEngine.xiangqi")).id, "old");
  assert.equal(entries.size, 1);
});

test("ZIP 文件数和声明解压量超过上限时在写缓存前拒绝", async (t) => {
  const { entries } = environment(t);
  const many = fixture((files) => { for (let i = 0; i < 41; i++) files[`file-${i}`] = strToU8("x"); });
  await assert.rejects(installBrowserEngine(many.spec, "xiangqi", options(many.bytes)), /限制/);
  const { bytes, spec } = fixture();
  // 修改中央目录的原始大小，模拟压缩包声明巨量输出。
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < bytes.length - 46; i++) {
    if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 300 * 1024 * 1024, true); break; }
  }
  spec.sha256 = hash(bytes);
  await assert.rejects(installBrowserEngine(spec, "xiangqi", options(bytes)), /限制/);
  assert.equal(entries.size, 1);
});
