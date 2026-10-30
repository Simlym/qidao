import assert from "node:assert/strict";
import test from "node:test";
import { normalizeJieqiAnalysis } from "./analysisResult.js";

test("揭棋扩展着法仅使用合法的四位坐标绘制提示", () => {
  const result = normalizeJieqiAnalysis({ bestMove: "a3a4R", cp: 30 }, ["a3a4", "b3b4"]);
  assert.deepEqual(result, { bestMove: "a3a4", rawBestMove: "a3a4R", cp: 30 });
});

test("禁止显示引擎推荐的非法揭棋着法", () => {
  const result = normalizeJieqiAnalysis({ bestMove: "a3a4R" }, ["b3b4"]);
  assert.equal(result.bestMove, null);
  assert.equal(result.rawBestMove, "a3a4R");
});
