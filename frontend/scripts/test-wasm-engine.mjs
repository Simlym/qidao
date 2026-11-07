// 真实发行候选的浏览器安装与协议回归；不修改正式下载清单。
import { createServer as httpServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
const { chromium } = await import(pathToFileURL(resolve(".engine-build/browser-deps/node_modules/playwright/index.mjs")));

const directory = resolve(process.argv[2]);
const result = JSON.parse(readFileSync(resolve(directory, "build-result.json"), "utf8"));
const archive = readFileSync(resolve(directory, result.fileName));
const spec = { id: "wasm-browser-candidate", packageId: result.manifest.id, name: result.manifest.name,
  version: result.manifest.version, variant: result.manifest.variant, runtime: "wasm", threads: Boolean(result.manifest.threads), publicDownload: true,
  releaseTag: "engines-20261107.3", fileName: result.fileName, size: result.size, sha256: result.sha256,
  manifestSha256: result.manifestSha256,
  url: `https://github.com/Simlym/qidao/releases/download/engines-20261107.3/${result.fileName}` };
const vite = await createServer({ root: resolve("frontend"), server: { middlewareMode: true }, appType: "custom" });
const server = httpServer(async (request, response) => {
  if (spec.threads) {
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  }
  if (request.url === "/harness") {
    response.setHeader("Content-Type", "text/html");
    response.end(await vite.transformIndexHtml("/harness", '<!doctype html><html><head><title>WASM 验收</title></head><body><div id="root"></div></body></html>'));
  }
  else if (request.url === "/candidate.zip") { response.setHeader("Content-Type", "application/zip"); response.end(archive); }
  else vite.middlewares(request, response, () => { response.writeHead(404); response.end(); });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch(process.env.QIDAO_CHROME_PATH ? { executablePath: process.env.QIDAO_CHROME_PATH } : {});
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (message) => console.log(`浏览器：${message.text()}`));
  await page.goto(`http://127.0.0.1:${server.address().port}/harness`);
  const report = await page.evaluate(async (spec) => {
    const { installBrowserEngine } = await import("/src/domain/xiangqi/engine/browserEngineInstaller.js");
    const local = await import("/src/domain/xiangqi/engine/localEngine.js");
    const { ensureBrowserEngineStorage } = await import("/src/platform/browserEngineStorage.js");
    if (!spec.threads && (crossOriginIsolated || typeof SharedArrayBuffer !== "undefined")) throw new Error("单线程测试必须在无共享内存环境执行");
    await ensureBrowserEngineStorage();
    const variant = spec.variant;
    const profile = await installBrowserEngine(spec, variant, {
      deliveryUrl: () => "/candidate.zip", probe: local.probeBrowserEngineProfile,
    });
    const worker = await local.getLocalEngine(variant);
    if (!worker) throw new Error("安装后的引擎无法启动");
    const transcript = [];
    worker.addEventListener("message", (event) => { if (typeof event.data === "string") transcript.push(event.data); });
    const search = (commands) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { worker.removeEventListener("message", listen); reject(new Error("试算超时")); }, 30000);
      const listen = ({ data }) => {
        if (typeof data === "string" && data.startsWith("bestmove ")) {
          clearTimeout(timer); worker.removeEventListener("message", listen); resolve(data);
        }
      };
      worker.addEventListener("message", listen);
      for (const command of commands) worker.postMessage(command);
    });
    const red = variant === "jieqi"
      ? "xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w A2B2N2R2C2P5a2b2n2r2c2p5 - 0 1"
      : "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
    const black = red.replace(" w ", " b ");
    const redMove = await search([`position fen ${red}`, "go depth 3 searchmoves h2e2"]);
    const blackMove = await search([`position fen ${black}`, "go depth 3 searchmoves h7e7"]);
    if (!redMove.startsWith("bestmove h2e2") || !blackMove.startsWith("bestmove h7e7")) throw new Error("红黑坐标或着法不正确");
    await search(["setoption name MultiPV value 3", `position fen ${red}`, "go depth 3"]);
    if (![1, 2, 3].every((index) => transcript.some((line) => line.includes(`multipv ${index} `)))) throw new Error("多候选输出不完整");
    const stopped = search(["go infinite"]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const stopStarted = performance.now();
    worker.postMessage("stop");
    await stopped;
    const stopLatencyMs = Math.round(performance.now() - stopStarted);
    const reset = await search(["ucinewgame", `position fen ${black}`, "go depth 2 searchmoves h7e7"]);
    if (!reset.startsWith("bestmove h7e7")) throw new Error("停止后新局面失效");
    await new Promise((resolve, reject) => {
      const moves = [];
      const timer = setTimeout(() => { worker.removeEventListener("message", listen); reject(new Error("连续停止与重开超时")); }, 30000);
      const listen = ({ data }) => {
        if (typeof data !== "string" || !data.startsWith("bestmove ")) return;
        moves.push(data);
        if (moves.length !== 2) return;
        clearTimeout(timer); worker.removeEventListener("message", listen);
        if (moves[0].startsWith("bestmove h2e2") && moves[1].startsWith("bestmove h7e7")) resolve();
        else reject(new Error(`连续搜索顺序错误：${moves.join(", ")}`));
      };
      worker.addEventListener("message", listen);
      for (const command of [`position fen ${red}`, "go infinite searchmoves h2e2", "stop", "ucinewgame", `position fen ${black}`, "go depth 2 searchmoves h7e7"]) worker.postMessage(command);
    });
    if (variant === "xiangqi" && !transcript.some((line) => /NNUE evaluation using .* enabled/.test(line))) throw new Error("未确认 NNUE 启用");
    if (variant === "jieqi" && !transcript.some((line) => line.includes("Qidao classical evaluation enabled"))) throw new Error("未确认传统评估启用");
    let limitedKnowledge = null;
    if (variant === "jieqi") {
      const rules = await import("/src/domain/xiangqi/jieqi/rules.js");
      // 红方吃掉一个暗子；黑方视角不能知道被吃暗子的真实身份。
      let authority = rules.applyJieqiMove(red, "h2h9Rp");
      const moves = [];
      for (let turn = 0; turn < 6; turn++) {
        const side = authority.split(" ")[1];
        const limited = rules.generateLimitedKnowledgeFen(authority, side);
        if (turn === 0 && limited === authority) throw new Error("限知局面未隐藏被吃暗子身份");
        const best = await search(["ucinewgame", `position fen ${limited}`, "go depth 2"]);
        const move = best.split(" ")[1];
        if (!rules.legalJieqiMoves(authority).includes(move.slice(0, 4))) throw new Error(`揭棋引擎与棋岛规则不一致：${move}`);
        authority = rules.applyJieqiMove(authority, move, { perspective: side, random: () => 0 });
        moves.push(move);
      }
      limitedKnowledge = { capturedIdentityHidden: true, legalPlies: moves.length, moves };
    }
    return { status: "passed", profile, redMove, blackMove, multiPv: 3, stopAndReset: true, stopLatencyMs, queuedRestart: true, crossOriginIsolated, sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined", nnue: variant === "xiangqi", limitedKnowledge, transcript };
  }, spec);
  await context.setOffline(true);
  report.offlineRestart = await page.evaluate(async (variant) => {
    const local = await import("/src/domain/xiangqi/engine/localEngine.js");
    local.resetLocalEngine(variant);
    return local.localEngineReady(variant);
  }, spec.variant);
  if (!report.offlineRestart) throw new Error("离线重新启动失败");
  if (process.argv.includes("--ui-import")) {
    await context.setOffline(false);
    await page.reload();
    await page.evaluate(() => import("/scripts/wasm-import-harness.jsx"));
    const picker = page.getByLabel("选择 ZIP 引擎包", { exact: true });
    if (await picker.getAttribute("webkitdirectory") !== null) throw new Error("ZIP 入口仍然只能选择目录");
    await picker.setInputFiles(resolve(directory, result.fileName));
    await page.getByText("ZIP 引擎包已导入并启用，无需手动解压。", { exact: true }).waitFor({ timeout: 90000 });
    report.filePickerImport = true;
  }
  writeFileSync(resolve(directory, "browser-test.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, transcript: undefined }));
} finally {
  await browser?.close();
  await vite.close();
  await new Promise((resolve) => server.close(resolve));
}
