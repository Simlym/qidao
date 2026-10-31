import React from "react";
import { localGames, localOwner, LOCAL_GAMES_CHANGED } from "../localGames.js";

export default function LocalGameLibrary({ onRestore }) {
  const [, refresh] = React.useReducer((n) => n + 1, 0);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    window.addEventListener(LOCAL_GAMES_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(LOCAL_GAMES_CHANGED, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  let records = [], guests = [];
  const owner = localOwner();
  try {
    records = localGames().list(owner);
    if (owner.startsWith("user:")) guests = localGames().guests();
  } catch { return <p role="alert">无法读取本机棋谱，请检查设备存储权限。</p>; }
  function claim() {
    if (!window.confirm("将此服务器下本机的游客对局归入当前账号？已完成的棋谱会自动上传。")) return;
    try { for (const record of guests) localGames().claim(record, owner); refresh(); }
    catch { setError("认领未完成，本机存储不可用，请稍后重试。"); }
  }
  function remove(record) {
    const message = record.serverId ? "删除这份本机记录？服务器棋谱会保留。" : "此对局尚未同步，删除后无法恢复。确定删除？";
    if (!window.confirm(message)) return;
    try { localGames().remove(record); refresh(); }
    catch { setError("删除失败，请检查设备存储权限。"); }
  }
  if (!records.length && !guests.length) return null;
  return <section className="panel">
    <h3>本机对局</h3>
    <p className="muted">进行中的对局可继续；已完成的棋谱登录原账号后自动同步。本机记录请保留应用数据。</p>
    {guests.length > 0 && <button onClick={claim}>认领本机游客对局（{guests.length}）</button>}
    {error && <p role="alert">{error}</p>}
    <ul>{records.map((record) => <li key={record.id}>
      <button className="btn-link" onClick={() => onRestore(record)}>
        {record.playedOn} · {record.moves.length} 手 · {record.over ? "查看对局" : "继续对局"}
      </button>{" "}
      <small>{record.serverId ? "已同步" : record.payload ? "已保存到本机 · 待同步" : "已保存到本机"}</small>
      {record.syncError && <span role="status"> · {record.syncError}</span>}
      {" "}<button className="btn-link" onClick={() => remove(record)}>删除本机记录</button>
    </li>)}</ul>
  </section>;
}
