import React from "react";
import {
  API_BASE_URL, DEFAULT_API_BASE_URL, probeServer, saveServerAddress, reloadForServerChange,
} from "../../shared/api";

export default function ServerSettings() {
  const [address, setAddress] = React.useState(API_BASE_URL);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const probe = React.useRef(null);
  React.useEffect(() => () => probe.current?.abort(), []);

  async function check(connect) {
    const controller = new AbortController();
    probe.current = controller;
    setBusy(true);
    setNotice(null);
    try {
      const result = await probeServer(address, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (connect) {
        saveServerAddress(result.base);
        reloadForServerChange();
      } else {
        setNotice({ text: `连接正常 · 服务版本 ${result.version}`, error: false });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setNotice({ error: true, text: error.name === "AbortError"
        ? "连接超时，请检查服务器地址和网络。"
        : `连接失败：${error.message}。请检查 HTTPS 证书、网络及服务器允许的客户端来源。` });
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function restore() {
    try {
      saveServerAddress(DEFAULT_API_BASE_URL);
      reloadForServerChange();
    } catch (error) {
      setNotice({ error: true, text: `无法保存服务器设置：${error.message}` });
    }
  }

  return (
    <div className="settings-group server-settings">
      <div className="settings-heading">
        <h2>服务器（高级）</h2>
        <p>默认使用客户端配置的服务，高级用户可以连接自己部署的棋岛后端。</p>
      </div>
      <dl className="server-addresses">
        <dt>当前服务器</dt><dd>{API_BASE_URL}</dd>
        <dt>默认服务器</dt><dd>{DEFAULT_API_BASE_URL}</dd>
      </dl>
      <p>各服务器的账号、会员、训练进度和棋谱相互独立。切换不会迁移数据；返回原服务器可继续使用原账号。</p>
      <label className="server-address-input">服务器 API 地址
        <input type="url" value={address} disabled={busy} spellCheck={false} autoCapitalize="none"
          placeholder="https://chess.example.com/api"
          onChange={(event) => { setAddress(event.target.value); setNotice(null); }} />
      </label>
      <p className="muted">请连接你信任的服务。检测连接不发送当前账号或游客信息。</p>
      <p>连接或恢复默认后会重新加载页面，未保存的对局将丢失。请先保存需要保留的棋谱。</p>
      <div className="server-actions">
        <button disabled={busy} onClick={() => check(false)}>{busy ? "连接中…" : "检测连接"}</button>
        <button disabled={busy || address === API_BASE_URL} onClick={() => check(true)}>连接并重新加载</button>
        <button disabled={busy || API_BASE_URL === DEFAULT_API_BASE_URL} onClick={restore}>恢复默认服务器</button>
      </div>
      {notice && <p role={notice.error ? "alert" : "status"} className={notice.error ? "server-error" : "server-success"}>{notice.text}</p>}
    </div>
  );
}
