# 象棋道多端架构

## 技术栈

| 部分 | 实现 |
| --- | --- |
| Web / PWA | React 18、Vite |
| PC 与 Android 客户端 | Tauri 2，共用 React 界面 |
| 后端 API | FastAPI、SQLAlchemy、Alembic |
| 数据库 | 本地默认 SQLite，Compose 默认 PostgreSQL |
| 训练调度 | SM-2 间隔重复与题目 / 用户 ELO |
| 棋类能力 | 标准象棋与揭棋规则层、原生 / WASM 引擎、云库与内置搜索降级 |
| AI | 可选的服务端大模型集成 |

## 边界

- `frontend/` 是 Web、PC、Android 共用的 React 前端，不维护三份业务界面。
- `src-tauri/` 只提供系统能力：窗口、安装包和原生引擎子进程；不复制业务逻辑。
- `backend/` 提供账号、会员、积分、棋谱、训练和云端 AI。以后更换后端技术栈时，只要保持 HTTP API 契约，客户端无需重写。
- 标准象棋和揭棋分别拥有规则实现、引擎配置和引擎进程入口，不混用局面语义。
- 揭棋支持人机对战与自由翻子两条流程：人机对战随机确定暗子身份；自由翻子由走子方从本方剩余暗子池指定身份，吃掉未揭暗子时不推断或扣减对方暗子池。
- 自由翻子可持续调用揭棋专用引擎分析当前局面，统一展示红方视角评分、最佳着法、主变，并在棋盘上绘制推荐着法箭头；每次完成走子和翻子后自动刷新。

## 目录与依赖方向

```text
frontend/src/
├─ app/                 应用编排、导航，以及 Web/Android、PC 两套外壳
├─ features/            训练、对弈、棋谱、教练、统计等用户能力
├─ domain/xiangqi/      标准象棋/揭棋规则与端侧引擎
├─ shared/              API、通用 UI、偏好、声音、Hooks 与工具
├─ platform/            Web、PC、Android 运行时识别与能力开关
├─ styles/              基础、功能、平台和主题样式入口
└─ main.jsx             唯一前端入口

backend/app/
├─ core/                配置、数据库、ORM、安全、限流与日志
├─ modules/             每项业务的 API 与服务，题库导入器也归入 puzzles
├─ engine/              标准象棋/揭棋引擎进程、profile 和流式 API 契约
├─ integrations/        LLM、云库等外部服务适配
├─ shared/              象棋通用规则、杀棋校验、ELO 等稳定领域能力
├─ routes.py            统一路由注册表
└─ main.py              FastAPI 装配入口

src-tauri/
├─ src/                 PC/Android 原生桥接与本地引擎进程
├─ capabilities/        Tauri 权限白名单
└─ gen/android/         Tauri 生成的 Android 工程，不放业务逻辑
```

依赖保持单向：`app/` → `features/` → `domain/`/`shared/` → `platform/`；后端 `modules/*/router.py` → 模块服务/仓储 → `core/models.py`。功能代码不得反向依赖应用外壳，前端页面不得自行调用 `fetch`。PC 与 Android 只在外壳和平台适配层分叉，训练、对弈、复盘等业务逻辑继续共享。

## 引擎选择

客户端按以下顺序选择可用能力：

1. PC：用户选择的 Tauri 原生 UCI 子进程；
2. Web/Android：用户导入并保存在设备本地的 WASM UCI Worker；
3. 所有端：管理员明确配置的 FastAPI 远程 UCI 引擎；
4. 标准象棋服务端无外部引擎时：内置搜索兜底。

象棋和揭棋各自保存引擎 profile。切换棋类时会重启单一原生引擎进程，防止两个高负载引擎同时争抢 CPU。

## 性能保障

- 原生引擎不运行在浏览器渲染线程，UCI 输入输出通过异步事件传递，深度搜索不会阻塞 React。
- 同一引擎的请求通过 Promise 队列串行化，避免多次点击并发搜索导致 CPU 突增或输出串线。
- 默认 `Threads <= 4`、`Hash = 256MB`、`MultiPV = 1`；界面限制最大 8 线程、2048MB。
- 每次搜索有 30 秒超时并发送 `stop`，启动握手有 10 秒超时；失败自动进入下一层 Adapter。
- Web 端 WASM 可放入 Worker；多线程版本需要 COOP/COEP 响应头。

这些措施保证 UI 不被引擎直接阻塞。极低配置机器仍可能因系统整体 CPU 饱和出现调度延迟，因此默认线程数只取逻辑核心的一半且上限为 4。

## 会员与安全

PC 安装包包含统一前端代码，包括 AI 相关组件，但不包含大模型密钥。登录后客户端读取权益并显示 `ai_analysis`、`ai_training`、`cloud_engine` 等入口；FastAPI 在实际 AI 请求中按当前会员状态选择额度上限，并通过服务端账本校验，不以前端显示为依据。

训练积分仅用于训练奖励与外观兑换；AI 使用独立额度。免费 / Pro 的自然月上限由管理员策略决定，Pro 不再无限放行。所有训练相关模型请求通过 `modules/ai_usage` 先预留再调用，成功结算，失败按原单价与原月份退款。管理员可开通、续期或取消会员，以及手工调整补充额度；当前未接入支付。

## 棋谱数据

标准象棋可从初始 FEN 和 UCI 着法重建全部局面。揭棋暗子身份带随机性，因此除扩展着法外还保存每一步完整 FEN；复盘和分析直接读取这些快照，避免丢失揭子信息。

## 运行时服务器与会话

`shared/api/server.js` 解析构建时默认 API 地址与当前设备自定义地址，每个页面生命周期固定一个连接。高级设置通过不带凭据的 `/health` 检查 `service=xiangqidao` 和 `api_version=1`，成功后保存地址、中止普通/流式请求并重载页面；恢复默认无需网络。多标签通过 storage 事件同步重载。

`shared/api/session.js` 按规范化的完整 API 地址隔离 token 和游客 ID，包含路径前缀；旧单实例凭据只迁移到构建默认实例。页面内用户、权益、棋谱和分析状态随重载重置，本地引擎与设备偏好保留。复习提醒按服务器隔离；API 禁用 cookie、重定向和浏览器缓存，Service Worker 跳过 API、带身份头或 no-store 请求，并清理旧壳缓存，避免离线返回其他身份的数据。

## 原生引擎引导安装

Windows x64 的安装桥接位于 `src-tauri/src/engine_install.rs`，下载、校验、版本目录与独立 UCI 试算位于 `src-tauri/engine-installer/`。安装清单从 `docs/engines/install-catalog.json` 编译嵌入；只有清单内的适配构建可安装，网络操作在阻塞工作线程执行。安装任务互斥，支持取消，文件在暂存目录校验及试算通过后原子移入版本目录。非桌面客户端不编译安装器依赖。

默认 Fairy-Stockfish 使用 `xiangqi` 变体、`ucicyclone` 坐标及传统评估。前端通过 `platform/nativeEngineInstaller.js` 访问 IPC，不直接下载可执行文件。启用配置失败会关闭失败进程并恢复旧 profile；已安装版本不被覆盖，可核验后回退。业务后端与会员不参与设备引擎安装。

## AI 额度与成本账本

`AIQuotaAccount` 的数据库写锁序列化同一用户的额度变动，`AIQuotaMonth` 保存自然月用量，`AIOperation` 通过用户与请求标识的唯一约束实现预留、成功结果重用及幂等退款。网络期间不持有数据库写锁；过期预留在 15 分钟后可回收，迟到结果不再结算。账号删除与额度变动使用一致的账户锁，数据库外键保证生产环境关联清理。

实际 LLM 调用通过 ContextVar 绑定 operation 与当前数据库，将 token 和成本日志写入同一实例；未知价格或缺失用量使用 `cost_known=false`，不能把 0 显示为免费。额度策略、迁移、接口与运维边界见[AI 额度部署说明](deployment/ai-usage.md)。

## 题库反馈、审核与版本

`modules/puzzles/quality.py` 负责版本族写锁、内容指纹、人工审核及发布事务；`feedback_router.py` 分隔用户自己的反馈与管理员处理队列。所有题解修订创建新题号，根节点关联版本族；发布新版时事务内下架旧版并交接局面唯一键，不移动旧作答、SM-2 或棋局引用。

人工审核绑定题目内容指纹，修改教学信息或题解后清除当前通过状态，历史记录仍保留。反馈只向提交者及管理员展示；删除账号后匿名保留问题记录。管理员对外处理回复与内部审核依据分开保存。用户界面与操作约束见[题目质量管理](development/puzzle-quality.md)。
