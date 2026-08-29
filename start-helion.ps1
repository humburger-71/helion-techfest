$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverUrl = "http://127.0.0.1:3000"
$healthUrl = "$serverUrl/api/health"
$metadataPath = Join-Path $projectRoot "data\helion-server.json"

function Test-HelionServer {
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    return $health.status -eq "ok" -and $health.application -eq "HELION"
  } catch {
    return $false
  }
}

if (Test-HelionServer) {
  Write-Host "HELION is already running at $serverUrl" -ForegroundColor Green
  if ($env:HELION_NO_BROWSER -ne "1") { Start-Process $serverUrl }
  exit 0
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
  $nodePath = $nodeCommand.Source
} else {
  $nodePath = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
}

if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Node.js 22.5 or newer is required. Install Node.js, then run start-helion.cmd again."
}

$serverPath = Join-Path $projectRoot "server.js"
$serverProcess = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverPath + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru

$metadataDirectory = Split-Path -Parent $metadataPath
New-Item -ItemType Directory -Path $metadataDirectory -Force | Out-Null
[pscustomobject]@{
  pid = $serverProcess.Id
  nodePath = $nodePath
  startTime = $serverProcess.StartTime.ToUniversalTime().ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding UTF8

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
  if (Test-HelionServer) {
    $ready = $true
    break
  }
  Start-Sleep -Milliseconds 150
}

if (-not $ready) {
  Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
  throw "HELION could not start. Check whether another application is using port 3000."
}

Write-Host "HELION is running at $serverUrl" -ForegroundColor Green
Write-Host "Use stop-helion.cmd when you want to stop the local server."
if ($env:HELION_NO_BROWSER -ne "1") { Start-Process $serverUrl }
