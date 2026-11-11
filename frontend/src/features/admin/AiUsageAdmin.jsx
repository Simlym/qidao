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
  return <div className="ai-usage-admin ai-usage-page">
    {error && <p className="import-error" role="alert">{error}</p>}
    {notice && <p className="ai-admin-notice" role="status">{notice}</p>}
    <section className="panel">
      <div className="ai-admin-heading"><h3>AI 月度策略</h3><span className="tag">开发测试</span></div>
      <p className="ai-admin-description">设置账号每月可用额度与各项 AI 消耗。测试额度不代表正式售价，管理员同样受 Pro 上限约束。</p>
      {!policy && !error && <p className="ai-usage-empty" role="status">正在读取额度策略…</p>}
      {policy && <form className="ai-policy-form" onSubmit={savePolicy}>
        <fieldset disabled={busy}>
          <legend>月度额度<span>每月重置，不累计结转</span></legend>
          <div className="ai-policy-grid ai-policy-limits">
            <label>免费账号<span className="ai-input-unit"><input type="number" min="0" max="1000000" required value={policy.free_monthly_units}
              onChange={(e) => setPolicy({ ...policy, free_monthly_units: Number(e.target.value) })} /><span>单位 / 月</span></span></label>
            <label>Pro 会员<span className="ai-input-unit"><input type="number" min="0" max="1000000" required value={policy.pro_monthly_units}
              onChange={(e) => setPolicy({ ...policy, pro_monthly_units: Number(e.target.value) })} /><span>单位 / 月</span></span></label>
          </div>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>单次消耗<span>按实际调用事项分别计入</span></legend>
          <div className="ai-policy-grid">
            {Object.entries(policy.costs).map(([key, value]) => <label key={key}>{AI_ACTIONS[key] || key}
              <span className="ai-input-unit"><input type="number" min="1" max="1000000" required value={value}
                onChange={(e) => setPolicy({ ...policy, costs: { ...policy.costs, [key]: Number(e.target.value) } })} /><span>单位 / 次</span></span></label>)}
          </div>
        </fieldset>
        <div className="ai-policy-footer"><p className="muted">保存后保留本月已用额度，后续调用按新策略计算。</p><button className="ai-usage-button ai-usage-login" disabled={busy} type="submit">{busy ? "保存中…" : "保存额度策略"}</button></div>
      </form>}
    </section>
    <section className="panel"><div className="ai-admin-heading"><h3>本月模型成本</h3><span className="muted">按当前价格表估算</span></div>
      {!costs && !error && <p className="ai-usage-empty" role="status">正在读取成本记录…</p>}
      {costs && <>
        <div className="ai-cost-grid">
          <div><span>调用次数</span><strong>{costs.calls}<small>次</small></strong><p>其中失败 {costs.failed_calls} 次</p></div>
          <div><span>累计用量</span><strong>{costs.total_tokens}<small>tokens</small></strong><p>本月模型调用总用量</p></div>
          <div><span>已知成本估算</span><strong title={`$${Number(costs.estimated_cost_usd).toFixed(6)}`}>${Number(costs.estimated_cost_usd).toFixed(6)}</strong><p>另有 {costs.unknown_cost_calls} 次费用未知</p></div>
        </div>
        <p className="ai-quota-note">估算金额并非供应商账单；未配置价格不代表免费，失败调用也可能产生费用。</p>
      </>}
    </section>
    <section className="panel"><div className="ai-admin-heading"><h3>个人额度与补充额度</h3></div>
      <p className="ai-admin-description">查看用户额度与使用记录，按需调整补充额度。</p>
      <div className="ai-user-picker">
      <label htmlFor="ai-quota-user">用户</label><select id="ai-quota-user" value={username} disabled={busy} onChange={(e) => { setUsername(e.target.value); adjustmentKey.current = null; setError(""); setNotice(""); }}>
        <option value="">请选择用户</option>{users.map((user) => <option key={user.id} value={user.username}>{user.username}</option>)}
      </select></div>
      {!username && <p className="ai-usage-empty">选择一位用户，查看额度详情与调整记录。</p>}
      {username && !usage && !error && <p className="ai-usage-empty" role="status">正在读取用户额度…</p>}
      {usage && <>
        <form className="ai-adjust-form" onSubmit={adjust}>
          <label>变动额度<input type="number" min="-1000000" max="1000000" required value={delta} disabled={busy} onChange={(e) => { setDelta(e.target.value); adjustmentKey.current = null; }} placeholder="增加为正，扣回为负" /></label>
          <label>调整原因<input required maxLength="80" value={reason} disabled={busy} onChange={(e) => { setReason(e.target.value); adjustmentKey.current = null; }} /></label>
          <button className="ai-usage-button ai-usage-login" type="submit" disabled={busy || !delta || Number(delta) === 0}>调整补充额度</button>
        </form>
        <button className="ai-usage-button" disabled={busy} onClick={() => run(async () => {
          const result = await adminRecoverAiQuota(username);
          setUsage(await adminAiUsage(username));
          setNotice(`已回收 ${result.recovered} 笔超过 15 分钟仍未完成的预留。`);
        })}>回收超时预留</button>
        <UsageDetails usage={usage} />
      </>}
    </section>
  </div>;
}
