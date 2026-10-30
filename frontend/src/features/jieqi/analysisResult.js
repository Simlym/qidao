// 揭棋引擎可能返回带身份扩展后缀的着法；UI 只能高亮真实合法的四位坐标。
export function normalizeJieqiAnalysis(data, legalMoves) {
  const rawBestMove = data?.bestMove ?? null;
  const baseMove = rawBestMove?.slice(0, 4) || null;
  const playable = baseMove != null && legalMoves.includes(baseMove);
  return { ...data, bestMove: playable ? baseMove : null, rawBestMove };
}
