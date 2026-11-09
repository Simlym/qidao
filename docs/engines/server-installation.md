# 服务器与 PC 共用原生引擎安装器

后台「系统设置」的象棋、揭棋引擎现在调用 PC 使用的同一个 Rust crate：
`src-tauri/engine-installer`。服务端只负责管理员鉴权、流式进度和成功后的路径配置。
固定发行清单仍是 `docs/engines/native-packages.json`，不另设服务器下载目录。

## 部署

Compose 构建上下文已调整为仓库根目录，通过 `backend/Dockerfile` 多阶段构建安装器。
使用 `docker compose build backend`，不要继续以 `backend/` 单独作为 Docker 构建上下文。
安装文件保存在既有的 `/app/data/engines` 持久挂载中，不进入公开静态目录。

非 Docker 部署先运行：

```powershell
cargo build --release --locked --manifest-path src-tauri/engine-installer/Cargo.toml --bin qidao-engine-installer
```

将对应系统编译的 `qidao-engine-installer` 放入后端 PATH，或使用 `ENGINE_INSTALLER`
配置其绝对路径。`ENGINE_INSTALL_DIR` 可修改安装根目录，默认相对于后端工作目录的
`data/engines`。旧的 `XIANGQI_ENGINE` / `JIEQI_ENGINE` 和后台路径配置继续兼容。

## 行为

- 发行包按系统、架构和 CPU 指令集筛选；既有无 `os` / `arch` 字段的清单继续表示 Windows x86_64。
- Linux 包须明确标记 `os=linux`、`arch=x86_64`，使用 ELF 程序；安装器恢复执行权限。
- 下载、SHA-256、包内资源校验、安全解压、权重、棋种试算、暂存与原子提交均复用 PC 实现。
- 已安装版本支持重验后启用，便于回退。失败或取消不修改原配置；已完成的安装文件可能保留以便重用。
- 连接断开时向安装器发送取消并回收进程。启用已经提交时，取消无法撤销，应以刷新后的路径为准。
- 操作系统文件锁防止多个管理员或后端进程同时安装、导入或修改配置。
- 手动引擎通过真实握手和指定着法试算后启用；固定 ZIP 导入要求填写服务器已有文件的绝对路径。
- Fairy-Stockfish 的服务器运行封装读取包内变体与坐标协议配置，保持试算和实际对弈一致。

## Linux 发行前置条件

目前正式清单只有 Windows 包。此改动没有虚构 Linux 附件地址或校验值，也没有发布 Release。
Linux 后台在正式包登记前会显示暂无适配包，允许使用服务器已有引擎。

手工运行 `.github/workflows/linux-engine-candidate.yml`：

1. 从 PC 相同的固定源码与网络构建象棋、揭棋 Linux x86_64 候选。
2. 进行构建试算、协议检查、共用安装器回归、真实 ZIP 安装和重验，以及后端运行封装试算。
3. 验证后端 Docker 镜像构建，输出 ZIP、源码附件、校验值、发行元数据和 `native-packages.candidate.json`。

完成 Linux 环境验收后，将候选记录合入正式清单，确认附件及源码在固定标签公开，再设
`publicDownload=true` 并重新构建后端镜像。候选流程本身不发布 Release、不改现有 PC 清单。
ARM64 还没有构建包，页面会保留手动配置，不误选 x86_64。
