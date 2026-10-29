import React from "react";
import { SIDES, LEVELS } from "../model";

// 对弈前的先后手、难度和引擎设置；状态由 Play 持有。
export default function PlaySetup({
  engineInfo, humanSide, onHumanSideChange, level, onLevelChange, localReady,
  localRuntime, onOpenSettings, onStart, thinking, startError,
}) {
  return (
      <div className="panel play-setup">
        <h2>人机对弈</h2>
        <p className="muted">
          和引擎下一盘完整对局。
          {engineInfo && (
            <>
              当前引擎：
              <strong>{engineInfo.label}</strong>
            </>
          )}
        </p>
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
          <span className="play-setup-label">难度</span>
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
            <strong>当前引擎</strong>
            <span>
              {localReady
                ? localRuntime === "native" ? "PC 原生 UCI 引擎 · 已就绪" : "本地 WASM UCI 引擎 · 已就绪"
                : engineInfo?.label || "正在检测可用引擎…"}
            </span>
          </div>
          {onOpenSettings && (
            <button className="btn-newgame" onClick={onOpenSettings}>引擎设置</button>
          )}
        </div>
        <button className="btn-start" onClick={() => onStart(humanSide, level)} disabled={thinking}>
          {thinking ? "正在开局…" : "开始对弈"}
        </button>
        {startError && <div className="result bad" role="alert">{startError}</div>}
      </div>
  );
}
