import React from "react";
import Board from "../../shared/ui/Board";
import { useWideWebLayout } from "../../shared/hooks/useWideWebLayout";
import LocalGameLibrary from "./components/LocalGameLibrary";
import PlaySetup from "./components/PlaySetup";
import MoveHistory from "./components/MoveHistory";
import CapturedPieces from "./components/CapturedPieces";
import ResultOverlay from "./components/ResultOverlay";
import { uciToChinese } from "../../domain/xiangqi/xiangqi";
import { evalPosition, streamEvalPosition } from "../../shared/api";
import { createEngineManager } from "../../domain/xiangqi/engine/createEngineManager";
import { runtime, usesDesktopLayout } from "../../platform/runtime";
import {
  playSound, soundMuted, setSoundMuted,
  soundTheme, setSoundTheme, SOUND_THEMES,
  soundThemeLabel,
} from "../../shared/sounds";
import EngineAnalysisView from "../analysis/EngineAnalysisView";
import { LEVELS, capturedPieces, describeEval, fmtDuration } from "./model";
import { usePlayGame } from "./hooks/usePlayGame";
import { usePlayAnalysis } from "./hooks/usePlayAnalysis";
import { usePlayAssistance } from "./hooks/usePlayAssistance";

// 当前为 Web：WASM 优先，失败后自动降级 FastAPI。
// Tauri 接入后只在工厂中增加原生适配器，页面无需出现平台分支。
const positionEngine = createEngineManager({ remoteEvaluate: evalPosition, remoteStream: streamEvalPosition });

export default function Play({ onGoReview, user, onCreditsChanged, onRequireLogin, onOpenSettings }) {
  const isDesktop = usesDesktopLayout(runtime);
  const wideWeb = useWideWebLayout(runtime);
  const {
    fen, legalMoves, lastMove, yourTurn, thinking, over,
    level, setLevel, humanSide, setHumanSide, status, saved, savedGameId, canUndo,
    engineInfo, startError, moveError, localReady, localRuntime,
    moveLog, timesLog, overDismissed, setOverDismissed,
    start, restart, onMove, undo, restore, localNotice,
  } = usePlayGame({ engine: positionEngine, onCreditsChanged });
  const {
    showEval, setShowEval, evalData, evalLoading,
    analysisMode, setAnalysisMode, analysisTime, setAnalysisTime,
    analysisDepth, setAnalysisDepth, analysisMultiPv, setAnalysisMultiPv,
    analysisSearchMoves, setAnalysisSearchMoves,
  } = usePlayAnalysis({
    engine: positionEngine, fen, thinking, localRuntime, localReady,
  });
  const [inspectorTab, setInspectorTab] = React.useState("moves");
  const {
    showBook, setShowBook, bookData, bookLoading,
    hint, hintLoading, coach, coachLoading, requestHint, requestCoach,
  } = usePlayAssistance({
    fen, thinking, over, yourTurn, localReady, localRuntime, engine: positionEngine,
    isDesktop, user, onRequireLogin, onCreditsChanged,
    onShowAnalysis: () => setInspectorTab("analysis"),
  });
  const [fenCopied, setFenCopied] = React.useState(false);
  const [muted, setMuted] = React.useState(soundMuted);
  const [soundKey, setSoundKey] = React.useState(soundTheme);
  const logRef = React.useRef(null);                  // 棋谱滚动容器
  const keysRef = React.useRef({});                   // 键盘快捷键的最新处理函数

  // 新着法出现时棋谱自动滚到最底部，最新一着始终可见
  React.useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [moveLog]);

  // 键盘快捷键：Ctrl/Cmd+Z 悔棋，H 提示。经 ref 转发，监听器只挂一次。
  React.useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        keysRef.current.undo?.();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "h") {
        keysRef.current.hint?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function copyFen() {
    if (!fen) return;
    try {
      await navigator.clipboard.writeText(fen);
      setFenCopied(true);
      setTimeout(() => setFenCopied(false), 1500);
    } catch { /* 剪贴板不可用时静默 */ }
  }

  // 快捷键经 ref 调用，始终拿到本次渲染的最新闭包
  keysRef.current.undo = undo;
  keysRef.current.hint = requestHint;

  // 音效切换：按可用音色顺序循环，最后进入静音；切换后立即试听一声。
  function cycleSound() {
    const order = [...SOUND_THEMES.map((t) => t.key), "muted"];
    const cur = muted ? "muted" : soundKey;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    if (next === "muted") {
      setMuted(true);
      setSoundMuted(true);
    } else {
      setMuted(false);
      setSoundMuted(false);
      setSoundKey(next);
      setSoundTheme(next);
      playSound("move");
    }
  }

  // 初始进入选择界面
  if (!fen) {
    return (
      <>
      <PlaySetup
        engineInfo={engineInfo} humanSide={humanSide} onHumanSideChange={setHumanSide}
        level={level} onLevelChange={setLevel} localReady={localReady}
        localRuntime={localRuntime} onOpenSettings={onOpenSettings}
        onStart={start} thinking={thinking} startError={startError}
      />
      <LocalGameLibrary onRestore={restore} />
      </>
    );
  }

  const winnerText = over
    ? over.winner === "human"
      ? "🎉 你赢了！"
      : over.winner === "engine"
      ? "引擎获胜，再接再厉"
      : "和棋"
    : null;

  const capt = capturedPieces(fen);          // 双方被吃的子与子力差
  const totalMs = timesLog.reduce((a, b) => a + b, 0); // 全局累计用时
  const currentTurnText = over
    ? winnerText
    : thinking
    ? "引擎思考中…"
    : status === "check"
    ? "将军！轮到你"
    : "轮到你走";
  const engineDisplay = localReady
    ? localRuntime === "native" ? "UCI 引擎 · 本地" : "WASM UCI 引擎 · 本地"
    : engineInfo?.label || "云端内置象棋引擎";
  const evalInfo = describeEval(evalData || {}, humanSide);
  const useSideLayout = isDesktop || wideWeb;

  return (
    <div className="play">
      {localNotice && <p role="status">{localNotice}</p>}
      {moveError && <div className="result bad" role="alert">{moveError}</div>}
      {/* 状态与操作分两行：状态文案变化（引擎思考中 ↔ 轮到你走）不再挤动按钮换行，棋盘不跳动 */}
      {!useSideLayout && <div className="panel play-status-bar">
        <div className="play-status-line">
          <span className="tag">{LEVELS.find((l) => l.key === level)?.label}</span>
          <span className="tag">{humanSide === "w" ? "你执红" : "你执黑"}</span>
          {!localReady && engineInfo && (
            <span className="tag" title={engineInfo.available ? "服务器提供的云端象棋引擎" : "服务器提供的云端内置象棋引擎"}>
              {engineInfo.available ? "☁ 云端引擎" : "☁ 云端内置引擎"}
            </span>
          )}
          {localReady && (
            <span className="tag" title="评估/提示在本机计算，不占用服务器">
              ⚡ {localRuntime === "native" ? "PC 原生分析" : "WASM 本地引擎"}
            </span>
          )}
          <span className="play-turn">
            {over
              ? winnerText
              : thinking
              ? "引擎思考中…"
              : status === "check"
              ? "将军！轮到你"
              : "轮到你走"}
          </span>
        </div>
        <div className="play-actions">
          <button
            className={"btn-newgame" + (showEval ? " active" : "")}
            onClick={() => setShowEval((v) => !v)}
          >
            {showEval ? "评分 开" : "评分 关"}
          </button>
          <button
            className={"btn-newgame" + (showBook ? " active" : "")}
            onClick={() => setShowBook((v) => !v)}
            title="查看云库收录的本局面着法与评分"
          >
            云库
          </button>
          <button
            className="btn-newgame"
            onClick={requestHint}
            disabled={!yourTurn || thinking || !!over || hintLoading}
            style={{ opacity: !yourTurn || thinking || over || hintLoading ? 0.5 : 1 }}
            title="让引擎推荐一步（快捷键 H，本地引擎/云库优先）"
          >
            {hintLoading ? "思考中…" : "提示"}
          </button>
          <button
            className="btn-newgame"
            onClick={undo}
            disabled={!canUndo || thinking}
            style={{ opacity: !canUndo || thinking ? 0.5 : 1 }}
            title="悔棋（Ctrl+Z）"
          >
            悔棋
          </button>
          <button
            className="btn-newgame"
            onClick={cycleSound}
            title="点击切换音效，全部音色轮换后进入静音"
          >
            {muted
              ? "🔇 静音"
              : `🔊 ${soundThemeLabel(soundKey)}`}
          </button>
          {over && overDismissed && (
            <button className="btn-newgame" onClick={() => setOverDismissed(false)}>
              查看结果
            </button>
          )}
          <button
            className="btn-newgame"
            onClick={restart}
          >
            重开
          </button>
        </div>
      </div>}

      {!useSideLayout && showEval && (() => {
        const info = describeEval(evalData || {}, humanSide);
        return (
          <div className="panel eval-bar-wrap">
            <div className="eval-bar">
              <div className="eval-bar-red" style={{ width: `${info.redPct}%` }} />
              <span className="eval-bar-value">{evalLoading && !evalData ? "…" : info.value}</span>
            </div>
            <div className="eval-bar-label">
              <span className="muted">{evalLoading ? "评估中…" : info.label}</span>
            </div>
          </div>
        );
      })()}

      {!useSideLayout && hint && (
        <div className="panel hint-strip">
          💡 推荐：<strong>{hint.text}</strong>
          <span className="muted">（{hint.source}）</span>
          {!coach && (
            <button
              className="btn-newgame hint-coach-btn"
              onClick={requestCoach}
              disabled={coachLoading}
            >
              {coachLoading ? "AI 思考中…" : "🤖 AI 详解"}
            </button>
          )}
          {coach?.text && (
            <div className="analysis-explanation ai-explain">{coach.text}</div>
          )}
          {coach?.disabled && (
            <div className="muted" style={{ marginTop: 6 }}>
              未启用 AI 点评（管理员可在后台配置大模型）
            </div>
          )}
          {coach?.error && (
            <div className="import-error" style={{ marginTop: 6 }}>{coach.error}</div>
          )}
        </div>
      )}

      {!useSideLayout && showBook && (
        <div className="panel book-panel">
          <div className="book-panel-head">
            <strong>云库着法</strong>
            <span className="muted">
              {bookLoading
                ? "查询中…"
                : !bookData || !bookData.available
                ? "云库暂不可用"
                : bookData.moves.length === 0
                ? "云库未收录此局面"
                : "点击着法直接走子（评分为走子方视角）"}
            </span>
          </div>
          {bookData?.available && bookData.moves.length > 0 && (
            <div className="book-moves">
              {bookData.moves.slice(0, 8).map((m) => {
                const playable = yourTurn && !thinking && !over && legalMoves.includes(m.uci);
                return (
                  <button
                    key={m.uci}
                    className="book-move"
                    disabled={!playable}
                    onClick={() => playable && onMove(m.uci)}
                    title={m.note || m.uci}
                  >
                    <span className="book-move-name">{uciToChinese(fen, m.uci)}</span>
                    {m.score != null && (
                      <span className={"book-move-score" + (m.score >= 0 ? " pos" : " neg")}>
                        {m.score > 0 ? "+" : ""}{m.score}
                      </span>
                    )}
                    {m.winrate != null && (
                      <span className="book-move-rate">{m.winrate.toFixed(0)}%</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PC：棋盘居左、棋谱在右侧伴随显示；移动端自动堆叠回上下布局 */}
      <div className="play-main">
        {wideWeb && (
          <aside className="panel web-play-rail" aria-label="本局状态">
            <div className="web-play-rail-title">本局对弈</div>
            <div className="web-player-card opponent">
              <span className="web-player-avatar">机</span>
              <div><strong>电脑</strong><small>{engineDisplay}</small></div>
            </div>
            <div className="web-turn-card">
              <small>当前局面</small>
              <strong>{currentTurnText}</strong>
              <span>{LEVELS.find((item) => item.key === level)?.label} · {Math.ceil(moveLog.length / 2)} 回合</span>
            </div>
            <div className="web-player-card self">
              <span className="web-player-avatar">我</span>
              <div><strong>你</strong><small>{humanSide === "w" ? "执红先行" : "执黑后行"}</small></div>
            </div>
            <div className="web-play-rail-meta">
              <span>累计用时</span><strong>{totalMs > 0 ? fmtDuration(totalMs) : "00:00"}</strong>
            </div>
            <button className="web-sound-button" onClick={cycleSound}>
              {muted ? "🔇 已静音" : `🔊 ${soundThemeLabel(soundKey)}`}
            </button>
          </aside>
        )}
        <div className="play-board-area">
          {useSideLayout && (
            <div className="desktop-board-playerbar">
              <span>电脑</span>
              <strong>{currentTurnText}</strong>
            </div>
          )}
          <Board
            fen={fen}
            onMove={onMove}
            lastMove={lastMove}
            disabled={!yourTurn || thinking || !!over}
            legalMoves={over ? [] : legalMoves}
            hintMove={hint?.move || null}
            flipped={humanSide === "b"}
          />

          <CapturedPieces capt={capt} />

          <ResultOverlay localNotice={localNotice}
            over={over} overDismissed={overDismissed} winnerText={winnerText}
            moveLog={moveLog} totalMs={totalMs} saved={saved}
            savedGameId={savedGameId} onGoReview={onGoReview}
            onDismiss={() => setOverDismissed(true)}
            onRestart={() => start(humanSide, level)}
          />

        </div>

        {useSideLayout ? (
          <aside className="panel move-log desktop-play-inspector">
            <div className="desktop-game-summary">
              <strong>本局信息</strong>
              <span>{humanSide === "w" ? "你执红" : "你执黑"} · {LEVELS.find((item) => item.key === level)?.label}</span>
              <span>{engineDisplay}</span>
            </div>

            <div className="desktop-inspector-tabs" role="tablist" aria-label="对局信息">
              <button
                className={inspectorTab === "moves" ? "active" : ""}
                onClick={() => setInspectorTab("moves")}
                role="tab"
                aria-selected={inspectorTab === "moves"}
              >
                棋谱
              </button>
              <button
                className={inspectorTab === "analysis" ? "active" : ""}
                onClick={() => setInspectorTab("analysis")}
                role="tab"
                aria-selected={inspectorTab === "analysis"}
              >
                分析
              </button>
            </div>

            <div className="desktop-inspector-body">
              {inspectorTab === "moves" && (
                moveLog.length > 0 ? (
                  <MoveHistory moveLog={moveLog} timesLog={timesLog} logRef={logRef} />
                ) : (
                  <div className="desktop-inspector-empty">对局刚刚开始<br />走子后将在这里记录棋谱</div>
                )
              )}

              {inspectorTab === "analysis" && (
                <div className="desktop-analysis-pane">
                  {showEval && (
                    <div className="desktop-analysis-section">
                      <div className="eval-bar">
                        <div className="eval-bar-red" style={{ width: `${evalInfo.redPct}%` }} />
                        <span className="eval-bar-value">{evalLoading && !evalData ? "…" : evalInfo.value}</span>
                      </div>
                      <p>{evalInfo.label}</p>
                      <div className="engine-analysis-controls">
                        <select value={analysisMode} onChange={(event) => setAnalysisMode(event.target.value)} aria-label="分析模式">
                          <option value="movetime">限时分析</option><option value="depth">深度分析</option>{localRuntime === "native" && <option value="infinite">无限分析</option>}
                        </select>
                        {analysisMode === "movetime" && <select value={analysisTime} onChange={(event) => setAnalysisTime(Number(event.target.value))} aria-label="分析时间">
                          <option value={500}>0.5 秒</option><option value={1000}>1 秒</option><option value={3000}>3 秒</option><option value={5000}>5 秒</option>
                        </select>}
                        {analysisMode === "depth" && <input type="number" min="1" max="30" value={analysisDepth} onChange={(event) => setAnalysisDepth(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} aria-label="分析深度" />}
                        <select value={analysisMultiPv} onChange={(event) => setAnalysisMultiPv(Number(event.target.value))} aria-label="候选线路数">
                          <option value={1}>最佳 1 线</option><option value={3}>候选 3 线</option><option value={5}>候选 5 线</option>
                        </select>
                      </div>
                      {analysisSearchMoves.length > 0 && <button className="engine-searchmove-clear" onClick={() => setAnalysisSearchMoves([])}>正在限定 {analysisSearchMoves[0]} · 取消限定</button>}
                      {(evalLoading || evalData) && (
                        <EngineAnalysisView
                          fen={fen}
                          data={evalData}
                          loading={evalLoading}
                          onAnalyzeMove={(move) => setAnalysisSearchMoves([move])}
                          log={positionEngine.getLog()}
                        />
                      )}
                    </div>
                  )}

                  {hint && (
                    <div className="desktop-analysis-section desktop-hint-result">
                      <strong>推荐 {hint.text}</strong>
                      <span>{hint.source}</span>
                      {!coach && (
                        <button onClick={requestCoach} disabled={coachLoading}>
                          {coachLoading ? "AI 思考中…" : "AI 详解"}
                        </button>
                      )}
                      {coach?.text && <div className="analysis-explanation ai-explain">{coach.text}</div>}
                      {coach?.disabled && <p>未启用 AI 点评</p>}
                      {coach?.error && <p className="import-error">{coach.error}</p>}
                    </div>
                  )}

                  {showBook && (
                    <div className="desktop-analysis-section">
                      <strong>云库着法</strong>
                      <p>
                        {bookLoading
                          ? "查询中…"
                          : !bookData || !bookData.available
                          ? "云库暂不可用"
                          : bookData.moves.length === 0
                          ? "云库未收录此局面"
                          : "点击着法直接走子"}
                      </p>
                      {bookData?.available && bookData.moves.length > 0 && (
                        <div className="desktop-book-moves">
                          {bookData.moves.slice(0, 5).map((item) => {
                            const playable = yourTurn && !thinking && !over && legalMoves.includes(item.uci);
                            return (
                              <button key={item.uci} disabled={!playable} onClick={() => playable && onMove(item.uci)}>
                                {uciToChinese(fen, item.uci)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {!showEval && !showBook && !hint && (
                    <div className="desktop-inspector-empty">开启评分、云库或请求提示后<br />分析结果会显示在这里</div>
                  )}
                </div>
              )}
            </div>

            <div className="desktop-inspector-actions">
              <button
                className="primary"
                onClick={requestHint}
                disabled={!yourTurn || thinking || !!over || hintLoading}
              >
                {hintLoading ? "思考中…" : "提示"}
              </button>
              <button onClick={undo} disabled={!canUndo || thinking}>悔棋</button>
              <button
                className={showEval ? "active" : ""}
                onClick={() => {
                  setShowEval((value) => !value);
                  setInspectorTab("analysis");
                }}
              >
                评分 {showEval ? "开" : "关"}
              </button>
              <button
                className={showBook ? "active" : ""}
                onClick={() => {
                  setShowBook((value) => !value);
                  setInspectorTab("analysis");
                }}
              >
                云库 {showBook ? "开" : "关"}
              </button>
              <button onClick={copyFen}>{fenCopied ? "已复制" : "复制 FEN"}</button>
              <button className="danger" onClick={restart}>重开</button>
              {over && overDismissed && (
                <button className="wide" onClick={() => setOverDismissed(false)}>查看结果</button>
              )}
            </div>
          </aside>
        ) : moveLog.length > 0 && (
          <div className="panel move-log">
            <div className="move-log-head">
              <strong>棋谱</strong>
              <button className="btn-newgame" onClick={copyFen}>
                {fenCopied ? "已复制" : "复制 FEN"}
              </button>
            </div>
            <MoveHistory moveLog={moveLog} timesLog={timesLog} logRef={logRef} />
          </div>
        )}
      </div>
    </div>
  );
}
