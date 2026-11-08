import React from "react";
import Board from "../../shared/ui/Board";
import { parseJieqiBoard } from "../../domain/xiangqi/jieqi/rules";
import { jieqiPieceImage } from "../../domain/xiangqi/jieqi/pieceImages";
import MobileGameLayout from "../play/components/MobileGameLayout";
import { useBackAction } from "../../shared/hooks/useBackAction";

// 复盘与对弈共用固定棋盘舞台，着法导航和分析在面板内展示。
export default function MobileGameReview({ game, fen, lastMove, loading, error, onRetry, step, total, onStep, onBack, history, renderAnalysis, menu }) {
  const [panel, setPanel] = React.useState(null);
  const [flipped, setFlipped] = React.useState(false);
  React.useEffect(() => { setPanel(null); setFlipped(false); }, [game.id]);
  useBackAction(() => { onBack(); return true; }, { priority: 100 });
  const seek = (value) => onStep(Math.max(0, Math.min(total, value)));
  return <MobileGameLayout variant="review" title={game.variant === "jieqi" ? "揭棋复盘" : "象棋复盘"} status={loading ? "加载中…" : error || game.result || "棋谱回放"} moveCount={total}
    opponent={{ mark: flipped ? "红" : "黑", side: flipped ? "red" : "black", name: (flipped ? game.red_player : game.black_player) || (flipped ? "红方" : "黑方"), detail: game.source || "本局棋谱" }}
    self={{ mark: flipped ? "黑" : "红", side: flipped ? "black" : "red", name: (flipped ? game.black_player : game.red_player) || (flipped ? "黑方" : "红方"), detail: `${step} / ${total} 步${game.played_on ? ` · ${game.played_on}` : ""}` }}
    onBack={onBack} panel={panel} onPanelChange={setPanel}
    history={<><div className="review-seek-actions"><button onClick={() => seek(0)}>回到开局</button><button onClick={() => seek(total)}>跳到终局</button></div><label className="review-seek">跳转步数：{step} / {total}<input aria-label="跳转到指定步数" type="range" min="0" max={total} value={step} disabled={!total} onChange={(event) => seek(Number(event.target.value))} /></label>{history}</>}
    analysis={renderAnalysis(() => setPanel(null))} menu={<div className="mobile-menu-actions"><button onClick={onBack}>返回棋谱列表</button><button onClick={() => { setFlipped((value) => !value); setPanel(null); }}>翻转棋盘</button><button onClick={() => { seek(0); setPanel(null); }}>回到开局</button><button onClick={() => { seek(total); setPanel(null); }}>跳到终局</button>{menu}</div>}
    toolbar={<nav className="mobile-game-toolbar review-toolbar" aria-label="复盘操作"><button onClick={() => setPanel("menu")}><span aria-hidden>☰</span>菜单</button><button onClick={() => setPanel("history")}><span aria-hidden>☷</span>着法</button><button onClick={() => seek(step - 1)} disabled={loading || step === 0}><span aria-hidden>‹</span>上一步</button><button onClick={() => seek(step + 1)} disabled={loading || step >= total}><span aria-hidden>›</span>下一步</button><button onClick={() => setPanel("analysis")}><span aria-hidden>↗</span>分析</button></nav>}
  >
    {fen && !loading ? <Board fen={fen} lastMove={lastMove} disabled flipped={flipped} fitContainerHeight parsePosition={game.variant === "jieqi" ? parseJieqiBoard : undefined} pieceImage={game.variant === "jieqi" ? jieqiPieceImage : undefined} /> : <div className="review-loading" role="status">{loading ? "正在加载棋谱…" : error || "棋谱没有可用局面"}{!loading && <button onClick={onRetry}>重新加载</button>}</div>}
  </MobileGameLayout>;
}
