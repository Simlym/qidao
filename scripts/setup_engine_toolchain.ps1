# 在项目临时目录准备固定版本的便携编译工具，不修改系统 PATH。
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskBuild = Join-Path $taskRoot '.engine-build'
$config = Get-Content (Join-Path $taskRoot 'docs/engines/source-builds.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Path $taskBuild -Force | Out-Null
$taskArchive = Join-Path $taskBuild 'w64devkit-x64-2.11.0.7z.exe'
if (!(Test-Path -LiteralPath $taskArchive) -or (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLower() -ne $config.toolchain.sha256) {
    $taskPartial = "$taskArchive.partial"
    & curl.exe --noproxy '*' --fail --location --silent --show-error $config.toolchain.url --output $taskPartial
    if ($LASTEXITCODE -ne 0) { throw '编译工具下载失败' }
    if ((Get-FileHash -LiteralPath $taskPartial -Algorithm SHA256).Hash.ToLower() -ne $config.toolchain.sha256) { throw '编译工具 SHA-256 不符' }
    Move-Item -LiteralPath $taskPartial -Destination $taskArchive -Force
}
$taskProcess = Start-Process -FilePath $taskArchive -ArgumentList @('-y', "-o`"$taskBuild`"") -WindowStyle Hidden -Wait -PassThru
if ($taskProcess.ExitCode -ne 0) { throw '编译工具解压失败' }
& (Join-Path $taskBuild 'w64devkit/bin/g++.exe') --version
if ($LASTEXITCODE -ne 0) { throw '编译器不可用' }
