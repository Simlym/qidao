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
        <p>管理服务连接。通常无需修改，使用自建服务时再进行设置。</p>
      </div>
      <div className="server-current-heading"><strong>服务地址</strong><span>{API_BASE_URL === DEFAULT_API_BASE_URL ? "使用默认服务" : "使用自定义服务"}</span></div>
      <dl className="server-addresses">
        <dt>当前服务器</dt><dd>{API_BASE_URL}</dd>
      </dl>
      <p className="server-description">各服务器的账号、会员、训练进度和棋谱相互独立。切换不会迁移数据；返回原服务器可继续使用原账号。</p>
      <div className="server-edit-card">
      <h3>连接其他服务器</h3>
      <label className="server-address-input">服务器 API 地址
        <input type="url" value={address} disabled={busy} spellCheck={false} autoCapitalize="none" aria-describedby="server-address-help"
          placeholder="https://chess.example.com/api"
          onChange={(event) => { setAddress(event.target.value); setNotice(null); }} />
      </label>
      <p id="server-address-help" className="server-help">请连接你信任的服务。检测连接不发送当前账号或游客信息。</p>
      <p className="server-warning">连接或恢复默认后会重新加载页面。象棋已保存的回合可在原服务器的「本机对局」中继续；正在计算的回合及其他未保存内容可能丢失。</p>
      <div className="server-actions">
        <button disabled={busy} onClick={() => check(false)}>{busy ? "连接中…" : "检测连接"}</button>
        <button className="server-connect" disabled={busy || address === API_BASE_URL} onClick={() => check(true)}>连接并重新加载</button>
        <button disabled={busy || API_BASE_URL === DEFAULT_API_BASE_URL} onClick={restore}>恢复默认服务器</button>
      </div>
      </div>
      {notice && <p role={notice.error ? "alert" : "status"} className={notice.error ? "server-error" : "server-success"}>{notice.text}</p>}
    </div>
  );
}
