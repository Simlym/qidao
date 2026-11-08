import React from "react";
import { hasLocalEngineConfiguration } from "../../domain/xiangqi/engine/localEngineConfiguration";
import "./engine-setup-guide.css";

// 本地引擎属于可选增强，保留云端对弈入口，由 App 决定跳转到哪一个设置分类。
export default function EngineSetupGuide({ variant = "xiangqi", localReady = false, onOpenSettings }) {
  if (!onOpenSettings || localReady || hasLocalEngineConfiguration(variant)) return null;
  const name = variant === "jieqi" ? "揭棋" : "象棋";
  return <aside className="engine-setup-guide" aria-label={`${name}引擎安装引导`}>
    <div><strong>还未配置本地{name}引擎</strong><p>下载或导入后，这台设备就能为你计算走法。已有可用的云端服务时，也可以继续使用。</p></div>
    <button type="button" onClick={onOpenSettings}>去下载或导入</button>
  </aside>;
}
