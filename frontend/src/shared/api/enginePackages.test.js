import test from "node:test";
import assert from "node:assert/strict";
import { downloadEngineBytes } from "./enginePackages.js";

test("引擎下载不带会话凭据，并校验流的精确大小", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_url, config) => {
    assert.equal(config.credentials, "omit");
    assert.equal(config.cache, "no-store");
    assert.equal(config.headers, undefined);
    return new Response(new Uint8Array([1, 2, 3]));
  };
  assert.deepEqual(await downloadEngineBytes("https://test.example/file", 3), new Uint8Array([1, 2, 3]));
  await assert.rejects(downloadEngineBytes("https://test.example/file", 2), /超过/);
  await assert.rejects(downloadEngineBytes("https://test.example/file", 4), /不完整/);
});
