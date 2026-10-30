// 每次开局、走棋或重开都会产生新代次；旧异步结果不得覆盖新局面。
export function createGameEpoch() {
  let generation = 0;
  let disposed = false;
  return {
    begin() { disposed = false; return ++generation; },
    invalidate() { generation += 1; },
    isCurrent(ticket) { return !disposed && ticket === generation; },
    dispose() { disposed = true; generation += 1; },
  };
}
