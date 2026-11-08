#!/bin/sh
# Docker 用户管理快捷入口，参数原样交给后端管理命令。
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ "$#" -eq 0 ]; then
    set -- --help
fi

exec docker compose --project-directory "$project_root" -f "$project_root/docker-compose.yml" \
    exec backend python -m app.modules.auth.manage "$@"
