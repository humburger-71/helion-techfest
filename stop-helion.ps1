$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$metadataPath = Join-Path $projectRoot "data\helion-server.json"

if (-not (Test-Path -LiteralPath $metadataPath)) {
  Write-Host "No HELION server started by start-helion.cmd was found."
  exit 0
}

$metadata = Get-Content -Raw -LiteralPath $metadataPath | ConvertFrom-Json
$serverProcess = Get-Process -Id $metadata.pid -ErrorAction SilentlyContinue

if (-not $serverProcess) {
  Remove-Item -LiteralPath $metadataPath -Force
  Write-Host "HELION was already stopped."
  exit 0
}

$expectedStartTime = ([DateTime]$metadata.startTime).ToUniversalTime()
$actualStartTime = $serverProcess.StartTime.ToUniversalTime()
$sameExecutable = $serverProcess.Path -eq $metadata.nodePath
$sameStartTime = [Math]::Abs(($actualStartTime - $expectedStartTime).TotalSeconds) -lt 2

if (-not $sameExecutable -or -not $sameStartTime) {
  throw "The saved process no longer matches the HELION server. Nothing was stopped."
}

Stop-Process -Id $serverProcess.Id
Remove-Item -LiteralPath $metadataPath -Force
Write-Host "HELION server stopped." -ForegroundColor Green
