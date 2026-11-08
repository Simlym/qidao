import React from "react";

// 手机对局使用固定高度舞台，棋谱和分析只在独立面板内滚动。
export default function MobileGameLayout({
  variant, title, status, opponent, self, moveCount, children,
  menu, history, analysis, panel, onPanelChange, onUndo, canUndo, onHint, canHint, hintLoading,
  toolbar, onBack,
}) {
  const sheet = React.useRef(null);
  const panelTitle = { menu: "对局菜单", history: "本局棋谱", analysis: "局面分析" }[panel];
  React.useLayoutEffect(() => {
    document.body.classList.add("mobile-game-open");
    window.scrollTo(0, 0);
    return () => document.body.classList.remove("mobile-game-open");
  }, []);
  React.useEffect(() => {
    if (panel && !sheet.current.open) sheet.current.showModal();
    if (!panel && sheet.current.open) sheet.current.close();
  }, [panel]);
  return <div className={`play mobile-game ${variant}-play`}>
    <div className="mobile-game-heading">{onBack && <button onClick={onBack} aria-label="返回棋谱列表">‹ 返回</button>}<strong>{title}</strong><button onClick={() => onPanelChange("history")} aria-label={`查看棋谱，已走 ${moveCount} 步`}>{moveCount} 步 · 棋谱 ›</button></div>
    <div className={`mobile-player opponent ${opponent.side || ""}`}><span className="mobile-player-avatar">{opponent.mark}</span><div><strong>{opponent.name}</strong><small>{opponent.detail}</small></div><span className="mobile-turn" role="status">{status}</span></div>
    <div className="mobile-board-space"><div className="play-board-area">{children}</div></div>
    <div className={`mobile-player self ${self.side || ""}`}><span className="mobile-player-avatar">{self.mark}</span><div><strong>{self.name}</strong><small>{self.detail}</small></div></div>
    {toolbar || <nav className="mobile-game-toolbar" aria-label="对局操作">
      <button onClick={() => onPanelChange("menu")}><span aria-hidden>☰</span>菜单</button>
      <button onClick={() => onPanelChange("analysis")}><span aria-hidden>↗</span>分析</button>
      <button disabled={!canUndo} onClick={onUndo}><span aria-hidden>↶</span>悔棋</button>
      <button disabled={!canHint} onClick={onHint}><span aria-hidden>◇</span>{hintLoading ? "思考中" : "提示"}</button>
    </nav>}
    <dialog ref={sheet} className="mobile-game-sheet" aria-label={panelTitle || "对局面板"} onCancel={(event) => { if (event.target === sheet.current) onPanelChange(null); }} onClose={(event) => { if (event.target === sheet.current && !sheet.current.open) onPanelChange(null); }} onClick={(event) => { if (event.target === sheet.current) { const rect = sheet.current.getBoundingClientRect(); if (event.clientY < rect.top || event.clientX < rect.left || event.clientX > rect.right || event.clientY > rect.bottom) onPanelChange(null); } }}>
      <div className="mobile-sheet-heading"><h2>{panelTitle}</h2><button onClick={() => onPanelChange(null)} aria-label="关闭对局面板">×</button></div>
      <div className="mobile-sheet-content">{panel === "menu" ? menu : panel === "history" ? history : analysis}</div>
    </dialog>
  </div>;
}
