# 同仓库引擎发行方案

## 当前进度

第一阶段已建立本地基线和包规范；第二阶段改为直接从固定 GitHub 源码重新构建，见[源码构建步骤](source-builds.md)。本地旧文件仅作历史参考，不再作为打包输入。已增加构建脚本与手动草稿工作流，尚未发布引擎附件，也未修改客户端下载地址。

第二阶段两个新源码构建的 Windows 测试包已完成协议级试算，用户已确认在 PC 客户端均可正常使用。
按具体 ZIP 校验值登记的[应用验收记录](acceptance.json)与分发审核独立；不回写或重打包已测试的 ZIP，避免改变验收对象。
当前 Windows 安装器仍读取 `install-catalog.json`，从 Fairy-Stockfish 上游下载；
它尚未接入本文定义的新清单。Fairy-Stockfish 的现有下载能力不等于已完成棋岛实机验证。

## 本地兼容性基线

`baseline-sources.json` 记录版本依据、协议、验证范围及分发审核状态；
`baseline-lock.json` 记录本地文件相对路径、精确大小与 SHA-256。
两者仅供开发和发行审计，不是客户端可安装目录，不含可用下载地址。

用户已确认 PC 的 Pikafish 标准象棋和揭棋正常使用。具体构建与测试用例尚未记录，
因此不将同目录的 Linux、macOS、Android 构建视为通过，也不将 WASM 视为通过。
版本名来自本地元数据；校验值只证明文件身份，不证明上游真实性或授权。
本次清单记录于 2026-11-07，该日期不是历史运行测试日期。

在仓库根目录运行：

```powershell
python scripts/engine_inventory.py --check
# 仅在审核了本地文件变更后更新基线
python scripts/engine_inventory.py
```

本地引擎被 Git 忽略，干净克隆不具备这些文件，因此这项文件校验不加入普通 CI。
后续打包流程必须校验指定构建的文件，不要求发布机器拥有全部本地平台产物。

## Release 与文件命名

仓库统一使用 `https://github.com/Simlym/qidao`：

- 软件标签：`v<软件版本>`，附件为 PC 安装包、Android APK 等。
- 引擎标签：`engines-<YYYYMMDD>.<修订号>`，首次可使用 `engines-20261107.1`；此处仅为命名示例。
- 引擎 Release 不标记为软件 Latest。软件和引擎分别更新，不重复上传未变化的引擎。
- 原生附件：`<棋种>-<引擎>-<版本>-<系统>-<架构>-<指令集>.zip`。
- WASM 附件：`<棋种>-<引擎>-<版本>-wasm-<single或threads>.zip`。
- 配套附件：`engine-release.json`、`SHA256SUMS.txt` 和对应版本源码包、构建说明。

客户端只使用固定 Release 标签和文件校验值，不跟随 `latest`，不在原标签下替换附件。
修复后的包递增修订号。公开匿名下载要求仓库公开，不向客户端嵌入 GitHub Token。
引擎属于设备，下载、导入与登录和会员无关；用户主动更新，保留回退能力。

## 统一包布局

每个 ZIP 根部直接放清单和文件，不额外套目录：

```text
engine-manifest.json
engine.exe / engine / engine.worker.js
其他运行文件（WASM、JavaScript、数据或 NNUE）
licenses/              # 程序与权重各自的实际许可及署名
SOURCE.md              # 上游版本、提交、对应源码附件和构建方法
```

原生包和 WASM 包共用身份字段；`runtime` 分别为 `native` 和 `wasm`。
原生包的入口是程序，WASM 入口是 Worker。`variant` 分别为 `xiangqi`、`jieqi`。
程序、棋种、权重与 UCI 参数一并锁定，不允许跨包猜测权重。
WASM 继续遵守 [现有导入规范](package-spec.md)，发行元数据采用附加字段，不改变当前导入器行为。

后续发行清单 `engine-release.json` 的每个条目至少包含：

| 字段 | 含义 |
| --- | --- |
| `id`、`version`、`variant`、`runtime` | 稳定身份、版本、棋种、运行时 |
| `platform`、`requiresFeatures` | 系统、架构及必要指令集；WASM 标记线程要求 |
| `releaseTag`、`fileName`、`size`、`sha256` | 固定附件身份与下载完整性 |
| `sourceUrl`、`sourceCommit`、`sourceArchive` | 对应源码和构建材料；不能用主仓库自动生成的源码包代替第三方源码 |
| `engineLicense`、`networkLicense` | 分别记录程序、实际权重的许可依据 |
| `uciOptions`、`coordinates` | 必要 UCI 参数及 `a0-i9` 坐标 |
| `verification` | 被验证的软件版本、平台、构建、测试项与结果 |

## 发布准入与后续步骤

只有来源明确、对应源码及许可材料齐全、允许目标使用和分发、并通过目标平台测试的包，
才进入公开发行清单。当前三组 Pikafish 本地基线均为 `pending-review`，不生成公开下载项。
Pikafish 历史揭棋权重需核实历史文件自己的许可，不能仅凭当前标准象棋权重说明作出结论。
Fairy-Stockfish + 明确 CC0 的象棋网络是商业默认候选，完成版本选择及验证后单独登记。

后续顺序：打包脚本与草稿发布流程 → PC 下载安装 → Fairy-Stockfish/CC0 网络验证
→ Web/Android 下载、校验与缓存 → 软件发布和完整回归。
Web 使用 Release 附件仍需解决 CORS、Worker 同源加载和 COOP/COEP；
Android 还需实测 WebView 缓存和资源协议，不假定可直接复用浏览器 Service Worker。

PC 安装器已扩展为按棋种安装固定 ZIP 包，见[PC 安装器验证记录](pc-package-installer.md)。
本地导入、受限解压、资源校验、象棋/揭棋独立试算及配置启用已接通。
在线下载代码使用同仓库固定 Release 地址，但草稿版本保持禁用；不将示例或草稿地址写成有效下载项。
