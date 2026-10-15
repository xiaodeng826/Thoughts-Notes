# 停止本地预览服务
$p = Get-Process hugo -ErrorAction SilentlyContinue
if ($p) {
    $p | Stop-Process -Force
    Write-Host ""
    Write-Host "  已停止博客预览。" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "  当前没有正在运行的博客预览。" -ForegroundColor Yellow
    Write-Host ""
}