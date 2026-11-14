import React from "react";

// Web 与 Android 共享响应式外壳；Android 的能力差异由 platform/runtime 和适配器处理。
export default function WebShell({ tab, isAdmin, user, navigation, secondaryNavigation, reminderBanner, account, children, onNavigate }) {
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
          {isAdmin && (
            <button
              type="button"
              className={`btn-link web-admin-button${tab === "admin" ? " active" : ""}`}
              aria-current={tab === "admin" ? "page" : undefined}
              onClick={() => onNavigate("admin")}
            >管理后台</button>
          )}
          {user ? <details className="web-account-menu" ref={accountMenuRef}>
            <summary aria-label={`${user.username}的账户菜单`}>
              <span className="web-account-avatar" aria-hidden>{user.username.slice(0, 1)}</span>
              <span className="web-account-name">{user.username}</span>
              <span className="web-account-arrow" aria-hidden>▾</span>
            </summary>
            <div className="web-account-popover" onClick={closeAfterAction}>
              <div className="web-account-content">{account}</div>
              <div className="web-account-actions">
                <button className="btn-link" onClick={() => onNavigate("settings")}>设置</button>
              </div>
            </div>
          </details> : <>
            <button className="web-settings-button" type="button" aria-label="设置" title="设置" onClick={() => onNavigate("settings")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9.7 4.5 10.2 2h3.6l.5 2.5 1.7 1 2.4-.8 1.8 3.1-1.9 1.7v2l1.9 1.7-1.8 3.1-2.4-.8-1.7 1-.5 2.5h-3.6l-.5-2.5-1.7-1-2.4.8-1.8-3.1 1.9-1.7v-2L3.8 7.8l1.8-3.1 2.4.8Z" transform="translate(0 1)" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            {account}
          </>}
        </div>
      </header>
      {reminderBanner}
      {secondaryNavigation}
      <main>{children}</main>
    </>
  );
}
