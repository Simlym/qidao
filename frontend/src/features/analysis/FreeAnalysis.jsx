import React from "react";
import Board from "../../shared/ui/Board";
import { INITIAL_FEN, uciToChinese } from "../../domain/xiangqi/xiangqi";
import { getLocalPositionState } from "../../domain/xiangqi/rules";
import { createEngineManager } from "../../domain/xiangqi/engine/createEngineManager";
import { evalPosition, streamEvalPosition } from "../../shared/api";
import { usePlayAnalysis } from "../play/hooks/usePlayAnalysis";
import { describeEval } from "../play/model";
import EngineAnalysisView from "./EngineAnalysisView";
import EngineSetupGuide from "../../shared/ui/EngineSetupGuide";
import { analysisReducer, createAnalysis, recommendedMove } from "./freeAnalysisState.js";
import "./freeAnalysis.css";

const engine = createEngineManager({ remoteEvaluate: evalPosition, remoteStream: streamEvalPosition });

export default function FreeAnalysis({ initialFen = INITIAL_FEN, onOpenSettings }) {
  const [state, dispatch] = React.useReducer(analysisReducer, initialFen, createAnalysis);
  const [flipped, setFlipped] = React.useState(false);
  const [localRuntime, setLocalRuntime] = React.useState(null);
  const [copied, setCopied] = React.useState("");
  const [showHint, setShowHint] = React.useState(true);
  const current = state.positions[state.cursor];
  const fen = current.fen;
  const position = React.useMemo(() => getLocalPositionState(fen), [fen]);
  const red = fen.split(/\s+/)[1] !== "b";
  const ended = !position.legal_moves.length;
  const analysis = usePlayAnalysis({ engine, fen, thinking: ended, localRuntime, localReady: Boolean(localRuntime) });
  const { showEval, setShowEval, evalData, evalLoading } = analysis;
  const hintMove = showEval && !ended ? recommendedMove(evalData, position.legal_moves) : null;
  const info = describeEval(evalData || {}, "w");
  const evaluationLabel = evalData?.mate != null
    ? `${evalData.mate > 0 ? "红" : "黑"}方 ${Math.abs(evalData.mate)} 步可杀`
    : info.label.replace(/（.*）/, "");

  React.useEffect(() => {
    setShowEval(true);
    let active = true;
    engine.availableKinds().then((kinds) => {
      if (active) setLocalRuntime(kinds.includes("native") ? "native" : kinds.includes("wasm") ? "wasm" : null);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  function seek(cursor) { dispatch({ type: "seek", cursor }); }
  async function copyFen() {
    try { await navigator.clipboard.writeText(fen); setCopied("局面已复制"); }
    catch { setCopied("复制失败，请检查剪贴板权限"); }
  }

  return <div className="free-analysis">
    <div className="free-analysis-board play-board-area">
      <div className="free-analysis-status" role="status">
        <strong>{ended ? `${red ? "黑" : "红"}方胜，已无合法着法` : `${red ? "红" : "黑"}方走棋${position.status === "check" ? " · 将军" : ""}`}</strong>
        <span>双方手动走棋 · 引擎仅作分析</span>
      </div>
      <Board key={fen} fen={fen} lastMove={current.move} legalMoves={position.legal_moves}
        fitContainerHeight reservedBottomHeight={64} hintMove={showHint ? hintMove : null}
        disabled={ended} flipped={flipped} onMove={(move) => dispatch({ type: "move", move })} />
      <div className="btn-row free-analysis-navigation">
        <button disabled={!state.cursor} onClick={() => seek(0)}>回到起点</button>
        <button disabled={!state.cursor} onClick={() => seek(state.cursor - 1)}>上一步</button>
        <span>{state.cursor} / {state.positions.length - 1} 步</span>
        <button disabled={state.cursor === state.positions.length - 1} onClick={() => seek(state.cursor + 1)}>下一步</button>
        <button onClick={() => setFlipped((value) => !value)}>翻转棋盘</button>
      </div>
    </div>
    <aside className="panel free-analysis-inspector">
      <div className="free-analysis-heading"><h2>自由分析</h2><span>双方手动</span></div>
      <p className="muted free-analysis-description">回看后可改走其他变化，后续着法将被替换。</p>
      <EngineSetupGuide localReady={Boolean(localRuntime)} onOpenSettings={onOpenSettings} />
      <div className="free-analysis-tools">
        <button aria-pressed={showEval} onClick={() => setShowEval((value) => !value)}>局面评分 {showEval ? "开" : "关"}</button>
        <button aria-pressed={showHint} onClick={() => setShowHint((value) => !value)}>走棋箭头 {showHint ? "开" : "关"}</button>
        <button onClick={copyFen}>复制局面</button>
        {onOpenSettings && <button onClick={onOpenSettings}>引擎设置</button>}
      </div>
      {copied && <p role="status">{copied}</p>}
      <div className="free-analysis-recommendation" role="status">
        <span>{red ? "红方" : "黑方"}推荐{evalLoading && hintMove ? " · 分析中" : ""}</span>
        <strong>{hintMove ? uciToChinese(fen, hintMove) : ended ? "已到终局" : !showEval ? "开启评分查看推荐" : evalLoading ? "正在寻找推荐着法…" : "暂无推荐着法"}</strong>
        <button className="free-analysis-primary" disabled={!hintMove} onClick={() => hintMove && dispatch({ type: "move", move: hintMove })}>走推荐着法</button>
      </div>
      {showEval && <section aria-label="引擎分析">
        <div className="eval-bar"><div className="eval-bar-red" style={{ width: `${info.redPct}%` }} /><span className="eval-bar-value">{ended ? "终局" : evalLoading && !evalData ? "…" : info.value}</span></div>
        <p className="muted">{ended ? "可回到前一步继续研究其他变化" : evalData ? evaluationLabel : evalLoading ? "正在分析…" : "暂无分析结果，请检查引擎或服务连接"}</p>
        <div className="engine-analysis-controls">
          <select aria-label="分析模式" value={analysis.analysisMode} onChange={(event) => analysis.setAnalysisMode(event.target.value)}>
            <option value="movetime">限时分析</option><option value="depth">深度分析</option>{localRuntime === "native" && <option value="infinite">无限分析</option>}
          </select>
          {analysis.analysisMode === "movetime" && <select aria-label="分析时间" value={analysis.analysisTime} onChange={(event) => analysis.setAnalysisTime(Number(event.target.value))}>
            <option value={500}>0.5 秒</option><option value={1000}>1 秒</option><option value={3000}>3 秒</option><option value={5000}>5 秒</option>
          </select>}
          {analysis.analysisMode === "depth" && <input aria-label="分析深度" type="number" min="1" max="30" value={analysis.analysisDepth} onChange={(event) => analysis.setAnalysisDepth(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} />}
          <select aria-label="候选线路数" value={analysis.analysisMultiPv} onChange={(event) => analysis.setAnalysisMultiPv(Number(event.target.value))}>
            <option value={1}>最佳 1 线</option><option value={3}>候选 3 线</option><option value={5}>候选 5 线</option>
          </select>
        </div>
        {analysis.analysisSearchMoves.length > 0 && <button onClick={() => analysis.setAnalysisSearchMoves([])}>取消限定首着</button>}
        {!ended && <EngineAnalysisView key={fen} fen={fen} data={evalData} loading={evalLoading} log={engine.getLog()} onAnalyzeMove={(move) => analysis.setAnalysisSearchMoves([move])} />}
      </section>}
      <details open className="free-analysis-history">
        <summary>分析着法</summary>
        <button aria-current={state.cursor === 0 ? "step" : undefined} onClick={() => seek(0)}>起始局面</button>
        {state.positions.slice(1).map((item, index) => <button key={index} aria-current={state.cursor === index + 1 ? "step" : undefined} onClick={() => seek(index + 1)}>
          {index + 1}. {uciToChinese(state.positions[index].fen, item.move)}
        </button>)}
      </details>
      <div className="free-analysis-footer"><button onClick={() => { dispatch({ type: "reset", fen: initialFen }); setCopied(""); }}>重置分析</button><small>引擎仅供参考，由你决定每一步</small></div>
    </aside>
  </div>;
}
