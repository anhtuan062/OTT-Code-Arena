[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\test',
    [string]$DockerContext = 'desktop-linux',
    [string]$CompilerImage = $(if ($env:BOT_CPP_COMPILER_IMAGE) { $env:BOT_CPP_COMPILER_IMAGE } else { 'docker.io/library/gcc@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15' }),
    [string]$RuntimeImage = $(if ($env:BOT_CPP_RUNTIME_IMAGE) { $env:BOT_CPP_RUNTIME_IMAGE } else { 'docker.io/library/debian@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587' }),
    [string]$TrustedRegistries = $(if ($env:BOT_TRUSTED_IMAGE_REGISTRIES) { $env:BOT_TRUSTED_IMAGE_REGISTRIES } else { 'docker.io,ghcr.io' }),
    [int]$MeasuredRuns = 0,
    [switch]$ResourceValidation
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($RepoRoot)
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$evidence = Join-Path $tempRoot ('ott-phase8.5f-' + [guid]::NewGuid().ToString('N'))
$realTournamentData = [IO.Path]::GetFullPath((Join-Path $root 'data\tournaments')).TrimEnd('\')
$resolvedEvidence = [IO.Path]::GetFullPath($evidence).TrimEnd('\')
if (-not $resolvedEvidence.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedEvidence.StartsWith($realTournamentData + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedEvidence -eq $realTournamentData) {
    throw 'Benchmark evidence must be under the OS temporary directory, never tournament storage.'
}
if ($MeasuredRuns -eq 0) { $MeasuredRuns = if ($ResourceValidation) { 20 } else { 5 } }
if ($ResourceValidation -and ($MeasuredRuns -lt 15 -or $MeasuredRuns -gt 20)) {
    throw 'Resource validation requires 15 to 20 measured runs per configuration.'
}
if (-not $ResourceValidation -and $MeasuredRuns -lt 5) {
    throw 'At least five measured runs are required per supported configuration.'
}

New-Item -ItemType Directory -Path $evidence -ErrorAction Stop | Out-Null
$helper = Join-Path $root 'scripts\phase8.5f-benchmark.mjs'
if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) { throw "Missing benchmark helper: $helper" }

try {
    Push-Location $root
    try {
        if (-not $PSBoundParameters.ContainsKey('CompilerImage') -and -not $env:BOT_CPP_COMPILER_IMAGE) {
            Write-Warning 'Using the pinned Phase 8.5A E2E compiler image; confirm it matches the deployed server image digest.'
        }
        if (-not $PSBoundParameters.ContainsKey('RuntimeImage') -and -not $env:BOT_CPP_RUNTIME_IMAGE) {
            Write-Warning 'Using the pinned Phase 8.5A E2E runtime image; confirm it matches the deployed server image digest.'
        }
        Write-Host 'Building the current production Docker argument builder...'
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed before benchmark preflight.' }
        Write-Host 'Checking Docker context, pinned images and Strategy SDK; benchmark evidence is isolated.'
        $benchmarkMode = if ($ResourceValidation) { 'resource-validation' } else { 'full' }
        & node.exe $helper $evidence $DockerContext $CompilerImage $RuntimeImage $TrustedRegistries ([string]$MeasuredRuns) $benchmarkMode
        if ($LASTEXITCODE -ne 0) { throw 'The benchmark helper reported a failure; inspect summary.json and samples.jsonl.' }
    } finally {
        Pop-Location
    }
    $summary = Get-Content -LiteralPath (Join-Path $evidence 'summary.json') -Raw | ConvertFrom-Json
    if ($summary.status -eq 'complete-with-failures') {
        Write-Host "BENCHMARK COMPLETE WITH FAILURES. Evidence: $evidence" -ForegroundColor Yellow
    } else {
        Write-Host "BENCHMARK COMPLETE. Evidence: $evidence" -ForegroundColor Green
    }
} catch {
    $safe = [ordered]@{ status = 'failed'; stage = 'powershell-wrapper'; message = [string]$_.Exception.Message }
    ($safe | ConvertTo-Json -Compress) | Set-Content -LiteralPath (Join-Path $evidence 'wrapper-failure.json') -Encoding UTF8
    Write-Host "BENCHMARK FAILED: $($safe.message)" -ForegroundColor Red
    Write-Host "Evidence preserved at: $evidence"
    throw
}
