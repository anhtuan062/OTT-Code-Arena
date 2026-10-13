#include "ott_strategy_sdk.hpp"

// Strategy SDK 1.0.0. The platform defines these types in the included header:
// Move: piece_id, from, to, captures, has_capture.
// Piece: id, type (dam/la/keo), player (A/B), pos.
// GameState: protocol_version, match_id, turn, player, board_size, pieces.
// Implement only chooseMove. The platform adds the entry point and validates the result.
using namespace std;

Move chooseMove(const GameState& state, const vector<Move>& legalMoves) {
    // state.player identifies the Bot as A or B.
    // Example only: A picks the first legal move, B picks the last.
    if (state.player == 'A') return legalMoves.front();
    return legalMoves.back();
}

int main() {
    return ott::run(chooseMove);
}
