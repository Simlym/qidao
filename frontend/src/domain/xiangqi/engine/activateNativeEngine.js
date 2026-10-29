// 配置切换是事务：新引擎无法启动时恢复旧配置，并关闭失败的进程。
export async function activateNativeEngine(profile, { manager, readProfile, writeProfile, removeProfile }) {
  const previous = readProfile();
  try {
    await manager.dispose();
    writeProfile(profile);
    const kinds = await manager.availableKinds();
    if (!kinds.includes("native")) throw new Error(manager.errorFor?.("native") || "本地引擎启动失败");
  } catch (error) {
    await manager.dispose().catch(() => {});
    if (previous) writeProfile(previous);
    else removeProfile();
    throw error;
  }
  return profile;
}
