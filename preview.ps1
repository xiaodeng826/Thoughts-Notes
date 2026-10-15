# ============================================================
#  本地预览  ·  用法：  .\preview.ps1
#  自动打开浏览器（http://localhost:1313），改文件即时刷新
#  已带 -D 参数，所以 draft: true 的草稿也能看到
# ============================================================
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$hugo = Join-Path $root '.tools\hugo.exe'

if (-not (Test-Path $hugo)) {
    Write-Host ""
    Write-Host "  没找到 Hugo 程序： $hugo" -ForegroundColor Red
    Write-Host "  修复方法：" -ForegroundColor Yellow
    Write-Host "    1. 打开 https://github.com/gohugoio/hugo/releases/tag/v0.167.0"
    Write-Host "    2. 下载 hugo_extended_0.167.0_windows-amd64.zip"
    Write-Host "    3. 解压出 hugo.exe，放进本项目的 .tools\ 目录"
    Write-Host ""
    exit 1
}

Write-Host "  预览地址 http://localhost:1313/   按 Ctrl+C 停止" -ForegroundColor Green
& $hugo server --source $root --cacheDir (Join-Path $root '.hugo-cache') --baseURL "http://localhost:1313/" -D --navigateToChanged --openBrowser --port 1313
