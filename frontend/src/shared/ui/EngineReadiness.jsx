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

function Status({ cloud, label, state, text, onClick, action }) {
  const ready = state === "ready" || state === "builtin";
  const Tag = onClick ? "button" : "div";
  return <Tag type={onClick ? "button" : undefined} onClick={onClick}
    className={`engine-readiness-item is-${state} ${cloud ? "is-cloud" : "is-local"}${onClick ? " is-clickable" : ""}`}
    aria-label={`${label}：${text}${action ? `，${action}` : ""}`}>
    <span className="engine-readiness-resource"><ResourceIcon cloud={cloud} /></span>
    <span className="engine-readiness-label">{label}</span>
    {!cloud && <span className="engine-readiness-recommended">推荐</span>}
    <span className="engine-readiness-value"><span className="engine-readiness-mark" aria-hidden="true">{ready ? "✓" : state === "checking" ? "···" : !cloud || state === "error" ? "!" : "—"}</span>{text}</span>
    {action && <span className="engine-readiness-action">{action} ›</span>}
  </Tag>;
}

export default function EngineReadiness({ variant = "xiangqi", localReady = false, localChecking = false, localRuntime,
  cloudState = "checking", cloudLabel, onOpenSettings }) {
  const configured = hasLocalEngineConfiguration(variant);
  const localState = localReady ? "ready" : localChecking ? "checking" : configured ? "error" : "unavailable";
  const localText = localReady ? "已就绪" : localChecking ? "检测中" : configured ? "未就绪" : "未配置";
  const cloudReady = cloudState === "ready" || cloudState === "builtin";
  const missing = !localReady && !cloudReady && !localChecking && cloudState !== "checking";
  const active = localReady ? "本机计算 · 不占用服务器资源" : cloudReady ? "暂用云端 · 建议优先配置本机" : null;
  const localAction = localReady ? "管理本机引擎" : configured ? "检查本机配置" : "下载并配置";
  return <section className="engine-readiness" aria-label="引擎状态">
    <div className="engine-readiness-heading"><strong>引擎状态</strong><span className={!localReady && cloudReady ? "is-cloud-fallback" : ""}>{active || (missing ? "请先配置本机引擎" : "正在检测…")}</span></div>
    <div className="engine-readiness-items" role="status" aria-live="polite">
      <Status label="本机引擎" state={localState} text={localText} onClick={onOpenSettings} action={onOpenSettings ? localAction : undefined} />
      <Status cloud label="云端备用" state={cloudState} text={CLOUD[cloudState] || "检测中"} />
    </div>
    {!localReady && !localChecking && <div className="engine-readiness-recommendation">
      <div><strong>{configured ? "建议先检查并启用本机引擎" : "推荐使用本机引擎"}</strong>
        <p>走法计算在这台设备上完成，可减轻服务器压力，减少云端繁忙时的等待。配置完成后会优先使用本机引擎；已有文件也可直接导入。</p></div>
      {onOpenSettings && <button type="button" className="engine-readiness-primary" onClick={onOpenSettings}>{configured ? "检查并启用" : "下载并配置本机引擎"}</button>}
    </div>}
    {localReady && <p className="engine-readiness-local-ready">✓ 本机引擎已就绪，将优先在这台设备上计算。</p>}
    <details className="engine-readiness-details"><summary>引擎详情</summary>
      <p>{cloudLabel || "云端引擎由服务器管理，需要联网使用"}。云端仅作备用，建议优先使用本机引擎。</p>
      <p>{localReady ? localRuntime === "native" ? "本机原生引擎已就绪，可在这台设备计算走法。" : "浏览器本机引擎已就绪，可在这台设备计算走法。"
        : configured ? "本机配置尚未通过检测，可到设置中重新检查。" : "本机引擎尚未配置，请通过上方入口下载或导入。"}</p>
    </details>
  </section>;
}
