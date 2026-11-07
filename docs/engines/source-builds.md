# 从 GitHub 源码构建引擎测试包

## 固定输入

后续打包以 `source-builds.json` 为输入，不读取 `local-engines`，不依赖已有程序或旧校验清单。
`baseline-*` 仅保留为历史兼容性参考，不能代替新包的验收。

| 棋种 | 源码 | 权重来源 |
| --- | --- | --- |
| 标准象棋 | Pikafish-2026-01-02，提交 `ce0679e00ee196f7ba17f6ec18941b9a5036f8cf` | 同版本官方 Release 的 7z 包 |
| 揭棋 | jieqi_old，提交 `23b9466c981f0f3a1133f92de1a6f86406c4eccc` | Pikafish-2022-12-26 官方 Release 的 ZIP 包 |
| Fairy 标准象棋候选 | 官方 NNUE 发布所指引擎提交 `84dd49a4bd00b9959b07e1b917d362c46e6f6d75` | 官方固定提交中的 CC0 `xiangqi-c07e94a5c7cb.nnue` |

程序由源码重新编译；Pikafish 官方发布包只提取唯一的 `pikafish.nnue`，不使用其中的预编译程序。Fairy 候选单独下载其固定提交的 CC0 网络，详见 [Fairy NNUE 验证](fairy-nnue.md)。
标准象棋发布包哈希同时核对了 GitHub API 的 digest；2022 历史发布包没有 API digest，
其 SHA-256 来自本次官方 HTTPS 下载后计算，用于固定后续输入，不代表独立的作者签名验证。
禁止使用会变化的 master-net。源码和权重分别锁定版本；不修改上游源码。

## Windows 本地构建

需要 Python 3.11+、Git、系统自带 bsdtar 和网络连接。仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup_engine_toolchain.ps1
python scripts/build_engines.py --output dist-engines/test-001
```

便携 w64devkit 2.11.0 下载后校验 SHA-256，解压至 `.engine-build/w64devkit`；
不安装到系统，不修改系统 PATH。脚本默认构建两个 Pikafish 包及 Fairy NNUE 候选的 Windows x64 SSE4.1/POPCNT 版本，
不是所有 CPU 均可运行，也不代表较新指令集的最佳性能。固定架构不使用 `native`。
不使用 PGO，后续性能优化另行验收。w64devkit 不支持 LTO，因此随包提供 `qidao-build.mk`
过滤该优化标志；揭棋旧版的 GBK 输出参数改为 UTF-8，以适配该工具链和棋岛的 UTF-8 读取。
上游源码保持不变，仍使用 `-O3` 和固定架构优化。

可用 `--engine xiangqi` / `--engine jieqi` / `--engine fairy-xiangqi` 单独构建，`--jobs 4` 控制并行数。
每次使用新的输出目录，失败时检查其中的 `<棋种>-build.log`，不覆盖旧测试包。
构建与下载临时文件位于 `.engine-build`，测试包位于 `dist-engines`，均被 Git 忽略。

## 输出与测试

- 每个所选构建都有可直接手动导入的解压目录，程序与匹配权重同目录；Fairy 候选建议通过 ZIP 安装器导入，以保留棋种和坐标协议配置。
- 对应 ZIP 包、固定提交源码 ZIP、`engine-release.json`、`SHA256SUMS.txt`。
- 包内 `engine-manifest.json` 记录工具链、编译参数、源码提交、权重来源及文件哈希。
- `smoke-test.json` 保存 UCI 握手、权重加载、一步浅层试算输出；它不能替代棋岛完整回归。

在棋岛个人设置中，分别选择新目录里的 `pikafish.exe` 和 `PikaJieQi.exe`，
核对权重检测结果，再检查对弈、评分、提示、重开、悔棋、取消分析及揭棋暗子局面。
旧引擎目录保持原样，可手动切回。用户验收结果应记录具体测试包 SHA-256、CPU 和软件版本。

## Release 草稿

`.github/workflows/engine-draft.yml` 仅支持手动触发，固定 `engines-YYYYMMDD.修订号` 标签；
构建和试算通过后，将程序包、源码包、发行清单及校验文件上传到同仓库的 Release 草稿，
不公开发布、不设为软件 Latest，不覆盖已有同名 Release。

Pikafish 构建仍为 `pending-review`，Fairy NNUE 候选为 `pending-application-test`；允许为维护者构建未公开的 Release 草稿，
不上传可被其他仓库读者下载的 Actions 构建附件；在同一构建作业内直接上传草稿。
草稿不代表公开分发审核通过。公开发布前必须运行 `--check-distribution --preflight`，
在配置中记录实际权重的 `networkLicenseEvidence`、应用验收 `applicationTestEvidence`，
并审核将对应构建的 `distribution` 改为 `approved`。工作流不执行公开发布。
本地构建不要求这些发布字段，不要求棋岛账号；源码构建本身不会改变权重的许可条件。

工具回归：

```powershell
python -m unittest discover -s scripts/tests -v
```

## 首轮本地构建记录（2026-11-07）

输出目录：`dist-engines/test-20261107-03/`。两种引擎均已从上述固定 GitHub 提交重新构建，
不读取旧本地引擎；握手、匹配权重加载、深度 2 试算及正常退出均通过。
标准象棋返回 `c3c4`，揭棋暗子初始局面返回 `g3g4`；这些结果不作为最佳着法断言。
工具 8 项回归、包内文件哈希、ZIP 校验清单和工作流 YAML 解析均通过。
用户随后确认这两个包在 PC 客户端均可正常使用，已按 ZIP SHA-256 登记在
[`acceptance.json`](acceptance.json)。软件版本、CPU 和逐项测试用例尚未提供，
不扩大到其他平台或所有生命周期用例。GitHub 草稿构建结果见下节。

| 包 | ZIP SHA-256 |
| --- | --- |
| 标准象棋，约 54 MB | `68b3fb6c00ed825a169e7afc67cb0b10e6c19d029e2d940fc950a2a1bcf67752` |
| 揭棋，约 8.7 MB | `de5848b55ad8819222006efda494ccff5b175174f368b6fba33467aab3b3907d` |

该记录只指本次产物，不保证在另一编译环境重新构建会产生逐字节相同的二进制。
重新构建产生不同 SHA-256 后需重新关联验收，不自动继承旧包的通过状态。

## GitHub 草稿构建核验（2026-11-07）

提交 `267473e540301021ce58ee1508f0bcadfc193369` 已推送至 `main`，
[CI](https://github.com/Simlym/qidao/actions/runs/42346303974) 与
[引擎源码构建及草稿上传](https://github.com/Simlym/qidao/actions/runs/42346327407)均成功。
`engines-20261107.1` 草稿已有两个 Windows 引擎 ZIP、两份对应源码 ZIP、
`engine-release.json` 和 `SHA256SUMS.txt`，合计六个附件。
草稿仅维护者可见，尚未公开发布，不能作为匿名安装器的有效下载来源。

全部附件已重新下载并核对 GitHub asset digest、总校验清单及程序包内文件校验值；
下载后的两个程序均通过本地 UCI 握手、权重加载、深度 2 试算和正常退出。
该核验属于协议级测试，不能替代用户对新云端产物的应用验收。

| 云端程序包 | ZIP SHA-256 |
| --- | --- |
| 标准象棋 | `16b23ea34b83a0866d8a9c1150e66616494930b653cfec88a80fb085641473ec` |
| 揭棋 | `b7f2d047547a8f95e1752bf7943e6f59be9614221e873c3facfbff155cac2d15` |
