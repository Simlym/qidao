import React from "react";
import { serverEngineInstallation, installServerEngine } from "../../shared/api/serverEngine.js";
import { adminUpdateVariantEngine } from "../../shared/api";
import EngineInstallProgress from "../settings/EngineInstallProgress";
import "../settings/native-engine-settings.css";

export default function ServerEnginePanel({ variant }) {
  const [info, setInfo] = React.useState(null);
  const [selected, setSelected] = React.useState("");
  const [path, setPath] = React.useState("");
  const [archive, setArchive] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const controller = React.useRef(null);
  const live = React.useRef(false);
  const refresh = React.useCallback(async () => {
    const next = await serverEngineInstallation(variant);
    if (!live.current) return;
    setInfo(next);
    setSelected((value) => next.packages.some((p) => p.id === value) ? value : next.packages.find((p) => p.publicDownload)?.id || next.packages[0]?.id || "");
    setPath(next.status.configured_path || next.status.effective_path || "");
  }, [variant]);
  React.useEffect(() => {
    live.current = true;
    refresh().catch((e) => live.current && setError(e.message));
    return () => { live.current = false; controller.current?.abort(); };
  }, [refresh]);

  async function run(action, packageId = selected) {
    if (controller.current) return;
    const task = new AbortController();
    controller.current = task;
    setBusy(true); setError(""); setMessage(""); setProgress({ phase: "preparing" });
    try {
      await installServerEngine(variant, { action, package_id: packageId, path: action === "import" ? archive.trim() : path.trim() }, {
        signal: task.signal, onProgress: (value) => live.current && setProgress(value),
      });
      if (live.current) setMessage("检测通过，已启用服务器引擎。");
    } catch (e) {
      if (live.current) {
        if (e.name === "AbortError") setMessage("已请求取消。若服务器已完成启用，请以刷新后的状态为准。");
        else setError(e.message);
      }
    } finally {
      controller.current = null;
      if (live.current) {
        setBusy(false); setProgress(null);
        refresh().catch((e) => live.current && setError(e.message));
      }
    }
  }

  async function clear() {
    setBusy(true); setError(""); setMessage("");
    try { await adminUpdateVariantEngine(variant, ""); await refresh(); if (live.current) setMessage("已清除后台路径配置；环境变量配置如存在仍然生效。"); }
    catch (e) { if (live.current) setError(e.message); }
    finally { if (live.current) setBusy(false); }
  }

  const spec = info?.packages.find((p) => p.id === selected);
  return <section className="panel native-engine-settings" aria-busy={busy}>
    <h3>服务器{variant === "jieqi" ? "揭棋" : "象棋"}引擎</h3>
    <p className="muted">用于云端对弈、棋局复盘和题目生成。下载到服务器，与各设备的本地引擎独立管理。</p>
    {!info ? <p>{error || "正在识别服务器和适配版本…"}</p> : <>
      <p><span className="tag">{info.status.available ? "已配置服务器引擎" : "未配置服务器引擎"}</span>　{info.status.os} / {info.status.arch}</p>
      {info.status.effective_path && <p className="muted">当前路径：{info.status.effective_path}</p>}
      {!info.installer_available && <p role="alert">{info.message}</p>}
      {spec ? <>
        <label>适配版本 <select value={selected} disabled={busy} onChange={(e) => setSelected(e.target.value)}>
          {info.packages.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.version}</option>)}
        </select></label>
        <p className="muted">约 {(spec.size / 1048576).toFixed(1)} MB · 固定版本，校验和试算通过后启用</p>
        <p><a href={spec.sourceUrl} target="_blank" rel="noreferrer">源码</a> · <a href={spec.licenseUrl} target="_blank" rel="noreferrer">程序许可</a> · 资源许可：{spec.networkLicense || "见包内说明"}</p>
        <button disabled={busy || !spec.publicDownload} className="btn-import-submit" onClick={() => run("download")}>下载并安装</button>
      </> : info.installer_available && <p>当前服务器暂无适配的固定引擎包，可在下方配置已有引擎。</p>}
      {busy && <EngineInstallProgress progress={progress || { phase: "testing" }} onCancel={() => controller.current?.abort()} />}
      {info.installed.length > 0 && <div className="native-installed-list"><p>已安装版本 · 可检测并重新启用</p>{info.installed.map((item) => <div key={item.package.id}>
        <span>{item.package.name} · {item.package.version}</span>
        <button disabled={busy} onClick={() => run("verify", item.package.id)}>检测并启用</button>
      </div>)}</div>}
      <details className="engine-settings-disclosure"><summary>已有引擎，手动配置</summary>
        <p>填写服务器上的绝对路径。引擎需与服务器系统、CPU 及棋种匹配。</p>
        <div className="import-row"><input aria-label="服务器引擎路径" className="import-input" value={path} disabled={busy} onChange={(e) => setPath(e.target.value)} placeholder="例如 /app/data/engines/xiangqi/stockfish" />
          <button disabled={busy || !path.trim() || !info.installer_available} onClick={() => run("probe")}>检测并启用</button>
          {info.status.configured_path && <button disabled={busy} onClick={clear}>清除配置</button>}
        </div>
        {spec && <><p>已有固定版本 ZIP 包，可先放到服务器，再填写路径导入：</p><div className="import-row">
          <input aria-label="服务器引擎包路径" className="import-input" value={archive} disabled={busy} onChange={(e) => setArchive(e.target.value)} placeholder="例如 /app/data/engines/package.zip" />
          <button disabled={busy || !archive.trim()} onClick={() => run("import")}>校验并导入所选版本</button>
        </div></>}
      </details>
    </>}
    {error && <p role="alert" className="import-error">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
