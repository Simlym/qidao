import React from "react";
import Board from "../../shared/ui/Board";
import { useWideWebLayout } from "../../shared/hooks/useWideWebLayout";
import { useMobilePlayLayout } from "../../shared/hooks/useMobilePlayLayout";
import MobileGameLayout from "../play/components/MobileGameLayout";
import ResignButton from "../play/components/ResignButton";
import ResultOverlay from "../play/components/ResultOverlay";
import { useGameExit } from "../play/hooks/useGameExit";
import { useBackAction } from "../../shared/hooks/useBackAction";
import { createReplyPacer } from "../play/replyPacer";
import { playSound, prepareSounds } from "../../shared/sounds";
import { jieqiMoveSound } from "./gameSounds.js";
import JieqiSetup from "./components/JieqiSetup";
import { createEngineManager } from "../../domain/xiangqi/engine/createEngineManager";
import {
  JIEQI_INITIAL_FEN,
  applyJieqiMove,
  availableJieqiReveals,
  completeJieqiMove,
  generateLimitedKnowledgeFen,
  jieqiMoveToChinese,
  jieqiStatus,
  legalJieqiMoves,
  parseJieqiBoard,
  parseJieqiFen,
} from "../../domain/xiangqi/jieqi/rules";
import { evalJieqiPosition, importGame, streamJieqiPosition } from "../../shared/api";
import { runtime, usesDesktopLayout } from "../../platform/runtime";
import { jieqiPieceImage } from "../../domain/xiangqi/jieqi/pieceImages";
import EngineAnalysisView from "../analysis/EngineAnalysisView";
import { useJieqiAnalysis } from "./hooks/useJieqiAnalysis";
import { ChineseMoveList, HiddenPool, JieqiWinChances } from "./JieqiPanels";
import { LEVELS, describeJieqiEval, winnerFor } from "./model";
const jieqiEngine = createEngineManager({ variant: "jieqi", remoteEvaluate: evalJieqiPosition, remoteStream: streamJieqiPosition });

export default function JieqiPlay({ onOpenSettings }) {
  const isDesktop = usesDesktopLayout(runtime);
  const wideWeb = useWideWebLayout(runtime);
  const mobile = useMobilePlayLayout();
  const [mobilePanel, setMobilePanel] = React.useState(null);
  const [resignedSide, setResignedSide] = React.useState(null);
  const [resultDismissed, setResultDismissed] = React.useState(false);
  const [fen, setFen] = React.useState(null);
  const [gameMode, setGameMode] = React.useState("human-ai");
  const [humanSide, setHumanSide] = React.useState("w");
  const [level, setLevel] = React.useState("medium");
  const [legalMoves, setLegalMoves] = React.useState([]);
  const [lastMove, setLastMove] = React.useState(null);
  const [thinking, setThinking] = React.useState(false);
  const [winner, setWinner] = React.useState(null);
  const [runtimeKind, setRuntimeKind] = React.useState(null);
  const [error, setError] = React.useState("");
  const [moves, setMoves] = React.useState([]);
  const [saved, setSaved] = React.useState(false);
  const [inspectorTab, setInspectorTab] = React.useState("moves");
  const [pendingFlip, setPendingFlip] = React.useState(null);
  const {
    analysisEnabled, analysisData, setAnalysisData, analysisPosition, setAnalysisPosition,
    analysisLoading, analysisError, setAnalysisError,
    analysisMode, setAnalysisMode, analysisTime, setAnalysisTime,
    analysisDepth, setAnalysisDepth, analysisMultiPv, setAnalysisMultiPv,
    analysisSearchMoves, setAnalysisSearchMoves,
    analyzeFreePosition, invalidateAnalysis, resetAnalysis, toggleAnalysis,
  } = useJieqiAnalysis({ engine: jieqiEngine, fen, gameMode, pendingFlip, winner, runtimeKind });
  const [showHint, setShowHint] = React.useState(true);
  const [boardFlipped, setBoardFlipped] = React.useState(false);
  const [boardScale, setBoardScale] = React.useState(1);
  const positionsRef = React.useRef([]);
  const movesRef = React.useRef([]);
  const initialPlyRef = React.useRef(0);
  const turnReqId = React.useRef(0);
  const desktopMoveLogRef = React.useRef(null);
  const turnSearch = React.useRef(null);
  const replyPacer = React.useRef(null);
  if (!replyPacer.current) replyPacer.current = createReplyPacer();
  function stopTurn() { turnSearch.current?.stop(); turnSearch.current = null; replyPacer.current.cancel(); }

  React.useEffect(() => {
    let active = true;
    jieqiEngine.availableKinds()
      .then((kinds) => {
        if (active) setRuntimeKind(kinds.includes("native") ? "native" : kinds.includes("wasm") ? "wasm" : "remote");
      })
      .catch(() => { if (active) setRuntimeKind("remote"); });
    return () => { active = false; };
  }, []);

  // 离开揭棋页面后不允许已在运行的引擎请求继续更新旧组件。
  React.useEffect(() => () => { turnReqId.current++; stopTurn(); }, []);
  React.useEffect(() => { if (!fen) setMobilePanel(null); }, [fen]);

  const depth = LEVELS.find((item) => item.key === level)?.depth || 10;

  React.useEffect(() => {
    const log = desktopMoveLogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [moves.length]);

  async function engineTurn(position, side) {
    const engineSide = parseJieqiFen(position).side;
    const enginePosition = generateLimitedKnowledgeFen(position, engineSide);
    stopTurn();
    const session = jieqiEngine.startAnalysis(enginePosition, { depth });
    turnSearch.current = session;
    const result = await session.result;
    const legal = legalJieqiMoves(position);
    const baseMove = result.bestMove?.slice(0, 4);
    if (!baseMove || !legal.includes(baseMove)) throw new Error("揭棋引擎返回了不合法着法");
    const next = applyJieqiMove(position, result.bestMove, { perspective: engineSide });
    const status = jieqiStatus(next);
    return {
      fen: next,
      // 搜索 FEN 中的扩展身份只是有限知识样本；棋谱必须从真实前后局面补全。
      move: completeJieqiMove(position, baseMove, next),
      status,
      winner: winnerFor(status, side),
    };
  }

  async function start() {
    prepareSounds();
    stopTurn();
    const requestId = ++turnReqId.current;
    setThinking(gameMode === "human-ai");
    setError("");
    setWinner(null);
    setResignedSide(null);
    setResultDismissed(false);
    setMoves([]);
    setSaved(false);
    setPendingFlip(null);
    resetAnalysis();
    setShowHint(true);
    setBoardFlipped(gameMode === "human-ai" && humanSide === "b");
    movesRef.current = [];
    positionsRef.current = [JIEQI_INITIAL_FEN];
    initialPlyRef.current = 0;
    try {
      let position = JIEQI_INITIAL_FEN;
      if (gameMode === "human-ai" && humanSide === "b") {
        const reply = await engineTurn(position, "engine");
        if (requestId !== turnReqId.current) return;
        playSound(jieqiMoveSound(position, reply.move, reply.status, reply.winner));
        position = reply.fen;
        setLastMove(reply.move);
        movesRef.current = [reply.move];
        positionsRef.current.push(position);
        initialPlyRef.current = 1;
        setMoves([...movesRef.current]);
      } else {
        setLastMove(null);
      }
      setFen(position);
      setLegalMoves(legalJieqiMoves(position));
    } catch (reason) {
      if (requestId !== turnReqId.current) return;
      setError(reason.message || "揭棋引擎不可用");
      setFen(null);
    } finally {
      if (requestId === turnReqId.current) setThinking(false);
    }
  }

  async function saveGame(finalWinner) {
    const requestId = turnReqId.current;
    if (!movesRef.current.length) return;
    const redWon = gameMode === "free"
      ? finalWinner === "w"
      : finalWinner === "human" ? humanSide === "w" : humanSide === "b";
    const result = finalWinner === "draw" ? "和棋" : redWon ? "红胜" : "黑胜";
    try {
      await importGame({
        variant: "jieqi",
        initial_fen: JIEQI_INITIAL_FEN,
        moves: movesRef.current.join(" "),
        positions: positionsRef.current,
        result,
        source: gameMode === "free" ? "揭棋自由翻子" : "揭棋人机对弈",
        red_player: gameMode === "free" ? "红方" : humanSide === "w" ? "我" : "揭棋引擎",
        black_player: gameMode === "free" ? "黑方" : humanSide === "b" ? "我" : "揭棋引擎",
        played_on: new Date().toISOString().slice(0, 10),
      });
      if (requestId === turnReqId.current) setSaved(true);
    } catch {
      if (requestId === turnReqId.current) setSaved(false);
    }
  }

  function commitFreeMove(move, reveal = "") {
    const previous = fen;
    const mover = parseJieqiFen(previous).side;
    const recordedMove = `${move}${reveal}`;
    try {
      setAnalysisError("");
      const next = applyJieqiMove(previous, recordedMove, { identifyCapturedHidden: false });
      const status = jieqiStatus(next);
      const finalWinner = winnerFor(status, mover);
      movesRef.current.push(recordedMove);
      positionsRef.current.push(next);
      setFen(next);
      setLastMove(recordedMove);
      setMoves([...movesRef.current]);
      setLegalMoves(finalWinner ? [] : legalJieqiMoves(next));
      setWinner(finalWinner);
      setPendingFlip(null);
      playSound(jieqiMoveSound(previous, recordedMove, status, finalWinner));
      if (finalWinner) saveGame(finalWinner);
    } catch (reason) {
      setPendingFlip(null);
      setError(reason.message || "自由翻子失败");
    }
  }

  function requestFreeMove(move) {
    const state = parseJieqiFen(fen);
    const fromCol = "abcdefghi".indexOf(move[0]);
    const fromRow = 9 - Number(move[1]);
    const moving = state.board[fromRow]?.[fromCol];
    if (!moving?.hidden) {
      commitFreeMove(move);
      return;
    }
    const choices = availableJieqiReveals(fen, state.side);
    if (choices.length === 1) {
      commitFreeMove(move, choices[0].piece);
      return;
    }
    setPendingFlip({ move, side: state.side, choices });
  }

  function randomPendingFlip() {
    if (!pendingFlip?.choices?.length) return;
    const pool = pendingFlip.choices.flatMap((item) => Array(item.count).fill(item.piece));
    commitFreeMove(pendingFlip.move, pool[Math.floor(Math.random() * pool.length)]);
  }

  async function onMove(move) {
    if (thinking || winner || !legalMoves.includes(move)) return;
    prepareSounds();
    setError("");
    if (gameMode === "free") {
      requestFreeMove(move);
      return;
    }
    const previous = fen;
    let afterHuman;
    let recordedHumanMove;
    let humanWinner;
    let humanStatus;
    try {
      afterHuman = applyJieqiMove(previous, move);
      recordedHumanMove = completeJieqiMove(previous, move, afterHuman);
      humanStatus = jieqiStatus(afterHuman);
      humanWinner = winnerFor(humanStatus, "human");
    } catch (reason) {
      setError(reason.message || "走子失败");
      return;
    }

    // 先提交用户着法，让棋盘和动画立即更新；引擎搜索只负责稍后追加应着。
    movesRef.current.push(recordedHumanMove);
    positionsRef.current.push(afterHuman);
    setFen(afterHuman);
    setLastMove(recordedHumanMove);
    setMoves([...movesRef.current]);
    setLegalMoves([]);

    playSound(jieqiMoveSound(previous, recordedHumanMove, humanStatus, humanWinner));

    if (humanWinner) {
      setWinner(humanWinner);
      saveGame(humanWinner);
      return;
    }

    const requestId = ++turnReqId.current;
    const movedAt = Date.now();
    setThinking(true);
    // 给 React 和浏览器一次绘制机会，避免本地引擎启动挤占落子这一帧。
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (requestId !== turnReqId.current) return;
    try {
      const reply = await engineTurn(afterHuman, "engine");
      if (requestId !== turnReqId.current) return;
      if (!await replyPacer.current.waitSince(movedAt)) return;
      if (requestId !== turnReqId.current) return;
      movesRef.current.push(reply.move);
      playSound(jieqiMoveSound(afterHuman, reply.move, reply.status, reply.winner));
      positionsRef.current.push(reply.fen);
      setFen(reply.fen);
      setLastMove(reply.move);
      setMoves([...movesRef.current]);
      setWinner(reply.winner);
      setLegalMoves(reply.winner ? [] : legalJieqiMoves(reply.fen));
      if (reply.winner) saveGame(reply.winner);
    } catch (reason) {
      if (requestId === turnReqId.current) {
        setError(`${reason.message || "引擎应着失败"}，你的走子已保留，可悔棋后重试`);
      }
    } finally {
      if (requestId === turnReqId.current) setThinking(false);
    }
  }

  function leaveGame() {
    turnReqId.current++;
    stopTurn();
    invalidateAnalysis();
    setThinking(false);
    setPendingFlip(null);
    setFen(null);
  }
  const { requestExit: restart, exitDialog } = useGameExit({ active: Boolean(fen), finished: Boolean(winner), onExit: leaveGame });
  useBackAction(() => { setPendingFlip(null); return true; }, { enabled: Boolean(pendingFlip), priority: 200 });

  // 面板切换和分析流更新不改变局面，避免重复生成整盘合法着法与棋谱。
  const currentStatus = React.useMemo(() => fen ? jieqiStatus(fen) : null, [fen]);
  const notationPairs = React.useMemo(() => {
    const texts = moves.map((move, index) =>
      jieqiMoveToChinese(positionsRef.current[index] || JIEQI_INITIAL_FEN, move)
    );
    const pairs = [];
    for (let index = 0; index < texts.length; index += 2) {
      pairs.push([texts[index], texts[index + 1] || ""]);
    }
    return pairs;
  }, [moves]);

  if (!fen) {
    return (
      <JieqiSetup
        gameMode={gameMode} onGameModeChange={setGameMode} humanSide={humanSide}
        onHumanSideChange={setHumanSide} level={level} onLevelChange={setLevel}
        runtimeKind={runtimeKind} onOpenSettings={onOpenSettings} error={error}
        onStart={start} thinking={thinking}
      />
    );
  }

  function undo() {
    if (thinking || resignedSide) return;
    if (pendingFlip) {
      setPendingFlip(null);
      return;
    }
    const minimum = initialPlyRef.current;
    if (movesRef.current.length <= minimum) return;

    let targetPly = movesRef.current.length - 1;
    if (gameMode === "human-ai") {
      while (
        targetPly > minimum &&
        parseJieqiFen(positionsRef.current[targetPly]).side !== humanSide
      ) targetPly--;
    }

    invalidateAnalysis();
    stopTurn();
    turnReqId.current++;
    const restoredFen = positionsRef.current[targetPly];
    movesRef.current = movesRef.current.slice(0, targetPly);
    positionsRef.current = positionsRef.current.slice(0, targetPly + 1);
    setFen(restoredFen);
    setMoves([...movesRef.current]);
    setLastMove(movesRef.current.at(-1) || null);
    setLegalMoves(legalJieqiMoves(restoredFen));
    setWinner(null);
    setResultDismissed(false);
    setSaved(false);
    setError("");
    setAnalysisError("");
    setShowHint(true);
  }

  const currentSide = parseJieqiFen(fen).side;
  const inCheck = currentStatus === "check";
  const currentTurnText = resignedSide
    ? gameMode === "free" ? `${resignedSide === "w" ? "红方" : "黑方"}认输，${resignedSide === "w" ? "黑方" : "红方"}获胜` : "你已认输，本局结束"
    : gameMode === "free"
    ? winner
      ? winner === "draw" ? "和棋" : winner === "w" ? "红方获胜" : "黑方获胜"
      : pendingFlip
        ? `请选择${pendingFlip.side === "w" ? "红方" : "黑方"}翻出的棋子`
        : `轮到${currentSide === "w" ? "红方" : "黑方"}走`
    : winner
      ? winner === "human" ? "你赢了" : winner === "draw" ? "和棋" : "引擎获胜"
      : thinking ? "引擎思考中…" : "轮到你走";
  const engineDisplay = runtimeKind === "native"
    ? "揭棋引擎 · 本地"
    : runtimeKind === "wasm"
    ? "揭棋 WASM 引擎"
    : "揭棋云端引擎";
  const levelLabel = LEVELS.find((item) => item.key === level)?.label;
  const evalInfo = describeJieqiEval(analysisData);
  const canUndo = !resignedSide && (moves.length > initialPlyRef.current || Boolean(pendingFlip));
  const analysisIsCurrent = analysisPosition === fen;
  const bestMoveText = analysisData?.bestMove
    ? jieqiMoveToChinese(analysisPosition || fen, analysisData.bestMove)
    : "";
  const analysisRuntime = analysisData?.runtime === "native"
    ? "PC 原生揭棋引擎"
    : analysisData?.runtime === "wasm"
    ? "揭棋 WASM 引擎"
    : "云端揭棋引擎";
  const useSideLayout = isDesktop || wideWeb;

  function resign() {
    if (winner) return;
    turnReqId.current++;
    stopTurn();
    invalidateAnalysis();
    setThinking(false);
    setPendingFlip(null);
    setLegalMoves([]);
    setResignedSide(gameMode === "free" ? currentSide : humanSide);
    const finalWinner = gameMode === "free" ? currentSide === "w" ? "b" : "w" : "engine";
    setWinner(finalWinner);
    setError("");
    playSound(gameMode === "free" ? "win" : "lose");
    saveGame(finalWinner);
  }

  const resultOverlay = <ResultOverlay
    over={winner ? { winner, status: resignedSide ? "resigned" : currentStatus } : null}
    overDismissed={resultDismissed} winnerText={currentTurnText} moveLog={moves} totalMs={0}
    localNotice={saved ? "棋局已存入复盘。" : moves.length ? "棋局未同步时请保持网络连接。" : "本局未走子，不生成棋谱。"}
    saved={saved} onDismiss={() => setResultDismissed(true)} onExit={leaveGame} onRestart={start}
  />;

  const flipDialog = pendingFlip && <div className="jieqi-flip-overlay" role="dialog" aria-modal="true" aria-label="翻子提示">
    <div className="panel jieqi-flip-dialog"><strong>请选择要翻开的棋子</strong><p>{pendingFlip.side === "w" ? "红方" : "黑方"}暗子池</p>
      <div className="jieqi-flip-choices">{pendingFlip.choices.map((item) => <button key={item.piece} className={pendingFlip.side === "w" ? "red" : "black"} onClick={() => commitFreeMove(pendingFlip.move, item.piece)} aria-label={`${item.glyph}，剩余 ${item.count} 枚`}><span>{item.glyph}</span><small>×{item.count}</small></button>)}</div>
      <button className="btn-newgame" onClick={randomPendingFlip}>随机翻开</button>
    </div>
  </div>;

  if (mobile) return <MobileGameLayout
    variant="jieqi" title={gameMode === "free" ? "揭棋 · 自由翻子" : "揭棋对弈"} status={error || currentTurnText} moveCount={moves.length}
    opponent={{ mark: boardFlipped ? "红" : "黑", side: boardFlipped ? "red" : "black", name: gameMode === "free" ? boardFlipped ? "红方" : "黑方" : (boardFlipped ? "w" : "b") === humanSide ? "你" : "电脑", detail: gameMode === "free" ? "自由翻子" : levelLabel }}
    self={{ mark: boardFlipped ? "黑" : "红", side: boardFlipped ? "black" : "red", name: gameMode === "free" ? boardFlipped ? "黑方" : "红方" : (boardFlipped ? "b" : "w") === humanSide ? "你" : "电脑", detail: winner ? saved ? "棋局已存入复盘" : moves.length ? "本局已结束" : "未走子，不生成棋谱" : "轻点棋子走棋" }}
    panel={mobilePanel} onPanelChange={setMobilePanel} onUndo={undo} canUndo={canUndo && !thinking && !winner}
    onHint={() => { setMobilePanel("analysis"); setShowHint(true); if (!analysisData && !winner) analyzeFreePosition(fen); }} canHint={gameMode === "free" && !winner && !pendingFlip && !analysisLoading} hintLoading={analysisLoading}
    menu={<div className="mobile-menu-actions">
      <ResignButton label={gameMode === "free" ? `${currentSide === "w" ? "红方" : "黑方"}认输` : "认输"} disabled={Boolean(winner)} onResign={() => { setMobilePanel(null); resign(); }} />
      <button onClick={() => { setMobilePanel(null); restart(); }}>返回对弈准备</button>
      <button onClick={() => setBoardFlipped((value) => !value)}>翻转棋盘</button>
      {winner && <button onClick={() => { setMobilePanel(null); start(); }}>再来一盘</button>}
      {winner && <button onClick={() => { setMobilePanel(null); setResultDismissed(false); }}>查看结果</button>}
      {error && <p role="alert">{error}</p>}
    </div>}
    history={<>{moves.length ? <ChineseMoveList pairs={notationPairs} /> : <p className="muted">走子后将在这里记录棋谱。</p>}</>}
    analysis={gameMode === "free" ? <>
      <div className="mobile-analysis-actions"><button disabled={Boolean(winner)} onClick={toggleAnalysis}>{analysisEnabled ? "停止分析" : "开始分析"}</button><button disabled={Boolean(winner)} onClick={() => setShowHint((value) => !value)}>{showHint ? "隐藏走子提示" : "显示走子提示"}</button></div>
      <p>{analysisLoading ? "分析中…" : `${evalInfo.label} ${evalInfo.value}`}</p><JieqiWinChances wdl={analysisData?.wdl} />
      {bestMoveText && <p>推荐：{bestMoveText}</p>}
      <EngineAnalysisView fen={analysisPosition || fen} data={analysisData} loading={analysisLoading} variant="jieqi" log={jieqiEngine.getLog()} />
      {analysisError && <p role="alert">{analysisError}</p>}
    </> : <p className="muted">人机对弈中不展示暗子的真实身份；自由翻子模式可使用局面分析。</p>}
  >
    {exitDialog}
    {flipDialog}
    <HiddenPool fen={fen} side={boardFlipped ? "w" : "b"} label={boardFlipped ? "红方" : "黑方"} />
    <div className="mobile-jieqi-board-core play-board-area"><Board fen={fen} onMove={onMove} lastMove={lastMove} disabled={thinking || Boolean(winner) || Boolean(pendingFlip)} legalMoves={legalMoves} hintMove={gameMode === "free" && showHint && !pendingFlip && analysisIsCurrent && !winner ? analysisData?.bestMove : null} flipped={boardFlipped} checkedSide={inCheck ? currentSide : null} parsePosition={parseJieqiBoard} pieceImage={jieqiPieceImage} fitContainerHeight /></div>
    <HiddenPool fen={fen} side={boardFlipped ? "b" : "w"} label={boardFlipped ? "黑方" : "红方"} />
    {resultOverlay}
  </MobileGameLayout>;

  return (
    <div className="play jieqi-play">
      {exitDialog}
      {flipDialog}
      {!useSideLayout && <div className="panel play-status-bar">
        <div className="play-status-line">
          <span className="tag">揭棋</span>
          <span className="tag">{gameMode === "free" ? "自由翻子" : humanSide === "w" ? "你执红" : "你执黑"}</span>
          {gameMode === "human-ai" && <span className="tag">{runtimeKind === "native" ? "⚡ PC 原生引擎" : runtimeKind === "wasm" ? "⚡ WASM 引擎" : "☁ 云端引擎"}</span>}
          <span className="play-turn">{currentTurnText}</span>
          {winner && <span className="tag">{saved ? "已存入复盘" : "正在保存…"}</span>}
        </div>
        <div className="play-actions">
          <ResignButton label={gameMode === "free" ? `${currentSide === "w" ? "红方" : "黑方"}认输` : "认输"} disabled={Boolean(winner)} onResign={resign} />
          {gameMode === "free" && <>
            <button className="btn-newgame" onClick={toggleAnalysis}>{analysisEnabled ? "停止分析" : "开始分析"}</button>
            <button
              className="btn-newgame"
              onClick={() => analysisData ? setShowHint((value) => !value) : analyzeFreePosition(fen)}
              disabled={analysisLoading}
            >
              {analysisLoading ? "分析中…" : analysisData ? showHint ? "隐藏提示" : "走子提示" : "走子提示"}
            </button>
          </>}
          <button className="btn-newgame" onClick={undo} disabled={!canUndo || thinking}>悔棋</button>
          <button className="btn-newgame" onClick={() => setBoardFlipped((value) => !value)}>翻转棋盘</button>
          <button className="btn-newgame" onClick={restart}>新对局</button>
        </div>
      </div>}
      {!useSideLayout && error && <div className="panel import-error">{error}</div>}
      <div className="play-main">
        {wideWeb && (
          <aside className="panel web-play-rail jieqi-status-rail" aria-label="揭棋本局状态">
            <div className="web-play-rail-title">揭棋对弈</div>
            <div className="web-player-card opponent">
              <span className="web-player-avatar">黑</span>
              <div>
                <strong>{gameMode === "free" ? "黑方" : humanSide === "b" ? "你" : "电脑"}</strong>
                <small>{gameMode === "free" ? "手动走棋" : humanSide === "b" ? "你执黑" : engineDisplay}</small>
              </div>
            </div>
            <div className="web-turn-card">
              <small>{gameMode === "free" ? "自由翻子" : levelLabel}</small>
              <strong>{currentTurnText}</strong>
              <span>已走 {moves.length} 步</span>
            </div>
            <div className="web-player-card self">
              <span className="web-player-avatar">红</span>
              <div>
                <strong>{gameMode === "free" ? "红方" : humanSide === "w" ? "你" : "电脑"}</strong>
                <small>{gameMode === "free" ? "手动走棋" : humanSide === "w" ? "你执红" : engineDisplay}</small>
              </div>
            </div>
            <div className="web-play-rail-meta">
              <span>当前行棋</span>
              <strong className={currentSide === "w" ? "red" : "black"}>{currentSide === "w" ? "红方" : "黑方"}</strong>
            </div>
            {winner && <div className="jieqi-status-result">{saved ? "棋局已存入复盘" : "正在保存棋局…"}</div>}
          </aside>
        )}
        <div className="play-board-area">
          {inCheck && (
            <div className="jieqi-check-alert" role="status" aria-live="assertive">
              <strong>将军</strong>
              <span>{currentSide === "w" ? "红帅" : "黑将"}受到攻击</span>
            </div>
          )}
          {isDesktop && (
            <div className="desktop-board-playerbar">
              <span>{gameMode === "free" ? "自由翻子" : "电脑"}</span>
              <strong>{currentTurnText}</strong>
            </div>
          )}
          <HiddenPool
            fen={fen}
            side={boardFlipped ? "w" : "b"}
            label={boardFlipped ? "红方" : "黑方"}
          />
          <div className="jieqi-board-stage" style={{ "--jieqi-board-width": `${416 * boardScale}px` }}>
            {gameMode === "free" && (
              <div
                className={`jieqi-eval-rail${boardFlipped ? " flipped" : ""}`}
                style={{
                  height: `${462 * boardScale}px`,
                  marginTop: `${22 * boardScale}px`,
                  marginBottom: `${22 * boardScale}px`,
                  "--jieqi-eval-pct": `${evalInfo.redPct}%`,
                }}
                title={analysisLoading ? "局势评估中" : `${evalInfo.label} ${evalInfo.value}`}
                aria-label={`局势评估：${analysisLoading ? "分析中" : `${evalInfo.label} ${evalInfo.value}`}`}
              >
                <div className="jieqi-eval-rail-red" style={{ height: `${evalInfo.redPct}%` }} />
                <div className="jieqi-eval-rail-divider" aria-hidden="true" />
                <span>{analysisLoading && !analysisData ? "…" : evalInfo.value}</span>
              </div>
            )}
            <Board
              fen={fen}
              onMove={onMove}
              lastMove={lastMove}
              disabled={thinking || Boolean(winner) || Boolean(pendingFlip)}
              legalMoves={legalMoves}
              hintMove={gameMode === "free" && showHint && !pendingFlip && analysisIsCurrent ? analysisData?.bestMove || null : null}
              flipped={boardFlipped}
              checkedSide={inCheck ? currentSide : null}
              parsePosition={parseJieqiBoard}
              pieceImage={jieqiPieceImage}
              maxScale={1.75}
              onScaleChange={setBoardScale}
              fitContainerHeight={useSideLayout}
              reservedBottomHeight={46}
            />
          </div>
          <HiddenPool
            fen={fen}
            side={boardFlipped ? "b" : "w"}
            label={boardFlipped ? "黑方" : "红方"}
          />
          {resultOverlay}
        </div>
        {useSideLayout ? (
          <aside className="panel move-log desktop-play-inspector desktop-jieqi-inspector">
            <div className="desktop-game-summary">
              <strong>本局信息</strong>
              <span>{gameMode === "free" ? "双人手动走棋 · 自由指定翻子" : `${humanSide === "w" ? "你执红" : "你执黑"} · ${levelLabel}`}</span>
              <span>{gameMode === "free" ? `当前${currentSide === "w" ? "红方" : "黑方"}走` : engineDisplay}</span>
              {winner && <span>{saved ? "棋局已存入复盘" : "正在保存棋局…"}</span>}
            </div>

            {gameMode !== "free" && <div className="desktop-inspector-tabs" role="tablist" aria-label="揭棋对局信息">
              <button
                className={inspectorTab === "moves" ? "active" : ""}
                onClick={() => setInspectorTab("moves")}
                role="tab"
                aria-selected={inspectorTab === "moves"}
              >
                棋谱
              </button>
              <button
                className={inspectorTab === "info" ? "active" : ""}
                onClick={() => setInspectorTab("info")}
                role="tab"
                aria-selected={inspectorTab === "info"}
              >
                {gameMode === "free" ? "分析" : "信息"}
              </button>
            </div>}

            {gameMode === "free" ? (
              <div className="desktop-inspector-body desktop-jieqi-combined">
                <section className="desktop-jieqi-score-section">
                  <div className="desktop-jieqi-section-head">
                    <span><b aria-hidden="true">📜</b> 棋谱</span>
                    <small>{moves.length} 步</small>
                  </div>
                  <div className="desktop-jieqi-score-scroll" ref={desktopMoveLogRef}>
                    {moves.length > 0 ? (
                      <ChineseMoveList pairs={notationPairs} desktop />
                    ) : (
                      <div className="desktop-inspector-empty">走子后将在这里记录棋谱</div>
                    )}
                  </div>
                </section>

                <section className="desktop-jieqi-analysis-section">
                  <div className="desktop-jieqi-section-head">
                    <span><b aria-hidden="true">🔍</b> 局面分析</span>
                    <small>{analysisLoading ? "计算中…" : analysisRuntime}</small>
                  </div>
                  <div className="jieqi-eval-summary">
                    <div>
                      <span>局势评分</span>
                      <strong>{analysisLoading && !analysisData ? "…" : evalInfo.value}</strong>
                    </div>
                    <p>{evalInfo.label}</p>
                  </div>
                  <JieqiWinChances wdl={analysisData?.wdl} />
                  {(analysisLoading || analysisData) && (
                    <div className="jieqi-best-move">
                      <span>🎯 推荐着法</span>
                      <strong title={analysisData?.bestMove || ""}>{bestMoveText || "—"}</strong>
                    </div>
                  )}
                  <details className="jieqi-analysis-settings">
                    <summary>⚙ 分析设置</summary>
                    <div className="engine-analysis-controls">
                      <select value={analysisMode} onChange={(event) => setAnalysisMode(event.target.value)} aria-label="分析模式">
                        <option value="movetime">限时分析</option>
                        <option value="depth">深度分析</option>
                        {runtimeKind === "native" && <option value="infinite">无限分析</option>}
                      </select>
                      {analysisMode === "movetime" && <select value={analysisTime} onChange={(event) => setAnalysisTime(Number(event.target.value))} aria-label="分析时间">
                        <option value={500}>0.5 秒</option><option value={1000}>1 秒</option><option value={3000}>3 秒</option><option value={5000}>5 秒</option>
                      </select>}
                      {analysisMode === "depth" && <input type="number" min="1" max="30" value={analysisDepth} onChange={(event) => setAnalysisDepth(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} aria-label="分析深度" />}
                      <select value={analysisMultiPv} onChange={(event) => setAnalysisMultiPv(Number(event.target.value))} aria-label="候选线路数">
                        <option value={1}>最佳 1 线</option><option value={3}>候选 3 线</option><option value={5}>候选 5 线</option>
                      </select>
                    </div>
                  </details>
                  {analysisSearchMoves.length > 0 && <button className="engine-searchmove-clear" onClick={() => setAnalysisSearchMoves([])}>正在限定 {analysisSearchMoves[0]} · 取消限定</button>}
                  {(analysisLoading || analysisData) && (
                    <EngineAnalysisView
                      fen={analysisPosition || fen}
                      data={analysisData}
                      loading={analysisLoading}
                      variant="jieqi"
                      onAnalyzeMove={analysisIsCurrent ? (move) => setAnalysisSearchMoves([move]) : null}
                      log={jieqiEngine.getLog()}
                      showWdl={false}
                    />
                  )}
                  {analysisError && <div className="import-error">{analysisError}</div>}
                  {!analysisEnabled && !analysisData && !analysisError && <p className="jieqi-analysis-empty">分析已停止，可从下方重新开启。</p>}
                </section>
                {error && <div className="import-error">{error}</div>}
              </div>
            ) : <div className="desktop-inspector-body">
              {inspectorTab === "moves" && (
                moves.length > 0 ? (
                  <ChineseMoveList pairs={notationPairs} desktop />
                ) : (
                  <div className="desktop-inspector-empty">揭棋对局刚刚开始<br />走子后将在这里记录棋谱</div>
                )
              )}
              {inspectorTab === "info" && (
                <div className="desktop-analysis-pane">
                  {gameMode === "human-ai" && <div className="desktop-analysis-section">
                    <strong>当前引擎</strong>
                    <p>{engineDisplay}</p>
                  </div>}
                  {error && <div className="import-error">{error}</div>}
                </div>
              )}
            </div>}

            <div className="desktop-inspector-actions desktop-jieqi-actions">
              {gameMode === "free" && <>
                <button className="primary" onClick={toggleAnalysis}>{analysisEnabled ? "停止分析" : "开始分析"}</button>
                <button
                  onClick={() => analysisData ? setShowHint((value) => !value) : analyzeFreePosition(fen)}
                  disabled={analysisLoading}
                >
                  {analysisLoading ? "分析中…" : analysisData && showHint ? "隐藏提示" : "走子提示"}
                </button>
              </>}
              <button onClick={undo} disabled={!canUndo || thinking}>悔棋</button>
              <button onClick={() => setBoardFlipped((value) => !value)}>{boardFlipped ? "恢复方向" : "翻转棋盘"}</button>
              <ResignButton className="danger" label={gameMode === "free" ? `${currentSide === "w" ? "红方" : "黑方"}认输` : "认输"} disabled={Boolean(winner)} onResign={resign} />
              <button className="danger wide" onClick={restart}>新对局</button>
            </div>
          </aside>
        ) : (
          <div className="panel move-log">
            <div className="move-log-head"><strong>揭棋着法</strong><span className="muted">{moves.length} 步</span></div>
            {gameMode === "free" && (
              <div className="jieqi-mobile-analysis">
                <strong>{analysisLoading ? "分析中…" : evalInfo.value}</strong>
                <span>{analysisLoading ? "正在搜索最佳着法" : analysisData ? `${evalInfo.label} · 推荐 ${bestMoveText}` : analysisError || "分析已停止"}</span>
              </div>
            )}
            <ChineseMoveList pairs={notationPairs} />
          </div>
        )}
      </div>
    </div>
  );
}
