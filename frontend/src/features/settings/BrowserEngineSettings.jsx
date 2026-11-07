import React from "react";
import {
  browserEngineCapabilities,
  getBrowserEngineProfile,
  importBrowserEnginePackage,
  removeBrowserEnginePackage,
} from "../../domain/xiangqi/engine/browserEnginePackages";
import { localEngineReady, probeBrowserEngineProfile, resetLocalEngine } from "../../domain/xiangqi/engine/localEngine";
import { importBrowserEngineArchive } from "../../domain/xiangqi/engine/browserEngineInstaller.js";
import catalog from "../../domain/xiangqi/engine/wasm-packages.json";
import { ensureBrowserEngineStorage } from "../../platform/browserEngineStorage.js";
import BrowserEngineInstaller from "./BrowserEngineInstaller.jsx";

export default function BrowserEngineSettings({ manager, variant = "xiangqi" }) {
  const [profile, setProfile] = React.useState(() => getBrowserEngineProfile(variant));
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [engineReady, setEngineReady] = React.useState(null);
  const capabilities = browserEngineCapabilities();
  const zipOperation = React.useRef(null);
  const mounted = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; zipOperation.current?.abort(); };
  }, [variant]);

  async function importZip(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file || busy || zipOperation.current) return;
    const controller = new AbortController();
    zipOperation.current = controller;
    const current = () => mounted.current && zipOperation.current === controller && !controller.signal.aborted;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await ensureBrowserEngineStorage(controller.signal);
      const next = await importBrowserEngineArchive(file, variant, {
        packages: catalog.packages, signal: controller.signal, isCurrent: current,
        probe: probeBrowserEngineProfile,
        beforeCommit: async () => { await manager.dispose(); resetLocalEngine(variant); },
      });
      if (current()) {
        setProfile(next);
        setEngineReady(true);
        setMessage("ZIP 引擎包已导入并启用，无需手动解压。");
      }
    } catch (reason) {
      if (current()) setError(reason.message || String(reason));
    } finally {
      input.value = "";
      if (zipOperation.current === controller) {
        zipOperation.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }

  React.useEffect(() => {
    let active = true;
    if (!profile) {
      setEngineReady(null);
      return () => { active = false; };
    }
    localEngineReady(variant)
      .then((ready) => { if (active) setEngineReady(ready); })
      .catch(() => { if (active) setEngineReady(false); });
    return () => { active = false; };
  }, [profile, variant]);

  async function importFiles(event) {
    const files = event.target.files;
    if (!files?.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!("serviceWorker" in navigator) || !capabilities.cacheStorage) {
        throw new Error("当前 WebView 不支持本地引擎包存储，请使用远程引擎或升级客户端");
      }
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const next = await importBrowserEnginePackage(files, variant);
      resetLocalEngine(variant);
      await manager.dispose();
      setProfile(next);
      setEngineReady(null);
      if (!navigator.serviceWorker.controller) {
        // 首次安装 Service Worker 时，当前页面未必能立刻通过虚拟路径读取引擎文件。
        // 刷新后由 Service Worker 接管，再由上面的 effect 做真实 UCI 握手检测。
        window.location.reload();
        return;
      }
      const ready = await localEngineReady(variant);
      setEngineReady(ready);
      if (ready) setMessage("本地 WASM 引擎已就绪，对弈和分析将优先使用本地引擎。");
      else setError("引擎包已保存，但启动或 UCI 握手失败；对弈将继续使用云端引擎。");
    } catch (reason) {
      setError(reason.message || String(reason));
    } finally {
      event.target.value = "";
      setBusy(false);
    }
  }

  async function remove() {
    await manager.dispose();
    resetLocalEngine(variant);
    await removeBrowserEnginePackage(variant);
    setProfile(null);
    setEngineReady(null);
    setMessage("本设备上的引擎包已移除");
  }

  const capabilityItems = [
    ["WASM", capabilities.webAssembly],
    ["Worker", capabilities.worker],
    ["多线程", capabilities.threads],
  ];

  return <div className="native-engine-settings">
    <strong>本设备 WASM 引擎</strong>
    <BrowserEngineInstaller key={variant} variant={variant} manager={manager} busy={busy} onBusyChange={setBusy}
      onInstalled={(next) => { setProfile(next); setEngineReady(true); setError(""); setMessage(""); }} />
    <div className="engine-package-card">
      <div className="engine-package-intro">
        <span className="engine-package-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3 4.5 7v10l7.5 4 7.5-4V7L12 3Z"/><path d="m4.5 7 7.5 4 7.5-4M12 11v10"/></svg>
        </span>
        <div>
          <h3>本地 WASM 引擎包</h3>
          <p>可直接选择棋岛 WASM ZIP 引擎包，也可导入解压后的自定义引擎目录。文件仅保存在当前设备，不会上传。</p>
        </div>
      </div>
      <div className="engine-package-note">
        <span aria-hidden="true">i</span>
        上游原生版本不能直接在浏览器运行，需使用作者提供或自行编译的 WASM 版本。
      </div>
      <div className="engine-package-actions">
        <div className="engine-action-buttons">
          <label className={`btn-import-submit ${busy ? "is-busy" : ""}`}>
            {busy ? "处理中…" : "选择 ZIP 引擎包"}
            <input aria-label="选择 ZIP 引擎包" type="file" accept=".zip,application/zip,application/x-zip-compressed" hidden disabled={busy} onChange={importZip} />
          </label>
          <label className={`btn-import-submit ${busy ? "is-busy" : ""}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>
            {busy ? "处理中…" : "选择引擎包目录"}
            <input type="file" webkitdirectory="" multiple hidden disabled={busy} onChange={importFiles} />
          </label>
          {profile && <button className="engine-remove-btn" disabled={busy} onClick={remove}>移除</button>}
        </div>
        <div className="engine-capabilities" aria-label="浏览器能力">
          {capabilityItems.map(([label, available]) => (
            <span className={available ? "available" : "unavailable"} key={label}>
              <i aria-hidden="true">{available ? "✓" : "—"}</i>{label}
            </span>
          ))}
        </div>
      </div>
    </div>
    {profile && <div className={`engine-profile-status ${engineReady === false ? "is-error" : engineReady === true ? "is-ready" : "is-checking"}`}>
      <span className="engine-status-dot" aria-hidden="true" />
      <div><strong>{engineReady === true ? "引擎已就绪" : engineReady === false ? "引擎启动失败" : "正在检测引擎"}</strong>
      <span>{profile.name} {profile.version}</span></div>
    </div>}
    {error && <div className="import-error">{error}</div>}
    {message && <div className="import-ok">{message}</div>}
  </div>;
}
