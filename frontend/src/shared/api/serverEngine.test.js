import test from "node:test";
import assert from "node:assert/strict";
import { installServerEngine } from "./serverEngine.js";

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
