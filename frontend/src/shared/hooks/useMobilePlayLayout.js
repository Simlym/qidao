import React from "react";
import { runtime, RUNTIME } from "../../platform/runtime";

// 安卓始终使用触屏对局布局；浏览器根据窗口宽度切换，PC 客户端保留侧栏。
export function useMobilePlayLayout() {
  const query = "(max-width: 760px), (max-width: 1024px) and (max-height: 500px)";
  const [narrow, setNarrow] = React.useState(() => window.matchMedia(query).matches);
  React.useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return runtime === RUNTIME.ANDROID || (runtime === RUNTIME.WEB && narrow);
}
