# 停止本地服务：管理后台（1414 端口）+ Hugo 预览（1313）
$ErrorActionPreference = 'SilentlyContinue'
$stopped = @()

# 1) 管理后台：按端口找到占用进程
$conn = Get-NetTCPConnection -LocalPort 1414 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $conn | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        $stopped += '管理后台'
    }
}

# 2) Hugo 预览
$hugo = Get-Process hugo -ErrorAction SilentlyContinue
if ($hugo) {
    $hugo | Stop-Process -Force -ErrorAction SilentlyContinue
    $stopped += '博客预览'
}

Write-Host ""
if ($stopped.Count -gt 0) {
    Write-Host ("  已停止：" + (($stopped | Select-Object -Unique) -join "、")) -ForegroundColor Green
} else {
    Write-Host "  当前没有正在运行的服务。" -ForegroundColor Yellow
}
Write-Host ""