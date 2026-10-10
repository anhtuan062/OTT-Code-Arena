# Testing Strategy

## Test Organization

```
tests/
├── engine/
│   ├── state.test.ts
│   ├── moves.test.ts
│   ├── apply.test.ts
│   ├── win.test.ts
│   └── integration.test.ts
├── protocol/
│   ├── serialize.test.ts
│   ├── parse.test.ts
│   └── schema.test.ts
├── bot-runner/
│   ├── runner.test.ts
│   └── limits.test.ts
├── match/
│   ├── match.test.ts
│   ├── replay.test.ts
│   └── error-handling.test.ts
└── tournament/
    ├── schedule.test.ts
    └── standings.test.ts
```

## Engine Tests (Priority 1)

### State Tests
- Initial state matches specification
- Piece count: 9 per player, 3 each type
- Positions match algebraic coordinates
- Current player = A
- Turn = 1
- Status = playing

### Move Validation Tests
- All 8 directions valid from center
- Edge/corner boundary checks
- Cannot move off board
- Cannot stay in place
- Cannot move onto own piece
- Cannot capture own piece
- Cannot capture same type
- Can capture defeated type (dam→keo, keo→la, la→dam)
- Cannot capture superior type

### Move Application Tests
- Piece position updates
- Board updates (source cleared, dest set)
- Captured piece removed from pieces and board
- Turn switches to opponent
- Turn counter increments
- Last move recorded

### Win Detection Tests
- Type elimination: player loses all Dam → opponent wins
- Type elimination: player loses all La → opponent wins
- Type elimination: player loses all Keo → opponent wins
- Goal square a1 (0,0): piece reaches → player wins
- Goal square i9 (8,8): piece reaches → player wins
- Win detected immediately after move
- No further moves after win

### Draw Tests (Provisional)
- Turn limit reached → draw
- Threefold repetition → draw
- Insufficient material → draw

### Edge Cases
- Simultaneous win conditions (both type elimination and goal)
- Invalid state rejection (duplicate pieces, off-board pieces)
- State immutability (original state not modified)

## Protocol Tests

### Serialization
- Valid state → valid request JSON
- All required fields present
- Coordinates in algebraic notation
- Legal moves correctly computed
- Piece IDs stable

### Parsing
- Valid response → move object
- Missing move field → error
- Invalid piece_id → error
- Invalid coordinates → error
- Extra fields ignored (forward compatibility)

### Schema Validation
- Request matches JSON Schema
- Response matches JSON Schema
- Version field checked
- Size limits enforced

## Bot Runner Tests

### Happy Path
- Bot executes, returns valid move
- Stdout captured, parsed
- Stderr captured, logged
- Exit code 0
- Duration recorded

### Error Cases
- Timeout → forfeit, process killed
- Crash (exit code != 0) → forfeit
- Invalid JSON → forfeit
- Missing move → forfeit
- Illegal move → forfeit
- Oversized output → forfeit
- No output → forfeit
- Multiple JSON lines → first only

### Resource Limits (where supported)
- Memory limit exceeded → kill
- CPU limit exceeded → kill
- Output size limit → truncate/kill

## Match Runner Tests

### Normal Completion
- Two valid bots play to completion
- Winner correctly determined
- Full log recorded
- Result matches engine

### Error Handling
- Bot A crashes → Bot B wins
- Bot A times out → Bot B wins
- Bot A invalid move → Bot B wins
- Both crash → draw? (needs decision)
- Draw by turn limit

### Replay Consistency
- Replay from log produces same final state
- Replay from log produces same winner
- Deterministic for same inputs

## Tournament Tests

### Scheduling
- Round robin: each pair plays once
- No duplicate matches
- All teams scheduled

### Standings
- Points: Win=3, Draw=1, Loss=0
- Tie-break: Buchholz, then Sonneborn-Berger
- Rankings update after each match

## Running Tests

```bash
# All tests
npm test

# Engine only
npm test -- tests/engine

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## CI Requirements
- All tests pass on Node.js 20, 22
- Coverage > 90% for engine
- No flaky tests
- Tests run in < 30 seconds