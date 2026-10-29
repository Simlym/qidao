import React from "react";
import {
  adminAiPolicy, adminSaveAiPolicy, adminAiUsage, adminAdjustAiQuota, adminAiCosts, adminRecoverAiQuota,
} from "../../shared/api";
import { UsageDetails, AI_ACTIONS } from "../account/AiUsage";

export default function AiUsageAdmin({ users }) {
  const [policy, setPolicy] = React.useState(null);
  const [costs, setCosts] = React.useState(null);
  const [username, setUsername] = React.useState("");
  const [usage, setUsage] = React.useState(null);
  const [delta, setDelta] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const adjustmentKey = React.useRef(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    Promise.all([adminAiPolicy(), adminAiCosts()]).then(([p, c]) => { setPolicy(p); setCosts(c); }).catch((e) => setError(e.message));
  }, []);
  React.useEffect(() => {
    let live = true;
    setUsage(null);
    if (username) adminAiUsage(username).then((next) => live && setUsage(next)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [username]);

  async function run(action) {
    setBusy(true); setError(""); setNotice("");
    try {
      await action();
      setCosts(await adminAiCosts());
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function savePolicy(event) {
    event.preventDefault();
    run(async () => {
      setPolicy(await adminSaveAiPolicy(policy));
      if (username) setUsage(await adminAiUsage(username));
      setNotice("策略已保存，保留当前月已用额度，后续请求按新上限和单价计算。");
    });
  }
  function adjust(event) {
    event.preventDefault();
    run(async () => {
      adjustmentKey.current ||= globalThis.crypto.randomUUID();
      setUsage(await adminAdjustAiQuota(username, { delta: Number(delta), reason: reason.trim() }, adjustmentKey.current));
      adjustmentKey.current = null;
      setDelta(""); setReason(""); setNotice("补充额度已调整。");
    });
  }
  return <div className="ai-usage-admin">
    {error && <p className="import-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <section className="panel">
      <h3>AI 月度策略</h3><p>开发测试额度，不代表正式售价。会员不提供无限模型调用，管理员同样受 Pro 上限约束。</p>
      {policy && <form className="ai-policy-form" onSubmit={savePolicy}>
        <label>免费账号 / 月<input type="number" min="0" max="1000000" required value={policy.free_monthly_units} disabled={busy}
          onChange={(e) => setPolicy({ ...policy, free_monthly_units: Number(e.target.value) })} /></label>
        <label>Pro / 月<input type="number" min="0" max="1000000" required value={policy.pro_monthly_units} disabled={busy}
          onChange={(e) => setPolicy({ ...policy, pro_monthly_units: Number(e.target.value) })} /></label>
        {Object.entries(policy.costs).map(([key, value]) => <label key={key}>{AI_ACTIONS[key] || key} / 次
          <input type="number" min="1" max="1000000" required value={value} disabled={busy}
            onChange={(e) => setPolicy({ ...policy, costs: { ...policy.costs, [key]: Number(e.target.value) } })} /></label>)}
        <button disabled={busy} type="submit">保存额度策略</button>
      </form>}
    </section>
    <section className="panel"><h3>本月模型成本记录</h3>
      {costs && <>
        <p>调用 {costs.calls} 次，其中失败 {costs.failed_calls} 次；累计 {costs.total_tokens} tokens。</p>
        <p>已知单价部分估算：${Number(costs.estimated_cost_usd).toFixed(6)}；另有 {costs.unknown_cost_calls} 次费用未知。</p>
        <p className="muted">金额为维护价格表的估算，并非供应商账单；未配置价格不代表免费。失败调用也可能产生供应商费用。</p>
      </>}
    </section>
    <section className="panel"><h3>个人额度与补充额度</h3>
      <label htmlFor="ai-quota-user">用户</label><select id="ai-quota-user" value={username} disabled={busy} onChange={(e) => { setUsername(e.target.value); adjustmentKey.current = null; setError(""); setNotice(""); }}>
        <option value="">请选择用户</option>{users.map((user) => <option key={user.id} value={user.username}>{user.username}</option>)}
      </select>
      {usage && <>
        <form className="ai-policy-form" onSubmit={adjust}>
          <label>变动额度<input type="number" min="-1000000" max="1000000" required value={delta} disabled={busy} onChange={(e) => { setDelta(e.target.value); adjustmentKey.current = null; }} placeholder="增加为正，扣回为负" /></label>
          <label>调整原因<input required maxLength="80" value={reason} disabled={busy} onChange={(e) => { setReason(e.target.value); adjustmentKey.current = null; }} /></label>
          <button type="submit" disabled={busy || !delta || Number(delta) === 0}>调整补充额度</button>
        </form>
        <button disabled={busy} onClick={() => run(async () => {
          const result = await adminRecoverAiQuota(username);
          setUsage(await adminAiUsage(username));
          setNotice(`已回收 ${result.recovered} 笔超过 15 分钟仍未完成的预留。`);
        })}>回收超时预留</button>
        <UsageDetails usage={usage} />
      </>}
    </section>
  </div>;
}
