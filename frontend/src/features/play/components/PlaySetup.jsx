import React from "react";
import { SIDES, LEVELS } from "../model";
import EngineReadiness from "../../../shared/ui/EngineReadiness";

// 对弈前的先后手、难度和引擎设置；状态由 Play 持有。
export default function PlaySetup({
  engineInfo, humanSide, onHumanSideChange, level, onLevelChange, localReady,
  localRuntime, localChecking, onOpenSettings, onStart, thinking, startError,
}) {
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
        <EngineReadiness localReady={localReady} localRuntime={localRuntime} localChecking={localChecking}
          cloudState={!engineInfo ? "checking" : engineInfo.available ? "ready" : engineInfo.engine === "builtin" ? "builtin" : "error"}
          cloudLabel={engineInfo?.label} onOpenSettings={onOpenSettings} />
        <button className="btn-start" onClick={() => onStart(humanSide, level)} disabled={thinking}>
          {thinking ? "正在开局…" : "开始对弈"}
        </button>
        {startError && <div className="result bad" role="alert">{startError}</div>}
      </div>
  );
}
