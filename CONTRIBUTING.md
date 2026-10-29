# 参与棋岛开发

欢迎参与棋岛（QiDao，中国象棋与揭棋对弈、训练及分析平台）。先阅读 [项目介绍](README.md) 和 [架构说明](docs/ARCHITECTURE.md)，再按照以下步骤启动项目。

## 运行环境与启动

- 后端：Python 3.10+、uv；在 `backend/` 执行 `uv sync` 和 `uv run python -m app`。
- 前端：Node.js 20+、npm；在 `frontend/` 执行 `npm ci` 和 `npm run dev`。开发服务器默认将 `/api` 代理到本地 8000 端口。
- Windows/Android 客户端通过 Tauri 2 共用 `frontend/`；构建与服务器地址配置见 [客户端构建](docs/development/build-clients.md)。

## 改功能，先找哪里？

| 修改内容 | 主要目录 |
| --- | --- |
| 页面、导航、布局 | `frontend/src/app/` |
| 训练、对弈、棋谱、揭棋等页面 | `frontend/src/features/<功能>/` |
| 棋规、浏览器/原生引擎适配 | `frontend/src/domain/xiangqi/` |
| HTTP 传输与业务 API | `frontend/src/shared/api/` |
| 原生系统功能与 IPC | `src-tauri/` |
| API、训练业务、题库管理 | `backend/app/modules/<领域>/` |
| SQLAlchemy 模型 | `backend/app/models/`（旧导入兼容 `app.core.models`） |
| 后端安全、数据库连接、配置 | `backend/app/core/` |
| 数据库变更 | `backend/migrations/versions/` |
| 题目导入数据与逻辑 | `backend/seeds/`、`backend/app/modules/puzzles/importer/` |

## 代码组织原则

1. **按业务能力归属**：功能优先归入对应的 `features/` 或 `modules/`；只有确实跨业务复用的稳定代码才进入 `shared/`。
2. **前端 UI 不直接访问 HTTP**：统一通过 `shared/api/`；大型页面拆出局面状态 Hook 和可复用展示组件，不盲目多加目录层级。
3. **后端职责**：`router.py` 负责用户 API、`admin_router.py` 负责本领域管理员 API、`schemas.py` 定义 Pydantic 协议、`service.py` 协调业务、必要时用 `repository.py` 查询数据；不要为只有几行代码的模块强行加所有文件。
4. **模型与迁移**：模型引用保持同一 SQLAlchemy `Base`；表和列的变化必须新建 Alembic revision，不能靠移动模型文件隐式更改数据库结构。
5. **双端棋规一致**：修改走子规则、FEN 或 UCI 时，请同步检查 Python `app/shared/xiangqi/` 与 JS `frontend/src/domain/xiangqi/` 的实现与测试。
6. **兼容性**：重构原则上保持已有 API 路径、数据库结构、运行时配置、游客隔离以及 Web/Windows/Android 行为不变。

## 提交前验证

```bash
# backend/
uv sync
uv run python -m pytest tests

# frontend/
npm ci
npm run test:core
npm run test:config
npm run build
```

CI 在 Pull Request 中运行上述验证。改动只涉及文档时可在 PR 描述里写明，无需发布安装包。

建议每次 PR 聚焦一个明确问题；在描述中包含**原因、变更范围、验证结果和风险点**。大型重构尤其要区分纯代码移动与行为改动。

## AI Coding

仓库级统一约定在 [AGENTS.md](AGENTS.md)。无论使用 Codex 还是 Claude Code，都以它为架构边界和测试约定；AI 生成代码同样必须经过人工审阅、测试和 PR 检查。

## 许可说明

仓库已有 [第三方声明](THIRD_PARTY_NOTICES.md)。项目自身的开源许可尚待仓库维护者确认；未经明确授权，请勿擅自给本项目添加许可条款或修改第三方组件许可。
