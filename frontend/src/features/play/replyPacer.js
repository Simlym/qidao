// 引擎立即搜索，但快速应着至少与玩家落子间隔半秒，避免动画和音效重叠。
export function createReplyPacer({ delay = 500, now = Date.now, schedule = setTimeout, clear = clearTimeout } = {}) {
  let pending = null;
  function cancel() {
    if (!pending) return;
    clear(pending.timer);
    pending.resolve(false);
    pending = null;
  }
  return {
    cancel,
    waitSince(startedAt) {
      cancel();
      const remaining = delay - (now() - startedAt);
      if (remaining <= 0) return Promise.resolve(true);
      return new Promise((resolve) => {
        const timer = schedule(() => { pending = null; resolve(true); }, remaining);
        pending = { timer, resolve };
      });
    },
  };
}
