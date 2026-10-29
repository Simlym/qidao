import React from "react";
import { reportPuzzle, myPuzzleReports } from "../../shared/api";

export const REPORT_TYPES = { wrong_solution: "答案或应手有误", alternative: "有其他可行解", position: "局面有误", difficulty: "难度或分类不合适", other: "其他问题" };
const STATUS = { open: "待处理", resolved: "已处理", dismissed: "未采纳" };

export default function PuzzleFeedback({ puzzle, user, onRequireLogin }) {
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState("wrong_solution");
  const [description, setDescription] = React.useState("");
  const [proposal, setProposal] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [history, setHistory] = React.useState(null);
  const key = React.useRef(null);
  function change(set, value) { set(value); key.current = null; setMessage(""); }
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    key.current ||= crypto.randomUUID();
    try {
      const result = await reportPuzzle(puzzle.id, { category, description:description.trim(), proposed_solution:proposal.trim() }, key.current);
      setMessage(result.reused ? (result.status === "open" ? "已有这类反馈，请等待处理；可在我的反馈中查看结果。" : "这条反馈已处理，可在我的反馈中查看回复。") : "反馈已提交，管理员处理后可在这里查看回复。");
      key.current = null;
    } catch (e2) { setError(e2.message); }
    finally { setBusy(false); }
  }
  async function loadHistory() {
    setBusy(true); setError("");
    try { setHistory(await myPuzzleReports()); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="puzzle-feedback">
    <button className="btn-link" onClick={() => user ? setOpen(v => !v) : onRequireLogin?.()}>{open ? "收起题目反馈" : "题目有问题？反馈"}</button>
    {open && <div>
      <p className="muted">题目 #{puzzle.id}。请描述走法或具体局面；反馈不影响本次训练成绩。</p>
      <form onSubmit={submit}><fieldset disabled={busy}>
        <label>问题类型<select aria-label="问题类型" className="import-input" value={category} onChange={e => change(setCategory,e.target.value)}>{Object.entries(REPORT_TYPES).map(([k,n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>问题说明<textarea className="import-input" required minLength={4} maxLength={1000} value={description} onChange={e => change(setDescription,e.target.value)} /></label>
        <label>建议着法（选填）<textarea className="import-input" maxLength={2000} value={proposal} placeholder="例如 a8a9，或用中文描述另一种走法" onChange={e => change(setProposal,e.target.value)} /></label>
        <button className="btn-import-submit" type="submit">{busy ? "提交中…" : "提交题目反馈"}</button>
      </fieldset></form>
      {error && <p className="import-error" role="alert">{error}</p>}
      {message && <p className="puzzle-success" role="status">{message}</p>}
      <button className="btn-link" disabled={busy} onClick={loadHistory}>查看我的反馈</button>
      {history && <div><p className="muted">我的反馈共 {history.total} 条，显示最近 20 条。</p>{history.items.map(r => <div className="puzzle-batch" key={r.id}><strong>题目 #{r.puzzle_id} · {STATUS[r.status]}</strong><p>{REPORT_TYPES[r.category]}：{r.description}</p>{r.resolution_note && <p>管理员回复：{r.resolution_note}</p>}</div>)}{!history.items.length && <p>暂无反馈记录</p>}</div>}
    </div>}
  </div>;
}
