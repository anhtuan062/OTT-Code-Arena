@echo off
setlocal

cd /d "%~dp0"
title OTT Code Arena - Local Sandbox

echo [1/3] Checking Docker Desktop...
docker info >nul 2>&1
if errorlevel 1 (
    echo Docker Desktop is unavailable. Please start Docker Desktop and try again.
    pause
    exit /b 1
)

echo [2/3] Configuring sandbox execution...
set "NODE_ENV=production"
set "EXECUTION_POLICY=sandbox-required"
set "ENABLE_SOURCE_REVISION_EXECUTION=true"
set "BOT_CPP_COMPILE_TIMEOUT_MS=120000"
set "PORT=3000"
set "BOT_TRUSTED_IMAGE_REGISTRIES=docker.io,ghcr.io"
set "BOT_DOCKER_IMAGE=ghcr.io/anhtuan062/ott-phase6e-bot@sha256:78c1972c29f1385eacd32f715a24ec41013b5883fb5f8fe0f2c597358d3bf70d"
set "BOT_CPP_COMPILER_IMAGE=docker.io/library/gcc@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15"
set "BOT_CPP_RUNTIME_IMAGE=docker.io/library/debian@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587"
set "BOT_PYTHON3_RUNTIME_IMAGE=docker.io/library/python@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258"

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

endlocal
