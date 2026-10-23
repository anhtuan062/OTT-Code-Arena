from ott_strategy_sdk import Move, GameState

# Strategy SDK 1.0.0. The platform supplies frozen dataclasses:
# Move: piece_id, from_position, to, captures.
# Piece: id, type (dam/la/keo), player (A/B), pos.
# GameState: protocol_version, match_id, turn, player, board_size, pieces, conversion.
# Implement only choose_move; the platform validates the returned legal move.
def choose_move(state: GameState, legal_moves: list[Move]) -> Move:
    # legal_moves is authoritative and contains only legal choices.
    return legal_moves[0]

