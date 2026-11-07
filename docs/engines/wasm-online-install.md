# Web / Android WASM 在线安装与候选验收

客户端安装链路、同源分发和真实标准象棋 WASM 候选已完成浏览器自动验收，
等待后续与 PC 一起发布。前端 [`wasm-packages.json`](../../frontend/src/domain/xiangqi/engine/wasm-packages.json)
只登记准确候选，`publicDownload=false`，不把未发布构建显示为可下载版本。

## 已实现

- 标准象棋和揭棋设置均接入在线安装卡片，保留目录导入。
- 来源由编译时固定清单指定为棋岛同仓库的固定 Release 标签；不跟踪 latest，不接受用户填 URL。
- 下载不带账号 Token、Cookie 或来源页信息，无需登录；使用独立的共享 API 下载模块。
- 流式进度、300 秒安装总超时、取消及页面卸载中止。
- ZIP 精确大小和 SHA-256、清单 SHA-256、包身份与全部资源大小和 SHA-256 检查。
- 拒绝重复路径、路径穿越、未登记文件、不支持的压缩方法、超过 40 个文件或 256 MiB 的声明解压总量。
- 每次安装使用独立暂存缓存路径；候选 Worker 通过 UCI 握手及 ready 检测后才提交配置。
  失败、取消、页面已离开、缓存空间不足或配置写入失败，清理候选并保留原引擎。
- 单线程包可在无跨源隔离的环境使用；多线程包要求 SharedArrayBuffer 和 crossOriginIsolated。
- Service Worker 首次接管等待有超时且可取消，不强制刷新页面。不支持缓存的安卓 WebView 明确提示。
- 手动目录导入也改为先写完新缓存再保存配置，避免写入失败时先删除旧文件；其原有启动检测方式保留。

## 清单与包契约

`wasm-packages.json` 每项须包含：`id`（发行项 ID）、`packageId`（包内 ID）、
`name`、`version`、`variant`、`runtime=wasm`、`threads`、`releaseTag`、`fileName`、
`url`、`size`、`sha256`、`manifestSha256`、`engineLicense`、`networkLicense`、`publicDownload`。
`url` 必须精确对应 `https://github.com/Simlym/qidao/releases/download/<固定标签>/<文件名>`。
只有公开发行、授权与目标平台测试完成后才能置 `publicDownload=true`。

ZIP 根目录包含 `engine-manifest.json`。沿用 [WASM 包规范](package-spec.md)，
在线包的 `assets` 还必须逐个记录 `size` 和 `sha256`，并登记 Worker 入口、WASM、网络、
许可及源码说明等全部文件；清单自身不放入 assets。不额外套外层目录或写入空目录项。
Worker 必须把初始化、棋种及坐标转换封装好，支持逐行 UCI 文本通信；不能直接把任意
Emscripten 胶水文件当作 Worker 入口。候选检测目前只证明握手就绪，不代替真实局面、
NNUE 启用、红黑坐标、多候选和停止分析等构建验收。

## 统一发布前仍需完成

1. 标准象棋 Fairy + CC0 线程版已完成构建与浏览器验收；继续评估无共享内存的单线程路线。
   揭棋仍需独立构建，并验证扩展 FEN 与限知协议，不复用普通象棋包。
2. 部署静态分发目录并验证 HTTPS 站点，见下节。浏览器不再直接依赖 GitHub 附件的 CORS；
   GitHub URL 保留为固定发行身份，实际下载文件仍须通过相同大小与 SHA-256 检查。
3. 在实际 Web 部署验证缓存资源响应头、Worker 同源读取、离线重启和更新回退。
4. 安卓真机验证自定义资源协议下的 Service Worker 与 CacheStorage；若不支持，需另行实现
   原生文件存储和资源访问桥接。当前能力检测不等于已支持全部 Android WebView。
5. 验收真实附件后填写清单，连同 PC 下载与新版软件统一发布。当前未发布软件或引擎。

自动回归从 `frontend/` 执行 `npm run test:core`、`npm run test:config` 和 `npm run build`。
单元测试使用本地构造 ZIP 和受控网络替身；另有下述真实 WASM 浏览器集成测试，
两者都不替代安卓真机验收。

## 静态分发与跨域

Web 默认从当前站点的 `/engine-releases/<固定标签>/<文件名>` 下载。
安卓通过公开构建参数 `VITE_ENGINE_DOWNLOAD_BASE_URL=https://站点/engine-releases` 指定同一目录；
不绑定账号、会员或所选业务服务器。该参数不能包含凭据、查询参数或片段。
前端目录中保留编译时固定清单，保证独立 `frontend/` Docker 构建无需读取容器外的 docs。

正式 Release 附件下载到维护者机器后运行：

```powershell
python scripts/prepare_wasm_site.py --artifacts 已下载的附件目录 --output dist-engine-site
```

脚本只复制清单中 `publicDownload=true` 且 ZIP、包内清单哈希均匹配的包；
不访问网络、不自动发布，也不替换固定标签下的不同内容。
Compose 将独立目录只读挂载到 Nginx，不把引擎加入前端镜像或应用安装包。
Nginx 为该路径提供匿名 GET/HEAD、CORS `*` 与跨源资源响应头；缺失文件返回 404，
不落入 SPA 首页。支持跨源下载不等于可跨源执行 Worker：下载后仍在本设备同源缓存中运行。

开发调试可使用独立静态服务器并显式指定下载基址；不要把本机引擎放进 `frontend/public/`。
真实 WASM 浏览器验收脚本 `frontend/scripts/test-wasm-engine.mjs` 使用临时站点和隔离浏览器上下文，
测试包不进入正式清单。它依次测试真实下载校验、缓存安装、NNUE 启用、红黑强制着法、
MultiPV、停止搜索、新局面及离线重新启动。

## 固定源码 WASM 候选

官方移植仓库 `fairy-stockfish/fairy-stockfish.wasm` 固定提交
`d062eec1681dc8c805fed80dfa0528eeb554312b`，采用上游 Emscripten 2.0.26 工具路线，
Docker 镜像固定到 SHA-256，匹配同一 CC0 象棋网络。
构建入口为 `scripts/build_wasm_engine.py` 和手工触发的 `wasm-engine-candidate.yml`。
产物包含匹配网络、GPL/CC0/署名、上游完整源码、棋岛 Worker 与构建脚本、镜像摘要及校验和。
该上游采用 pthread：即使 `Threads=1` 仍要求 SharedArrayBuffer；当前候选必须标记 `threads=true`。
没有把它标为可在不支持跨源隔离的 Android WebView 上使用的单线程版本。

安卓配置已按 [Tauri 官方响应头配置](https://v2.tauri.app/security/http-headers/)为应用资源加入
COOP/COEP，不改变应用标识、来源协议或既有存储目录。它只提供隔离所需的响应头，
不保证每个 WebView 支持线程或 Service Worker；本机 ADB 当前未连接设备，真机验收尚未完成。

## 浏览器与分发验证（2026-11-07）

[最终候选构建与测试](https://github.com/Simlym/qidao/actions/runs/42364688124)（棋岛提交 `3731096`）通过：

- Ubuntu / Chromium：真实 ZIP 下载、逐项校验、Service Worker 缓存安装与候选握手。
- 指定 CC0 NNUE 启用确认，红方强制 `h2e2`、黑方强制 `h7e7`，MultiPV=3。
- 无限搜索停止、停止后新局面试算、断网后销毁并重新启动引擎。
- 使用真实 `frontend/` Docker 上下文构建镜像；Nginx 匿名静态下载、CORS/CORP、缺失文件 404。
- 本机 Windows / Chrome 对最终云端 ZIP 做了同一完整测试，通过。

旧 Emscripten 在包装 Worker 内无法自动确定主脚本 URL，首次测试因此失败；
入口现已显式设置 `mainScriptUrlOrBlob`，修复包含在上述最终云端产物中。
上游 Makefile 的构建与复制目标缺少顺序依赖，也已在脚本中拆开执行。

候选保存为 GitHub Actions 测试产物，不创建正式 Release，不置为 Latest，也不改变现有 PC 引擎。
WASM 包和源码附件的准确校验值见前端固定清单及 `acceptance.json`。
待完成：安卓真机、无 SharedArrayBuffer 的单线程路线、揭棋 WASM 与统一公开发布。

最终文件位于本机 `dist-engines/wasm-20261107-01/`，可解压后在支持跨源隔离的 Web 设置中
手动导入目录；其 `package/` 子目录也已按清单逐文件校验解压。
ZIP 为 `xiangqi-fairy-stockfish-c07e94a5-d062eec1-wasm-threads.zip`，5,497,658 字节，
SHA-256 `50a5a24e73cede25218281d7a4e76ff2aea484bc6656f8d57cdc59906edc29b2`；
清单 SHA-256 `26f225eab76c871947b4fad3b15be028b305a922d16998f6701b2fbf2bf95f7e`。
`engines-20261107.3` 仅预留为候选的计划发行标签，尚未创建该 Release。
