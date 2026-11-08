import React from "react";
import { useNativePackageInstaller, NativeInstallProgress, NativePackageDetails } from "./NativePackageInstaller";
import { nativeInstallationProfile } from "../../domain/xiangqi/engine/nativeInstallationProfile";
import { activateNativeEngine, verifyNativeEngineReadiness } from "../../domain/xiangqi/engine/activateNativeEngine";
import { getNativeEngineProfile, saveNativeEngineProfile, removeNativeEngineProfile } from "../../domain/xiangqi/engine/TauriEngineAdapter";
import { openNativeEngineFolder } from "../../platform/nativeEngineInstaller";
import { runtime, supportsNativeEngine } from "../../platform/runtime";
import ImportDialog, { EngineMessage } from "./NativeEngineImportDialog";
import "./native-engine-settings.css";

const filename = (path) => path?.split(/[\\/]/).pop() || "本地引擎";

export default function NativeEngineSettings({ manager, onReady, variant = "xiangqi" }) {
  const [profile, setProfile] = React.useState(() => {
    const saved = getNativeEngineProfile(variant);
    return saved?.path ? saved : null;
  });
  const [threads, setThreads] = React.useState(() => profile?.threads || 2);
  const [hashMb, setHashMb] = React.useState(() => profile?.hashMb || 256);
  const [ready, setReady] = React.useState(null);
  const [changing, setChanging] = React.useState(false);
  const [checking, setChecking] = React.useState(Boolean(profile));
  const [importing, setImporting] = React.useState(false);
  const [candidate, setCandidate] = React.useState(null);
  const [message, setMessage] = React.useState(null);
  const [platform, setPlatform] = React.useState(null);
  const epoch = React.useRef(0);
  const running = React.useRef(false);
  React.useEffect(() => () => { epoch.current++; }, []);
  React.useEffect(() => {
    if (!profile || !supportsNativeEngine(runtime)) return;
    const current = epoch.current;
    const active = () => current === epoch.current;
    setChecking(true);
    verifyNativeEngineReadiness({ manager, isCurrent: active }).then(() => {
      if (!active()) return;
      setReady(true);
      onReady?.(true, "native");
    }).catch((error) => {
      if (!active()) return;
      setReady(false);
      setMessage({ error: true, summary: "已找到引擎配置，但检测未通过。可重试检测；若程序已移动或删除，可重新选择文件或安装。", detail: String(error.message || error) });
      onReady?.(false, null);
    }).finally(() => { if (active()) setChecking(false); });
  }, [manager, variant]);
  React.useEffect(() => {
    let active = true;
    if (supportsNativeEngine(runtime)) import("@tauri-apps/api/core").then(({ invoke }) => invoke("platform_info")).then((value) => active && setPlatform(value)).catch(() => {});
    return () => { active = false; };
  }, []);

  async function activateProfile(next) {
    const current = epoch.current;
    await activateNativeEngine(next, { manager, readProfile: () => getNativeEngineProfile(variant),
      writeProfile: (value) => saveNativeEngineProfile(value, variant), removeProfile: () => removeNativeEngineProfile(variant),
      isCurrent: () => current === epoch.current });
    if (current !== epoch.current) return;
    setProfile(next); setReady(true); setChanging(false); setImporting(false); setCandidate(null); setMessage(null);
    onReady?.(true, "native");
  }
  const installer = useNativePackageInstaller({ variant, externalBusy: checking, onActivate: (result) => activateProfile(nativeInstallationProfile(result, variant, { threads, hashMb })),
    onImport: (result) => setCandidate({ name: result.package.name, installation: result }) });
  const busy = checking || installer.busy;
  const packageSupported = platform?.os === "windows" && Boolean(installer.info?.packages.length);
  const selected = installer.selectedPackage;
  const matched = installer.info?.installed.find((item) => item.enginePath === profile?.path);
  const managed = profile?.managed || Boolean(matched);
  const name = profile?.engineName || matched?.package.name || filename(profile?.path);
  const showSetup = !profile || changing;
  const feedback = installer.error ? { ...installer.error, error: true } : installer.notice ? { summary: installer.notice } : message;

  async function choosePath(directory) {
    if (running.current || busy) return;
    running.current = true;
    const current = epoch.current;
    setChecking(true); setCandidate(null); setMessage(null); installer.clearMessages();
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      if (current !== epoch.current) return;
      const path = await open(directory ? { directory: true, multiple: false, title: "选择引擎所在文件夹" }
        : { multiple: false, title: "选择引擎程序", filters: [{ name: "引擎程序", extensions: ["exe", "bin", "appimage"] }] });
      if (!path || current !== epoch.current) return;
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke("inspect_engine_path", { path });
      if (current !== epoch.current) return;
      if (!result.enginePath) throw new Error("未找到引擎程序，请选择解压后的文件夹或其中的 .exe 文件。");
      setCandidate({ name: filename(result.enginePath), profile: { ...(profile?.path === result.enginePath ? profile : {}), path: result.enginePath, nnuePath: result.nnuePath || null, args: [], managed: false } });
    } catch (e) {
      if (current === epoch.current) setMessage({ error: true, summary: "未能识别引擎，请重新选择程序或文件夹。", detail: String(e.message || e) });
    } finally { running.current = false; if (current === epoch.current) setChecking(false); }
  }
  async function enable(value = profile) {
    if (!value || running.current || busy) return;
    running.current = true;
    const current = epoch.current;
    setChecking(true); setMessage(null); installer.clearMessages();
    try {
      const next = value.installation ? nativeInstallationProfile(value.installation, variant, { threads, hashMb }) : { ...(value.profile || value), threads, hashMb };
      await activateProfile(next);
    } catch (e) {
      if (current === epoch.current) {
        if (value === profile) setReady(false);
        setMessage({ error: true, summary: "引擎未能启用，原配置已保留。请检查配套文件是否完整。", detail: String(e.message || e) });
      }
    } finally { running.current = false; if (current === epoch.current) setChecking(false); }
  }
  function openImport() { installer.clearMessages(); setMessage(null); setCandidate(null); setImporting(true); }
  async function openFolder() {
    try { await openNativeEngineFolder(profile.path); }
    catch (e) { setMessage({ error: true, summary: "未能打开引擎文件夹。", detail: String(e.message || e) }); }
  }
  if (!supportsNativeEngine(runtime)) return null;
  return <div className="native-engine-settings engine-settings-v2">
    <section className="engine-main-card" aria-label="本地引擎设置" aria-busy={busy}>
      <div className={`engine-main-icon${ready && !showSetup ? " is-ready" : ""}`} aria-hidden="true">{ready && !showSetup ? "✓" : "棋"}</div>
      <div className="engine-main-content">
        <h3>{showSetup ? "让电脑帮你分析棋局" : ready ? `${variant === "jieqi" ? "揭棋" : "象棋"}引擎已就绪` : checking ? "正在确认已配置的引擎" : ready === false ? "引擎检测未通过" : "引擎配置已保存在本机"}</h3>
        <p className="engine-main-description">{showSetup ? variant === "jieqi" ? "安装揭棋专用引擎，用于暗子局面的对弈和分析。" : "安装象棋引擎，用于人机对弈、局面评分和走法提示。" : ready ? "可直接用于对弈和棋局分析，无需重复下载。" : checking ? "正在自动检测这台电脑上的引擎，无需重新下载。" : "原配置已保留，请查看下方提示。"}</p>
        {!showSetup && <dl className="engine-current-info"><div><dt>当前引擎</dt><dd>{name}</dd></div><div><dt>安装位置</dt><dd>{managed ? "由棋岛管理" : "自定义位置"}<button type="button" className="engine-text-button" onClick={openFolder}>打开文件夹</button></dd></div></dl>}
        {installer.busy ? <NativeInstallProgress progress={installer.progress} onCancel={installer.cancel} /> : checking ? <NativeInstallProgress progress={{ phase: ready === null && !importing ? "checking-saved" : "testing" }} /> : <>
          <div className="engine-main-actions">
            {showSetup ? <>
              {platform?.os === "windows" && <button type="button" className="native-install-primary" disabled={!selected?.publicDownload || !installer.info} onClick={() => installer.run("download")}>{!installer.info ? "正在查找适配版本…" : selected?.publicDownload ? installer.error ? "重试下载" : "下载并安装" : "暂无适配的在线安装包"}</button>}
              <button type="button" onClick={openImport}>已有文件，手动导入</button>
              {profile && <button type="button" className="engine-text-button" onClick={() => { setChanging(false); installer.clearMessages(); }}>返回当前引擎</button>}
            </> : <><button type="button" className={ready ? "" : "native-install-primary"} onClick={() => enable()}>{ready === false ? "重试检测" : "重新检测"}</button><button type="button" className="engine-text-button" onClick={() => setChanging(true)}>{ready === false ? "重新下载或导入" : "更换引擎"}</button></>}
          </div>
          {showSetup && <p className="engine-fine-print">{selected?.publicDownload ? `已为这台电脑选择适配版本 · 约 ${(selected.size / 1048576).toFixed(1)} MB · 无需登录` : "已有引擎可直接导入，启用成功后再替换当前配置。"}</p>}
        </>}
        {selected?.publicDownload && (showSetup || installer.error || installer.progress?.phase === "preparing") && <p className="engine-browser-download">下载不顺畅？<button type="button" className="engine-text-button" onClick={() => installer.openLink("download")}>用浏览器下载</button><span>下载后选择「手动导入」。</span></p>}
        {feedback && !importing && <EngineMessage message={feedback} />}
      </div>
    </section>
    <details className="engine-settings-disclosure"><summary>性能设置</summary><p className="engine-fine-print">一般无需修改。参数会在下次安装或启用时生效。</p><div className="native-engine-limits"><label>计算线程<input type="number" min="1" max="8" disabled={busy} value={threads} onChange={(e) => setThreads(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} /></label><label>分析内存（MB）<input type="number" min="32" max="2048" step="32" disabled={busy} value={hashMb} onChange={(e) => setHashMb(Math.max(32, Math.min(2048, Number(e.target.value) || 32)))} /></label></div><p className="engine-fine-print">建议保留一半处理器资源给界面和系统。</p>{profile && <button type="button" disabled={busy} onClick={() => enable()}>保存参数并启用</button>}</details>
    <details className="engine-settings-disclosure"><summary>引擎详情</summary>{profile && <><p>当前引擎：{name}{profile.engineVersion ? ` · ${profile.engineVersion}` : ""}</p><p className="engine-path">{profile.path}</p></>}<NativePackageDetails installer={installer} disabled={busy} />{platform && <p className="engine-fine-print">设备：{platform.os} / {platform.arch} · {platform.cpuCount} 线程 · {platform.features?.join(" / ")}</p>}</details>
    {importing && <ImportDialog variant={variant} busy={busy} candidate={candidate} message={feedback} progress={installer.progress} onCancel={installer.busy ? installer.cancel : null} packageSupported={packageSupported} onChoose={choosePath} onImport={() => { setCandidate(null); installer.run("import"); }} onActivate={() => enable(candidate)} onClose={() => { setImporting(false); setCandidate(null); setMessage(null); installer.clearMessages(); }} />}
  </div>;
}
