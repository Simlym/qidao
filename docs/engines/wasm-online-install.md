# Web / Android WASM 在线安装与候选验收

客户端安装链路、同源分发和真实标准象棋 WASM 候选已完成浏览器自动验收，
等待后续与 PC 一起发布。前端 [`wasm-packages.json`](../../frontend/src/domain/xiangqi/engine/wasm-packages.json)
只登记准确候选，`publicDownload=false`，不把未发布构建显示为可下载版本。

## 已实现

- 标准象棋和揭棋设置均接入在线安装卡片，同时提供 ZIP 文件与目录两种本地导入入口。
  ZIP 按大小和 SHA-256 匹配当前棋种固定清单，未公开的候选也可离线导入；自定义包保留目录入口。
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

1. 标准象棋 Fairy + CC0 线程版与单线程版均已完成构建与浏览器验收。
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
该上游采用 pthread：即使 `Threads=1` 仍要求 SharedArrayBuffer；线程版标记 `threads=true`。
单线程版通过 `--flavor single` 在独立源码目录应用棋岛适配：移除 pthread 调度，搜索在一个
Worker 中运行，使用 Asyncify 定期让出事件循环处理停止标志，其他 UCI 命令仍按顺序消费。
包内附完整修改补丁，源码附件包含适配脚本；单线程版标记 `threads=false`，不使用共享内存。
它仍需要 Worker、Service Worker 与 CacheStorage，不代表已通过安卓真机验收。

安卓配置已按 [Tauri 官方响应头配置](https://v2.tauri.app/security/http-headers/)为应用资源加入
COOP/COEP，不改变应用标识、来源协议或既有存储目录。它只提供隔离所需的响应头，
不保证每个 WebView 支持线程或 Service Worker；本机 ADB 当前未连接设备，真机验收尚未完成。

### 安卓 Service Worker 脚本分发修复

首次真机测试在注册 `http://tauri.localhost/sw.js` 时报告脚本获取失败，尚未进入引擎试算。
安卓 Service Worker 使用独立的资源回调；现在在受版本管理的
`src-tauri/android/MainActivity.kt` 中，通过
[ServiceWorkerClientCompat](https://developer.android.com/reference/androidx/webkit/ServiceWorkerClientCompat)
将本应用固定 `/sw.js` 的 GET 请求交给现有 Tauri/Wry 资源处理器。
回调不代理业务 API 或外部来源，不改变应用标识与存储来源。
`build.rs` 在安卓编译时同步入口到生成目录，重新初始化工程后仍能保留修复。

修复后，Pixel_10 / Android 17 / WebView 149 模拟器实际安装 APK 验证通过：
Service Worker 注册并接管、设置页单线程 ZIP 导入与 UCI 就绪、NNUE 启用、红黑指定着法与停止；
关闭模拟器 Wi-Fi 和移动数据并强制结束应用后，再次启动引擎并试算通过。
协议复验脚本为 `frontend/scripts/test-android-wasm.mjs`，需通过 ADB 转发测试 APK WebView
的调试端口，且先导入候选 ZIP；该脚本不进入应用产物。模拟器验证不替代用户 ARM64 真机复测。
用户收到 ARM64 修复版 v2 后确认“测试了，走棋正常”，已登记真机走棋验收。
真机断网冷启动、停止重开及正式在线下载仍待逐项确认。

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
待完成：安卓真机、实际 HTTPS 部署、揭棋 WASM 与统一公开发布。

最终文件位于本机 `dist-engines/wasm-20261107-01/`，可在支持跨源隔离的 Web 设置中
点击“选择 ZIP 引擎包”直接导入，无需解压；也可使用已解压的 `package/` 子目录。
新增文件入口已用 Windows / Chrome 实际选择该 ZIP 并检测启用通过，
验收脚本增加 `--ui-import` 可复测真实设置组件的文件选择和成功提示。
ZIP 为 `xiangqi-fairy-stockfish-c07e94a5-d062eec1-wasm-threads.zip`，5,497,658 字节，
SHA-256 `50a5a24e73cede25218281d7a4e76ff2aea484bc6656f8d57cdc59906edc29b2`；
清单 SHA-256 `26f225eab76c871947b4fad3b15be028b305a922d16998f6701b2fbf2bf95f7e`。
`engines-20261107.3` 仅预留为候选的计划发行标签，尚未创建该 Release。

## 单线程候选验收（2026-11-07）

[单线程构建与浏览器测试](https://github.com/Simlym/qidao/actions/runs/42368271147)
基于棋岛提交 `eb94c04`，使用同一固定上游提交、镜像和 CC0 NNUE。
Ubuntu / Chromium 与本机 Windows / Chrome 均在 `crossOriginIsolated=false` 且
`SharedArrayBuffer` 不存在的环境通过安装、NNUE、红黑着法、MultiPV、停止和离线重启。
本机补充验证真实 ZIP 文件选择，以及立即排队停止旧搜索并启动新局面的命令顺序；
本次停止响应约 21 毫秒，该数值仅为本机测试结果。

文件位于本机 `dist-engines/wasm-single-20261107-01/`：
`xiangqi-fairy-stockfish-c07e94a5-d062eec1-wasm-single-v1.zip`，5,418,500 字节，
SHA-256 `9b6c52ecdc7bae9c030b475c116347b5b86fd8aeefa1207dadce7f7d83d44f5a`；
清单 SHA-256 `7b5fa96f49319d09cc5eae822ff40c6c79b3f169b233efe3570ff28db852a762`。
该包登记在推荐列表首位，保留线程版供选择，现有已安装引擎不会自动替换。
用户随后确认“单线程测试通过”，已单独记录用户验收；未指定测试平台，不视为安卓真机验收。
`engines-20261107.4` 仅为计划发行标签，`publicDownload=false`；不创建公开 Release。
