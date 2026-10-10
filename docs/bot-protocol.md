# Bot Protocol Specification

## Version
Current: `0.1.0`

## Transport
- **Model**: Request/Response per turn via stdio
- **Encoding**: UTF-8
- **Format**: Single JSON object per line (JSON Lines)
- **Direction**:
  - Engine → Bot: stdin (one JSON object)
  - Bot → Engine: stdout (one JSON object)
  - Bot → Logs: stderr (free text, ignored by engine)

## Request (Engine → Bot)

```json
{
  "protocol_version": "0.1.0",
  "match_id": "match-abc123",
  "turn": 1,
  "player": "A",
  "board_size": 9,
  "pieces": [
    {"id": "A-dam-1", "type": "dam", "player": "A", "pos": "c1"},
    {"id": "A-la-1", "type": "la", "player": "A", "pos": "f1"},
    {"id": "A-keo-1", "type": "keo", "player": "A", "pos": "i1"},
    {"id": "B-dam-1", "type": "dam", "player": "B", "pos": "g9"},
    {"id": "B-la-1", "type": "la", "player": "B", "pos": "d9"},
    {"id": "B-keo-1", "type": "keo", "player": "B", "pos": "a9"}
  ],
  "legal_moves": [
    {"piece_id": "A-dam-1", "from": "c1", "to": "c2", "captures": null},
    {"piece_id": "A-dam-1", "from": "c1", "to": "b2", "captures": null},
    {"piece_id": "A-dam-1", "from": "c1", "to": "d2", "captures": "B-keo-1"}
  ]
}
```

### Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| protocol_version | string | yes | Protocol version (must be "0.1.0") |
| match_id | string | yes | Unique match identifier |
| turn | number | yes | 1-indexed turn number |
| player | "A"\|"B" | yes | Which player the bot is |
| board_size | number | yes | Always 9 |
| pieces | Piece[] | yes | All pieces on board |
| legal_moves | MoveOption[] | yes | Pre-computed legal moves |

### Piece
| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique piece identifier (format: `{player}-{type}-{number}`) |
| type | "dam"\|"la"\|"keo" | Piece type |
| player | "A"\|"B" | Owner |
| pos | string | Algebraic position (e.g., "c1") |

### MoveOption
| Field | Type | Description |
|-------|------|-------------|
| piece_id | string | ID of piece to move |
| from | string | Source square |
| to | string | Destination square |
| captures | string\|null | Captured piece ID or null |

## Response (Bot → Engine)

```json
{
  "move": {
    "piece_id": "A-dam-1",
    "from": "c1",
    "to": "d2"
  }
}
```

### Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| move.piece_id | string | yes | Must match a legal move |
| move.from | string | yes | Source (for validation) |
| move.to | string | yes | Destination |

## Error Handling

### Bot Errors (Engine detects)
| Condition | Engine Action |
|-----------|---------------|
| Invalid JSON | Forfeit |
| Missing required field | Forfeit |
| Move not in legal_moves | Forfeit |
| Timeout (>2s default) | Forfeit |
| Non-zero exit code | Forfeit |
| stdout > 1MB | Forfeit |
| Multiple JSON lines | Forfeit (first line only) |

### Engine Errors (Bot detects)
Bot should exit with code 1 if it receives malformed input.

### Validation Error Codes
The protocol implementation returns structured error objects with the following codes:

**Request Validation:**
- `INVALID_REQUEST` - Request is not an object
- `UNSUPPORTED_VERSION` - Protocol version mismatch
- `INVALID_MATCH_ID` - match_id missing or empty
- `INVALID_TURN` - Turn must be positive integer
- `INVALID_PLAYER` - Player must be "A" or "B"
- `INVALID_BOARD_SIZE` - Board size must be 9
- `INVALID_PIECES` - Pieces must be an array
- `INVALID_PIECE` - Individual piece validation failed
- `INVALID_LEGAL_MOVES` - Legal moves must be an array
- `INVALID_LEGAL_MOVE` - Individual move option validation failed
- `INVALID_LEGAL_MOVE_PIECE` - Legal move references unknown piece
- `INVALID_LEGAL_MOVE_CAPTURE` - Legal move references unknown captured piece

**Response Validation:**
- `INVALID_RESPONSE` - Response is not an object
- `MISSING_MOVE` - Response missing move object
- `INVALID_MOVE` - Move is not an object
- `INVALID_PIECE_ID` - Piece ID format invalid
- `INVALID_FROM` - From coordinate invalid
- `INVALID_TO` - To coordinate invalid
- `INVALID_MOVE_SAME_SQUARE` - From and to are the same
- `INVALID_COORDINATES` - Coordinate parsing failed
- `INVALID_MOVE_DISTANCE` - Move distance exceeds 1 square
- `INVALID_JSON` - JSON parsing failed

## Limits (Configurable)
- **Time per move**: 2000ms
- **Max stdout**: 1MB
- **Max stderr**: 10MB (logged only)
- **Memory**: 256MB (if supported)
- **CPU**: 1 core (if supported)

## Coordinate System
- Algebraic: `a1` through `i9`
- Column: a=0, b=1, ..., i=8
- Row: 1=0, 2=1, ..., 9=8 (0-indexed internally)
- Player A starts at top (row 0), Player B at bottom (row 8)
- Goal squares: `a1` (0,0) and `i9` (8,8)

## Implementation API

### Core Functions (bot-protocol package)

```typescript
import { BotProtocol, constructBotRequest, parseBotResponse, validateBotRequest, validateBotResponse } from '@bot-protocol/index.js';
import { GameEngine } from '@engine/index.js';

// Create request from engine state
const engine = new GameEngine();
const state = engine.getState();
const legalMoves = engine.getLegalMoves();
const request = BotProtocol.createRequest('match-123', state, legalMoves);

// Parse and validate bot response
const result = BotProtocol.parseResponse(jsonString);
if (result.success) {
  const coords = BotProtocol.toEngineCoords(result.response.move);
  const applyResult = engine.makeMove(coords.pieceId, coords.toRow, coords.toCol);
}
```

### TypeScript Types
```typescript
type ProtocolVersion = '0.1.0';
type Player = 'A' | 'B';
type PieceType = 'dam' | 'la' | 'keo';

interface BotPiece {
  id: string;
  type: PieceType;
  player: Player;
  pos: string;  // Algebraic notation
}

interface BotMoveOption {
  piece_id: string;
  from: string;
  to: string;
  captures: string | null;
}

interface BotRequest {
  protocol_version: ProtocolVersion;
  match_id: string;
  turn: number;
  player: Player;
  board_size: number;
  pieces: BotPiece[];
  legal_moves: BotMoveOption[];
}

interface BotMove {
  piece_id: string;
  from: string;
  to: string;
}

interface BotResponse {
  move: BotMove;
}

interface BotError {
  code: string;
  message: string;
  details?: unknown;
}
```

## Example Bot (TypeScript)

The repository includes a runnable example bot at `examples/sample-bot/index.ts`:

```typescript
#!/usr/bin/env node
import { readFileSync } from 'fs';
import { BotProtocol } from '@bot-protocol/index.js';

function main(): void {
  const input = readFileSync(0, 'utf-8');
  if (!input.trim()) {
    console.error('Empty input');
    process.exit(1);
  }

  let request: unknown;
  try {
    request = JSON.parse(input);
  } catch (e) {
    console.error(`Invalid JSON: ${e}`);
    process.exit(1);
  }

  const validation = BotProtocol.parseResponse(JSON.stringify(request));
  if (!validation.success) {
    console.error(`Invalid request: ${validation.error.message}`);
    process.exit(1);
  }

  const req = validation.response as { legal_moves?: Array<{ piece_id: string; from: string; to: string; captures: string | null }> };

  if (!req.legal_moves || req.legal_moves.length === 0) {
    console.error('No legal moves available');
    process.exit(1);
  }

  const move = req.legal_moves[0];

  const response = {
    move: {
      piece_id: move.piece_id,
      from: move.from,
      to: move.to,
    },
  };

  console.log(JSON.stringify(response));
}

main();
```

### Running the Example Bot

```bash
# Build the project first
npm run build

# Run the bot with a sample request
echo '{"protocol_version":"0.1.0","match_id":"test","turn":1,"player":"A","board_size":9,"pieces":[{"id":"A-dam-1","type":"dam","player":"A","pos":"c1"},{"id":"A-la-1","type":"la","player":"A","pos":"f1"},{"id":"A-keo-1","type":"keo","player":"A","pos":"i1"},{"id":"B-dam-1","type":"dam","player":"B","pos":"g9"},{"id":"B-la-1","type":"la","player":"B","pos":"d9"},{"id":"B-keo-1","type":"keo","player":"B","pos":"a9"}],"legal_moves":[{"piece_id":"A-dam-1","from":"c1","to":"c2","captures":null},{"piece_id":"A-dam-1","from":"c1","to":"b2","captures":null},{"piece_id":"A-dam-1","from":"c1","to":"d2","captures":"B-keo-1"}]}' | npx tsx examples/sample-bot/index.ts
```

Expected output:
```json
{"move":{"piece_id":"A-dam-1","from":"c1","to":"c2"}}
```

### Running via npm script
```bash
npm run dev
```
This uses `tsx watch` to run the example bot with hot-reloading.

## End-to-End Example

### 1. Engine creates request
```typescript
const engine = new GameEngine();
const state = engine.getState();
const legalMoves = engine.getLegalMoves();
const request = constructBotRequest('match-123', state, legalMoves);
// Send request to bot via stdin
```

### 2. Bot receives request (stdin)
```json
{
  "protocol_version": "0.1.0",
  "match_id": "match-123",
  "turn": 1,
  "player": "A",
  "board_size": 9,
  "pieces": [...],
  "legal_moves": [
    {"piece_id": "A-dam-1", "from": "c1", "to": "c2", "captures": null},
    {"piece_id": "A-dam-1", "from": "c1", "to": "b2", "captures": null},
    {"piece_id": "A-dam-1", "from": "c1", "to": "d2", "captures": "B-keo-1"}
  ]
}
```

### 3. Bot sends response (stdout)
```json
{"move":{"piece_id":"A-dam-1","from":"c1","to":"d2"}}
```

### 4. Engine validates and applies
```typescript
const result = parseBotResponse(botOutput);
if (result.success) {
  const coords = botMoveToCoords(result.response.move);
  const applyResult = engine.makeMove(coords.pieceId, coords.toRow, coords.toCol);
  if (applyResult.success) {
    // Move applied successfully
  }
}
```

## Implementing a Bot in Another Language

The protocol is language-agnostic. A bot in any language must:

1. Read a single JSON object from stdin
2. Parse the request (validate required fields if desired)
3. Select a move from `legal_moves` (or compute one)
4. Write a single JSON response to stdout with the move
5. Write any diagnostics to stderr

### Python Example
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

### Rust Example
```rust
use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

#[derive(Deserialize)]
struct Request { legal_moves: Vec<MoveOption> }
#[derive(Deserialize)]
struct MoveOption { piece_id: String, from: String, to: String, captures: Option<String> }
#[derive(Serialize)]
struct Response { r#move: Move }
#[derive(Serialize)]
struct Move { piece_id: String, from: String, to: String }

fn main() -> io::Result<()> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let request: Request = serde_json::from_str(&input)?;
    let mv = &request.legal_moves[0];
    let response = Response { r#move: Move { piece_id: mv.piece_id.clone(), from: mv.from.clone(), to: mv.to.clone() } };
    writeln!(io::stdout(), "{}", serde_json::to_string(&response)?)?;
    Ok(())
}
```

## Testing

Run the protocol test suite:
```bash
npm test
# or specifically
npx vitest run tests/protocol
```

## Versioning Policy

- Protocol version follows semantic versioning (MAJOR.MINOR.PATCH)
- Breaking changes increment MAJOR
- Backward-compatible additions increment MINOR
- Bug fixes increment PATCH
- Bots should check `protocol_version` and exit with error if unsupported
- Engine should reject requests with unsupported versions