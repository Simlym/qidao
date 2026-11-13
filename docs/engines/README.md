# 象棋引擎安装与导入

棋岛安装包不包含第三方引擎或评估权重。软件与引擎在[同仓库 Releases](https://github.com/Simlym/qidao/releases)分别发布；固定版本源码、构建适配、许可证和校验附件随引擎提供。2026-11-07 的兼容性预发布及验收范围见[发布记录](release-20261107.md)。

## 选择方式

- Windows x64：进入“设置 → 象棋引擎／揭棋引擎 → 下载并安装”，客户端直接从固定 GitHub Releases 下载、校验、试算后启用，无需登录。
- Web / Android：进入对应设置页，点击“下载并安装”，或通过“已有文件，手动导入”选择浏览器版 ZIP。由同仓库 GitHub Pages 下载与 Releases 字节一致的 ZIP，GitHub 承担带宽，业务站点不代理大文件。默认自动选择兼容的单线程版；多线程与完整版本信息放在“引擎详情与兼容性”，不适配的选项不可选。
- 标准象棋：Fairy-Stockfish + 已固定的 CC0 象棋网络；揭棋：PikaJieQi 传统评估，不需要 `pikafish.nnue`。普通象棋网络不能据此当作揭棋权重。
- 两端都保留 ZIP 手工导入，选择后确认启用；PC 可选择引擎程序／目录，Web／安卓可通过折叠入口选择规范目录。浏览器目录也会先暂存并握手，检测失败或取消时保留旧配置。
- 服务端云端引擎：管理员在「系统设置 → 服务器象棋引擎」点击「下载并安装」，服务器从官方固定版本下载 Pikafish，校验并试算后启用。支持 Windows x86_64、glibc 2.38+ 的 Linux x86_64，详见[部署说明](../deployment/backend.md#服务端引擎与-llm)。此入口与个人设备的本地引擎独立；揭棋仍需管理员配置专用引擎。
- 其他 PC 平台：按操作系统和 CPU 自行提供原生 UCI 引擎。

Web 和 Android 使用同一套浏览器引擎设置界面，与 PC 共用进度和反馈展示。点击即显示等待状态，安装成功后显示当前引擎；本机存储初始化失败时只显示一处错误，并在等待超时时提供刷新入口。非 HTTPS（localhost 除外）或不支持本机存储的环境无法安装本地引擎。

未安装本地引擎时，象棋对弈、揭棋和自由分析页面提供“去下载或导入”，直接进入对应棋种的引擎设置。已有安装记录时，每次进入设置自动检测本机引擎，检测通过后显示“引擎已就绪”，无需手动操作或重新下载。若浏览器文件已被清理或启动失败，保留安装记录，提供“重试检测”和“重新下载或导入”；不会把历史安装成功当作当前可用。

标准象棋与揭棋使用独立配置。揭棋引擎必须明确支持暗子局面和项目使用的扩展 FEN。

## Windows 本地引擎安装

1. 打开“设置 → 象棋引擎”或“揭棋引擎”，点击“下载并安装”。客户端按当前系统和 CPU 筛选适配版本。
2. 点击后立即显示连接状态，再显示实际下载进度；下载完成后自动校验、解压、试算，启用成功才保存配置。
3. 下载不畅时，可点击“用浏览器下载”，取得相同固定版本的 ZIP，再通过“已有文件，手动导入 → 选择 ZIP 包”导入，无需解压。
4. 其他来源的引擎请先解压并保留配套文件，通过导入窗口选择程序或文件夹；识别后点击“启用此引擎”。
5. 已保存配置时，每次进入设置自动确认原生引擎是否可用，通过后显示“引擎已就绪，无需重复下载”，可重新检测、更换引擎或打开文件夹；失败时保留原配置并提供重试或重新下载、导入入口。未配置时，对弈与分析页提供直达对应棋种设置的引导。性能、版本、文件路径和开源许可按需展开。

象棋默认使用 Fairy-Stockfish NNUE 与固定的 CC0 网络；揭棋使用专用引擎，不能混用普通象棋网络。程序通过 Rust 下载，不受浏览器 CORS 限制，也不经过业务后端。下载和试算支持取消；阻塞中的网络操作需等返回才能响应取消（连接超时 15 秒，总下载超时 300 秒）。离开页面后不会启用迟到的结果，后台已完成的包可在“引擎详情”中重新检测并启用。失败时保留原引擎配置。

新安装的固定 ZIP 包位于 `%LOCALAPPDATA%/QiDao/engines/<棋种>/<引擎名>/<日期或build>-<包哈希前12位>/`，例如：

```text
QiDao/engines/xiangqi/fairy-stockfish/20261107-bf276f77331f/
├── stockfish.exe
├── xiangqi-c07e94a5c7cb.nnue
├── engine-manifest.json
└── installation.json
```

程序及资源的完整版本和校验信息由固定清单、包内清单及安装记录关联保存。版本目录相互独立；未完成的下载和安装使用同文件系统临时目录，失败会清理。用户手动提供的程序保留原位。

应用标识继续使用 `com.xiangqidao.desktop`。旧版 `%LOCALAPPDATA%/com.xiangqidao.desktop/engines/` 下的安装及旧的 `<version>/<build>` 目录继续读取和检测，不自动移动或删除；新安装使用简化目录。旧 EXE 引导安装接口保留兼容，其版本目录仍使用原有结构。

Fairy-Stockfish 的配置自动指定 `UCI_Variant=xiangqi`，按握手选项选择旧版 `Protocol=ucicyclone` 或新版 `ucicyclone` 命令，保证使用本项目的 `a0..i9` 坐标。安装属于设备，与所连接的服务器和会员无关。

## 维护安装版本与下载源

[`native-packages.json`](native-packages.json) 是当前 ZIP 安装清单；[`install-catalog.json`](install-catalog.json) 保留旧版 EXE 引导安装清单。两者在构建时嵌入原生程序，集中定义版本、文件 URL、精确大小、SHA-256、CPU 要求及允许的下载/重定向主机。客户端只接受清单内且适配本机的构建 ID，不接受网页传入任意 URL、路径或校验值。

升级引擎时应检查上游许可，取得各构建文件并独立计算 SHA-256，更新清单，再验证 UCI 选项、象棋坐标、试算和 Windows 实机兼容性。更新默认引擎需要发布新客户端；已有安装不会被静默替换。未来添加中国下载源时，在该清单和原生来源校验中扩展可信主机，并保持同一文件的校验值。

原生安装器为独立 Rust crate，运行验证：

```bash
cargo test --manifest-path src-tauri/engine-installer/Cargo.toml --locked
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

完整构建环境见[客户端构建文档](../development/build-clients.md)。测试包含固定清单、CPU 筛选、文件损坏、取消、UCI 超时和非法输出；实际 Windows 安装仍应通过发布前真机验证。

## 许可提醒

引擎程序和评估权重可能使用不同许可证。Fairy-Stockfish 程序使用 GPL-3.0，安装目录保存许可正文，并提供对应版本的源码链接。当前标准象棋推荐包附带已核验许可的指定 CC0 网络，揭棋推荐包采用传统评估，不附带权重。

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

Web / Android [WASM 在线安装](wasm-online-install.md)已接入设置页，包含固定包校验、
暂存缓存、候选握手、取消和失败保留旧引擎。公开下载由 GitHub Pages 提供；
[发布记录](release-20261107.md)列明已通过的自动验证和仍需进行的真机、棋力验收。
