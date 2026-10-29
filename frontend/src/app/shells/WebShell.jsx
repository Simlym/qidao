import React from "react";
import { runtime, RUNTIME } from "../../platform/runtime";

// Web 与 Android 共享响应式外壳；Android 的能力差异由 platform/runtime 和适配器处理。
export default function WebShell({ user, navigation, secondaryNavigation, reminderBanner, serverIndicator, account, children, onNavigate }) {
  return (
    <>
      <header className="web-header">
        <div className="web-brand" aria-label="棋岛首页">
          <span className="web-brand-mark" aria-hidden>棋</span>
          <span className="web-brand-copy"><h1>棋岛</h1><small>QI DAO</small></span>
        </div>
        {navigation}
        <div className="user-box">
          <button className="btn-link" onClick={() => onNavigate("settings")}>设置</button>
          {runtime === RUNTIME.WEB && user?.role === "admin" && (
            <button className="btn-link" onClick={() => onNavigate("admin")}>后台</button>
          )}
          {account}
        </div>
      </header>
      <div className="web-server-bar">{serverIndicator}</div>
      {reminderBanner}
      {secondaryNavigation}
      <main>{children}</main>
    </>
  );
}
