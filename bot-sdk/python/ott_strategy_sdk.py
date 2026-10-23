"""OTT Strategy SDK 1.0.0. Platform-owned and mounted read-only."""
from dataclasses import dataclass
from typing import Callable, Optional, Sequence

SDK_VERSION = "1.0.0"

@dataclass(frozen=True)
class Move:
    piece_id: str
    from_position: str
    to: str
    captures: Optional[str] = None

@dataclass(frozen=True)
class Piece:
    id: str
    type: str
    player: str
    pos: str

@dataclass(frozen=True)
class GameState:
    protocol_version: str
    match_id: str
    turn: int
    player: str
    board_size: int
    pieces: tuple[Piece, ...]
    conversion: bool = False

def run_strategy(choose_move: Callable[[GameState, Sequence[Move]], Move]) -> int:
    import json
    import sys

    try:
        request = json.load(sys.stdin)
        if request.get("protocol_version") != "0.1.0":
            raise ValueError("unsupported protocol version")
        if request.get("board_size") != 9 or request.get("player") not in ("A", "B"):
            raise ValueError("invalid game state")
        pieces = tuple(Piece(p["id"], p["type"], p["player"], p["pos"]) for p in request["pieces"])
        legal = tuple(Move(m["piece_id"], m["from"], m["to"], m.get("captures")) for m in request["legal_moves"])
        if not legal:
            raise ValueError("no legal move")
        conversion = bool(request.get("rules", {}).get("conversion", False))
        state = GameState(request["protocol_version"], request["match_id"], request["turn"], request["player"], request["board_size"], pieces, conversion)
        selected = choose_move(state, legal)
        if not isinstance(selected, Move):
            raise ValueError("strategy must return Move")
        if not any((m.piece_id, m.from_position, m.to) == (selected.piece_id, selected.from_position, selected.to) for m in legal):
            raise ValueError("strategy selected an illegal move")
        json.dump({"move": {"piece_id": selected.piece_id, "from": selected.from_position, "to": selected.to}}, sys.stdout, separators=(",", ":"))
        sys.stdout.write("\n")
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1
