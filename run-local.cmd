@echo off
setlocal

cd /d "%~dp0"
title OTT Code Arena - Local Sandbox

echo [1/3] Checking Docker Desktop...
echo Stopping any existing local server on port 3000...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ids = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }"
if errorlevel 1 (
    echo Warning: could not fully stop the previous local server.
)
where docker >nul 2>&1
if errorlevel 1 (
    echo Docker CLI was not found in PATH.
    echo Please restart the terminal after installing Docker Desktop.
    pause
    exit /b 1
)
docker info
if errorlevel 1 (
    echo Docker CLI is installed, but it cannot connect to the Docker daemon.
    echo Check Docker Desktop status, the active Docker context, and Docker Desktop logs.
    pause
    exit /b 1
)

echo [2/3] Configuring sandbox execution...
set "NODE_ENV=production"
set "EXECUTION_POLICY=sandbox-required"
set "ENABLE_SOURCE_REVISION_EXECUTION=true"
set "ENABLE_MULTI_STAGE=true"
set "OTT_ENABLE_SERIES_SCHEDULER=true"
set "OTT_SERIES_MATCH_CONCURRENCY=2"
set "OTT_ENABLE_SERIES_CONCURRENCY_2=true"
set "OTT_DOCKER_EXECUTION_CONCURRENCY=1"
set "BOT_CPP_COMPILATION_BACKEND=ephemeral-volume"
set "BOT_CPP_EPHEMERAL_ARTIFACT_CACHE=true"
set "BOT_COMPILED_ARTIFACT_CACHE_DIR=%CD%\.runtime\compiled-artifacts"
set "BOT_COMPILED_ARTIFACT_CACHE_MAX_BYTES=536870912"
set "BOT_COMPILED_ARTIFACT_CACHE_MAX_ENTRIES=128"
set "BOT_CPP_COMPILE_TIMEOUT_MS=120000"
set "PORT=3000"
set "BOT_TRUSTED_IMAGE_REGISTRIES=docker.io,ghcr.io"
set "BOT_DOCKER_IMAGE=ghcr.io/anhtuan062/ott-phase6e-bot@sha256:78c1972c29f1385eacd32f715a24ec41013b5883fb5f8fe0f2c597358d3bf70d"
set "BOT_CPP_COMPILER_IMAGE=docker.io/library/gcc@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15"
set "BOT_CPP_RUNTIME_IMAGE=docker.io/library/debian@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587"
set "BOT_PYTHON3_RUNTIME_IMAGE=docker.io/library/python@sha256:2ed6491b93cd49272ee6de2b5a38440c3448360322c089fc23e370722d74179d"

echo [3/3] Building application...
call npm.cmd run build
if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
)

echo.
echo Server is starting at http://localhost:3000
echo Keep this window open while using the application.
echo Press Ctrl+C to stop the server.
echo.
call npm.cmd start
set "SERVER_EXIT=%ERRORLEVEL%"
echo.
echo Server process exited with code %SERVER_EXIT%.
echo Review the error above before closing this window.
pause
exit /b %SERVER_EXIT%

endlocal
