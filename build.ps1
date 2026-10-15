# 跑一次生产构建，用来在推送前确认没有报错
# --cleanDestinationDir：删掉源文件已经不存在的旧产物，避免残留
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
& (Join-Path $root '.tools\hugo.exe') --source $root --cacheDir (Join-Path $root '.hugo-cache') --gc --minify --cleanDestinationDir
Write-Host "  构建完成，产物在 public\ 目录" -ForegroundColor Green