import React from "react";
import catalog from "../../../../docs/engines/wasm-packages.json";
import { installBrowserEngine, validateWasmDownload } from "../../domain/xiangqi/engine/browserEngineInstaller.js";
import { probeBrowserEngineProfile, resetLocalEngine } from "../../domain/xiangqi/engine/localEngine.js";
import { ensureBrowserEngineStorage } from "../../platform/browserEngineStorage.js";

const PHASES = { preparing: "准备设备缓存", downloading: "下载中", verifying: "校验文件", saving: "保存到设备", testing: "检测引擎" };

export default function BrowserEngineInstaller({ variant, manager, busy, onBusyChange, onInstalled }) {
  const packages = catalog.packages.filter((item) => item.variant === variant);
  const [selected, setSelected] = React.useState("");
  const spec = packages.find((item) => item.id === selected) || packages[0];
  const [progress, setProgress] = React.useState(null);
  const [message, setMessage] = React.useState("");
  const operation = React.useRef(null);
  const mounted = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current?.abort(); };
  }, [variant]);
  let unavailable = "";
  if (spec) { try { validateWasmDownload(spec, variant); } catch (error) { unavailable = error.message; } }

  async function install() {
    if (!spec || busy || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    const timeout = setTimeout(() => controller.abort(), 300000);
    onBusyChange(true);
    setMessage("");
    setProgress({ phase: "preparing", downloaded: 0, total: spec.size });
    try {
      await ensureBrowserEngineStorage(controller.signal);
      const profile = await installBrowserEngine(spec, variant, {
        signal: controller.signal,
        isCurrent: () => operation.current === controller,
        onProgress: (next) => { if (!controller.signal.aborted) setProgress(next); },
        probe: probeBrowserEngineProfile,
        beforeCommit: async () => { await manager.dispose(); resetLocalEngine(variant); },
      });
      if (!controller.signal.aborted) { onInstalled(profile); setMessage("WASM 引擎已安装并启用，文件保存在当前设备。"); }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error.message || "引擎安装失败");
    } finally {
      clearTimeout(timeout);
      if (operation.current === controller) {
        operation.current = null;
        if (mounted.current) { setProgress(null); onBusyChange(false); }
      }
    }
  }

  return <section className="engine-package-card" aria-label="WASM 在线安装">
    <h3>在线安装 WASM 引擎</h3>
    <p>从棋岛 GitHub 固定发行版下载，无需登录。校验并检测成功后启用，失败时保留原引擎。</p>
    {!spec ? <p>推荐 WASM 包正在准备中，统一发布后开放在线安装。当前可继续手动导入目录。</p> : <>
      <select aria-label="WASM 发行版本" disabled={busy} value={spec.id} onChange={(event) => setSelected(event.target.value)}>
        {packages.map((item) => <option key={item.id} value={item.id}>{item.name} {item.version}{item.threads ? " · 多线程" : " · 单线程"}</option>)}
      </select>
      <p>下载约 {(spec.size / 1024 / 1024).toFixed(1)} MB · 程序 {spec.engineLicense} · 权重 {spec.networkLicense || "无独立权重"}</p>
      {unavailable && <p>{unavailable}</p>}
      <button type="button" disabled={busy || Boolean(unavailable)} onClick={install}>下载并启用</button>
    </>}
    {progress && <div role="status">
      <span>{PHASES[progress.phase]}</span>
      <progress aria-label="WASM 下载进度" value={progress.downloaded} max={progress.total} />
      <button type="button" onClick={() => { operation.current?.abort(); setMessage("已取消安装，原引擎保留。"); }}>取消</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
