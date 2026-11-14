import React from "react";
import { adminRuntimeLogs, adminLogCatalog, adminLogs } from "../../shared/api";
import { auditLogEntries, buildLogEntries, filterLogEntries, resourceLabel, STATUS_LABELS } from "./logEntries";
import "./logs.css";

function Mark({ kind = "activity", size = 18 }) {
  const paths = { search: "m21 21-5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16", refresh: "M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18a8 8 0 0 1-13-3", activity: "M3 12h4l3-8 4 16 3-8h4", close: "m6 6 12 12M6 18 18 6", chevron: "m9 5 7 7-7 7", shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM8 12l3 3 5-6" };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}
const clock = (timestamp) => new Date(timestamp * 1000).toLocaleTimeString("zh-CN", { hour12: false });
const duration = (ms) => ms == null ? "—" : ms < 1000 ? `${ms} 毫秒` : `${(ms / 1000).toFixed(1)} 秒`;

export default function LogCenter() {
  const [mode, setMode] = React.useState("runtime");
  const [rows, setRows] = React.useState([]);
  const [categories, setCategories] = React.useState([]);
  const [error, setError] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [hours, setHours] = React.useState(0);
  const [auto, setAuto] = React.useState(true);
  const [refresh, setRefresh] = React.useState(0);
  const [selected, setSelected] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [auditType, setAuditType] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [updated, setUpdated] = React.useState(null);
  const detailRef = React.useRef(null);
  React.useEffect(() => {
    if (selected && window.matchMedia("(max-width: 1100px)").matches) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected]);
  const auditQuery = mode === "audit" ? query : "";
  React.useEffect(() => { setSelected(""); }, [category, status, query, hours, page, auditType]);
  React.useEffect(() => {
    let active = true;
    adminLogCatalog().then((data) => active && setCategories(data)).catch(() => {});
    return () => { active = false; };
  }, []);
  React.useEffect(() => {
    const controller = new AbortController();
    let timer;
    setLoading(true); setError("");
    async function load() {
      try {
        const data = mode === "runtime" ? await adminRuntimeLogs({ signal: controller.signal }) : await adminLogs(50, page * 50, auditType, { signal: controller.signal }, auditQuery);
        if (controller.signal.aborted) return;
        setRows(data); setError(""); setUpdated(new Date());
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason.message);
      }
      if (!controller.signal.aborted) {
        setLoading(false);
        if (auto && mode === "runtime") timer = setTimeout(load, 5000);
      }
    }
    if (auditQuery) timer = setTimeout(load, 250);
    else load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refresh, mode, auto, page, auditType, auditQuery]);
  const entries = React.useMemo(() => mode === "runtime" ? buildLogEntries(rows) : auditLogEntries(rows), [rows, mode]);
  const visible = filterLogEntries(entries, { category: mode === "runtime" ? category : "", status, query, hours: mode === "runtime" ? hours : 0 });
  const detail = entries.find((row) => row.id === selected);
  const label = (key) => categories.find((item) => item.key === key)?.label || "系统运行";
  function switchMode(value) { if (value === mode) return; setMode(value); setRows([]); setSelected(""); setCategory(""); setQuery(""); setStatus(""); setPage(0); }
  const problems = entries.filter((r) => ["failed", "warning", "rejected"].includes(r.status)).length;
  const successes = entries.filter((r) => r.status === "success").length;
  return <section className="log-center">
    <header className="log-heading"><div><span className="log-eyebrow"><Mark /> 服务与运营</span><h2>日志中心</h2><p>了解关键操作的结果，快速找到需要处理的问题。</p></div>
      <div className="log-live"><i className={auto && mode === "runtime" && !error ? "is-live" : ""} />{error ? "更新暂不可用" : loading ? "正在更新" : auto && mode === "runtime" ? "实时更新中" : "手动查看"}<small>{updated ? `更新于 ${updated.toLocaleTimeString("zh-CN", { hour12: false })}` : "等待读取"}</small></div>
    </header>
    <div className="log-metrics">
      <button className={!status ? "is-selected" : ""} onClick={() => setStatus("")}><span>{mode === "runtime" ? "当前操作" : "本页记录"}</span><strong>{entries.length}</strong><small>{mode === "runtime" ? "同一次操作的过程已合并" : "当前页的管理审计记录"}</small></button>
      <button className={`log-metric-alert${status === "problems" ? " is-selected" : ""}`} onClick={() => setStatus("problems")}><span>需要关注</span><strong>{problems}</strong><small>失败、告警及未执行的请求</small></button>
      <button className={status === "success" ? "is-selected" : ""} onClick={() => setStatus("success")}><span>执行成功</span><strong>{successes}</strong><small>已完成的关键业务操作</small></button>
    </div>
    <div className="log-surface">
      <div className="log-mode-bar"><div className="log-segment" role="group" aria-label="日志类型"><button aria-pressed={mode === "runtime"} onClick={() => switchMode("runtime")}><Mark />运行事件</button><button aria-pressed={mode === "audit"} onClick={() => switchMode("audit")}><Mark kind="shield" />管理审计</button></div>
        <span className="log-retention">{mode === "runtime" ? "最近 500 条原始记录 · 服务重启后清空" : "持久保存 · 登录失败与敏感管理操作"}</span></div>
      {mode === "runtime" && <nav className="log-categories" aria-label="业务范围"><button aria-pressed={!category} onClick={() => setCategory("")}>全部事件 <b>{entries.length}</b></button>{categories.map((item) => <button key={item.key} title={item.description} aria-pressed={category === item.key} onClick={() => setCategory(item.key)}>{item.label}<b>{entries.filter((row) => row.category === item.key).length}</b></button>)}</nav>}
      <div className="log-toolbar">
        <label className="log-search"><Mark kind="search" /><input aria-label="搜索日志" placeholder="搜索事件、用户或操作编号" value={query} onChange={(event) => { setQuery(event.target.value); if (mode === "audit") setPage(0); }} />{query && <button aria-label="清空搜索" onClick={() => setQuery("")}><Mark kind="close" size={14} /></button>}</label>
        <select aria-label="结果筛选" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部结果</option><option value="problems">需要关注</option>{Object.entries(STATUS_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
        {mode === "runtime" ? <select aria-label="时间范围" value={hours} onChange={(event) => setHours(Number(event.target.value))}><option value={0}>全部时间</option><option value={1}>最近 1 小时</option><option value={24}>最近 24 小时</option></select> : <select aria-label="审计类型" value={auditType} onChange={(event) => { setAuditType(event.target.value); setPage(0); }}><option value="">全部审计</option><option value="login_failed">登录失败</option><option value="admin_action">管理操作</option></select>}
        {mode === "runtime" && <button className="log-auto" aria-pressed={auto} onClick={() => setAuto(!auto)}><i />自动更新</button>}
        <button className="log-refresh" onClick={() => setRefresh((value) => value + 1)}><Mark kind="refresh" />刷新</button>
      </div>
      {error && <div className="log-error" role="alert">读取日志失败：{error}，可点击刷新重试。</div>}
      <div className={`log-workspace${detail ? " has-detail" : ""}`}>
        <div className="log-list" aria-label="日志事件列表">
          <div className="log-list-head"><span>事件</span><span>操作者</span><span>结果</span><span>时间</span><span /></div>
          {visible.map((row) => <button className={`log-row${row.id === selected ? " is-selected" : ""}`} key={row.id} onClick={() => setSelected(row.id)} aria-label={`查看${row.title}详情`} aria-pressed={row.id === selected}>
            <span className="log-event"><i className={`log-dot ${row.status}`} /><span><strong>{row.title}</strong><small>{label(row.category)}{resourceLabel(row.resource) ? ` · ${resourceLabel(row.resource)}` : ""}{row.records.length > 1 ? ` · ${row.records.length} 条过程记录` : ""}</small></span></span>
            <span className="log-actor">{row.actor || "系统"}</span><span><b className={`log-status ${row.status}`}>{STATUS_LABELS[row.status] || "信息"}</b></span><time>{clock(row.timestamp)}</time><Mark kind="chevron" size={14} />
          </button>)}
          {!visible.length && <div className="log-empty"><Mark size={32} /><strong>{loading ? "正在读取事件" : query || category || status ? "没有匹配的事件" : "这里还没有运行事件"}</strong><p>{query || category || status ? "试试其他范围或搜索词。" : "关键业务操作发生后，会自动出现在这里。"}</p></div>}
        </div>
        {detail && <aside ref={detailRef} className="log-detail" aria-label="事件详情"><header><span>事件详情</span><button aria-label="关闭事件详情" onClick={() => setSelected("")}><Mark kind="close" /></button></header>
          <b className={`log-status ${detail.status}`}>{STATUS_LABELS[detail.status] || "信息"}</b><h3>{detail.title}</h3>
          <dl><div><dt>业务范围</dt><dd>{label(detail.category)}</dd></div><div><dt>操作者</dt><dd>{detail.actor || "系统"}</dd></div><div><dt>发生时间</dt><dd>{new Date(detail.timestamp * 1000).toLocaleString("zh-CN", { hour12: false })}</dd></div><div><dt>操作耗时</dt><dd>{duration(detail.duration_ms)}</dd></div>{detail.resource && <div><dt>关联对象</dt><dd>{resourceLabel(detail.resource) || detail.resource}</dd></div>}{detail.operation_id && <div><dt>操作编号</dt><dd><code>{detail.operation_id}</code></dd></div>}</dl>
          <h4>操作过程 <span>{detail.records.length}</span></h4><ol className="log-timeline">{detail.records.map((record, index) => <li key={record.seq || index}><i className={`log-dot ${record.status}`} /><div><time>{record.ts}</time><p>{record.title || record.message.split("\n")[0]}</p></div></li>)}</ol>
          <details className="log-diagnostic"><summary>技术详情与异常堆栈</summary>{detail.records.map((record, index) => <pre key={record.seq || index}>{record.logger || "管理审计"}{"\n"}{record.message}{Object.keys(record.context || {}).length ? `\n${JSON.stringify(record.context, null, 2)}` : ""}</pre>)}</details>
        </aside>}
      </div>
      <footer className="log-footer"><span>{mode === "runtime" ? `共 ${entries.length} 项操作 · 当前显示 ${visible.length} 项` : `第 ${page + 1} 页 · ${visible.length} 条记录`}</span>{mode === "audit" ? <div><button disabled={!page} onClick={() => { setPage(page - 1); setSelected(""); }}>上一页</button><button disabled={rows.length < 50} onClick={() => { setPage(page + 1); setSelected(""); }}>下一页</button></div> : <span>选择一条事件查看完整过程</span>}</footer>
    </div>
  </section>;
}
