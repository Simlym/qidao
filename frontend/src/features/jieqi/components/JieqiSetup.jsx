import React from "react";
import { LEVELS } from "../model";
import EngineReadiness from "../../../shared/ui/EngineReadiness";
import { useCloudEngineStatus } from "../../../shared/hooks/useCloudEngineStatus";

// 揭棋两种对局模式共用的设置面板。
export default function JieqiSetup({
  gameMode, onGameModeChange, humanSide, onHumanSideChange, level,
  onLevelChange, runtimeKind, onOpenSettings, error, onStart, thinking,
}) {
  const cloud = useCloudEngineStatus("jieqi");
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
        </>}
        <EngineReadiness variant="jieqi" localReady={runtimeKind === "native" || runtimeKind === "wasm"}
          localChecking={!runtimeKind} localRuntime={runtimeKind} cloudState={cloud.status} cloudLabel={cloud.label} onOpenSettings={onOpenSettings} />
        {error && <div className="import-error">{error}</div>}
        <button className={gameMode === "human-ai" && runtimeKind === "remote" ? "btn-newgame play-setup-cloud-start" : "btn-start"} onClick={onStart} disabled={thinking}>
          {thinking ? "引擎启动中…" : gameMode === "free" ? "开始自由翻子" : runtimeKind === "remote" ? "暂用云端，开始揭棋" : "开始揭棋"}
        </button>
      </div>
  );
}
