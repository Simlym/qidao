import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_FEN, applyMove } from "../../domain/xiangqi/xiangqi.js";
import { createAnalysis, analysisReducer, recommendedMove } from "./freeAnalysisState.js";

test("推荐着法兼容完整和流式结果，拒绝不属于当前局面的着法", () => {
  const legal = ["h2e2", "b0c2"];
  assert.equal(recommendedMove({ bestMove: "h2e2" }, legal), "h2e2");
  assert.equal(recommendedMove({ pv: ["b0c2"] }, legal), "b0c2");
  assert.equal(recommendedMove({ lines: [{ multipv: 2, pv: ["h2e2"] }, { multipv: 1, pv: ["b0c2"] }] }, legal), "b0c2");
  assert.equal(recommendedMove({ bestMove: "h9g7" }, legal), null);
  assert.equal(recommendedMove(null, legal), null);
});

test("自由分析允许红黑双方依次手动走棋，每次只增加一着", () => {
  let state = createAnalysis();
  state = analysisReducer(state, { type: "move", move: "h2e2" });
  assert.equal(state.cursor, 1);
  assert.equal(state.positions.length, 2);
  assert.equal(state.positions[1].fen, applyMove(INITIAL_FEN, "h2e2"));
  state = analysisReducer(state, { type: "move", move: "h9g7" });
  assert.equal(state.cursor, 2);
  assert.equal(state.positions[2].fen.split(" ")[1], "w");
});

test("回看可前进，改走时替换后续变化，拒绝非法和非当前方走法", () => {
  let state = createAnalysis();
  assert.equal(analysisReducer(state, { type: "move", move: "h9g7" }), state);
  state = analysisReducer(state, { type: "move", move: "h2e2" });
  state = analysisReducer(state, { type: "move", move: "h9g7" });
  const endFen = state.positions[2].fen;
  state = analysisReducer(state, { type: "seek", cursor: 1 });
  state = analysisReducer(state, { type: "seek", cursor: 2 });
  assert.equal(state.positions[state.cursor].fen, endFen);
  state = analysisReducer(state, { type: "seek", cursor: 0 });
  state = analysisReducer(state, { type: "move", move: "b0c2" });
  assert.equal(state.positions.length, 2);
  assert.equal(state.positions[1].move, "b0c2");
  assert.equal(analysisReducer(state, { type: "move", move: "a0a9" }), state);
});

test("从对弈局面进入时保留轮次，重置回到传入局面", () => {
  const fen = applyMove(INITIAL_FEN, "h2e2");
  let state = createAnalysis(fen);
  state = analysisReducer(state, { type: "move", move: "h9g7" });
  assert.equal(state.cursor, 1);
  state = analysisReducer(state, { type: "reset", fen });
  assert.deepEqual(state, createAnalysis(fen));
});
