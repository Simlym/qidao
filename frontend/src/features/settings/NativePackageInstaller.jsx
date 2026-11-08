import React from "react";
import { nativePackageInfo, manageNativePackage, cancelNativeInstall, openNativePackageLink } from "../../platform/nativeEngineInstaller";

export function useNativePackageInstaller({ variant, onActivate, onImport, externalBusy }) {
  const [info, setInfo] = React.useState(null);
  const [selected, setSelected] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [notice, setNotice] = React.useState("");
  const epoch = React.useRef(0);
  const running = React.useRef(false);
  const controller = React.useRef(null);
  const refresh = React.useCallback(async () => {
    const current = epoch.current;
    const next = await nativePackageInfo(variant);
    if (current !== epoch.current) return;
    setInfo(next);
    setSelected((id) => next.packages.some((p) => p.id === id) ? id : (next.packages.find((p) => p.publicDownload) || next.packages[0])?.id || "");
  }, [variant]);
  React.useEffect(() => {
    const current = epoch.current;
    refresh().catch((e) => current === epoch.current && setError({ summary: "暂时无法读取下载信息，你仍可选择本地程序。", detail: String(e) }));
    return () => { epoch.current++; controller.current?.abort(); };
  }, [refresh]);
  React.useEffect(() => {
    if (!info?.busy || busy) return;
    const timer = setInterval(() => refresh().catch(() => {}), 1000);
    return () => clearInterval(timer);
  }, [info?.busy, busy, refresh]);

  async function run(action, packageId = selected) {
    if (running.current || externalBusy || info?.busy) return;
    running.current = true;
    const current = epoch.current;
    const active = () => current === epoch.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setError(null); setNotice("");
    setProgress({ phase: action === "download" ? "preparing" : action === "import" ? "importing" : "verifying" });
    try {
      let archivePath = null;
      if (action === "import") {
        const { open } = await import("@tauri-apps/plugin-dialog");
        if (!active()) return;
        archivePath = await open({ multiple: false, title: "选择棋岛 ZIP 安装包", filters: [{ name: "棋岛安装包", extensions: ["zip"] }] });
        if (!archivePath || !active() || abort.signal.aborted) return;
      }
      const result = await manageNativePackage({ variant, action, packageId, archivePath, signal: abort.signal }, (event) => {
        if (active() && !abort.signal.aborted) setProgress(event);
      });
      if (!active()) return;
      if (abort.signal.aborted) { setNotice("操作已取消，当前引擎未更换。"); return; }
      if (action === "import") {
        onImport(result);
      } else {
        setProgress({ phase: "activating" });
        await onActivate(result);
      }
    } catch (e) {
      if (active()) {
        if (abort.signal.aborted) setNotice("操作已取消，当前引擎未更换。");
        else setError({ summary: action === "download" ? "下载或安装未完成，请重试，也可以用浏览器下载后导入。" : "未能完成检测，请确认文件完整且适用于当前棋种。", detail: String(e.message || e) });
      }
    } finally {
      running.current = false;
      if (active()) { setBusy(false); setProgress(null); refresh().catch(() => {}); }
    }
  }
  async function cancel() {
    controller.current?.abort();
    setNotice("正在取消，请稍候…");
    try { await cancelNativeInstall(); }
    catch (e) { setError({ summary: "取消请求未完成，请等待当前操作结束。", detail: String(e) }); }
  }
  async function openLink(link) {
    try { await openNativePackageLink(variant, selected, link); }
    catch (e) { setError({ summary: "未能打开浏览器，请稍后重试。", detail: String(e) }); }
  }
  return { info, selected, setSelected, busy: busy || Boolean(info?.busy), progress, error, notice, run, cancel, openLink,
    selectedPackage: info?.packages.find((p) => p.id === selected), clearMessages: () => { setError(null); setNotice(""); } };
}

export function NativePackageDetails({ installer, disabled }) {
  const { info, selected, selectedPackage, setSelected, openLink, run } = installer;
  return <>
    {selectedPackage && <div className="engine-package-details">
      <label>下载版本<select value={selected} disabled={disabled} onChange={(e) => setSelected(e.target.value)}>
        {info.packages.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.version}{p.publicDownload ? "" : "（仅本地导入）"}</option>)}
      </select></label>
      <div className="native-install-links"><button type="button" onClick={() => openLink("source")}>源码</button><button type="button" onClick={() => openLink("license")}>程序许可</button>{selectedPackage.networkPath && <button type="button" onClick={() => openLink("network")}>资源许可</button>}</div>
    </div>}
    {info?.installed.length > 0 && <div className="native-installed-list"><strong>已安装版本</strong>{info.installed.map((item) => <div key={item.package.id}><span>{item.package.name} · {item.package.version}</span><button type="button" disabled={disabled} onClick={() => run("verify", item.package.id)}>检测并启用</button></div>)}</div>}
  </>;
}

export { default as NativeInstallProgress } from "./EngineInstallProgress";
