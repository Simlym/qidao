import React from "react";
import { hasLocalEngineConfiguration } from "../../domain/xiangqi/engine/localEngineConfiguration";
import "./engine-setup-guide.css";

// 优先引导用户在本机计算，由 App 决定跳转到哪一个设置分类。
export default function EngineSetupGuide({ variant = "xiangqi", localReady = false, onOpenSettings }) {
  if (!onOpenSettings || localReady || hasLocalEngineConfiguration(variant)) return null;
  const name = variant === "jieqi" ? "揭棋" : "象棋";
  return <aside className="engine-setup-guide" aria-label={`${name}引擎安装引导`}>
    <div><strong>推荐使用本机{name}引擎</strong><p>下载并配置后，走法计算将在这台设备上完成，无需占用云端计算资源，也能减少云端繁忙时的等待。已有引擎文件也可导入。</p></div>
    <button type="button" onClick={onOpenSettings}>下载并配置</button>
  </aside>;
}
