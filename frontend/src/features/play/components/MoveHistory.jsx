import React from "react";
import { fmtMoveTime, moveLogItems } from "../model";

// 移动端与桌面检查器共用一份棋谱列表（ref 保持原滚动逻辑）。
export default function MoveHistory({ moveLog, timesLog, logRef }) {
  return (
    <div className="move-history">
      <div className="move-history-heading" aria-hidden="true">
        <span>回合</span><span>红方</span><span>黑方</span>
      </div>
      <ol className="move-log-list" ref={logRef} aria-label="对局棋谱">
        {moveLogItems(moveLog).map((pair, i) => (
          <li key={i}>
            <span className="move-log-no">{i + 1}.</span>
            <span className={"move-log-cell red" + (moveLog.length - 1 === i * 2 ? " latest" : "")}>
              <span>{pair[0] || "…"}</span>
              {timesLog[i * 2] != null && <i className="move-time">{fmtMoveTime(timesLog[i * 2])}</i>}
            </span>
            <span className={"move-log-cell black" + (moveLog.length - 1 === i * 2 + 1 ? " latest" : "")}>
              <span>{pair[1] || ""}</span>
              {pair[1] && timesLog[i * 2 + 1] != null && <i className="move-time">{fmtMoveTime(timesLog[i * 2 + 1])}</i>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
