# 象棋引擎安装与导入

棋岛安装包不包含第三方引擎或评估权重。Windows x64 标准象棋目前支持从 GitHub 上游直接下载固定版本的 Fairy-Stockfish；其他场景保留用户手动导入。目前尚未托管、镜像或代理下载引擎文件。

已确定后续采用**同仓库、软件与引擎分别发布 Release** 的策略，见[发行方案与本地基线](releases.md)。用户已验证 PC Pikafish 象棋和揭棋正常使用；[Fairy-Stockfish + CC0 象棋 NNUE](fairy-nnue.md)也已完成协议、安装测试和 Windows 客户端用户验收，下一步核验 GitHub 草稿构建。

第二阶段已提供[从固定 GitHub 源码构建 Windows 测试包](source-builds.md)的脚本，不再将旧本地引擎作为打包输入。新包已完成协议级试算，用户也已确认两个包在 PC 客户端均可正常使用，见[验收记录](acceptance.json)；默认下载源尚未修改。GitHub 草稿用于检查云端构建，不代表公开发布。

第三阶段已接入 [PC ZIP 引擎包安装器](pc-package-installer.md)：两个棋种均可导入固定 ZIP、校验匹配权重、试算和启用，支持重新检测与回退。草稿版本的在线下载保持关闭，原有手动选择程序和 Fairy-Stockfish 上游安装保留。

## 选择方式

- Windows x64 标准象棋：优先使用“设置 → 标准象棋引擎 → 从 GitHub 安装并启用”，也可手动选择程序或目录。
- 其他 PC 平台 / 揭棋：根据操作系统和 CPU 自行下载原生 UCI 引擎，在设置页手动选择程序或目录。
- Web / Android：下载兼容的 WASM UCI 引擎包，解压后在设置页选择整个目录。
- 自托管服务器：管理员自行把原生引擎放在服务器非公开目录，再填写绝对路径。

标准象棋与揭棋使用独立配置。揭棋引擎必须明确支持暗子局面和项目使用的扩展 FEN。

## Windows 标准象棋引导安装

1. 打开“设置 → 标准象棋引擎”，查看检测到的系统、CPU 和推荐构建。
2. 可查看上游项目与 GPL-3.0 许可，点击“从 GitHub 安装并启用”。
3. 客户端下载约 2 MB 的程序，校验大小与 SHA-256，完成 UCI 握手和受限的一步象棋试算，通过后才保存配置并启用。
4. 失败或取消时保留原配置，可重试、选择兼容版，或手动导入；已完成的安装会显示在版本列表，可检测后重新启用或回退。

目前仅引导安装 `Windows / x86_64`，按 CPU 指令集提供 BMI2、modern、generic 三种构建；不会把普通象棋引擎用于揭棋。默认固定 `fairy_sf_14`，不在每次启动时追踪 latest。下载源为 GitHub，中国地区加速暂未提供；GitHub 不可达时可手动导入。

Fairy-Stockfish 是多棋种引擎，配置会自动指定 `UCI_Variant=xiangqi`，按握手选项选择旧版 `Protocol=ucicyclone` 或新版 `ucicyclone` 协议命令，确保使用本项目的 `a0..i9` 坐标。旧 EXE 下载方案设置 `Use NNUE=false`、采用传统评估；新增 NNUE ZIP 候选明确启用匹配的 CC0 网络，二者配置独立。

程序通过 Rust 下载，不受浏览器 CORS 限制，也不经过所连接的业务后端。下载显示进度、支持取消；网络阻塞时取消需等待当前网络操作返回（总下载超时 120 秒）。离开设置页后任务可能继续，返回页面会显示后台状态和完成的版本；不会在页面已离开时自动切换原配置。

安装位置为 Tauri 的应用本地数据目录：

```text
engines/xiangqi/fairy-stockfish/<version>/<build>/
├── engine.exe
├── COPYING.txt
└── installation.json
```

Windows 通常位于 `%LOCALAPPDATA%/com.xiangqidao.desktop/` 下，以设置页显示的实际路径为准。版本目录相互独立；未完成下载存于同文件系统的临时目录，失败会清理，不覆盖原版本。由于当前下载项是单个 `.exe`，无需解压第三方压缩包。安装记录保留校验值、来源、许可链接和必要 UCI 配置；引擎安装属于设备，与所连接的服务器和会员无关。

## 维护安装版本与下载源

[`install-catalog.json`](install-catalog.json) 是构建时嵌入原生程序的安装清单，集中定义版本、文件 URL、精确大小、SHA-256、CPU 要求及允许的下载/重定向主机。客户端只接受清单内且适配本机的构建 ID，不接受网页传入任意 URL、路径或校验值。

升级引擎时应检查上游许可，取得各构建文件并独立计算 SHA-256，更新清单，再验证 UCI 选项、象棋坐标、试算和 Windows 实机兼容性。更新默认引擎需要发布新客户端；已有安装不会被静默替换。未来添加中国下载源时，在该清单和原生来源校验中扩展可信主机，并保持同一文件的校验值。

原生安装器为独立 Rust crate，运行验证：

```bash
cargo test --manifest-path src-tauri/engine-installer/Cargo.toml --locked
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

完整构建环境见[客户端构建文档](../development/build-clients.md)。测试包含固定清单、CPU 筛选、文件损坏、取消、UCI 超时和非法输出；实际 Windows 安装仍应通过发布前真机验证。

## 许可提醒

引擎程序和评估权重可能使用不同许可证。Fairy-Stockfish 程序使用 GPL-3.0，安装目录保存许可正文，并提供对应版本的源码链接。当前默认不下载 NNUE。

Pikafish 程序为 GPL-3.0，但[官方 NNUE 权重许可](https://github.com/official-pikafish/Networks/blob/master/README.md)禁止未经授权的商业使用。因此本项目不将该权重纳入默认安装流程；商业接入需另行取得许可。该说明同时明确，Pikafish 团队为 Fairy-Stockfish 象棋变体训练的网络采用 CC0；后续可在确认具体文件、版本兼容和许可依据后作为候选，不能将此结论套用到任意 NNUE 或历史揭棋权重。
由用户提供文件并不会自动免除服务器运营方可能承担的许可义务。

推荐目录仅用于本机开发，不会进入发行包：

```text
local-engines/
├── xiangqi/
│   ├── native/<engine-id>/<version>/<platform>/
│   └── wasm/<engine-id>/<version>/<target>/
└── jieqi/
    ├── native/<engine-id>/<version>/<platform>/
    └── wasm/<engine-id>/<version>/<target>/
```

固定层级为“棋种 → 运行时 → 引擎 → 版本 → 平台或构建目标”。`native` 用于 PC/服务器原生程序，`wasm` 用于 Web/Android 浏览器包；详细命名规则见 [`local-engines/README.md`](../../local-engines/README.md)。

浏览器包格式见 [package-spec.md](package-spec.md)，推荐来源元数据见 [catalog.json](catalog.json)。

Web / Android [WASM 在线安装](wasm-online-install.md)已接入设置页：固定包校验、
暂存缓存、候选握手、取消和失败保留旧引擎。标准象棋 Fairy 线程版与单线程版已完成真实 WASM 构建、
浏览器试算和离线重新启动验证，同源静态分发也已通过 Docker/Nginx 测试。
单线程版在无 SharedArrayBuffer 环境通过验证。推荐下载仍未开放；安卓真机、实际 HTTPS 部署
与[揭棋 WASM 候选真机验收](jieqi-wasm.md)待完成，后续统一发布。
