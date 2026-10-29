import React from "react";
import {
  nativeInstallInfo, installNativeEngine, cancelNativeInstall, verifyNativeInstallation, openEngineInstallLink,
} from "../../platform/nativeEngineInstaller";

const PHASES = { downloading: "下载中", verifying: "校验文件", testing: "象棋试算", installed: "安装完成", activating: "正在启用" };
const BUILD_NAMES = { generic: "兼容版", modern: "现代 CPU 版", bmi2: "BMI2 版" };

export default function NativeEngineInstaller({ onActivate, onBusyChange, externalBusy = false }) {
  const [info, setInfo] = React.useState(null);
  const [selected, setSelected] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState(false);
  const live = React.useRef(true);
  const cancelled = React.useRef(false);

  const refresh = React.useCallback(async () => {
    const next = await nativeInstallInfo();
    if (!live.current) return;
    setInfo(next);
    setSelected((current) => current || next.recommendedArtifactId || "");
  }, []);

  React.useEffect(() => {
    live.current = true;
    refresh().catch((e) => live.current && setNotice(`无法读取安装信息：${String(e)}`));
    return () => { live.current = false; };
  }, [refresh]);
  React.useEffect(() => {
    if (!info?.busy || busy) return;
    const timer = setInterval(() => refresh().catch(() => {}), 1000);
    return () => clearInterval(timer);
  }, [info?.busy, busy, refresh]);
  React.useEffect(() => {
    onBusyChange?.(busy || Boolean(info?.busy));
    return () => onBusyChange?.(false);
  }, [busy, info?.busy, onBusyChange]);

  async function run(existing) {
    cancelled.current = false;
    setBusy(true); setError(false); setNotice(""); setProgress(null);
    try {
      const result = existing
        ? await verifyNativeInstallation(existing)
        : await installNativeEngine(selected, (event) => live.current && setProgress(event));
      if (!live.current) return;
      if (cancelled.current) { setNotice("已取消启用，原配置未修改。已完成的下载可稍后重新启用。"); return; }
      setProgress({ phase: "activating", downloaded: 1, total: 1 });
      await onActivate(result);
      if (live.current) {
        setProgress({ phase: "installed", downloaded: 1, total: 1 });
        setNotice(`已启用 ${result.receipt.name} · ${BUILD_NAMES[result.receipt.artifactId] || result.receipt.artifactId}`);
      }
    } catch (e) {
      if (live.current) { setError(true); setNotice(`${String(e.message || e)}。原引擎配置已保留，可重试或手动导入。`); }
    } finally {
      if (live.current) { setBusy(false); refresh().catch(() => {}); }
    }
  }

  async function cancel() {
    cancelled.current = true;
    try { await cancelNativeInstall(); setNotice("已请求取消，等待当前下载或检测结束。"); }
    catch (e) { setError(true); setNotice(String(e)); }
  }

  async function open(link) {
    try { await openEngineInstallLink(link); }
    catch (e) { setError(true); setNotice(String(e)); }
  }

  const artifact = info?.supportedArtifacts.find((item) => item.id === selected);
  const working = busy || info?.busy || externalBusy;
  return (
    <section className="native-install-card" aria-label="引擎引导安装">
      <h3>下载并安装标准象棋引擎</h3>
      <p>Fairy-Stockfish 使用本机算力，无需另下权重。安装完成后先进行象棋试算，再启用；你也可以继续手动导入其他 UCI 引擎。</p>
      {!info ? <p>{notice || "正在识别可安装版本…"}</p> : <>
        <p>固定版本：{info.catalog.version} · 来源：GitHub · 程序许可：{info.catalog.license}</p>
        <div className="native-install-links">
          <button type="button" onClick={() => open("source")}>上游项目与源码</button>
          <button type="button" onClick={() => open("license")}>查看 GPL-3.0 许可</button>
        </div>
        {!artifact ? <p>当前系统或 CPU 暂无引导安装版本，请使用下方手动导入。</p> : <>
          <label>适配版本
            <select value={selected} disabled={working} onChange={(e) => setSelected(e.target.value)}>
              {info.supportedArtifacts.map((item) => <option key={item.id} value={item.id}>
                {BUILD_NAMES[item.id] || item.id}{item.id === info.recommendedArtifactId ? "（推荐）" : ""}
              </option>)}
            </select>
          </label>
          <p className="muted">下载约 {(artifact.size / 1024 / 1024).toFixed(1)} MB。已按本机 CPU 筛选，也可选择兼容版。</p>
          <div className="native-install-actions">
            <button type="button" disabled={working} className="native-install-primary" onClick={() => run(null)}>{working ? "处理中…" : "从 GitHub 安装并启用"}</button>
            {(busy || info?.busy) && progress?.phase !== "activating" && <button type="button" onClick={cancel}>取消安装或检测</button>}
          </div>
        </>}
        {progress && <div role="status">
          <span>{PHASES[progress.phase] || "处理中"}</span>
          <progress aria-label="引擎下载进度" value={progress.downloaded} max={progress.total || 1} />
        </div>}
        {info.busy && !busy && <p role="status">后台安装任务仍在进行，完成后将显示在已安装版本中。</p>}
        {info.installed.length > 0 && <div className="native-installed-list">
          <strong>已安装版本 · 可重新启用或回退</strong>
          {info.installed.map((item) => <div key={`${item.receipt.version}/${item.receipt.artifactId}`}>
            <span>{item.receipt.version} · {BUILD_NAMES[item.receipt.artifactId] || item.receipt.artifactId}</span>
            <button type="button" disabled={working} onClick={() => run(item)}>检测并启用</button>
          </div>)}
        </div>}
      </>}
      {notice && info && <p role={error ? "alert" : "status"} className={error ? "engine-status-error" : "engine-status-ok"}>{notice}</p>}
    </section>
  );
}
