import React from "react";
import NativeEngineInstaller from "./NativeEngineInstaller";
import NativePackageInstaller from "./NativePackageInstaller";
import { nativeInstallationProfile } from "../../domain/xiangqi/engine/nativeInstallationProfile";
import { activateNativeEngine } from "../../domain/xiangqi/engine/activateNativeEngine";
import {
  getNativeEngineProfile,
  saveNativeEngineProfile,
  removeNativeEngineProfile,
} from "../../domain/xiangqi/engine/TauriEngineAdapter";
import { runtime, supportsNativeEngine } from "../../platform/runtime";
import "./native-engine-settings.css";

export default function NativeEngineSettings({
  manager,
  onReady,
  variant = "xiangqi",
  label = "标准象棋 UCI 引擎",
}) {
  const initial = React.useMemo(() => getNativeEngineProfile(variant), [variant]);
  const [path, setPath] = React.useState(() => initial?.path || "");
  const [threads, setThreads] = React.useState(() => initial?.threads || 2);
  const [hashMb, setHashMb] = React.useState(() => initial?.hashMb || 256);
  const [installingSources, setInstallingSources] = React.useState({ package: false, legacy: false });
  const installing = installingSources.package || installingSources.legacy;
  const packageBusy = React.useCallback((value) => setInstallingSources((s) => ({ ...s, package: value })), []);
  const legacyBusy = React.useCallback((value) => setInstallingSources((s) => ({ ...s, legacy: value })), []);
  const [checking, setChecking] = React.useState(false);
  const [statuses, setStatuses] = React.useState(null);
  const [platform, setPlatform] = React.useState(null);
  const [configured, setConfigured] = React.useState(Boolean(initial?.path));
  const activationEpoch = React.useRef(0);
  React.useEffect(() => () => { activationEpoch.current++; }, []);

  React.useEffect(() => {
    if (!supportsNativeEngine(runtime)) return;
    import("@tauri-apps/api/core").then(({ invoke }) => invoke("platform_info")).then(setPlatform).catch(() => {});
  }, []);

  if (!supportsNativeEngine(runtime)) return null;

  async function inspectPath(selectedPath) {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke("inspect_engine_path", { path: selectedPath });
    if (result.enginePath) setPath(result.enginePath);
    setStatuses({
      program: result.enginePath
        ? { ok: true, text: "已找到引擎程序，点击「检测并启用」即可使用。" }
        : { ok: false, text: "未在所选目录中找到可执行程序（Windows 下为 .exe 文件）" },
      nnue: result.nnuePath
        ? { ok: true, text: "已找到配套的分析资源文件。" }
        : { ok: true, text: "未发现独立资源文件；部分引擎已内置，可直接尝试启用。" },
    });
    return result;
  }

  async function choosePath(directory) {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open(directory
        ? { directory: true, multiple: false, title: "选择引擎所在文件夹" }
        : { directory: false, multiple: false, title: "选择引擎程序", filters: [{ name: "引擎程序", extensions: ["exe", "bin", "appimage"] }] });
      if (!selected) return;
      await inspectPath(selected);
    } catch (error) {
      setStatuses({ program: { ok: false, text: String(error) }, nnue: null });
    }
  }

  async function activateProfile(profile) {
    const current = activationEpoch.current;
    await activateNativeEngine(profile, {
      manager,
      readProfile: () => getNativeEngineProfile(variant),
      writeProfile: (value) => saveNativeEngineProfile(value, variant),
      removeProfile: () => removeNativeEngineProfile(variant),
      isCurrent: () => current === activationEpoch.current,
    });
  }

  async function activateInstallation(result) {
    await activateProfile(nativeInstallationProfile(result, variant, { threads, hashMb }));
    setPath(result.enginePath);
    setConfigured(true);
    setStatuses({ program: { ok: true, text: "引擎已启用，可以开始对弈和分析了。" }, nnue: null });
    onReady?.(true, "native");
  }

  async function saveAndCheck() {
    const normalized = path.trim();
    if (!normalized) {
      setStatuses({ program: { ok: false, text: "请先选择 UCI 引擎程序或所在目录" }, nnue: null });
      return;
    }
    setChecking(true);
    try {
      const inspected = await inspectPath(normalized);
      if (!inspected.enginePath) return;
      const previous = getNativeEngineProfile(variant);
      // 同一路径保存参数时保留多棋种引擎的 UCI 选项；换手动引擎时不继承。
      await activateProfile({ ...(previous?.path === inspected.enginePath ? previous : {}),
        path: inspected.enginePath, nnuePath: inspected.nnuePath || null, args: [], threads, hashMb });
      const kinds = await manager.availableKinds();
      const ready = kinds.includes("native");
      setConfigured(ready);
      const detail = manager.errorFor?.("native");
      setStatuses((current) => ({
        ...current,
        program: ready
          ? { ok: true, text: "引擎已启用，可以开始对弈和分析了。" }
          : { ok: false, text: `程序加载失败，将自动使用云端引擎${detail ? `：${detail}` : ""}` },
        nnue: inspected.nnuePath
          ? { ok: ready, text: ready ? "配套资源文件已找到。" : "资源文件已找到，但引擎启动失败。" }
          : null,
      }));
      onReady?.(ready, ready ? "native" : null);
    } catch (error) {
      setStatuses({ program: { ok: false, text: String(error) }, nnue: null });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="native-engine-settings">
      <div className={`engine-setup-status${configured ? " is-configured" : ""}`}>
        <span className="engine-setup-status-dot" aria-hidden="true" />
        <div><strong>{configured ? "已配置本地引擎" : "还未配置本地引擎"}</strong>
          <p>{configured ? "可重新安装或导入其他引擎，启用成功后会替换当前配置。" : "安装后，让这台电脑为你计算走法。选择下面任意一种方式即可。"}</p></div>
      </div>
      {variant === "jieqi" && <p className="muted">请使用揭棋专用引擎，普通象棋引擎无法分析暗子局面。</p>}
      {platform?.os === "windows" && <NativePackageInstaller key={variant} variant={variant} externalBusy={checking || installingSources.legacy} onActivate={activateInstallation} onBusyChange={packageBusy} />}
      <section className="engine-manual-card" aria-label="导入已有文件">
      <div className="engine-setup-heading"><span className="engine-setup-icon" aria-hidden="true">↑</span><div>
        <h3>导入已有文件</h3>
        <p>已经下载过引擎？选择电脑上的程序，也可以选择解压后的文件夹。</p>
      </div></div>
      <ol className="engine-import-steps"><li>如果下载的是压缩包，请先解压，并保留里面的配套文件。</li><li>选择引擎程序（Windows 通常为 .exe），再点击「检测并启用」。</li></ol>
      <p className="engine-setup-footnote">请使用{label}。{platform?.os === "windows" && "棋岛 ZIP 引擎包可直接使用上方的导入按钮。"}</p>
      <div className="native-engine-input">
        <button type="button" onClick={() => choosePath(false)} disabled={checking || installing}>选择引擎程序</button>
        <button type="button" className="engine-folder-button" onClick={() => choosePath(true)} disabled={checking || installing}>选择文件夹</button>
        <button type="button" onClick={saveAndCheck} disabled={!path || checking || installing}>
          {checking ? "正在检测…" : "检测并启用"}
        </button>
      </div>
      <label className="engine-selected-file">已选程序
        <input
          value={path}
          readOnly
          placeholder="尚未选择，请点击上方按钮"
          title={path}
          spellCheck={false}
        />
      </label>
      </section>
      {statuses && <div className="native-engine-statuses" aria-live="polite">
        {statuses.program && <div className={statuses.program.ok ? "engine-status-ok" : "engine-status-error"}>
          <strong>{statuses.program.ok ? "✓ 提示" : "✕ 未能启用"}</strong><span>{statuses.program.text}</span>
        </div>}
        {statuses.nnue && <div className={statuses.nnue.ok ? "engine-status-ok" : "engine-status-error"}>
          <strong>{statuses.nnue.ok ? "✓ 资源" : "✕ 资源"}</strong><span>{statuses.nnue.text}</span>
        </div>}
      </div>}
      <details className="engine-setup-details engine-advanced-settings"><summary>高级设置与其他下载方式</summary>
        <p className="engine-setup-footnote">一般无需修改。调整性能参数后，点击下方按钮保存并重新启用。</p>
        <div className="native-engine-limits">
          <label>计算线程 <input type="number" disabled={checking || installing} min="1" max="8" value={threads} onChange={(event) => setThreads(Number(event.target.value))} /></label>
          <label>分析内存（MB） <input type="number" disabled={checking || installing} min="32" max="2048" step="32" value={hashMb} onChange={(event) => setHashMb(Number(event.target.value))} /></label>
        </div>
        <p className="engine-setup-footnote">建议保留一半处理器资源给界面和系统。</p>
        <button type="button" onClick={saveAndCheck} disabled={!path || checking || installing}>{checking ? "正在检测…" : "保存参数并启用"}</button>
        {platform && <p className="engine-setup-footnote">设备信息：{platform.os} / {platform.arch} · {platform.cpuCount} 线程{platform.features?.length ? ` · ${platform.features.join(" / ")}` : ""}</p>}
        <p className="engine-setup-footnote">手动下载时请选择适合本机系统的版本，并确认程序及资源文件的许可。</p>
        {variant === "xiangqi" && platform?.os === "windows" && <NativeEngineInstaller externalBusy={checking || installingSources.package} onActivate={activateInstallation} onBusyChange={legacyBusy} />}
      </details>
    </div>
  );
}
