import { getBrowserEngineProfile } from "./browserEnginePackages.js";
import { getNativeEngineProfile } from "./TauriEngineAdapter.js";
import { runtime, supportsNativeEngine } from "../../../platform/runtime.js";

// 各端使用各自的配置，浏览器缓存不能替代 PC 的原生程序路径。
export function hasLocalEngineConfiguration(variant = "xiangqi", platform = runtime) {
  if (supportsNativeEngine(platform)) return Boolean(getNativeEngineProfile(variant)?.path);
  const profile = getBrowserEngineProfile(variant);
  return Boolean(profile?.base && profile?.entrypoint);
}
