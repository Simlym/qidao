import React from "react";
import { legalJieqiMoves } from "../../../domain/xiangqi/jieqi/rules.js";
import { analysisPreferences } from "../../../shared/preferences/analysisPreferences.js";
import { normalizeJieqiAnalysis } from "../analysisResult.js";

// 揭棋自由翻子分析生命周期：换局面、暂停与卸载均使旧会话失效。
export function useJieqiAnalysis({ engine, fen, gameMode, pendingFlip, winner, runtimeKind }) {
  const initial = React.useMemo(() => analysisPreferences("jieqi"), []);
  const [analysisEnabled, setAnalysisEnabled] = React.useState(true);
  const [analysisData, setAnalysisData] = React.useState(null);
  const [analysisPosition, setAnalysisPosition] = React.useState(null);
  const [analysisLoading, setAnalysisLoading] = React.useState(false);
  const [analysisError, setAnalysisError] = React.useState("");
  const [analysisMode, setAnalysisMode] = React.useState(initial.mode);
  const [analysisTime, setAnalysisTime] = React.useState(initial.time);
  const [analysisDepth, setAnalysisDepth] = React.useState(initial.depth);
  const [analysisMultiPv, setAnalysisMultiPv] = React.useState(initial.multiPv);
  const [analysisSearchMoves, setAnalysisSearchMoves] = React.useState([]);

  const requestId = React.useRef(0);
  const sessionRef = React.useRef(null);

  function invalidateAnalysis() {
    requestId.current++;
    sessionRef.current?.stop();
    sessionRef.current = null;
    setAnalysisLoading(false);
  }

  function resetAnalysis() {
    invalidateAnalysis();
    setAnalysisData(null);
    setAnalysisPosition(null);
    setAnalysisError("");
  }

  React.useEffect(() => {
    // WASM 与云端不可维持无限分析；仅桌面原生引擎允许。
    if (runtimeKind !== "native" && analysisMode === "infinite") setAnalysisMode("depth");
  }, [runtimeKind, analysisMode]);

  async function analyzeFreePosition(position) {
    invalidateAnalysis();
    const id = ++requestId.current;
    setAnalysisLoading(true);
    setAnalysisError("");
    const legalMoves = legalJieqiMoves(position);
    const options = {
      mode: analysisMode,
      value: analysisMode === "depth" ? analysisDepth : analysisTime,
      depth: analysisDepth,
      multiPv: analysisMultiPv,
      showWdl: true,
      searchMoves: analysisSearchMoves,
      onUpdate(data) {
        if (id !== requestId.current) return;
        setAnalysisData(normalizeJieqiAnalysis(data, legalMoves));
        setAnalysisPosition(position);
      },
    };
    const session = engine.startAnalysis(position, options);
    sessionRef.current = session;
    try {
      const result = normalizeJieqiAnalysis(await session.result, legalMoves);
      if (!result.bestMove) throw new Error("揭棋引擎没有返回可用的推荐着法");
      if (id !== requestId.current) return;
      setAnalysisData(result);
      setAnalysisPosition(position);
    } catch (reason) {
      if (id !== requestId.current || reason?.name === "AbortError") return;
      setAnalysisData(null);
      setAnalysisPosition(null);
      setAnalysisError(reason.message || "揭棋分析引擎不可用");
    } finally {
      if (id === requestId.current) {
        setAnalysisLoading(false);
        if (sessionRef.current === session) sessionRef.current = null;
      }
    }
  }

  React.useEffect(() => {
    if (gameMode !== "free" || !fen || !analysisEnabled || pendingFlip || winner) {
      setAnalysisLoading(false);
      return;
    }
    void analyzeFreePosition(fen);
    return () => { requestId.current++; sessionRef.current?.stop(); sessionRef.current = null; };
  }, [engine, gameMode, fen, analysisEnabled, pendingFlip, winner, analysisMode, analysisTime, analysisDepth, analysisMultiPv, analysisSearchMoves]);

  React.useEffect(() => {
    setAnalysisSearchMoves((moves) => moves.length ? [] : moves);
  }, [fen]);

  React.useEffect(() => () => { requestId.current++; sessionRef.current?.stop(); }, []);

  function toggleAnalysis() {
    if (analysisEnabled) {
      resetAnalysis();
      setAnalysisEnabled(false);
    } else {
      setAnalysisEnabled(true);
    }
  }

  return {
    analysisEnabled, analysisData, setAnalysisData, analysisPosition, setAnalysisPosition,
    analysisLoading, analysisError, setAnalysisError,
    analysisMode, setAnalysisMode, analysisTime, setAnalysisTime,
    analysisDepth, setAnalysisDepth, analysisMultiPv, setAnalysisMultiPv,
    analysisSearchMoves, setAnalysisSearchMoves,
    analyzeFreePosition, invalidateAnalysis, resetAnalysis, toggleAnalysis,
  };
}
