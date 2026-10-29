# 后端部署与维护

本文从仓库根目录操作。官方托管后端尚未上线；示例中的 `chess.example.com` 必须替换成你自己的域名。客户端构建及地址配置见[构建文档](../development/build-clients.md)。

## 部署拓扑

现有 Docker Compose 一次启动完整的自托管实例，并非仅启动 API：

```text
浏览器 / Windows / Android
           ↓ HTTPS
    服务器上的 Caddy / Nginx（TLS）
           ↓ HTTP 127.0.0.1:8080
    frontend（Nginx：静态页面 + /api 代理）
           ↓ backend:8000
    backend（FastAPI） → database（PostgreSQL）
```

仅 `frontend` 发布主机端口，API 和 PostgreSQL 默认只在 Compose 网络中可达。桌面或 Android 客户端也通过同一个域名的 `/api` 访问后端，不需要开放 8000 / 5432 端口。没有引擎和 LLM 也能启动；标准象棋会使用内置搜索降级。

## 准备与首次启动

服务器需要 Git、Docker Engine 和 Docker Compose v2。准备域名并指向服务器；公网 HTTPS 示例需要开放 80 / 443。Windows 本地部署可使用 Docker Desktop。

```bash
git clone https://github.com/Simlym/xiangqidao.git
cd xiangqidao
cp .env.docker.example .env
```

PowerShell 复制命令：`Copy-Item .env.docker.example .env`。编辑根目录 `.env`，至少设置：

```dotenv
SECRET_KEY=<独立随机长密钥>
POSTGRES_DB=xiangqidao
POSTGRES_USER=xiangqidao
POSTGRES_PASSWORD=<独立随机数据库密码>
HTTP_PORT=127.0.0.1:8080
CORS_ORIGINS=https://chess.example.com,http://tauri.localhost,https://tauri.localhost
ADMIN_USERNAME=<准备注册的管理员用户名>
VITE_API_BASE_URL=/api
```

`HTTP_PORT=127.0.0.1:8080` 将容器入口仅绑定到宿主机回环地址，供同机 TLS 代理使用；本机直接体验可保留示例的 `8080`。使用远程服务器时，初始化管理员前不要开放公网入口。

分别运行两次 `openssl rand -hex 32` 生成不同的密钥和数据库密码；没有 OpenSSL 时，可用 `python -c "import secrets; print(secrets.token_hex(32))"`。不要保留示例占位值。数据库密码被拼入 URL，请只使用字母、数字、下划线或连字符。根目录 `.env` 不提交 Git，并限制文件读取权限。

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 backend
curl --fail http://127.0.0.1:8080/api/health
```

PowerShell 可用 `Invoke-RestMethod http://127.0.0.1:8080/api/health`。应返回包含 `status=ok`、`service=xiangqidao`、`api_version=1` 和当前 `version` 的 JSON；首次启动会等待数据库健康，自动迁移并播种空公共题库。已有公共题库不会自动扩容，见[题库维护](../development/puzzles.md)。

构建默认使用 DaoCloud 镜像源、阿里 pip 源、npmmirror。海外可在 `.env` 设置：

```dotenv
IMAGE_REGISTRY=docker.io
PIP_INDEX_URL=https://pypi.org/simple
NPM_REGISTRY=https://registry.npmjs.org
```

根目录 `.env` 由 Compose 读取，`backend/.env` 供源码方式启动使用；两者不会自动互相加载。Compose 只传递 [docker-compose.yml](../../docker-compose.yml) 中列出的变量；新增后端选项时需同时补到 service 的 `environment` 或使用 override。

## 初始化管理员

1. 保持公网入口关闭。在服务器本机访问 `http://127.0.0.1:8080`；远程机器可使用 SSH 隧道：`ssh -L 8080:127.0.0.1:8080 user@server`，然后在本机访问该地址。
2. 使用 `.env` 中 `ADMIN_USERNAME` 对应的用户名注册，密码至少 8 位且应足够强。
3. 登录并确认可进入管理后台，再开放公网入口。

**当前实现无论是否设置 `ADMIN_USERNAME`，第一个注册用户都会成为管理员；匹配 `ADMIN_USERNAME` 的注册者也会成为管理员。** 指定用户名不会预先创建账号，也不能替代开放前的初始化。可在注册完成后清空 `ADMIN_USERNAME` 并重建后端，已有角色保存在数据库中。

## HTTPS 与客户端连接

以下是安装在宿主机上的 Caddy 配置示例；如果 Caddy 在容器内，`127.0.0.1` 指向它自身，需另配容器网络。

```caddyfile
chess.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

完成 DNS、80 / 443 放行并重载 Caddy 后，验证：

```bash
curl --fail https://chess.example.com/api/health
```

浏览器访问 `https://chess.example.com`。客户端可在“设置 → 服务器（高级）”填入 `https://chess.example.com/api`。需要作为安装包的默认地址时，构建配置填写：

```dotenv
VITE_API_BASE_URL=https://chess.example.com/api
```

客户端连接检测还会读取 `/api/health` 的 `service` 和 `api_version`；旧后端请更新至支持该协议的版本。健康检查不要求登录，也不返回任何用户数据。

`CORS_ORIGINS` 填写来源（协议、主机、端口），不带 `/api`。Web 为网站域名，Windows 通常为 `http://tauri.localhost`，Android 通常为 `https://tauri.localhost`，以实际 Origin 为准。留空会允许所有来源；CORS 不替代登录授权。修改后执行 `docker compose up -d backend` 重建服务配置。

部署前还需检查：

- 使用随机 `SECRET_KEY`，Compose 已设置 `APP_ENV=production` 并关闭 `/docs`。
- 数据库端口和后端端口不对公网开放；Compose 后端信任代理头，因此入口必须由你控制。
- 生产代理链要正确传递真实 IP；若增加 CDN / 负载均衡器，重新检查可信代理范围与限流效果。
- Nginx 已提供 COOP / COEP 供多线程 WASM 使用，新增代理不得覆盖丢失这些头；按实际部署补齐 HSTS、CSP、防嵌入与日志轮转。

## 配置与可选能力

后端环境变量参考：

| 环境变量 | 用途 | 默认值 |
| --- | --- | --- |
| `HOST` / `PORT` | 后端监听地址与端口 | `127.0.0.1` / `8000` |
| `DATABASE_URL` | SQLAlchemy 数据库连接串 | `sqlite:///./data/puzzles.db` |
| `SEEDS_DIR` | 首次启动自动导入的题库种子目录 | `backend/seeds` |
| `APP_ENV` | 设为 `production` 时启用生产校验并关闭 API 文档 | 空 |
| `SECRET_KEY` | 登录 token 签名密钥；生产环境必须更换 | 本地开发占位值 |
| `CORS_ORIGINS` | 允许访问 API 的前端来源，逗号分隔 | 本地开发放开 |
| `ADMIN_USERNAME` | 指定额外管理员用户名；首位注册者始终为管理员 | 空 |
| `XIANGQI_ENGINE` | 管理员自行放置的服务端标准象棋 UCI 引擎绝对路径 | 空 |
| `JIEQI_ENGINE` | 管理员自行放置的服务端揭棋 UCI 引擎绝对路径 | 空 |
| `LLM_API_KEY` | AI 教练与复盘讲解密钥 | 空 |
| `LLM_PROTOCOL` | 接口格式：`openai_chat` / `openai_responses` / `anthropic` | `openai_chat` |
| `LLM_BASE_URL` | LLM 服务地址 | `https://api.openai.com/v1` |
| `LLM_MODEL` | LLM 模型名称 | `gpt-4.1-mini` |
| `LLM_THINKING_ENABLED` | 是否开启思考模式：`1` / `0` | `1` |
| `LLM_REASONING_EFFORT` | 思考强度：`low` / `medium` / `high` / `xhigh` / `max` | `high` |
| `CLOUDBOOK_ENABLED` | 是否启用在线开局库，设为 `0` 关闭 | `1` |

更多云库参数和多端引擎降级逻辑见 [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)。


AI 月度额度、补充额度、独立训练积分和旧库升级见[会员与 AI 额度](ai-usage.md)。

### Web 构建配置

Compose 根目录 `.env` 的 `VITE_API_BASE_URL=/api` 通过 Docker build arg 写入 Web 产物；默认无需修改。独立 API 部署可设为 `https://api.example.com/api` 并配置 CORS，之后必须重新构建：

```bash
docker compose up -d --build frontend
```

这不是容器启动时动态读取的配置，也不会影响单独构建的 Windows / Android 安装包。不要在任何 `VITE_*` 配置中放密钥。

### 服务端引擎与 LLM

镜像不包含第三方引擎。自行取得适配 Linux、CPU 架构和指令集的引擎及权重，放在根目录 `local-engines/`，该目录挂载到 `/app/data/engines`。需要赋予 Linux 可执行权限；Windows `.exe` 不能直接用于 Linux 容器。

例如文件放在 `local-engines/xiangqi/pikafish`，配置 `XIANGQI_ENGINE=/app/data/engines/xiangqi/pikafish`。揭棋单独使用 `JIEQI_ENGINE`，不能复用不支持揭棋的普通引擎。修改环境变量后执行 `docker compose up -d backend`，也可在管理后台设置容器内绝对路径。许可和来源见[引擎说明](../engines/README.md)。

LLM 可在根目录 `.env` 配置 `LLM_*`，或在管理后台选择协议、Base URL、模型和密钥。后台保存的配置优先；密钥只保存在后端与数据库，不进入客户端。没有密钥时规则教练仍可工作。

## 备份、恢复与升级

数据库保存在 `postgres-data` 命名卷。`docker compose down` 保留数据；**`docker compose down -v` 会删除数据库卷，不可用于日常升级。** 不要随意更改 Compose 项目名称或仓库目录，否则可能创建另一个空卷。

### 备份

以下为 Linux / macOS / WSL Bash 命令，每次使用新目录（示例为 `backups/before-upgrade`），避免覆盖旧备份；SQL 中含用户信息和后台 AI 密钥，需加密异地保存并限制权限。Windows 可在 WSL 执行，避免旧 PowerShell 的重定向编码问题。

```bash
mkdir -p backups/before-upgrade
chmod 700 backups/before-upgrade
cp .env backups/before-upgrade/deployment.env
# 暂停业务写入，数据库保持运行。
docker compose stop frontend backend
docker compose exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl' > backups/before-upgrade/database.sql
```

确认上一命令成功、SQL 文件非空后再继续；备份失败不要用于恢复。另行备份 `local-engines/`（如已配置）、Caddy / Nginx 配置和正在使用的 Git 提交号，备份应在升级前完成。

```bash
git rev-parse HEAD > backups/before-upgrade/revision.txt
docker compose start backend frontend
```

### 升级

在管理员维护窗口完成备份后拉取经过确认的版本：

```bash
git pull --ff-only
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:8080/api/health
```

启动会自动执行迁移；随后实际登录并验证题库、训练记录和棋谱。`SECRET_KEY` 保持不变，除非有意让现有登录 token 全部失效；已经初始化的 PostgreSQL 不会因修改 `.env` 中的密码而自动更改数据库密码。

### 恢复

以下操作会用备份覆盖该实例的数据，先确认目标和备份时间，并先备份当前状态。在相同 Compose 项目和匹配的数据库配置下，停止业务服务后恢复：

```bash
docker compose stop frontend backend
docker compose up -d database
docker compose exec -T database sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/before-upgrade/database.sql
```

确认恢复成功后，将代码恢复到备份记录的版本，恢复对应 `.env`、引擎及代理配置，然后运行 `docker compose up -d --build`，验证健康检查和实际数据。数据库迁移发生后，仅切回旧代码未必兼容，回滚应配套数据库备份。定期在独立实例演练恢复。

## 不使用 Docker 的后端运行

按[本地开发](../development/build-clients.md#本地启动后端与-web)安装依赖；复制 `backend/.env.example` 为 `backend/.env`。生产至少设置 `APP_ENV=production`、随机 `SECRET_KEY`、明确的 `CORS_ORIGINS`，用 systemd 等管理 `uv run python -m app` 进程（工作目录为 `backend/`），并以 HTTPS 反向代理连接 `127.0.0.1:8000`。

默认 SQLite 位于 `backend/data/puzzles.db`；需要 PostgreSQL 时自行提供 `DATABASE_URL`。源码部署的 SQLite 应在停止进程后备份整个数据目录，同时备份 `.env`、引擎及部署配置。Compose 备份命令只适用于 Compose 的 PostgreSQL。

## 常见问题

| 现象 | 检查项 |
| --- | --- |
| 容器不健康 / 502 | `docker compose ps`、`docker compose logs --tail=100 backend database`；密钥、数据库连接、迁移与种子导入错误 |
| Web 正常但客户端连不上 | 当前服务器地址是否为实际 HTTPS `/api`、证书是否受信任、CORS 是否包含该端 Origin、后端是否支持连接检测协议；可从高级设置切换或恢复默认 |
| `/docs` 返回 404 | 生产模式的预期行为；健康检查使用 `/api/health` |
| 迁移后看不到旧数据 | 是否换了项目名、目录或数据库连接；不要急于删除卷 |
| 修改 LLM 环境变量未生效 | 管理后台数据库设置优先于环境变量 |
| 引擎无法启动 | 容器内路径、执行权限、Linux / CPU 兼容性和权重文件；不能填宿主机路径 |
