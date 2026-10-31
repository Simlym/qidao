import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getLocalPositionState } from "./rules.js";

const fixtures = JSON.parse(readFileSync(new URL("./rules.fixtures.json", import.meta.url), "utf8"));
test("本地象棋棋规与 Python 棋规的开中局样本一致", () => {
  for (const fixture of fixtures) {
    const result = getLocalPositionState(fixture.fen);
    assert.deepEqual(result.legal_moves.sort(), fixture.legal_moves, fixture.fen);
    assert.equal(result.status, fixture.status, fixture.fen);
  }
});

test("本地棋规识别白脸将、将死与困毙", () => {
  assert.equal(getLocalPositionState("4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1").status, "check");
  assert.equal(getLocalPositionState("9/9/9/9/9/9/9/9/9/4K4 b - - 0 1").status, "checkmate");
  assert.equal(getLocalPositionState("4k4/R8/3R1R3/9/4P4/9/9/9/9/4K4 b - - 0 1").status, "stalemate");
});
