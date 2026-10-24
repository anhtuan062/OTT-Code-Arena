const API_URL = '/api';
const STRATEGY_TEMPLATES = {
  cpp: '#include "ott_strategy_sdk.hpp"\n\n// Strategy SDK 1.0.0: GameState, Move và Piece đã được định nghĩa trong file header này.\n// Bạn chỉ cần viết chooseMove; không viết main, JSON hoặc stdin/stdout.\n//\n// struct Move {\n//     string piece_id;       // Mã quân cờ\n//     string from;           // Ô xuất phát, ví dụ: c1\n//     string to;             // Ô đích, ví dụ: d2\n//     string captures;       // Mã quân bị ăn\n//     bool has_capture;      // Có ăn quân hay không\n// };\n//\n// struct Piece {\n//     string id;              // Mã quân\n//     string type;            // dam, la hoặc keo\n//     char player;            // A hoặc B\n//     string pos;             // Vị trí, ví dụ: a1\n// };\n//\n// struct GameState {\n//     string protocol_version;\n//     string match_id;\n//     int turn;               // Bắt đầu từ 1\n//     char player;            // Bot đang được gọi: A hoặc B\n//     int board_size;         // 9\n//     vector<Piece> pieces;\n// };\n\nusing namespace std; // Dùng string, vector... mà không cần viết std::\n\nMove chooseMove(const GameState& state, const vector<Move>& legalMoves) {\n    // state.player cho biết Bot đang được gọi là A hay B.\n    // Ví dụ mẫu: A chọn nước đầu, B chọn nước cuối.\n    if (state.player == \'A\') return legalMoves.front();\n    return legalMoves.back();\n}\n',
  python3: 'from ott_strategy_sdk import Move, GameState\n\n# Strategy SDK 1.0.0: hệ thống gọi choose_move mỗi lượt.\n# Không cần viết JSON, stdin/stdout hoặc vòng lặp trận đấu.\n#\n# @dataclass(frozen=True)\n# class Move:\n#     piece_id: str       # Mã quân cờ\n#     from_position: str  # Ô xuất phát, ví dụ: c1\n#     to: str             # Ô đích, ví dụ: d2\n#     captures: str | None  # Mã quân bị ăn, None nếu không ăn\n#\n# @dataclass(frozen=True)\n# class Piece:\n#     id: str             # Mã quân\n#     type: str           # dam, la hoặc keo\n#     player: str         # A hoặc B\n#     pos: str            # Vị trí, ví dụ: a1\n#\n# @dataclass(frozen=True)\n# class GameState:\n#     protocol_version: str\n#     match_id: str\n#     turn: int           # Bắt đầu từ 1\n#     player: str         # Bot đang được gọi: A hoặc B\n#     board_size: int     # 9\n#     pieces: tuple[Piece, ...]\n\ndef choose_move(state: GameState, legal_moves: list[Move]) -> Move:\n    # legal_moves đã chỉ chứa các nước đi hợp lệ.\n    return legal_moves[0]\n',
};

const PRACTICE_SCENARIOS = {
  initial: { label: 'Bàn cờ ban đầu', help: 'Vị trí khởi đầu để kiểm tra nước đi đầu tiên.' },
  capture: { label: 'Có cơ hội ăn quân', help: 'Kiểm tra nước đi có thể ăn quân đối phương.' },
  'near-goal': { label: 'Tiến gần ô đích', help: 'Kiểm tra lựa chọn khi quân đã gần ô đích.' },
};

const STATUS_LABELS = {
  draft: 'Bản nháp',
  registration_not_open: 'Chưa mở đăng ký',
  registration_open: 'Đang mở đăng ký',
  running: 'Đang diễn ra',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã hủy',
  scheduled: 'Đang chờ',
  in_progress: 'Đang diễn ra',
  completed_match: 'Đã hoàn thành',
  failed: 'Thất bại',
  cancelled_match: 'Đã hủy',
};
STATUS_LABELS.registration_closed = '\u0110\u00e3 \u0111\u00f3ng \u0111\u0103ng k\u00fd';
STATUS_LABELS.bye = 'Mi\u1ec5n \u0111\u1ea5u';

const REASON_LABELS = {
  goal_reached: 'Đến ô đích',
  all_pieces_captured: 'Ăn hết quân đối thủ',
  bot_timeout: 'Bot quá thời gian',
  bot_compilation_failed: 'Bot biên dịch thất bại',
  bot_crash: 'Bot gặp lỗi',
  bot_invalid_json: 'Phản hồi Bot không hợp lệ',
  bot_empty_output: 'Bot không trả về dữ liệu',
  bot_illegal_move: 'Bot thực hiện nước đi không hợp lệ',
  turn_limit: 'Đạt giới hạn lượt',
  repetition: 'Thua do lặp vị trí',
  insufficient_material: 'Không đủ quân',
  agreed_draw: 'Hai bên đồng ý hòa',
};

const ACTION_LABELS = {
  open_registration: 'Mở đăng ký',
  close_registration: 'Đóng đăng ký',
  generate_schedule: 'Tạo lịch thi đấu',
  start: 'Bắt đầu giải đấu',
  start_next_stage: 'Chạy giai đoạn tiếp theo',
  run_all: 'Chạy tất cả trận đấu',
  stop_execution: 'Dừng trận đấu',
  cancel: 'Hủy giải đấu',
};

const ACTION_SUCCESS_MESSAGES = {
  open_registration: 'Đã mở đăng ký giải đấu.',
  close_registration: 'Đã đóng đăng ký giải đấu.',
  generate_schedule: 'Đã tạo lịch thi đấu.',
  start: 'Đã bắt đầu giải đấu.',
  start_next_stage: 'Đã bắt đầu giai đoạn tiếp theo.',
  run_all: 'Đã đưa các trận đấu vào hàng đợi.',
  stop_execution: 'Đã dừng thực thi trận đấu.',
  cancel: 'Đã hủy giải đấu.',
};

function localizeStatus(status) {
  const key = String(status || '').toLowerCase();
  return STATUS_LABELS[key] || key.replaceAll('_', ' ');
}

function localizeReason(reason) {
  const key = String(reason || '').toLowerCase();
  return REASON_LABELS[key] || key.replaceAll('_', ' ');
}

function actionLabel(action) { return ACTION_LABELS[action] || action; }

function localizeErrorMessage(message) {
  const value = String(message || '');
  const exact = {
    'Bot cannot be deleted while it has immutable source revisions': 'Không thể xóa Bot vì Bot đã có phiên bản mã nguồn bất biến. Hãy giữ Bot để bảo toàn lịch sử phiên bản và kết quả thi đấu.',
    'Bot cannot be deleted while its revision is referenced by a tournament': 'Không thể xóa Bot vì phiên bản của Bot đang được giải đấu tham chiếu.',
    'Cannot delete the only revision': 'Không thể xóa phiên bản duy nhất của Bot. Hãy lưu một phiên bản khác trước.',
    'Cannot delete a revision referenced by a tournament': 'Không thể xóa phiên bản đang được giải đấu tham chiếu.',
    'Authentication required': 'Vui lòng đăng nhập để tiếp tục.',
    'Invalid username or password': 'Tài khoản hoặc mật khẩu không đúng.',
    'Invalid CSRF token': 'Phiên bảo mật không hợp lệ. Vui lòng thử lại.',
    'Network error. Check your connection and try again.': 'Không thể kết nối. Hãy kiểm tra mạng và thử lại.',
    'Invalid server response.': 'Phản hồi từ máy chủ không hợp lệ.',
    'Request failed (400).': 'Yêu cầu không hợp lệ.',
    'Request failed (401).': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    'Request failed (403).': 'Bạn không có quyền thực hiện thao tác này.',
    'Request failed (404).': 'Không tìm thấy dữ liệu yêu cầu.',
    'Request failed (409).': 'Thao tác bị trùng hoặc xung đột với dữ liệu hiện tại.',
    'Request failed (429).': 'Bạn đã thực hiện quá nhiều yêu cầu. Hãy thử lại sau.',
    'Unable to load data': 'Không thể tải dữ liệu.',
  };
  if (exact[value]) return exact[value];
  if (/^Tournament .* already exists$/i.test(value)) return 'Giải đấu này đã tồn tại.';
  if (/^Cannot register:/i.test(value)) return value.replace(/^Cannot register:/i, 'Không thể đăng ký:');
  if (/^Participant .* already registered$/i.test(value)) return 'Người tham gia này đã được đăng ký.';
  if (/^Tournament .* not found$/i.test(value)) return 'Không tìm thấy giải đấu.';
  if (/^Bot .* not found$/i.test(value)) return 'Không tìm thấy Bot.';
  if (/^Invalid action$/i.test(value)) return 'Thao tác không hợp lệ.';
  if (/^Tournament execution cancelled$/i.test(value)) return 'Đã hủy thực thi giải đấu.';
  if (/^Tournament is already running$/i.test(value)) return 'Giải đấu đang được thực thi.';
  return value;
}

const PIECE_SVG_DEFINITIONS = {
  'icon-piece-dam': {
    viewBox: '0 0 260 280',
    groupAttrs: { fill: '#ffffff', stroke: '#000000', 'stroke-width': '8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    shapes: [
      { tag: 'path', attrs: { d: 'M 110,65 C 55,45 30,95 45,155 C 30,195 55,235 95,235 Z' } },
      { tag: 'path', attrs: { d: 'M 85,215 C 95,255 150,265 165,240 C 175,225 155,205 130,200 Z' } },
      { tag: 'path', attrs: { d: 'M 95,185 C 115,230 180,235 190,205 C 200,185 175,165 140,165 Z' } },
      { tag: 'path', attrs: { d: 'M 105,145 C 130,195 195,195 205,160 C 212,135 185,120 140,125 Z' } },
      { tag: 'path', attrs: { d: 'M 105,70 C 165,65 220,90 220,130 C 220,165 170,165 135,140 Z' } },
      { tag: 'path', attrs: { d: 'M 145,105 C 155,95 170,95 178,103', fill: 'none' } },
      { tag: 'path', attrs: { d: 'M 148,97 C 155,90 163,90 168,94', fill: 'none' } },
      { tag: 'path', attrs: { d: 'M 95,70 C 125,65 145,100 142,155 C 138,195 110,208 92,195 C 75,180 82,135 95,105' } },
      { tag: 'path', attrs: { d: 'M 95,105 C 82,125 78,145 84,165', fill: 'none' } },
      { tag: 'path', attrs: { d: 'M 85,90 C 82,108 85,122 89,130', fill: 'none' } },
      { tag: 'path', attrs: { d: 'M 73,102 C 75,116 80,126 85,134', fill: 'none' } },
    ],
  },
  'icon-piece-keo': {
    viewBox: '0 0 280 280',
    groupAttrs: { fill: '#ffffff', stroke: '#000000', 'stroke-width': '8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    shapes: [
      { tag: 'path', attrs: { d: 'M 140,120 L 85,220 C 72,245 92,260 112,235 L 175,145 Z' } },
      { tag: 'path', attrs: { d: 'M 110,95 L 38,175 C 20,195 40,215 65,192 L 145,125 Z' } },
      { tag: 'path', attrs: { d: 'M 105,100 C 95,75 135,25 170,22 C 192,20 202,32 205,45 C 228,38 255,58 242,98 C 232,128 215,148 195,155 Z' } },
      { tag: 'path', attrs: { d: 'M 205,115 C 218,112 226,128 220,152 C 214,172 196,172 192,152 C 188,132 195,118 205,115 Z' } },
      { tag: 'path', attrs: { d: 'M 176,112 C 192,110 200,130 194,158 C 188,182 164,182 158,158 C 154,135 162,115 176,112 Z' } },
      { tag: 'path', attrs: { d: 'M 110,95 C 122,120 162,135 172,120 C 180,108 158,95 140,92 C 165,98 182,82 184,62' } },
    ],
  },
  'icon-piece-la': {
    viewBox: '0 0 280 240',
    groupAttrs: { fill: '#ffffff', stroke: '#000000', 'stroke-width': '8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    shapes: [
      { tag: 'path', attrs: { d: 'M 165,92 C 125,88 85,88 60,92 C 38,96 35,112 45,118 C 25,122 22,140 38,148 C 20,154 22,174 42,180 C 32,192 42,212 70,215 L 165,226 C 198,230 215,212 212,175 C 235,165 245,140 230,115 C 222,102 222,88 232,70 C 242,50 228,28 205,30 C 182,32 172,58 182,78 C 186,86 178,92 165,92 Z' } },
      { tag: 'path', attrs: { d: 'M 45,118 C 70,114 100,116 125,120', fill: 'none' } },
      { tag: 'path', attrs: { d: 'M 38,148 C 65,144 95,146 115,150', fill: 'none' } },
      { tag: 'path', attrs: { d: 'M 42,180 C 65,174 90,176 112,182', fill: 'none' } },
      { tag: 'path', attrs: { d: 'M 135,108 C 120,128 112,162 112,195', fill: 'none' } },
      { tag: 'path', attrs: { d: 'M 195,90 C 165,95 155,128 178,155', fill: 'none' } },
    ],
  },
};

function appendSvgShape(parent, shape) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', shape.tag);
  Object.entries(shape.attrs).forEach(([name, value]) => element.setAttribute(name, value));
  parent.appendChild(element);
}

function icon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const pieceDefinition = PIECE_SVG_DEFINITIONS[id];
  svg.setAttribute('viewBox', pieceDefinition?.viewBox || '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ui-icon');
  if (pieceDefinition) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    Object.entries(pieceDefinition.groupAttrs || {}).forEach(([name, value]) => group.setAttribute(name, value));
    if (pieceDefinition.transform) group.setAttribute('transform', pieceDefinition.transform);
    pieceDefinition.shapes.forEach(shape => appendSvgShape(group, shape));
    svg.appendChild(group);
    return svg;
  }
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}

