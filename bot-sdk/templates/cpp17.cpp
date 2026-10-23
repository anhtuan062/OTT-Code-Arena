// Strategy SDK 1.0.0. The platform injects the SDK header and entry point:
// Move: piece_id, from, to, captures, has_capture.
// Piece: id, type (dam/la/keo), player (A/B), pos.
// GameState: protocol_version, match_id, turn, player, board_size, pieces, conversion.
// Implement only chooseMove. The platform adds the entry point and validates the result.
Move chooseMove(const GameState& state, const std::vector<Move>& legalMoves) {
    (void)state;
    return legalMoves.front();
}
