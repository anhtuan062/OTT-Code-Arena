# OTT Strategy SDK 1.0.0

Strategy revisions are source-only. The platform supplies the trusted protocol
wrapper; competitors implement one function and do not write `main`, JSON
parsing, stdin/stdout handling, or Docker configuration.

## Engine contract

- Board: 9x9, algebraic columns `a`-`i`, rows `1`-`9`; `(row=0,col=0)` is
  `a1` and `(row=8,col=8)` is `i9`.
- Player A starts at the top and targets `i9`; Player B starts at the bottom
  and targets `a1`.
- Piece types are `dam` (Rock), `la` (Paper), and `keo` (Scissors).
- A piece moves one square in any of the eight directions.
- A capture is represented by the captured piece ID; a non-capture is `null`.
- `turn` starts at 1 and identifies the current request.
- Legal moves are supplied in authoritative engine order. The SDK does not
  reorder them.
- If there are no legal moves, MatchRunner resolves the terminal/draw state and
  does not invoke the strategy.
- MatchRunner remains authoritative and validates the selected move again.

## C++17

Implement:

```cpp
Move chooseMove(const GameState& state,
                const std::vector<Move>& legalMoves);
```

Use the starter at `bot-sdk/templates/cpp17.cpp`. `Move`, `Piece`, and
`GameState` are provided by `ott_strategy_sdk.hpp`.

## Python 3

Implement:

```python
def choose_move(state: GameState, legal_moves: list[Move]) -> Move:
    ...
```

Use the starter at `bot-sdk/templates/python3.py`. The platform runner invokes
the function and validates that the returned move is one of `legal_moves`.

## Pinning

Strategy revisions persist `executionMode=strategy`, runtime, source SHA-256,
SDK version, and SDK content digest. Existing revisions default to
`executionMode=raw` and continue to use the legacy raw-source wrapper. The
server rejects a strategy revision if its pinned SDK identity does not match
the trusted artifact selected by the execution service.
