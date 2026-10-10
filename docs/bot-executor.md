# Bot Executor - Phase 5

## Overview

The Bot Executor provides a pluggable interface for executing bot processes with security isolation. It abstracts the execution layer, allowing the match runner to work with different isolation backends without changing match logic.

## Architecture

```
bot-executor/
├── types.ts                 # Interfaces: BotExecutor, BotExecutionResult, BotProcessConfig, etc.
├── child-process-executor.ts  # Node.js child_process implementation (MVP/fallback)
├── docker-executor.ts       # Docker container implementation (production)
├── bot-runner-adapter.ts    # Legacy BotRunner adapter for backward compatibility
└── index.ts                 # Factory with auto-detection
```

## Components

### BotExecutor Interface

The `BotExecutor` interface defines the contract for all executor implementations:

| Method | Description |
|--------|-------------|
| `execute(context, processConfig, request)` | Execute a bot for a single turn |
| `terminate(executionId)` | Terminate a running execution |
| `isAvailable()` | Check if executor is available in current environment |
| `getName()` | Return executor identifier |
| `getSupportedLimits()` | Return supported resource limits |

### Executor Types

#### 1. ChildProcessExecutor (`child-process`)

**Status**: Active (fallback when Docker unavailable)

Uses Node.js `child_process.spawn()` with enhanced security features:

- **Environment sanitization**: Only allowlisted env vars (`PATH`, `HOME`, `USER`, `TEMP`, `TMP`, `NODE_OPTIONS`)
- **Bot-specific vars**: Variables prefixed with `BOT_` are passed through
- **Working directory isolation**: Isolated working directory per execution
- **stdout/stderr limits**: Hard caps on output size (1MB stdout, 10MB stderr by default)
- **Process tree killing**: Uses `taskkill /t /f` on Windows, `process.kill(-pid)` on Unix
- **Timeout enforcement**: Configurable timeout with cleanup
- **windowsHide**: Prevents console window from appearing on Windows

**Limitations**: Not a true sandbox — bots run with parent process privileges. Suitable for trusted bots only.

#### 2. DockerExecutor (`docker`)

**Status**: Implemented (requires Docker runtime)

Uses Docker containers for true process isolation:

- `--network none`: No network access
- `--read-only`: Read-only root filesystem
- `--tmpfs /tmp:rw,noexec,nosuid,size=10m`: Limited writable volume
- `--security-opt no-new-privileges:true`: Prevent privilege escalation
- `--cap-drop ALL`: Drop all Linux capabilities
- `--memory`, `--cpus`, `--pids-limit`: Resource limits
- Unique container name per execution

#### 3. BotRunnerAdapter (`bot-runner-adapter`)

**Status**: Active (backward compatibility)

Wraps the legacy `BotRunner` to implement the `BotExecutor` interface, enabling gradual migration of existing tournament code.

## Factory & Auto-Detection

```typescript
import { createExecutor } from '@bot-executor';

// Auto-detect: Docker first, fallback to child-process
const executor = await createExecutor();

// Force specific type
const cpExecutor = await createExecutor({ type: 'child-process' });
const dockerExecutor = await createExecutor({ type: 'docker' });
```

The factory caches the executor instance and supports:

- `getCachedExecutor()`: Get the cached executor
- `getCachedExecutorType()`: Get the cache type
- `clearExecutorCache()`: Clear the cache

## Error Handling

### Error Codes

| Code | Description |
|------|-------------|
| `TIMEOUT` | Bot exceeded timeout |
| `PROCESS_CRASHED` | Bot exited with non-zero code |
| `INVALID_JSON` | Bot output is not valid JSON |
| `INVALID_RESPONSE` | Response structure is invalid |
| `MISSING_MOVE` | Response missing move object |
| `INVALID_MOVE` | Move object is invalid |
| `INVALID_PIECE_ID` | piece_id is missing or empty |
| `INVALID_FROM` | from coordinate is invalid |
| `INVALID_TO` | to coordinate is invalid |
| `INVALID_COORDINATES` | Coordinates outside a1-i9 range |
| `INVALID_MOVE_SAME_SQUARE` | from and to are the same |
| `EMPTY_OUTPUT` | Bot produced no output |
| `EXECUTOR_UNAVAILABLE` | Executor not available (e.g., Docker not installed) |
| `EXECUTOR_ERROR` | Internal executor error |
| `RESOURCE_LIMIT_EXCEEDED` | Bot terminated due to resource limit |
| `SECURITY_VIATION` | Security policy violation detected |

## Security Controls

### Environment Isolation

- Only allowlisted environment variables are passed to bot processes
- Bot-specific variables use `BOT_` prefix
- No sensitive variables (secrets, tokens, internal paths) are exposed

### Resource Limits

| Limit | ChildProcess | Docker |
|-------|-------------|--------|
| Timeout | ✓ | ✓ |
| stdoud size | ✓ | ✓ |
| stderr size | ✓ | ✓ |
| Memory limit | ✗ (documented) | ✓ (`--memory`) |
| CPU limit | ✗ (documented) | ✓ (`--cpus`) |
| Process limit | ✗ (documented) | ✓ (`--pids-limit`) |
| File size limit | ✗ | ✗ (future) |
| Open files limit | ✗ | ✗ (future) |

### Process Lifecycle

1. Spawn process with sanitized environment
2. Write JSON request to stdin, close stdin
3. Start timeout timer
4. Collect stdout/stderr with size limits
5. On timeout/resource limit: kill process tree
6. On exit: resolve with result

### Process Tree Killing

- **Windows**: `taskkill /pid <pid> /t /f` (kills entire process tree)
- **Unix**: `process.kill(-pid, 'SIGKILL')` (negative PID = process group)
- **Fallback**: `proc.kill('SIGKILL')` if tree kill fails

## Integration with Match Runner

The `MatchRunner` constructor accepts an optional `BotExecutor` parameter:

```typescript
import { createMatchRunner } from '@match-runner';
import { createExecutor } from '@bot-executor';

const executor = await createExecutor({ type: 'child-process' });
const runner = createMatchRunner(config, playerA, playerB, executor);
```

If no executor is provided, the `BotRunnerAdapter` is used by default, maintaining backward compatibility.

## Configuration

### ChildProcessExecutor Config

```typescript
interface ExecutorConfig {
  defaultTimeoutMs: number;           // Default: 2000
  defaultMaxStdoutBytes: number;      // Default: 1MB
  defaultMaxStderrBytes: number;      // Default: 10MB
  allowedEnvVars?: string[];          // Default: ['PATH', 'HOME', 'USER', 'TEMP', 'TMP', 'NODE_OPTIONS']
  workingDirBase?: string;            // Default: process.cwd()
}
```

### DockerExecutor Config

```typescript
interface DockerExecutorConfig extends ExecutorConfig {
  image: string;                      // Default: 'ott-code-arena-bot:latest'
  dockerBinary?: string;              // Default: 'docker'
  networkMode?: string;               // Default: 'none'
  memoryLimit?: string;               // Default: '256m'
  cpuLimit?: number;                  // Default: 1
  pidsLimit?: number;                 // Default: 64
}
```

## Testing

Security tests cover:

1. **Environment isolation** - Sensitive env vars not exposed, BOT_ prefix allowed
2. **Resource limits** - stdout/stderr size limits, timeout enforcement
3. **Process isolation** - Child process tree termination on timeout
4. **Input validation** - Invalid JSON, missing move, invalid coordinates, same square, empty output
5. **Cancellation and cleanup** - Manual termination, parallel executions
6. **Executor availability** - isAvailable, getName, getSupportedLimits

Run tests:
```bash
npm test tests/bot-executor/
```

## Known Limitations

### ChildProcessExecutor (Current Environment)

- ❌ **No CPU limit enforcement** - Cannot limit CPU usage on child_process
- ❌ **No memory limit enforcement** - Cannot limit memory on child_process
- ❌ **No process count limit** - Cannot prevent fork bombs
- ❌ **No file system isolation** - Bot can access files accessible to parent process
- ❌ **No network isolation** - Bot can make network connections
- ⚠️ **Windows taskkill** - Requires admin privileges for some process trees
- ✅ **Timeout enforcement** - Implemented with process tree killing
- ✅ **Output size limits** - Implemented with stream truncation
- ✅ **Environment sanitization** - Implemented with allowlist
- ✅ **Response validation** - Implemented with strict schema checking

### DockerExecutor (Not Tested)

- ✅ **Full isolation** when Docker is available
- ✅ **All resource limits** enforceable via Docker
- ✅ **Network isolation** via `--network none`
- ✅ **Filesystem isolation** via `--read-only` and tmpfs
- ⚠️ **Requires Docker** - Not available in current development environment
- ⚠️ **Container image** - Need to build `ott-code-arena-bot:latest` image

## Migration Guide

### From BotRunner to BotExecutor

**Before (BotRunner):**
```typescript
import { BotRunner } from '@bot-runner';
const runner = new BotRunner({ defaultTimeoutMs: 2000 });
const result = await runner.runBot(botConfig, request);
```

**After (BotExecutor):**
```typescript
import { createExecutor } from '@bot-executor';
const executor = await createExecutor();
const result = await executor.execute(context, processConfig, request);
```

**Backward Compatible (BotRunnerAdapter):**
```typescript
import { BotRunnerAdapter, createBotRunnerAdapter } from '@bot-executor';
import { BotRunner } from '@bot-runner';
const adapter = createBotRunnerAdapter(new BotRunner());
// Use adapter as BotExecutor
```

## Security Verification

The following security measures have been **verified** in the current environment:

| Measure | Verified | Method |
|---------|----------|--------|
| Env sanitization | ✅ | Integration test with TEST_SECRET |
| Stdout limit | ✅ | Test with 5000 chars vs 100 limit |
| Stderr limit | ✅ | Test with 5000 chars vs 100 limit |
| Timeout enforcement | ✅ | Test with 10s sleep vs 50ms timeout |
| Process tree kill | ✅ | Test with spawned child process |
| Invalid JSON rejection | ✅ | Test with non-JSON output |
| Invalid response rejection | ✅ | Test with missing/invalid fields |
| Empty output rejection | ✅ | Test with no output |
| Cancellation | ✅ | Test with manual terminate() |
| Parallel execution | ✅ | Test with 5 concurrent executions |

The following are **not verified** (require Docker/runtime support):

| Measure | Verified | Reason |
|---------|----------|--------|
| CPU limit | ❌ | Requires Docker/cgroups |
| Memory limit | ❌ | Requires Docker/cgroups |
| Process limit | ❌ | Requires Docker/cgroups |
| Network isolation | ❌ | Requires Docker `--network none` |
| Filesystem isolation | ❌ | Requires Docker `--read-only` |
| Capability dropping | ❌ | Requires Docker `--cap-drop ALL` |
| No-new-privileges | ❌ | Requires Docker security-opt |

## Future Improvements

1. **Docker Image**: Build and publish `ott-code-arena-bot:latest` image
2. **Windows Job Objects**: Implement proper process tree management on Windows
3. **Seccomp Profiles**: Add syscall filtering for Linux containers
4. **Resource Monitoring**: Add real-time CPU/memory tracking
5. **Audit Logging**: Structured logs for all executions
6. **Queue Management**: Limit concurrent executions globally