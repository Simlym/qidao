import React from "react";

// PC 与服务器共用状态卡片，各自保留本机和远程操作的生命周期。
export default function EngineStatusCard({ title, description, ready = false, configured = false, failed = false, status, busy = false, label, children }) {
  return <section className={`engine-main-card${configured ? " is-configured" : ""}${failed ? " has-error" : ""}`} aria-label={label} aria-busy={busy}>
    <div className={`engine-main-icon${failed ? " is-error" : ready || configured ? " is-ready" : ""}`} aria-hidden="true">{failed ? "!" : ready || configured ? "✓" : "棋"}</div>
    <div className="engine-main-content">
      {status ? <div className="engine-main-title"><h3>{title}</h3>{status}</div> : <h3>{title}</h3>}
      <p className="engine-main-description">{description}</p>
      {children}
    </div>
  </section>;
}
