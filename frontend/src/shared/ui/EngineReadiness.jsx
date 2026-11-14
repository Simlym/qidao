import React from "react";
import { hasLocalEngineConfiguration } from "../../domain/xiangqi/engine/localEngineConfiguration";
import "./engine-readiness.css";

const CLOUD = { ready: "已就绪", builtin: "内置可用", unavailable: "未就绪", checking: "检测中", error: "连接失败" };

function ResourceIcon({ cloud }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {cloud ? <path d="M6 18a4 4 0 0 1-.8-7.9 7 7 0 0 1 13.5 0A4 4 0 0 1 18 18H6Z" />
      : <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>}
  </svg>;
}

function Status({ cloud, label, state, text }) {
  const ready = state === "ready" || state === "builtin";
  return <div className={`engine-readiness-item is-${state}`} aria-label={`${label}：${text}`}>
    <ResourceIcon cloud={cloud} />
    <span className="engine-readiness-label">{label}</span>
    <span className="engine-readiness-value"><span className="engine-readiness-mark" aria-hidden="true">{ready ? "✓" : state === "checking" ? "···" : state === "error" ? "!" : "—"}</span>{text}</span>
  </div>;
}

export default function EngineReadiness({ variant = "xiangqi", localReady = false, localChecking = false, localRuntime,
  cloudState = "checking", cloudLabel, onOpenSettings }) {
  const configured = hasLocalEngineConfiguration(variant);
  const localState = localReady ? "ready" : localChecking ? "checking" : configured ? "error" : "unavailable";
  const localText = localReady ? "已就绪" : localChecking ? "检测中" : configured ? "未就绪" : "未配置";
  const cloudReady = cloudState === "ready" || cloudState === "builtin";
  const missing = !localReady && !cloudReady && !localChecking && cloudState !== "checking";
  const active = localReady ? "本机引擎" : cloudReady ? cloudState === "builtin" ? "云端内置引擎" : "云端引擎" : null;
  return <section className="engine-readiness" aria-label="引擎状态">
    <div className="engine-readiness-heading"><strong>引擎状态</strong><span>{active ? `当前使用：${active}` : missing ? "暂无可用引擎" : "正在检测…"}</span></div>
    <div className="engine-readiness-items" role="status" aria-live="polite">
      <Status cloud label="云端引擎" state={cloudState} text={CLOUD[cloudState] || "检测中"} />
      <Status label="本机引擎" state={localState} text={localText} />
    </div>
    <details className="engine-readiness-details"><summary>引擎详情</summary>
      <p>{cloudLabel || "云端引擎由服务器管理，需要联网使用。"}</p>
      <p>{localReady ? localRuntime === "native" ? "本机原生引擎已就绪，可在这台设备计算走法。" : "浏览器本机引擎已就绪，可在这台设备计算走法。"
        : configured ? "本机配置尚未通过检测，可到设置中重新检查。" : "本机引擎尚未配置。有云端引擎时，可直接开始，无需重复配置。"}</p>
      {onOpenSettings && <button type="button" className="engine-text-button" onClick={onOpenSettings}>管理本机引擎</button>}
    </details>
    {missing && onOpenSettings && <button type="button" className="btn-newgame" onClick={onOpenSettings}>配置本机引擎</button>}
  </section>;
}
