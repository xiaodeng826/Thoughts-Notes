<#
  新建一篇文章（命令行方式；图形界面请用「管理博客.bat」）
  用法：
    .\new-post.ps1 "我的第一篇笔记"
    .\new-post.ps1 "读《人类简史》" -Section reading
    .\new-post.ps1 "Hugo 笔记" -Section tech -Slug hugo-note
#>
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Title,
    [string]$Section = 'essay',
    [string]$Slug = ''
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$hugo = Join-Path $root '.tools\hugo.exe'

if (-not (Test-Path $hugo)) {
    Write-Host "  没找到 Hugo： $hugo" -ForegroundColor Red
    exit 1
}

$secDir = Join-Path $root "content\$Section"
if (-not (Test-Path (Join-Path $secDir '_index.md'))) {
    Write-Host ""
    Write-Host "  板块「$Section」不存在。现有板块：" -ForegroundColor Yellow
    Get-ChildItem (Join-Path $root 'content') -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName '_index.md') } |
        ForEach-Object { Write-Host "    - $($_.Name)" }
    Write-Host ""
    exit 1
}

if ([string]::IsNullOrWhiteSpace($Slug)) { $Slug = $Title.Trim() -replace '\s+', '-' }
$Slug = $Slug -replace '[\\/:*?"<>|]', ''

& $hugo new content "$Section/$Slug/index.md" --source $root --cacheDir (Join-Path $root '.hugo-cache')

$created = Join-Path $secDir "$Slug\index.md"
if (Test-Path $created) {
    Write-Host ""
    Write-Host "  已创建 content\$Section\$Slug\index.md" -ForegroundColor Green
    Write-Host "  默认是草稿（draft: true），写完改成 false 才会发布。" -ForegroundColor Yellow
    Write-Host "  配图直接放进这个文件夹，正文里写 ![](图片文件名)" -ForegroundColor DarkGray
    Write-Host ""
} else {
    Write-Host "  创建失败，看看上面的 Hugo 输出。" -ForegroundColor Red
}