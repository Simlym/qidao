import assert from "node:assert/strict";
import test from "node:test";
import { applyMove, INITIAL_FEN } from "../../domain/xiangqi/xiangqi.js";
import { createPlayRound, resolvePlayTurn } from "./gameEngine.js";

const HUMAN = "a3a4";
const ENGINE = "a6a5";
const afterHuman = applyMove(INITIAL_FEN, HUMAN);

test("未启用本地引擎时执红开局走服务端接口", async () => {
  const calls = [];
  const output = { fen: INITIAL_FEN, legal_moves: [HUMAN], status: "ongoing" };
  const result = await createPlayRound({
    side: "w", level: "easy", localRuntime: null,
    engine: { evaluate() { throw new Error("不应调用"); } },
    api: { newPlayGame: async (input) => { calls.push(input); return output; } },
  });
  assert.equal(result, output);
  assert.deepEqual(calls, [{ human_side: "w", level: "easy" }]);
});

test("执黑开局本地引擎先手，着法经过合法性检查", async () => {
  const first = HUMAN;
  const api = {
    getPositionState: async (fen) => fen === INITIAL_FEN
      ? { legal_moves: [first] } : { status: "ongoing", legal_moves: [HUMAN] },
    newPlayGame: async () => { throw new Error("不应降级"); },
  };
  const r = await createPlayRound({
    side: "b", level: "hard", localRuntime: "native",
    engine: { evaluate: async () => ({ bestMove: first }) }, api,
  });
  assert.equal(r.engine_move, first);
  assert.equal(r.fen, applyMove(INITIAL_FEN, first));
});

test("开局本地引擎不可用或着法非法时降级", async () => {
  const fallback = { fen: INITIAL_FEN };
  const result = await createPlayRound({
    side: "b", level: "medium", localRuntime: "wasm",
    engine: { evaluate: async () => ({ bestMove: "invalid" }) },
    api: { getPositionState: async () => ({ legal_moves: [ENGINE] }), newPlayGame: async () => fallback },
  });
  assert.equal(result, fallback);
});

test("落子完成本地引擎合法应着，并保留回合结果", async () => {
  const nextFen = applyMove(afterHuman, ENGINE);
  const r = await resolvePlayTurn({
    fen: INITIAL_FEN, move: HUMAN, level: "easy", localRuntime: "native",
    engine: { evaluate: async () => ({ bestMove: ENGINE }) },
    api: { getPositionState: async (fen) => fen === afterHuman
      ? { status: "ongoing", legal_moves: [ENGINE] }
      : { status: "check", legal_moves: [HUMAN] },
      playMove: async () => { throw new Error("不应降级"); } },
  });
  assert.equal(r.fen, nextFen);
  assert.equal(r.engine_move, ENGINE);
  assert.equal(r.status, "ongoing");
});

test("人类落子后已结束则引擎不再应着", async () => {
  const r = await resolvePlayTurn({
    fen: "4k4/4R4/9/9/9/4P4/9/9/9/4K4 w - - 0 1", move: "e8e9", level: "medium", localRuntime: "wasm",
    engine: { evaluate: async () => { throw new Error("不应调用"); } },
    api: { getPositionState: async () => ({ status: "checkmate", legal_moves: [] }) },
  });
  assert.equal(r.game_over, true);
  assert.equal(r.winner, "human");
  assert.equal(r.engine_move, null);
});

test("落子本地引擎非法应着时完整降级并通知界面", async () => {
  let failed = 0, fallbackInput;
  const fallback = { fen: "server-fen", engine_move: ENGINE };
  const r = await resolvePlayTurn({
    fen: INITIAL_FEN, move: HUMAN, level: "hard", localRuntime: "wasm",
    engine: { evaluate: async () => ({ bestMove: "bad" }) },
    api: {
      getPositionState: async () => ({ status: "ongoing", legal_moves: [ENGINE] }),
      playMove: async (input) => { fallbackInput = input; return fallback; },
    },
    onLocalFailure: () => { failed++; },
  });
  assert.equal(r, fallback);
  assert.deepEqual(fallbackInput, { fen: INITIAL_FEN, move: HUMAN, level: "hard" });
  assert.equal(failed, 1);
});

test("云端返回失败可透传，让页面负责回滚乐观落子", async () => {
  await assert.rejects(resolvePlayTurn({
    fen: INITIAL_FEN, move: HUMAN, level: "easy", localRuntime: null,
    api: { playMove: async () => { throw new Error("server down"); } },
  }), /server down/);
});


test("本地引擎的开局与完整回合无需网络", async () => {
  const api = new Proxy({}, { get() { throw new Error("离线不得访问服务端"); } });
  const start = await createPlayRound({ side: "w", level: "easy", localRuntime: "native", api });
  assert.ok(start.legal_moves.includes(HUMAN));
  const next = await resolvePlayTurn({ fen: start.fen, move: HUMAN, level: "easy", localRuntime: "native",
    engine: { evaluate: async () => ({ bestMove: ENGINE }) }, api });
  assert.equal(next.fen, applyMove(afterHuman, ENGINE));
});
