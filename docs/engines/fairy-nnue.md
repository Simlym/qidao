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

这是新的客户端候选，不继承 Pikafish 的用户验收结果。`native-packages.json` 中已登记，
状态为本地测试候选、`publicDownload=false`；源码配方为 `pending-application-test`。
程序按引擎 ID 分目录安装，Pikafish 的已安装文件和配置仍可选择。

用户验收：关闭上一份 PC 测试程序，打开新版测试程序；进入标准象棋设置，
选择本次 ZIP，点击“导入 ZIP 并启用”，验证对弈、提示、评分、悔棋与停止分析。
确认通过后再将此版本纳入默认发布候选，当前不自动替换现有引擎，不公开发布附件。
