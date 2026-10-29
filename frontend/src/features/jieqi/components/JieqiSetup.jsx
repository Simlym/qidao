import React from "react";
import { LEVELS } from "../model";

// 揭棋两种对局模式共用的设置面板。
export default function JieqiSetup({
  gameMode, onGameModeChange, humanSide, onHumanSideChange, level,
  onLevelChange, runtimeKind, onOpenSettings, error, onStart, thinking,
}) {
  return (
      <div className="panel play-setup">
        <h2>揭棋对弈</h2>
        <p className="muted">
          {gameMode === "free"
            ? "双方面对面走棋；暗子首次移动时，可从本方剩余暗子池自由指定身份。"
            : "与揭棋引擎对弈；暗子首次移动时随机翻开真实棋子。"}
        </p>
        <div className="play-setup-row">
          <span className="play-setup-label">模式</span>
          <div className="seg">
            {[["human-ai", "人机对战"], ["free", "自由翻子"]].map(([key, label]) => (
              <button key={key} className={"seg-btn" + (gameMode === key ? " active" : "")} onClick={() => onGameModeChange(key)}>{label}</button>
            ))}
          </div>
        </div>
        {gameMode === "human-ai" && <>
          <div className="play-setup-row">
            <span className="play-setup-label">先后手</span>
            <div className="seg">
              {[["w", "执红先手"], ["b", "执黑后手"]].map(([key, label]) => (
                <button key={key} className={"seg-btn" + (humanSide === key ? " active" : "")} onClick={() => onHumanSideChange(key)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="play-setup-row">
            <span className="play-setup-label">难度</span>
            <div className="seg">
              {LEVELS.map((item) => (
                <button key={item.key} className={"seg-btn" + (level === item.key ? " active" : "")} onClick={() => onLevelChange(item.key)}>{item.label}</button>
              ))}
            </div>
          </div>
          <div className="engine-setup-summary">
            <div>
              <strong>当前引擎</strong>
              <span>
                {runtimeKind === "native"
                  ? "PC 原生揭棋引擎 · 已就绪"
                  : runtimeKind === "wasm"
                  ? "揭棋 WASM 引擎 · 已就绪"
                  : runtimeKind === "remote"
                  ? "云端揭棋引擎"
                  : "正在检测可用引擎…"}
              </span>
            </div>
            {onOpenSettings && (
              <button className="btn-newgame" onClick={onOpenSettings}>引擎设置</button>
            )}
          </div>
        </>}
        {gameMode === "free" && <>
          <div className="play-setup-row">
            <span className="play-setup-label">分析</span>
            <div className="seg">
              {LEVELS.map((item) => (
                <button key={item.key} className={"seg-btn" + (level === item.key ? " active" : "")} onClick={() => onLevelChange(item.key)}>{item.label}</button>
              ))}
            </div>
          </div>
          <div className="engine-setup-summary">
            <div>
              <strong>局面分析</strong>
              <span>
                {runtimeKind === "native"
                  ? "PC 原生揭棋引擎 · 自动分析与走子提示"
                  : runtimeKind === "wasm"
                  ? "揭棋 WASM 引擎 · 自动分析与走子提示"
                  : runtimeKind === "remote"
                  ? "云端揭棋引擎 · 自动分析与走子提示"
                  : "正在检测可用引擎…"}
              </span>
            </div>
            {onOpenSettings && <button className="btn-newgame" onClick={onOpenSettings}>引擎设置</button>}
          </div>
        </>}
        {error && <div className="import-error">{error}</div>}
        <button className="btn-start" onClick={onStart} disabled={thinking}>
          {thinking ? "引擎启动中…" : gameMode === "free" ? "开始自由翻子" : "开始揭棋"}
        </button>
      </div>
  );
}
