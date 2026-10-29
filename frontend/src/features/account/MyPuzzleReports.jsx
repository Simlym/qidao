import React from "react";
import { myPuzzleReports } from "../../shared/api";
import { REPORT_TYPES } from "../training/PuzzleFeedback";

const STATUS = { open:"待处理",resolved:"已处理",dismissed:"未采纳" };

export default function MyPuzzleReports({ user,onRequireLogin }) {
  const [data,setData] = React.useState({ total:0,items:[] });
  const [offset,setOffset] = React.useState(0);
  const [error,setError] = React.useState("");
  const [version,setVersion] = React.useState(0);
  React.useEffect(() => {
    if(!user) return;
    let active=true;
    setError("");
    myPuzzleReports({ offset,limit:20 }).then(r => active && setData(r)).catch(e => active && setError(e.message));
    return () => { active=false; };
  },[user?.username,offset,version]);
  return <section className="settings-group puzzle-feedback"><h2>我的题目反馈</h2><p className="muted">在训练页提交问题后，可以在这里查看管理员回复。</p>
    {!user ? <button onClick={onRequireLogin}>登录查看反馈</button> : <>
      <button className="btn-link" onClick={() => setVersion(v => v+1)}>刷新处理结果</button>
      {error && <p className="import-error" role="alert">{error}</p>}
      {data.items.map(r => <div className="puzzle-batch" key={r.id}><strong>题目 #{r.puzzle_id} · {STATUS[r.status]}</strong><p>{REPORT_TYPES[r.category]}：{r.description}</p>{r.proposed_solution && <p>我的建议：{r.proposed_solution}</p>}{r.resolution_note && <p>管理员回复：{r.resolution_note}</p>}<small className="muted">提交于 {r.created_at.slice(0,10)}</small></div>)}
      {!data.items.length && !error && <p className="muted">暂无题目反馈</p>}
      <div className="puzzle-actions"><button className="btn-link" disabled={!offset} onClick={() => setOffset(o => Math.max(0,o-20))}>上一页反馈</button><span>共 {data.total} 条</span><button className="btn-link" disabled={offset+20>=data.total} onClick={() => setOffset(o => o+20)}>下一页反馈</button></div>
    </>}
  </section>;
}
