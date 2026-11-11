import React from "react";
import { SIDES, LEVELS } from "../model";
import EngineSetupGuide from "../../../shared/ui/EngineSetupGuide";
import { hasLocalEngineConfiguration } from "../../../domain/xiangqi/engine/localEngineConfiguration";

// 对弈前的先后手、难度和引擎设置；状态由 Play 持有。
export default function PlaySetup({
  engineInfo, humanSide, onHumanSideChange, level, onLevelChange, localReady,
  localRuntime, onOpenSettings, onStart, thinking, startError,
}) {
  const recommendLocal = Boolean(onOpenSettings) && !localReady && !hasLocalEngineConfiguration();
  return (
      <div className="panel play-setup">
        <h2>人机对弈</h2>
        <p className="muted">选择先后手和难度，和引擎下一盘完整对局。</p>
        <div className="play-setup-row">
          <span className="play-setup-label">先后手</span>
          <div className="seg">
            {SIDES.map((s) => (
              <button
                key={s.key}
                className={"seg-btn" + (humanSide === s.key ? " active" : "")}
                onClick={() => onHumanSideChange(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="play-setup-row">
          <span className="play-setup-label">对手难度</span>
          <div className="seg">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                className={"seg-btn" + (level === l.key ? " active" : "")}
                onClick={() => onLevelChange(l.key)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div className="engine-setup-summary">
          <div>
            <strong>本局运行方式</strong>
            <span>
              {localReady
                ? "本机运行 · 引擎已就绪"
                : engineInfo ? "云端运行 · 需要联网" : "正在检测可用引擎…"}
            </span>
            {localReady
              ? <span>使用这台设备计算走法，无需占用云端计算资源。</span>
              : engineInfo && <span>计算由服务器完成，繁忙时可能需要等待。</span>}
            {(localReady || engineInfo) && <details className="play-setup-engine-details">
              <summary>引擎详情</summary>
              <span>{localReady
                ? localRuntime === "native" ? "本机原生象棋引擎" : "浏览器本机象棋引擎"
                : engineInfo.label}</span>
            </details>}
          </div>
          {onOpenSettings && !recommendLocal && (
            <button className="btn-newgame" onClick={onOpenSettings}>引擎设置</button>
          )}
        </div>
        <EngineSetupGuide localReady={localReady} onOpenSettings={onOpenSettings} />
        <button className={recommendLocal ? "btn-newgame play-setup-cloud-start" : "btn-start"} onClick={() => onStart(humanSide, level)} disabled={thinking}>
          {thinking ? "正在开局…" : !localReady && engineInfo ? "暂用云端，开始对弈" : "开始对弈"}
        </button>
        {startError && <div className="result bad" role="alert">{startError}</div>}
      </div>
  );
}
