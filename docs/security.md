# Security Model

## Threat Model

### Assets to Protect
- Host system integrity
- Other contestants' bot code
- Tournament data integrity
- Match result authenticity

### Attackers
- Malicious contestants submitting harmful bots
- Compromised bot dependencies
- Network attackers (if bots have network access)

### Attack Vectors
1. **Code execution**: Bot exploits OS vulnerabilities
2. **Resource exhaustion**: Fork bombs, memory leaks, infinite loops
3. **Data exfiltration**: Reading files, network requests
4. **Result tampering**: Modifying match state, spoofing wins
5. **Denial of service**: Hanging processes, filling disk

## Defense Layers

### 1. Process Isolation (MVP)
- Each bot runs in separate `child_process`
- No shell interpolation: `spawn(cmd, args, { shell: false })`
- Working directory: isolated temp directory per match
- Environment: minimal, no secrets
- Timeout enforcement: `setTimeout` + `process.kill()`

### 2. Resource Limits (where supported)
```typescript
const limits = {
  maxTimeMs: 2000,
  maxMemoryMb: 256,
  maxCpuPercent: 100,
  maxOutputBytes: 1_000_000,
  maxProcesses: 1,
  allowNetwork: false,
  allowFileWrite: false,  // except stdout/stderr
};
```
- Node.js: `--max-old-space-size`, `worker_threads` with `resourceLimits`
- Future: Docker containers, gVisor, Firecracker

### 3. Filesystem Restrictions
- Bot working directory: empty temp dir
- No access to: source code, other bots, config, keys
- Read-only access to standard library only

### 4. Network Restrictions
- No outbound connections (blocked at OS/firewall level)
- No inbound listeners
- Localhost access blocked

### 5. Protocol Enforcement
- Engine validates every move against rules
- Bot cannot report winner, score, or state
- Engine is sole authority on match outcome

## Bot Execution Flow

```
Match Runner
    │
    ▼
Bot Runner (spawns process)
    │
    ├──► stdin: JSON request (validated schema)
    │
    ├──► stdout: JSON response (parsed, validated)
    │
    ├──► stderr: captured to log (not parsed)
    │
    ├──► timeout: kill(SIGTERM) → kill(SIGKILL)
    │
    └──► exit code: 0 = ok, else = forfeit
```

## What Bots CANNOT Do
- Access filesystem outside working directory
- Make network requests
- Spawn child processes
- Modify match state directly
- Read other bots' code
- Access environment variables with secrets
- Run longer than timeout
- Produce unlimited output

## What Bots CAN Do
- Read stdin (game state)
- Write stdout (one move)
- Write stderr (debug logs)
- Use CPU/memory within limits
- Use standard library (math, collections, etc.)

## Deployment Checklist (Production)
- [ ] Run bot executor in dedicated VM/container
- [ ] Network namespace isolation
- [ ] User namespace mapping (non-root)
- [ ] Seccomp/firecracker profile
- [ ] Audit logs for all executions
- [ ] Rate limiting on match creation
- [ ] Signed bot binaries / reproducible builds

## MVP Limitations (Known)
- Node.js `child_process` timeout is NOT a security sandbox
- No memory/CPU enforcement without OS support
- Filesystem access limited only by OS permissions
- Suitable for trusted bots only (sample bots, internal testing)
- **Do not run untrusted code in production without proper sandbox**