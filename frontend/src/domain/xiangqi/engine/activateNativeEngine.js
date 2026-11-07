// 配置切换是事务：新引擎无法启动时恢复旧配置，并关闭失败的进程。
let activationQueue = Promise.resolve();

export function activateNativeEngine(profile, options) {
  // 原生端只有一个引擎进程；新页面的启用等待旧事务清理，避免迟到回滚覆盖新配置。
  const task = activationQueue.then(() => activate(profile, options));
  activationQueue = task.catch(() => {});
  return task;
}

async function activate(profile, { manager, readProfile, writeProfile, removeProfile, isCurrent = () => true }) {
  const checkCurrent = () => { if (!isCurrent()) throw new Error("引擎启用已取消，设置页面已切换"); };
  checkCurrent();
  const previous = readProfile();
  let written = false;
  try {
    await manager.dispose();
    checkCurrent();
    writeProfile(profile);
    written = true;
    const kinds = await manager.availableKinds();
    checkCurrent();
    if (!kinds.includes("native")) throw new Error(manager.errorFor?.("native") || "本地引擎启动失败");
  } catch (error) {
    await manager.dispose().catch(() => {});
    if (written) {
      if (previous) writeProfile(previous);
      else removeProfile();
    }
    throw error;
  }
  return profile;
}
