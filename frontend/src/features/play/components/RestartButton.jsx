import React from "react";

// 重开保留当前先后手和难度，与返回准备页的退出操作分开。
export default function RestartButton({ onRestart, finished, className = "btn-newgame", label = "重新开局" }) {
  const dialog = React.useRef(null);
  React.useEffect(() => { if (finished) dialog.current?.close(); }, [finished]);
  return <>
    <button className={className} onClick={() => {
      if (finished) onRestart();
      else dialog.current.showModal();
    }}>{label}</button>
    <dialog ref={dialog} className="resign-dialog" aria-label="重新开局确认">
      <h3>重新开始一盘？</h3>
      <p>将按当前先后手和难度开始新对局。本局已保存到本机，可稍后继续。</p>
      <div className="resign-dialog-actions">
        <button autoFocus onClick={() => dialog.current.close()}>继续当前对局</button>
        <button className="danger" onClick={() => { dialog.current.close(); onRestart(); }}>确认重开</button>
      </div>
    </dialog>
  </>;
}
