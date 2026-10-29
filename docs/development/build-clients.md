# 客户端配置、构建与本地开发

所有命令注明了执行目录。Web、Windows、Android 共用 `frontend/`；Tauri 工程位于仓库根目录 `src-tauri/`。普通用户使用方式见 [README](../../README.md)，服务器部署见[后端部署](../deployment/backend.md)。

## 地址配置规则

统一使用 `VITE_API_BASE_URL`，它是**构建时默认地址**，修改后必须重新构建、分发客户端。当前尚未实现应用内切换服务器。没有可用的官方地址时，请填写你自己的服务地址，示例域名仅为占位符。

| 场景 | 命令（在 `frontend/`） | 推荐本地配置 | 未配置时 |
| --- | --- | --- | --- |
| Web 开发 | `npm run dev` | `.env.local` | 同源 `/api`，Vite 代理到 `http://localhost:8000` |
| Web 发布 | `npm run build` | `.env.production.local` | 同源 `/api`，由部署者配置反向代理 |
| Windows 调试 | `npm run tauri dev` | `.env.tauri.local` | `http://localhost:8000/api` |
| Windows 发布 | `npm run tauri build` | `.env.tauri.local` | 构建报错，必须配置地址 |
| Android 调试 | `npm run tauri android dev` | `.env.android.local` | 构建报错，必须配置设备可访问的完整地址 |
| Android 发布 | 见下方 APK / AAB 命令 | `.env.android.local` | 构建报错，必须配置地址 |

底层前端命令分别是 `dev:tauri` / `build:tauri`（Vite `tauri` mode）与 `dev:android` / `build:android`（`android` mode）。Web 发布使用默认 `production` mode。

Vite 优先级从高到低：命令进程已有环境变量 → `.env.[mode].local` → `.env.[mode]` → `.env.local` → `.env`。因此 `.env.production.local` 不会应用于 `tauri` / `android`；通用 `.env.local` 会影响所有 mode，建议只放真正共用的配置。所有这些文件均在 `frontend/` 目录；本地覆盖文件已加入 Git 忽略。

Windows / Android 发布必须为完整 HTTPS 地址，以 `/api` 结尾，不含账号、查询参数或片段，且不得指向 localhost / 回环地址。调试允许 HTTP；Windows 调试可使用 localhost，Android 的 localhost 指向手机自身。末尾斜杠和首尾空格会自动去除。

**`VITE_*` 会进入公开产物，不得包含数据库密码、LLM 密钥、管理员密码或用户 token。** 前端地址配置不同于 `backend/.env` 和 Compose 根目录 `.env`。

## 本地启动后端与 Web

准备 Python 3.10+、[uv](https://docs.astral.sh/uv/)、Node.js 18+ 和 npm。

从仓库根目录启动后端：

```bash
cd backend
uv sync
uv run python -m app
```

后端默认 `http://127.0.0.1:8000`，开发 API 文档在 `/docs`。数据库迁移自动执行，空公共题库自动导入 `backend/seeds/`；无需手动建表。可复制 `backend/.env.example` 为 `backend/.env` 调整配置，真实环境变量优先。

另开终端，从仓库根目录启动 Web：

```bash
cd frontend
npm ci
npm run dev
```

访问 `http://localhost:5173`。不需要 `.env` 即可连接本地后端。需要自定义时，从 `frontend/` 执行：

```bash
cp .env.example .env.local
```

编辑 `VITE_API_BASE_URL`；Web 发布专用配置可改为复制到 `.env.production.local`。独立 API 示例：`VITE_API_BASE_URL=https://api.example.com/api`，后端必须允许该 Web 来源的 CORS。HTTPS 页面也应连接 HTTPS API。

```bash
npm run build
npm run preview
```

产物为 `frontend/dist/`。`preview` 仅预览静态产物，不提供 `/api` 反向代理；连接同源后端请使用 Compose / Nginx。正式服务器需要提供 SPA 回退、`/api` 代理和跨源隔离头，参考 [nginx.conf](../../frontend/nginx.conf)。Docker 的 Web 地址通过根目录 `.env` 中的同名构建参数配置，见[部署文档](../deployment/backend.md)。

## Windows PC

安装 [Tauri 2 所需环境](https://v2.tauri.app/start/prerequisites/)（包括 Rust、Windows C++ 构建工具和 WebView2）。从仓库根目录执行：

```powershell
Copy-Item frontend/.env.tauri.example frontend/.env.tauri.local
cd frontend
npm ci
```

编辑 `.env.tauri.local`：

```dotenv
VITE_API_BASE_URL=https://your-server.example.com/api
```

调试本机服务时可改为 `http://localhost:8000/api`；正式打包前恢复为实际部署的 HTTPS 地址。

```powershell
npm run tauri dev
npm run tauri build
```

安装包在 `src-tauri/target/release/bundle/`。仅验证前端资源可运行 `npm run build:tauri`，产物在 `frontend/dist-tauri/`，不生成 Windows 安装包。

服务器 `CORS_ORIGINS` 通常需包含 `http://tauri.localhost`。原生引擎仍由用户自行下载并在本机设置中选择，见[引擎说明](../engines/README.md)。

## Android

安装 Android Studio 所需 SDK/NDK、JDK、Rust Android targets 及 [Tauri 移动端前置环境](https://v2.tauri.app/start/prerequisites/)。从仓库根目录执行：

```powershell
Copy-Item frontend/.env.android.example frontend/.env.android.local
cd frontend
npm ci
npm run tauri android init
```

编辑 `.env.android.local` 的 `VITE_API_BASE_URL`。正式构建使用实际 HTTPS 服务。模拟器调试可用 `http://10.0.2.2:8000/api`，真机使用电脑局域网地址；后端需监听 `0.0.0.0` 并允许防火墙入站。HTTP 调试还需在生成的 Android 调试工程允许明文流量，优先使用 HTTPS 测试服务。

连接开启 USB 调试的手机后执行：

```powershell
npm run tauri android dev
```

Tauri 会自动合并 `src-tauri/tauri.android.conf.json`，使用 `dev:android` / `build:android`；npm 脚本会先切换到仓库根目录。API 必须是完整地址；Android 的 `tauri.localhost` 资源代理不能可靠传递 POST 请求体。修改环境文件后停止并重新启动调试。

生成 APK / AAB：

```powershell
npm run tauri android build -- --apk
npm run tauri android build -- --aab
```

服务器通常需要允许 `https://tauri.localhost`；以实际 WebView 的 Origin 为准。前端构建通过不等于设备安装、签名和兼容性验证通过。

### 发布签名

release APK 需要签名才能安装。一次性生成并备份仓库外的 keystore：

```powershell
keytool -genkeypair -v -keystore E:\keys\xiangqidao-release.keystore -alias xiangqidao -keyalg RSA -keysize 2048 -validity 10000
```

生成的 `src-tauri/gen/` 不入库。每次重新 `android init` 后，检查 `gen/android/app/build.gradle.kts` 是否配置了发布签名；仅设置环境变量不会自动创建签名配置。在其 `android { ... }` 内加入（已有同名配置时合并）：

```kotlin
signingConfigs {
    create("release") {
        val keystorePath = System.getenv("KEYSTORE_PATH")
        if (keystorePath != null) {
            storeFile = file(keystorePath)
            storePassword = System.getenv("KEYSTORE_PASSWORD")
            keyAlias = System.getenv("KEYSTORE_ALIAS")
            keyPassword = System.getenv("KEYSTORE_ALIAS_PASSWORD")
        }
    }
}
buildTypes {
    getByName("release") {
        signingConfig = signingConfigs.getByName("release")
    }
}
```

在执行构建的同一 PowerShell 会话设置：

```powershell
$env:KEYSTORE_PATH = "E:\keys\xiangqidao-release.keystore"
$env:KEYSTORE_ALIAS = "xiangqidao"
$env:KEYSTORE_PASSWORD = "<keystore 密码>"
$env:KEYSTORE_ALIAS_PASSWORD = "<别名密码>"
```

APK 产物在 `src-tauri/gen/android/app/build/outputs/apk/`，AAB 在 `outputs/bundle/`；具体 ABI / variant 以构建输出为准。用 Android SDK `apksigner verify` 验证 APK 签名并真机安装；备份 keystore，避免老用户无法覆盖升级。

## 验证与数据库开发

在 `backend/`：

```bash
uv run pytest tests/ -q
uv run alembic revision --autogenerate -m "描述数据库变更"
uv run alembic upgrade head
uv run alembic check
```

仅在修改模型时生成新迁移，并审核自动生成内容。在 `frontend/`：

```bash
npm run test:core
npm run test:config
npm run build
npm run build:tauri
npm run build:android
```

后两项需先提供发布 API 配置；它们仅验证前端产物。完整安装包仍需对应原生工具链。模块边界与引擎降级见[架构说明](../ARCHITECTURE.md)，题库操作见[题库维护](puzzles.md)。
