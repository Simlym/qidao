# IMAGE_REGISTRY 经 docker-compose.yml 的 build.args 注入，缺省走国内加速源
ARG IMAGE_REGISTRY=docker.m.daocloud.io
FROM ${IMAGE_REGISTRY}/library/rust:1.88-slim-bookworm AS engine-installer
WORKDIR /build
COPY src-tauri/engine-installer ./src-tauri/engine-installer
COPY docs/engines ./docs/engines
RUN cargo build --release --locked --manifest-path src-tauri/engine-installer/Cargo.toml --bin qidao-engine-installer

FROM ${IMAGE_REGISTRY}/library/python:3.12-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/

WORKDIR /app

# Linux 原生揭棋程序依赖 C++ 运行库，精简 Python 镜像需显式安装。
RUN apt-get update \
    && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -i ${PIP_INDEX_URL} -r requirements.txt

COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY backend/app ./app
COPY backend/seeds ./seeds
COPY --from=engine-installer /build/src-tauri/engine-installer/target/release/qidao-engine-installer /usr/local/bin/

RUN mkdir -p /app/data/engines

EXPOSE 8000

CMD ["python", "-m", "app"]
