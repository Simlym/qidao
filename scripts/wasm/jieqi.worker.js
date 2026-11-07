// 揭棋传统评估候选：保持限知 FEN 和上游扩展着法，不加载任何 NNUE。
const queued = [];
let engine;
self.onmessage = ({ data }) => {
  if (typeof data !== "string") return;
  if (engine) engine.postMessage(data); else queued.push(data);
};
(async () => {
  try {
    importScripts("pikajieqi.js");
    engine = await PikaJieqi({
      mainScriptUrlOrBlob: new URL("pikajieqi.js", self.location.href).href,
      locateFile: (name) => new URL(name, self.location.href).href,
    });
    engine.addMessageListener((line) => self.postMessage(line));
    engine.postMessage("setoption name Threads value 1");
    engine.postMessage("setoption name Hash value 16");
    for (const command of queued.splice(0)) engine.postMessage(command);
  } catch (error) {
    self.postMessage({ type: "error", message: error.message || String(error) });
    engine?.terminate();
  }
})();
