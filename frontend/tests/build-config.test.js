import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import createConfig from "../vite.config.js";

// 用独立目录模拟 Vite 环境文件，防止开发者的本地配置影响发布校验。
function withEnv(files, value, run) {
  const cwd = process.cwd();
  const previous = process.env.VITE_API_BASE_URL;
  const dir = mkdtempSync(join(tmpdir(), "xiangqidao-config-"));
  try {
    for (const [name, contents] of Object.entries(files)) writeFileSync(join(dir, name), contents);
    if (value === undefined) delete process.env.VITE_API_BASE_URL;
    else process.env.VITE_API_BASE_URL = value;
    process.chdir(dir);
    run();
  } finally {
    process.chdir(cwd);
    if (previous === undefined) delete process.env.VITE_API_BASE_URL;
    else process.env.VITE_API_BASE_URL = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("Web 与 PC 本地开发无需发布地址，移动端调试必须指定地址", () => {
  withEnv({}, undefined, () => {
    assert.doesNotThrow(() => createConfig({ mode: "production", command: "build" }));
    assert.doesNotThrow(() => createConfig({ mode: "tauri", command: "serve" }));
    assert.throws(() => createConfig({ mode: "android", command: "serve" }), /Android.*调试/);
  });
});

test("两个安装包发布均拒绝缺失、不安全及格式错误的地址", () => {
  for (const mode of ["tauri", "android"]) {
    for (const value of [undefined, "", " /api ", "http://server.example/api", "https://localhost/api", "https://127.1/api", "https://[::1]/api", "https://server.example", "https://server.example/api?token=x", "https://server.example/api#x", "https://user:pass@server.example/api"]) {
      withEnv({}, value, () => assert.throws(() => createConfig({ mode, command: "build" }), /发布构建/));
    }
  }
});

test("接受实际 HTTPS 地址并规范化首尾空格及斜杠", () => {
  for (const mode of ["tauri", "android"]) {
    withEnv({}, " https://server.example/prefix/api/// ", () => {
      const config = createConfig({ mode, command: "build" });
      assert.equal(JSON.parse(config.define["import.meta.env.VITE_API_BASE_URL"]), "https://server.example/prefix/api");
    });
    withEnv({}, "http://10.0.2.2:8000/api", () => {
      assert.doesNotThrow(() => createConfig({ mode, command: "serve" }));
    });
  }
});

test("各端读取对应 mode 配置，进程环境变量优先于本地文件", () => {
  const files = {
    ".env.local": "VITE_API_BASE_URL=/api",
    ".env.tauri.local": "VITE_API_BASE_URL=https://desktop.example/api",
    ".env.android.local": "VITE_API_BASE_URL=https://mobile.example/api",
  };
  for (const [mode, expected] of [["tauri", "desktop"], ["android", "mobile"]]) {
    withEnv(files, undefined, () => {
      const config = createConfig({ mode, command: "build" });
      assert.equal(JSON.parse(config.define["import.meta.env.VITE_API_BASE_URL"]), `https://${expected}.example/api`);
    });
    withEnv(files, "https://ci.example/api", () => {
      const config = createConfig({ mode, command: "build" });
      assert.equal(JSON.parse(config.define["import.meta.env.VITE_API_BASE_URL"]), "https://ci.example/api");
    });
  }
});
