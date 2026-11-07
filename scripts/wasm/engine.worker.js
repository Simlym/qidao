// Fairy WASM 的线程运行时由上游维护；此入口只适配棋岛逐行 UCI 协议。
const queued = [];
let engine;
let networkPath;
self.onmessage = ({ data }) => {
  if (typeof data !== "string") return;
  if (!engine) queued.push(data);
  else dispatch(data);
};
function dispatch(command) {
  if (command.startsWith("setoption name EvalFile value ")) command = `setoption name EvalFile value ${networkPath}`;
  engine.postMessage(command);
}
(async () => {
  try {
    importScripts("stockfish.js");
    const bytes = await fetch("xiangqi-c07e94a5c7cb.nnue").then((response) => {
      if (!response.ok) throw new Error("网络文件读取失败");
      return response.arrayBuffer();
    });
    engine = await Stockfish({ locateFile: (name) => new URL(name, self.location.href).href });
    engine.addMessageListener((line) => self.postMessage(line));
    networkPath = "/xiangqi-c07e94a5c7cb.nnue";
    engine.FS.writeFile(networkPath, new Uint8Array(bytes));
    engine.postMessage("ucicyclone");
    engine.postMessage("setoption name UCI_Variant value xiangqi");
    engine.postMessage("setoption name Use NNUE value true");
    engine.postMessage(`setoption name EvalFile value ${networkPath}`);
    engine.postMessage("setoption name Threads value 1");
    engine.postMessage("setoption name Hash value 16");
    for (const command of queued.splice(0)) dispatch(command);
  } catch (error) {
    self.postMessage({ type: "error", message: error.message || String(error) });
    engine?.terminate();
  }
})();
