# 服务器与 PC 共用原生引擎安装器

后台「系统设置」的象棋、揭棋引擎现在调用 PC 使用的同一个 Rust crate：
`src-tauri/engine-installer`。服务端只负责管理员鉴权、流式进度和成功后的路径配置。
固定发行清单仍是 `docs/engines/native-packages.json`，不另设服务器下载目录。

## 部署

Compose 构建上下文已调整为仓库根目录，通过 `backend/Dockerfile` 多阶段构建安装器。
使用 `docker compose build backend`，不要继续以 `backend/` 单独作为 Docker 构建上下文。
安装文件保存在既有的 `/app/data/engines` 持久挂载中，不进入公开静态目录。

Windows x86_64 源码部署无需预装 Rust：管理员首次点击「下载并安装」时，后端会从固定发行版本自动下载 Windows 安装组件，核验 SHA-256 后缓存到 `ENGINE_INSTALL_DIR/.installer/<校验前缀>/`。打开设置页只读取本地清单，不下载组件。下载失败、文件被修改或校验不符都不会执行该文件；原引擎配置保留。组件按固定版本静态编译，无需额外安装 Visual C++ 运行库。设置了 `ENGINE_INSTALLER` 时优先使用指定路径，不自动替换管理员的配置。

其他非 Docker 部署，或希望自行构建 Windows 组件时，运行：

```powershell
cargo build --release --locked --manifest-path src-tauri/engine-installer/Cargo.toml --bin qidao-engine-installer
```

源码启动会自动识别项目内的 `target/release` 安装器，开发环境还会识别 `target/debug`，
无需手动修改 PATH。也可将安装器放入 PATH，或使用 `ENGINE_INSTALLER` 显式配置绝对路径；
显式配置优先于 PATH，PATH 优先于项目构建目录。`ENGINE_INSTALL_DIR` 可修改安装根目录，默认相对于后端工作目录的
`data/engines`。旧的 `XIANGQI_ENGINE` / `JIEQI_ENGINE` 和后台路径配置继续兼容。

## 行为

- 发行包按系统、架构和 CPU 指令集筛选；既有无 `os` / `arch` 字段的清单继续表示 Windows x86_64。
- Linux 包须明确标记 `os=linux`、`arch=x86_64`，使用 ELF 程序；安装器恢复执行权限。
- 下载、SHA-256、包内资源校验、安全解压、权重、棋种试算、暂存与原子提交均复用 PC 实现。
- 已安装版本支持重验后启用，便于回退。失败或取消不修改原配置；已完成的安装文件可能保留以便重用。
- 连接断开时向安装器发送取消并回收进程。启用已经提交时，取消无法撤销，应以刷新后的路径为准。
- 操作系统文件锁防止多个管理员或后端进程同时安装、导入或修改配置。
- 后台系统设置采用左侧分类导航，分别管理象棋引擎、揭棋引擎与 AI 复盘。
- ZIP 导入直接选择电脑上的棋岛固定安装包并上传，按大小和 SHA-256 自动匹配棋种、服务器平台及版本；校验和试算通过后才启用。
- 上传流式写入临时目录，失败、取消或安装结束均清理暂存文件；单次最多 256 MiB，上传总超时 300 秒，实际大小还受当前平台固定包清单限制。
- 内置 Nginx 为上传接口单独放宽大小限制并关闭请求缓冲；自行部署其他反向代理时也需配置相应限制及超时。
- 高级选项保留服务器已有程序路径配置，手动引擎通过真实握手和指定着法试算后启用。
- Fairy-Stockfish 的服务器运行封装读取包内变体与坐标协议配置，保持试算和实际对弈一致。

## Linux 发行前置条件

揭棋 Linux x86_64 包已在 `engines-20261114.1` 发布，采用与 Windows 版相同的固定源码和传统评估，不需要 NNUE 权重。服务器 CPU 需支持 SSE4.1 与 POPCNT，系统需具备 glibc 2.34+ 及支持 GLIBCXX_3.4.30 的 libstdc++6；项目 Docker 镜像已包含所需运行库。更新后端镜像后，进入「系统设置 → 揭棋引擎」即可下载并安装，也可上传该版本 ZIP。

构建、安装器回归、真实 ZIP 安装重验、服务端试算与容器构建记录：[Linux 候选验收](https://github.com/Simlym/qidao/actions/runs/43542015048)。正式附件、源码及校验和见[固定版本发布页](https://github.com/Simlym/qidao/releases/tag/engines-20261114.1)。[公开下载安装验收](https://github.com/Simlym/qidao/actions/runs/43542530978)已在 Linux runner 和实际后端部署镜像内通过，覆盖管理员接口安装、红黑双方限知局面试算、重验、篡改拒绝及象棋配置隔离。该验收由 `.github/workflows/server-jieqi-download.yml` 持续验证。

普通象棋的 Linux 包仍可按以下流程验收登记；在没有对应固定 ZIP 时，管理页提供官方 Pikafish 包下载入口。

手工运行 `.github/workflows/linux-engine-candidate.yml`：

1. 从 PC 相同的固定源码与网络构建象棋、揭棋 Linux x86_64 候选。
2. 进行构建试算、协议检查、共用安装器回归、真实 ZIP 安装和重验，以及后端运行封装试算。
3. 验证后端 Docker 镜像构建，输出 ZIP、源码附件、校验值、发行元数据和 `native-packages.candidate.json`。

完成 Linux 环境验收后，将候选记录合入正式清单，确认附件及源码在固定标签公开，再设
`publicDownload=true` 并重新构建后端镜像。候选流程本身不发布 Release、不改现有 PC 清单。
ARM64 还没有构建包，页面会保留手动配置，不误选 x86_64。
