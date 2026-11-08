import React from "react";
import catalog from "../../domain/xiangqi/engine/wasm-packages.json";
import { installBrowserEngine, importBrowserEngineArchive, installBrowserEngineDirectory } from "../../domain/xiangqi/engine/browserEngineInstaller.js";
import { getBrowserEngineProfile, removeBrowserEnginePackage, browserEngineCapabilities } from "../../domain/xiangqi/engine/browserEnginePackages.js";
import { probeBrowserEngineProfile, resetLocalEngine } from "../../domain/xiangqi/engine/localEngine.js";
import { ensureBrowserEngineStorage } from "../../platform/browserEngineStorage.js";
import { browserEngineOptions, recommendedBrowserEngine } from "./browserEngineOptions";

export function useBrowserEngineInstaller({ variant, manager }) {
  const capabilities = browserEngineCapabilities();
  const options = browserEngineOptions(catalog.packages, variant, capabilities);
  const [selected, setSelected] = React.useState("");
  const spec = options.find((item) => item.spec.id === selected && item.available)?.spec || recommendedBrowserEngine(options);
  const [profile, setProfile] = React.useState(() => getBrowserEngineProfile(variant));
  const [ready, setReady] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [message, setMessage] = React.useState(null);
  const [changing, setChanging] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [candidate, setCandidate] = React.useState(null);
  const operation = React.useRef(null);
  const epoch = React.useRef(0);
  React.useEffect(() => () => { epoch.current++; operation.current?.abort(); }, [variant]);

  async function run(action, value = candidate) {
    if (operation.current || (action === "download" && !spec)) return;
    const controller = new AbortController();
    operation.current = controller;
    const currentEpoch = epoch.current;
    const mounted = () => currentEpoch === epoch.current;
    const current = () => mounted() && operation.current === controller && !controller.signal.aborted;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 300000);
    setBusy(true); setMessage(null);
    setProgress({ phase: action === "remove" ? "removing" : "storage" });
    try {
      let next;
      if (action === "remove") {
        await manager.dispose();
        if (!current()) return;
        await removeBrowserEnginePackage(variant);
        resetLocalEngine(variant);
        if (mounted()) { setProfile(null); setReady(false); setChanging(false); }
        return;
      }
      await ensureBrowserEngineStorage(controller.signal);
      if (!current()) return;
      const onProgress = (event) => { if (current()) setProgress(event); };
      const installOptions = { signal: controller.signal, isCurrent: current, onProgress, probe: probeBrowserEngineProfile,
        beforeCommit: async () => { if (current()) { await manager.dispose(); resetLocalEngine(variant); } } };
      if (action === "test") {
        setProgress({ phase: "testing" });
        if (!await probeBrowserEngineProfile(profile, controller.signal)) throw new Error("引擎无法启动，请重新安装或检查引擎文件是否完整。");
        next = profile;
      } else if (action === "download") {
        setProgress({ phase: "preparing" });
        next = await installBrowserEngine(spec, variant, installOptions);
      } else if (value?.kind === "zip") {
        setProgress({ phase: "reading" });
        next = await importBrowserEngineArchive(value.file, variant, { ...installOptions, packages: catalog.packages });
      } else if (value?.kind === "directory") {
        next = await installBrowserEngineDirectory(value.files, variant, installOptions);
      } else throw new Error("请先选择安装包或引擎目录。");
      if (current()) {
        setProfile(next); setReady(true); setChanging(false); setImporting(false); setCandidate(null);
      }
    } catch (error) {
      if (mounted()) {
        if (action === "test") setReady(false);
        setMessage(controller.signal.aborted ? { summary: timedOut ? "操作超时，当前引擎未更换。请检查网络后重试。" : "操作已取消，当前引擎未更换。", error: timedOut }
          : { summary: error.code ? error.message : action === "download" ? "下载或安装未完成，请重试，或下载后手动导入。" : action === "remove" ? "引擎未能移除，请重试。" : "未能启用引擎，原配置已保留。请确认文件完整且适用于当前棋种。",
            error: true, detail: error.code ? "" : error.message || String(error), code: error.code });
      }
    } finally {
      clearTimeout(timer);
      if (operation.current === controller) {
        operation.current = null;
        if (mounted()) { setBusy(false); setProgress(null); }
      }
    }
  }
  function openImport() { setMessage(null); setCandidate(null); setImporting(true); }
  function chooseCandidate(value) { setMessage(null); setCandidate(value); }
  return { capabilities, options, spec, setSelected, profile, ready, busy, progress, message, setMessage,
    changing, setChanging, importing, setImporting, candidate, chooseCandidate, openImport, run,
    cancel: () => operation.current?.abort() };
}
