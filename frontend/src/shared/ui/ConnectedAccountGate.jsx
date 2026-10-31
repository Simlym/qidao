import React from "react";

// 题库和高级服务统一要求账号与网络，基础本地对弈不经过此入口。
export default function ConnectedAccountGate({ user, onRequireLogin, title, children }) {
  const [online, setOnline] = React.useState(globalThis.navigator?.onLine !== false);
  React.useEffect(() => {
    const update = () => setOnline(globalThis.navigator?.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  if (!user) return <section className="panel">
    <h2>{title}需要登录</h2>
    <p>注册并登录后可联网使用题库与个人训练数据。本地引擎对弈可以直接使用。</p>
    <button onClick={onRequireLogin}>注册 / 登录</button>
  </section>;
  if (!online) return <section className="panel" role="status">
    <h2>{title}需要联网</h2><p>请连接网络后继续。你仍可使用本地引擎对弈。</p>
  </section>;
  return children;
}
