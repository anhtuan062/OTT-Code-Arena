#pragma once

// OTT Strategy SDK 1.0.0. This file is platform-owned and must be mounted
// read-only. Competitors implement only chooseMove(...).
#include <algorithm>
#include <cctype>
#include <functional>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace ott {

struct Move {
    std::string piece_id;
    std::string from;
    std::string to;
    std::string captures;
    bool has_capture = false;
};

struct Piece {
    std::string id;
    std::string type;
    char player = 0;
    std::string pos;
};

struct GameState {
    std::string protocol_version;
    std::string match_id;
    int turn = 0;
    char player = 0;
    int board_size = 0;
    std::vector<Piece> pieces;
    bool conversion = false;
};

namespace detail {

inline std::string field(const std::string& text, const std::string& key, std::size_t start = 0) {
    const std::string marker = "\"" + key + "\"";
    const auto key_pos = text.find(marker, start);
    if (key_pos == std::string::npos) return {};
    const auto colon = text.find(':', key_pos + marker.size());
    if (colon == std::string::npos) return {};
    std::size_t pos = colon + 1;
    while (pos < text.size() && std::isspace(static_cast<unsigned char>(text[pos]))) ++pos;
    if (pos >= text.size() || text[pos] != '"') return {};
    ++pos;
    std::string result;
    while (pos < text.size()) {
        if (text[pos] == '\\' && pos + 1 < text.size()) {
            result.push_back(text[pos + 1]);
            pos += 2;
        } else if (text[pos] == '"') {
            return result;
        } else {
            result.push_back(text[pos++]);
        }
    }
    return {};
}

inline int integerField(const std::string& text, const std::string& key) {
    const std::string marker = "\"" + key + "\"";
    const auto key_pos = text.find(marker);
    if (key_pos == std::string::npos) return 0;
    const auto colon = text.find(':', key_pos + marker.size());
    if (colon == std::string::npos) return 0;
    try { return std::stoi(text.substr(colon + 1)); } catch (...) { return 0; }
}

inline std::string arrayBody(const std::string& text, const std::string& key) {
    const auto key_pos = text.find("\"" + key + "\"");
    if (key_pos == std::string::npos) return {};
    const auto open = text.find('[', key_pos);
    if (open == std::string::npos) return {};
    bool quoted = false;
    int depth = 0;
    for (std::size_t i = open; i < text.size(); ++i) {
        if (text[i] == '"' && (i == 0 || text[i - 1] != '\\')) quoted = !quoted;
        if (quoted) continue;
        if (text[i] == '[') ++depth;
        if (text[i] == ']' && --depth == 0) return text.substr(open + 1, i - open - 1);
    }
    return {};
}

inline std::vector<std::string> objects(const std::string& array) {
    std::vector<std::string> result;
    std::size_t start = std::string::npos;
    bool quoted = false;
    int depth = 0;
    for (std::size_t i = 0; i < array.size(); ++i) {
        if (array[i] == '"' && (i == 0 || array[i - 1] != '\\')) quoted = !quoted;
        if (quoted) continue;
        if (array[i] == '{') { if (depth++ == 0) start = i; }
        if (array[i] == '}' && depth > 0 && --depth == 0 && start != std::string::npos) {
            result.push_back(array.substr(start, i - start + 1));
            start = std::string::npos;
        }
    }
    return result;
}

inline bool sameMove(const Move& a, const Move& b) {
    return a.piece_id == b.piece_id && a.from == b.from && a.to == b.to;
}

inline bool nonNullField(const std::string& object, const std::string& key) {
    const auto key_pos = object.find("\"" + key + "\"");
    if (key_pos == std::string::npos) return false;
    const auto colon = object.find(':', key_pos);
    if (colon == std::string::npos) return false;
    std::size_t pos = colon + 1;
    while (pos < object.size() && std::isspace(static_cast<unsigned char>(object[pos]))) ++pos;
    return object.compare(pos, 4, "null") != 0;
}

inline std::string escape(const std::string& value) {
    std::string out;
    for (char c : value) {
        if (c == '\\' || c == '"') out.push_back('\\');
        out.push_back(c);
    }
    return out;
}

} // namespace detail

template <typename Strategy>
int run(Strategy choose_move) {
    const std::string input((std::istreambuf_iterator<char>(std::cin)), {});
    GameState state;
    state.protocol_version = detail::field(input, "protocol_version");
    state.match_id = detail::field(input, "match_id");
    state.turn = detail::integerField(input, "turn");
    const std::string player = detail::field(input, "player");
    state.player = player.size() == 1 ? player[0] : 0;
    state.board_size = detail::integerField(input, "board_size");
    state.conversion = input.find("\"rules\":{\"conversion\":true") != std::string::npos;
    if (state.protocol_version != "0.1.0" || state.match_id.empty() ||
        (state.player != 'A' && state.player != 'B') || state.board_size != 9 || state.turn < 1) {
        std::cerr << "invalid game state\n";
        return 1;
    }

    for (const auto& object : detail::objects(detail::arrayBody(input, "pieces"))) {
        Piece piece;
        piece.id = detail::field(object, "id");
        piece.type = detail::field(object, "type");
        const std::string owner = detail::field(object, "player");
        piece.player = owner.size() == 1 ? owner[0] : 0;
        piece.pos = detail::field(object, "pos");
        if (!piece.id.empty() && !piece.type.empty() && piece.pos.size() == 2 &&
            (piece.player == 'A' || piece.player == 'B')) state.pieces.push_back(piece);
    }

    std::vector<Move> legal_moves;
    for (const auto& object : detail::objects(detail::arrayBody(input, "legal_moves"))) {
        Move move;
        move.piece_id = detail::field(object, "piece_id");
        move.from = detail::field(object, "from");
        move.to = detail::field(object, "to");
        move.captures = detail::field(object, "captures");
        move.has_capture = detail::nonNullField(object, "captures");
        if (!move.piece_id.empty() && move.from.size() == 2 && move.to.size() == 2) legal_moves.push_back(move);
    }

    if (legal_moves.empty()) {
        // MatchRunner resolves no-legal-move turns before invoking a Bot.
        std::cerr << "no legal move\n";
        return 1;
    }

    const Move selected = choose_move(state, legal_moves);
    const auto legal = std::find_if(legal_moves.begin(), legal_moves.end(), [&](const Move& move) {
        return detail::sameMove(move, selected);
    });
    if (legal == legal_moves.end()) {
        std::cerr << "strategy selected an illegal move\n";
        return 1;
    }

    std::cout << "{\"move\":{\"piece_id\":\"" << detail::escape(selected.piece_id)
              << "\",\"from\":\"" << detail::escape(selected.from)
              << "\",\"to\":\"" << detail::escape(selected.to) << "\"}}\n";
    return 0;
}

} // namespace ott

using ott::GameState;
using ott::Move;
using ott::Piece;
