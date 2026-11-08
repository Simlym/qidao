# Docker 用户管理快捷入口，参数原样交给后端管理命令。
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$manageArguments = @($args)
if ($manageArguments.Count -eq 0) {
    $manageArguments = @('--help')
}

& docker compose --project-directory $projectRoot -f (Join-Path $projectRoot 'docker-compose.yml') exec backend python -m app.modules.auth.manage @manageArguments
exit $LASTEXITCODE
