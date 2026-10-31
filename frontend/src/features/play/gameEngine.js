import { applyMove, INITIAL_FEN } from "../../domain/xiangqi/xiangqi.js";
import { getLocalPositionState } from "../../domain/xiangqi/rules.js";
import { PLAY_DEPTH, terminalResult } from "./model.js";

// 对弈引擎决策与 React 生命周期无关，便于测试本地引擎/云端降级。
export async function createPlayRound({ side, level, localRuntime, engine, api }) {
  if (localRuntime && side === "w") return getLocalPositionState(INITIAL_FEN);
  if (side === "b" && localRuntime) {
    try {
      const initial = getLocalPositionState(INITIAL_FEN);
      const analysis = await engine.evaluate(INITIAL_FEN, { depth: PLAY_DEPTH[level] }, { onlyKinds: [localRuntime] });
      if (!analysis.bestMove || !initial.legal_moves.includes(analysis.bestMove)) {
        throw new Error("本地引擎返回了不合法着法");
      }
      const fen = applyMove(INITIAL_FEN, analysis.bestMove);
      const position = getLocalPositionState(fen);
      return { fen, engine_move: analysis.bestMove, status: position.status, legal_moves: position.legal_moves };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      // 本地引擎初始化失败时使用原有云端接口。
    }
  }
  return api.newPlayGame({ human_side: side, level });
}

export async function resolvePlayTurn({ fen, move, level, localRuntime, engine, api, onLocalFailure }) {
  if (localRuntime) {
    try {
      if (!getLocalPositionState(fen).legal_moves.includes(move)) throw new Error("非法走法");
      const afterHumanFen = applyMove(fen, move);
      const afterHuman = getLocalPositionState(afterHumanFen);
      const humanResult = terminalResult(afterHuman.status, "human");
      if (humanResult.game_over) {
        return {
          fen: afterHumanFen, engine_move: null, status: afterHuman.status,
          legal_moves: [], your_turn: false, ...humanResult,
        };
      }
      const analysis = await engine.evaluate(afterHumanFen, { depth: PLAY_DEPTH[level] }, { onlyKinds: [localRuntime] });
      if (!analysis.bestMove || !afterHuman.legal_moves.includes(analysis.bestMove)) {
        throw new Error("本地引擎返回了不合法着法");
      }
      const nextFen = applyMove(afterHumanFen, analysis.bestMove);
      const afterEngine = getLocalPositionState(nextFen);
      const result = terminalResult(afterEngine.status, "engine");
      return {
        fen: nextFen, engine_move: analysis.bestMove, status: afterEngine.status,
        legal_moves: result.game_over ? [] : afterEngine.legal_moves,
        your_turn: true, ...result,
      };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      // 原局面整个回合回退服务器；不把乐观更新的中间局面传给后端。
      onLocalFailure?.();
    }
  }
  return api.playMove({ fen, move, level });
}
