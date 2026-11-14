import assert from "node:assert/strict";
import test from "node:test";
import { JIEQI_INITIAL_FEN, applyJieqiMove, jieqiStatus } from "../../domain/xiangqi/jieqi/rules.js";
import { jieqiMoveSound } from "./gameSounds.js";

test("揭棋翻子移动与电脑先手均播放走子音", () => {
  const move = "a3a4P";
  const next = applyJieqiMove(JIEQI_INITIAL_FEN, move);
  assert.equal(jieqiMoveSound(JIEQI_INITIAL_FEN, move, jieqiStatus(next)), "move");
  const reply = "a6a5p";
  const afterReply = applyJieqiMove(next, reply);
  assert.equal(jieqiMoveSound(next, reply, jieqiStatus(afterReply)), "move");
});

test("揭棋吃明子和暗子均按落子前的目标格播放吃子音", () => {
  assert.equal(jieqiMoveSound(JIEQI_INITIAL_FEN, "b2b7Cp", "ongoing"), "capture");
  const position = "4k4/9/9/9/4P4/9/p8/9/9/R3K4 w - - 0 1";
  assert.equal(jieqiMoveSound(position, "a0a3", "ongoing"), "capture");
  assert.equal(jieqiMoveSound(position, "a0a2", "ongoing"), "move");
});

test("将军和终局音优先，胜负视角区分人机与双方手动", () => {
  const fen = JIEQI_INITIAL_FEN;
  assert.equal(jieqiMoveSound(fen, "b2b7", "check"), "check");
  for (const [winner, sound] of [["human", "win"], ["engine", "lose"], ["w", "win"], ["b", "win"], ["draw", "draw"]]) {
    assert.equal(jieqiMoveSound(fen, "b2b7", "checkmate", winner), sound);
  }
});
