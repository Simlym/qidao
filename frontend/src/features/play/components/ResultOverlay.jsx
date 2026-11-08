import React from "react";
import { fmtDuration } from "../model";

// 不影响主棋盘生命周期的终局覆盖层。
export default function ResultOverlay({
  over, overDismissed, winnerText, localNotice, moveLog, totalMs, saved, savedGameId,
  onGoReview, onDismiss, onRestart, onExit,
}) {
  if (!over || overDismissed) return null;
  const verdict = over.winner === "human" ? "win" : over.winner === "engine" ? "lose" : over.winner === "draw" ? "draw" : "ended";
  return <div className="play-over">
    <section className={`panel result game-result ${verdict}`} aria-label="对局结果">
      <button className="play-over-close" onClick={onDismiss} aria-label="关闭结果，查看终局棋盘">×</button>
      <span className="game-result-seal" aria-hidden>{({ win: "胜", lose: "负", draw: "和", ended: "终" })[verdict]}</span>
      <p className="game-result-eyebrow">对局结束</p>
      <h3>{winnerText}</h3>
      <p className="game-result-meta">{moveLog.length} 步 · {Math.ceil(moveLog.length / 2)} 回合{totalMs > 0 && ` · ${fmtDuration(totalMs)}`}</p>
      <p className="muted">{localNotice || (saved ? "已存入「复盘」。" : "正在保存到本机…")}</p>
      <div className="game-result-actions">
        <button className="secondary" onClick={onExit}>退出对局</button>
        <button onClick={onRestart}>再来一盘</button>
        {saved && savedGameId && onGoReview && <button className="review" onClick={() => onGoReview(savedGameId)}>复盘本局</button>}
      </div>
    </section>
  </div>;
}
