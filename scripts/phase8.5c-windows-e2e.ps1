[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\test',
    [string]$DockerContext = 'desktop-linux',
    [int]$TimeoutSeconds = 180,
    [switch]$KeepEvidence
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($RepoRoot)
$realData = [IO.Path]::GetFullPath((Join-Path $root 'data\tournaments')).TrimEnd('\')
$evidence = Join-Path $env:TEMP ("ott-phase8.5c-" + [guid]::NewGuid().ToString('N'))
$dataDir = Join-Path $evidence 'data'
$workDir = Join-Path $evidence 'work'
$logDir = Join-Path $evidence 'logs'
$server = $null
$serverOut = $null
$serverErr = $null
$serverPid = $null
$serverStartTime = $null
$failed = $false
$failureMessage = $null
$currentStage = 'initialization'
$owned = New-Object System.Collections.Generic.HashSet[int]

function Fail([string]$Message) { throw $Message }
function Assert-Isolated([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($full -eq $realData -or -not $full.StartsWith(([IO.Path]::GetFullPath($env:TEMP)).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        Fail "Refusing non-isolated data path: $full"
    }
}
function Get-Port {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    try { $listener.Start(); return ([Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}
function Invoke-DockerCommand {
    param([Parameter(Mandatory = $true)][string[]]$DockerArguments)
    if ($null -eq $DockerArguments -or $DockerArguments.Count -eq 0) {
        Fail 'Docker command arguments cannot be empty'
    }
    # Use the application name explicitly so a PowerShell function or alias
    # named Docker cannot intercept the preflight call.
    $output = & docker.exe @DockerArguments 2>&1
    if ($LASTEXITCODE -ne 0) { Fail "Docker command failed: $($output -join ' ')" }
    return ($output -join "`n")
}
function Write-JsonFile([string]$Path, [object]$Value) { $Value | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath $Path -Encoding UTF8 }
function Get-LogicalSnapshot([string]$DatabasePath, [string]$DataPath, [string]$Name) {
    Assert-Isolated $DataPath
    $backupPath = Join-Path $evidence "arena-$Name-backup.sqlite"
    $snapshotHelper = Join-Path $root 'scripts\phase8.5c-logical-snapshot.cjs'
    $nodePath = (Get-Command node.exe).Source
    $output = & $nodePath $snapshotHelper $root $DatabasePath $backupPath $DataPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        $message = ($output -join ' ')
        Fail "SQLite logical snapshot failed ($Name): $($message.Substring(0, [Math]::Min(600, $message.Length)))"
    }
    $snapshot = ($output -join "`n") | ConvertFrom-Json
    Write-JsonFile (Join-Path $evidence "logical-snapshot-$Name.json") $snapshot
    return $snapshot
}
function Add-PracticeEvidence([object]$Value) {
    ($Value | ConvertTo-Json -Depth 12 -Compress) | Add-Content -LiteralPath (Join-Path $logDir 'practice-results.jsonl') -Encoding UTF8
}
function Get-SafePracticeError([object]$Json) {
    if ($Json.valid -eq $true) { return $null }
    $code = [string]$Json.code
    if ($code -eq 'PROCESS_CRASHED') { return 'Bot/compiler process failed; raw executor output omitted.' }
    if ($code -in @('EXECUTOR_ERROR','EXECUTOR_UNAVAILABLE','SANDBOX_REQUIRED')) { return 'Docker sandbox infrastructure failure.' }
    if ($code -eq 'INVALID_MOVE') { return 'Returned move was rejected by engine legal-move validation.' }
    $message = [string]$Json.error
    if (-not $message) { return 'No JSON error message was available in the HTTP response.' }
    $message = $message -replace '(?i)[A-Z]:\\[^\s"'']+', '[host-path]'
    $message = $message -replace '/app/[^\s"'']+', '[container-path]'
    $message = $message -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]', ' '
    if ($message.Length -gt 320) { $message = $message.Substring(0, 320) }
    return $message
}
function Stage([string]$Name, [string]$State, [string]$Detail = '') {
    if ($State -ne 'failed') { $script:currentStage = $Name }
    $record = [ordered]@{ at=(Get-Date).ToUniversalTime().ToString('o'); stage=$Name; state=$State }
    if ($Detail) { $record.detail = $Detail }
    ($record | ConvertTo-Json -Compress) | Add-Content -LiteralPath (Join-Path $logDir 'run-status.jsonl') -Encoding UTF8
}
function New-Account([string]$Username, [string]$Password, [string]$Role, [string]$DbPath) {
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = (Get-Command node).Source
    $info.Arguments = '"' + (Join-Path $root 'dist\server\admin\role-bootstrap.js') + '" --db "' + $DbPath + '" --username ' + $Username + ' --role ' + $Role + ' --password-stdin'
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true; $info.RedirectStandardInput = $true; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $p = [Diagnostics.Process]::new(); $p.StartInfo = $info
    if (-not $p.Start()) { Fail "Could not bootstrap $Role" }
    [void]$owned.Add($p.Id)
    $bytes = [Text.Encoding]::UTF8.GetBytes($Password); $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length); $p.StandardInput.Close()
    $stdout = $p.StandardOutput.ReadToEnd(); $stderr = $p.StandardError.ReadToEnd()
    if (-not $p.WaitForExit(30000) -or $p.ExitCode -ne 0) { Fail "Could not bootstrap isolated $Role account ${Username}: $($stderr.Trim())" }
    $p.Dispose()
}
function Start-IsolatedServer([int]$Port, [string]$DataDir, [string]$WorkDir) {
    $id = [guid]::NewGuid().ToString('N')
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = (Get-Command node).Source; $info.Arguments = '"' + (Join-Path $root 'dist\server\index.js') + '"'; $info.WorkingDirectory = $root
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $envs = @{
        NODE_ENV='test'; EXECUTION_POLICY='sandbox-required'; ENABLE_SOURCE_REVISION_EXECUTION='true';
        TOURNAMENT_DATA_DIR=$DataDir; BOT_EXECUTION_WORKDIR=$WorkDir; PORT=[string]$Port; E2E_SERVER_ID=$id;
        DOCKER_CONTEXT=$DockerContext; BOT_TRUSTED_IMAGE_REGISTRIES='docker.io,ghcr.io';
        BOT_DOCKER_IMAGE='ghcr.io/anhtuan062/ott-phase6e-bot@sha256:78c1972c29f1385eacd32f715a24ec41013b5883fb5f8fe0f2c597358d3bf70d';
        BOT_CPP_COMPILER_IMAGE='docker.io/library/gcc@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15';
        BOT_CPP_RUNTIME_IMAGE='docker.io/library/debian@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587';
        BOT_PYTHON3_RUNTIME_IMAGE='docker.io/library/python@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258'
    }
    foreach ($entry in $envs.GetEnumerator()) { $info.EnvironmentVariables[$entry.Key] = [string]$entry.Value }
    $p = [Diagnostics.Process]::new(); $p.StartInfo = $info
    if (-not $p.Start()) { Fail 'Could not start isolated server' }
    $script:serverPid = $p.Id
    try { $script:serverStartTime = $p.StartTime.ToUniversalTime() } catch { Fail "Could not read isolated server start time (PID $($p.Id))." }
    [void]$owned.Add($p.Id)
    $script:serverOut = $p.StandardOutput.ReadLineAsync(); $script:serverErr = $p.StandardError.ReadLineAsync()
    $deadline = (Get-Date).AddSeconds(45); $ready = $false
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 250
        if ($p.HasExited) { Fail "Isolated server exited during startup (PID $($p.Id))." }
        foreach ($taskName in @('serverOut','serverErr')) {
            $task = Get-Variable -Scope Script -Name $taskName
            if ($task.Value -and $task.Value.IsCompleted -and $task.Value.Status -eq 'RanToCompletion') {
                $line = $task.Value.Result
                if ($taskName -eq 'serverOut' -and $line) {
                    Add-Content -LiteralPath (Join-Path $logDir 'server.stdout.log') -Value $line -Encoding UTF8
                    try {
                        $candidate = $line | ConvertFrom-Json
                        if ($candidate.type -eq 'e2e-server-ready' -and $candidate.id -eq $id -and [int]$candidate.pid -eq $p.Id -and [int]$candidate.port -eq $Port -and [IO.Path]::GetFullPath([string]$candidate.dataDir).TrimEnd('\') -eq [IO.Path]::GetFullPath($DataDir).TrimEnd('\')) { $ready = $true }
                    } catch { }
                } elseif ($taskName -eq 'serverErr' -and $line) { Add-Content -LiteralPath (Join-Path $logDir 'server.stderr.log') -Value $line -Encoding UTF8 }
                $next = if ($taskName -eq 'serverOut') { $p.StandardOutput.ReadLineAsync() } else { $p.StandardError.ReadLineAsync() }
                Set-Variable -Scope Script -Name $taskName -Value $next
            }
        }
        if ($ready) { $script:server = $p; return }
    }
    Fail 'Isolated server did not complete the authenticated identity handshake.'
}
function Invoke-Api([string]$BaseUrl, [Microsoft.PowerShell.Commands.WebRequestSession]$Session, [string]$Method, [string]$Path, [string]$Csrf, [object]$Body, [int[]]$Allowed = @(200,201,400,401,403,404,409,422,429,503)) {
    $headers = @{}; if ($Csrf) { $headers['x-csrf-token'] = $Csrf }
    $params = @{ Uri="$BaseUrl$Path"; Method=$Method; Headers=$headers; UseBasicParsing=$true; TimeoutSec=$TimeoutSeconds }
    if ($null -ne $Session) { $params.WebSession = $Session }
    if ($null -ne $Body) { $params.ContentType='application/json'; $params.Body=$Body | ConvertTo-Json -Depth 20 -Compress }
    $errorBody = ''
    try { $response = Invoke-WebRequest @params } catch {
        $webError = $_
        $response = $webError.Exception.Response
        if ($webError.ErrorDetails -and $webError.ErrorDetails.Message) {
            $errorBody = [string]$webError.ErrorDetails.Message
        }
    }
    if (-not $response) { Fail "No HTTP response from $Path" }
    $raw = $errorBody
    try {
        if ($response -is [Microsoft.PowerShell.Commands.BasicHtmlWebResponseObject] -and $null -ne $response.Content) {
            $raw = [string]$response.Content
        } elseif ($response -is [System.Net.HttpWebResponse]) {
            $stream = $response.GetResponseStream()
            if ($stream) {
                $reader = New-Object IO.StreamReader($stream)
                try { $streamBody = $reader.ReadToEnd(); if ($streamBody) { $raw = $streamBody } } finally { $reader.Dispose() }
            }
        } elseif ($response.PSObject.Methods['GetResponseStream']) {
            $stream = $response.GetResponseStream()
            $reader = New-Object IO.StreamReader($stream)
            try { $streamBody = $reader.ReadToEnd(); if ($streamBody) { $raw = $streamBody } } finally { $reader.Dispose() }
        }
    } catch { if (-not $raw) { $raw = $errorBody } }
    $bounded = if ($raw.Length -gt 2400) { $raw.Substring(0, 2400) } else { $raw }
    $json = $null; if ($raw) { try { $json = $raw | ConvertFrom-Json } catch {} }
    if ($Allowed -notcontains [int]$response.StatusCode) {
        $detail = if ($bounded) { ": $bounded" } else { '' }
        Fail "$Method $Path returned HTTP $($response.StatusCode)$detail"
    }
    return [pscustomobject]@{ Status=[int]$response.StatusCode; Json=$json; Raw=$raw }
}
function Login([string]$BaseUrl, [string]$Username, [string]$Password) {
    $s = [Microsoft.PowerShell.Commands.WebRequestSession]::new(); $login = Invoke-Api $BaseUrl $s 'Post' '/api/auth/login' '' @{ username=$Username; password=$Password } @(200)
    $me = Invoke-Api $BaseUrl $s 'Get' '/api/auth/me' '' $null @(200)
    return [pscustomobject]@{ Session=$s; Csrf=[string]$me.Json.csrfToken; User=$me.Json.user }
}
function Copy-CookieOnlySession([Microsoft.PowerShell.Commands.WebRequestSession]$Source, [string]$BaseUrl) {
    # Invoke-WebRequest may retain request headers on its WebRequestSession.
    # Copy only the authenticated cookie so a CSRF-negative request cannot
    # inherit an earlier x-csrf-token header.
    $copy = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
    $uri = [Uri]$BaseUrl
    foreach ($cookie in $Source.Cookies.GetCookies($uri)) { $copy.Cookies.Add($uri, $cookie) }
    return $copy
}
function Stop-Owned {
    if ($script:server -and $script:serverPid) {
        try {
            $current = Get-Process -Id $script:serverPid -ErrorAction Stop
            $sameStart = $false
            try { $sameStart = [Math]::Abs(($current.StartTime.ToUniversalTime() - $script:serverStartTime).TotalSeconds) -lt 2 } catch {}
            if ($sameStart -and -not $current.HasExited) {
                $current.Kill(); [void]$current.WaitForExit(10000)
            }
        } catch {}
    }
    # Bootstrap processes are expected to exit. If one remains, only stop a
    # still-running node process with a PID created by this run.
    foreach ($id in $owned) {
        if ($id -eq $script:serverPid) { continue }
        try {
            $p = Get-Process -Id $id -ErrorAction Stop
            if (-not $p.HasExited -and $p.ProcessName -eq 'node') { $p.Kill(); [void]$p.WaitForExit(5000) }
        } catch {}
    }
}

try {
    Assert-Isolated $evidence; New-Item -ItemType Directory -Path $dataDir,$workDir,$logDir -Force | Out-Null
    New-Item -ItemType File -Path (Join-Path $logDir 'server.stdout.log'),(Join-Path $logDir 'server.stderr.log'),(Join-Path $logDir 'run-status.jsonl'),(Join-Path $logDir 'practice-results.jsonl') -Force | Out-Null
    $status = Join-Path $evidence 'result.json'
    Stage 'harness' 'started'
    Stage 'docker-preflight' 'started'
    Write-Host 'Checking Docker Desktop and immutable runtime images...'
    Invoke-DockerCommand -DockerArguments @('--context',$DockerContext,'version','--format','{{.Server.Version}}') | Out-Host
    foreach ($image in @('docker.io/library/gcc@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15','docker.io/library/debian@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587','docker.io/library/python@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258')) { Invoke-DockerCommand -DockerArguments @('--context',$DockerContext,'image','inspect',$image) | Out-Null }
    Stage 'docker-preflight' 'completed'
    Stage 'build' 'started'
    & npm.cmd run build; if ($LASTEXITCODE -ne 0) { Fail 'Build failed' }
    Stage 'build' 'completed'
    Stage 'rate-limit-contract' 'started'
    # Prove per-Competitor accounting through real HTTP routes with a
    # controlled executor. Recompiling a Bot twenty times tests Docker latency,
    # not the limiter threshold, and adds avoidable acceptance failures.
    Push-Location $root
    try {
        & npx.cmd vitest run tests/server/practice-api.test.ts --pool=forks --maxWorkers=1 --minWorkers=1 --testTimeout=15000 --hookTimeout=15000 --reporter=json --outputFile (Join-Path $evidence 'practice-api-tests.json')
        if ($LASTEXITCODE -ne 0) { Fail 'Isolated Practice API/rate-limit regression tests failed; see practice-api-tests.json' }
    } finally { Pop-Location }
    Stage 'rate-limit-contract' 'completed' 'Controlled executor; HTTP threshold, reset, failure accounting and concurrency verified separately from real Docker scenarios.'
    $suffix = [guid]::NewGuid().ToString('N'); $password = "E2C5c$($suffix.Substring(0,18))Pass9"
    $db = Join-Path $dataDir 'arena.sqlite'; New-Account "e5org$($suffix.Substring(0,10))" $password 'organizer' $db; New-Account "e5ca$($suffix.Substring(0,10))" $password 'competitor' $db; New-Account "e5cb$($suffix.Substring(0,10))" $password 'competitor' $db
    Stage 'server-start' 'started'
    $port = Get-Port; Start-IsolatedServer $port $dataDir $workDir; $base = "http://127.0.0.1:$port"
    Stage 'server-start' 'completed' "pid=$serverPid port=$port"
    $org = Login $base "e5org$($suffix.Substring(0,10))" $password
    if ($org.User.role -ne 'organizer') { Fail 'Isolated organizer login did not return organizer role' }
    $a = Login $base "e5ca$($suffix.Substring(0,10))" $password; $b = Login $base "e5cb$($suffix.Substring(0,10))" $password
    if ($a.User.role -ne 'competitor' -or $b.User.role -ne 'competitor') { Fail 'Isolated competitor login did not return competitor roles' }
    $botA = (Invoke-Api $base $a.Session 'Post' '/api/bots' $a.Csrf @{ name='Practice C++'; command='node'; args=@() } @(201)).Json
    $botB = (Invoke-Api $base $b.Session 'Post' '/api/bots' $b.Csrf @{ name='Practice Python'; command='node'; args=@() } @(201)).Json
    $cpp = @'
#include "ott_strategy_sdk.hpp"
#include <vector>
using namespace ott;
Move chooseMove(const GameState& state, const std::vector<Move>& legalMoves) {
    (void)state;
    return legalMoves.front();
}
'@
    $python = @'
from ott_strategy_sdk import Move, GameState

def choose_move(state: GameState, legal_moves: list[Move]) -> Move:
    return legal_moves[0]
'@
    $revA = (Invoke-Api $base $a.Session 'Post' "/api/bots/$($botA.id)/revisions" $a.Csrf @{ runtimeId='cpp'; executionMode='strategy'; source=$cpp } @(201)).Json
    $revB = (Invoke-Api $base $b.Session 'Post' "/api/bots/$($botB.id)/revisions" $b.Csrf @{ runtimeId='python3'; executionMode='strategy'; source=$python } @(201)).Json
    foreach ($rev in @($revA,$revB)) { if ($rev.executionMode -ne 'strategy' -or $rev.sdkDigest -notmatch '^[a-f0-9]{64}$') { Fail 'Revision SDK pinning missing' } }
    Stage 'practice' 'started'
    Stage 'practice-anonymous' 'started'
    $anon = Invoke-Api $base $null 'Post' "/api/bots/$($botA.id)/revisions/$($revA.revisionId)/test" '' @{ scenarioId='initial' } @(401); if ($anon.Status -ne 401) { Fail 'Anonymous practice access was accepted' }
    Stage 'practice-anonymous' 'completed'
    Stage 'practice-csrf' 'started'
    $csrfNegativeSession = Copy-CookieOnlySession $a.Session $base
    $csrfMissing = Invoke-Api $base $csrfNegativeSession 'Post' "/api/bots/$($botA.id)/revisions/$($revA.revisionId)/test" '' @{ scenarioId='initial' } @(403); if ($csrfMissing.Status -ne 403) { Fail 'Practice request without CSRF was accepted' }
    Stage 'practice-csrf' 'completed'
    Stage 'practice-cross-user' 'started'
    $cross = Invoke-Api $base $a.Session 'Post' "/api/bots/$($botB.id)/revisions/$($revB.revisionId)/test" $a.Csrf @{ scenarioId='initial' } @(404); if ($cross.Status -ne 404) { Fail 'Cross-user practice access was accepted' }
    Stage 'practice-cross-user' 'completed'
    Stage 'practice-invalid-scenario' 'started'
    $invalid = Invoke-Api $base $a.Session 'Post' "/api/bots/$($botA.id)/revisions/$($revA.revisionId)/test" $a.Csrf @{ scenarioId='forged' } @(400); if ($invalid.Status -ne 400) { Fail 'Invalid scenario was accepted' }
    Stage 'practice-invalid-scenario' 'completed'
    Stage 'data-integrity-before' 'started'
    $beforeSnapshot = Get-LogicalSnapshot $db $dataDir 'before'
    Stage 'data-integrity-before' 'completed' $beforeSnapshot.sha256
    $requestNumber = 0
    foreach ($case in @(@{ session=$a; bot=$botA; rev=$revA; runtime='cpp' }, @{ session=$b; bot=$botB; rev=$revB; runtime='python3' })) {
        foreach ($scenario in @('initial','capture','near-goal')) {
            Stage "practice-$($case.runtime)-$scenario" 'started'
            $requestNumber++
            $requestClock = [Diagnostics.Stopwatch]::StartNew()
            $run = Invoke-Api $base $case.session.Session 'Post' "/api/bots/$($case.bot.id)/revisions/$($case.rev.revisionId)/test" $case.session.Csrf @{ scenarioId=$scenario } @(200,422,500,503)
            $requestClock.Stop()
            $selected = $run.Json.move
            $matches = @()
            if ($selected) {
                $matches = @($run.Json.legalMoves | Where-Object {
                    [string]$_.pieceId -ceq [string]$selected.piece_id -and
                    [string]$_.from -ceq [string]$selected.from -and
                    [string]$_.to -ceq [string]$selected.to
                })
            }
            $isLegal = $matches.Count -eq 1
            $diag = $run.Json.diagnostic
            $record = [ordered]@{
                scenarioId=$scenario
                runtime=$case.runtime
                executionMode='strategy'
                httpStatus=$run.Status
                requestNumber=$requestNumber
                requestDurationMs=$requestClock.ElapsedMilliseconds
                timings=$run.Json.timings
                practiceStatus=$run.Json.status
                code=$run.Json.code
                errorCategory=if ($run.Json.code) { [string]$run.Json.code } elseif ($run.Status -eq 422) { 'PRACTICE_REJECTED' } elseif ($run.Status -ge 500) { 'SERVER_OR_EXECUTOR_FAILURE' } else { $null }
                errorMessage=Get-SafePracticeError $run.Json
                failureStage=$diag.stage
                exitCode=$diag.exitCode
                outputProduced=$diag.outputProduced
                engineAcceptedMove=[bool]$run.Json.accepted
                valid=$run.Json.valid
                accepted=$run.Json.accepted
                selectedMove=if ($selected) { [ordered]@{ piece_id=[string]$selected.piece_id; from=[string]$selected.from; to=[string]$selected.to } } else { $null }
                engineLegalMatch=$isLegal
                comparison=if ($isLegal) { 'Selected move matches legalMoves using move.piece_id to candidate.pieceId and identical algebraic from/to.' } elseif (-not $selected) { 'No successful move was returned; bounded error envelope recorded before assertion.' } else { 'Returned move did not match any engine legal-move entry.' }
            }
            Add-PracticeEvidence $record
            if ($run.Status -ne 200 -or -not $run.Json.valid -or -not $run.Json.accepted -or $run.Json.runtimeId -ne $case.runtime -or $run.Json.state.boardSize -ne 9) {
                Fail "Practice failed for $($case.runtime)/$scenario (HTTP $($run.Status), code=$($run.Json.code), stage=$($diag.stage)): $(Get-SafePracticeError $run.Json)"
            }
            if (-not $isLegal) { Fail "Returned move was not engine-legal for $($case.runtime)/$scenario (move and comparison saved to practice-results.jsonl)" }
            if (-not $run.Json.timings -or $run.Json.timings.cleanupSucceeded -ne $true) { Fail "Practice cleanup was not verified for $($case.runtime)/$scenario; see practice-results.jsonl" }
            Stage "practice-$($case.runtime)-$scenario" 'completed'
        }
    }
    Stage 'data-integrity-after' 'started'
    $afterSnapshot = Get-LogicalSnapshot $db $dataDir 'after'
    Stage 'data-integrity-after' 'completed' $afterSnapshot.sha256
    if ($beforeSnapshot.sha256 -cne $afterSnapshot.sha256) { Fail 'Practice changed protected logical records or isolated tournament/revision artifacts; compare logical-snapshot-before.json and logical-snapshot-after.json' }
    Stage 'practice' 'completed'
    $summary = [ordered]@{ status='passed'; cplusplus=$revA.revisionId; python3=$revB.revisionId; scenarios=@('initial','capture','near-goal'); rateLimitVerification='isolated HTTP tests with controlled executor (practice-api-tests.json)'; logicalDataUnchanged=$true; snapshotDigest=$afterSnapshot.sha256; evidence=$evidence }
    Write-JsonFile $status $summary; Write-Host "PASS: C++17/Python 3 practice Docker E2E completed. Evidence: $evidence" -ForegroundColor Green
} catch {
    $failed = $true
    $failureMessage = $_.Exception.Message
    $failureStage = $currentStage
    $errorRecord = $_
    $location = if ($errorRecord.InvocationInfo) {
        [ordered]@{
            script = $errorRecord.InvocationInfo.ScriptName
            line = $errorRecord.InvocationInfo.ScriptLineNumber
            column = $errorRecord.InvocationInfo.OffsetInLine
            position = $errorRecord.InvocationInfo.PositionMessage
        }
    } else { $null }
    $stack = [string]$errorRecord.ScriptStackTrace
    try {
        $failureRecord = [ordered]@{ at=(Get-Date).ToUniversalTime().ToString('o'); stage=$failureStage; state='failed'; detail=$failureMessage }
        ($failureRecord | ConvertTo-Json -Compress) | Add-Content -LiteralPath (Join-Path $logDir 'run-status.jsonl') -Encoding UTF8
    } catch {}
    $summary = [ordered]@{
        status='failed'
        error=$failureMessage
        stage=$failureStage
        location=$location
        stackTrace=if ($stack.Length -gt 4000) { $stack.Substring(0, 4000) } else { $stack }
        evidence=$evidence
    }
    Write-JsonFile (Join-Path $evidence 'result.json') $summary
    Write-Host "PRACTICE E2E FAILED: $failureMessage" -ForegroundColor Red
    if ($location) { Write-Host "Failure location: $($location.script):$($location.line):$($location.column)" -ForegroundColor Red }
    if ($stack) { Write-Host "Failure stack: $stack" -ForegroundColor DarkRed }
    Write-Host "Failure stage: $failureStage" -ForegroundColor Red
    Write-Host "Evidence preserved at: $evidence"
    $global:LASTEXITCODE = 1
} finally {
    Stop-Owned
    if (-not $KeepEvidence -and (Test-Path -LiteralPath $evidence) -and (Test-Path -LiteralPath (Join-Path $evidence 'result.json'))) {
        try { $result = Get-Content (Join-Path $evidence 'result.json') -Raw | ConvertFrom-Json; if ($result.status -eq 'passed') { Remove-Item -LiteralPath $evidence -Recurse -Force } } catch {}
    }
}
if ($failed) { throw "Phase 8.5C E2E FAILED: $failureMessage" }
