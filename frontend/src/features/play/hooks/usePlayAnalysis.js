import React from "react";

// 本地/云端评分会话统一归属此 Hook；局面变化和卸载时停止旧会话。
export function usePlayAnalysis({ engine, fen, thinking, localRuntime, localReady }) {
  const [showEval, setShowEval] = React.useState(false);
  const [evalData, setEvalData] = React.useState(null);
  const [evalLoading, setEvalLoading] = React.useState(false);
  const [analysisMode, setAnalysisMode] = React.useState("movetime");
  const [analysisTime, setAnalysisTime] = React.useState(1000);
  const [analysisDepth, setAnalysisDepth] = React.useState(18);
  const [analysisMultiPv, setAnalysisMultiPv] = React.useState(1);
  const [analysisSearchMoves, setAnalysisSearchMoves] = React.useState([]);
  const evalReqId = React.useRef(0);
  const evalSession = React.useRef(null);

  React.useEffect(() => {
    // 单线程 WASM 不可中断无限搜索。
    if (localRuntime === "wasm" && analysisMode === "infinite") setAnalysisMode("depth");
  }, [localRuntime, analysisMode]);

  React.useEffect(() => {
    if (!showEval || !fen || thinking) {
      if (!fen) setEvalData(null);
      setEvalLoading(false);
      return;
    }
    const id = ++evalReqId.current;
    setEvalData(null);
    setEvalLoading(true);
    evalSession.current?.stop();
    const session = engine.startAnalysis(fen, {
      mode: analysisMode,
      value: analysisMode === "depth" ? analysisDepth : analysisTime,
      depth: analysisDepth,
      multiPv: analysisMultiPv,
      showWdl: true,
      searchMoves: analysisSearchMoves,
      onUpdate: (data) => { if (id === evalReqId.current) setEvalData(data); },
    });
    evalSession.current = session;
    session.result
      .then((data) => { if (id === evalReqId.current) setEvalData(data); })
      .catch((error) => { if (id === evalReqId.current && error?.name !== "AbortError") setEvalData(null); })
      .finally(() => { if (id === evalReqId.current) setEvalLoading(false); });
    return () => {
      evalReqId.current++;
      session.stop();
      if (evalSession.current === session) evalSession.current = null;
    };
  }, [engine, showEval, fen, thinking, localReady, analysisMode, analysisTime, analysisDepth, analysisMultiPv, analysisSearchMoves]);

  React.useEffect(() => {
    setAnalysisSearchMoves((moves) => moves.length ? [] : moves);
  }, [fen]);

  return {
    showEval, setShowEval, evalData, evalLoading,
    analysisMode, setAnalysisMode, analysisTime, setAnalysisTime,
    analysisDepth, setAnalysisDepth, analysisMultiPv, setAnalysisMultiPv,
    analysisSearchMoves, setAnalysisSearchMoves,
  };
}
