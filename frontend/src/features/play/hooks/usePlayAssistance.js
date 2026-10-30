import React from "react";
import { uciToChinese } from "../../../domain/xiangqi/xiangqi.js";
import { getBookMoves, getHint, coachHintMove } from "../../../shared/api";
import { createGameEpoch } from "../gameEpoch.js";

// 云库、提示、AI 解释按局面失效；旧请求不能把别的局面结果显示出来。
export function usePlayAssistance({
  fen, thinking, over, yourTurn, localReady, localRuntime, engine,
  isDesktop, user, onRequireLogin, onCreditsChanged, onShowAnalysis,
}) {
  const [showBook, setShowBook] = React.useState(false);
  const [bookData, setBookData] = React.useState(null);
  const [bookLoading, setBookLoading] = React.useState(false);
  const [hint, setHint] = React.useState(null);
  const [hintLoading, setHintLoading] = React.useState(false);
  const [coach, setCoach] = React.useState(null);
  const [coachLoading, setCoachLoading] = React.useState(false);
  const hintEpoch = React.useRef(null);
  const coachEpoch = React.useRef(null);
  if (!hintEpoch.current) hintEpoch.current = createGameEpoch();
  if (!coachEpoch.current) coachEpoch.current = createGameEpoch();

  React.useEffect(() => {
    if (!showBook || !fen || thinking || over) {
      setBookLoading(false);
      return;
    }
    let active = true;
    setBookLoading(true);
    getBookMoves(fen)
      .then((data) => { if (active) setBookData(data); })
      .catch(() => { if (active) setBookData(null); })
      .finally(() => { if (active) setBookLoading(false); });
    return () => { active = false; };
  }, [showBook, fen, thinking, over]);

  React.useEffect(() => {
    hintEpoch.current.invalidate();
    coachEpoch.current.invalidate();
    setHint(null);
    setCoach(null);
    setHintLoading(false);
    setCoachLoading(false);
  }, [fen]);

  React.useEffect(() => () => {
    hintEpoch.current.invalidate();
    coachEpoch.current.invalidate();
  }, []);

  async function requestHint() {
    if (!yourTurn || thinking || over || hintLoading || !fen) return;
    const ticket = hintEpoch.current.begin();
    setHintLoading(true);
    try {
      let move = null;
      let source = "";
      if (localReady) {
        try {
          const data = await engine.evaluate(fen, { depth: 14 }, { onlyKinds: [localRuntime] });
          move = data.bestMove;
          source = "本地引擎";
        } catch { /* 降级到服务器，保留云库优先策略 */ }
      }
      if (!hintEpoch.current.isCurrent(ticket)) return;
      if (!move) {
        const data = await getHint(fen);
        move = data.move;
        source = data.source === "book" ? "云库" : "服务器引擎";
      }
      if (!hintEpoch.current.isCurrent(ticket)) return;
      setHint(move ? { move, text: uciToChinese(fen, move), source } : null);
      if (move && isDesktop) onShowAnalysis?.();
    } catch {
      if (hintEpoch.current.isCurrent(ticket)) setHint(null);
    } finally {
      if (hintEpoch.current.isCurrent(ticket)) setHintLoading(false);
    }
  }

  async function requestCoach() {
    if (!hint?.move || coachLoading || !fen) return;
    if (!user) { onRequireLogin?.(); return; }
    const ticket = coachEpoch.current.begin();
    setCoachLoading(true);
    try {
      const data = await coachHintMove(fen, hint.move);
      if (!coachEpoch.current.isCurrent(ticket)) return;
      setCoach(data.enabled ? { text: data.text || "（AI 暂时没有返回点评）" }
        : data.ai_status === "refunded" ? { error: "AI 点评生成失败，额度已退回，请稍后重试。" }
          : { disabled: true });
    } catch (error) {
      if (!coachEpoch.current.isCurrent(ticket)) return;
      if (error.status === 401) onRequireLogin?.();
      setCoach({ error: error.message || "AI 详解失败" });
    } finally {
      if (coachEpoch.current.isCurrent(ticket)) {
        onCreditsChanged?.();
        setCoachLoading(false);
      }
    }
  }

  return {
    showBook, setShowBook, bookData, bookLoading,
    hint, hintLoading, coach, coachLoading, requestHint, requestCoach,
  };
}
