import { runtime, RUNTIME } from "./runtime.js";

// Web 默认同源分发；安卓可指定同一静态站点。下载仍按固定 Release 的哈希验真。
export function engineDeliveryUrl(spec, {
  base = import.meta.env?.VITE_ENGINE_DOWNLOAD_BASE_URL || (runtime === RUNTIME.WEB && globalThis.location?.origin
    ? `${location.origin}/engine-releases` : ""),
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
