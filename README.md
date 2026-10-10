# OTT Code Arena

## Sandbox Docker image configuration

Bot containers run Node.js and Python 3 from the dedicated sandbox image. The executor
keeps network disabled, the root filesystem read-only, `/tmp` as a `noexec,nosuid`
tmpfs, all capabilities dropped, `no-new-privileges`, and CPU/memory/PID limits.

`BOT_DOCKER_IMAGE` is the single image-selection setting. In production (or under
`sandbox-required`) it is mandatory and must be a registry-qualified immutable digest:

```sh
BOT_DOCKER_IMAGE=ghcr.io/OWNER/ott-code-arena-bot@sha256:ACTUAL_64_HEX_DIGEST
```

Do not use the placeholder value above. Obtain the digest from the approved registry
manifest after review. Tags, including `latest`, are rejected in production. The
executor checks that Docker and the selected image are available before accepting
execution; it never falls back to host execution under `sandbox-required`.

For intentional local development only, build with an approved, digest-pinned Node
Alpine base and select the resulting local tag explicitly:

```sh
docker build --build-arg BASE_IMAGE='node:20-alpine@sha256:<approved-base-digest>' -t ott-code-arena-bot:dev .
BOT_DOCKER_IMAGE=ott-code-arena-bot:dev npm test
```

The Dockerfile deliberately has no baked-in mutable base tag. Verify a candidate with
`docker image inspect IMAGE --format '{{index .RepoDigests 0}} {{.Id}}'`, record the
registry digest in the release review, then promote that exact digest to production.
To roll back, change `BOT_DOCKER_IMAGE` to the previous approved digest and restart.
If Docker/image inspection fails, install/start Docker and build or pull the exact
approved image; production startup intentionally fails closed rather than using a
local process. The manual `Verified sandbox image build` workflow builds and tests an
input digest without publishing it, and uploads the observed local image identity.

> Nền tảng tổ chức giải đấu lập trình bot cho trò chơi OTTv2 (Oẳn tù tì v2).

## 1. Mục tiêu dự án

OTT Code Arena cho phép các đội viết chương trình tự động (*bot*) để điều khiển quân trong OTTv2. Hệ thống tổ chức trận đấu giữa các bot, kiểm tra nước đi, ghi lại diễn biến và tổng hợp kết quả giải.

Người tham gia có thể tự chọn chiến lược, ví dụ:
- `if-else`, luật ưu tiên và heuristic đơn giản;
- chiến lược dựa trên thống kê hoặc đánh giá trạng thái;
- BFS, A*, Minimax, Alpha-Beta;
- thuật toán tự thiết kế hoặc kết hợp nhiều phương pháp.

**Không bắt buộc một thuật toán cụ thể.** Ban tổ chức cần công bố cùng một giao thức đầu vào/đầu ra và giới hạn tài nguyên để các bot được đánh giá công bằng.

## 2. Trạng thái triển khai

### ✅ Phase 1: Game Engine (Hoàn thành)
- Mô hình hóa bàn cờ 9×9, quân cờ (dam/la/keo), luật di chuyển và ăn quân
- Kiểm tra nước đi hợp lệ và áp dụng nước đi (immutable state)
- Phát hiện thắng/hòa: loại loại quân, ô đích, giới hạn lượt, lặp 3 lần, vật liệu không đủ
- 134 unit tests pass
- TypeScript build thành công

### ✅ Phase 2: Bot Protocol (Hoàn thành)
- Giao thức phiên bản `0.1.0` qua JSON Lines trên stdio
- Request: trạng thái bàn cờ + danh sách nước đi hợp lệ
- Response: một nước đi (piece_id, from, to)
- Validation runtime cho request/response
- Bot mẫu: `examples/sample-bot` (first-move) và `examples/random-bot` (random)
- 45 protocol tests pass

### ✅ Phase 3: Match Runner (Hoàn thành)
- Điều phối trận đấu giữa 2 bot processes
- Bot Runner: spawn process, timeout, capture stdout/stderr, size limits
- Match lifecycle: init → turn loop → termination → result/replay
- Xử lý lỗi: timeout, crash, invalid JSON, invalid response, illegal move
- Kết quả có cấu trúc: MatchResult, TurnLog, MatchReplay (JSON serializable)
- 29 match/bot-runner tests pass

### ✅ Phase 4: Tournament Manager (Hoàn thành)
- Domain types: Team, BotVersion, TournamentConfig, MatchSchedule, TournamentStanding
- Scheduling: Round-robin circle algorithm, double round-robin, home/away balance
- Scoring: Win=3, Draw=1, Loss=0; tiebreaks: goal_diff, goals_for, h2h, head-to-head, random
- Persistence: File-based repository, atomic writes (Windows-safe), integrity checksums
- Executor: MatchExecutor interface, MatchRunner adapter, in-memory mock
- Manager: TournamentManager API (create, registerTeam, submitBot, startRound, recordResult, getStandings, getMatches, getTeam, getBotVersion, getStatus, getCompleted, finalize, cancel, delete)
- Integration: Full tournament lifecycle (teams → bots → matches → standings → finalize)
- 103 tournament tests pass

### ✅ Phase 5: Bot Execution Isolation & Security Hardening (Hoàn thành)
- BotExecutor interface with pluggable backends
- ChildProcessExecutor: enhanced child_process with env sanitization, stdout/stderr limits, process tree killing (taskkill on Windows)
- DockerExecutor: implemented with --network=none, --read-only, --tmpfs, --security-opt=no-new-privileges, --cap-drop=ALL (requires Docker)
- BotRunnerAdapter: backward compatibility with legacy BotRunner
- Factory with auto-detection (Docker first, fallback to child-process)
- MatchRunner updated to accept BotExecutor
- Security tests: 17 tests covering environment isolation, resource limits, process isolation, input validation, cancellation
- Tournament persistence Windows EPERM race condition fixed
- 334 total tests pass, TypeScript build succeeds

### ✅ Phase 6: Web Interface (MVP) (Hoàn thành)
- Bảng điều khiển (Dashboard) hiển thị thống kê hệ thống (hàng đợi, số lượng bot/giải đấu).
- Quản lý Bot: Đăng ký bot mới với lệnh chạy cục bộ.
- Quản lý Giải đấu: Tạo giải, đăng ký bot, sinh lịch thi đấu, chạy toàn bộ các trận đấu.
- Trình xem trận đấu & Replay: Replay viewer cho phép xem lại diễn biến chi tiết trận đấu với tính năng step-by-step.
- Backend API (Express) kết nối với Tournament Manager & Execution Queue.
- Bảo mật: Hỗ trợ cả 2 chế độ `development` và `sandbox-required`.

### ✅ Phase 7.1: Authentication & Persistent Bot Registry
- Tài khoản người dùng với bcrypt password hashing và SQLite-backed sessions.
- HttpOnly, SameSite session cookie plus per-session CSRF token for state-changing requests.
- Persistent user-owned bot registry and versioned SQLite schema initialization.
- Tournament, registration, queue, and replay endpoints enforce the authenticated tournament owner.
- The SPA restores sessions through `/api/auth/me` and provides login, registration, and logout flows.

For production, set `NODE_ENV=production` and `EXECUTION_POLICY=sandbox-required`, configure `CORS_ORIGIN` only when a separate trusted frontend origin is required, and provide Docker for the sandbox-required execution policy. Local bot source paths are not uploaded or built in this phase.

Existing tournament JSON files created before ownership metadata was introduced are intentionally private-by-default and are not visible through the API until an operator assigns ownership as part of a controlled migration. No legacy in-memory bot registry is imported; bots must be registered by an authenticated user.

### Phase 7.2 operations

The SQLite schema is initialized transactionally and rejects database files with a
newer schema version than this server supports. Offline backups can be created from
the database layer with `backupDatabase()`; the destination must not already exist
and is integrity-checked before it is accepted. Restore is intentionally offline:
stop the server, close all database handles, validate the backup, then call
`restoreDatabase(backupPath, targetPath)`. The current database is retained as a
`*.pre-restore-<id>.bak` file so an operator can roll back.

Legacy tournament ownership is never guessed or claimed by a user. Prepare a
trusted JSON mapping of tournament IDs to existing user IDs and run a dry run:

```bash
npx tsx server/migrate-ownership.ts data/tournaments owners.json data/arena.sqlite
```

Review the JSON report, then repeat with `--apply`. Each migrated file is preserved
as a unique `.bak` file, malformed files and unknown owners are reported without
being changed, and rerunning the command is idempotent. Tournaments without an
explicit valid mapping remain inaccessible.

Tournament JSON and match/replay files are written with validated identifiers,
unique temporary files, and per-resource serialization. SQLite and filesystem
updates are separate stores and are not one atomic transaction; operators should
use the reports and backups to reconcile an interrupted multi-step operation.

## 3. Kiến trúc hiện tại

```
OTT Code Arena
├── engine/              # Pure game logic - no I/O
├── bot-protocol/        # Versioned bot I/O schema
├── bot-runner/          # Process execution & isolation (legacy)
├── bot-executor/        # Pluggable execution backends & Queue & Audit Logging
├── match-runner/        # Match orchestration
├── tournament/          # Tournament Manager & Persistence
├── server/              # Express API Server (Phase 6)
│   └── index.ts         # REST API for tournaments, bots, replays
├── examples/            # Example bots
├── tests/                # 438 automated tests (421 passed, 17 Docker-skipped)
├── index.html           # Web Interface SPA Entry (Phase 6)
├── app.js               # Web Interface Logic (Phase 6)
├── style.css            # Web Interface Styles (Phase 6)
└── docs/                # Architecture & guides
```

## 4. Luật chơi OTTv2 (Đã implement)

- **Bàn cờ**: 9×9, tọa độ a1-i9 (internal 0-8)
- **Quân**: Mỗi người 9 quân (3 dam, 3 la, 3 keo)
- **Di chuyển**: 1 ô theo 8 hướng (như vua cờ vua)
- **Ăn quân**: Dam→Keo, Keo→La, La→Dam (không ăn cùng loại, không ăn đồng minh)
- **Thắng**: Đối thủ mất hết 1 loại quân HOẶC quân tới a1/i9
- **Hòa**: 200 lượt, lặp 3 lần vị trí, vật liệu không đủ
- **Luật xử lý lỗi bot**: Thua ngay (forfeit) khi timeout, crash, invalid JSON, illegal move

### Chạy thử nhanh

#### Build
```bash
npm install
npm run build
```

#### Chạy tests
```bash
npm test
# 438 tests: 421 passed + 17 skipped when Docker is unavailable
```

#### Khởi chạy Web Interface (MVP)
```bash
node dist/server/index.js
# Truy cập: http://localhost:3000
```
Từ giao diện web, bạn có thể tạo giải đấu, đăng ký bot (VD: mẫu có sẵn là `sample-bot` và `random-bot`), sinh lịch thi đấu, chạy các trận đấu và xem Replay.

#### Chạy bot mẫu (first-move strategy)
```bash
echo '{"protocol_version":"0.1.0","match_id":"test","turn":1,"player":"A","board_size":9,"pieces":[{"id":"A-dam-1","type":"dam","player":"A","pos":"c1"},{"id":"A-la-1","type":"la","player":"A","pos":"f1"},{"id":"A-keo-1","type":"keo","player":"A","pos":"i1"},{"id":"B-dam-1","type":"dam","player":"B","pos":"g9"},{"id":"B-la-1","type":"la","player":"B","pos":"d9"},{"id":"B-keo-1","type":"keo","player":"B","pos":"a9"}],"legal_moves":[{"piece_id":"A-dam-1","from":"c1","to":"c2","captures":null},{"piece_id":"A-dam-1","from":"c1","to":"b2","captures":null},{"piece_id":"A-dam-1","from":"c1","to":"d2","captures":"B-keo-1"}]}' | npx tsx examples/sample-bot/index.ts
```

Output:
```json
{"move":{"piece_id":"A-dam-1","from":"c1","to":"c2"}}
```

#### Chạy trận đấu thật giữa 2 bot (using Phase 5 BotExecutor)
```bash
node -e "
import { createMatchRunner } from './dist/match-runner/index.js';
import { createExecutor } from './dist/bot-executor/index.js';

// Create secure bot executor (Phase 5)
const executor = await createExecutor();

const playerA = { botId: 'sample-bot', player: 'A' as const, command: 'node', args: ['dist/examples/sample-bot/index.js'] };
const playerB = { botId: 'random-bot', player: 'B' as const, command: 'node', args: ['dist/examples/random-bot/index.js'] };

const runner = createMatchRunner({ matchId: 'local-1', maxTurns: 200 }, playerA, playerB, executor);
const result = await runner.run();
console.log('Winner:', result.winner, '| Reason:', result.terminationReason, '| Turns:', result.turnCount);
" 2>&1
```

#### Chạy với tsx (hot reload cho development)
```bash
npm run dev
# Runs examples/sample-bot with tsx watch
```

#### Tạo Tournament Manager (Phase 4 & 5.1)
```bash
node -e "
import { createTournamentManager } from './dist/tournament/index.js';
import * as fs from 'fs/promises';

const storageDir = './temp-tournament-' + Date.now();
await fs.mkdir(storageDir, { recursive: true });

// Development mode (uses ChildProcessExecutor, fallback if Docker unavailable)
const manager = await createTournamentManager(storageDir, undefined, 'development');

await manager.createTournament('demo-tournament', 'Demo Tournament', 'single_round_robin');
await manager.registerParticipant('demo-tournament', 'team-a', 'Team A', { botId: 'sample-bot', command: 'node', args: ['dist/examples/sample-bot/index.js'] });
await manager.registerParticipant('demo-tournament', 'team-b', 'Team B', { botId: 'random-bot', command: 'node', args: ['dist/examples/random-bot/index.js'] });
await manager.openRegistration('demo-tournament');
await manager.closeRegistration('demo-tournament');
await manager.generateSchedule('demo-tournament');
await manager.startTournament('demo-tournament');
const result = await manager.runAllMatches('demo-tournament');

console.log('Matches run:', result.data?.length);
console.log('Standings:', await manager.getStandings('demo-tournament'));

const tournament = await manager.loadTournament('demo-tournament');
console.log('Tournament Status:', tournament.data?.status);

// For production with untrusted bots, use sandbox-required mode (requires Docker):
// const manager = await createTournamentManager(storageDir, undefined, 'sandbox-required');

await fs.rm(storageDir, { recursive: true, force: true });
" 2>&1
```

## 6. Cấu hình trận đấu

```typescript
const config = {
  matchId: 'match-001',
  protocolVersion: '0.1.0',
  maxTurns: 200,
  turnTimeoutMs: 2000,
  maxStdoutBytes: 1024 * 1024,    // 1MB
  maxStderrBytes: 10 * 1024 * 1024, // 10MB
  failurePolicy: 'forfeit',        // 'forfeit' | 'skip_turn' | 'retry_once'
  maxRetries: 0,
  logRequests: true,
  logResponses: true,
  logStates: false,
};
```

## 7. Viết bot mới

Bot phải:
1. Đọc 1 JSON object từ stdin
2. Ghi 1 JSON response ra stdout: `{ "move": { "piece_id": "...", "from": "...", "to": "..." } }`
3. Ghi log/chẩn đoán ra stderr
4. Exit code 0 = thành công, non-zero = lỗi

Ví dụ Python:
```python
import json, sys

def main():
    request = json.loads(sys.stdin.read())
    move = request["legal_moves"][0]
    response = {
        "move": {
            "piece_id": move["piece_id"],
            "from": move["from"],
            "to": move["to"]
        }
    }
    print(json.dumps(response), flush=True)

if __name__ == "__main__":
    main()
```

## 8. Tài liệu chi tiết

- [Game Rules](docs/game-rules.md)
- [Bot Protocol v0.1.0](docs/bot-protocol.md)
- [Architecture](docs/architecture.md)
- [Match Runner](docs/match-runner.md)
- [Bot Executor](docs/bot-executor.md)
- [Security Model](docs/security.md)
- [Testing](docs/testing.md)

## 9. Hạn chế đã biết

1. **One process per turn** - Spawn process mới mỗi lượt, không phù hợp bot cần init tốn kém
2. **Chỉ implement `forfeit` policy** - `skip_turn` và `retry_once` chưa có
3. **No concurrent matches** - MatchRunner chạy tuần tự
4. **Memory logging** - Log toàn bộ trong RAM, match lớn có thể OOM
5. **Docker not available in dev** - DockerExecutor implemented but not verified in dev environment (17 integration tests skipped)
6. **ChildProcessExecutor is not a sandbox** - Only provides env sanitization, output limits, timeout; no CPU/memory/process/file/network isolation

## 10. Công nghệ

- **Language**: TypeScript (ES Modules)
- **Runtime**: Node.js 20+
- **Testing**: Vitest
- **Build**: tsc
- **Process**: child_process (development), Docker containers (production)

## 11. Phase 5.1 Security Policy

### Execution Policies

- **development**: Uses ChildProcessExecutor (allows fallback when Docker unavailable). Suitable for trusted local bots.
- **sandbox-required**: Requires DockerExecutor. Fails closed if Docker unavailable. For untrusted bot submissions.

Server startup configuration is explicit in production:

- `NODE_ENV=production` must be paired with `EXECUTION_POLICY=sandbox-required`.
- `EXECUTION_POLICY=development` is rejected in production.
- `NODE_ENV` accepts `development`, `test`, or `production`; invalid values are rejected.
- `NODE_ENV` or `EXECUTION_POLICY` must be explicitly configured; an entirely unconfigured server refuses to start.
- Local development must use `NODE_ENV=development` and `EXECUTION_POLICY=development`.
- Tests use `NODE_ENV=test` through the Vitest setup.
- If sandbox initialization fails under `sandbox-required`, startup fails and the server does not listen.

```typescript
// Development mode - configure this explicitly
const executor = await createExecutor({
  childProcessConfig: { executionPolicy: 'development' }
});

// Production mode - fails if Docker not available
const executor = await createExecutor({
  childProcessConfig: { executionPolicy: 'sandbox-required' }
});

// Tournament Manager with explicit policy
const manager = await createTournamentManager(storageDir, undefined, 'sandbox-required');
```

Production launch:

```bash
NODE_ENV=production EXECUTION_POLICY=sandbox-required node dist/server/index.js
```

Local development launch:

```bash
NODE_ENV=development EXECUTION_POLICY=development node dist/server/index.js
```

On Windows PowerShell, set the variables before launching:

```powershell
$env:NODE_ENV = 'development'
$env:EXECUTION_POLICY = 'development'
node dist/server/index.js
```

### DockerExecutor Security Configuration (Verified via Static Analysis)

| Flag | Purpose | Verified |
|------|---------|----------|
| `--network=none` | Network isolation | Static ✅ |
| `--read-only` | Read-only root filesystem | Static ✅ |
| `--tmpfs=/tmp:rw,noexec,nosuid,size=10m` | Limited writable temp | Static ✅ |
| `--security-opt=no-new-privileges:true` | Prevent privilege escalation | Static ✅ |
| `--cap-drop=ALL` | Drop all Linux capabilities | Static ✅ |
| `--memory=256m` | Memory limit | Static ✅ |
| `--cpus=1` | CPU limit | Static ✅ |
| `--pids-limit=64` | Process limit | Static ✅ |
| `--rm` | Auto-cleanup | Static ✅ |
| No `--privileged` | No privileged mode | Static ✅ |
| No Docker socket mount | No host Docker access | Static ✅ |

### Verified in Current Environment (ChildProcessExecutor)

- ✅ Environment variable sanitization (allowlist + BOT_ prefix)
- ✅ Stdout/stderr size limits with stream truncation
- ✅ Timeout enforcement with process tree killing (taskkill on Windows)
- ✅ Bot response validation (JSON schema, coordinates, move structure)
- ✅ Manual termination support
- ✅ Parallel execution without resource leaks

### Requires Docker Runtime (Not Verified)

- ❌ CPU limit enforcement
- ❌ Memory limit enforcement
- ❌ Process count limit enforcement
- ❌ Network isolation
- ❌ Filesystem isolation
- ❌ Capability dropping
- ❌ No-new-privileges enforcement
