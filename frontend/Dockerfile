# IMAGE_REGISTRY / NPM_REGISTRY 经 docker-compose.yml 的 build.args 注入，缺省走国内加速源
ARG IMAGE_REGISTRY=docker.m.daocloud.io
FROM ${IMAGE_REGISTRY}/library/node:22-alpine AS builder

ARG NPM_REGISTRY=https://registry.npmmirror.com

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --registry=${NPM_REGISTRY}

COPY . .
ARG VITE_API_BASE_URL=/api
RUN VITE_API_BASE_URL="$VITE_API_BASE_URL" npm run build

FROM ${IMAGE_REGISTRY}/library/nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
