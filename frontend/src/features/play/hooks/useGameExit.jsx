import React from "react";
import { useBackAction } from "../../../shared/hooks/useBackAction";

// 对局中的菜单退出与系统返回走同一确认；终局可直接返回准备页。
export function useGameExit({ active, finished, onExit, savedLocally = false }) {
  const dialog = React.useRef(null);
  function requestExit() {
    if (finished) { onExit(); return; }
    if (!dialog.current.open) dialog.current.showModal();
  }
  useBackAction(() => { requestExit(); return true; }, { enabled: active, priority: 100 });
  const exitDialog = <dialog ref={dialog} className="resign-dialog" aria-label="退出对局确认">
    <h3>退出当前对局？</h3>
    <p>{savedLocally ? "将返回对弈准备页。本机已保存的对局可稍后继续。" : "将返回对弈准备页，当前未结束的对局不会保留。"}</p>
    <div className="resign-dialog-actions">
      <button autoFocus onClick={() => dialog.current.close()}>继续对弈</button>
      <button className="danger" onClick={() => { dialog.current.close(); onExit(); }}>退出对局</button>
    </div>
  </dialog>;
  return { requestExit, exitDialog };
}
