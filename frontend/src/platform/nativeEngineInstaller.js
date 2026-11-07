async function invoke(command, args) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(command, args);
}

export const nativeInstallInfo = () => invoke("native_engine_install_info");
export const nativePackageInfo = (variant) => invoke("native_package_info", { variant });
export const cancelNativeInstall = () => invoke("cancel_native_engine_install");
export const openEngineInstallLink = (link) => invoke("open_engine_install_link", { link });
export const openNativePackageLink = (variant, packageId, link) => invoke("open_engine_install_link", { variant, packageId, link });
export const verifyNativeInstallation = ({ receipt }) => invoke("verify_native_engine_installation", {
  version: receipt.version, artifactId: receipt.artifactId,
});

export async function installNativeEngine(artifactId, onProgress) {
  const { Channel } = await import("@tauri-apps/api/core");
  const progress = new Channel();
  progress.onmessage = onProgress;
  return invoke("install_native_engine", { artifactId, progress });
}

export async function manageNativePackage({ variant, action, packageId = null, archivePath = null }, onProgress) {
  const { Channel } = await import("@tauri-apps/api/core");
  const progress = new Channel();
  progress.onmessage = onProgress;
  return invoke("manage_native_package", { variant, action, packageId, archivePath, progress });
}
