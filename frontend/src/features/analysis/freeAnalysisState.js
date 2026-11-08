import { INITIAL_FEN, applyMove } from "../../domain/xiangqi/xiangqi.js";
import { getLocalPositionState } from "../../domain/xiangqi/rules.js";

export function createAnalysis(fen = INITIAL_FEN) {
  return { positions: [{ fen, move: null }], cursor: 0 };
}

// 推荐着法必须通过当前局面校验，才能用于箭头和直接落子。
export function recommendedMove(data, legalMoves) {
  const line = data?.lines?.find((item) => item.multipv === 1) || data?.lines?.[0];
  const move = line?.pv?.[0] || data?.bestMove || data?.pv?.[0];
  return legalMoves.includes(move) ? move : null;
}

// 回看后落子会从当前局面开始新的变化，不让旧线路混入新棋谱。
export function analysisReducer(state, action) {
  if (action.type === "reset") return createAnalysis(action.fen);
  if (action.type === "seek") return { ...state, cursor: Math.max(0, Math.min(state.positions.length - 1, action.cursor)) };
  if (action.type !== "move") return state;
  const fen = state.positions[state.cursor].fen;
  if (!getLocalPositionState(fen).legal_moves.includes(action.move)) return state;
  return {
    positions: [...state.positions.slice(0, state.cursor + 1), { fen: applyMove(fen, action.move), move: action.move }],
    cursor: state.cursor + 1,
  };
}
