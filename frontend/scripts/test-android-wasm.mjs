// 对已安装测试 APK 的 WebView 做协议与缓存验收；通过 ADB 转发调试端口后执行。
import { chromium } from "../../.engine-build/browser-deps/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";

const browser = await chromium.connectOverCDP(process.env.QIDAO_ANDROID_CDP || "http://127.0.0.1:9223");
try {
  const page = browser.contexts()[0].pages().find((page) => page.url().startsWith("http://tauri.localhost/"));
  if (!page) throw new Error("未找到安卓应用 WebView");
  const variant = process.argv.includes("--jieqi") ? "jieqi" : "xiangqi";
  const report = await page.evaluate(async (variant) => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) throw new Error("Service Worker 未接管页面");
    const profile = JSON.parse(localStorage.getItem(`xq.browserEngine.${variant}`));
    if (!profile) throw new Error("请先在 APK 设置页导入单线程候选 ZIP");
    const worker = new Worker(profile.base + profile.entrypoint);
    const lines = [];
    const command = (commands, expected) => new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); worker.removeEventListener("message", listen); };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`等待 ${expected} 超时`)); }, 60000);
      const listen = ({ data }) => {
        if (typeof data === "string") {
          lines.push(data);
          if (data.startsWith(expected)) { cleanup(); resolve(data); }
        }
      };
      worker.addEventListener("message", listen);
      commands.forEach((text) => worker.postMessage(text));
    });
    try {
      await command(["uci"], "uciok");
      await command(["isready"], "readyok");
      const red = variant === "jieqi"
        ? "xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w A2B2N2R2C2P5a2b2n2r2c2p5 - 0 1"
        : "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
      const redMove = await command([`position fen ${red}`, "go depth 3 searchmoves h2e2"], "bestmove ");
      const blackMove = await command([`position fen ${red.replace(" w ", " b ")}`, "go depth 3 searchmoves h7e7"], "bestmove ");
      if (!redMove.startsWith("bestmove h2e2") || !blackMove.startsWith("bestmove h7e7")) throw new Error("红黑坐标或着法错误");
      const stopped = command(["go infinite"], "bestmove ");
      await new Promise((resolve) => setTimeout(resolve, 150));
      worker.postMessage("stop");
      await stopped;
      if (variant === "xiangqi" && !lines.some((line) => /NNUE evaluation using .* enabled/.test(line))) throw new Error("未确认 NNUE 启用");
      if (variant === "jieqi" && !lines.some((line) => line.includes("Qidao classical evaluation enabled"))) throw new Error("未确认传统评估启用");
      return { status: "passed", variant, userAgent: navigator.userAgent, serviceWorker: true, profile: profile.id, redMove, blackMove, stop: true, nnue: variant === "xiangqi" };
    } finally { worker.terminate(); }
  }, variant);
  writeFileSync(process.argv[2] || ".engine-build/android-wasm-test.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
