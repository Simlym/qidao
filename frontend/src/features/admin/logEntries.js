// 一次操作保留一条摘要，过程和堆栈只在详情中展示。
export const STATUS_LABELS = { success: "成功", failed: "失败", warning: "注意", rejected: "未执行", running: "进行中", cancelled: "已取消", info: "信息" };
const TERMINAL = new Set(["success", "failed", "cancelled"]);
export function resourceLabel(value = "") {
  const words = { xiangqi: "象棋", jieqi: "揭棋", download: "下载安装", verify: "检测", import: "导入", probe: "检测", configured: "已配置", cleared: "已清除", game_report: "整局复盘", mistake_explain: "失误讲解", coach_plan: "教练计划", puzzle_explain: "题目讲解", play_coach: "对弈指导", model: "模型设置", protocol: "接口协议", base_url: "服务地址", api_key: "密钥配置", enabled: "启用状态", thinking_enabled: "思考模式", reasoning_effort: "推理强度", ai_usage: "额度策略" };
  if (/^(?:\/|[A-Z]:\\)/i.test(value)) return "";
  return value.split(/[:,]/).map((part) => words[part] || part).join(" · ");
}
export function buildLogEntries(rows) {
  const groups = new Map();
  for (const row of rows) {
    const operation = row.operation_id || (row.category === "engines" ? row.request_id : "");
    if (!row.event && !operation && !["WARNING", "ERROR", "CRITICAL"].includes(row.level)) continue;
    const key = operation ? `operation:${operation}` : `record:${row.seq}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([id, records]) => {
    records.sort((a, b) => a.seq - b.seq);
    const products = records.filter((row) => row.event);
    const last = records.at(-1);
    const primary = products.filter((row) => TERMINAL.has(row.status)).at(-1) || products.at(-1)
      || records.findLast((row) => ["ERROR", "CRITICAL"].includes(row.level)) || last;
    const legacySuccess = !products.length && records.findLast((row) => row.message.includes("安装并启用成功"));
    return { ...primary, id, records, timestamp: last.timestamp || Date.parse(last.ts.replace(" ", "T")) / 1000,
      ts: last.ts, status: legacySuccess ? "success" : primary.status,
      title: legacySuccess ? "服务器引擎已启用" : primary.title || "服务运行异常",
      duration_ms: primary.duration_ms ?? (Number(last.message.match(/耗时=([\d.]+)秒/)?.[1]) * 1000 || null),
      actor: primary.actor || records.find((row) => row.actor)?.actor || "系统",
      operation_id: primary.operation_id || records.find((row) => row.operation_id)?.operation_id || "" };
  }).sort((a, b) => b.timestamp - a.timestamp || b.seq - a.seq);
}
export function filterLogEntries(entries, { category = "", status = "", query = "", hours = 0, now = Date.now() } = {}) {
  const search = query.trim().toLowerCase();
  return entries.filter((row) => (!category || row.category === category)
    && (!status || (status === "problems" ? ["failed", "warning", "rejected"].includes(row.status) : row.status === status))
    && (!hours || row.timestamp * 1000 >= now - hours * 3600000)
    && (!search || `${row.title} ${row.actor} ${row.resource} ${row.operation_id} ${row.records.map((r) => r.message).join(" ")}`.toLowerCase().includes(search)));
}
export function auditLogEntries(rows) {
  return rows.map((row) => ({ ...row, id: `audit:${row.id}`, title: row.title || (row.event === "login_failed" ? "登录失败" : "管理操作"),
    category: row.category || "admin", status: row.level === "warning" ? "warning" : "success", resource: row.target,
    timestamp: Date.parse(row.ts.replace(" ", "T") + "Z") / 1000,
    records: [{ ...row, message: `动作：${row.action || "登录失败"}\n目标：${row.target || "—"}\n来源 IP：${row.ip || "—"}` }] }));
}
