// 原生返回由前端按优先级消费；无人处理时交给安卓显示退出确认。
export const ANDROID_BACK_EVENT = "qidao:back";

export function createBackDispatcher() {
  const handlers = new Set();
  return {
    register(handle, priority = 0) {
      const entry = { handle, priority };
      handlers.add(entry);
      return () => handlers.delete(entry);
    },
    dispatch() {
      for (const entry of [...handlers].reverse().sort((a, b) => b.priority - a.priority)) {
        if (entry.handle()) return true;
      }
      return false;
    },
  };
}

export const backDispatcher = createBackDispatcher();

export function dismissTopDialog(document) {
  const dialogs = [...document.querySelectorAll("dialog[open]")];
  const dialog = dialogs.at(-1);
  if (!dialog) return false;
  const cancel = new Event("cancel", { cancelable: true });
  if (dialog.dispatchEvent(cancel)) dialog.close();
  return true;
}
