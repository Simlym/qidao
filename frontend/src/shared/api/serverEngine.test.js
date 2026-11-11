import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installServerEngine, uploadServerEngine } from "./serverEngine.js";

beforeEach((t) => {
  const original = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  t.after(() => {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  });
});

test("服务器引擎安装只在完成事件后报告成功，支持分片中文进度", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const progress = [];
  globalThis.fetch = async (url, config) => {
    assert.match(url, /admin\/engine\/xiangqi\/installation$/);
    assert.deepEqual(JSON.parse(config.body), { action: "download", package_id: "fixed" });
    const bytes = new TextEncoder().encode('{"type":"progress","data":{"phase":"testing","message":"试算"}}\n{"type":"complete","data":{"available":true}}\n');
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(bytes.slice(0, 67)); controller.enqueue(bytes.slice(67)); controller.close();
    } }));
  };
  assert.deepEqual(await installServerEngine("xiangqi", { action: "download", package_id: "fixed" }, { onProgress: (p) => progress.push(p) }), { available: true });
  assert.equal(progress[0].message, "试算");
});

test("服务器失败或缺少最终结果时不报告启用成功", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('{"type":"error","data":{"message":"权重校验失败"}}\n');
  await assert.rejects(installServerEngine("jieqi", {}), /权重校验失败/);
  globalThis.fetch = async () => new Response('{"type":"progress","data":{"phase":"testing"}}\n');
  await assert.rejects(installServerEngine("jieqi", {}), /未返回启用结果/);
});

test("引擎包上传发送文件本体并遵循连接取消信号", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const file = new Blob(["fixed ZIP bytes"], { type: "application/zip" });
  globalThis.fetch = async (url, options) => {
    assert.match(url, /\/xiangqi\/upload$/);
    assert.equal(options.body, file);
    assert.equal(options.headers["Content-Type"], "application/zip");
    assert.equal(options.credentials, "omit");
    assert.equal(options.signal.aborted, false);
    return new Response('{"type":"complete","data":{"available":true}}\n');
  };
  assert.deepEqual(await uploadServerEngine("xiangqi", file), { available: true });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(uploadServerEngine("xiangqi", file, { signal: controller.signal }), { name: "AbortError" });
});

test("上传被反向代理拒绝时显示可读的文件大小提示", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response("<html>413</html>", { status: 413 });
  await assert.rejects(uploadServerEngine("xiangqi", new Blob(["zip"])), /上传限制/);
});
