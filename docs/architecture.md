# OTT Code Arena Architecture

## Overview
Modular monolith separating game logic from execution, networking, and UI.

## Module Boundaries

```
ott-code-arena/
├── engine/              # Pure game logic - no I/O, no dependencies
│   ├── types.ts         # Type definitions
│   ├── state.ts         # Game state management
│   ├── moves.ts         # Move generation & validation
│   ├── apply.ts         # Move application
│   ├── win.ts           # Win/draw detection
│   └── index.ts         # Public API
├── bot-protocol/        # Versioned bot I/O schema
│   ├── schema.ts        # Request/response types
│   ├── serialize.ts     # State → bot input
│   ├── parse.ts         # Bot output → move
│   └── index.ts
├── bot-runner/          # Process execution & isolation
│   ├── runner.ts        # Spawn, timeout, capture
│   ├── limits.ts        # Resource limits
│   └── index.ts
├── match-runner/        # Match orchestration
│   ├── match.ts         # Turn loop, logging
│   ├── result.ts        # Match result types
│   └── index.ts
├── tournament/          # Competition management
│   ├── types.ts
│   ├── schedule.ts
│   ├── standings.ts
│   └── index.ts
├── examples/
│   └── sample-bot/      # Reference implementation
└── tests/               # Unit & integration tests
```

## Data Flow

```
Tournament Manager
       │
       ▼
Match Runner ◄──► Game Engine (pure)
       │
       ▼
Bot Runner ◄──► Bot Process (isolated)
       │
       ▼
Protocol Adapter (serialize/parse)
```

## Key Principles

1. **Engine purity**: Game engine has zero dependencies, runs in any JS environment
2. **Protocol versioning**: Every bot message includes `protocol_version`
3. **Determinism**: Same initial state + same moves = same result
4. **Isolation**: Bot processes run with minimal privileges
5. **Auditability**: Full move log stored for every match

## Technology Choices

- **Language**: TypeScript (Node.js 20+)
- **Runtime**: Node.js for server, browser for UI
- **Testing**: Vitest
- **Build**: tsup / tsc
- **Process isolation**: Node.js `child_process` with resource limits (MVP), containers for production

## Configuration

All tunable parameters in `config/rules.json`:
- Board size
- Initial piece layout
- Win conditions
- Turn limit
- Timeout
- Resource limits