import React from "react";
import { nativePackageInfo, manageNativePackage, cancelNativeInstall, openNativePackageLink } from "../../platform/nativeEngineInstaller";

const PHASES = { downloading: "下载中", verifying: "校验文件", extracting: "解压并校验", testing: "局面试算", installed: "安装完成", activating: "正在启用" };

export default function NativePackageInstaller({ variant, onActivate, onBusyChange, externalBusy = false }) {
  const [info, setInfo] = React.useState(null);
  const [selected, setSelected] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState(false);
  const epoch = React.useRef(0);
  const running = React.useRef(false);
  const cancelled = React.useRef(false);

  const refresh = React.useCallback(async () => {
    const current = epoch.current;
    const next = await nativePackageInfo(variant);
    if (current !== epoch.current) return;
    setInfo(next);
    setSelected((id) => next.packages.some((p) => p.id === id) ? id : next.packages[0]?.id || "");
  }, [variant]);

  React.useEffect(() => {
    const current = epoch.current;
    refresh().catch((e) => { if (current === epoch.current) { setError(true); setNotice(`无法读取引擎包信息：${String(e)}`); } });
    return () => { epoch.current++; };
  }, [refresh]);
  React.useEffect(() => {
    if (!info?.busy || busy) return;
    const timer = setInterval(() => refresh().catch(() => {}), 1000);
    return () => clearInterval(timer);
  }, [info?.busy, busy, refresh]);
  React.useEffect(() => {
    onBusyChange(busy || Boolean(info?.busy));
    return () => onBusyChange(false);
  }, [busy, info?.busy, onBusyChange]);

  async function run(action, packageId = null) {
    if (running.current || externalBusy || info?.busy) return;
    running.current = true;
    const current = epoch.current;
    const active = () => current === epoch.current;
    cancelled.current = false;
    setBusy(true); setError(false); setNotice(""); setProgress(null);
    try {
      let archivePath = null;
      if (action === "import") {
        const { open } = await import("@tauri-apps/plugin-dialog");
        archivePath = await open({ multiple: false, title: "选择棋岛 ZIP 引擎包", filters: [{ name: "棋岛引擎包", extensions: ["zip"] }] });
        if (!archivePath || !active()) return;
      }
      const result = await manageNativePackage({ variant, action, packageId, archivePath }, (event) => active() && setProgress(event));
      if (!active()) return;
      setSelected(result.package.id);
      if (cancelled.current) { setNotice("已取消启用；安装完成的版本可稍后重新检测并启用。"); return; }
      setProgress({ phase: "activating", downloaded: 1, total: 1 });
      await onActivate(result);
      if (active()) {
        setProgress({ phase: "installed", downloaded: 1, total: 1 });
        setNotice(`已启用 ${result.package.name} · ${result.package.version}`);
      }
    } catch (e) {
      if (active()) { setError(true); setNotice(`${String(e.message || e)}。可重试或手动选择程序。`); }
    } finally {
      running.current = false;
      if (active()) { setBusy(false); refresh().catch(() => {}); }
    }
  }

  async function cancel() {
    cancelled.current = true;
    try { await cancelNativeInstall(); setNotice("已请求取消，等待当前操作结束。"); }
    catch (e) { setError(true); setNotice(String(e)); }
  }

  async function openLink(link) {
    try { await openNativePackageLink(variant, selected, link); }
    catch (e) { setError(true); setNotice(String(e)); }
  }

  const selectedPackage = info?.packages.find((p) => p.id === selected);
  const working = busy || info?.busy || externalBusy;
  return <section className="native-install-card" aria-label="棋岛引擎包安装">
    <h3>{variant === "jieqi" ? "揭棋" : "标准象棋"}引擎包</h3>
    <p>程序和匹配权重一起安装，校验与试算通过后启用。仅保存在本设备，无需登录。</p>
    {!info && <p>{notice || "正在识别可安装版本…"}</p>}
    {info && <>
      {selectedPackage ? <>
        <label>固定版本 <select value={selected} disabled={working} onChange={(e) => setSelected(e.target.value)}>
          {info.packages.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.version} · {p.releaseTag ? "GitHub 构建" : p.applicationTested ? "本地已验收构建" : "本地测试候选"}</option>)}
        </select></label>
        <p className="muted">Windows x64 · SSE4.1 / POPCNT · 约 {(selectedPackage.size / 1024 / 1024).toFixed(1)} MB</p>
        <div className="native-install-links">
          <button type="button" onClick={() => openLink("source")}>对应版本源码</button>
          <button type="button" onClick={() => openLink("license")}>程序 GPL-3.0</button>
          <button type="button" onClick={() => openLink("network")}>{selectedPackage.networkLicense ? `权重 ${selectedPackage.networkLicense}` : "权重许可说明"}</button>
        </div>
        {!selectedPackage.publicDownload && <p>此版本尚未公开下载，可导入已取得的 ZIP 测试包。</p>}
        <div className="native-install-actions">
          <button type="button" disabled={working || !selectedPackage.publicDownload} onClick={() => run("download", selected)}>下载并启用</button>
          <button type="button" disabled={working} onClick={() => run("import")}>导入 ZIP 并启用</button>
        </div>
      </> : <p>当前系统或 CPU 暂无适配的引擎包，请使用下方手动选择程序。</p>}
      {progress && <div role="status"><span>{PHASES[progress.phase] || "处理中"}</span><progress aria-label="引擎包安装进度" value={progress.downloaded} max={progress.total || 1} /></div>}
      {(busy || info.busy) && progress?.phase !== "activating" && <button type="button" onClick={cancel}>取消安装或检测</button>}
      {info.busy && !busy && <p role="status">后台安装或检测仍在进行，完成后可重新启用。</p>}
      {info.installed.length > 0 && <div className="native-installed-list"><strong>已安装版本 · 可重新启用或回退</strong>
        {info.installed.map((item) => <div key={item.package.id}><span>{item.package.name} · {item.package.version} · {item.package.releaseTag ? "GitHub 构建" : "本地构建"}</span><button type="button" disabled={working} onClick={() => run("verify", item.package.id)}>检测并启用</button></div>)}
      </div>}
    </>}
    {notice && <p role={error ? "alert" : "status"} className={error ? "engine-status-error" : "engine-status-ok"}>{notice}</p>}
  </section>;
}
