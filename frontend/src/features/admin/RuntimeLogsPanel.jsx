import React from "react";
import { adminRuntimeLogs } from "../../shared/api";

export default function RuntimeLogsPanel() {
  const [rows, setRows] = React.useState([]);
  const [error, setError] = React.useState("");
  const [filter, setFilter] = React.useState("");
  const [onlyEngines, setOnlyEngines] = React.useState(true);
  const [refresh, setRefresh] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function load() {
      try {
        const data = await adminRuntimeLogs({ signal: controller.signal });
        if (controller.signal.aborted) return;
        setRows(data); setError("");
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason.message);
      }
      timer = setTimeout(load, 3000);
    }
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refresh]);
  const visible = rows.filter((row) => (!onlyEngines || row.logger.startsWith("xiangqidao.engine"))
    && (!filter.trim() || `${row.message} ${row.level} ${row.logger}`.toLowerCase().includes(filter.trim().toLowerCase()))).slice().reverse();
  return <section className="panel">
    <h3>后端运行日志</h3>
    <p className="muted">每 3 秒更新，显示当前后端进程最近 200 条记录。重启后清空；安装失败可用错误详情中的操作编号查询。</p>
    <div className="import-row">
      <input className="import-input" aria-label="筛选运行日志" placeholder="搜索操作编号或错误文字" value={filter} onChange={(event) => setFilter(event.target.value)} />
      <label><input type="checkbox" checked={onlyEngines} onChange={(event) => setOnlyEngines(event.target.checked)} />仅看引擎日志</label>
      <button type="button" onClick={() => setRefresh((value) => value + 1)}>刷新</button>
    </div>
    {error && <p className="import-error" role="alert">{error}</p>}
    <div className="admin-table-wrap" style={{ maxHeight: 480, overflow: "auto" }}>
      {!visible.length && <p className="muted">暂无匹配的运行日志</p>}
      {visible.map((row) => <details key={row.seq} open={row.level === "ERROR"}>
        <summary>{row.ts} · {row.level} · {row.message.split("\n")[0]}</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{row.logger}{"\n"}{row.message}</pre>
      </details>)}
    </div>
  </section>;
}
