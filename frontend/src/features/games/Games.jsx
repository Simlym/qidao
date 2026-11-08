import React from "react";
import Board from "../../shared/ui/Board";
import { uciToChinese } from "../../domain/xiangqi/xiangqi";
import { parseJieqiBoard, jieqiMoveToChinese } from "../../domain/xiangqi/jieqi/rules";
import { useMobilePlayLayout } from "../../shared/hooks/useMobilePlayLayout";
import MobileGameReview from "./MobileGameReview";
import "./mobile-review.css";
import { getGames, importGame, getGamePositions, deleteGame, analyzeGame, getAnalysis, createGameTrainingPack } from "../../shared/api";
import EvaluationChart from "../analysis/EvaluationChart";
import { AnalysisPanel, MoveItem } from "./ReviewAnalysis";

const RESULT_LABELS = {
  "1-0": { text: "红胜", color: "var(--app-danger, #c0392b)" },
  "0-1": { text: "黑胜", color: "var(--app-text, #222)" },
  "1/2-1/2": { text: "和棋", color: "var(--app-muted, #888)" },
  "红胜": { text: "红胜", color: "var(--app-danger, #c0392b)" },
  "黑胜": { text: "黑胜", color: "var(--app-text, #444)" },
  "和棋": { text: "和棋", color: "var(--app-muted, #888)" },
  "": { text: "未知", color: "var(--app-muted, #aaa)" },
};

function resultLabel(result) {
  return RESULT_LABELS[result] || { text: result || "未知", color: "var(--app-muted, #aaa)" };
}

const EMPTY_FORM = {
  moves: "",
  red_player: "",
  black_player: "",
  date: "",
  result: "1-0",
  opening: "",
};

function scrollCurrentMove(list, mobile) {
  const active = list?.querySelector(".move-item.active");
  const container = mobile ? list?.closest(".mobile-sheet-content") : list;
  if (!active || !container || !container.isConnected) return;
  const item = active.getBoundingClientRect(), area = container.getBoundingClientRect();
  if (item.top < area.top) container.scrollTop += item.top - area.top;
  else if (item.bottom > area.bottom) container.scrollTop += item.bottom - area.bottom;
}

export default function Games({ onNavigateToTrain, onStartPack, initialGameId, onInitialGameConsumed, user, onCreditsChanged, onRequireLogin }) {
  const mobile = useMobilePlayLayout();
  const [query, setQuery] = React.useState("");
  const [listError, setListError] = React.useState("");
  const [hasMore, setHasMore] = React.useState(false);
  const [positionError, setPositionError] = React.useState("");
  const [reload, setReload] = React.useState(0);
  const [analysisError, setAnalysisError] = React.useState("");
  const [games, setGames] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState(null);
  const [positions, setPositions] = React.useState(null);
  const [posLoading, setPosLoading] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [showImport, setShowImport] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [importing, setImporting] = React.useState(false);
  const [importError, setImportError] = React.useState("");
  const moveListRef = React.useRef(null);
  const setMoveListRef = React.useCallback((node) => {
    moveListRef.current = node;
    if (node) requestAnimationFrame(() => scrollCurrentMove(node, mobile));
  }, [mobile]);

  // Analysis state
  // idle: 未分析 | analyzing: 分析进行中 | partial: 有历史分析但未完成（可继续） | done: 已完成
  const [analyzeStatus, setAnalyzeStatus] = React.useState("idle");
  const [analysisData, setAnalysisData] = React.useState(null); // null or {moves, blunder_count, mistake_count}
  const [progress, setProgress] = React.useState({ analyzed: 0, total: 0 });
  const pollRef = React.useRef(null);
  const pendingAutoAnalyze = React.useRef(null); // 来自对弈跳转、需自动拉取分析的棋局 id
  const [packError, setPackError] = React.useState("");
  const selectedRef = React.useRef(selectedId);
  const selectionEpoch = React.useRef(0);
  if (selectedRef.current !== selectedId) selectionEpoch.current++;
  selectedRef.current = selectedId;
  const analysisEpoch = React.useRef(0);
  const listEpoch = React.useRef(0);
  React.useEffect(() => () => { selectedRef.current = null; analysisEpoch.current++; listEpoch.current++; }, []);

  async function trainKeyProblems() {
    if (!selectedId) return;
    const id = selectedId;
    const session = selectionEpoch.current;
    try {
      setPackError("");
      const pack = await createGameTrainingPack(selectedId);
      if (selectedRef.current !== id || selectionEpoch.current !== session) return;
      onStartPack?.(pack);
    } catch (e) {
      if (selectedRef.current === id && selectionEpoch.current === session) setPackError(e.message || "训练包生成失败");
    }
  }

  // 轮询分析进度，完成后落地结果（不重复触发分析）
  const startPolling = React.useCallback((id) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setAnalyzeStatus("analyzing");
    const epoch = ++analysisEpoch.current;
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const result = await getAnalysis(id);
        if (selectedRef.current !== id || analysisEpoch.current !== epoch) return;
        if (result.total != null) {
          setProgress({ analyzed: result.analyzed || 0, total: result.total });
        }
        if (result.status === "done") {
          clearInterval(timer);
          pollRef.current = null;
          setAnalyzeStatus("done");
          setAnalysisData(result);
          onCreditsChanged?.(); // 分析期间的大模型点评使用独立 AI 额度
        }
      } catch {
        // keep polling
      } finally {
        busy = false;
      }
    }, 1000);
    pollRef.current = timer;
  }, [onCreditsChanged]);

  // Load games list
  const loadGames = React.useCallback((append = false, offset = 0) => {
    const epoch = ++listEpoch.current;
    setLoading(true);
    setListError("");
    getGames(50, append ? offset : 0)
      .then((data) => {
        if (epoch !== listEpoch.current) return;
        const next = Array.isArray(data) ? data : data.games || [];
        setHasMore(next.length === 50);
        setGames((previous) => append ? [...new Map([...previous, ...next].map((game) => [game.id, game])).values()] : next);
      })
      .catch((error) => { if (epoch === listEpoch.current) setListError(error.message || "棋谱加载失败，请重试"); })
      .finally(() => { if (epoch === listEpoch.current) setLoading(false); });
  }, []);

  React.useEffect(() => {
    loadGames();
  }, [loadGames]);

  // 从对弈结束「一键复盘」跳转而来：自动选中该局并拉取（已在后台进行的）分析
  React.useEffect(() => {
    if (initialGameId) {
      pendingAutoAnalyze.current = initialGameId;
      setSelectedId(initialGameId);
      loadGames(); // 刷新列表以纳入刚结束的对局
      onInitialGameConsumed?.();
    }
  }, [initialGameId, loadGames, onInitialGameConsumed]);

  // Load positions when a game is selected
  React.useEffect(() => {
    let alive = true;
    setPositions(null);
    setPositionError("");
    if (!selectedId) {
      setStepIndex(0);
      setPosLoading(false);
      return;
    }
    setPosLoading(true);
    getGamePositions(selectedId)
      .then((data) => {
        if (!alive) return;
        setPositions(data);
        setStepIndex(0);
      })
      .catch((error) => { if (alive) setPositionError(error.message || "棋谱加载失败，请重试"); })
      .finally(() => { if (alive) setPosLoading(false); });
    return () => { alive = false; };
  }, [selectedId, reload]);

  // 切换棋局：重置状态后检查数据库里已保存的分析，有则直接加载，避免重复分析
  React.useEffect(() => {
    setAnalyzeStatus("idle");
    analysisEpoch.current++;
    setAnalysisError("");
    setPackError("");
    setAnalysisData(null);
    setProgress({ analyzed: 0, total: 0 });
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!selectedId) return;
    // 若该局是从对弈跳转而来，分析已在后台进行，直接轮询进度
    if (pendingAutoAnalyze.current === selectedId) {
      pendingAutoAnalyze.current = null;
      startPolling(selectedId);
      return;
    }
    let alive = true;
    const epoch = analysisEpoch.current;
    getAnalysis(selectedId)
      .then((result) => {
        if (!alive || epoch !== analysisEpoch.current) return;
        if (result.status === "done") {
          setAnalyzeStatus("done");
          setAnalysisData(result);
          setProgress({ analyzed: result.analyzed || 0, total: result.total || 0 });
        } else if (result.analyzed > 0) {
          // 有部分历史分析（可能中途中断）：先展示已有结果，按钮变为「继续分析」
          setAnalyzeStatus("partial");
          setAnalysisData(result);
          setProgress({ analyzed: result.analyzed || 0, total: result.total || 0 });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [selectedId, startPolling]);

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Keyboard navigation
  React.useEffect(() => {
    function onKey(e) {
      if (!positions) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) || e.target.isContentEditable || document.querySelector("dialog[open]")) return;
      const total = positions.positions ? positions.positions.length : 0;
      if (e.key === "ArrowLeft") {
        setStepIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        setStepIndex((i) => Math.min(Math.max(0, total - 1), i + 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [positions]);

  // Scroll current move into view
  React.useEffect(() => {
    scrollCurrentMove(moveListRef.current, mobile);
  }, [stepIndex, mobile]);

  const positionsList = positions?.positions || [];
  // 后端 moves 字段是空格分隔字符串；着法直接取自每一步局面（move_index≥1 带 UCI），与 fen 天然对齐
  const movesList = positionsList.slice(1).map((p) => p.move);
  const currentPos = positionsList[stepIndex] || null;
  const currentFen = currentPos?.fen || "";
  // lastMove is the move that led to current position
  const lastMove = stepIndex > 0 ? movesList[stepIndex - 1] : null;

  // 把 UCI 着法转成中文棋谱（用走子前的局面 positionsList[i] 解析）
  const moveTexts = React.useMemo(
    () =>
      positionsList
        .slice(1)
        .map((p, i) =>
          positions?.variant === "jieqi"
            ? jieqiMoveToChinese(positionsList[i]?.fen, p.move)
            : positionsList[i]?.fen ? uciToChinese(positionsList[i].fen, p.move) : p.move
        ),
    [positionsList, positions?.variant]
  );

  // Group moves into rounds (pair of moves)
  const rounds = [];
  for (let i = 0; i < movesList.length; i += 2) {
    rounds.push({ round: Math.floor(i / 2) + 1, red: i, black: i + 1 });
  }

  // Build analysis map: move_index -> move data
  const analysisMap = React.useMemo(() => {
    if (!analysisData || !analysisData.moves) return {};
    const map = {};
    for (const m of analysisData.moves) {
      map[m.move_index] = m;
    }
    return map;
  }, [analysisData]);

  // Current analysis detail: stepIndex corresponds to move at index stepIndex-1
  const currentMoveAnalysis = stepIndex > 0 ? analysisMap[stepIndex - 1] : null;

  function handleSelectGame(id) {
    setPositions(null);
    setStepIndex(0);
    setPosLoading(id !== selectedId);
    setSelectedId(id === selectedId ? null : id);
  }

  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleImport(e) {
    e.preventDefault();
    if (!form.moves.trim()) {
      setImportError("着法序列不能为空");
      return;
    }
    setImporting(true);
    setImportError("");
    try {
      await importGame({
        moves: form.moves.trim(),
        red_player: form.red_player,
        black_player: form.black_player,
        played_on: form.date,
        result: form.result,
        opening: form.opening,
      });
      setForm(EMPTY_FORM);
      setShowImport(false);
      loadGames();
    } catch {
      setImportError("导入失败，请检查格式");
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!window.confirm("确认删除这局棋局？")) return;
    try { await deleteGame(id); } catch (error) { setListError(error.message || "删除失败，请稍后重试"); return; }
    if (selectedRef.current === id) setSelectedId(null);
    loadGames();
  }

  async function handleAnalyze() {
    if (!selectedId || analyzeStatus === "analyzing") return;
    if (!user) {
      onRequireLogin?.();
      return;
    }
    setProgress({ analyzed: 0, total: 0 });
    const id = selectedId;
    const session = selectionEpoch.current;
    analysisEpoch.current++;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setAnalyzeStatus("analyzing");
    setAnalysisError("");
    try {
      await analyzeGame(selectedId);
    } catch (e) {
      if (selectedRef.current !== id || selectionEpoch.current !== session) return;
      if (e.status === 401) {
        onRequireLogin?.();
        setAnalyzeStatus("idle");
        return;
      }
      if (e.status !== 409) { setAnalysisError(e.message || "分析启动失败，请稍后重试"); setAnalyzeStatus("idle"); return; }
    }
    if (selectedRef.current !== id || selectionEpoch.current !== session) return;
    onCreditsChanged?.(); // 分析按独立 AI 额度生成模型点评
    startPolling(selectedId);
  }

  const filteredGames = mobile && query.trim() ? games.filter((game) => [game.red_player, game.black_player, game.opening, game.played_on, game.source, game.result].some((value) => String(value || "").toLowerCase().includes(query.trim().toLowerCase()))) : games;
  const analysisButtonLabel = analyzeStatus === "analyzing" ? "分析中…" : analyzeStatus === "done" ? "重新分析" : analyzeStatus === "partial" ? "继续分析" : "分析此局";
  const moveNavigation = <>
              <div className="review-moves-list" ref={setMoveListRef}>
                {rounds.map(({ round, red, black }) => (
                  <div key={round} className="move-round">
                    <span className="move-round-num">{round}.</span>
                    <MoveItem
                      moveIndex={red}
                      moveText={moveTexts[red] || ""}
                      isActive={stepIndex === red + 1}
                      analysisEntry={analysisMap[red]}
                      onClick={() => setStepIndex(red + 1)}
                    />
                    {movesList[black] !== undefined && (
                      <MoveItem
                        moveIndex={black}
                        moveText={moveTexts[black]}
                        isActive={stepIndex === black + 1}
                        analysisEntry={analysisMap[black]}
                        onClick={() => setStepIndex(black + 1)}
                      />
                    )}
                  </div>
                ))}
              </div>

  </>;
  const reviewChart = <>
              {(analyzeStatus === "done" || analyzeStatus === "partial") && analysisData?.moves?.length > 1 && (
                <EvaluationChart moves={analysisData.moves} activeStep={stepIndex} onSelect={setStepIndex} />
              )}

  </>;
  const reviewReport = <>
    {mobile && analysisData?.moves?.some((move) => move.is_blunder || move.is_mistake) && <div className="review-mistake-jumps" aria-label="失误定位">{analysisData.moves.filter((move) => move.is_blunder || move.is_mistake).map((move) => <button key={move.move_index} onClick={() => setStepIndex(Math.min(positionsList.length - 1, move.move_index + 1))}>第 {move.move_index + 1} 步 · {move.is_blunder ? "严重失误" : "失误"}</button>)}</div>}
              {/* 综合复盘报告（LLM 生成，未配置时自动省略） */}
              {analyzeStatus === "done" && analysisData?.report && (
                <div className="analysis-panel">
                  <div className="review-moves-title">📋 综合复盘报告</div>
                  <div
                    className="analysis-explanation"
                    style={{ whiteSpace: "pre-wrap", marginTop: 6 }}
                  >
                    {analysisData.report}
                  </div>
                </div>
              )}

              {/* AI 复盘未启用时给出提示，避免「无报告」让人以为功能缺失 */}
              {analyzeStatus === "done" && !analysisData?.report && analysisData?.llm_enabled === false && (
                <div className="analysis-panel">
                  <div className="muted" style={{ fontSize: 13 }}>
                    💡 已完成引擎逐步分析。开启「AI 复盘」后还能获得失误讲解与整局总评（管理员可在后台配置）。
                  </div>
                </div>
              )}

              {/* 历史分析未完成（中途中断）时的提示 */}
              {analyzeStatus === "partial" && (
                <div className="analysis-panel">
                  <div className="muted" style={{ fontSize: 13 }}>
                    本局有一次未完成的分析（{progress.analyzed}/{progress.total} 步），
                    已展示现有结果；点「继续分析」可完成剩余着法。
                  </div>
                </div>
              )}

              {/* Analysis detail panel */}
              {(analyzeStatus === "done" || analyzeStatus === "partial") && analysisData && (
                <AnalysisPanel
                  variant={positions?.variant}
                  summary={{ blunder_count: analysisData.blunder_count, mistake_count: analysisData.mistake_count }}
                  moveAnalysis={currentMoveAnalysis}
                  stepIndex={stepIndex}
                  preFen={stepIndex > 0 ? positionsList[stepIndex - 1]?.fen : ""}
                  onNavigateToTrain={onNavigateToTrain}
                />
              )}
              {analyzeStatus === "done" && (analysisData?.blunder_count > 0 || analysisData?.mistake_count > 0) && (
                <div className="analysis-panel key-problems-cta">
                  <div><strong>把复盘变成训练</strong><p className="muted">按失分排序，重走本局最值得修正的 3 个决策。</p></div>
                  <button onClick={trainKeyProblems}>训练本局 3 个关键问题 →</button>
                  {packError && <small className="error">{packError}</small>}
                </div>
              )}
    {mobile && !analysisData && analyzeStatus !== "analyzing" && <p className="muted">逐步回放不消耗 AI 额度；登录后可分析整局，查看评分与失误讲解。</p>}
  </>;
  const renderMobileAnalysis = (closePanel) => <>
    <button className="btn-analyze" disabled={analyzeStatus === "analyzing" || !positions || !movesList.length} onClick={() => { if (!user) closePanel(); handleAnalyze(); }}>{analysisButtonLabel}</button>{analyzeStatus === "analyzing" && <p role="status">{progress.total ? `已分析 ${progress.analyzed} / ${progress.total} 步` : "正在准备分析…"}</p>}
    {analysisError && <p className="import-error" role="alert">{analysisError}</p>}
    {reviewChart}
    {reviewReport}
  </>;
  if (mobile && selectedId) return <MobileGameReview
    game={{ ...(games.find((game) => game.id === selectedId) || { id: selectedId }), ...(positions || {}) }}
    fen={currentFen} lastMove={lastMove} loading={posLoading} error={positionError} onRetry={() => setReload((value) => value + 1)}
    step={stepIndex} total={Math.max(0, positionsList.length - 1)} onStep={setStepIndex} onBack={() => setSelectedId(null)}
    history={moveNavigation} renderAnalysis={renderMobileAnalysis}
    menu={<><button onClick={(event) => handleDelete(event, selectedId)}>删除本局棋谱</button>{listError && <p role="alert">{listError}</p>}</>}
  />;

  return (
    <div className={`games-layout${mobile ? " mobile-games-list" : ""}`}>
      {/* Left: game list */}
      <div className="games-list-panel">
        <div className="games-list-header">
          <span className="games-list-title">棋局列表</span>
          {loading && <span className="muted"> 加载中…</span>}
        </div>

        {mobile && <div className="mobile-games-search"><input type="search" aria-label="搜索棋谱" placeholder="搜索棋手、开局或日期" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{filteredGames.length} 局{hasMore ? " · 可加载更多" : ""}</span></div>}

        <div className="games-list-scroll">
          {filteredGames.length === 0 && !loading && !listError && (
            <div className="muted" style={{ padding: "12px" }}>
              {query ? "未找到匹配棋谱，请更换关键词或加载更多" : "暂无棋局，请导入或完成一盘对弈"}
            </div>
          )}
          {filteredGames.map((g) => {
            const rl = resultLabel(g.result);
            const isSelected = g.id === selectedId;
            return (
              <div
                key={g.id}
                className={"game-item" + (isSelected ? " selected" : "")}
                role="button" tabIndex={0}
                onKeyDown={(event) => { if (event.target === event.currentTarget && ["Enter", " "].includes(event.key)) { event.preventDefault(); handleSelectGame(g.id); } }}
                onClick={() => handleSelectGame(g.id)}
              >
                {mobile && <div className="mobile-game-card-head"><span>{g.variant === "jieqi" ? "揭棋" : "象棋"} · {g.source || "棋谱"}</span><time>{g.played_on || "日期未记录"}</time></div>}
                <div className="game-item-players">
                  <span className="game-red">{g.red_player || "红方"}</span>
                  <span className="game-vs"> vs </span>
                  <span className="game-black">{g.black_player || "黑方"}</span>
                </div>
                <div className="game-item-meta">
                  <span className="game-date muted">{mobile ? `${Math.ceil((g.move_count || 0) / 2)} 回合${g.opening ? ` · ${g.opening}` : ""}` : g.played_on || ""}</span>
                  <span
                    className="game-result-tag"
                    style={{ color: rl.color, borderColor: rl.color }}
                  >
                    {rl.text}
                  </span>
                  <button
                    className="game-delete-btn"
                    title="删除"
                    onClick={(e) => handleDelete(e, g.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {listError && <p className="import-error" role="alert">{listError}<button className="btn-link" onClick={() => loadGames()}>重试</button></p>}
        {hasMore && <button className="btn-link mobile-games-more" disabled={loading} onClick={() => loadGames(true, games.length)}>{loading ? "加载中…" : "加载更多棋谱"}</button>}

        {/* Import button */}
        <div className="games-list-footer">
          <button
            className="btn-import"
            onClick={() => setShowImport((v) => !v)}
          >
            {showImport ? "▲ 收起" : "＋ 导入棋局"}
          </button>
        </div>

        {/* Import form */}
        {showImport && (
          <form className="import-form" onSubmit={handleImport}>
            <label className="import-label">
              着法序列（UCI格式，必填）
              <textarea
                name="moves"
                value={form.moves}
                onChange={handleFormChange}
                placeholder="h2e2 h9g7 e2e6 ..."
                rows={3}
                className="import-textarea"
              />
            </label>
            <div className="import-row">
              <label className="import-label half">
                红方
                <input
                  name="red_player"
                  value={form.red_player}
                  onChange={handleFormChange}
                  className="import-input"
                  placeholder="红方姓名"
                />
              </label>
              <label className="import-label half">
                黑方
                <input
                  name="black_player"
                  value={form.black_player}
                  onChange={handleFormChange}
                  className="import-input"
                  placeholder="黑方姓名"
                />
              </label>
            </div>
            <div className="import-row">
              <label className="import-label half">
                日期
                <input
                  name="date"
                  type="date"
                  value={form.date}
                  onChange={handleFormChange}
                  className="import-input"
                />
              </label>
              <label className="import-label half">
                结果
                <select
                  name="result"
                  value={form.result}
                  onChange={handleFormChange}
                  className="import-input"
                >
                  <option value="1-0">红胜</option>
                  <option value="0-1">黑胜</option>
                  <option value="1/2-1/2">和棋</option>
                </select>
              </label>
            </div>
            <label className="import-label">
              开局名
              <input
                name="opening"
                value={form.opening}
                onChange={handleFormChange}
                className="import-input"
                placeholder="如：中炮对屏风马"
              />
            </label>
            {importError && (
              <div className="import-error">{importError}</div>
            )}
            <button
              type="submit"
              className="btn-import-submit"
              disabled={importing}
            >
              {importing ? "导入中…" : "确认导入"}
            </button>
          </form>
        )}
      </div>

      {/* Right: review area */}
      <div className="games-review-panel">
        {!selectedId ? (
          <div className="games-empty">
            <span>请从左侧选择一局棋局</span>
          </div>
        ) : posLoading ? (
          <div className="games-empty">
            <span className="muted">加载中…</span>
          </div>
        ) : !positions ? (
          <div className="games-empty">
            <span className="muted">加载失败</span>
          </div>
        ) : (
          <div className="review-content">
            {/* Board */}
            <div className="review-board-wrap">
              {/* Analyze button row */}
              <div className="review-meta-row">
                <button
                  className={"btn-analyze" + (analyzeStatus === "analyzing" ? " analyzing" : "")}
                  onClick={handleAnalyze}
                  disabled={analyzeStatus === "analyzing"}
                >
                  {analyzeStatus === "analyzing"
                    ? "分析中…"
                    : analyzeStatus === "done"
                    ? "重新分析"
                    : analyzeStatus === "partial"
                    ? "继续分析"
                    : "分析此局"}
                </button>
                {positions.variant === "jieqi" && <span className="tag">揭棋棋谱</span>}
                {analyzeStatus === "done" && (
                  <span className="tag" style={{ background: "var(--app-success-soft, #e6efe0)", color: "var(--app-success, #2e7d32)" }}>
                    ✓ 已分析（结果已保存）
                  </span>
                )}
                {analyzeStatus === "analyzing" && (
                  <div className="analyze-progress">
                    <div className="analyze-progress-track">
                      <div
                        className="analyze-progress-fill"
                        style={{
                          width: progress.total
                            ? `${Math.round((progress.analyzed / progress.total) * 100)}%`
                            : "0%",
                        }}
                      />
                    </div>
                    <span className="analyze-progress-text muted">
                      {progress.total ? `${progress.analyzed}/${progress.total}` : "准备中…"}
                    </span>
                  </div>
                )}
              </div>

              {currentFen ? (
                <Board
                  fen={currentFen}
                  onMove={() => {}}
                  lastMove={lastMove}
                  disabled={true}
                  parsePosition={positions.variant === "jieqi" ? parseJieqiBoard : undefined}
                />
              ) : (
                <div className="muted">无棋盘数据</div>
              )}
              {/* Nav buttons */}
              <div className="review-nav btn-row">
                <button
                  className="btn-retry"
                  onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                  disabled={stepIndex === 0}
                >
                  ◀ 上一步
                </button>
                <span className="review-step-counter muted">
                  {stepIndex}/{positionsList.length - 1}
                </span>
                <button
                  className="btn-retry"
                  onClick={() =>
                    setStepIndex((i) =>
                      Math.min(positionsList.length - 1, i + 1)
                    )
                  }
                  disabled={stepIndex === positionsList.length - 1}
                >
                  下一步 ▶
                </button>
              </div>
            </div>

            {/* Move list */}
            <div className="review-moves-wrap">
              {analysisError && <p className="import-error" role="alert">{analysisError}</p>}
              {reviewChart}
              <div className="review-moves-title">着法列表</div>
              {moveNavigation}
              {reviewReport}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
