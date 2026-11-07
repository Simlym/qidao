# Fairy-Stockfish 象棋 NNUE 候选验证

## 固定版本和许可

- 引擎源码：[Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish/tree/84dd49a4bd00b9959b07e1b917d362c46e6f6d75)，提交 `84dd49a4bd00b9959b07e1b917d362c46e6f6d75`。
- 网络：`xiangqi-c07e94a5c7cb.nnue`，11,261,932 字节。
- 网络来源：官方 [xiangqi-c07e94a5c7cb 发布](https://github.com/fairy-stockfish/Fairy-Stockfish-NNUE/releases/tag/xiangqi-c07e94a5c7cb)，权重仓库提交 `5fbbb9e15fd882cec18a2a5c3d4bfa25dc07169b`。引擎提交取自该发布的源码子模块，不使用会变化的 master。
- 网络 SHA-256：`c07e94a5c7cbeae443ed79a8fa412875d833a7f8e04333815e39729c59d52e11`。
- 程序 GPL-3.0，网络 CC0-1.0；[许可依据](../licenses/Fairy-Xiangqi-NNUE.md)、CC0 正文及程序 GPL 正文随包提供。

该网络是 Pikafish 团队为 Fairy-Stockfish 象棋变体训练的 CC0 网络，不能与 `pikafish.nnue` 混用。
当前只验证标准象棋，不将该包用于揭棋。尚未进行棋力对赛，也不将其标注为棋力优于 Pikafish。

## 构建和运行参数

Windows x64 SSE4.1/POPCNT，沿用固定 w64devkit；编译 `largeboards=yes nnue=no`。
这里的 `nnue=no` 仅关闭内嵌默认网络和自动下载，并不关闭运行时 NNUE；
运行时必须设置 `UCI_Variant=xiangqi`、`Use NNUE=true`、`EvalFile=<该网络绝对路径>`。
保留原始 `xiangqi-` 文件名前缀，避免引擎将其他棋种的文件名视为不适用并使用传统评估。

该源码版本没有 `Protocol` UCI 选项，需通过 `ucicyclone` 命令选择 `a0..i9` 坐标。
客户端和安装试算先执行 UCI 握手，根据选项决定使用旧版 `Protocol` 选项或新版协议命令。
旧 Fairy-Stockfish 14 的固定 generic EXE 也重新下载并通过试算，原有入口保留兼容。

在仓库根目录构建：

```powershell
python scripts/build_engines.py --engine fairy-xiangqi --output dist-engines/fairy-test-new
```

不读取旧本地引擎。测试包包含程序、网络、对应源码 ZIP、构建覆盖文件、许可材料、
基础 `smoke-test.json` 和完整 `protocol-test.json`，并产生发行清单和 SHA256SUMS。

## 本次验证（2026-11-07）

本地输出：`dist-engines/fairy-20261107-03/`。
程序包：`xiangqi-fairy-stockfish-nnue-c07e94a5-84dd49a4-windows-x64-sse41-popcnt.zip`。
ZIP 大小 5,814,717 字节；SHA-256 为
`f2b28a0741170d63e427394a1da072972a908ffd6a0c4bcccaa16dbc20bd225b`。

已通过：

- UCI 握手、指定 NNUE 启用确认、红方 `h2e2` 和黑方 `h7e7` 受限试算及评分输出。
- 三条候选线路的坐标格式、无限搜索停止，以及停止后新局面试算。
- 详细 NNUE 评分输出、正确棋种前缀但文件缺失时拒绝搜索。
- Rust ZIP 导入、资源完整性校验、NNUE 启用确认和重新检测；损坏权重拒绝启用。
- 原有 Pikafish 象棋、揭棋 ZIP 安装和旧 Fairy 14 EXE 的真实程序回归。
- 前端核心及配置测试、构建、Rust 常规回归和客户端编译。

用户已重新测试并确认该客户端正常、Fairy-Stockfish 测试通过，见
[`acceptance.json`](acceptance.json) 的 `pc-fairy-nnue-20261107-01`。
先前报告的白屏未复现，尚未定位原因，不记为代码修复。
`native-packages.json` 中该准确 ZIP 已标记 `applicationTested=true`、`publicDownload=false`。
源码配方的分发状态后续结合云端构建审核更新；重新构建的附件需要独立核验，不能沿用本地 ZIP 的哈希。
程序按引擎 ID 分目录安装，Pikafish 的已安装文件和配置仍可选择。

用户验收：关闭上一份 PC 测试程序，打开新版测试程序；进入标准象棋设置，
选择本次 ZIP，点击“导入 ZIP 并启用”，验证对弈、提示、评分、悔棋与停止分析。
本地验收已通过，下一步通过 GitHub 工作流构建独立草稿并核对附件；当前不自动替换现有引擎。

## GitHub 草稿复核（2026-11-07）

- 固定标签：`engines-20261107.2`，仅含 Fairy 标准象棋包，不包含 Pikafish 权重。
- [构建任务](https://github.com/Simlym/qidao/actions/runs/42362210152)已成功，源码为棋岛提交 `9cbd3c2`，沿用已提交的 `nnue=no` 配方。
- [Release 草稿](https://github.com/Simlym/qidao/releases/tag/untagged-2e94d403a7432a8aea7b)含程序 ZIP、对应第三方源码 ZIP、`engine-release.json` 和 `SHA256SUMS.txt`；未公开、未设为 Latest。
- 程序 ZIP：5,814,734 字节，SHA-256 `bf276f77331fa167c5d2e01faab86de015a3adc219763192c4b1c5306f8850d9`。
- 包内清单 SHA-256：`caeac0df4f6a21eafd19ef6624d13fdcc640b8f189a6c715a8c29c74f36bad7e`。
- 下载到 `.engine-build/github-fairy-verified-release/` 后，核验全部附件校验和、清单与逐个资源，再在本机执行完整协议测试，通过。
- Rust 实际执行 ZIP 安装、NNUE 与坐标试算、重新检测、篡改权重后拒绝启用，通过。

云端 ZIP 和程序哈希均与本地用户验收包不同；云端包登记为
`xiangqi-fairy-cloud-20261107`、`applicationTested=false`、`publicDownload=false`。
云端自动验证不冒充该准确附件的客户端用户验收；原本地已验收包继续保留。
源码配方工作区另有 `nnue=yes` 改动，未纳入上述提交和云端构建，不能据此改变既有包的构建记录。

复测指定云端包：

```powershell
$env:QIDAO_TEST_FAIRY_PACKAGE_DIR = 'E:/git/qidao/.engine-build/github-fairy-verified-release'
$env:QIDAO_TEST_FAIRY_PACKAGE_ID = 'xiangqi-fairy-cloud-20261107'
cargo test --manifest-path src-tauri/engine-installer/Cargo.toml --locked real_fairy_package_uses_nnue_and_zero_based_coordinates -- --ignored
```

下一步是公开发行前核对源码与许可材料、选定正式包并接通匿名下载；
Web/Android 需要另行构建 WASM、适配 Worker 及资源缓存，不能直接运行该 Windows EXE。
