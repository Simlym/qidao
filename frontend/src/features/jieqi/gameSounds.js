import { parseJieqiBoard } from "../../domain/xiangqi/jieqi/rules.js";

// 自由翻子由双方共用棋盘，分出胜负时统一播放获胜音。
export function jieqiMoveSound(previous, move, status, winner = null) {
  if (winner) return winner === "draw" ? "draw" : winner === "engine" ? "lose" : "win";
  if (status === "check") return "check";
  const board = parseJieqiBoard(previous);
  const captured = board[9 - Number(move[3])]?.["abcdefghi".indexOf(move[2])];
  return captured ? "capture" : "move";
}
