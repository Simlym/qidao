import React from "react";
import { fmtDuration } from "../model";

// 不影响主棋盘生命周期的终局覆盖层。
export default function ResultOverlay({
  over, overDismissed, winnerText, moveLog, totalMs, saved, savedGameId,
  onGoReview, onDismiss, onRestart,
}) {
  if (!over || overDismissed) return null;
  return (
<div className="play-over">
              <div className="panel result ok" style={{ textAlign: "center" }}>
                <button
                  className="play-over-close"
                  onClick={() => onDismiss()}
                  title="关闭，查看终局棋盘"
                >
                  ×
                </button>
                <h3>{winnerText}</h3>
                <p className="muted">
                  共 {Math.ceil(moveLog.length / 2)} 回合
                  {totalMs > 0 && ` · 用时 ${fmtDuration(totalMs)}`}
                  <br />
                  {saved ? "已存入「复盘」，正在自动分析本局得失。" : "本局未保存。"}
                </p>
                <div className="btn-row" style={{ justifyContent: "center" }}>
                  {saved && savedGameId && onGoReview && (
                    <button onClick={() => onGoReview(savedGameId)}>📋 去复盘本局</button>
                  )}
                  <button onClick={() => onRestart()}>再来一盘</button>
                </div>
              </div>
            </div>
  );
}
