// 单线程队列与上游接口一致；C++ 通过 Asyncify 协作让出事件循环。
class Queue {
  constructor() { this.list = []; this.getter = null; }
  async get() {
    if (this.list.length) return this.list.shift();
    return new Promise((resolve) => { this.getter = resolve; });
  }
  put(command) {
    if (this.getter) { const resolve = this.getter; this.getter = null; resolve(command); }
    else this.list.push(command);
  }
  pendingStop() {
    for (const command of this.list) {
      if (/^go(?:\s|$)/.test(command)) break;
      if (/^(stop|quit)(?:\s|$)/.test(command)) return true;
    }
    return false;
  }
}
Module["queue"] = new Queue();
Module["qidaoStopRequested"] = false;
Module["qidaoPonderhit"] = false;
Module["postMessage"] = (command) => {
  if (/^(stop|quit)(?:\s|$)/.test(command)) Module["qidaoStopRequested"] = true;
  if (/^ponderhit(?:\s|$)/.test(command)) Module["qidaoPonderhit"] = true;
  Module["queue"].put(command);
};
const listeners = [];
Module["addMessageListener"] = (listener) => listeners.push(listener);
Module["removeMessageListener"] = (listener) => {
  const index = listeners.indexOf(listener);
  if (index >= 0) listeners.splice(index, 1);
};
Module["print"] = Module["printErr"] = (line) => {
  for (const listener of listeners) listener(line);
};
Module["terminate"] = () => Module["postMessage"]("quit");
