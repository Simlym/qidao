import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// 显式收集嵌套测试，避免不同 shell 的 ** 展开规则漏掉 API 和引擎测试。
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collect(path) : entry.name.endsWith(".test.js") ? [path] : [];
  });
}
const result = spawnSync(process.execPath, ["--test", ...collect("src").sort()], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
