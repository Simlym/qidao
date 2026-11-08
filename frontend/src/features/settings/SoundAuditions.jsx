import React from "react";

const audioFiles = import.meta.glob("../../shared/audio/auditions/**/*.wav", {
  eager: true, query: "?url", import: "default",
});
const PACKS = [
  {
    key: "xqwlight", name: "象棋巫师轻量版", source: "https://github.com/xqbase/xqwlight/tree/master/JavaScript/sounds",
    sounds: [["move", "走子"], ["capture", "吃子"], ["check", "将军"], ["win", "胜利"], ["loss", "失败"], ["draw", "和棋"],
      ["move2", "走子·另一版"], ["capture2", "吃子·另一版"], ["check2", "将军·另一版"], ["newgame", "开局"], ["click", "选子"], ["illegal", "非法着法"]],
  },
  {
    key: "gmchess", name: "GMChess", source: "https://github.com/lerosua/gmchess/tree/master/data/sound",
    sounds: [["move", "走子"], ["eat", "吃子"], ["check", "将军"], ["win", "胜利"], ["loss", "失败"], ["choose", "选子"]],
  },
  {
    key: "stevenbaby", name: "StevenBaby 象棋", source: "https://github.com/StevenBaby/chess/tree/dev/src/audios",
    sounds: [["move", "走子"], ["capture", "吃子"], ["check", "将军"], ["invalid", "非法着法"], ["newgame", "开局"]],
  },
];

// 试听与使用分开操作，只有主动选择套装才保存对局音色。
export default function SoundAuditions({ theme, onUseTheme }) {
  const audioRef = React.useRef(null);
  const requestId = React.useRef(0);
  const [selected, setSelected] = React.useState(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const audio = audioRef.current;
    return () => { requestId.current++; audio?.pause(); };
  }, []);

  function preview(pack, name, label) {
    const audio = audioRef.current;
    const ticket = ++requestId.current;
    setError("");
    setSelected({ key: `${pack.key}/${name}`, label: `${pack.name} · ${label}` });
    audio.pause();
    audio.src = audioFiles[`../../shared/audio/auditions/${pack.key}/${name}.wav`];
    audio.play().catch(() => {
      // 快速切换会中断上一段播放，不将旧请求的中断显示成新音效错误。
      if (ticket === requestId.current) setError("暂时无法播放，请点击下方播放器重试。");
    });
  }

  return <section className="settings-auditions" aria-labelledby="sound-auditions-title">
    <h3 id="sound-auditions-title">象棋音效对比试听</h3>
    <p className="muted">点击音效按钮试听，喜欢后选择「使用这套」即可用于对弈和自由分析。每次只播放一段。</p>
    <div className="settings-audition-packs">
      {PACKS.map((pack) => <div key={pack.key} className="settings-audition-pack">
        <div className="settings-audition-heading"><h4>{pack.name}</h4><a href={pack.source} target="_blank" rel="noopener noreferrer">查看来源 ↗</a></div>
        <div className="settings-audition-buttons">
          {pack.sounds.map(([name, label]) => <button key={name} className="settings-preview-button"
            aria-label={`试听${pack.name}的${label}`} aria-pressed={selected?.key === `${pack.key}/${name}`}
            onClick={() => preview(pack, name, label)}>{label}</button>)}
        </div>
        <div className="settings-audition-use">
          <button className="settings-preview-button" disabled={theme === pack.key}
            aria-label={theme === pack.key ? `正在使用${pack.name}` : `使用${pack.name}音效主题`}
            onClick={() => { requestId.current++; audioRef.current?.pause(); onUseTheme(pack.key); }}>
            {theme === pack.key ? "正在使用" : "使用这套"}
          </button>
          {pack.key === "gmchess" && <small>和棋提示沿用象棋巫师</small>}
          {pack.key === "stevenbaby" && <small>胜利、失败、和棋提示沿用象棋巫师</small>}
        </div>
      </div>)}
    </div>
    <div className="settings-audition-player">
      <p role="status">{selected ? `已选：${selected.label}` : "选择上方任一音效开始试听"}</p>
      <audio ref={audioRef} controls preload="none" aria-label="候选象棋音效试听播放器" />
      {error && <p role="alert">{error}</p>}
    </div>
  </section>;
}
