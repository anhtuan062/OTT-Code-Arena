[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\test',
    [string]$DockerContext = 'desktop-linux',
    [string]$CompilerImage = $(if ($env:BOT_CPP_COMPILER_IMAGE) { $env:BOT_CPP_COMPILER_IMAGE } else { 'docker.io/library/gcc@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15' }),
    [string]$RuntimeImage = $(if ($env:BOT_CPP_RUNTIME_IMAGE) { $env:BOT_CPP_RUNTIME_IMAGE } else { 'docker.io/library/debian@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587' }),
    [string]$TrustedRegistries = 'docker.io,ghcr.io',
    [switch]$KeepEvidence
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($RepoRoot)
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$evidence = Join-Path $tempRoot ('ott-phase8.5h-' + [guid]::NewGuid().ToString('N'))
$realData = [IO.Path]::GetFullPath((Join-Path $root 'data\tournaments')).TrimEnd('\')
$resolvedEvidence = [IO.Path]::GetFullPath($evidence).TrimEnd('\')
if (-not $resolvedEvidence.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedEvidence -eq $realData -or $resolvedEvidence.StartsWith($realData + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Phase 8.5H evidence must use a new OS temporary directory.'
}

New-Item -ItemType Directory -Path $evidence -ErrorAction Stop | Out-Null
$helper = Join-Path $root 'scripts\phase8.5h-e2e.mjs'
try {
    Push-Location $root
    try {
        Write-Host 'Checking Docker Desktop Linux engine and immutable images...'
        $version = & docker.exe --context $DockerContext version --format '{{.Server.Version}}' 2>&1
        if ($LASTEXITCODE -ne 0) { throw "Docker daemon unavailable: $($version -join ' ')" }
        $os = & docker.exe --context $DockerContext info --format '{{.OSType}}|{{.Architecture}}' 2>&1
        if ($LASTEXITCODE -ne 0 -or -not (($os -join '') -match '^linux\|')) { throw 'A Linux Docker engine is required.' }
        foreach ($image in @($CompilerImage, $RuntimeImage, 'docker.io/library/python@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258')) {
            & docker.exe --context $DockerContext image inspect $image *> $null
            if ($LASTEXITCODE -ne 0) { throw "Pinned image is unavailable: $image" }
        }
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed.' }
        $previousContext = $env:DOCKER_CONTEXT
        try {
            $env:DOCKER_CONTEXT = $DockerContext
            & node.exe $helper $evidence $DockerContext $CompilerImage $RuntimeImage $TrustedRegistries
            if ($LASTEXITCODE -ne 0) { throw 'Phase 8.5H Docker helper failed.' }
        } finally {
            $env:DOCKER_CONTEXT = $previousContext
        }
    } finally { Pop-Location }
    Write-Host "PHASE 8.5H PASS. Evidence: $evidence" -ForegroundColor Green
    if (-not $KeepEvidence) { Write-Host 'Evidence retained for acceptance review; remove it manually when no longer needed.' }
} catch {
    [ordered]@{ status='failed'; message=[string]$_.Exception.Message } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'wrapper-failure.json') -Encoding UTF8
    Write-Host "PHASE 8.5H FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Evidence preserved at: $evidence"
    throw
}
