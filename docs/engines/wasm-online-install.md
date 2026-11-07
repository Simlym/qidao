# Web / Android WASM 在线安装（第一部分）

本阶段实现客户端安装链路，等待后续与 PC 一起发布。尚无经过验收并可公开分发的
WASM 附件，因此 `wasm-packages.json` 的 `packages` 暂为空；设置页显示准备状态，
不使用原生 EXE、示例地址或未验收构建冒充推荐下载。

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

1. 从固定公开源码构建单线程优先的 WASM 包，核对匹配权重、许可、对应源码和 Worker 协议。
   标准象棋优先评估 Fairy + CC0 网络；揭棋需单独验证扩展 FEN 与限知协议，不复用普通象棋包。
2. 解决浏览器下载 CORS。原生端可下载 GitHub 附件，不代表浏览器 fetch 可读取它；当前传输层
   使用 CORS 模式，失败会明确报错。尚未实现同源分发/代理，也未在 GitHub 不支持 CORS 时自动绕过。
   正式接入同源分发或受控代理时仍须固定源和哈希，并保留 GitHub 为发行依据，不传业务凭据。
3. 在实际 Web 部署验证缓存资源响应头、Worker 同源读取、离线重启和更新回退。
4. 安卓真机验证自定义资源协议下的 Service Worker 与 CacheStorage；若不支持，需另行实现
   原生文件存储和资源访问桥接。当前能力检测不等于已支持全部 Android WebView。
5. 验收真实附件后填写清单，连同 PC 下载与新版软件统一发布。当前未发布软件或引擎。

自动回归从 `frontend/` 执行 `npm run test:core`、`npm run test:config` 和 `npm run build`。
测试使用本地构造 ZIP 和受控网络替身，不将其视为真实 WASM 或安卓真机验收。
