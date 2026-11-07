# PC 引擎包安装与验证

## 当前行为

Windows x64 的个人设置中，标准象棋和揭棋各自提供“引擎包”安装卡片。
程序、匹配权重及许可材料一起安装到应用本地数据目录；不上传文件，不要求登录。
普通原生程序仍可手动选择，Fairy-Stockfish 的原有上游下载入口保留在标准象棋的“其他引擎”中。

新安装器采用 [`native-packages.json`](native-packages.json) 中构建时固定的可信清单，
包含本地已验收的 `test-20261107-03` 和 GitHub `engines-20261107.1` 草稿构建，
两者的 ZIP 及包内清单 SHA-256 分别固定，不能互相代替。
选择文件后按大小和哈希自动识别，不依赖文件名；CPU 或棋种不匹配的包不会运行。
清单以外的原生引擎可继续使用“选择程序”，不能通过 ZIP 安装器绕过固定版本校验。

当前 Release 仍是草稿，所以四个安装项的 `publicDownload` 均为 `false`：
在线按钮不可用，原生接口也拒绝该下载请求。可导入已取得的 ZIP 包测试完整安装和启用。
将来确认同仓库正式 Release 的附件及许可后，才更新该字段和对应固定元数据，
在线安装将使用 `https://github.com/Simlym/qidao/releases/download/<固定标签>/<固定文件名>`，
不带 GitHub Token、不经过棋岛业务后端、不追踪 latest。

## 安装流程

1. 按棋种和本机 CPU 筛选清单；本地导入和在线下载共用后续步骤。
2. 校验 ZIP 精确大小和 SHA-256，在目标文件系统的临时目录解压。
3. 拒绝路径穿越、Windows 特殊路径、重复名称、符号链接、未登记文件与超限解压；
   最多 40 个文件、80 个 ZIP 项，解压总量最多 256 MiB。
4. 校验固定 `engine-manifest.json` 的哈希、棋种、协议、源码提交、入口，
   再逐一校验程序、匹配 NNUE 及其他资源。标准象棋与揭棋使用独立初始 FEN 试算。
5. 全部成功后原子移入版本目录，前端进行实际引擎启用；启用失败恢复原配置。
   离开设置后到达的安装结果不会自动启用；多个启用事务串行处理，防止旧回滚覆盖新配置。
6. “检测并启用”重新核验清单、每个资源及试算；损坏的权重不能通过重新启用。

位置：`<app_local_data_dir>/engines/<xiangqi或jieqi>/pikafish/<版本>/<包ID>/`。
不同包 ID 的版本互不覆盖，原有 Fairy-Stockfish 安装目录保持原位置。
下载过程支持进度和取消；网络阻塞时需等待当前网络操作返回，总超时为 300 秒。
离开页面后安装可能继续完成，返回可在已安装列表中重新检测并启用。

## 验证记录（2026-11-07）

- Rust 安装器常规回归 13 项通过；另有需要外部文件的测试默认忽略。
- 使用已下载的 GitHub 两个真实 ZIP，额外执行“安装 → 重新检测 → 修改权重 → 拒绝启用”，通过。
- 前端核心测试 74 项、配置测试 4 项及 Vite 构建通过；Tauri 接口编译检查通过。
- 已生成使用独立应用标识 `com.xiangqidao.engine-test` 的 Windows Debug 测试程序，默认连接本机后端；
  引擎包安装可离线使用。该构建使用已构建的通用前端静态资源，未改动正式发布地址校验规则或本地环境文件。
- 界面自动化工具的启动授权请求超时，未完成真实界面点击验收；需要用户验证两个设置页的导入和启用。

自动验证命令：

```powershell
cargo test --manifest-path src-tauri/engine-installer/Cargo.toml --locked
cargo check --manifest-path src-tauri/Cargo.toml --locked
$env:QIDAO_TEST_PACKAGE_DIR = '已下载的 GitHub 引擎 ZIP 所在目录'
cargo test --manifest-path src-tauri/engine-installer/Cargo.toml --locked real_packages_install_verify_and_detect_changed_weights -- --ignored
```

用户验收：打开测试程序，在两个棋种的设置中分别点击“导入 ZIP 并启用”，
选择前述原始 ZIP（无需解压），确认程序与 NNUE 检测成功。
然后检查对弈或分析、切换设置页、重复检测及已安装版本回退。
测试程序使用独立的数据目录和设置；测试云端功能时可在“服务器（高级）”中连接自己的服务。
