import React from "react";

export default function EngineMessage({ message }) {
  return <div className={message.error ? "engine-feedback is-error" : "engine-feedback"} role={message.error ? "alert" : "status"}><p>{message.summary}</p>{message.detail && <details><summary>查看详情</summary><p className="engine-path">{message.detail}</p></details>}</div>;
}
