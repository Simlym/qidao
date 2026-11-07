// GitHub Pages 提供可跨域读取的 Release 副本，Web/安卓均不占用业务站点带宽。
export const GITHUB_ENGINE_BASE = "https://simlym.github.io/qidao/engine-releases";
export function engineDeliveryUrl(spec, {
  base = import.meta.env?.VITE_ENGINE_DOWNLOAD_BASE_URL || GITHUB_ENGINE_BASE,
  allowHttp = Boolean(import.meta.env?.DEV),
} = {}) {
  if (!base) throw new Error("尚未配置 WASM 静态下载站点");
  let url;
  try { url = new URL(base); } catch { throw new Error("WASM 下载站点地址无效"); }
  if (!(url.protocol === "https:" || (allowHttp && url.protocol === "http:")) || url.username || url.password || url.search || url.hash
      || !url.pathname.replace(/\/$/, "").endsWith("/engine-releases")) throw new Error("WASM 下载站点须使用 HTTPS 且以 /engine-releases 结尾");
  if (!/^engines-\d{8}\.[1-9]\d*$/.test(spec.releaseTag) || !/^[A-Za-z0-9_.-]+\.zip$/.test(spec.fileName)) throw new Error("WASM 固定附件路径无效");
  return `${url.href.replace(/\/$/, "")}/${spec.releaseTag}/${spec.fileName}`;
}
