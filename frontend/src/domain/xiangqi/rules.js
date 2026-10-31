import { parseFen, toSquare } from "./xiangqi.js";

// 与后端 shared/xiangqi/validation.py 保持一致，离线也可判定走法。
const sideOf = (p) => p === p.toUpperCase() ? "w" : "b";
const on = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 9;
const palace = (r, c, side) => c >= 3 && c <= 5 && (side === "w" ? r >= 7 && r <= 9 : r >= 0 && r <= 2);

function targets(board, r, c) {
  const p = board[r][c];
  if (!p) return [];
  const side = sideOf(p), red = side === "w", kind = p.toUpperCase(), out = [];
  const empty = (r, c) => on(r, c) && !board[r][c];
  const add = (r, c) => { if (on(r, c) && (!board[r][c] || sideOf(board[r][c]) !== side)) out.push([r, c]); };
  if (kind === "K" || kind === "A") {
    const offsets = kind === "K" ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dr, dc] of offsets) if (palace(r + dr, c + dc, side)) add(r + dr, c + dc);
  } else if (kind === "B") {
    for (const dr of [-2, 2]) for (const dc of [-2, 2]) {
      const nr = r + dr, nc = c + dc;
      if (on(nr, nc) && empty(r + dr / 2, c + dc / 2) && (red ? nr >= 5 : nr <= 4)) add(nr, nc);
    }
  } else if (kind === "N") {
    for (const [dr, dc, br, bc] of [[2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0], [1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1]]) {
      if (empty(r + br, c + bc)) add(r + dr, c + dc);
    }
  } else if (kind === "R" || kind === "C") {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let jumped = false;
      for (let nr = r + dr, nc = c + dc; on(nr, nc); nr += dr, nc += dc) {
        const cell = board[nr][nc];
        if (!jumped) {
          if (!cell) out.push([nr, nc]);
          else {
            if (kind === "R") { add(nr, nc); break; }
            jumped = true;
          }
        } else if (cell) { add(nr, nc); break; }
      }
    }
  } else if (kind === "P") {
    add(r + (red ? -1 : 1), c);
    if (red ? r <= 4 : r >= 5) { add(r, c - 1); add(r, c + 1); }
  }
  return out;
}

function inCheck(board, side) {
  let king, other;
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    if (board[r][c] === (side === "w" ? "K" : "k")) king = [r, c];
    if (board[r][c] === (side === "w" ? "k" : "K")) other = [r, c];
  }
  if (!king) return true;
  if (other && king[1] === other[1]) {
    let blocked = false;
    for (let r = Math.min(king[0], other[0]) + 1; r < Math.max(king[0], other[0]); r++) if (board[r][king[1]]) blocked = true;
    if (!blocked) return true;
  }
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    if (board[r][c] && sideOf(board[r][c]) !== side && targets(board, r, c).some(([nr, nc]) => nr === king[0] && nc === king[1])) return true;
  }
  return false;
}

export function getLocalPositionState(fen) {
  const board = parseFen(fen).map((row) => row.map((cell) => cell?.piece || null));
  const side = fen.split(/\s+/)[1] === "b" ? "b" : "w";
  const legal_moves = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    if (!board[r][c] || sideOf(board[r][c]) !== side) continue;
    for (const [nr, nc] of targets(board, r, c)) {
      const next = board.map((row) => [...row]);
      next[nr][nc] = next[r][c]; next[r][c] = null;
      if (!inCheck(next, side)) legal_moves.push(toSquare(r, c) + toSquare(nr, nc));
    }
  }
  const check = inCheck(board, side);
  return { fen, legal_moves, status: legal_moves.length ? (check ? "check" : "ongoing") : (check ? "checkmate" : "stalemate") };
}
