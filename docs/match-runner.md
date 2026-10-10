# Match Runner

## Overview
The Match Runner orchestrates a complete match between two bots. It manages the game loop, communicates with bots via the Bot Protocol, applies moves through the Game Engine, and records the match for replay.

## Architecture

```
Match Runner
├── Game Engine (pure logic)
├── Bot Runner (process execution)
└── Protocol Adapter (serialize/parse)
```

## Match Lifecycle

1. **Initialization**
   - Create GameEngine with match configuration
   - Create BotRunner with resource limits
   - Register two bot definitions (player A and B)

2. **Turn Loop** (repeated until game ends)
   - Get current state from GameEngine
   - Check turn limit
   - Generate legal moves from GameEngine
   - Construct Bot Protocol request
   - Invoke bot process via BotRunner
   - Parse and validate bot response
   - Validate move with GameEngine
   - Apply move through GameEngine
   - Record turn log
   - Check win/draw conditions

3. **Termination**
   - Determine winner and reason
   - Create MatchResult with full log
   - Optionally create MatchReplay

## Bot Process Lifecycle

For each turn, the Match Runner:
1. Spawns the bot process (one process per turn)
2. Writes JSON request to stdin
3. Reads JSON response from stdout
4. Captures stderr for diagnostics
5. Enforces timeout (default 2000ms)
6. Enforces stdout/stderr size limits
7. Terminates process after response
8. Cleans up child process

**Note**: Current implementation uses one process per turn. This is simpler but less efficient than keeping a persistent process. A future optimization could implement persistent bot processes with JSON Lines framing.

## Failure and Timeout Policies

| Failure Type | Detection | Termination Reason | Default Action |
|--------------|-----------|-------------------|----------------|
| Timeout | Bot exceeds `turnTimeoutMs` | `bot_timeout` | Forfeit (opponent wins) |
| Process Crash | Non-zero exit code | `bot_crash` | Forfeit |
| Invalid JSON | JSON.parse fails | `bot_invalid_json` | Forfeit |
| Invalid Response | Missing/invalid fields | `bot_invalid_response` | Forfeit |
| Empty Output | No stdout | `bot_empty_output` | Forfeit |
| Illegal Move | Engine rejects move | `bot_illegal_move` | Forfeit |

### Configurable Policies
- `failurePolicy`: `'forfeit'` | `'skip_turn'` | `'retry_once'` (currently only `'forfeit'` implemented)
- `maxRetries`: Number of retries for transient failures (default 0)
- `turnTimeoutMs`: Per-turn timeout in milliseconds (default 2000)
- `maxStdoutBytes`: Maximum stdout capture (default 1MB)
- `maxStderrBytes`: Maximum stderr capture (default 10MB)

## Result and Replay Schemas

### MatchResult
```typescript
interface MatchResult {
  matchId: string;
  protocolVersion: string;
  status: 'finished';
  winner: 'A' | 'B' | 'draw' | null;
  terminationReason: TerminationReason | null;
  turnCount: number;
  startTime: string;        // ISO 8601
  endTime: string;          // ISO 8601
  durationMs: number;
  playerA: BotDefinition;
  playerB: BotDefinition;
  finalState: GameState;
  turnLog: TurnLog[];
  metadata?: Record<string, unknown>;
}
```

### TurnLog
```typescript
interface TurnLog {
  turn: number;
  player: 'A' | 'B';
  timestamp: string;
  request?: BotRequest;           // If logRequests=true
  response?: BotResult;           // If logResponses=true
  appliedMove?: {
    pieceId: string;
    from: { row: number; col: number };
    to: { row: number; col: number };
    captures: string | null;
  };
  resultingState?: GameState;     // If logStates=true
  engineResult?: ApplyResult;
  error?: BotError;
}
```

### MatchReplay
```typescript
interface MatchReplay {
  matchId: string;
  protocolVersion: string;
  initialState: GameState;
  moves: Array<{
    turn: number;
    player: 'A' | 'B';
    pieceId: string;
    from: { row: number; col: number };
    to: { row: number; col: number };
    captures: string | null;
    timestamp: string;
  }>;
  finalState: GameState;
  winner: 'A' | 'B' | 'draw' | null;
  terminationReason: TerminationReason | null;
}
```

## Security Limitations

- **No sandboxing**: Bots run as child processes with same privileges as parent
- **Trusted bots only**: Do not run untrusted submissions in this MVP
- **Resource limits**: Only timeout and output size limits enforced
- **No network isolation**: Bots can make network requests
- **No filesystem isolation**: Bots can read/write files

For production use with untrusted bots, implement proper isolation (containers, gVisor, etc.).

## Running a Local Match

### Prerequisites
```bash
npm run build
```

### Run a match between two example bots
```bash
node -e "
import { MatchRunner, createMatchRunner } from './dist/match-runner/index.js';

const playerA = {
  botId: 'sample-bot',
  player: 'A' as const,
  command: 'node',
  args: ['dist/examples/sample-bot/index.js'],
};

const playerB = {
  botId: 'random-bot',
  player: 'B' as const,
  command: 'node',
  args: ['dist/examples/random-bot/index.js'],
};

const runner = createMatchRunner({
  matchId: 'local-match-1',
  maxTurns: 200,
  turnTimeoutMs: 2000,
}, playerA, playerB);

const result = await runner.run();
console.log('Winner:', result.winner);
console.log('Reason:', result.terminationReason);
console.log('Turns:', result.turnCount);
console.log('Duration:', result.durationMs, 'ms');
" 2>&1
```

### Expected Output
```
Winner: A
Reason: type_elimination
Turns: 47
Duration: 1234 ms
```

## Adding a New Bot Command

1. Create a bot executable that:
   - Reads JSON request from stdin
   - Writes JSON response to stdout
   - Writes diagnostics to stderr
   - Exits with code 0 on success, non-zero on error

2. Register in match configuration:
```typescript
const myBot: BotDefinition = {
  botId: 'my-bot-v1',
  player: 'A',
  command: '/path/to/my-bot',
  args: ['--config', 'config.json'],
  env: { MY_BOT_SETTING: 'value' },
};
```

## Known Limitations

1. **One process per turn**: Spawns new process each turn; not suitable for bots with expensive initialization
2. **No persistent processes**: Cannot maintain state between turns in bot process
3. **Limited failure policies**: Only `forfeit` implemented; `skip_turn` and `retry_once` not yet implemented
4. **No draw by repetition in match runner**: Relies on GameEngine's `checkGameOver()` which uses position history
5. **No concurrent matches**: MatchRunner runs one match at a time
6. **No bot versioning in result**: MatchResult doesn't store bot version/commit hash
7. **Replay initialState**: Currently uses first turn's resultingState as initialState; should store actual initial state
8. **No streaming logs**: All logs stored in memory; large matches could use significant memory

## Unresolved Decisions

- [ ] Persistent bot processes vs. per-turn processes
- [ ] Full failure policy implementation (skip_turn, retry_once)
- [ ] Draw by repetition handling in match runner
- [ ] Concurrent match execution
- [ ] Bot version tracking in results
- [ ] Streaming/incremental log storage
- [ ] Proper sandboxing for untrusted bots