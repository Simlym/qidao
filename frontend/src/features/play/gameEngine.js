import { applyMove, INITIAL_FEN } from "../../domain/xiangqi/xiangqi.js";
import { PLAY_DEPTH, terminalResult } from "./model.js";

// 对弈引擎决策与 React 生命周期无关，便于测试本地引擎/云端降级。
export async function createPlayRound({ side, level, localRuntime, engine, api }) {
  if (side === "b" && localRuntime) {
    try {
      const initial = await api.getPositionState(INITIAL_FEN);
      const analysis = await engine.evaluate(INITIAL_FEN, { depth: PLAY_DEPTH[level] }, { onlyKinds: [localRuntime] });
      if (!analysis.bestMove || !initial.legal_moves.includes(analysis.bestMove)) {
        throw new Error("本地引擎返回了不合法着法");
      }
      const fen = applyMove(INITIAL_FEN, analysis.bestMove);
      const position = await api.getPositionState(fen);
      return { fen, engine_move: analysis.bestMove, status: position.status, legal_moves: position.legal_moves };
    } catch {
      // 本地引擎初始化失败时使用原有云端接口。
    }
  }
  return api.newPlayGame({ human_side: side, level });
}

export async function resolvePlayTurn({ fen, move, level, localRuntime, engine, api, onLocalFailure }) {
  if (localRuntime) {
    try {
      const afterHumanFen = applyMove(fen, move);
      const afterHuman = await api.getPositionState(afterHumanFen);
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
      const afterEngine = await api.getPositionState(nextFen);
      const result = terminalResult(afterEngine.status, "engine");
      return {
        fen: nextFen, engine_move: analysis.bestMove, status: afterEngine.status,
        legal_moves: result.game_over ? [] : afterEngine.legal_moves,
        your_turn: true, ...result,
      };
    } catch {
      // 原局面整个回合回退服务器；不把乐观更新的中间局面传给后端。
      onLocalFailure?.();
    }
  }
  return api.playMove({ fen, move, level });
}
