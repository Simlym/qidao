import React from "react";
import { getCosmetics } from "../api";
import { setCosmeticPreference, useCosmeticPreferences } from "../preferences/cosmetics";
import { useSoundPreferences } from "../hooks/useSoundPreferences";
import { previewSound, setSoundMuted, setSoundTheme, SOUND_THEMES } from "../sounds";
import "./board-appearance.css";

// 离线时仍允许选择基础免费款；付费款必须由服务端确认已拥有。
const BASIC_ITEMS = [
  ["board", "classic", "榆木经典"], ["board", "paper", "宣纸棋枰"],
  ["piece", "classic", "牙色楷书"], ["piece", "ink", "水墨棋子"], ["piece", "bold", "醒目大字"],
  ...SOUND_THEMES.map(({ key, label }) => ["sound", key, label]),
].map(([type, theme, name]) => ({ key: `${type}_${theme}`, type, theme, name, price: 0, owned: true }));
const CATEGORIES = [["board", "棋盘"], ["piece", "棋子"], ["sound", "声音"]];

function PiecePreview({ theme }) {
  return <span className="appearance-piece-pair" aria-hidden="true">
    <span className={`xq-piece red piece-theme-${theme}`}>帥</span>
    <span className={`xq-piece black piece-theme-${theme}`}>將</span>
  </span>;
}

export function BoardAppearancePanel({ user, initialCategory = "board" }) {
  const [category, setCategory] = React.useState(initialCategory);
  const [catalog, setCatalog] = React.useState(BASIC_ITEMS);
  const [loadState, setLoadState] = React.useState("loading");
  const [retry, setRetry] = React.useState(0);
  const [showLocked, setShowLocked] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const appearance = useCosmeticPreferences();
  const { muted, theme } = useSoundPreferences();
  React.useEffect(() => {
    let active = true;
    setCatalog(BASIC_ITEMS);
    setLoadState("loading");
    getCosmetics().then((result) => {
      if (!Array.isArray(result.items)) throw new Error("外观目录无效");
      if (active) { setCatalog(result.items); setLoadState("ready"); }
    }).catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, [user?.username, retry]);

  function select(item) {
    if (!item.owned) return;
    if (item.type === "sound") setSoundTheme(item.theme);
    else setCosmeticPreference(item.type, item.theme);
    setNotice(`已使用「${item.name}」`);
  }

  function reset() {
    setCosmeticPreference("board", "classic");
    setCosmeticPreference("piece", "classic");
    setSoundTheme("wood");
    setSoundMuted(false);
    setNotice("已恢复默认棋盘、棋子和音效");
  }

  return <section className="board-appearance-panel" aria-label="棋盘与音效设置">
    <p className="appearance-help">点击即生效，自动保存到本机；其他棋盘页面也会使用。</p>
    <div className="appearance-categories" role="group" aria-label="设置分类">
      {CATEGORIES.map(([key, label]) => <button key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>{label}</button>)}
    </div>
    {category === "sound" && <div className="appearance-sound-controls">
      <label><input type="checkbox" role="switch" checked={!muted} onChange={(event) => setSoundMuted(!event.target.checked)} />对弈音效{muted ? "已关闭" : "已开启"}</label>
      <div>{[["move", "走子"], ["capture", "吃子"], ["check", "将军"]].map(([key, label]) => <button key={key} onClick={() => previewSound(key)}>试听{label}</button>)}</div>
      <small>试听只播放一次，不改变音效开关。</small>
    </div>}
    {loadState === "loading" && <p className="appearance-help" role="status">正在加载更多外观，可先使用基础款。</p>}
    {loadState === "error" && <p className="appearance-help" role="status">目录暂时不可用，仍可使用基础款。<button onClick={() => setRetry((value) => value + 1)}>重试</button></p>}
    <div className="appearance-options" aria-label={CATEGORIES.find(([key]) => key === category)[1]}>
      {catalog.filter((item) => item.type === category && (item.owned || showLocked)).map((item) => {
        const selected = (category === "sound" ? theme : appearance[category]) === item.theme;
        return <button key={item.key} className="appearance-option" aria-pressed={selected} disabled={!item.owned} onClick={() => select(item)} title={item.description}>
          {category === "board" && <span className={`appearance-board-preview cosmetic-preview preview-board-${item.theme}`} aria-hidden="true">楚河　汉界</span>}
          {category === "piece" && <PiecePreview theme={item.theme} />}
          {category === "sound" && <span className="appearance-sound-mark" aria-hidden="true">♫</span>}
          <strong>{item.name}</strong><small>{!item.owned ? "未解锁" : selected ? "✓ 使用中" : item.price === 0 ? "免费" : "已拥有"}</small>
        </button>;
      })}
    </div>
    <div className="appearance-footer"><button onClick={() => setShowLocked((value) => !value)} aria-expanded={showLocked}>{showLocked ? "收起未解锁款" : "更多外观"}</button><button onClick={reset}>恢复默认</button></div>
    {showLocked && <p className="appearance-help">未解锁款可在设置页的「棋盘与外观」中查看和解锁。</p>}
    <p className="appearance-notice" role="status">{notice}</p>
  </section>;
}

export function BoardAppearanceDialog({ user, initialCategory, onClose }) {
  const dialog = React.useRef(null);
  React.useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="board-appearance-dialog" aria-label="棋盘与音效" onClose={onClose} onCancel={onClose} onClick={(event) => {
    if (event.target !== dialog.current) return;
    const rect = dialog.current.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    <header><h2>棋盘与音效</h2><button autoFocus onClick={onClose} aria-label="关闭棋盘与音效">×</button></header>
    <BoardAppearancePanel user={user} initialCategory={initialCategory} />
  </dialog>;
}
