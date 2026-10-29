import React from "react";
import { fmtMoveTime, moveLogItems } from "../model";

// 移动端与桌面检查器共用一份棋谱列表（ref 保持原滚动逻辑）。
export default function MoveHistory({ moveLog, timesLog, logRef }) {
  return (
<ol className="move-log-list" ref={logRef}>
                    {moveLogItems(moveLog).map((pair, i) => (
                      <li key={i}>
                        <span className="move-log-no">{i + 1}.</span>
                        <span className={"move-log-cell" + (moveLog.length - 1 === i * 2 ? " latest" : "")}>
                          {pair[0] || "…"}
                          {timesLog[i * 2] != null && <i className="move-time">{fmtMoveTime(timesLog[i * 2])}</i>}
                        </span>
                        <span className={"move-log-cell" + (moveLog.length - 1 === i * 2 + 1 ? " latest" : "")}>
                          {pair[1] || ""}
                          {pair[1] && timesLog[i * 2 + 1] != null && <i className="move-time">{fmtMoveTime(timesLog[i * 2 + 1])}</i>}
                        </span>
                      </li>
                    ))}
                  </ol>
  );
}
