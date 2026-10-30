# 客户端配置、构建与本地开发

所有命令注明了执行目录。Web、Windows、Android 共用 `frontend/`；Tauri 工程位于仓库根目录 `src-tauri/`。项目介绍见 [README](../../README.md)，普通用户操作见[使用指南](../USER_GUIDE.md)，服务器部署见[后端部署](../deployment/backend.md)。

## 地址配置规则

统一使用 `VITE_API_BASE_URL`，它是**构建时默认地址**，修改此默认值后必须重新构建、分发客户端。已安装客户端可在“设置 → 服务器（高级）”切换服务器，无需重新打包。没有可用的官方地址时，请填写你自己的服务地址，示例域名仅为占位符。

| 场景 | 命令（在 `frontend/`） | 推荐本地配置 | 未配置时 |
| --- | --- | --- | --- |
| Web 开发 | `npm run dev` | `.env.local` | 同源 `/api`，Vite 代理到 `http://localhost:8000` |
| Web 发布 | `npm run build` | `.env.production.local` | 同源 `/api`，由部署者配置反向代理 |
| Windows 调试 | `npm run tauri dev` | `.env.tauri.local` | `http://localhost:8000/api` |
| Windows 发布 | `npm run tauri build` | `.env.tauri.local` | 构建报错，必须配置地址 |
| Android 调试 | `npm run tauri android dev` | `.env.android.local` | 构建报错，必须配置设备可访问的完整地址 |
| Android 发布 | 见下方 APK / AAB 命令 | `.env.android.local` | 构建报错，必须配置地址 |

底层前端命令分别是 `dev:tauri` / `build:tauri`（Vite `tauri` mode）与 `dev:android` / `build:android`（`android` mode）。Web 发布使用默认 `production` mode。

Web 开发服务使用 `5173` 端口，Windows / Android 调试使用独立的 `1420` 端口，可与 Web 开发同时运行。若提示端口已占用，请先在之前启动对应开发服务的终端按 `Ctrl+C`，再重新启动；Tauri 的开发页面地址与 Vite 端口必须一致。

Vite 优先级从高到低：命令进程已有环境变量 → `.env.[mode].local` → `.env.[mode]` → `.env.local` → `.env`。因此 `.env.production.local` 不会应用于 `tauri` / `android`；通用 `.env.local` 会影响所有 mode，建议只放真正共用的配置。所有这些文件均在 `frontend/` 目录；本地覆盖文件已加入 Git 忽略。

Windows / Android 发布必须为完整 HTTPS 地址，以 `/api` 结尾，不含账号、查询参数或片段，且不得指向 localhost / 回环地址。调试允许 HTTP；Windows 调试可使用 localhost，Android 的 localhost 指向手机自身。末尾斜杠和首尾空格会自动去除。

**`VITE_*` 会进入公开产物，不得包含数据库密码、LLM 密钥、管理员密码或用户 token。** 前端地址配置不同于 `backend/.env` 和 Compose 根目录 `.env`。

## 在应用内连接自建服务

地址选择顺序为“当前设备保存的自定义地址 → 构建时默认地址”。Web、Windows 和 Android 共用此规则；Web 默认值仍为同源 `/api`。页面顶部或桌面状态栏显示当前服务器，点击可进入设置。

1. 打开“设置 → 服务器（高级）”，查看当前与默认 API 地址。
2. 输入完整的 `https://你的域名/api`，点击“检测连接”。检测不发送 token、cookie 或游客身份，有 8 秒超时。
3. 点击“连接并重新加载”，客户端会再次检查服务标识与 API 版本，通过后保存设置并重载。切换前保存未完成棋局。
4. 需要返回时点击“恢复默认服务器”，无需旧服务器在线，不进行连接检测。

运行时自定义地址要求 HTTPS，HTTP 仅限 Vite 开发模式。后端必须开放 `/api/health`，返回 `status=ok`、`service=xiangqidao`、`api_version=1`；旧版本只返回 `status` 时需先更新后端。连接失败不改变当前配置。

各服务器的 token、游客身份、复习提醒分别保存。切换后清空页面内存中的棋局、权益和用户状态，返回原服务可继续使用原有登录信息；账号与棋谱不会在实例之间迁移。本地引擎文件、线程设置、外观和音效仍属于当前设备。旧版单实例凭据仅迁移至当前构建默认服务器，不会发送到自建实例。

同一浏览器的其他标签页会同步重载。API（含流式分析）请求在切换时中止，迟到结果被丢弃；API 不写入离线缓存。自建服务需要允许客户端来源的 CORS，HTTPS Web 页面不能连接 HTTP API。

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

服务器 `CORS_ORIGINS` 通常需包含 `http://tauri.localhost`。Windows x64 可在设置页从 GitHub 引导安装标准象棋引擎，也可手动导入。安装器通过固定清单限制来源、大小与 SHA-256；其他平台和揭棋暂保留手动导入，见[引擎说明](../engines/README.md)。

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


## QiDao 品牌与历史应用标识

用户可见的产品名称为 **棋岛 QiDao**，网页标题、PWA 安装名称、桌面窗口标题及 Tauri 的 `productName` 已统一。安装包使用英文 `QiDao`，窗口标题使用「棋岛 QiDao」。

为保留开发期已安装客户端的配置与既有服务兼容性，**内部标识暂不更名**：Tauri 的 `identifier` 仍为 `com.xiangqidao.desktop` / `com.xiangqidao.app`；后端 `/api/health` 的 `service` 仍为 `xiangqidao`；前端校验、应用缓存、Python / Rust / npm 包名及数据库默认名称仍使用原技术标识。请不要只修改其中一处字符串，否则会导致无法识别服务或数据目录变化。

GitHub 仓库仍使用历史地址 `Simlym/xiangqidao`，若以后改为 `Simlym/qidao`，同步更新部署文档中的克隆 URL 和外部 CI/部署集成。
