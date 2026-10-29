import React from "react";
import AiUsageAdmin from "./AiUsageAdmin";
import PuzzleLibrary from "./PuzzleLibrary";
import {
  adminAdjustCredits,
  adminDeleteUser,
  adminGetVariantEngine,
  adminGetLlmSettings,
  adminLogs,
  adminOverview,
  adminTestLlmSettings,
  adminUpdateLlmSettings,
  adminUpdateVariantEngine,
  adminUpdateMembership,
  adminUsers,
} from "../../shared/api";

const TABS = [
  { key: "overview", label: "概览" },
  { key: "ai-usage", label: "AI 额度" },
  { key: "users", label: "用户" },
  { key: "puzzles", label: "题库" },
  { key: "settings", label: "系统设置" },
  { key: "logs", label: "日志" },
];

export default function Admin() {
  const [tab, setTab] = React.useState("overview");
  const [ov, setOv] = React.useState(null);
  const [users, setUsers] = React.useState([]);
  const [creditUser, setCreditUser] = React.useState(null);
  const [creditDelta, setCreditDelta] = React.useState("");
  const [creditReason, setCreditReason] = React.useState("");
  const [creditBusy, setCreditBusy] = React.useState(false);
  const [creditError, setCreditError] = React.useState("");

  const reload = React.useCallback(() => {
    adminOverview().then(setOv).catch(() => {});
    adminUsers().then(setUsers).catch(() => {});
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  async function delUser(id) {
    if (!window.confirm("删除该用户及其训练数据？")) return;
    try {
      await adminDeleteUser(id);
      reload();
    } catch (e) {
      alert(e.message);
    }
  }

  async function setMembership(user, days) {
    try {
      await adminUpdateMembership(user.id, days);
      reload();
    } catch (e) {
      alert(e.message);
    }
  }

  function openCreditAdjust(user) {
    setCreditUser(user);
    setCreditDelta("");
    setCreditReason("");
    setCreditError("");
  }

  function closeCreditAdjust() {
    if (!creditBusy) setCreditUser(null);
  }

  async function adjustCredits(e) {
    e.preventDefault();
    const delta = Number(creditDelta);
    if (!Number.isInteger(delta) || delta === 0) {
      setCreditError("请输入非 0 的整数；增加填正数，扣减填负数");
      return;
    }
    setCreditBusy(true);
    setCreditError("");
    try {
      await adminAdjustCredits(creditUser.username, delta, creditReason.trim());
      setCreditUser(null);
      reload();
    } catch (e2) {
      setCreditError(e2.message);
    } finally {
      setCreditBusy(false);
    }
  }

  return (
    <div className="admin">
      <div className="admin-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 概览卡片 */}
      {tab === "overview" && (
        ov ? (
          <div className="cards">
            <div className="card"><div className="card-value">{ov.users}</div><div className="card-label">用户</div></div>
            <div className="card"><div className="card-value">{ov.puzzles}</div><div className="card-label">题目</div></div>
            <div className="card"><div className="card-value">{ov.games}</div><div className="card-label">棋局</div></div>
            <div className="card"><div className="card-value">{ov.attempts}</div><div className="card-label">作答次数</div></div>
          </div>
        ) : (
          <p className="muted">加载中…</p>
        )
      )}

      {/* 系统设置：对弈引擎 + AI 复盘 */}
      {tab === "settings" && (
        <>
          <ServerEnginePanel variant="xiangqi" />
          <ServerEnginePanel variant="jieqi" />
          <LlmSettingsPanel />
        </>
      )}

      {tab === "ai-usage" && <AiUsageAdmin users={users} />}

      {/* 日志 */}
      {tab === "logs" && <LogsPanel />}

      {/* 用户管理 */}
      {tab === "users" && (
      <div className="panel">
        <h3>用户管理</h3>
        <div className="admin-table-wrap"><table className="admin-table">
          <thead>
            <tr><th>ID</th><th>用户名</th><th>角色</th><th>会员</th><th>积分</th><th>作答</th><th>已学</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.username}</td>
                <td>{u.role === "admin" ? <span className="tag">管理员</span> : "用户"}</td>
                <td>
                  {u.plan === "pro" ? (
                    <><span className="tag">PRO</span>{" "}<button className="btn-link" onClick={() => setMembership(u, 0)}>取消</button></>
                  ) : (
                    <button className="btn-link" onClick={() => setMembership(u, 30)}>开通30天</button>
                  )}
                </td>
                <td className="admin-credit-cell">
                  <span>{u.credits ?? 0}</span>
                  <button className="btn-link" onClick={() => openCreditAdjust(u)}>调整</button>
                </td>
                <td>{u.attempts}</td>
                <td>{u.learned}</td>
                <td>
                  <button className="game-delete-btn" onClick={() => delUser(u.id)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {creditUser && (
          <div className="modal-overlay" onClick={closeCreditAdjust}>
            <div className="modal admin-credit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="panel-head">
                <h3>调整积分</h3>
                <button className="modal-close" onClick={closeCreditAdjust} disabled={creditBusy}>×</button>
              </div>
              <p className="muted">
                用户：{creditUser.username}　当前余额：{creditUser.credits ?? 0}
              </p>
              <form className="admin-form" onSubmit={adjustCredits}>
                <label className="admin-credit-field">
                  <span>变动积分</span>
                  <input
                    className="import-input"
                    type="number"
                    step="1"
                    min="-100000"
                    max="100000"
                    placeholder="增加填正数，扣减填负数"
                    value={creditDelta}
                    onChange={(e) => setCreditDelta(e.target.value)}
                    autoFocus
                    disabled={creditBusy}
                  />
                </label>
                <label className="admin-credit-field">
                  <span>原因（选填）</span>
                  <input
                    className="import-input"
                    maxLength="80"
                    placeholder="例如：活动奖励、问题补偿"
                    value={creditReason}
                    onChange={(e) => setCreditReason(e.target.value)}
                    disabled={creditBusy}
                  />
                </label>
                {creditError && <div className="import-error">{creditError}</div>}
                <button className="btn-import-submit" type="submit" disabled={creditBusy}>
                  {creditBusy ? "提交中…" : "确认调整"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
      )}

      {/* 题库管理 */}
      {tab === "puzzles" && <PuzzleLibrary />}
    </div>
  );
}

const OS_LABEL = { windows: "Windows", macos: "macOS", linux: "Linux" };
const ENGINE_GUIDES = {
  xiangqi: {
    title: "标准象棋 UCI 引擎",
    description: "棋岛不提供或代下载引擎，也不指定推荐引擎。请根据服务器平台自行选择上游来源下载，再将文件放到服务器的非公开目录。",
    example: "例如 /opt/xiangqidao/engines/xiangqi/engine 或 D:\\engines\\xiangqi\\engine.exe",
  },
  jieqi: {
    title: "揭棋 UCI 引擎",
    description: "请选择明确支持揭棋扩展 FEN 的专用 UCI 引擎。标准象棋引擎不能直接用于揭棋。",
    example: "例如 /opt/xiangqidao/engines/jieqi/engine 或 D:\\engines\\jieqi\\engine.exe",
  },
};

function ServerEnginePanel({ variant }) {
  const guide = ENGINE_GUIDES[variant];
  const [status, setStatus] = React.useState(null);
  const [path, setPath] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    adminGetVariantEngine(variant).then((next) => {
      setStatus(next);
      setPath(next.configured_path || next.effective_path || "");
    }).catch((reason) => setError(reason.message));
  }, [variant]);

  async function save(nextPath = path.trim()) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const next = await adminUpdateVariantEngine(variant, nextPath);
      setStatus(next);
      setPath(next.configured_path || next.effective_path || "");
      setMessage(next.available ? "配置已保存，引擎文件已找到" : "配置已清除，当前使用内置能力");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="panel">
    <h3>{guide.title}</h3>
    <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{guide.description}</p>
    {status && <div className="import-row" style={{ alignItems: "center", marginBottom: 8 }}>
      <span className={"tag" + (status.available ? "" : " muted")}>
        {status.available ? "● 已找到用户引擎" : "○ 未配置用户引擎"}
      </span>
      <span className="muted" style={{ fontSize: 13 }}>服务器：{OS_LABEL[status.os] || status.os} / {status.arch}</span>
    </div>}
    <div className="import-row">
      <input className="import-input" value={path} onChange={(event) => setPath(event.target.value)} placeholder={guide.example} spellCheck={false} />
      <button className="btn-import-submit" disabled={busy || !path.trim()} onClick={() => save()}>{busy ? "检测中…" : "保存并检测"}</button>
      {status?.configured_path && <button className="game-delete-btn" style={{ width: "auto", padding: "0 12px" }} disabled={busy} onClick={() => save("")}>清除</button>}
    </div>
    <p className="muted" style={{ fontSize: 12 }}>
      引擎程序和权重可能采用不同许可；商业使用前请自行确认。棋岛只保存路径并通过 UCI 协议调用。
    </p>
    {error && <div className="import-error">{error}</div>}
    {message && <div className={status?.available ? "import-ok" : "muted"}>{message}</div>}
  </div>;
}

const DEFAULT_LLM_SETTINGS = {
  enabled: false,
  protocol: "openai_chat",
  base_url: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  thinking_enabled: true,
  reasoning_effort: "high",
  has_key: false,
  key_hint: "",
  active: false,
};

function normalizeLlmSettings(value) {
  const data = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_LLM_SETTINGS,
    ...data,
    protocol: data.protocol || DEFAULT_LLM_SETTINGS.protocol,
    base_url: data.base_url || DEFAULT_LLM_SETTINGS.base_url,
    model: data.model || DEFAULT_LLM_SETTINGS.model,
    thinking_enabled: data.thinking_enabled ?? DEFAULT_LLM_SETTINGS.thinking_enabled,
    reasoning_effort: data.reasoning_effort || DEFAULT_LLM_SETTINGS.reasoning_effort,
    key_hint: data.key_hint || "",
  };
}

function LlmSettingsPanel() {
  const [cfg, setCfg] = React.useState(null);
  const [keyInput, setKeyInput] = React.useState(""); // 仅在用户输入新密钥时使用
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    adminGetLlmSettings()
      .then((value) => setCfg(normalizeLlmSettings(value)))
      .catch((e) => setErr(`AI 配置加载失败：${e.message}`));
  }, []);

  if (!cfg) {
    return err ? (
      <div className="panel">
        <h3>AI 复盘设置（通用 LLM）</h3>
        <div className="import-error">{err}</div>
      </div>
    ) : null;
  }

  async function save(patch) {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const next = normalizeLlmSettings(await adminUpdateLlmSettings(patch));
      // 保存开关/密钥时保留尚未提交的接口表单，避免用户输入被响应覆盖。
      setCfg((current) => ({
        ...next,
        protocol: patch.protocol ?? current.protocol,
        base_url: patch.base_url ?? current.base_url,
        model: patch.model ?? current.model,
        thinking_enabled: patch.thinking_enabled ?? current.thinking_enabled,
        reasoning_effort: patch.reasoning_effort ?? current.reasoning_effort,
      }));
      setKeyInput("");
      setMsg("已保存");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const patch = {
        protocol: cfg.protocol,
        base_url: cfg.base_url.trim(),
        model: cfg.model.trim(),
        thinking_enabled: cfg.thinking_enabled,
        reasoning_effort: cfg.reasoning_effort,
      };
      if (keyInput.trim()) patch.api_key = keyInput.trim();
      const next = normalizeLlmSettings(await adminUpdateLlmSettings(patch));
      setCfg(next);
      setKeyInput("");
      const r = await adminTestLlmSettings();
      setMsg(`连接正常，模型回复：${r.reply}`);
    } catch (e) {
      setErr(`测试失败：${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel llm-settings-panel">
      <div className="llm-settings-header">
        <div>
          <div className="llm-eyebrow">AI SERVICE</div>
          <h3>AI 复盘</h3>
          <p>配置一个兼容的模型服务，用于失误讲解、整局总结与教练建议。</p>
        </div>
        <div className="llm-header-control">
          <span className={"llm-status " + (cfg.active ? "is-active" : "")}>
            <i />{cfg.active ? "运行中" : cfg.has_key ? "已停用" : "待配置"}
          </span>
          <label className="llm-switch">
            <input
              type="checkbox"
              checked={cfg.enabled}
              disabled={busy}
              onChange={(e) => save({ enabled: e.target.checked })}
            />
            <span aria-hidden="true" />
            <b>{cfg.enabled ? "已启用" : "已关闭"}</b>
          </label>
        </div>
      </div>

      <section className="llm-config-section">
        <div className="llm-section-heading">
          <div><span>01</span><strong>接口连接</strong></div>
          <p>支持 OpenAI Chat、Responses 与 Anthropic Messages 格式</p>
        </div>
        <div className="llm-endpoint-grid">
          <label className="llm-field">
            <span>接口格式</span>
            <select
              className="import-input"
              value={cfg.protocol}
              disabled={busy}
              onChange={(e) => setCfg({ ...cfg, protocol: e.target.value })}
            >
              <option value="openai_chat">OpenAI · Chat Completions</option>
              <option value="openai_responses">OpenAI · Responses</option>
              <option value="anthropic">Anthropic · Messages</option>
            </select>
          </label>
          <label className="llm-field llm-field-url">
            <span>Base URL</span>
            <input
              className="import-input"
              type="url"
              placeholder={cfg.protocol === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1"}
              value={cfg.base_url}
              onChange={(e) => setCfg({ ...cfg, base_url: e.target.value })}
            />
            <small>可填写版本根地址，系统会自动补全接口路径</small>
          </label>
          <label className="llm-field">
            <span>模型名称</span>
            <input
              className="import-input"
              placeholder={cfg.protocol === "anthropic" ? "claude-sonnet-4-5" : "gpt-4.1-mini"}
              value={cfg.model}
              disabled={busy}
              onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="llm-config-section llm-reasoning-section">
        <div className="llm-section-heading">
          <div><span>02</span><strong>推理设置</strong></div>
          <p>为推理模型预留思考预算；普通模型可关闭</p>
        </div>
        <div className="llm-reasoning-grid">
          <label className="llm-option-card">
            <span className="llm-option-copy">
              <strong>思考模式</strong>
              <small>{cfg.thinking_enabled ? "模型会先推理再生成复盘" : "直接生成回答，响应更快"}</small>
            </span>
            <span className="llm-switch llm-switch-only">
              <input
                type="checkbox"
                checked={cfg.thinking_enabled}
                disabled={busy}
                onChange={(e) => setCfg({ ...cfg, thinking_enabled: e.target.checked })}
              />
              <span aria-hidden="true" />
            </span>
          </label>
          <label className="llm-field llm-effort-field">
            <span>思考强度</span>
            <select
              className="import-input"
              value={cfg.reasoning_effort}
              disabled={busy || !cfg.thinking_enabled}
              onChange={(e) => setCfg({ ...cfg, reasoning_effort: e.target.value })}
            >
              <option value="low">Low · 更快</option>
              <option value="medium">Medium · 映射为 High</option>
              <option value="high">High · 推荐</option>
              <option value="xhigh">XHigh · 映射为 High</option>
              <option value="max">Max · 最深思考</option>
            </select>
            <small>{cfg.protocol === "openai_responses"
              ? "Responses 格式仅用于调整预算与超时"
              : "默认 High；Medium 与 XHigh 会映射为 High"}</small>
          </label>
        </div>
      </section>

      <section className="llm-config-section llm-key-section">
        <div className="llm-section-heading">
          <div><span>03</span><strong>访问密钥</strong></div>
          <p>{cfg.has_key ? `已安全保存 ${cfg.key_hint}` : "密钥仅保存在服务端"}</p>
        </div>
        <div className="llm-key-row">
          <div className="llm-key-input-wrap">
            <span aria-hidden="true">•••</span>
            <input
              className="import-input"
              type="password"
              placeholder={cfg.has_key ? "输入新密钥以替换当前配置" : "粘贴 API Key"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
          </div>
          <button
            className="llm-btn llm-btn-subtle"
            disabled={busy || !keyInput.trim()}
            onClick={() => save({ api_key: keyInput.trim() })}
          >
            {cfg.has_key ? "更新密钥" : "保存密钥"}
          </button>
          {cfg.has_key && (
            <button className="llm-btn llm-btn-danger" disabled={busy} onClick={() => save({ api_key: "" })}>
              清除
            </button>
          )}
        </div>
      </section>

      <div className="llm-settings-footer">
        <div className="llm-feedback">
          {err && <div className="import-error">{err}</div>}
          {msg && <div className="llm-success">{msg}</div>}
        </div>
        <button className="llm-btn llm-btn-secondary" disabled={busy || !cfg.base_url.trim() || !cfg.model.trim()} onClick={test}>
          {busy ? "连接中…" : "测试并保存"}
        </button>
        <button
          className="llm-btn llm-btn-primary"
          disabled={busy || !cfg.base_url.trim() || !cfg.model.trim()}
          onClick={() => save({
            protocol: cfg.protocol,
            base_url: cfg.base_url.trim(),
            model: cfg.model.trim(),
            thinking_enabled: cfg.thinking_enabled,
            reasoning_effort: cfg.reasoning_effort,
          })}
        >
          保存设置
        </button>
      </div>
    </div>
  );
}

const LOG_FILTERS = [
  { key: "", label: "全部" },
  { key: "login_failed", label: "登录失败" },
  { key: "admin_action", label: "管理操作" },
];
const EVENT_LABEL = { login_failed: "登录失败", admin_action: "管理操作" };
const PAGE = 50;

function LogsPanel() {
  const [rows, setRows] = React.useState([]);
  const [filter, setFilter] = React.useState("");
  const [offset, setOffset] = React.useState(0);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    adminLogs(PAGE, offset, filter)
      .then(setRows)
      .catch((e) => setErr(e.message));
  }, [filter, offset]);

  const pickFilter = (key) => {
    setFilter(key);
    setOffset(0);
  };

  return (
    <div className="panel">
      <h3>安全审计日志</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        记录登录失败与管理员敏感操作（删用户、删题、改 AI 设置），不含密码、密钥等敏感值。
      </p>

      <div className="admin-tabs" style={{ marginBottom: 12 }}>
        {LOG_FILTERS.map((f) => (
          <button
            key={f.key}
            className={filter === f.key ? "active" : ""}
            onClick={() => pickFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && <div className="import-error">{err}</div>}

      <div className="admin-table-wrap"><table className="admin-table">
        <thead>
          <tr><th>时间</th><th>类型</th><th>IP</th><th>用户/操作者</th><th>动作</th><th>目标</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ whiteSpace: "nowrap" }}>{r.ts}</td>
              <td>
                <span className={"tag" + (r.level === "warning" ? "" : " muted")}>
                  {EVENT_LABEL[r.event] || r.event}
                </span>
              </td>
              <td><code>{r.ip}</code></td>
              <td>{r.actor || "—"}</td>
              <td>{r.action || "—"}</td>
              <td>{r.target || "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="muted" style={{ textAlign: "center" }}>暂无日志</td></tr>
          )}
        </tbody>
      </table></div>

      <div className="import-row" style={{ marginTop: 10, alignItems: "center" }}>
        <button
          className="btn-import-submit"
          disabled={offset === 0}
          onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
        >
          上一页
        </button>
        <span className="muted" style={{ fontSize: 13 }}>第 {offset / PAGE + 1} 页</span>
        <button
          className="btn-import-submit"
          disabled={rows.length < PAGE}
          onClick={() => setOffset((o) => o + PAGE)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
