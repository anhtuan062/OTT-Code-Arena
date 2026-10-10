# Data Model

## Entities

### User / Contestant
```typescript
interface Contestant {
  id: string;           // UUID
  name: string;         // Display name
  email: string;        // Contact
  team_id: string | null;
  created_at: string;   // ISO 8601
}
```

### Team
```typescript
interface Team {
  id: string;           // UUID
  name: string;
  members: string[];    // Contestant IDs
  created_at: string;
}
```

### Bot Submission
```typescript
interface BotSubmission {
  id: string;                    // UUID
  team_id: string;
  version: number;               // Incrementing
  language: string;              // e.g., "python3", "nodejs"
  source_hash: string;           // SHA256 of source
  executable_path: string;       // Path to runnable
  protocol_version: string;      // e.g., "0.1.0"
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  approved_at: string | null;
}
```

### Tournament
```typescript
interface Tournament {
  id: string;                    // UUID
  name: string;
  format: "round_robin" | "swiss" | "elimination";
  status: "draft" | "registration" | "running" | "completed";
  rules_version: string;         // Game rules version
  engine_version: string;        // Engine version
  bot_protocol_version: string;
  max_turns: number;
  turn_timeout_ms: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}
```

### Match
```typescript
interface Match {
  id: string;                    // UUID
  tournament_id: string;
  round: number;
  board: number;                 // For arena mode
  player_a_bot_id: string;
  player_b_bot_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  result: MatchResult | null;
  started_at: string | null;
  completed_at: string | null;
}
```

### Match Result
```typescript
interface MatchResult {
  winner: "A" | "B" | "draw";
  reason: "type_elimination" | "goal_reached" | "timeout" | "crash" | "invalid_move" | "turn_limit" | "repetition" | "agreed_draw";
  turns: number;
  final_state: GameState;        // Full board state
  log: TurnLog[];                // Complete move history
  player_a: PlayerMatchStats;
  player_b: PlayerMatchStats;
}

interface PlayerMatchStats {
  bot_id: string;
  time_used_ms: number;
  max_turn_time_ms: number;
  errors: string[];
}
```

### Turn Log
```typescript
interface TurnLog {
  turn: number;
  player: "A" | "B";
  move: {
    piece_id: string;
    from: string;
    to: string;
    captures: string | null;
  };
  state_after: GameState;        // Optional: full state or diff
  duration_ms: number;
  bot_stdout: string;
  bot_stderr: string;
  bot_exit_code: number;
}
```

### Game State (Engine)
```typescript
interface GameState {
  board_size: 9;
  current_player: "A" | "B";
  turn: number;
  pieces: Piece[];
  status: "playing" | "finished";
  winner: "A" | "B" | null;
  win_reason: string | null;
}

interface Piece {
  id: string;
  type: "dam" | "la" | "keo";
  player: "A" | "B";
  row: number;    // 0-8
  col: number;    // 0-8
}
```

### Tournament Standing
```typescript
interface Standing {
  tournament_id: string;
  team_id: string;
  bot_id: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;           // Win=3, Draw=1, Loss=0 (configurable)
  buchholz: number;         // Tie-break: sum of opponents' points
  sonneborn_berger: number; // Tie-break
  rank: number | null;
}
```

## Relationships
- Tournament 1:N Match
- Match 2:1 BotSubmission (player A, player B)
- BotSubmission N:1 Team
- Team 1:N Contestant
- Tournament 1:N Standing

## Persistence
- MVP: JSON files in `data/` directory
- Production: PostgreSQL with Prisma/Drizzle
- All match logs stored for replay