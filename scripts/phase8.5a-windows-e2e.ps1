[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\test',
    [string]$DockerContext = 'desktop-linux',
    [int]$Port = 0,
    [int]$TimeoutSeconds = 600,
    [switch]$KeepEvidence,
    [switch]$LifecycleSelfTest
)

$ErrorActionPreference = 'Stop'
$base = Join-Path ([IO.Path]::GetFullPath($RepoRoot)) 'scripts\phase8e2c-windows-e2e.ps1'
if (-not (Test-Path -LiteralPath $base -PathType Leaf)) {
    throw "Missing compatible base harness: $base"
}

$migrationRoot = Join-Path $env:TEMP ("ott-phase8.5a-migration-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $migrationRoot -Force | Out-Null
$migrationScript = Join-Path ([IO.Path]::GetFullPath($RepoRoot)) 'scripts\phase8.5a-migration-check.mjs'
& node $migrationScript $migrationRoot
if ($LASTEXITCODE -ne 0) { throw "Strategy SDK migration check failed. Evidence: $migrationRoot" }
Write-Host "PASS: schema v4 isolated migration check. Evidence: $migrationRoot" -ForegroundColor Green

$arguments = @{
    RepoRoot = $RepoRoot
    DockerContext = $DockerContext
    Port = $Port
    TimeoutSeconds = $TimeoutSeconds
    KeepEvidence = $KeepEvidence
    LifecycleSelfTest = $LifecycleSelfTest
    StrategySdk = $true
}

& $base @arguments
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Strategy SDK E2E exited with code $LASTEXITCODE" }
