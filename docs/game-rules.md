# OTTv2 Game Rules

## Board
- Size: 9×9
- Coordinates: `a1` through `i9` (columns a-i, rows 1-9)
- Internal representation: 0-indexed rows (0-8) and columns (0-8)
- Goal squares: `a1` (0,0) and `i9` (8,8)

## Pieces
Each player starts with 9 pieces (3 of each type):
- **Dam (Búa/Rock)**: defeats Keo
- **La (Lá/Paper)**: defeats Dam
- **Keo (Kéo/Scissors)**: defeats La

### Initial Layout (Player 1 at top/left, Player 2 at bottom/right)

**Player 1 (rows 0-2):**
| Piece | Positions (row, col) | Algebraic |
|-------|---------------------|-----------|
| Dam   | (0,2), (1,6), (2,7) | c1, g2, h3 |
| La    | (0,5), (1,8), (2,1) | f1, i2, b3 |
| Keo   | (0,8), (1,3), (2,4) | i1, d2, e3 |

**Player 2 (rows 6-8):**
| Piece | Positions (row, col) | Algebraic |
|-------|---------------------|-----------|
| Dam   | (8,6), (7,2), (6,1) | g9, c8, b7 |
| La    | (8,3), (7,0), (6,7) | d9, a8, h7 |
| Keo   | (8,0), (7,5), (6,4) | a9, f8, e7 |

## Movement
- A piece moves exactly one square in any of 8 directions (king's move in chess)
- Valid moves: (dr, dc) where dr,dc ∈ {-1,0,1} and not both 0
- Cannot move off board
- Cannot move onto own piece
- Can move to empty square OR capture enemy piece

## Capture Rules
- Can only capture enemy piece of a type that your piece defeats
- Cannot capture same type (Dam cannot capture Dam)
- Cannot capture friendly piece
- Capture relationships (rock-paper-scissors):
  - Dam (Rock) → Keo (Scissors)
  - Keo (Scissors) → La (Paper)
  - La (Paper) → Dam (Rock)

## Win Conditions
A player wins immediately when ANY of these occur:
1. **Type elimination**: Opponent has 0 pieces of any one type (Dam, La, or Keo)
2. **Goal square**: A piece reaches `a1` (0,0) or `i9` (8,8)

## Turn Order
- Player 1 moves first
- Players alternate turns
- Turn counter increments after each successful move

## Draw Conditions (Provisional - needs confirmation)
- Maximum 200 turns (configurable)
- Threefold repetition (same position with same player to move)
- Insufficient material (both players cannot win)

## Invalid Move Handling (Provisional)
- Bot loses the game immediately on invalid move
- Alternative: skip turn, log warning (needs decision)

## Timeout/Crash Handling (Provisional)
- Bot loses on timeout (>2 seconds per move, configurable)
- Bot loses on crash (non-zero exit code, stderr output)
- Match recorded as forfeit

## Unresolved Decisions (TODO)
- [ ] Are goal squares assigned to specific players or shared?
- [ ] What happens if both win conditions trigger simultaneously?
- [ ] Exact maximum turn limit
- [ ] Threefold repetition detection implementation
- [ ] Insufficient material definition
- [ ] Invalid move penalty severity
- [ ] Timeout duration
- [ ] Scoring system for tournament (win=3, draw=1, loss=0?)
- [ ] Tie-breaking rules

## Configuration
All provisional values should be configurable via a rules config object to allow easy adjustment once official rules are confirmed.