import React from "react";
import Board from "../../shared/ui/Board";
import { applyMove } from "../../domain/xiangqi/xiangqi";
import { adminPuzzleReports, adminResolvePuzzleReport, adminPuzzleVersions, adminPuzzleReviews, adminReviewPuzzle, adminRevisePuzzle, adminSetPuzzleStatus } from "../../shared/api";
import { REPORT_TYPES } from "../training/PuzzleFeedback";

const REVIEW_STATUS = { pending:"待审核", approved:"人工审核通过", needs_changes:"需要修改" };
const REPORT_STATUS = { open:"待处理", resolved:"已处理", dismissed:"未采纳" };

export function PuzzleReportQueue({ onReview }) {
  const [status, setStatus] = React.useState("open");
  const [offset, setOffset] = React.useState(0);
  const [data, setData] = React.useState({ total:0,open_count:0,items:[] });
  const [error, setError] = React.useState("");
  const [version, setVersion] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    adminPuzzleReports({ status,offset,limit:20 }).then(r => active && setData(r)).catch(e => active && setError(e.message));
    return () => { active = false; };
  }, [status,offset,version]);
  return <section className="puzzle-import"><h4>题目反馈（待处理 {data.open_count}）</h4>
    <label>反馈状态<select aria-label="反馈状态" className="import-input" value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}><option value="open">待处理</option><option value="resolved">已处理</option><option value="dismissed">未采纳</option><option value="">全部</option></select></label>
    {error && <p className="import-error" role="alert">{error}</p>}
    {data.items.map(r => <ReportCard key={r.id} report={r} onReview={onReview} onResolved={() => setVersion(v => v+1)} />)}
    {!data.items.length && <p className="muted">暂无此类反馈</p>}
    <div className="puzzle-actions"><button className="btn-link" disabled={!offset} onClick={() => setOffset(o => Math.max(0,o-20))}>反馈上一页</button><span>共 {data.total} 条</span><button className="btn-link" disabled={offset+20>=data.total} onClick={() => setOffset(o => o+20)}>反馈下一页</button></div>
  </section>;
}

function ReportCard({ report:r, onReview, onResolved }) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  async function resolve(status) {
    setBusy(true); setError("");
    try { await adminResolvePuzzleReport(r.id,{ status,note:note.trim() }); onResolved(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="puzzle-batch"><strong>题目 #{r.puzzle_id} · {REPORT_TYPES[r.category]} · {REPORT_STATUS[r.status]}</strong>
    <p className="muted">反馈人：{r.reporter || "已注销用户"} · {r.created_at.slice(0,10)}</p><p>{r.description}</p>
    {r.proposed_solution && <p className="puzzle-source">用户建议：{r.proposed_solution}</p>}
    <button className="btn-link" disabled={busy} onClick={() => onReview(r.puzzle_id)}>审核此题</button>
    {r.status === "open" ? <><label>给反馈用户的回复<textarea aria-label={`处理说明 ${r.id}`} className="import-input" minLength={4} maxLength={1000} value={note} disabled={busy} onChange={e => setNote(e.target.value)} /></label><div className="puzzle-actions"><button className="btn-link" disabled={busy || note.trim().length<4} onClick={() => resolve("resolved")}>标为已处理</button><button className="btn-link" disabled={busy || note.trim().length<4} onClick={() => resolve("dismissed")}>说明后不采纳</button></div></> : <p>处理结果：{r.resolution_note}</p>}
    {error && <p className="import-error" role="alert">{error}</p>}
  </div>;
}

export default function PuzzleReview({ puzzle, onUpdated, onOpenVersion }) {
  const [versions, setVersions] = React.useState([]);
  const [reviews, setReviews] = React.useState([]);
  const [branch, setBranch] = React.useState(0);
  const [step, setStep] = React.useState(0);
  const [note, setNote] = React.useState("");
  const [revising, setRevising] = React.useState(false);
  const [revision, setRevision] = React.useState({ fen:puzzle.fen, solution:puzzle.solution, side_to_move:puzzle.side_to_move, kind:puzzle.kind, category:puzzle.category, difficulty:puzzle.difficulty, tags:puzzle.tags, reason:"" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const key = React.useRef(null);
  React.useEffect(() => {
    let active = true;
    Promise.all([adminPuzzleVersions(puzzle.id),adminPuzzleReviews(puzzle.id)]).then(([v,r]) => { if(active) { setVersions(v); setReviews(r); } }).catch(e => active && setError(e.message));
    return () => { active = false; };
  }, [puzzle.id,puzzle.content_sha256,puzzle.review_status]);
  const branches = puzzle.solution.split("|").map(s => s.split(",").filter(Boolean));
  const line = branches[branch] || [];
  let fen = puzzle.fen;
  try { for (const move of line.slice(0,step)) fen = applyMove(fen,move); } catch { fen = puzzle.fen; }
  async function run(task,success) {
    setBusy(true); setError(""); setMessage("");
    try { const result = await task(); setMessage(success); return result; }
    catch (e) { setError(e.message); return null; }
    finally { setBusy(false); }
  }
  async function review(verdict) {
    if (key.current?.verdict !== verdict) key.current = { verdict, value:crypto.randomUUID() };
    const result = await run(() => adminReviewPuzzle(puzzle.id,{ verdict,note:note.trim(),expected_sha256:puzzle.content_sha256 },key.current.value),"人工审核已记录");
    if (result) { key.current = null; onUpdated(); }
  }
  async function create(e) {
    e.preventDefault();
    const result = await run(() => adminRevisePuzzle(puzzle.id,{ ...revision,difficulty:Number(revision.difficulty),expected_sha256:puzzle.content_sha256 }),"已创建待审核修订版");
    if(result) onOpenVersion(result.id);
  }
  const latest = !versions.length || versions.at(-1).id === puzzle.id;
  return <section className="puzzle-review"><h4>多解核对与人工审核 · v{puzzle.revision_number || 1}</h4>
    <p>{REVIEW_STATUS[puzzle.review_status || "pending"]}</p><p className="muted">逐步核对题解、用户建议和对手应手。人工审核不等于引擎唯一解证明；只记录已确认的依据。</p>
    <label>查看分支<select aria-label="查看分支" className="import-input" value={branch} onChange={e => { setBranch(Number(e.target.value)); setStep(0); }}>{branches.map((_,i) => <option key={i} value={i}>分支 {i+1}</option>)}</select></label>
    <div className="puzzle-board"><Board fen={fen} disabled lastMove={step ? line[step-1] : null} /></div>
    <div className="puzzle-actions"><button className="btn-link" disabled={!step} onClick={() => setStep(s => s-1)}>上一步着法</button><span>第 {step} / {line.length} 手</span><button className="btn-link" disabled={step>=line.length} onClick={() => setStep(s => s+1)}>下一步着法</button></div>
    <p className="puzzle-source">{line.join(" → ")}</p>
    <label>审核依据<textarea aria-label="审核依据" className="import-input" maxLength={1000} value={note} disabled={busy} placeholder="说明已核对的分支、对手应手和结论" onChange={e => { setNote(e.target.value); key.current = null; }} /></label>
    <div className="puzzle-actions"><button className="btn-link" disabled={busy || note.trim().length<4} onClick={() => review("approved")}>记录审核通过</button><button className="btn-link" disabled={busy || note.trim().length<4} onClick={() => review("needs_changes")}>要求修改并下架</button>
      {latest && puzzle.status !== "published" && <button className="btn-link" disabled={busy || (puzzle.revision_of_id && puzzle.review_status !== "approved")} onClick={async () => { const result = await run(() => adminSetPuzzleStatus({ ids:[puzzle.id],status:"published" }),"本版本已发布，旧版本已下架"); if(result) onUpdated(); }}>发布此版本</button>}
    </div>
    {error && <p className="import-error" role="alert">{error}</p>}{message && <p className="puzzle-success" role="status">{message}</p>}
    <details><summary>审核记录（最近 50 条）</summary>{reviews.map(r => <p key={r.id}>{r.actor} · {r.created_at.slice(0,10)} · {REVIEW_STATUS[r.verdict]}{!r.current && "（旧内容）"}<br />{r.note}</p>)}{!reviews.length && <p className="muted">尚无人工审核记录</p>}</details>
    <details><summary>版本历史</summary>{versions.map(v => <div className="puzzle-batch" key={v.id}><button className="btn-link" disabled={busy || v.id === puzzle.id} onClick={() => onOpenVersion(v.id)}>v{v.revision_number} · 题目 #{v.id} · {v.status === "published" ? "已发布" : v.status === "draft" ? "待审核" : "已下架"}</button>{v.revision_note && <p>{v.revision_actor}：{v.revision_note}</p>}</div>)}</details>
    {latest && <button className="btn-link" disabled={busy} onClick={() => setRevising(v => !v)}>{revising ? "收起修订" : "创建修订版"}</button>}
    {revising && latest && <form onSubmit={create}><p className="muted">原题与学习记录保留。新版先待审核，审核通过并发布后才替换原版。多解用 | 分隔。</p><fieldset disabled={busy}>
      {[["fen","修订 FEN",120],["solution","修订题解",2000],["category","修订分类",40],["tags","修订标签",1000],["reason","修订原因",500]].map(([k,label,max]) => <label key={k}>{label}<textarea aria-label={label} className="import-input" required={k !== "tags"} minLength={k === "reason" ? 4 : 1} maxLength={max} value={revision[k]} onChange={e => setRevision(r => ({ ...r,[k]:e.target.value }))} /></label>)}
      <label>修订大类<select aria-label="修订大类" className="import-input" value={revision.kind} onChange={e => setRevision(r => ({ ...r,kind:e.target.value }))}>{["杀法","开局","中局","残局"].map(k => <option key={k}>{k}</option>)}</select></label>
      <label>修订走子方<select aria-label="修订走子方" className="import-input" value={revision.side_to_move} onChange={e => setRevision(r => ({ ...r,side_to_move:e.target.value }))}><option value="w">红方</option><option value="b">黑方</option></select></label>
      <label>修订难度<select aria-label="修订难度" className="import-input" value={revision.difficulty} onChange={e => setRevision(r => ({ ...r,difficulty:e.target.value }))}>{[1,2,3,4,5].map(k => <option key={k} value={k}>{k}</option>)}</select></label>
      <button className="btn-import-submit" type="submit">保存为待审核新版</button>
    </fieldset></form>}
  </section>;
}
