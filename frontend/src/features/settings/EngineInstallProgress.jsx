import React from "react";

const PHASES = {
  "checking-saved": "正在确认已安装的引擎，无需重新下载…",
  preparing: "正在连接下载…", storage: "正在准备本机存储…", reading: "正在读取文件…", saving: "正在保存到本机…", removing: "正在移除引擎…", importing: "正在读取安装包…", downloading: "正在下载…",
  verifying: "正在检查文件…", extracting: "正在安装…", testing: "正在检测引擎…",
  installed: "安装完成，准备启用…", activating: "正在启用…",
};

export default function EngineInstallProgress({ progress, onCancel }) {
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    setSlow(false);
    if (progress?.phase !== "preparing") return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [progress?.phase]);
  const downloading = progress?.phase === "downloading";
  const known = downloading && progress.total > 0;
  const percent = known ? Math.min(100, Math.floor(progress.downloaded / progress.total * 100)) : null;
  return <div className="engine-install-progress" role="status" aria-live="polite">
    <div className="engine-progress-label"><strong><span className="engine-spinner" aria-hidden="true" />{PHASES[progress?.phase] || "正在等待安装任务完成…"}</strong>{known && <span>{percent}%</span>}</div>
    <progress aria-label="安装进度" value={known ? progress.downloaded : undefined} max={known ? progress.total : 1} />
    <div className="engine-progress-footer"><span>{known ? `${(progress.downloaded / 1048576).toFixed(1)} / ${(progress.total / 1048576).toFixed(1)} MB` : progress?.phase === "checking-saved" ? "正在读取本机文件，完成后即可使用。" : slow ? "连接较慢，可以继续等待，或取消后用浏览器下载。" : "完成后会自动检查引擎是否可用。"}</span>
      {onCancel && progress?.phase !== "activating" && <button type="button" className="engine-text-button" onClick={onCancel}>取消</button>}
    </div>
  </div>;
}
