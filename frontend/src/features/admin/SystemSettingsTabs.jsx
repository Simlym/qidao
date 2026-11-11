import React from "react";
import "./system-settings.css";

const SECTIONS = [
  { key: "xiangqi", label: "象棋引擎", icon: <><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/><rect x="10" y="10" width="4" height="4" rx=".5"/></> },
  { key: "jieqi", label: "揭棋引擎", icon: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></> },
  { key: "ai", label: "AI 复盘", icon: <><path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z"/><path d="M8 8h8M8 12h5"/></> },
];

export default function SystemSettingsTabs({ renderPanel }) {
  const [section, setSection] = React.useState("xiangqi");
  const [compact, setCompact] = React.useState(() => window.matchMedia("(max-width: 700px)").matches);
  const id = React.useId();
  const buttons = React.useRef([]);
  React.useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  function navigate(event, index) {
    let next;
    if (event.key === (compact ? "ArrowRight" : "ArrowDown")) next = (index + 1) % SECTIONS.length;
    if (event.key === (compact ? "ArrowLeft" : "ArrowUp")) next = (index + SECTIONS.length - 1) % SECTIONS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = SECTIONS.length - 1;
    if (next == null) return;
    event.preventDefault();
    setSection(SECTIONS[next].key);
    buttons.current[next]?.focus();
  }
  return <div className="admin-system-settings">
    <aside className="admin-system-sidebar" aria-label="系统设置导航">
      <div className="admin-system-nav-title"><strong>系统设置</strong><span>服务器与 AI 服务</span></div>
      <div className="admin-system-tabs" role="tablist" aria-label="系统设置分类" aria-orientation={compact ? "horizontal" : "vertical"}>
      {SECTIONS.map((item, index) => <button type="button" key={item.key} role="tab"
        ref={(node) => { buttons.current[index] = node; }} id={`${id}-${item.key}`}
        aria-selected={section === item.key} aria-controls={`${id}-panel`}
        tabIndex={section === item.key ? 0 : -1} onKeyDown={(event) => navigate(event, index)}
        onClick={() => setSection(item.key)}><svg viewBox="0 0 24 24" aria-hidden="true">{item.icon}</svg><span>{item.label}</span></button>)}
      </div>
    </aside>
    <div className="admin-system-content" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${section}`}>
      {renderPanel(section)}
    </div>
  </div>;
}
