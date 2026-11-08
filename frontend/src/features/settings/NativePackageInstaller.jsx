import React from "react";
import { nativePackageInfo, manageNativePackage, cancelNativeInstall, openNativePackageLink } from "../../platform/nativeEngineInstaller";

const PHASES = { preparing: "正在连接下载，首次连接可能需要一点时间…", importing: "正在读取引擎包…", verifying: "正在检查文件是否完整…", downloading: "正在下载，请稍候…", extracting: "正在解压安装…", testing: "正在测试引擎能否正常使用…", installed: "已启用，可以开始对弈和分析了", activating: "正在启用，即将完成…" };

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
    setBusy(true); setError(false); setNotice("");
    setProgress(action === "import" ? null : { phase: action === "download" ? "preparing" : "verifying" });
    try {
      let archivePath = null;
      if (action === "import") {
        const { open } = await import("@tauri-apps/plugin-dialog");
        archivePath = await open({ multiple: false, title: "选择棋岛 ZIP 引擎包", filters: [{ name: "棋岛引擎包", extensions: ["zip"] }] });
        if (!archivePath || !active()) return;
        setProgress({ phase: "importing" });
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
      if (active()) { setError(true); setNotice(`未能完成安装：${String(e.message || e)}。请重试，或使用下方「导入已有文件」。`); }
    } finally {
      running.current = false;
      if (active()) { setBusy(false); setProgress(null); refresh().catch(() => {}); }
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
  return <section className="native-install-card engine-setup-card" aria-label="下载或导入引擎">
    <div className="engine-setup-heading"><span className="engine-setup-icon" aria-hidden="true">↓</span><div>
      <h3>下载并启用 <span className="engine-setup-badge">推荐</span></h3>
      <p>第一次使用？让棋岛帮你安装，完成后就能用于对弈和分析。</p>
    </div></div>
    {!info && !notice && <p role="status">正在为你的电脑查找合适的版本…</p>}
    {info && <>
      {selectedPackage ? <>
        <p className="engine-download-summary">{selectedPackage.publicDownload ? `下载约 ${(selectedPackage.size / 1024 / 1024).toFixed(1)} MB · 自动安装所需文件并检测` : "当前版本暂不提供在线下载。已有引擎包？请在下方导入。"}</p>
        <div className="native-install-actions">
          <button type="button" className="native-install-primary" aria-busy={busy} disabled={working || !selectedPackage.publicDownload} onClick={() => run("download", selected)}>{busy && progress?.phase === "preparing" ? "正在连接下载…" : working ? "正在处理…" : selectedPackage.publicDownload ? "一键下载并启用" : "暂无在线下载"}</button>
        </div>
        <p className="engine-setup-footnote">仅安装在这台电脑上，无需登录。下载完成后会自动检查是否可用。</p>
        <details className="engine-setup-details"><summary>版本与开源许可</summary>
        <label>安装版本 <select value={selected} disabled={working} onChange={(e) => setSelected(e.target.value)}>
          {info.packages.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.version} · {p.releaseTag ? "GitHub 构建" : p.applicationTested ? "本地已验收构建" : "本地测试候选"}</option>)}
        </select></label>
        <p className="muted">Windows x64 · SSE4.1 / POPCNT · 约 {(selectedPackage.size / 1024 / 1024).toFixed(1)} MB</p>
        <div className="native-install-links">
          <button type="button" onClick={() => openLink("source")}>对应版本源码</button>
          <button type="button" onClick={() => openLink("license")}>程序 GPL-3.0</button>
          {selectedPackage.networkPath ? <button type="button" onClick={() => openLink("network")}>{selectedPackage.networkLicense ? `权重 ${selectedPackage.networkLicense}` : "权重许可说明"}</button> : <span>传统评估 · 无需 NNUE 权重</span>}
        </div>
        </details>
      </> : <p>暂时没有适合这台电脑的下载版本。你可以在下方导入已有引擎包或程序。</p>}
      {progress && <div className="engine-install-progress" role="status"><span>{PHASES[progress.phase] || "正在处理…"}</span>{progress.phase !== "installed" && <progress aria-label="引擎包安装进度" value={progress.total > 0 ? progress.downloaded : undefined} max={progress.total || 1} />}</div>}
      {(busy || info.busy) && progress?.phase !== "activating" && <button type="button" onClick={cancel}>取消安装或检测</button>}
      {info.busy && !busy && <p role="status">后台安装或检测仍在进行，完成后可重新启用。</p>}
      {info.installed.length > 0 && <details className="engine-setup-details"><summary>已安装的引擎（{info.installed.length}）</summary><div className="native-installed-list"><strong>可重新检测并启用，也可切换回之前的版本</strong>
        {info.installed.map((item) => <div key={item.package.id}><span>{item.package.name} · {item.package.version} · {item.package.releaseTag ? "GitHub 构建" : "本地构建"}</span><button type="button" disabled={working} onClick={() => run("verify", item.package.id)}>检测并启用</button></div>)}
      </div></details>}
    </>}
    {notice && <p role={error ? "alert" : "status"} className={error ? "engine-status-error" : "engine-status-ok"}>{notice}</p>}
    <div className="engine-package-import">
      <div><strong>已有下载好的引擎包？</strong><p>选择棋岛 ZIP 引擎包，无需解压，导入后自动检测并启用。其他来源的压缩包请先解压，再在下方选择程序。</p></div>
      <button type="button" disabled={working} onClick={() => run("import")}>导入 ZIP 引擎包</button>
    </div>
  </section>;
}
