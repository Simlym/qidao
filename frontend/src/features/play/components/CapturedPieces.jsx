import React from "react";

export default function CapturedPieces({ capt }) {
  if (capt.red.length + capt.black.length === 0) return null;
  return (
<div className="panel captured-bar">
              <div className="captured-row">
                <span className="captured-label">红方失子</span>
                {capt.red.map((g, i) => (
                  <span key={i} className="captured-piece red">{g}</span>
                ))}
              </div>
              <div className="captured-row">
                <span className="captured-label">黑方失子</span>
                {capt.black.map((g, i) => (
                  <span key={i} className="captured-piece black">{g}</span>
                ))}
                {Math.abs(capt.diff) >= 1 && (
                  <span className={"captured-diff" + (capt.diff > 0 ? " red" : "")}>
                    {capt.diff > 0 ? "红方" : "黑方"}子力 +{Math.abs(capt.diff).toFixed(1).replace(/\.0$/, "")}
                  </span>
                )}
              </div>
            </div>
  );
}
