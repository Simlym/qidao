import React from "react";
import { serverEngineInstallation, installServerEngine, uploadServerEngine } from "../../shared/api/serverEngine.js";
import { adminUpdateVariantEngine } from "../../shared/api";

const samePath = (a, b, os) => {
  if (!a || !b) return false;
  const normalize = (value) => os === "windows" ? value.replaceAll("\\", "/").toLowerCase() : value;
  return normalize(a) === normalize(b);
};

export default function useServerEngineInstaller(variant) {
  const [info, setInfo] = React.useState(null);
  const [selected, setSelected] = React.useState("");
  const [path, setPath] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [feedback, setFeedback] = React.useState(null);
  const [changing, setChanging] = React.useState(false);
  const [checked, setChecked] = React.useState(null);
  const epoch = React.useRef(0);
  const operation = React.useRef(null);
  const refresh = React.useCallback(async (generation = epoch.current) => {
    const next = await serverEngineInstallation(variant);
    if (epoch.current !== generation) return;
    setInfo(next);
    setSelected((value) => next.packages.some((p) => p.id === value) ? value : next.packages.find((p) => p.publicDownload)?.id || next.packages[0]?.id || "");
    setPath(next.status.configured_path || next.status.effective_path || "");
    return next;
  }, [variant]);

  React.useEffect(() => {
    const generation = ++epoch.current;
    operation.current = null;
    setInfo(null); setChecked(null); setFeedback(null); setChanging(false); setBusy(false); setProgress(null);
    refresh(generation).catch((error) => {
      if (epoch.current === generation) setFeedback({ error: true, summary: "暂时无法读取服务器引擎状态。", detail: error.message });
    });
    return () => { ++epoch.current; operation.current?.abort(); };
  }, [refresh]);

  async function run(action, packageId = selected, targetPath = path.trim(), file = null) {
    if (operation.current) return;
    if (file && (!/\.zip$/i.test(file.name) || !file.size || file.size > 256 * 1048576)) {
      setFeedback({ error: true, summary: "请选择不超过 256 MB 的棋岛 ZIP 引擎包。" });
      return;
    }
    const task = new AbortController();
    const generation = epoch.current;
    const active = () => epoch.current === generation;
    operation.current = task;
    setBusy(true); setFeedback(null);
    setProgress({ phase: file ? "uploading" : ["verify", "probe"].includes(action) ? "testing" : "preparing" });
    try {
      const options = {
        signal: task.signal, onProgress: (value) => active() && setProgress(value),
      };
      const status = file ? await uploadServerEngine(variant, file, options)
        : await installServerEngine(variant, { action, package_id: packageId, path: targetPath }, options);
      if (active()) {
        setChecked({ path: status.effective_path, ok: true }); setChanging(false);
        setFeedback({ summary: "检测通过，服务器引擎已就绪。" });
      }
    } catch (error) {
      if (active()) {
        if (error.name === "AbortError") setFeedback({ summary: "已请求取消，正在重新确认服务器状态。" });
        else {
          if ((action === "verify" && packageId === current?.package.id) || (action === "probe" && samePath(targetPath, info?.status.effective_path, info?.status.os))) {
            setChecked({ path: info.status.effective_path, ok: false });
          }
          setFeedback({ error: true, summary: "操作未完成，原引擎配置已保留。", detail: error.message });
        }
      }
    } finally {
      if (active()) {
        try { await refresh(generation); }
        catch (error) { if (active()) setFeedback({ error: true, summary: "暂时无法确认服务器状态，请重新读取。", detail: error.message }); }
        if (active()) { setBusy(false); setProgress(null); }
      }
      if (operation.current === task) operation.current = null;
    }
  }

  async function clear() {
    if (operation.current) return;
    const task = new AbortController();
    const generation = epoch.current;
    operation.current = task;
    setBusy(true); setFeedback(null); setProgress({ phase: "saving" });
    try {
      await adminUpdateVariantEngine(variant, "");
      if (generation !== epoch.current) return;
      setChecked(null); setChanging(false);
      await refresh(generation);
      if (generation === epoch.current) setFeedback({ summary: "已清除后台路径配置。若服务器配置了环境变量，仍会使用对应引擎。安装文件已保留。" });
    } catch (error) {
      if (generation === epoch.current) setFeedback({ error: true, summary: "未能清除配置，请重试。", detail: error.message });
    } finally {
      if (generation === epoch.current) { setBusy(false); setProgress(null); }
      if (operation.current === task) operation.current = null;
    }
  }

  const current = info?.installed.find((item) => samePath(item.enginePath, info.status.effective_path, info.status.os));
  const ready = samePath(checked?.path, info?.status.effective_path, info?.status.os) ? checked.ok : null;
  return { info, selected, setSelected, path, setPath, busy, progress, feedback,
    changing, setChanging, current, ready, refresh, run, upload: (file) => run("import", "", "", file), clear, cancel: () => operation.current?.abort() };
}
