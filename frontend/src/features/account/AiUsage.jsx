import React from "react";
import { getAiUsage } from "../../shared/api";

export const AI_ACTIONS = {
  coach_plan: "教练计划", game_report: "整局报告", mistake_explain: "单步失误讲解",
  puzzle_explain: "题目讲解", play_coach: "走法点评",
};
const STATES = { reserved: "处理中（已预留）", succeeded: "已完成", refunded: "已退回" };
const dateText = (value) => new Date(value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value) ? value : value + "Z").toLocaleString("zh-CN");

export function UsageDetails({ usage }) {
  return <>
    <div className="ai-quota-cards">
      <div><span>本月剩余</span><strong>{usage.monthly_remaining} / {usage.monthly_limit}</strong></div>
      <div><span>补充额度</span><strong>{usage.extra_balance}</strong></div>
      <div><span>当前可用</span><strong>{usage.available_units} 单位</strong></div>
    </div>
    <p>{usage.plan === "pro" ? "Pro" : "免费账号"} · {usage.period} · 下次月度重置：{dateText(usage.resets_at)}</p>
    <p>月度额度不结转；补充额度保留。优先使用月度额度，不足部分再用补充额度。处理中调用会预留额度，生成失败后退回。</p>
    <h3>各项 AI 消耗</h3>
    <ul className="ai-price-list">{Object.entries(usage.costs).map(([key, value]) =>
      <li key={key}>{AI_ACTIONS[key] || key}<strong>{value} 单位 / 次</strong></li>)}</ul>
    <p className="muted">一次整局复盘可能包含多处失误讲解、整局报告和教练计划，分别计入额度。规则讲解、训练与本地引擎不消耗 AI 额度；命中已有题目讲解缓存不重复扣减。</p>
    <h3>最近 AI 使用</h3>
    {usage.operations.length === 0 ? <p>暂无 AI 使用记录。</p> : <div className="ai-usage-table"><table>
      <thead><tr><th>事项</th><th>预留额度</th><th>状态</th><th>时间</th></tr></thead>
      <tbody>{usage.operations.map((row) => <tr key={row.id}>
        <td>{AI_ACTIONS[row.action] || row.action}</td><td>{row.units}</td>
        <td>{STATES[row.status] || row.status}</td><td>{dateText(row.created_at)}</td>
      </tr>)}</tbody>
    </table></div>}
    {usage.adjustments?.length > 0 && <>
      <h3>最近补充额度调整</h3>
      <ul>{usage.adjustments.map((row, i) => <li key={i}>{row.delta > 0 ? "+" : ""}{row.delta} · {row.reason} · {dateText(row.created_at)}</li>)}</ul>
    </>}
  </>;
}

export default function AiUsage({ user, credits, onRequireLogin }) {
  const [usage, setUsage] = React.useState(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const refresh = React.useCallback(async () => {
    setBusy(true); setError("");
    try { setUsage(await getAiUsage()); }
    catch (e) { setError(e.message || "读取额度失败"); }
    finally { setBusy(false); }
  }, []);
  React.useEffect(() => { if (user) refresh(); else setUsage(null); }, [user, refresh]);
  return <div className="settings-group ai-usage-page">
    <div className="settings-heading"><h2>账户与 AI 额度</h2><p>AI 额度与训练积分分别记录，仅对当前服务器有效。</p></div>
    {!user ? <><p>登录后查看个人额度和使用记录。</p><button onClick={onRequireLogin}>登录</button></> : <>
      <p><strong>{user.username}</strong> · 训练积分 💎 {credits?.balance ?? "…"}（用于外观兑换，不兑换 AI）</p>
      <button onClick={refresh} disabled={busy}>{busy ? "刷新中…" : "刷新额度"}</button>
      {error && <p role="alert">{error}</p>}
      {usage && <UsageDetails usage={usage} />}
    </>}
  </div>;
}
