import React from "react";
import { useBrowserEngineInstaller } from "./BrowserEngineInstaller";
import BrowserEngineImportDialog from "./BrowserEngineImportDialog";
import BrowserEngineVersionPicker from "./BrowserEngineVersionPicker";
import EngineInstallProgress from "./EngineInstallProgress";
import EngineMessage from "./EngineSetupFeedback";
import "./native-engine-settings.css";

export default function BrowserEngineSettings({ manager, variant = "xiangqi" }) {
  const installer = useBrowserEngineInstaller({ manager, variant });
  const { profile, ready, busy, spec, progress, message, changing, importing, options, capabilities } = installer;
  const [removing, setRemoving] = React.useState(false);
  const setup = !profile || changing;
  const insecure = globalThis.isSecureContext === false;
  const unsupported = insecure ? "当前网址无法保存本地引擎，请通过 HTTPS 或本机 localhost 打开棋岛。"
    : !spec ? "当前浏览器暂不支持在线安装。请使用支持本地存储的新版浏览器，或导入兼容的引擎包。" : "";
  return <div className="native-engine-settings engine-settings-v2">
    <section className="engine-main-card" aria-label="浏览器引擎设置" aria-busy={busy}>
      <div className={`engine-main-icon${ready && !setup ? " is-ready" : ""}`} aria-hidden="true">{ready && !setup ? "✓" : "棋"}</div>
      <div className="engine-main-content">
        <h3>{setup ? "让这台设备帮你分析棋局" : ready ? `${variant === "jieqi" ? "揭棋" : "象棋"}引擎已就绪` : busy ? "正在确认已安装的引擎" : ready === false ? "引擎检测未通过" : "引擎已保存在本机"}</h3>
        <p className="engine-main-description">{setup ? variant === "jieqi" ? "安装浏览器专用的揭棋引擎，用于暗子局面的对弈和分析。" : "安装后可在这台设备上计算走法，用于对弈和棋局分析。" : ready ? "可直接用于对弈和棋局分析，无需重复下载。" : busy ? "正在自动检测本机文件，无需重新下载。" : ready === false ? "安装记录已保留，请查看下方提示。" : "无需重复下载，可重新检测确认是否可用。"}</p>
        {!setup && <dl className="engine-current-info"><div><dt>当前引擎</dt><dd>{profile.name}</dd></div><div><dt>保存位置</dt><dd>当前浏览器的本机存储</dd></div></dl>}
        {busy ? <EngineInstallProgress progress={progress} onCancel={installer.cancel} /> : <>
          <div className="engine-main-actions">{setup ? <>
            <button type="button" className="native-install-primary" disabled={!spec || insecure} onClick={() => installer.run("download")}>{message?.error ? "重试下载" : "下载并安装"}</button>
            <button type="button" disabled={insecure} onClick={installer.openImport}>已有文件，手动导入</button>
            {profile && <button type="button" className="engine-text-button" onClick={() => { installer.setChanging(false); installer.setMessage(null); }}>返回当前引擎</button>}
          </> : <><button type="button" className={ready ? "" : "native-install-primary"} onClick={() => installer.run("test")}>{ready === false ? "重试检测" : "重新检测"}</button><button type="button" className="engine-text-button" onClick={() => { installer.setChanging(true); installer.setMessage(null); }}>{ready === false ? "重新下载或导入" : "更换引擎"}</button></>}</div>
          {setup && <p className="engine-fine-print">{unsupported || `已为这台设备选择适配版本 · 约 ${(spec.size / 1048576).toFixed(1)} MB · 无需登录`}</p>}
        </>}
        {spec && (setup || message?.error) && <p className="engine-browser-download">下载不顺畅？<a href={spec.url} target="_blank" rel="noreferrer">单独下载安装包</a><span>下载后选择「手动导入」。</span></p>}
        {message && !importing && <EngineMessage message={message} />}
        {message?.code === "STORAGE_NOT_READY" && !importing && <button type="button" disabled={busy} onClick={() => window.location.reload()}>刷新页面</button>}
      </div>
    </section>
    <details className="engine-settings-disclosure"><summary>引擎详情与兼容性</summary>
      {profile && <dl className="engine-current-info engine-details-current"><div><dt>当前引擎</dt><dd><strong>{profile.name}</strong><span>{profile.version}</span></dd></div></dl>}
      <BrowserEngineVersionPicker options={options} value={spec?.id || ""} busy={busy} onChange={installer.setSelected} />
      {spec && <p className="engine-fine-print">程序许可：{spec.engineLicense} · 资源许可：{spec.networkLicense === "not-applicable" ? "无需独立资源" : spec.networkLicense}</p>}
      <p className="engine-fine-print">本地计算：{capabilities.webAssembly && capabilities.worker ? "支持" : "不支持"} · 本机存储：{capabilities.cacheStorage ? "支持" : "不支持"} · 多线程：{capabilities.threads ? "支持" : "使用兼容的单线程版本"}</p>
      <p className="engine-fine-print">引擎保存在当前浏览器中，不会上传。清除网站数据或更换浏览器后，需要重新安装。</p>
      {profile && <div className="engine-browser-remove">{removing ? <><p>确认移除这台设备保存的引擎？之后可重新下载或导入。</p><div className="engine-main-actions"><button type="button" disabled={busy} onClick={() => { setRemoving(false); installer.run("remove"); }}>确认移除</button><button type="button" disabled={busy} onClick={() => setRemoving(false)}>保留引擎</button></div></> : <button type="button" disabled={busy} onClick={() => setRemoving(true)}>移除本地引擎</button>}</div>}
    </details>
    {importing && <BrowserEngineImportDialog installer={installer} variant={variant} />}
  </div>;
}
