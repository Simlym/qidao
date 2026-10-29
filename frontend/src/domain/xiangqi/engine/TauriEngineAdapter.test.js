import test from "node:test";
import assert from "node:assert/strict";
import { TauriEngineAdapter } from "./TauriEngineAdapter.js";

test("多棋种引擎即使选项超过日志上限，仍正确设置坐标与无权重选项", async () => {
  const adapter = new TauriEngineAdapter();
  const calls = [];
  let output;
  adapter.getProfile = () => ({ path: "engine.exe", uciVariant: "xiangqi", uciProtocol: "ucicyclone", useNnue: false, threads: 2, hashMb: 64 });
  adapter.modules = async () => ({
    listen: async (name, listener) => { if (name === "engine-output") output = listener; return () => {}; },
    invoke: async (name, options) => {
      calls.push([name, options]);
      if (options?.command === "uci") output({ payload: "option name UCI_Variant type combo default chess var xiangqi\noption name Protocol type combo default uci var ucicyclone\noption name Use NNUE type check default true\n" + Array.from({ length: 40 }, (_, i) => `option name Extra${i} type check default false`).join("\n") + "\nuciok" });
      if (options?.command === "isready") output({ payload: "readyok" });
    },
  });
  await adapter.boot();
  const commands = calls.filter(([name]) => name === "send_to_engine").map(([, args]) => args.command);
  assert.deepEqual(commands, ["uci", "setoption name UCI_Variant value xiangqi", "setoption name Protocol value ucicyclone", "setoption name Use NNUE value false", "ucinewgame", "isready"]);
});
