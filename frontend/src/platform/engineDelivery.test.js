import test from "node:test";
import assert from "node:assert/strict";
import { engineDeliveryUrl } from "./engineDelivery.js";

const spec = { releaseTag: "engines-20261107.3", fileName: "fairy-wasm.zip" };
test("默认下载由 GitHub 承担带宽，不依赖当前业务站点", () => {
  assert.equal(engineDeliveryUrl(spec), "https://simlym.github.io/qidao/engine-releases/engines-20261107.3/fairy-wasm.zip");
});
test("WASM 静态分发保留固定标签和文件，安卓可使用 HTTPS 站点", () => {
  assert.equal(engineDeliveryUrl(spec, { base: "https://chess.example/engine-releases/" }),
    "https://chess.example/engine-releases/engines-20261107.3/fairy-wasm.zip");
  for (const base of ["", "http://chess.example/engine-releases", "https://user:pass@chess.example/engine-releases",
    "https://chess.example/engine-releases?token=x", "https://chess.example/arbitrary"]) {
    assert.throws(() => engineDeliveryUrl(spec, { base, allowHttp: false }));
  }
  assert.throws(() => engineDeliveryUrl({ ...spec, fileName: "../escape.zip" }, { base: "https://chess.example/engine-releases" }));
});
