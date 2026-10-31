import React from "react";
import { runtime, RUNTIME } from "../../platform/runtime";

// Web 与 Android 共享响应式外壳；Android 的能力差异由 platform/runtime 和适配器处理。
export default function WebShell({ user, navigation, secondaryNavigation, reminderBanner, account, children, onNavigate }) {
  const accountMenuRef = React.useRef(null);

  React.useEffect(() => {
    function closeOnOutsideClick(event) {
      const menu = accountMenuRef.current;
      if (menu?.open && !menu.contains(event.target)) menu.open = false;
    }
    function closeOnEscape(event) {
      const menu = accountMenuRef.current;
      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function closeAfterAction(event) {
    if (event.target.closest("button:not(.credits-checkin)")) accountMenuRef.current.open = false;
  }

  return (
    <>
      <header className="web-header">
        <div className="web-brand" aria-label="棋岛首页">
          <span className="web-brand-mark" aria-hidden>棋</span>
          <span className="web-brand-copy"><h1>棋岛</h1><small>QI DAO</small></span>
        </div>
        {navigation}
        <div className="user-box">
          <details className="web-account-menu" ref={accountMenuRef}>
            <summary aria-label={user ? `${user.username}的账户菜单` : "账户菜单"}>
              <span className="web-account-avatar" aria-hidden>{user?.username?.slice(0, 1) || "棋"}</span>
              <span className="web-account-name">{user?.username || "我的账户"}</span>
              <span className="web-account-arrow" aria-hidden>▾</span>
            </summary>
            <div className="web-account-popover" onClick={closeAfterAction}>
              <div className="web-account-content">{account}</div>
              <div className="web-account-actions">
                <button className="btn-link" onClick={() => onNavigate("settings")}>设置</button>
                {runtime === RUNTIME.WEB && user?.role === "admin" && (
                  <button className="btn-link" onClick={() => onNavigate("admin")}>管理后台</button>
                )}
              </div>
            </div>
          </details>
        </div>
      </header>
      {reminderBanner}
      {secondaryNavigation}
      <main>{children}</main>
    </>
  );
}
