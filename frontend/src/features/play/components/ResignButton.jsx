import React from "react";

// 各端共用确认步骤，避免误触认输；对局先结束时自动关闭确认框。
export default function ResignButton({ onResign, disabled, label = "认输", className = "btn-newgame" }) {
  const dialog = React.useRef(null);
  React.useEffect(() => { if (disabled) dialog.current?.close(); }, [disabled]);
  return <>
    <button className={className} disabled={disabled} onClick={() => dialog.current.showModal()}>{label}</button>
    <dialog ref={dialog} className="resign-dialog" aria-label="确认认输">
      <h3>确定{label}？</h3>
      <p>本局将结束，并记录为对方获胜。</p>
      <div className="resign-dialog-actions">
        <button autoFocus onClick={() => dialog.current.close()}>继续对弈</button>
        <button className="danger" disabled={disabled} onClick={() => { dialog.current.close(); onResign(); }}>确认认输</button>
      </div>
    </dialog>
  </>;
}
