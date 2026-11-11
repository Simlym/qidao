import React from "react";

// PC 与服务器共用状态卡片，各自保留本机和远程操作的生命周期。
export default function EngineStatusCard({ title, description, ready = false, busy = false, label, children }) {
  return <section className="engine-main-card" aria-label={label} aria-busy={busy}>
    <div className={`engine-main-icon${ready ? " is-ready" : ""}`} aria-hidden="true">{ready ? "✓" : "棋"}</div>
    <div className="engine-main-content">
      <h3>{title}</h3>
      <p className="engine-main-description">{description}</p>
      {children}
    </div>
  </section>;
}
