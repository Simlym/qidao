import React from "react";
import { getJieqiEngine, getPlayEngine } from "../api";

// 云端状态独立检测，不能把“允许远程降级”当成“服务器引擎已就绪”。
export function useCloudEngineStatus(variant = "xiangqi") {
  const [state, setState] = React.useState({ status: "checking", label: "正在检测云端引擎" });
  React.useEffect(() => {
    let controller;
    function refresh() {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const request = variant === "jieqi" ? getJieqiEngine : getPlayEngine;
      request({ signal }).then((info) => {
        if (signal.aborted) return;
        setState({ status: info.available ? "ready" : info.engine === "builtin" ? "builtin" : "unavailable", label: info.label });
      }).catch(() => {
        if (!signal.aborted) setState({ status: "error", label: "暂时无法连接云端引擎" });
      });
    }
    setState({ status: "checking", label: "正在检测云端引擎" });
    refresh();
    window.addEventListener("focus", refresh);
    return () => { controller?.abort(); window.removeEventListener("focus", refresh); };
  }, [variant]);
  return state;
}
