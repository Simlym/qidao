import React from "react";
import ConnectedAccountGate from "../shared/ui/ConnectedAccountGate";
import Trainer from "../features/training/TrainingPage";
import Coach from "../features/coach/Coach";
import Stats from "../features/stats/Stats";
import Games from "../features/games/Games";
import { useLocalGameSync } from "../features/play/useLocalGameSync.js";
import Play from "../features/play/Play";
import FreeAnalysis from "../features/analysis/FreeAnalysis.jsx";
import JieqiPlay from "../features/jieqi/JieqiPlay";
import Challenge from "../features/challenge/Challenge";
import Auth from "../features/auth/Auth";
import Admin from "../features/admin/Admin";
import Settings from "../features/settings/Settings";
import Today from "../features/today/Today";
import Learning from "../features/learning/Learning";
import { fetchMe, getToken, setToken, resetGuestId, getCredits, checkinCredits, getEntitlements } from "../shared/api";
import { useReminders } from "../features/today/useReminders";
import { runtime, usesDesktopLayout, RUNTIME } from "../platform/runtime";
import { useCosmeticPreferences } from "../shared/preferences/cosmetics";
import { PrimaryNavigation, SecondaryNavigation } from "./AppNavigation";
import { resolveNavigation } from "./navigation";
import DesktopShell from "./shells/DesktopShell";
import WebShell from "./shells/WebShell";
import { ANDROID_BACK_EVENT, backDispatcher, dismissTopDialog } from "../platform/backNavigation";
import { useBackAction } from "../shared/hooks/useBackAction";

// 顶部积分徽标 + 每日签到。训练积分用于外观兑换，AI 使用独立额度。
function CreditsBadge({ credits, onCheckin }) {
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState("");
  if (!credits) return null;

  async function doCheckin() {
    if (busy || credits.checkin_today) return;
    setBusy(true);
    try {
      const r = await checkinCredits();
      if (r.awarded > 0) {
        setToast(`签到 +${r.awarded} 积分${r.streak > 1 ? `（连签 ${r.streak} 天）` : ""}`);
        setTimeout(() => setToast(""), 2600);
      }
      onCheckin();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="credits-box">
      <span className="credits-amt" title="训练积分：用于外观兑换；AI 额度请在账户设置查看">
        💎 {credits.balance}
      </span>
      <button
        className="btn-link credits-checkin"
        onClick={doCheckin}
        disabled={busy || credits.checkin_today}
        title={credits.checkin_today ? "今日已签到" : "每日签到领积分"}
      >
        {credits.checkin_today ? "已签到" : busy ? "…" : "签到"}
      </button>
      {toast && <span className="credits-toast">{toast}</span>}
    </span>
  );
}

export default function App() {
  const isDesktop = usesDesktopLayout(runtime);
  const appearance = useCosmeticPreferences();
  const [tab, setTab] = React.useState("today");
  const [settingsSection, setSettingsSection] = React.useState("general");
  function openEngineSettings(variant) {
    setSettingsSection(variant);
    setTab("settings");
  }
  // 训练目标：null | {puzzleId} | {category}，用于从复盘/弱点跳转到指定练习
  const [trainTarget, setTrainTarget] = React.useState(null);
  // 复盘目标：从对弈结束「一键复盘」跳转时携带的棋局 id
  const [reviewGameId, setReviewGameId] = React.useState(null);
  const [analysisTarget, setAnalysisTarget] = React.useState(null);
  const [user, setUser] = React.useState(null); // {username, role}
  useLocalGameSync(user?.username || "guest");
  const [credits, setCredits] = React.useState(null); // {balance, checkin_today, costs, ...}
  const [entitlements, setEntitlements] = React.useState(null);
  const [authOpen, setAuthOpen] = React.useState(false);
  const [authMode, setAuthMode] = React.useState("login");
  const [authTarget, setAuthTarget] = React.useState(null);
  const desktopUserMenuRef = React.useRef(null);
  useBackAction(() => {
    const button = document.querySelector(".auth-close-confirm-actions button") || document.querySelector(".auth-close");
    button?.click();
    return true;
  }, { enabled: authOpen, priority: 300 });
  useBackAction(() => {
    const menu = document.querySelector("details[open]");
    if (menu) { menu.open = false; return true; }
    if (tab !== "today") { setTab("today"); return true; }
    return false;
  });
  React.useEffect(() => {
    const onBack = (event) => {
      if (dismissTopDialog(document) || backDispatcher.dispatch()) event.preventDefault();
    };
    window.addEventListener(ANDROID_BACK_EVENT, onBack);
    return () => window.removeEventListener(ANDROID_BACK_EVENT, onBack);
  }, []);

  function openAuth(mode = "login", target = null) {
    setAuthMode(mode);
    setAuthTarget(target);
    setAuthOpen(true);
  }

  function closeAuth() {
    setAuthOpen(false);
    setAuthTarget(null);
  }

  function startTraining() {
    if (user) setTab("train");
    else openAuth("login", "train");
  }

  // 拉取积分余额；登录态下调用，未登录清空
  const refreshCredits = React.useCallback(() => {
    if (!getToken()) {
      setCredits(null);
      return;
    }
    getCredits().then(setCredits).catch(() => {});
  }, []);
  const refreshEntitlements = React.useCallback(() => {
    if (!getToken()) {
      setEntitlements(null);
      return;
    }
    getEntitlements().then(setEntitlements).catch(() => setEntitlements(null));
  }, []);
  // 到期复习提醒（本地通知 + 顶部横幅）
  const reminders = useReminders(user);

  React.useEffect(() => {
    document.body.classList.toggle("desktop-runtime", isDesktop);
    return () => document.body.classList.remove("desktop-runtime");
  }, [isDesktop]);

  React.useEffect(() => {
    document.body.dataset.appTheme = appearance.app;
    return () => { delete document.body.dataset.appTheme; };
  }, [appearance.app]);

  React.useEffect(() => {
    function closeUserMenu(event) {
      const menu = desktopUserMenuRef.current;
      if (menu?.open && !menu.contains(event.target)) menu.removeAttribute("open");
    }
    function closeUserMenuOnEscape(event) {
      if (event.key === "Escape") desktopUserMenuRef.current?.removeAttribute("open");
    }
    document.addEventListener("pointerdown", closeUserMenu);
    document.addEventListener("keydown", closeUserMenuOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeUserMenu);
      document.removeEventListener("keydown", closeUserMenuOnEscape);
    };
  }, []);

  // 跳到训练并指定要练的题/类目
  function practicePuzzle(puzzleId) {
    setTrainTarget({ puzzleId });
    setTab("train");
  }
  function practiceCategory(category) {
    setTrainTarget({ category });
    setTab("train");
  }
  // 跳到复盘并打开指定棋局
  function reviewGame(gameId) {
    setReviewGameId(gameId);
    setTab("games");
  }

  // 启动时若有 token，拉取当前用户与积分
  React.useEffect(() => {
    if (getToken()) {
      fetchMe()
        .then((u) => {
          setUser(u);
          refreshCredits();
          refreshEntitlements();
        })
        .catch((error) => { if (error.status === 401) setToken(null); });
    }
  }, [refreshCredits, refreshEntitlements]);

  function onAuth(res) {
    setToken(res.token);
    resetGuestId();
    setUser({ username: res.username, role: res.role });
    setAuthOpen(false);
    if (authTarget) setTab(authTarget);
    setAuthTarget(null);
    refreshCredits();
    refreshEntitlements();
  }

  function logout() {
    setToken(null);
    setUser(null);
    setCredits(null);
    setEntitlements(null);
    if (tab === "admin") setTab("today");
  }

  // 登录态失效（如收到 401）时，清理并弹出登录框
  function requireLogin() {
    openAuth("login");
  }
  function practiceScope(scope) {
    setTrainTarget(scope);
    setTab("train");
  }
  function startPack(pack) {
    setTrainTarget({ packId: pack.id, packType: pack.type, title: pack.title, puzzleIds: pack.puzzle_ids });
    setTab("train");
  }

  // 管理后台只服务于 Web 部署，PC/移动客户端不提供入口
  const isAdmin = runtime === RUNTIME.WEB && user?.role === "admin";

  const { activeGroup, activeTab } = resolveNavigation(tab, { isAdmin });
  const navigation = <PrimaryNavigation tab={tab} desktop={isDesktop} onNavigate={setTab} />;
  const secondaryNavigation = <SecondaryNavigation tab={tab} activeGroup={activeGroup} onNavigate={setTab} />;

  const account = user ? (
    <>
      <div className="web-account-identity">
        <strong>{user.username}</strong>
        {entitlements?.active && <span className="member-badge">PRO</span>}
      </div>
      <CreditsBadge credits={credits} onCheckin={refreshCredits} />
      <button className="btn-link" onClick={logout}>退出登录</button>
    </>
  ) : (
    <div className="web-auth-actions" role="group" aria-label="登录与注册">
      <button className="btn-link web-login-button" onClick={() => openAuth("login")}>登录</button>
      <button className="btn-link btn-register" onClick={() => openAuth("register")}>注册</button>
    </div>
  );

  const desktopAccount = user ? (
    <details className="desktop-user-menu" ref={desktopUserMenuRef}>
      <summary>
        <span className="desktop-avatar">{user.username?.slice(0, 1) || "棋"}</span>
        <span className="desktop-user-summary">
          <strong>{user.username}</strong>
          <small>
            {credits ? `💎 ${credits.balance}${credits.checkin_today ? " · 今日已签到" : " · 今日未签到"}` : "账户已登录"}
          </small>
        </span>
        <span className="desktop-user-arrow" aria-hidden>›</span>
      </summary>
      <div className="desktop-user-popover">
        <div className="desktop-user-popover-head">
          <strong>{user.username}</strong>
          {entitlements?.active && <span className="member-badge">PRO</span>}
        </div>
        <CreditsBadge credits={credits} onCheckin={refreshCredits} />
        <button className="desktop-logout" onClick={logout}>退出登录</button>
      </div>
    </details>
  ) : (
    <div className="desktop-guest-account">
      <span className="desktop-avatar">棋</span>
      <div>
        <strong>游客模式</strong>
        <small>登录后同步训练进度</small>
      </div>
      <button onClick={() => openAuth("login")}>登录</button>
    </div>
  );

  const reminderBanner = reminders.banner && (
    <div className="reminder-banner">
      <span>{reminders.banner}</span>
      <button className="btn-link" onClick={() => setTab("train")}>去复习 →</button>
      {reminders.canEnable && (
        <button className="btn-link" onClick={reminders.enable}>开启提醒</button>
      )}
      <button className="reminder-x" onClick={reminders.dismiss}>×</button>
    </div>
  );

  const pageContent = (
    <>
      {tab === "today" && (
        <Today user={user} onNavigate={setTab} onPractice={practiceCategory} onStartTraining={startTraining} />
      )}
      {tab === "train" && (
        <Trainer
          target={trainTarget}
          onTargetConsumed={() => setTrainTarget(null)}
          user={user}
          onCreditsChanged={refreshCredits}
          onRequireLogin={requireLogin}
        />
      )}
      {tab === "coach" && (
        <ConnectedAccountGate user={user} onRequireLogin={requireLogin} title="AI 教练">
        <Coach
          onPractice={practiceCategory}
          onNavigate={setTab}
          user={user}
          credits={credits}
          entitlements={entitlements}
          onCreditsChanged={refreshCredits}
          onRequireLogin={requireLogin}
        />
        </ConnectedAccountGate>
      )}
      {tab === "challenge" && <ConnectedAccountGate user={user} onRequireLogin={requireLogin} title="题库闯关"><Challenge key={user?.username} /></ConnectedAccountGate>}
      {tab === "learning" && <ConnectedAccountGate user={user} onRequireLogin={requireLogin} title="学习计划"><Learning key={user?.username} onPractice={practiceScope} onStartPack={startPack} /></ConnectedAccountGate>}
      {tab === "stats" && <Stats onPractice={practiceCategory} />}
      {tab === "play" && (
        <Play
          onFreeAnalysis={(fen) => { setAnalysisTarget({ fen, id: Date.now() }); setTab("analysis"); }}
          onGoReview={reviewGame}
          user={user}
          onCreditsChanged={refreshCredits}
          onRequireLogin={requireLogin}
          onOpenSettings={() => openEngineSettings("xiangqi")}
        />
      )}
      {tab === "jieqi" && (
        <JieqiPlay onOpenSettings={() => openEngineSettings("jieqi")} />
      )}
      {tab === "analysis" && <FreeAnalysis key={analysisTarget?.id || "initial"} initialFen={analysisTarget?.fen} onOpenSettings={() => openEngineSettings("xiangqi")} />}
      {tab === "admin" && isAdmin && <Admin />}
      {tab === "settings" && (
        <Settings
          initialSection={settingsSection}
          onSectionChange={setSettingsSection}
          user={user}
          credits={credits}
          onCreditsChanged={refreshCredits}
          onRequireLogin={requireLogin}
        />
      )}
      {tab === "games" && (
        <Games
          initialGameId={reviewGameId}
          onInitialGameConsumed={() => setReviewGameId(null)}
          onNavigateToTrain={practicePuzzle}
          onStartPack={startPack}
          user={user}
          onCreditsChanged={refreshCredits}
          onRequireLogin={requireLogin}
        />
      )}
    </>
  );

  return (
    <div className={`app app-theme-${appearance.app} ${appearance.app !== "classic" ? "app-theme-custom" : ""} ${isDesktop ? "app-desktop" : "app-web"}`}>
      {isDesktop ? (
        <DesktopShell
          tab={tab} activeGroup={activeGroup} activeTab={activeTab}
          navigation={navigation} secondaryNavigation={secondaryNavigation}
          reminderBanner={reminderBanner} account={desktopAccount} onNavigate={setTab}
        >
          {pageContent}
        </DesktopShell>
      ) : (
        <WebShell
          user={user} navigation={navigation} secondaryNavigation={secondaryNavigation}
          reminderBanner={reminderBanner} account={account} onNavigate={setTab}
        >
          {pageContent}
        </WebShell>
      )}
      {authOpen && (
        <Auth initialMode={authMode} intro={authTarget === "train" ? "登录后即可开始训练，练习进度将随账号保存。" : undefined} onClose={closeAuth} onAuth={onAuth} />
      )}
    </div>
  );
}
