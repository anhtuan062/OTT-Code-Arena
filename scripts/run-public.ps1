[CmdletBinding()]
param(
    [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    throw 'ngrok was not found. Install ngrok and add ngrok.exe to PATH.'
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker was not found. Install Docker Desktop first.'
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Engine is unavailable. Start Docker Desktop, wait until it says Running, then run this file again.'
}

$runtimeDir = Join-Path $repoRoot '.runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

$env:NODE_ENV = 'development'
$env:EXECUTION_POLICY = 'sandbox-required'
$env:ENABLE_SOURCE_REVISION_EXECUTION = 'true'
$env:BOT_CPP_COMPILATION_BACKEND = 'ephemeral-volume'
$env:BOT_CPP_COMPILE_TIMEOUT_MS = '120000'
$env:PORT = [string]$Port
$env:BOT_TRUSTED_IMAGE_REGISTRIES = 'docker.io,ghcr.io'
$env:BOT_DOCKER_IMAGE = 'ghcr.io/anhtuan062/ott-phase6e-bot@sha256:78c1972c29f1385eacd32f715a24ec41013b5883fb5f8fe0f2c597358d3bf70d'
$env:BOT_CPP_COMPILER_IMAGE = 'docker.io/library/gcc@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15'
$env:BOT_CPP_RUNTIME_IMAGE = 'docker.io/library/debian@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587'
$env:BOT_PYTHON3_RUNTIME_IMAGE = 'docker.io/library/python@sha256:2ed6491b93cd49272ee6de2b5a38440c3448360322c089fc23e370722d74179d'

Write-Host 'Building application...' -ForegroundColor Cyan
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

$stdoutLog = Join-Path $runtimeDir 'server.stdout.log'
$stderrLog = Join-Path $runtimeDir 'server.stderr.log'
$server = $null
try {
    Write-Host "Starting server on http://127.0.0.1:$Port ..." -ForegroundColor Cyan
    $server = Start-Process -FilePath 'node.exe' `
        -ArgumentList @('dist/server/index.js') `
        -WorkingDirectory $repoRoot `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -WindowStyle Hidden `
        -PassThru

    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Milliseconds 500
        if ($server.HasExited) {
            $errorText = if (Test-Path $stderrLog) { Get-Content -Raw $stderrLog } else { '' }
            throw "Server stopped during startup. $errorText"
        }
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { $ready = $true; break }
        } catch { }
    }
    if (-not $ready) { throw "Server was not ready after 30 seconds. Check $stderrLog" }

    Write-Host 'Server ready. Starting ngrok tunnel...' -ForegroundColor Green
    Write-Host 'Press Ctrl+C to stop ngrok and the server.' -ForegroundColor Yellow
    & ngrok http $Port
}
finally {
    if ($server -and -not $server.HasExited) {
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
}
