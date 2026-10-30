import React from "react";
import { applyMove, INITIAL_FEN } from "../../../domain/xiangqi/xiangqi.js";
import {
  newPlayGame, playMove, getPositionState, importGame, analyzeGame, getPlayEngine,
} from "../../../shared/api";
import { playSound } from "../../../shared/sounds";
import { LEVELS, isCapture } from "../model.js";
import { createPlayRound, resolvePlayTurn } from "../gameEngine.js";
import { createGameEpoch } from "../gameEpoch.js";

const api = { newPlayGame, playMove, getPositionState };

// 管理棋局及异步回合；页面只负责编排与展示。
export function usePlayGame({ engine, onCreditsChanged }) {
  const [fen, setFen] = React.useState(null);
  const [legalMoves, setLegalMoves] = React.useState([]);
  const [lastMove, setLastMove] = React.useState(null);
  const [yourTurn, setYourTurn] = React.useState(true);
  const [thinking, setThinking] = React.useState(false);
  const [over, setOver] = React.useState(null);
  const [level, setLevel] = React.useState("medium");
  const [humanSide, setHumanSide] = React.useState("w");
  const [status, setStatus] = React.useState("ongoing");
  const [saved, setSaved] = React.useState(false);
  const [savedGameId, setSavedGameId] = React.useState(null);
  const [canUndo, setCanUndo] = React.useState(false);
  const [engineInfo, setEngineInfo] = React.useState(null);
  const [startError, setStartError] = React.useState("");
  const [moveError, setMoveError] = React.useState("");
  const [localReady, setLocalReady] = React.useState(false);
  const [localRuntime, setLocalRuntime] = React.useState(null);
  const [moveLog, setMoveLog] = React.useState([]);
  const [timesLog, setTimesLog] = React.useState([]);
  const [overDismissed, setOverDismissed] = React.useState(false);

  const moves = React.useRef([]);
  const moveTimes = React.useRef([]);
  const turnStart = React.useRef(0);
  const history = React.useRef([]);
  const epoch = React.useRef(null);
  if (!epoch.current) epoch.current = createGameEpoch();

  React.useEffect(() => {
    let active = true;
    getPlayEngine().then((info) => { if (active) setEngineInfo(info); }).catch(() => {});
    engine.availableKinds()
      .then((kinds) => {
        if (!active) return;
        const kind = kinds.includes("native") ? "native" : kinds.includes("wasm") ? "wasm" : null;
        setLocalRuntime(kind);
        setLocalReady(Boolean(kind));
      })
      .catch(() => {});
    return () => { active = false; epoch.current.dispose(); };
  }, [engine]);

  function restart() {
    if (!over && moves.current.length > 0 &&
      !window.confirm("对局尚未结束，确定放弃本局重新开始吗？")) return;
    epoch.current.invalidate();
    setThinking(false);
    setMoveError("");
    setFen(null);
  }

  async function start(side, lvl) {
    const ticket = epoch.current.begin();
    setThinking(true);
    setStartError("");
    setMoveError("");
    setOver(null);
    setOverDismissed(false);
    setLastMove(null);
    setSaved(false);
    setSavedGameId(null);
    setCanUndo(false);
    moves.current = [];
    moveTimes.current = [];
    history.current = [];
    const t0 = Date.now();
    try {
      const d = await createPlayRound({ side, level: lvl, localRuntime, engine, api });
      if (!epoch.current.isCurrent(ticket)) return;
      setFen(d.fen);
      setLegalMoves(d.legal_moves || []);
      setLastMove(d.engine_move || null);
      if (d.engine_move) {
        moves.current.push(d.engine_move);
        moveTimes.current.push(Date.now() - t0);
        playSound("move");
      }
      setMoveLog([...moves.current]);
      setTimesLog([...moveTimes.current]);
      setStatus(d.status);
      setYourTurn(true);
      turnStart.current = Date.now();
    } catch (error) {
      if (!epoch.current.isCurrent(ticket)) return;
      setFen(null);
      setStartError(`无法开始对弈：${error?.message || "请检查后端服务后重试"}`);
    } finally {
      if (epoch.current.isCurrent(ticket)) setThinking(false);
    }
  }

  // 自动存棋谱与后台分析；存盘完成时若已经重开则不污染新对局。
  async function recordGame(winner, ticket) {
    if (!epoch.current.isCurrent(ticket) || saved || moves.current.length === 0) return;
    const result = winner === "draw" ? "和棋"
      : (winner === "human") === (humanSide === "w") ? "红胜" : "黑胜";
    const me = humanSide === "w" ? "red_player" : "black_player";
    const foe = humanSide === "w" ? "black_player" : "red_player";
    const lvlLabel = LEVELS.find((item) => item.key === level)?.label || level;
    try {
      const res = await importGame({
        moves: moves.current.join(" "), result, source: "人机对弈",
        [me]: "我", [foe]: `引擎·${lvlLabel}`,
        played_on: new Date().toISOString().slice(0, 10),
      });
      if (!epoch.current.isCurrent(ticket)) return;
      setSaved(true);
      setSavedGameId(res.id);
      onCreditsChanged?.();
      analyzeGame(res.id).catch(() => {});
    } catch {
      // 存盘失败不影响对局。
    }
  }

  async function onMove(move) {
    if (!yourTurn || thinking || over) return;
    const ticket = epoch.current.begin();
    setMoveError("");
    const humanMs = Date.now() - turnStart.current;
    const snap = { fen, legalMoves, lastMove, status, movesLen: moves.current.length };
    history.current.push(snap);
    setYourTurn(false);
    setThinking(true);
    const afterHumanFen = applyMove(fen, move);
    setFen(afterHumanFen);
    setLastMove(move);
    setLegalMoves([]);
    playSound(isCapture(fen, move) ? "capture" : "move");
    try {
      const t0 = Date.now();
      const d = await resolvePlayTurn({
        fen, move, level, localRuntime, engine, api,
        onLocalFailure: () => {
          if (epoch.current.isCurrent(ticket)) {
            setLocalReady(false);
            setLocalRuntime(null);
          }
        },
      });
      if (!epoch.current.isCurrent(ticket)) return;
      moves.current.push(move);
      moveTimes.current.push(humanMs);
      if (d.engine_move) {
        moves.current.push(d.engine_move);
        moveTimes.current.push(Date.now() - t0);
        playSound(isCapture(afterHumanFen, d.engine_move) ? "capture" : "move");
      }
      setMoveLog([...moves.current]);
      setTimesLog([...moveTimes.current]);
      setFen(d.fen);
      setLastMove(d.engine_move || move);
      setStatus(d.status);
      if (d.game_over) {
        setOver({ winner: d.winner, status: d.status });
        setOverDismissed(false);
        setLegalMoves([]);
        const verdict = d.winner === "human" ? "win" : d.winner === "draw" ? "draw" : "lose";
        setTimeout(() => { if (epoch.current.isCurrent(ticket)) playSound(verdict); }, 300);
        void recordGame(d.winner, ticket);
      } else {
        if (d.status === "check") setTimeout(() => {
          if (epoch.current.isCurrent(ticket)) playSound("check");
        }, 250);
        setLegalMoves(d.legal_moves || []);
        setYourTurn(true);
        turnStart.current = Date.now();
      }
      setCanUndo(true);
    } catch (error) {
      if (!epoch.current.isCurrent(ticket)) return;
      setMoveError(`走棋失败：${error?.message || "请检查网络后重试"}`);
      history.current.pop();
      setFen(snap.fen);
      setLegalMoves(snap.legalMoves);
      setLastMove(snap.lastMove);
      setStatus(snap.status);
      setYourTurn(true);
    } finally {
      if (epoch.current.isCurrent(ticket)) setThinking(false);
    }
  }

  function undo() {
    if (thinking || history.current.length === 0) return;
    const snap = history.current.pop();
    // 旧的 AI 详解、局面评分等会随 fen 变化被重新查询。
    epoch.current.invalidate();
    moves.current = moves.current.slice(0, snap.movesLen);
    moveTimes.current = moveTimes.current.slice(0, snap.movesLen);
    setMoveLog([...moves.current]);
    setTimesLog([...moveTimes.current]);
    setFen(snap.fen);
    setLegalMoves(snap.legalMoves);
    setLastMove(snap.lastMove);
    setStatus(snap.status);
    setOver(null);
    setSaved(false);
    setYourTurn(true);
    setCanUndo(history.current.length > 0);
    turnStart.current = Date.now();
  }

  return {
    fen, legalMoves, lastMove, yourTurn, thinking, over,
    level, setLevel, humanSide, setHumanSide, status, saved, savedGameId, canUndo,
    engineInfo, startError, moveError, localReady, localRuntime,
    moveLog, timesLog, overDismissed, setOverDismissed,
    start, restart, onMove, undo,
  };
}
