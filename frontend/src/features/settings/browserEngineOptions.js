import { validateWasmDownload } from "../../domain/xiangqi/engine/browserEngineInstaller.js";

export function browserEngineOptions(packages, variant, capabilities) {
  return packages.filter((item) => item.variant === variant).map((spec) => {
    try { validateWasmDownload(spec, variant, capabilities); return { spec, available: true }; }
    catch (error) { return { spec, available: false, reason: error.message }; }
  });
}

export function recommendedBrowserEngine(options) {
  return options.find((item) => item.available && !item.spec.threads)?.spec
    || options.find((item) => item.available)?.spec || null;
}
