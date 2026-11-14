import React from "react";
import EngineStatusCard from "../settings/EngineStatusCard";
import EngineInstallProgress from "../settings/EngineInstallProgress";
import EngineMessage from "../settings/EngineSetupFeedback";
import useServerEngineInstaller from "./useServerEngineInstaller";
import OfficialServerEngineDownload from "./OfficialServerEngineDownload";
import ServerEngineStatusCard from "./ServerEngineStatusCard";
import "../settings/native-engine-settings.css";
import "./server-engine-settings.css";

const OS_NAMES = { windows: "Windows", linux: "Linux", macos: "macOS" };

export default function ServerEnginePanel({ variant }) {
  const installer = useServerEngineInstaller(variant);
  const { info, selected, setSelected, path, setPath, busy, progress, feedback,
    changing, setChanging, current, ready, run, clear, refresh } = installer;
  const uploadInput = React.useRef(null);
  const [manual, setManual] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const name = variant === "jieqi" ? "揭棋" : "象棋";
  const configured = Boolean(info?.status.available);
  const setup = !configured || changing;
  const spec = info?.packages.find((p) => p.id === selected);
  const downloadPackages = info?.packages.filter((p) => p.publicDownload) || [];
  const otherInstalled = info?.installed.filter((item) => item.package.id !== current?.package.id) || [];
  const useOfficialDownload = variant === "xiangqi" && info && !info.packages.length;
  React.useEffect(() => {
    if (ready === true && !busy) setManual(false);
  }, [ready, busy]);

  function detect() {
    if (current) run("verify", current.package.id);
    else run("probe", "", info.status.effective_path);
  }

  return <section className="panel native-engine-settings engine-settings-v2 server-engine-panel" aria-label={`服务器${name}引擎`}>
    <input ref={uploadInput} type="file" accept=".zip,application/zip" hidden disabled={busy}
      aria-label="选择电脑上的引擎 ZIP 包" onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (file) installer.upload(file);
      }} />
    <header className="server-engine-heading">
      <div><h3>服务器{name}引擎</h3><p>用于云端对弈、复盘与训练，与个人设备的本地引擎独立管理。</p></div>
      {info && <span className="server-engine-platform">{OS_NAMES[info.status.os] || info.status.os} · {info.status.arch}</span>}
    </header>
    {useOfficialDownload ? <OfficialServerEngineDownload variant={variant} configuredPath={info.status.effective_path} onComplete={refresh}
      configured={configured} current={current} checked={ready} checking={busy} progress={progress} feedback={feedback}
      onDetect={detect} onCancel={installer.cancel} canDetect={info.installer_available} /> : !info ? <EngineStatusCard label={`服务器${name}引擎状态`} title="正在读取服务器状态" description="正在读取服务器引擎配置，请稍候。" busy={busy}>
      <div className="engine-main-actions"><button type="button" onClick={() => refresh().catch(() => {})}>重新读取</button></div>
      {feedback && <EngineMessage message={feedback} />}
    </EngineStatusCard> : <ServerEngineStatusCard name={name} configured={configured} setup={setup} ready={ready} busy={busy} current={current}>
      {busy ? <EngineInstallProgress progress={progress} onCancel={progress?.phase === "saving" ? null : installer.cancel} /> : <div className="engine-main-actions">
        {setup ? <>
          {spec?.publicDownload && <button type="button" className="native-install-primary" onClick={() => run("download")}>{feedback?.error ? "重试下载" : "下载并安装"}</button>}
          <button type="button" disabled={!info.installer_available || !info.packages.length} onClick={() => uploadInput.current?.click()}>已有文件，上传导入</button>
          {configured && <button type="button" className="engine-text-button" onClick={() => { setChanging(false); setManual(false); }}>返回当前引擎</button>}
        </> : <>
          <button type="button" className="native-install-primary" disabled={!info.installer_available} onClick={detect}>{ready === false ? "重试检测" : "重新检测"}</button>
          <button type="button" className="engine-text-button" disabled={!info.installer_available} onClick={() => { setChanging(true); setManual(false); }}>更换引擎</button>
        </>}
      </div>}
      {info && setup && <p className="engine-fine-print">{!info.installer_available ? info.message
        : spec ? `已选择服务器适配版本 · 约 ${(spec.size / 1048576).toFixed(1)} MB · 安装成功后再替换当前配置`
          : "当前平台暂无适配的在线安装包，可配置服务器已有的引擎。"}</p>}
      {feedback && <EngineMessage message={feedback} />}
    </ServerEngineStatusCard>}

    {info && <details className="engine-settings-disclosure server-engine-details"><summary>版本与维护</summary>
      <div className="server-engine-version-layout">
        <fieldset className="server-engine-versions" disabled={busy}>
          <legend>在线安装版本</legend>
          {downloadPackages.length > 0 ? <>
            <label className="server-engine-download-field"><span className="server-engine-visually-hidden">选择在线安装版本</span>
              <select value={selected} onChange={(event) => setSelected(event.target.value)}>
                {downloadPackages.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.version} · {(p.size / 1048576).toFixed(1)} MB</option>)}
              </select>
            </label>
            <p className="engine-fine-print">仅用于下次下载；上传文件时自动识别版本。</p>
          </> : <p className="engine-fine-print">暂无适配的在线安装包。</p>}
          {spec && <p className="server-engine-license"><a href={spec.sourceUrl} target="_blank" rel="noreferrer">源码</a><a href={spec.licenseUrl} target="_blank" rel="noreferrer">程序许可</a>{spec.networkLicense !== "not-applicable" && <span>资源许可：{spec.networkLicense || "见包内说明"}</span>}</p>}
        </fieldset>
        {otherInstalled.length > 0 && <div className="server-engine-installed"><h4>其他已安装版本</h4>{otherInstalled.map((item) => <div className="server-engine-installed-row" key={item.package.id}>
          <div><strong>{item.package.name}</strong><span>{item.package.version}</span></div>
          <button type="button" disabled={busy} onClick={() => run("verify", item.package.id)}>检测并启用</button>
        </div>)}</div>}
      </div>
      <details className="server-engine-advanced"><summary>高级设置</summary>
        {configured && <div className="server-engine-current-details"><span>当前程序路径</span><p className="engine-path">{info.status.effective_path}</p></div>}
        <div className="engine-main-actions">
          <button type="button" className="engine-text-button" disabled={busy || !info.installer_available} onClick={() => setManual(true)}>配置服务器路径</button>
          {info.status.configured_path && <button type="button" className="engine-text-button server-engine-danger" disabled={busy} onClick={() => setConfirmClear(true)}>清除后台配置</button>}
        </div>
    {manual && <div className="server-engine-manual">
      <div className="server-engine-manual-heading"><h4>高级：服务器程序路径</h4><button type="button" className="engine-text-button" disabled={busy} onClick={() => setManual(false)}>收起</button></div>
      <p className="engine-fine-print">填写服务器上的绝对路径，检测通过后启用。文件位于服务器，无需在此重新上传。</p>
      <label className="server-engine-field">引擎程序路径
        <input value={path} disabled={busy} onChange={(e) => setPath(e.target.value)} placeholder="例如 /app/data/engines/xiangqi/stockfish" spellCheck={false} />
      </label>
      <button type="button" disabled={busy || !path.trim() || !info?.installer_available} className="native-install-primary" onClick={() => run("probe")}>检测并启用</button>
    </div>}

      {confirmClear && <div className="server-engine-clear" role="group" aria-label="确认清除后台配置"><p>清除后台路径配置？已下载文件会保留；环境变量配置如存在仍会生效。</p><div className="engine-main-actions"><button type="button" disabled={busy} onClick={async () => { await clear(); setConfirmClear(false); }}>确认清除</button><button type="button" disabled={busy} onClick={() => setConfirmClear(false)}>保留配置</button></div></div>}
      </details>
    </details>}
  </section>;
}
