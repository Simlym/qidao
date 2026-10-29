import React from "react";
import PuzzleReview, { PuzzleReportQueue } from "./PuzzleReview";
import {
  adminPuzzles, adminCreatePuzzle, adminPuzzleSources, adminPuzzleBatches,
  adminPreviewPuzzles, adminConfirmPuzzles, adminSetPuzzleStatus, adminEditPuzzle, adminExportPuzzles, adminPuzzleDetail,
} from "../../shared/api";

const PAGE = 20;
const STATUS = { draft: "待审核", published: "已发布", archived: "已下架" };
const INITIAL = { q: "", category: "", difficulty: "", kind: "", status: "", verified: "", batch_id: "" };
const EMPTY = { fen: "", solution: "", side_to_move: "w", kind: "杀法", category: "未分类", difficulty: 3, tags: "", source: "admin" };

async function downloadPuzzles(filters) {
  const data = await adminExportPuzzles(filters);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "xiangqidao-puzzles.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PuzzleLibrary() {
  const [filters, setFilters] = React.useState(INITIAL);
  const [offset, setOffset] = React.useState(0);
  const [data, setData] = React.useState({ total: 0, categories: [], items: [] });
  const [selected, setSelected] = React.useState([]);
  const [batches, setBatches] = React.useState([]);
  const [batchOffset, setBatchOffset] = React.useState(0);
  const [showReports, setShowReports] = React.useState(false);
  const [showImports, setShowImports] = React.useState(false);
  const [editor, setEditor] = React.useState(null);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [version, setVersion] = React.useState(0);
  const refresh = () => setVersion(v => v + 1);
  React.useEffect(() => {
    let active = true;
    setSelected([]);
    const timer = setTimeout(() => {
      adminPuzzles({ ...filters, limit: PAGE, offset }).then(result => {
        if (!active) return;
        if (offset > 0 && offset >= result.total) setOffset(Math.max(0, Math.ceil(result.total / PAGE) - 1) * PAGE);
        else setData(result);
      }).catch(e => active && setError(e.message));
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [filters, offset, version]);
  React.useEffect(() => {
    let active = true;
    adminPuzzleBatches(batchOffset).then(result => active && setBatches(result)).catch(e => active && setError(e.message));
    return () => { active = false; };
  }, [version, batchOffset]);
  const filter = (key, value) => { setFilters(f => ({ ...f, [key]: value })); setOffset(0); };
  async function action(task, message) {
    setBusy(true); setError(""); setNotice("");
    try { await task(); setNotice(message); refresh(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function openVersion(id) {
    try { setEditor(await adminPuzzleDetail(id)); }
    catch (e) { setError(e.message); }
  }
  const status = (value, batchId) => {
    const count = batchId ? "该批次的全部" : selected.length;
    if (!window.confirm(`将${count}题设为“${STATUS[value]}”？${value === "published" ? "发布后会进入用户训练。" : "原有作答记录将保留。"}`)) return;
    action(() => adminSetPuzzleStatus({ status: value, ...(batchId ? { batch_id: batchId } : { ids: selected }) }), "题目状态已更新");
  };
  return <div className="panel puzzle-library">
    <div className="panel-head"><h3>公共题库（{data.total}）</h3><div className="puzzle-actions">
      <button className="btn-import-submit" disabled={busy} onClick={() => setShowReports(v => !v)}>{showReports ? "收起反馈" : "问题反馈"}</button>
      <button className="btn-import-submit" disabled={busy} onClick={() => setShowImports(v => !v)}>{showImports ? "收起导入" : "导入与来源"}</button>
      <button className="btn-import-submit" disabled={busy} onClick={() => setEditor({ ...EMPTY })}>＋ 新增题目</button>
    </div></div>
    <p className="muted">导入题先审核再发布。下架会停止推荐并保留训练历史；用户私人错题由本人管理。</p>
    {error && <div className="import-error" role="alert">{error}</div>}
    {notice && <p className="puzzle-success" role="status">{notice}</p>}
    {showReports && <PuzzleReportQueue onReview={openVersion} />}
    {showImports && <ImportPanel onImported={() => { refresh(); filter("status", "draft"); }} />}
    <div className="puzzle-filter">
      <input aria-label="搜索题目" className="import-input" placeholder="搜索 ID、分类、标签、来源或 FEN" value={filters.q} onChange={e => filter("q", e.target.value)} />
      <select aria-label="大类筛选" className="import-input" value={filters.kind} onChange={e => filter("kind", e.target.value)}><option value="">全部大类</option>{["杀法", "开局", "中局", "残局"].map(k => <option key={k}>{k}</option>)}</select>
      <select aria-label="分类筛选" className="import-input" value={filters.category} onChange={e => filter("category", e.target.value)}><option value="">全部分类</option>{data.categories.map(k => <option key={k}>{k}</option>)}</select>
      <select aria-label="难度筛选" className="import-input" value={filters.difficulty} onChange={e => filter("difficulty", e.target.value)}><option value="">全部难度</option>{[1,2,3,4,5].map(k => <option key={k} value={k}>难度 {k}</option>)}</select>
      <select aria-label="发布状态筛选" className="import-input" value={filters.status} onChange={e => filter("status", e.target.value)}><option value="">全部状态</option>{Object.entries(STATUS).map(([v,n]) => <option key={v} value={v}>{n}</option>)}</select>
      <select aria-label="校验筛选" className="import-input" value={filters.verified} onChange={e => filter("verified", e.target.value)}><option value="">全部校验</option><option value="true">已校验</option><option value="false">待进一步核验</option></select>
      {Object.values(filters).some(Boolean) && <button className="btn-link" onClick={() => { setFilters(INITIAL); setOffset(0); }}>清除筛选</button>}
    </div>
    <div className="puzzle-actions puzzle-selection"><span>已选 {selected.length} 题</span>
      {Object.entries(STATUS).map(([v,n]) => <button className="btn-link" key={v} disabled={!selected.length || busy} onClick={() => status(v)}>批量{n === "已发布" ? "发布" : n === "已下架" ? "下架" : "待审核"}</button>)}
      <button className="btn-link" disabled={!selected.length || busy} onClick={() => action(() => downloadPuzzles({ ids: selected.join(",") }), "已导出，文件包含来源署名")}>导出所选</button>
    </div>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr>
      <th><input type="checkbox" aria-label="选择本页全部题目" disabled={busy || !data.items.length} checked={!!data.items.length && selected.length === data.items.length} onChange={e => setSelected(e.target.checked ? data.items.map(p => p.id) : [])} /></th>
      <th>ID / 大类</th><th>分类 / 难度</th><th>来源</th><th>校验 / 状态</th><th>操作</th>
    </tr></thead><tbody>{data.items.map(p => <tr key={p.id}>
      <td><input type="checkbox" aria-label={`选择题目 ${p.id}`} disabled={busy} checked={selected.includes(p.id)} onChange={e => setSelected(s => e.target.checked ? [...s, p.id] : s.filter(id => id !== p.id))} /></td>
      <td>{p.id} · v{p.revision_number || 1}<br />{p.kind}</td><td>{p.category}<br />{"★".repeat(p.difficulty)}</td><td>{p.source || "未标注"}</td>
      <td>{p.verified ? "已校验" : "待进一步核验"}<br />{p.review_status === "approved" ? "人工已通过" : p.review_status === "needs_changes" ? "需修改" : "待人工审核"}<br /><span className={`puzzle-status-${p.status}`}>{STATUS[p.status]}</span></td>
      <td><button className="btn-link" disabled={busy} onClick={() => setEditor(p)}>查看 / 编辑</button></td>
    </tr>)}{!data.items.length && <tr><td colSpan={6}>没有匹配的题目</td></tr>}</tbody></table></div>
    <div className="puzzle-actions"><button className="btn-link" disabled={!offset || busy} onClick={() => setOffset(o => Math.max(0,o-PAGE))}>上一页</button><span>第 {Math.floor(offset/PAGE)+1} / {Math.max(1,Math.ceil(data.total/PAGE))} 页</span><button className="btn-link" disabled={offset+PAGE >= data.total || busy} onClick={() => setOffset(o => o+PAGE)}>下一页</button></div>
    <details className="puzzle-batches"><summary>导入批次与来源记录</summary>
      {batches.map(b => <div className="puzzle-batch" key={b.id}><strong>{b.name}</strong><p>{b.status === "imported" ? `已导入 ${b.added_count} 题` : `已预览，可导入 ${b.report.ready} 题`} · {b.created_at.slice(0,10)} · {b.license}</p>
        <p className="muted">{b.attribution}</p><p className="puzzle-source">{b.source_url || "本地文件"}{b.source_revision && ` · ${b.source_revision.slice(0,12)}`}</p>
        <div className="puzzle-actions">{b.status === "preview" && <button className="btn-link" disabled={busy || !b.report.ready} onClick={() => action(() => adminConfirmPuzzles(b.id), "已导入待审核题库")}>导入待审核</button>}
        {b.status === "imported" && <><button className="btn-link" disabled={busy} onClick={() => { filter("batch_id", b.id); }}>查看题目</button><button className="btn-link" disabled={busy} onClick={() => status("published",b.id)}>发布整批</button><button className="btn-link" disabled={busy} onClick={() => status("archived",b.id)}>下架整批</button><button className="btn-link" disabled={busy} onClick={() => action(() => downloadPuzzles({ batch_id:b.id }), "批次已导出")}>导出</button></>}
        </div></div>)}
      {!batches.length && <p className="muted">暂无导入批次</p>}
      <div className="puzzle-actions"><button className="btn-link" disabled={batchOffset === 0} onClick={() => setBatchOffset(v => Math.max(0,v-20))}>上一批</button><button className="btn-link" disabled={batches.length < 20} onClick={() => setBatchOffset(v => v+20)}>下一批</button></div>
    </details>
    {editor && <PuzzleEditor key={`${editor.id || "new"}:${editor.content_sha256}:${editor.review_status}:${editor.status}`} puzzle={editor} onUpdated={async () => { await openVersion(editor.id); refresh(); }} onOpenVersion={openVersion} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refresh(); }} />}
  </div>;
}

function ImportPanel({ onImported }) {
  const [sources, setSources] = React.useState([]);
  const [mode, setMode] = React.useState("file");
  const [form, setForm] = React.useState({ name:"", license:"", attribution:"", source_url:"", github_url:"", json_text:"" });
  const [preview, setPreview] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const fileVersion = React.useRef(0);
  React.useEffect(() => {
    let active = true;
    adminPuzzleSources().then(data => active && setSources(data)).catch(e => active && setError(e.message));
    return () => { active = false; fileVersion.current++; };
  }, []);
  function update(key, value) { setForm(f => ({ ...f,[key]:value })); setPreview(null); }
  async function fileChange(file) {
    const version = ++fileVersion.current;
    setPreview(null); setError(""); update("json_text", "");
    if (!file) return;
    if (file.size > 2*1024*1024) { setError("文件不能超过 2 MiB，每批最多 500 题"); return; }
    try {
      const value = await file.text();
      if (version === fileVersion.current) { update("json_text",value); setForm(f => ({ ...f, name:f.name || file.name })); }
    } catch (e) { if (version === fileVersion.current) setError(`读取文件失败：${e.message}`); }
  }
  async function inspect(e) {
    e.preventDefault(); setBusy(true); setError(""); setPreview(null);
    try { setPreview(await adminPreviewPuzzles({ ...form, github_url:mode === "github" ? form.github_url : "", json_text:mode === "file" ? form.json_text : "" })); }
    catch (e2) { setError(e2.message); }
    finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setError("");
    try { const b = await adminConfirmPuzzles(preview.id); setPreview(b); onImported(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="puzzle-import"><h4>批量导入</h4>
    <p className="muted">支持本项目 JSON 格式：题目数组或含 items 的导出文件。每批最多 500 题、2 MiB。GitHub 文件会固定到实际提交版本。</p>
    <details><summary>已有开源题源与转换方式</summary>{sources.map(s => <div key={s.id} className="puzzle-batch"><a href={s.repository} target="_blank" rel="noreferrer">{s.name}</a> · {s.license}<p>{s.format}。{s.note}</p><p className="muted">转换工具：{s.adapter}，命令与格式说明见仓库 docs/development/puzzles.md。</p><button type="button" className="btn-link" disabled={busy} onClick={() => { setForm(f => ({ ...f, name:s.name, license:s.license, attribution:s.attribution, source_url:s.repository })); setPreview(null); }}>填写来源信息</button></div>)}</details>
    <form className="admin-form" onSubmit={inspect}><fieldset disabled={busy}>
      <label>导入方式<select aria-label="导入方式" className="import-input" value={mode} onChange={e => { setMode(e.target.value); setPreview(null); }}><option value="file">本地 JSON 文件</option><option value="github">GitHub JSON 文件</option></select></label>
      {mode === "file" ? <label>题库文件<input className="import-input" type="file" accept=".json,application/json" onChange={e => fileChange(e.target.files?.[0])} /></label> : <label>GitHub 文件链接<input className="import-input" type="url" required value={form.github_url} placeholder="https://github.com/作者/仓库/blob/main/puzzles.json" onChange={e => update("github_url",e.target.value)} /></label>}
      {[ ["name","批次名称",100],["license","许可证或使用授权",100],["attribution","作者与来源署名",500],["source_url","原始来源链接（本地文件选填）",1000] ].map(([key,label,max]) => <label key={key}>{label}<input className="import-input" required={key !== "source_url"} maxLength={max} value={form[key]} onChange={e => update(key,e.target.value)} /></label>)}
      <button className="btn-import-submit" type="submit" disabled={mode === "file" && !form.json_text}>{busy ? "处理中…" : "检查并预览"}</button>
    </fieldset></form>
    {error && <div className="import-error" role="alert">{error}</div>}
    {preview && <div className="puzzle-preview"><p>共 {preview.report.total} 题 · 可导入 {preview.report.ready} · 重复 {preview.report.duplicates} · 题解冲突 {preview.report.conflicts} · 无效 {preview.report.invalid}</p><p className="muted">{preview.report.note}</p>
      {preview.report.errors?.length > 0 && <details open><summary>问题明细（最多显示 50 项）</summary><ul>{preview.report.errors.map((e,i) => <li key={i}>第 {e.row} 题：{e.reason}</li>)}</ul></details>}
      {!!preview.sample?.length && <details><summary>候选题示例</summary>{preview.sample.map((p,i) => <p key={i}>{p.kind} / {p.category} · 难度 {p.difficulty}<br /><code>{p.fen}</code><br /><code>{p.solution}</code></p>)}</details>}
      {preview.status === "preview" ? <button className="btn-import-submit" disabled={busy || !preview.report.ready} onClick={confirm}>将 {preview.report.ready} 题导入待审核</button> : <p className="puzzle-success">本批次已导入 {preview.added_count} 题，请审核后发布。</p>}
    </div>}
  </section>;
}

function PuzzleEditor({ puzzle, onClose, onSaved, onUpdated, onOpenVersion }) {
  const [form, setForm] = React.useState(puzzle);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const editing = !!puzzle.id;
  const change = e => setForm(f => ({ ...f,[e.target.name]:e.target.value }));
  async function save(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      if (editing) await adminEditPuzzle(puzzle.id, { kind:form.kind, category:form.category, difficulty:Number(form.difficulty), tags:form.tags, ...(puzzle.status === "draft" ? { fen:form.fen, solution:form.solution, side_to_move:form.side_to_move } : {}) });
      else await adminCreatePuzzle({ ...form, difficulty:Number(form.difficulty), mate_check:true });
      onSaved();
    } catch (e2) { setError(e2.message); }
    finally { setBusy(false); }
  }
  return <div className="modal-overlay" onClick={() => !busy && onClose()}><div role="dialog" aria-label={editing ? "编辑题目" : "新增题目"} aria-modal="true" className="modal modal-wide puzzle-editor" onClick={e => e.stopPropagation()}>
    <div className="panel-head"><h3>{editing ? `题目 ${puzzle.id}` : "新增题目"}</h3><button aria-label="关闭题目编辑" className="modal-close" disabled={busy} onClick={onClose}>×</button></div>
    {editing && <><p className="puzzle-source">{puzzle.fen}<br />正解：{puzzle.solution}<br />来源：{puzzle.source || "未标注"} · {STATUS[puzzle.status]}</p></>}
    <p className="muted">{editing ? "可调整分类、难度与标签。待审核且没有学习记录的题目还可修改局面与题解；已发布题目保留原题解。" : "每步走法均会校验，杀法题还须以将死结束。新增后进入待审核。"}</p>
    <details open={!editing}><summary>{editing ? "编辑分类与待审核内容" : "录入题目"}</summary>
    <form className="admin-form" onSubmit={save}><fieldset disabled={busy}>
      {(!editing || puzzle.status === "draft") && <><label>FEN<input className="import-input" name="fen" maxLength={120} required value={form.fen} onChange={change} /></label><label>正解（逗号分隔，多分支用 |）<input className="import-input" name="solution" maxLength={2000} required value={form.solution} onChange={change} /></label><label>走子方<select aria-label="走子方" name="side_to_move" className="import-input" value={form.side_to_move} onChange={change}><option value="w">红方</option><option value="b">黑方</option></select></label></>}
      <label>大类<select aria-label="大类" className="import-input" name="kind" disabled={editing && puzzle.status !== "draft"} value={form.kind} onChange={change}>{["杀法","开局","中局","残局"].map(k => <option key={k}>{k}</option>)}</select></label>
      <label>分类<input className="import-input" name="category" maxLength={40} required value={form.category} onChange={change} /></label>
      <label>难度<select aria-label="难度" className="import-input" name="difficulty" value={form.difficulty} onChange={change}>{[1,2,3,4,5].map(k => <option key={k} value={k}>{k}</option>)}</select></label>
      <label>标签<input className="import-input" name="tags" maxLength={1000} value={form.tags} onChange={change} /></label>
      {error && <div className="import-error" role="alert">{error}</div>}
      <button className="btn-import-submit" type="submit">{busy ? "保存中…" : editing ? "保存修改" : "添加到待审核"}</button>
    </fieldset></form></details>
    {editing && <PuzzleReview puzzle={puzzle} onUpdated={onUpdated} onOpenVersion={onOpenVersion} />}
  </div></div>;
}
