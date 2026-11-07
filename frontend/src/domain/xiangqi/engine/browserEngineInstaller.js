import { unzip } from "fflate";
import { downloadEngineBytes } from "../../../shared/api/enginePackages.js";
import { browserEngineCapabilities, getBrowserEngineProfile, importBrowserEnginePackage,
  discardBrowserEnginePackage, commitBrowserEnginePackage } from "./browserEnginePackages.js";

const LIMIT = 256 * 1024 * 1024;
const sha = async (bytes) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
  .map((value) => value.toString(16).padStart(2, "0")).join("");
const validHash = (value) => /^[a-f0-9]{64}$/.test(value);
const safePath = (path) => typeof path === "string" && path.length <= 240
  && path.split("/").every((part) => /^[A-Za-z0-9_. -]+$/.test(part) && part !== "." && part !== "..");

export function validateWasmDownload(spec, variant, capabilities = browserEngineCapabilities()) {
  if (!spec?.publicDownload) throw new Error("此 WASM 版本尚未公开下载");
  if (spec.variant !== variant || spec.runtime !== "wasm") throw new Error("引擎棋种或运行时不匹配");
  if (!Number.isSafeInteger(spec.size) || spec.size < 1 || spec.size > LIMIT
      || !validHash(spec.sha256) || !validHash(spec.manifestSha256)) throw new Error("WASM 固定清单不完整");
  const prefix = `https://github.com/Simlym/qidao/releases/download/${spec.releaseTag}/`;
  if (!/^engines-\d{8}\.[1-9]\d*$/.test(spec.releaseTag) || !/^[A-Za-z0-9_.-]+\.zip$/.test(spec.fileName)
      || spec.url !== prefix + spec.fileName) throw new Error("WASM 下载地址不是固定的棋岛 Release 附件");
  if (!capabilities.webAssembly || !capabilities.worker || !capabilities.cacheStorage) throw new Error("当前环境不支持 WASM 引擎安装");
  if (spec.threads && !capabilities.threads) throw new Error("此版本需要多线程隔离支持，请选择单线程版本");
}

async function extract(bytes, signal) {
  return new Promise((resolve, reject) => {
    let count = 0, total = 0, stop;
    const names = new Set();
    const abort = () => { stop?.(); reject(new DOMException("已取消安装", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      signal?.throwIfAborted();
      stop = unzip(bytes, { filter: ({ name, originalSize, compression }) => {
        if (!safePath(name) || names.has(name) || ++count > 40 || ![0, 8].includes(compression)
            || !Number.isSafeInteger(originalSize) || originalSize < 0 || (total += originalSize) > LIMIT) {
          throw new Error("ZIP 路径、文件数量或解压大小不符合限制");
        }
        names.add(name);
        return true;
      } }, (error, files) => {
        signal?.removeEventListener("abort", abort);
        if (error) reject(error); else resolve(files);
      });
    } catch (error) {
      signal?.removeEventListener("abort", abort);
      stop?.();
      reject(error);
    }
  });
}

// 来源必须是客户端内嵌清单；测试可注入输送和试算，生产不接受用户填写 URL。
export async function installBrowserEngine(spec, variant, {
  signal, onProgress, probe, beforeCommit = async () => {}, isCurrent = () => true,
  download = downloadEngineBytes, capabilities = browserEngineCapabilities(),
} = {}) {
  validateWasmDownload(spec, variant, capabilities);
  const check = () => {
    signal?.throwIfAborted();
    if (!isCurrent()) throw new DOMException("安装会话已结束", "AbortError");
  };
  let profile;
  try {
    check();
    const bytes = await download(spec.url, spec.size, { signal, onProgress });
    check();
    onProgress?.({ phase: "verifying", downloaded: spec.size, total: spec.size });
    if (bytes.length !== spec.size || await sha(bytes) !== spec.sha256) throw new Error("WASM ZIP 校验失败");
    const files = await extract(bytes, signal);
    check();
    if (!files["engine-manifest.json"] || await sha(files["engine-manifest.json"]) !== spec.manifestSha256) throw new Error("WASM 清单校验失败");
    const manifest = JSON.parse(new TextDecoder().decode(files["engine-manifest.json"]));
    if (manifest.id !== spec.packageId || manifest.version !== spec.version || manifest.variant !== variant
        || manifest.runtime !== "wasm" || manifest.protocol !== "uci" || manifest.schemaVersion !== 1
        || !safePath(manifest.entrypoint) || !Array.isArray(manifest.assets)) throw new Error("WASM 包身份不匹配");
    const expected = new Set(["engine-manifest.json"]);
    for (const asset of manifest.assets) {
      if (!safePath(asset.path) || expected.has(asset.path) || !validHash(asset.sha256)
          || !files[asset.path] || files[asset.path].length !== asset.size
          || await sha(files[asset.path]) !== asset.sha256) throw new Error("WASM 资源校验失败");
      expected.add(asset.path);
    }
    if (!expected.has(manifest.entrypoint) || Object.keys(files).some((name) => !expected.has(name))) throw new Error("WASM 包存在未登记资源");
    check();
    onProgress?.({ phase: "saving", downloaded: spec.size, total: spec.size });
    profile = await importBrowserEnginePackage(Object.entries(files).map(([name, bytes]) => new File([bytes], `package/${name}`)), variant, { staged: true });
    check();
    onProgress?.({ phase: "testing", downloaded: spec.size, total: spec.size });
    if (typeof probe !== "function" || !await probe(profile, signal)) throw new Error("WASM 启动或 UCI 握手失败，原引擎已保留");
    check();
    await beforeCommit();
    check();
    const previous = getBrowserEngineProfile(variant);
    commitBrowserEnginePackage(profile);
    const committed = profile;
    profile = null;
    // 提交后无需等待旧文件清理，避免已生效的安装仍显示可取消状态。
    void discardBrowserEnginePackage(previous).catch(() => {});
    return committed;
  } catch (error) {
    if (profile) await discardBrowserEnginePackage(profile).catch(() => {});
    throw error;
  }
}
