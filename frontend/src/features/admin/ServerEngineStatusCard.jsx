import React from "react";
import EngineStatusCard from "../settings/EngineStatusCard";

// 两种服务器引擎共用状态文案和版本布局，安装流程仍由各自管理。
export default function ServerEngineStatusCard({ name, configured, setup = !configured, ready, busy, current, children }) {
  const title = setup ? `让服务器帮你分析${name}棋局` : `${name}引擎`;
  const description = setup ? "下载并安装适配的引擎，检查通过后自动启用。"
    : ready === true ? "可用于云端对弈、棋局复盘和题目生成，无需重复下载。"
      : ready === false ? "原配置仍保留，可重试检测或更换引擎。"
        : "无需重复安装。尚未检测运行状态，可点击“重新检测”确认。";
  const showConfigured = configured && !setup;
  const failed = showConfigured && ready === false;
  const status = showConfigured && <span className={`server-engine-status-badge${failed ? " is-warning" : ""}`}>
    {failed ? "已配置 · 检测未通过" : ready === true ? "已配置 · 检测通过" : "已配置"}
  </span>;

  return <EngineStatusCard label={`服务器${name}引擎状态`} title={title} description={description} busy={busy}
    ready={ready === true && !setup} configured={showConfigured} failed={failed} status={status}>
    {showConfigured && <dl className="engine-current-info server-engine-configured-info">
      <div><dt>当前引擎</dt><dd><strong>{current?.package.name || "自定义 UCI 引擎"}</strong>{current && <span>{current.package.version}</span>}</dd></div>
    </dl>}
    {children}
  </EngineStatusCard>;
}
