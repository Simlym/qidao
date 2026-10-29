import React from "react";

// Web 宽屏侧栏判断；PC 原生与 Android 保持由各自 shell 管理布局。
export function useWideWebLayout(runtime) {
  const [wideWeb, setWideWeb] = React.useState(() =>
    runtime === "web" && typeof window !== "undefined" && window.matchMedia("(min-width: 1100px)").matches
  );

  React.useEffect(() => {
    if (runtime !== "web") return undefined;
    const media = window.matchMedia("(min-width: 1100px)");
    const update = () => setWideWeb(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [runtime]);

  return wideWeb;
}
