[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\test',
    [string]$DockerContext = 'desktop-linux',
    [int]$Port = 0,
    [int]$TimeoutSeconds = 600,
    [switch]$KeepEvidence,
    [switch]$LifecycleSelfTest,
    [switch]$StrategySdk
)

$ErrorActionPreference = 'Stop'
$script:Passed = $false
$script:Server = $null
$script:ServerStartTimeUtc = $null
$script:Root = $null
$script:StatusPath = $null
$script:LogOut = $null
$script:LogErr = $null
$script:FailureMessage = $null
$script:StdoutReader = $null
$script:StderrReader = $null
$script:StdoutReadTask = $null
$script:StderrReadTask = $null
$script:OwnedProcessIds = New-Object System.Collections.Generic.HashSet[int]

function Write-RunStatus([string]$Stage, [string]$State, [string]$Detail = '') {
    $record = [ordered]@{ timestamp = (Get-Date).ToUniversalTime().ToString('o'); stage = $Stage; state = $State }
    if ($Detail) { $record.detail = $Detail }
    $line = $record | ConvertTo-Json -Compress
    if ($script:StatusPath) { Add-Content -LiteralPath $script:StatusPath -Value $line -Encoding UTF8 }
    Write-Host "[E2C][$State] $Stage$(if ($Detail) { ': ' + $Detail } else { '' })"
}

function Write-Stage([string]$Stage, [string]$Detail = '') { Write-RunStatus $Stage 'started' $Detail }
function Complete-Stage([string]$Stage, [string]$Detail = '') { Write-RunStatus $Stage 'completed' $Detail }

function Fail([string]$Message) {
    Write-RunStatus 'run' 'failed' $Message
    throw "E2C E2E FAILED: $Message"
}

# Windows PowerShell 5.1 can behave unreliably when PowerShell scriptblocks
# are used as asynchronous Process.OutputDataReceived/ErrorDataReceived
# callbacks. Keep the reads asynchronous in .NET, but drain completed lines
# synchronously from the main PowerShell thread.
function Start-ProcessStreamCapture([Diagnostics.Process]$Process, [string]$StdoutPath, [string]$StderrPath) {
    $script:StdoutReader = $Process.StandardOutput
    $script:StderrReader = $Process.StandardError
    $script:StdoutReadTask = $script:StdoutReader.ReadLineAsync()
    $script:StderrReadTask = $script:StderrReader.ReadLineAsync()
    $script:StdoutPath = $StdoutPath
    $script:StderrPath = $StderrPath
}

function Drain-ProcessStream([string]$StreamName) {
    if ($StreamName -eq 'stdout') {
        $reader = $script:StdoutReader; $path = $script:StdoutPath; $task = $script:StdoutReadTask
    } else {
        $reader = $script:StderrReader; $path = $script:StderrPath; $task = $script:StderrReadTask
    }
    if ($null -eq $task) { return }
    while ($task.IsCompleted) {
        if ($task.Status -ne [Threading.Tasks.TaskStatus]::RanToCompletion) { throw "Unable to capture $StreamName from the child server." }
        $line = $task.Result
        if ($null -eq $line) {
            $task = $null
            break
        }
        Add-Content -LiteralPath $path -Value $line -Encoding UTF8
        $task = $reader.ReadLineAsync()
    }
    if ($StreamName -eq 'stdout') { $script:StdoutReadTask = $task } else { $script:StderrReadTask = $task }
}

function Drain-AllProcessStreams {
    Drain-ProcessStream 'stdout'
    Drain-ProcessStream 'stderr'
}

function Invoke-DockerChecked([string[]]$Arguments) {
    $output = & docker @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { Fail "Docker command failed ($($Arguments -join ' ')): $($output -join ' ')" }
    return ($output -join "`n")
}

function Assert-NoRealDataPath([string]$PathToCheck) {
    $candidate = [IO.Path]::GetFullPath($PathToCheck).TrimEnd('\')
    $real = [IO.Path]::GetFullPath((Join-Path $RepoRoot 'data\tournaments')).TrimEnd('\')
    if ($candidate -eq $real) { Fail 'Refusing to use the repository data/tournaments directory.' }
    if (-not $candidate.StartsWith(([IO.Path]::GetFullPath($env:TEMP)).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        Fail "Test data path is outside TEMP: $candidate"
    }
}

function Get-AvailableLoopbackPort {
    $listener = New-Object -TypeName Net.Sockets.TcpListener -ArgumentList ([Net.IPAddress]::Loopback, 0)
    try { $listener.Start(); return ([Net.IPEndPoint]$listener.LocalEndpoint).Port }
    finally { $listener.Stop() }
}

function Test-LoopbackPortAvailable([int]$CandidatePort) {
    $listener = New-Object -TypeName Net.Sockets.TcpListener -ArgumentList ([Net.IPAddress]::Loopback, $CandidatePort)
    try { $listener.Start(); return $true } catch { return $false }
    finally { $listener.Stop() }
}

function Get-ListeningProcessIds([int]$CandidatePort) {
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        $connections = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $CandidatePort -State Listen -ErrorAction SilentlyContinue)
        if ($connections.Count -gt 0) { return @($connections | ForEach-Object { [int]$_.OwningProcess } | Sort-Object -Unique) }
    }
    $lines = @(netstat -ano -p tcp 2>$null | Select-String (':{0}\s+.*LISTENING\s+(\d+)$' -f $CandidatePort))
    return @($lines | ForEach-Object { if ($_.Matches[0].Groups.Count -gt 1) { [int]$_.Matches[0].Groups[1].Value } } | Sort-Object -Unique)
}

function Get-DescendantProcessIds([int]$ParentId) {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" -ErrorAction SilentlyContinue)
    $result = New-Object System.Collections.Generic.List[int]
    foreach ($child in $children) {
        $result.Add([int]$child.ProcessId)
        foreach ($descendant in (Get-DescendantProcessIds ([int]$child.ProcessId))) { $result.Add($descendant) }
    }
    return $result
}

function Invoke-Api {
    param(
        [Microsoft.PowerShell.Commands.WebRequestMethod]$Method,
        [string]$Path,
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [string]$Csrf,
        [object]$Body,
        [int[]]$AllowedStatus = @(200, 201, 204)
    )
    $headers = @{}
    if ($Csrf) { $headers['x-csrf-token'] = $Csrf }
    $params = @{ Uri = "$script:BaseUrl$Path"; Method = $Method; WebSession = $Session; Headers = $headers; UseBasicParsing = $true }
    if ($null -ne $Body) {
        $params['ContentType'] = 'application/json'
        $params['Body'] = ($Body | ConvertTo-Json -Depth 20 -Compress)
    }
    try { $response = Invoke-WebRequest @params }
    catch {
        $response = $_.Exception.Response
        $bodyText = ''
        if ($response) { $reader = New-Object IO.StreamReader($response.GetResponseStream()); $bodyText = $reader.ReadToEnd(); $reader.Dispose() }
        Fail "$Method $Path returned HTTP $($response.StatusCode): $bodyText"
    }
    if ($AllowedStatus -notcontains [int]$response.StatusCode) { Fail "$Method $Path returned unexpected HTTP $($response.StatusCode)" }
    $json = $null
    if ($response.Content) { try { $json = $response.Content | ConvertFrom-Json } catch { } }
    return [PSCustomObject]@{ Response = $response; Json = $json }
}

function New-Account([string]$Username, [string]$Password, [string]$Role) {
    $stage = "bootstrap-$Role-$Username"
    Write-Stage $stage
    $bootstrap = Join-Path $RepoRoot 'dist\server\admin\role-bootstrap.js'
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = (Get-Command node).Source
    $psi.Arguments = '"' + $bootstrap + '" --db "' + $script:DbPath + '" --username ' + $Username + ' --role ' + $Role + ' --password-stdin'
    $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $psi
    if (-not $process.Start()) { Fail "Unable to start role bootstrap for $Role account $Username" }
    [void]$script:OwnedProcessIds.Add($process.Id)
    # Windows PowerShell's native string pipeline can use a non-UTF-8 code page.
    # Send exact UTF-8 bytes because role-bootstrap reads stdin as UTF-8.
    $passwordBytes = [Text.Encoding]::UTF8.GetBytes($Password)
    $process.StandardInput.BaseStream.Write($passwordBytes, 0, $passwordBytes.Length)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    if (-not $process.WaitForExit(30000)) {
        try { $process.Kill() } catch { }
        Fail "Role bootstrap timed out for $Role account $Username"
    }
    if ($process.ExitCode -ne 0) { Fail "Unable to create isolated $Role account ${Username}: $($stderr.Trim())" }
    if ($stdout.Trim()) { Write-Host $stdout.Trim() }
    $process.Dispose()
    Complete-Stage $stage
}

function Write-IsolatedAccountDiagnostic {
    $probe = "const Database=require('better-sqlite3');const d=new Database(process.argv[1],{readonly:true});console.log(JSON.stringify(d.prepare('select username,role from users order by username').all()));d.close();"
    $rows = & node -e $probe $script:DbPath 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Host "Isolated account records: $($rows -join ' ')" }
    else { Write-Host 'Isolated account record probe failed.' }
}

function Assert-FixtureBounds([string[]]$Usernames, [string[]]$BotNames, [string]$TournamentName) {
    # Mirrors the existing server/admin/role-bootstrap.ts and server/index.ts
    # validator: ASCII letters, digits, underscore; 3 through 32 characters.
    foreach ($username in $Usernames) {
        if ($username -notmatch '^[A-Za-z0-9_]{3,32}$') { Fail "Generated username is outside the application contract: $username" }
    }
    if (($Usernames | Sort-Object -Unique).Count -ne 3) { Fail 'Generated account identities are not distinct.' }
    foreach ($botName in $BotNames) {
        if ([string]::IsNullOrWhiteSpace($botName) -or $botName.Length -gt 50) { Fail "Generated Bot name is outside the application contract: $botName" }
    }
    if ([string]::IsNullOrWhiteSpace($TournamentName) -or $TournamentName.Length -gt 100) { Fail 'Generated tournament name is outside the application contract.' }
}

function Login([string]$Username, [string]$Password, [string]$ExpectedRole) {
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    try {
        $login = Invoke-Api -Method Post -Path '/api/auth/login' -Session $session -Body @{ username = $Username; password = $Password }
        $me = Invoke-Api -Method Get -Path '/api/auth/me' -Session $session -AllowedStatus @(200)
    } catch {
        Write-Host "Login diagnostic: username=$Username; expectedRole=$ExpectedRole; baseUrl=$script:BaseUrl; serverPid=$($script:Server.Id); database=$([IO.Path]::GetFullPath($script:DbPath))"
        Write-IsolatedAccountDiagnostic
        throw
    }
    if (-not $me.Json.csrfToken -or $me.Json.user.username -ne $Username -or $me.Json.user.role -ne $ExpectedRole) {
        Fail "Session verification failed for $Username or returned an unexpected role."
    }
    return [PSCustomObject]@{ Session = $session; Csrf = [string]$me.Json.csrfToken; User = $me.Json.user }
}

function Stop-OwnedServer {
    if ($null -eq $script:Server) { return }
    $rootPid = $script:Server.Id
    $rootRunning = $false
    try {
        $currentRoot = Get-Process -Id $rootPid -ErrorAction Stop
        if ($script:ServerStartTimeUtc -and $currentRoot.StartTime.ToUniversalTime() -ne $script:ServerStartTimeUtc) {
            Write-Warning "PID $rootPid was reused by a different process; refusing to terminate it. Preserving evidence."
            return
        }
        $rootRunning = -not $currentRoot.HasExited
    } catch {
        if (-not $script:Server.HasExited) {
            Write-Warning 'Owned server identity could not be confirmed; refusing cleanup and preserving evidence.'
            return
        }
    }
    # Do not enumerate descendants after the root exits: the PID could have
    # been reused, and a new process tree would not belong to this run.
    $descendants = if ($rootRunning) { @(Get-DescendantProcessIds $rootPid) } else { @() }
    $owned = @($script:OwnedProcessIds | ForEach-Object { [int]$_ }) + $descendants | Sort-Object -Unique
    foreach ($processId in ($owned | Sort-Object -Descending)) {
        try {
            $process = Get-Process -Id $processId -ErrorAction Stop
            if (-not $process.HasExited) { $process.Kill() }
        } catch { }
    }
    try {
        if ($script:Server.HasExited) {
            Drain-AllProcessStreams
        }
    } catch { }
    try {
        if (-not $script:Server.HasExited -and -not $script:Server.WaitForExit(15000)) {
            Write-Warning 'Owned test server did not exit within 15 seconds; preserving evidence.'
            return
        }
    } catch { }
    if (-not $script:Server.HasExited) {
        Write-Warning 'Owned test server state could not be confirmed; preserving evidence.'
        return
    }
    $script:Server.Dispose()
    $script:Server = $null
}

function Invoke-LifecycleSelfTest {
    $root = Join-Path $env:TEMP ("ott-phase8e2c-lifecycle-" + [guid]::NewGuid().ToString('N'))
    $logs = Join-Path $root 'logs'
    $stdout = Join-Path $logs 'child.stdout.log'
    $stderr = Join-Path $logs 'child.stderr.log'
    $status = Join-Path $logs 'run-status.jsonl'
    $child = $null
    $unrelated = $null
    $listener = $null
    try {
        New-Item -ItemType Directory -Path $logs -Force | Out-Null
        New-Item -ItemType File -Path $stdout,$stderr,$status -Force | Out-Null
        if (-not (Test-Path -LiteralPath $stdout) -or -not (Test-Path -LiteralPath $status)) { throw 'evidence files were not initialized' }

        $makeChild = {
            param([string]$Arguments, [int]$FixturePort = 0, [string]$FixtureId = '')
            $info = New-Object Diagnostics.ProcessStartInfo
            $info.FileName = (Get-Command node).Source
            $info.Arguments = $Arguments
            $info.UseShellExecute = $false; $info.CreateNoWindow = $true
            $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
            if ($FixturePort -gt 0) { $info.EnvironmentVariables['E2C_FIXTURE_PORT'] = [string]$FixturePort }
            if ($FixtureId) { $info.EnvironmentVariables['E2C_FIXTURE_ID'] = $FixtureId }
            $p = New-Object Diagnostics.Process; $p.StartInfo = $info
            if (-not $p.Start()) { throw 'fixture child failed to start' }
            return $p
        }

        $fixturePort = Get-AvailableLoopbackPort
        $fixtureId = [guid]::NewGuid().ToString('N')
        $fixtureScriptPath = Join-Path $root 'fixture-server.js'
        @'
const http = require('http');
const port = Number(process.env.E2C_FIXTURE_PORT);
const id = process.env.E2C_FIXTURE_ID;
const server = http.createServer((request, response) => response.end('ok'));
server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ type: 'e2e-server-ready', id, pid: process.pid, port }));
  console.error('fixture diagnostic');
});
'@ | Set-Content -LiteralPath $fixtureScriptPath -Encoding UTF8
        $child = & $makeChild ('"' + $fixtureScriptPath + '"') $fixturePort $fixtureId
        $fixtureOut = Join-Path $logs 'fixture.stdout.log'; $fixtureErr = Join-Path $logs 'fixture.stderr.log'
        New-Item -ItemType File -Path $fixtureOut,$fixtureErr -Force | Out-Null
        Start-ProcessStreamCapture $child $fixtureOut $fixtureErr
        $fixtureReady = $false; $fixtureIdentity = $null
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Milliseconds 100
            Drain-AllProcessStreams
            if ($child.HasExited) { throw 'fixture child exited before readiness' }
            $fixtureListeners = @(Get-ListeningProcessIds $fixturePort)
            if ($fixtureListeners -contains $child.Id -and (Test-Path -LiteralPath $fixtureOut)) {
                foreach ($line in (Get-Content -LiteralPath $fixtureOut -ErrorAction SilentlyContinue)) {
                    try { $candidate = $line | ConvertFrom-Json; if ($candidate.type -eq 'e2e-server-ready') { $fixtureIdentity = $candidate; break } } catch { }
                }
            }
            if ($fixtureIdentity -and $fixtureIdentity.id -eq $fixtureId -and [int]$fixtureIdentity.pid -eq $child.Id -and [int]$fixtureIdentity.port -eq $fixturePort) { $fixtureReady = $true; break }
        }
        if (-not $fixtureReady) { throw 'fixture startup identity or listener ownership was not verified' }
        if (-not ((Get-Content -LiteralPath $fixtureErr -Raw) -match 'fixture diagnostic')) { throw 'fixture stderr was not captured' }
        $script:Server = $child; $script:ServerStartTimeUtc = $child.StartTime.ToUniversalTime(); [void]$script:OwnedProcessIds.Add($child.Id)
        Stop-OwnedServer
        $child = $null

        $child = & $makeChild '-e "console.log(''ready''); setTimeout(() => {}, 30000)"'
        if ($child.HasExited) { throw 'successful child exited before readiness' }
        $child.Kill(); $child.WaitForExit(5000) | Out-Null
        $child.Dispose(); $child = $null

        $child = & $makeChild '-e "process.exit(2)"'
        if (-not $child.WaitForExit(5000) -or $child.ExitCode -ne 2) { throw 'child startup failure fixture did not exit as expected' }
        $child.Dispose(); $child = $null

        $child = & $makeChild '-e "setTimeout(() => {}, 30000)"'
        Start-Sleep -Milliseconds 300
        if ($child.HasExited) { throw 'abrupt-exit/timeout fixture exited unexpectedly' }
        $child.Kill(); $child.WaitForExit(5000) | Out-Null
        $child.Dispose(); $child = $null

        $listener = New-Object -TypeName Net.Sockets.TcpListener -ArgumentList ([Net.IPAddress]::Loopback, 0)
        $listener.Start(); $occupiedPort = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
        if (Test-LoopbackPortAvailable $occupiedPort) { throw 'occupied-port fixture was reported available' }
        $listener.Stop(); $listener = $null

        $unrelated = & $makeChild '-e "setTimeout(() => {}, 30000)"'
        $unrelatedId = $unrelated.Id
        $owned = & $makeChild '-e "setTimeout(() => {}, 30000)"'
        $ownedId = $owned.Id
        $owned.Kill(); $owned.WaitForExit(5000) | Out-Null; $owned.Dispose(); $owned = $null
        $unrelatedAlive = -not (Get-Process -Id $unrelatedId -ErrorAction SilentlyContinue).HasExited
        if (-not $unrelatedAlive) { throw 'unrelated fixture process was terminated' }
        $unrelated.Kill(); $unrelated.WaitForExit(5000) | Out-Null; $unrelated.Dispose(); $unrelated = $null

        Add-Content -LiteralPath $status -Value (@{ stage = 'self-test'; state = 'passed' } | ConvertTo-Json -Compress) -Encoding UTF8
        Write-Host 'PASS: process-lifecycle self-test (child startup/failure/timeout, port collision, ownership, evidence)' -ForegroundColor Green
    } catch {
        Add-Content -LiteralPath $status -Value (@{ stage = 'self-test'; state = 'failed'; detail = $_.Exception.Message } | ConvertTo-Json -Compress) -Encoding UTF8
        Write-Host "FAIL: process-lifecycle self-test: $($_.Exception.Message)" -ForegroundColor Red
        throw
    } finally {
        if ($listener) { try { $listener.Stop() } catch { } }
        foreach ($p in @($child, $unrelated)) {
            if ($p) { try { if (-not $p.HasExited) { $p.Kill(); $p.WaitForExit(5000) | Out-Null } } catch { }; try { $p.Dispose() } catch { } }
        }
        Write-Host "Lifecycle self-test evidence: $root"
    }
}

if ($LifecycleSelfTest) {
    Invoke-LifecycleSelfTest
    return
}

try {
    $RepoRoot = [IO.Path]::GetFullPath($RepoRoot)
    $distServer = Join-Path $RepoRoot 'dist\server\index.js'
    if (-not (Test-Path -LiteralPath $distServer -PathType Leaf)) { Fail 'dist/server/index.js is missing; run npm run build first.' }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'Docker CLI is not on PATH.' }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js is not on PATH.' }

    $suffix = [guid]::NewGuid().ToString('N')
    # The account validator allows at most 32 characters. Keep fixture names
    # unique while leaving room for their role-specific prefixes.
    $accountSuffix = $suffix.Substring(0, 12)
    $organizerUsername = "e2corg$accountSuffix"
    $competitorAUsername = "e2ca$accountSuffix"
    $competitorBUsername = "e2cb$accountSuffix"
    Assert-FixtureBounds @($organizerUsername, $competitorAUsername, $competitorBUsername) @('E2C C++', 'E2C Python') "E2C $suffix"
    $script:Root = Join-Path $env:TEMP "ott-phase8e2c-$suffix"
    $script:DataRoot = Join-Path $script:Root 'data'
    $script:WorkRoot = Join-Path $script:Root 'work'
    $script:LogRoot = Join-Path $script:Root 'logs'
    $script:DbPath = Join-Path $script:DataRoot 'arena.sqlite'
    Assert-NoRealDataPath $script:DataRoot
    if (Test-Path -LiteralPath $script:Root) { Fail "Unexpected pre-existing test root: $script:Root" }
    New-Item -ItemType Directory -Path $script:DataRoot,$script:WorkRoot,$script:LogRoot -Force | Out-Null
    $script:StatusPath = Join-Path $script:LogRoot 'run-status.jsonl'
    $script:LogOut = Join-Path $script:LogRoot 'server.stdout.log'
    $script:LogErr = Join-Path $script:LogRoot 'server.stderr.log'
    New-Item -ItemType File -Path $script:StatusPath,$script:LogOut,$script:LogErr -Force | Out-Null
    Write-Stage 'evidence-initialized' "root=$script:Root"

    Write-Stage 'docker-preflight' "context=$DockerContext"
    Write-Host 'Checking Docker Desktop context and immutable images...'
    Invoke-DockerChecked @('--context', $DockerContext, 'version', '--format', '{{.Server.Version}}') | Out-Host
    $images = [ordered]@{
        'BOT_DOCKER_IMAGE' = 'ghcr.io/anhtuan062/ott-phase6e-bot@sha256:78c1972c29f1385eacd32f715a24ec41013b5883fb5f8fe0f2c597358d3bf70d'
        'BOT_CPP_COMPILER_IMAGE' = 'docker.io/library/gcc@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15'
        'BOT_CPP_RUNTIME_IMAGE' = 'docker.io/library/debian@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587'
        'BOT_PYTHON3_RUNTIME_IMAGE' = 'docker.io/library/python@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258'
    }
    foreach ($image in $images.GetEnumerator()) {
        Invoke-DockerChecked @('--context', $DockerContext, 'image', 'inspect', $image.Value) | Out-Null
        Write-Host "  PASS $($image.Key)"
    }
    Complete-Stage 'docker-preflight'

    Write-Stage 'build'
    Write-Host 'Building compiled server...'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { Fail 'npm run build failed.' }
    Complete-Stage 'build'

    # ASCII-only random credential; no trailing punctuation or shell-sensitive
    # characters are used in the bootstrap-to-HTTP credential boundary.
    $password = "E2C$($suffix.Substring(0, 24))Pass9"
    Write-Stage 'account-bootstrap'
    New-Account $organizerUsername $password 'organizer'
    New-Account $competitorAUsername $password 'competitor'
    New-Account $competitorBUsername $password 'competitor'
    Complete-Stage 'account-bootstrap'

    if ($Port -eq 0) { $Port = Get-AvailableLoopbackPort }
    elseif (-not (Test-LoopbackPortAvailable $Port)) { Fail "Requested loopback port $Port is already occupied." }
    $serverIdentity = [guid]::NewGuid().ToString('N')
    $envForServer = @{
        NODE_ENV = 'test'; EXECUTION_POLICY = 'sandbox-required'; ENABLE_SOURCE_REVISION_EXECUTION = 'true'
        BOT_TRUSTED_IMAGE_REGISTRIES = 'docker.io,ghcr.io'; DOCKER_CONTEXT = $DockerContext; TOURNAMENT_DATA_DIR = $script:DataRoot
        BOT_EXECUTION_WORKDIR = $script:WorkRoot; PORT = [string]$Port; E2E_SERVER_ID = $serverIdentity
    }
    foreach ($entry in $images.GetEnumerator()) { $envForServer[$entry.Key] = $entry.Value }
    Write-Stage 'server-start' "port=$Port; identity=$serverIdentity"
    $logOut = $script:LogOut; $logErr = $script:LogErr
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = (Get-Command node).Source
    $psi.Arguments = '"' + $distServer + '"'
    $psi.WorkingDirectory = $RepoRoot
    $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    foreach ($entry in $envForServer.GetEnumerator()) { $psi.EnvironmentVariables[$entry.Key] = [string]$entry.Value }
    $script:Server = New-Object Diagnostics.Process
    $script:Server.StartInfo = $psi
    if (-not $script:Server.Start()) { Fail 'Unable to start the isolated test server process.' }
    $script:ServerStartTimeUtc = $script:Server.StartTime.ToUniversalTime()
    [void]$script:OwnedProcessIds.Add($script:Server.Id)
    Start-ProcessStreamCapture $script:Server $logOut $logErr
    $script:BaseUrl = "http://127.0.0.1:$Port"
    $ready = $false
    $identity = $null
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        Drain-AllProcessStreams
        if ($script:Server.HasExited) { Fail "Server exited during startup. See $logErr" }
        $listeners = @(Get-ListeningProcessIds $Port)
        if ($listeners.Count -gt 0 -and ($listeners -notcontains $script:Server.Id)) {
            Fail "Port $Port is owned by an unexpected process ($($listeners -join ',')). No credentials were sent."
        }
        if ($listeners -contains $script:Server.Id -and (Test-Path -LiteralPath $logOut)) {
            foreach ($line in (Get-Content -LiteralPath $logOut -ErrorAction SilentlyContinue)) {
                try {
                    $candidate = $line | ConvertFrom-Json
                    if ($candidate.type -eq 'e2e-server-ready') { $identity = $candidate; break }
                } catch { }
            }
        }
        if ($identity -and $identity.id -eq $serverIdentity -and [int]$identity.pid -eq $script:Server.Id -and [int]$identity.port -eq $Port -and [IO.Path]::GetFullPath([string]$identity.dataDir).TrimEnd('\') -eq [IO.Path]::GetFullPath($script:DataRoot).TrimEnd('\')) {
            $ready = $true; break
        }
    }
    if (-not $ready) { Fail "The child server did not complete the authenticated startup handshake on port $Port. No credentials were sent. See $logOut and $logErr" }
    Complete-Stage 'server-start' "pid=$($script:Server.Id); port=$Port"

    Write-Stage 'authentication'
    $organizer = Login $organizerUsername $password 'organizer'
    $competitorA = Login $competitorAUsername $password 'competitor'
    $competitorB = Login $competitorBUsername $password 'competitor'
    Complete-Stage 'authentication'
    Write-Stage 'tournament-workflow'
    $botA = (Invoke-Api -Method Post -Path '/api/bots' -Session $competitorA.Session -Csrf $competitorA.Csrf -Body @{ name='E2C C++'; command='node'; args=@() }).Json
    $botB = (Invoke-Api -Method Post -Path '/api/bots' -Session $competitorB.Session -Csrf $competitorB.Csrf -Body @{ name='E2C Python'; command='node'; args=@() }).Json
    if ($StrategySdk) {
        $cpp = @'
#include <vector>

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
    } else {
    $cpp = @'
#include <iostream>
#include <regex>
#include <string>
int main() {
  std::string input((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>());
  std::smatch piece, from, to;
  if (!std::regex_search(input, piece, std::regex("\\\"piece_id\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"")) ||
      !std::regex_search(input, from, std::regex("\\\"from\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"")) ||
      !std::regex_search(input, to, std::regex("\\\"to\\\"\\s*:\\s*\\\"([^\\\"]+)\\\""))) return 2;
  std::cout << "{\"move\":{\"piece_id\":\"" << piece[1] << "\",\"from\":\"" << from[1] << "\",\"to\":\"" << to[1] << "\"}}\n";
}
'@
    $python = @'
import json, sys
request = json.load(sys.stdin)
move = request["legal_moves"][0]
print(json.dumps({"move": {"piece_id": move["piece_id"], "from": move["from"], "to": move["to"]}}))
'@
    }
    $revisionMode = if ($StrategySdk) { 'strategy' } else { 'raw' }
    $revA = (Invoke-Api -Method Post -Path "/api/bots/$($botA.id)/revisions" -Session $competitorA.Session -Csrf $competitorA.Csrf -Body @{ runtimeId='cpp'; executionMode=$revisionMode; label='E2C C++ pinned'; source=$cpp }).Json
    $revB = (Invoke-Api -Method Post -Path "/api/bots/$($botB.id)/revisions" -Session $competitorB.Session -Csrf $competitorB.Csrf -Body @{ runtimeId='python3'; executionMode=$revisionMode; label='E2C Python pinned'; source=$python }).Json
    if ($StrategySdk) {
        foreach ($revision in @($revA, $revB)) {
            if ($revision.executionMode -ne 'strategy' -or [string]::IsNullOrWhiteSpace([string]$revision.sdkVersion) -or [string]$revision.sdkDigest -notmatch '^[a-f0-9]{64}$') {
                Fail 'Strategy revision did not return a pinned SDK version and digest.'
            }
        }
        Write-Host "  PASS strategy SDK pinning: version=$($revA.sdkVersion); C++ digest=$($revA.sdkDigest); Python digest=$($revB.sdkDigest)"
    }

    $tournament = (Invoke-Api -Method Post -Path '/api/tournaments' -Session $organizer.Session -Csrf $organizer.Csrf -Body @{ name="E2C $suffix"; format='single_round_robin'; visibility='public' }).Json
    $tid = $tournament.tournamentId
    Invoke-Api -Method Post -Path "/api/tournaments/$tid/action" -Session $organizer.Session -Csrf $organizer.Csrf -Body @{ action='open_registration' } | Out-Null
    $discoverable = (Invoke-Api -Method Get -Path '/api/tournaments/discoverable' -Session $competitorA.Session).Json
    if (-not ($discoverable | Where-Object tournamentId -eq $tid)) { Fail 'Competitor could not discover the public tournament.' }
    $reqA = (Invoke-Api -Method Post -Path "/api/tournaments/$tid/participation-requests" -Session $competitorA.Session -Csrf $competitorA.Csrf -Body @{ participantName='C++ competitor'; botId=$botA.id; revisionId=$revA.revisionId }).Json
    $reqB = (Invoke-Api -Method Post -Path "/api/tournaments/$tid/participation-requests" -Session $competitorB.Session -Csrf $competitorB.Csrf -Body @{ participantName='Python competitor'; botId=$botB.id; revisionId=$revB.revisionId }).Json
    $requests = (Invoke-Api -Method Get -Path "/api/tournaments/$tid/requests" -Session $organizer.Session).Json
    foreach ($requestId in @($reqA.requestId, $reqB.requestId)) { Invoke-Api -Method Post -Path "/api/tournaments/$tid/requests/$requestId/approve" -Session $organizer.Session -Csrf $organizer.Csrf | Out-Null }
    Invoke-Api -Method Post -Path "/api/tournaments/$tid/action" -Session $organizer.Session -Csrf $organizer.Csrf -Body @{ action='close_registration' } | Out-Null
    Invoke-Api -Method Post -Path "/api/tournaments/$tid/action" -Session $organizer.Session -Csrf $organizer.Csrf -Body @{ action='generate_schedule' } | Out-Null
    Invoke-Api -Method Post -Path "/api/tournaments/$tid/action" -Session $organizer.Session -Csrf $organizer.Csrf -Body @{ action='start' } | Out-Null
    $before = (Invoke-Api -Method Get -Path "/api/tournaments/$tid" -Session $organizer.Session).Json
    $pairing = $before.rounds[0].pairings[0]
    if ($pairing.participantB -eq $null) { Fail 'Schedule produced a bye instead of the two approved participants.' }
    $originalDigests = @($revA.sourceDigest, $revB.sourceDigest)
    Invoke-Api -Method Post -Path "/api/tournaments/$tid/action" -Session $organizer.Session -Csrf $organizer.Csrf -Body @{ action='run_all' } | Out-Null

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds); $completed = $false
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        $state = (Invoke-Api -Method Get -Path "/api/tournaments/$tid" -Session $organizer.Session).Json
        $queue = (Invoke-Api -Method Get -Path "/api/system/queue?id=run_all_$tid" -Session $organizer.Session).Json
        if ($queue.status -in @('failed','error')) { Fail "Docker infrastructure or execution queue failure: $($queue | ConvertTo-Json -Depth 10 -Compress)" }
        if ($state.status -eq 'completed') { $completed = $true; break }
        if ($state.status -eq 'cancelled') { Fail 'Tournament was cancelled during Docker execution.' }
    }
    if (-not $completed) { Fail "Tournament did not complete within $TimeoutSeconds seconds. Server logs: $logErr" }
    $finalPairing = ((Invoke-Api -Method Get -Path "/api/tournaments/$tid" -Session $organizer.Session).Json.rounds[0].pairings[0])
    if ($finalPairing.status -ne 'completed' -or -not $finalPairing.matchId) { Fail 'Completed tournament has no durable completed pairing.' }
    $matchId = $finalPairing.matchId
    $record = (Invoke-Api -Method Get -Path "/api/tournaments/$tid/results/$matchId" -Session $organizer.Session).Json
    $replay = (Invoke-Api -Method Get -Path "/api/tournaments/$tid/replays/$matchId" -Session $organizer.Session).Json
    if (-not $record.executionProvenance -or -not $replay.metadata.sourceRevisions) { Fail 'Result/replay provenance is missing.' }
    if ($record.turnCount -lt 2) { Fail 'Strategy tournament did not execute both player turns.' }
    if ($record.terminationReason -match '^bot_' -or $record.terminationReason -eq 'engine_error') { Fail "Tournament ended through a Bot/protocol or engine failure: $($record.terminationReason)" }
    if ($record.executionProvenance[0].sourceDigest -notin $originalDigests -or $record.executionProvenance[1].sourceDigest -notin $originalDigests) { Fail 'Persisted provenance does not match approved revisions.' }
    if ($StrategySdk) {
        foreach ($expected in @($revA, $revB)) {
            $resultProvenance = @($record.executionProvenance | Where-Object revisionId -eq $expected.revisionId)
            $replayProvenance = @($replay.metadata.sourceRevisions | Where-Object revisionId -eq $expected.revisionId)
            if ($resultProvenance.Count -ne 1 -or $replayProvenance.Count -ne 1) { Fail "SDK revision $($expected.revisionId) is missing from result/replay provenance." }
            if ($resultProvenance[0].executionMode -ne 'strategy' -or $resultProvenance[0].sdkVersion -ne $expected.sdkVersion -or $resultProvenance[0].sdkDigest -ne $expected.sdkDigest) { Fail 'Result provenance SDK identity does not match the approved revision.' }
            if ($replayProvenance[0].sdkDigest -ne $expected.sdkDigest) { Fail 'Replay provenance SDK identity does not match the approved revision.' }
        }
    }
    $revA2 = (Invoke-Api -Method Post -Path "/api/bots/$($botA.id)/revisions" -Session $competitorA.Session -Csrf $competitorA.Csrf -Body @{ runtimeId='cpp'; executionMode=$revisionMode; label='E2C later selected revision'; source=$cpp + "`n" }).Json
    Invoke-Api -Method Post -Path "/api/bots/$($botA.id)/revisions/$($revA2.revisionId)/select" -Session $competitorA.Session -Csrf $competitorA.Csrf | Out-Null
    $after = (Invoke-Api -Method Get -Path "/api/tournaments/$tid" -Session $organizer.Session).Json
    $pinned = $after.participants | Where-Object { $_.bot.execution.revisionId -eq $revA.revisionId }
    if (-not $pinned) { Fail 'Changing the current Bot revision changed the scheduled participant snapshot.' }
    $modeLabel = if ($StrategySdk) { 'Strategy SDK C++17/Python 3' } else { 'raw-source C++/Python' }
    Write-Host "PASS: $modeLabel Docker tournament completed; match $matchId; replay and provenance verified."
    $script:Passed = $true
    Complete-Stage 'tournament-workflow'
}
catch {
    $script:FailureMessage = $_.Exception.Message
    Write-RunStatus 'run' 'failed' $script:FailureMessage
    Write-Host ("E2C E2E FAILED: " + $script:FailureMessage) -ForegroundColor Red
    if ($script:Root) { Write-Host "Evidence preserved at: $script:Root" }
}
finally {
    Stop-OwnedServer
    if ($script:Passed) { Write-RunStatus 'run' 'passed' 'Docker-backed tournament completed.' }
    if ($script:Passed -and -not $KeepEvidence -and $script:Root -and (Test-Path -LiteralPath $script:Root)) {
        Remove-Item -LiteralPath $script:Root -Recurse -Force
        Write-Host 'PASS: Isolated test data and logs removed after confirmed server shutdown.'
    } elseif ($script:Root) {
        Write-Host "Evidence retained at: $script:Root"
    }
}

# Throw after finally so a failure is nonzero to automation without using
# exit, which can terminate an interactive calling PowerShell host.
if ($script:FailureMessage) { throw $script:FailureMessage }
