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
  const previousPresets = process.env.VITE_API_SERVERS;
  const dir = mkdtempSync(join(tmpdir(), "xiangqidao-config-"));
  try {
    delete process.env.VITE_API_SERVERS;
    for (const [name, contents] of Object.entries(files)) writeFileSync(join(dir, name), contents);
    if (value === undefined) delete process.env.VITE_API_BASE_URL;
    else process.env.VITE_API_BASE_URL = value;
    process.chdir(dir);
    run();
  } finally {
    process.chdir(cwd);
    if (previous === undefined) delete process.env.VITE_API_BASE_URL;
    else process.env.VITE_API_BASE_URL = previous;
    if (previousPresets === undefined) delete process.env.VITE_API_SERVERS;
    else process.env.VITE_API_SERVERS = previousPresets;
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

test("客户端编译多个预置地址，规范化去重，Web 不使用预置列表", () => {
  const files = { ".env": `VITE_API_SERVERS='[" https://BACKUP.example:443/api/// ","https://backup.example/api","https://team.example/prefix/api"]'` };
  for (const mode of ["tauri", "android", "production"]) {
    withEnv(files, "https://default.example/api", () => {
      const config = createConfig({ mode, command: "build" });
      assert.deepEqual(JSON.parse(config.define["import.meta.env.VITE_API_SERVERS"]),
        mode === "production" ? [] : ["https://backup.example/api", "https://team.example/prefix/api"]);
    });
  }
});

test("客户端拒绝格式错误或不安全的预置地址，离线包也校验在线预置", () => {
  for (const value of ["bad-json", '"https://server.example/api"', '[null]', '[42]', '["/api"]', '["http://server.example/api"]', '["https://127.1/api"]', '["https://localhost/api"]', '["https://[::1]/api"]', '["https://a:b@server.example/api"]', '["https://server.example/api?q=1"]', '["https://server.example/api#x"]', '["https://server.example"]']) {
    for (const mode of ["tauri", "android"]) {
      withEnv({ ".env": `VITE_OFFLINE_CLIENT=true\nVITE_API_SERVERS='${value}'` }, undefined, () => {
        assert.throws(() => createConfig({ mode, command: "build" }), /VITE_API_SERVERS/);
      });
    }
  }
  withEnv({ ".env": `VITE_API_SERVERS='["http://localhost:8000/api"]'` }, "http://localhost:8000/api", () => {
    assert.doesNotThrow(() => createConfig({ mode: "tauri", command: "serve" }));
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

test("显式离线客户端无需域名且忽略本地模拟器地址，Web 仍保持正常配置", () => {
  const files = { ".env": "VITE_OFFLINE_CLIENT=true", ".env.android.local": "VITE_API_BASE_URL=http://10.0.2.2:8000/api" };
  for (const mode of ["android", "tauri"]) {
    withEnv(files, undefined, () => {
      const config = createConfig({ mode, command: "build" });
      assert.equal(JSON.parse(config.define["import.meta.env.VITE_API_BASE_URL"]), "");
      assert.equal(JSON.parse(config.define["import.meta.env.VITE_OFFLINE_CLIENT"]), true);
    });
  }
  withEnv(files, "https://site.example/api", () => {
    const config = createConfig({ mode: "production", command: "build" });
    assert.equal(JSON.parse(config.define["import.meta.env.VITE_OFFLINE_CLIENT"]), false);
  });
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
