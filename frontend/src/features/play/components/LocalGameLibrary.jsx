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
  return <section className="panel local-game-library" aria-labelledby="local-games-title">
    <div className="local-library-heading">
      <div><h3 id="local-games-title">本机对局</h3><p className="muted">继续未完成的对局，或查看已保存的棋谱。</p></div>
      <span className="local-library-count">{records.length} 局</span>
    </div>
    {guests.length > 0 && <button className="local-claim-button" onClick={claim}>认领本机游客对局（{guests.length}）</button>}
    {error && <p role="alert" className="local-library-error">{error}</p>}
    <ul className="local-game-list">{records.map((record) => <li className="local-game-card" key={record.id}>
      <span className="local-game-mark" aria-hidden="true">{record.over ? "谱" : "弈"}</span>
      <div className="local-game-details">
        <div className="local-game-title"><strong>{record.playedOn}</strong><span className={record.over ? "local-game-state finished" : "local-game-state"}>{record.over ? "已结束" : "进行中"}</span></div>
        <p className="local-game-meta"><span>{record.moves.length} 手</span><span>{record.serverId ? "已同步到服务器" : record.payload ? "已保存到本机 · 待同步" : "已保存到本机"}</span></p>
        {record.syncError && <p className="local-game-sync-error" role="status">{record.syncError}</p>}
      </div>
      <div className="local-game-actions">
        <button className="local-game-resume" onClick={() => onRestore(record)} aria-label={`${record.over ? "查看" : "继续"} ${record.playedOn} 的 ${record.moves.length} 手对局`}>{record.over ? "查看棋谱" : "继续对局"}<span aria-hidden="true"> →</span></button>
        <button className="local-game-delete" onClick={() => remove(record)} aria-label={`删除 ${record.playedOn} 的 ${record.moves.length} 手本机记录`}>删除记录</button>
      </div>
    </li>)}</ul>
    <p className="local-library-footnote">已完成的棋谱登录原账号后自动同步。本机记录保存在当前设备，清除应用数据将丢失未同步的记录。</p>
  </section>;
}
