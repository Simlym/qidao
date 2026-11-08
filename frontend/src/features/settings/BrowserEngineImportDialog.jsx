import React from "react";
import { useBackAction } from "../../shared/hooks/useBackAction";
import EngineInstallProgress from "./EngineInstallProgress";
import EngineMessage from "./EngineSetupFeedback";

export default function BrowserEngineImportDialog({ installer, variant }) {
  const { busy, candidate, message, progress, chooseCandidate, run, cancel } = installer;
  const dialog = React.useRef(null);
  const zipInput = React.useRef(null);
  const directoryInput = React.useRef(null);
  const close = () => { if (!busy) { installer.setImporting(false); chooseCandidate(null); } };
  React.useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  useBackAction(() => { close(); return true; }, { priority: 100 });
  function selectZip(event) {
    const file = event.target.files?.[0];
    if (file) chooseCandidate({ kind: "zip", file, name: file.name });
    event.target.value = "";
  }
  function selectDirectory(event) {
    const files = [...(event.target.files || [])];
    if (files.length) chooseCandidate({ kind: "directory", files, name: files[0].webkitRelativePath?.split("/")[0] || "引擎目录" });
    event.target.value = "";
  }
  return <dialog ref={dialog} className="engine-import-dialog" aria-labelledby="browser-engine-import-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <div className="engine-dialog-heading"><div><h3 id="browser-engine-import-title">导入已有文件</h3><p>选择适用于浏览器的{variant === "jieqi" ? "揭棋" : "象棋"}引擎包，文件仅保存在当前设备。</p></div><button type="button" className="engine-text-button" aria-label="关闭导入窗口" disabled={busy} onClick={close}>×</button></div>
    <div className="engine-import-option"><div><strong>棋岛安装包</strong><p>选择棋岛提供的浏览器版 ZIP 安装包，无需解压。</p></div><button type="button" disabled={busy} onClick={() => zipInput.current.click()}>选择 ZIP 包</button><input ref={zipInput} aria-label="选择浏览器 ZIP 安装包" type="file" accept=".zip,application/zip" hidden disabled={busy} onChange={selectZip} /></div>
    <details className="engine-custom-directory"><summary>导入自定义引擎目录</summary><p>适用于已解压、包含 engine-manifest.json 的浏览器引擎目录。</p><button type="button" disabled={busy} onClick={() => directoryInput.current.click()}>选择引擎目录</button><input ref={directoryInput} aria-label="选择浏览器引擎目录" type="file" webkitdirectory="" multiple hidden disabled={busy} onChange={selectDirectory} /></details>
    <p className="engine-fine-print">请使用浏览器专用引擎包（WASM），Windows 的 .exe 程序无法在这里使用。</p>
    {candidate && <div className="engine-import-candidate"><strong>已选择：{candidate.name}</strong><p>确认后会检查文件并测试引擎，通过后才更换当前配置。</p></div>}
    {busy && <EngineInstallProgress progress={progress} onCancel={cancel} />}
    {message && <EngineMessage message={message} />}
    {message?.code === "STORAGE_NOT_READY" && <button type="button" disabled={busy} onClick={() => window.location.reload()}>刷新页面</button>}
    <div className="engine-dialog-actions"><button type="button" disabled={busy} onClick={close}>取消</button><button type="button" className="native-install-primary" disabled={busy || !candidate} onClick={() => run("import")}>{busy ? "正在处理…" : "启用此引擎"}</button></div>
  </dialog>;
}
