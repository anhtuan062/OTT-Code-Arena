[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\test',
    [string]$DockerContext = 'desktop-linux',
    [string]$CompilerImage = $(if ($env:BOT_CPP_COMPILER_IMAGE) { $env:BOT_CPP_COMPILER_IMAGE } else { 'docker.io/library/gcc@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15' }),
    [string]$RuntimeImage = $(if ($env:BOT_CPP_RUNTIME_IMAGE) { $env:BOT_CPP_RUNTIME_IMAGE } else { 'docker.io/library/debian@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587' }),
    [string]$TrustedRegistries = $(if ($env:BOT_TRUSTED_IMAGE_REGISTRIES) { $env:BOT_TRUSTED_IMAGE_REGISTRIES } else { 'docker.io,ghcr.io' }),
    [ValidateRange(2, 5)][int]$MeasuredRuns = 3,
    [switch]$KeepEvidence
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($RepoRoot)
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$evidence = Join-Path $tempRoot ('ott-phase8.5g-' + [guid]::NewGuid().ToString('N'))
$realTournamentData = [IO.Path]::GetFullPath((Join-Path $root 'data\tournaments')).TrimEnd('\')
$resolvedEvidence = [IO.Path]::GetFullPath($evidence).TrimEnd('\')
if (-not $resolvedEvidence.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedEvidence.StartsWith($realTournamentData + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedEvidence -eq $realTournamentData) {
    throw 'Diagnostic evidence must be under the OS temporary directory, never tournament storage.'
}

New-Item -ItemType Directory -Path $evidence -ErrorAction Stop | Out-Null
$helper = Join-Path $root 'scripts\phase8.5g-diagnostics.mjs'
if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) { throw "Missing diagnostic helper: $helper" }

try {
    Push-Location $root
    try {
        Write-Host 'Building the current production Docker argument builder...'
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed before diagnostic preflight.' }
        Write-Host 'Running isolated Phase 8.5G Docker diagnostics...'
        & node.exe $helper $evidence $DockerContext $CompilerImage $RuntimeImage $TrustedRegistries ([string]$MeasuredRuns)
        if ($LASTEXITCODE -ne 0) { throw 'The diagnostic helper failed; inspect failure.json and samples.jsonl.' }
    } finally {
        Pop-Location
    }
    Write-Host "DIAGNOSTICS COMPLETE. Evidence: $evidence" -ForegroundColor Green
} catch {
    $safe = [ordered]@{ status = 'failed'; stage = 'powershell-wrapper'; message = [string]$_.Exception.Message }
    ($safe | ConvertTo-Json -Compress) | Set-Content -LiteralPath (Join-Path $evidence 'wrapper-failure.json') -Encoding UTF8
    Write-Host "DIAGNOSTICS FAILED: $($safe.message)" -ForegroundColor Red
    Write-Host "Evidence preserved at: $evidence"
    throw
}

