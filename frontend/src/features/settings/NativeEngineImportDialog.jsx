import React from "react";
import { useBackAction } from "../../shared/hooks/useBackAction";
import NativeInstallProgress from "./EngineInstallProgress";
import EngineMessage from "./EngineSetupFeedback";
export { default as EngineMessage } from "./EngineSetupFeedback";

export default function ImportDialog({ busy, candidate, message, progress, onCancel, onChoose, onImport, onActivate, onClose, variant, packageSupported }) {
  const dialog = React.useRef(null);
  React.useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  useBackAction(() => { if (!busy) onClose(); return true; }, { priority: 100 });
  return <dialog ref={dialog} className="engine-import-dialog" aria-labelledby="engine-import-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="engine-dialog-heading"><div><h3 id="engine-import-title">导入已有文件</h3><p>请选择你已经下载好的{variant === "jieqi" ? "揭棋" : "象棋"}引擎。</p></div><button type="button" className="engine-text-button" aria-label="关闭导入窗口" disabled={busy} onClick={onClose}>×</button></div>
    <div className="engine-import-option"><div><strong>棋岛安装包</strong><p>选择棋岛提供的 ZIP 安装包，无需解压。</p></div><button type="button" disabled={busy || !packageSupported} onClick={onImport}>选择 ZIP 包</button></div>
    {!packageSupported && <p className="engine-fine-print">此设备暂不支持棋岛安装包，请选择本地程序。</p>}
    <div className="engine-import-option"><div><strong>本地引擎程序</strong><p>其他来源的压缩包请先解压，并保留配套文件，再选择里面的引擎程序。</p><button type="button" className="engine-text-button" disabled={busy} onClick={() => onChoose(true)}>也可以选择解压后的文件夹</button></div><button type="button" disabled={busy} onClick={() => onChoose(false)}>选择程序</button></div>
    {busy && <NativeInstallProgress progress={progress || { phase: "testing" }} onCancel={onCancel} />}
    {candidate && <div className="engine-import-candidate"><strong>已识别：{candidate.name}</strong><p>启用时会检测引擎能否正常使用，成功后替换当前配置。</p><details><summary>查看文件位置</summary><p className="engine-path">{candidate.profile?.path || candidate.installation?.enginePath}</p></details></div>}
    {message && <EngineMessage message={message} />}
    <div className="engine-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="button" className="native-install-primary" aria-busy={busy} disabled={busy || !candidate} onClick={onActivate}>{busy ? "正在检测…" : "启用此引擎"}</button></div>
  </dialog>;
}
