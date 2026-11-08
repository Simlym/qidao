import React from "react";
import ResignButton from "./ResignButton";
import RestartButton from "./RestartButton";

// 常用操作常驻，低频操作按需展开；认输沿用独立确认框。
export default function PlayInspectorActions({
  onHint, hintLoading, canHint, onUndo, canUndo,
  onFreeAnalysis, thinking, onCopy, copied, onRestart, onResign,
  over, onShowResult,
}) {
  const moreRef = React.useRef(null);
  React.useEffect(() => {
    const closeOutside = (event) => {
      if (!moreRef.current?.contains(event.target)) moreRef.current?.removeAttribute("open");
    };
    const closeOnEscape = (event) => {
      const details = moreRef.current;
      if (event.key !== "Escape" || !details?.open || details.querySelector("dialog[open]")) return;
      details.removeAttribute("open");
      details.querySelector("summary")?.focus();
      event.stopPropagation();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const run = (action) => () => {
    moreRef.current?.removeAttribute("open");
    moreRef.current?.querySelector("summary")?.focus();
    action();
  };

  return <div className="desktop-inspector-actions play-compact-actions">
    <button className="primary" onClick={onHint} disabled={!canHint} title="推荐一步（H）">
      {hintLoading ? "思考中…" : "提示"}
    </button>
    <button onClick={onUndo} disabled={!canUndo} title="悔棋（Ctrl+Z）">悔棋</button>
    <details className="play-more-actions" ref={moreRef}>
      <summary>更多 <span aria-hidden="true">···</span></summary>
      <div className="play-more-menu" aria-label="更多对局操作">
        {onFreeAnalysis && <button onClick={run(onFreeAnalysis)} disabled={thinking}>转为自由分析</button>}
        <button onClick={run(onCopy)}>{copied ? "已复制" : "复制局面"}</button>
        {onShowResult && <button onClick={run(onShowResult)}>查看结果</button>}
        <div className="play-more-divider" />
        <RestartButton className="danger" finished={over} onRestart={run(onRestart)} />
        <ResignButton className="danger" disabled={over} onResign={run(onResign)} />
      </div>
    </details>
  </div>;
}
