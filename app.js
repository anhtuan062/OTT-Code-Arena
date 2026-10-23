/* OTT Code Arena - Consolidated Client Application Bundle */
/* Generated from modular source files in js/ */


/* ==================== MODULE: constants.js ==================== */
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
  bot_crash: 'Bot gặp lỗi',
  bot_invalid_json: 'Phản hồi Bot không hợp lệ',
  bot_empty_output: 'Bot không trả về dữ liệu',
  bot_illegal_move: 'Bot thực hiện nước đi không hợp lệ',
  turn_limit: 'Đạt giới hạn lượt',
  repetition: 'Lặp lại vị trí',
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

/* ==================== MODULE: state.js ==================== */
const state = {
  user: null,
  csrfToken: null,
  activeView: 'auth-screen',
  tournamentId: null,
  tournamentDetailSource: null,
  botWorkspaceSource: null,
  replay: null,
  replaySeries: null,
  replayGameIndex: 0,
  replayMoveIndex: -1,
  modalReturnFocus: null,
  liveModalReturnFocus: null,
  authRevision: 0,
  viewRevision: 0,
  loading: new Set(),
  error: null,
  pending: new Set(),
  bots: [],
  botSearch: '',
  botPage: 1,
  deletingBot: null,
  deleteDialogRevision: 0,
  deletingRevision: null,
  revisionDeleteDialogRevision: 0,
  sourceWorkspaceBot: null,
  sourceRevisions: [],
  sourceDirty: false,
  sourceRuntime: 'cpp',
  sourceRuntimeDrafts: new Map(),
  sourceExecutionMode: 'strategy',
  pendingSourceRevision: null,
  botWorkspaceMode: 'create',
  botWorkspaceReadOnly: false,
  botWorkspaceDraftBase: null,
  botWorkspaceInitialName: '',
  sourceInitialSource: '',
  sourceInitialRuntime: 'cpp',
  sourceInitialName: '',
  pendingInitialRevision: null,
  practiceRevision: null,
  practiceSourceMode: null,
  practiceReplayParent: null,
  practiceDraft: null,
  practiceReplay: null,
  practiceReplayMoveIndex: -1,
  practiceReplayTimer: null,
  practiceReplayToken: 0,
  practiceProgressTimer: null,
  practiceProgressStartedAt: 0,
  practiceRequestToken: 0,
  practiceAbortController: null,
  tournaments: [],
  tournamentSearch: '',
  tournamentPage: 1,
  tournamentScope: 'discoverable',
  tournamentStatusFilter: 'all',
  dashboardTournamentSearch: '',
  dashboardTournamentStatus: 'all',
  tournamentRegistrationContext: null,
  viewerParticipantId: null,
  viewerParticipantIds: [],
  pendingTournamentAction: null,
  tournamentActionRevision: 0,
  retryingPairings: new Set(),
  tournamentListError: null,
  tournamentDialogRevision: 0,
  editingTournament: null,
  phase1ActiveTab: 'info',
  publicTournamentTab: 'info',
  phase1EditMode: false,
  phase1Draft: null,
  registrationDialogRevision: 0,
  registrationBotsState: 'idle',
  registrationRevisions: [],
  registrationSubmission: null,
  registrationSubmissionPolling: null,
  replayTimer: null,
  replayPlaybackActive: false,
  replaySpeed: 800,
  replayRevision: 0,
  replayMatchId: null,
  replayContext: null,
  replayLoading: false,
  replayPlaybackToken: 0,
  liveMatchContext: null,
  liveMatchSnapshot: null,
  liveMatchStartedGames: new Set(),
  liveLatestSnapshot: null,
  liveHistoryGame: null,
  liveHistory: [],
  liveHistoryIndex: 0,
  liveHistoryQueue: [],
  liveLastSequence: 0,
  liveTransitionTimer: null,
  liveTransitionToken: 0,
  livePendingSnapshot: null,
  liveHistoryTimer: null,
  liveMatchPollingTimer: null,
  liveStreamSource: null,
  liveAcceptedSnapshot: null,
  liveStreamMode: false,
  livePollBackoffMs: 0,
  spectatorMode: false,
  detailStatus: null,
  detailRefreshInFlight: false,
  tournamentLifecycleRefreshTimer: null,
  queueRefreshInFlight: false,
  conditionalResponseCache: new Map(),
  detailRequestBotNames: new Map(),
  detailRequestsFilter: 'pending',
  phase2PreflightPolling: null,
  multiStage: {
    abortController: null,
    pollTimer: null,
    visibilityHandler: null,
    requestToken: 0,
    loadedTournamentId: null,
    loadedViewRevision: null,
    progress: null,
    stages: null,
    activeStageId: null,
    activeRegionId: null,
    activeGroupId: null,
    activeKnockoutRound: null,
    activeKnockoutPairingId: null,
    knockoutPage: 1,
    pairingPages: new Map(),
    expandedGroupPairings: new Set(),
  },
};

const $ = (selector, root = document) => root.querySelector(selector);

/* ==================== MODULE: utils.js ==================== */
const create = (tag, options = {}) => {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  if (options.type) element.type = options.type;
  if (options.value !== undefined) element.value = String(options.value);
  if (options.attrs) Object.entries(options.attrs).forEach(([name, value]) => element.setAttribute(name, String(value)));
  if (Array.isArray(options.children)) element.append(...options.children.filter(Boolean));
  return element;
};

function tournamentFormatLabel(format) {
  return format === 'multi_stage' ? 'Nhiều giai đoạn' : 'Vòng tròn một lượt';
}
const clear = (element) => element.replaceChildren();
const textCell = (text, tag = 'td') => create(tag, { text });
const shortId = value => {
  const id = String(value || '');
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
};


function statusBadge(status) {
  const normalized = safeStatusClass(status);
  return create('span', {
    className: `status-badge status-${normalized}`,
    text: localizeStatus(normalized),
  });
}

function safeStatusClass(status) {
  const normalized = String(status || 'unknown');
  return /^[a-z][a-z0-9_-]*$/i.test(normalized) ? normalized : 'unknown';
}

function actionButton(label, action, key, className = 'secondary-btn') {
  const button = create('button', { className, text: label, type: 'button' });
  button.disabled = state.pending.has(key);
  button.addEventListener('click', () => runPending(key, button, action));
  return button;
}

async function runPending(key, button, action) {
  if (state.pending.has(key)) return;
  state.pending.add(key);
  const buttonText = button?.querySelector('.btn-text');
  const buttonLoading = button?.querySelector('.btn-loading');
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-loading');
    buttonText?.classList.add('hidden');
    buttonLoading?.classList.remove('hidden');
  }
  try { return await action(); }
  catch (error) {
    if (!error?.notified) showToast(error?.message || 'Thao tác thất bại. Vui lòng thử lại.', 'error');
    return undefined;
  } finally {
    state.pending.delete(key);
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.classList.remove('is-loading');
      buttonText?.classList.remove('hidden');
      buttonLoading?.classList.add('hidden');
    }
  }
}

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  if (!container) return;
  const toastMeta = {
    success: { icon: 'td-icon-check', label: '\u0110\u00E3 xong' },
    error: { icon: 'td-icon-circle-x', label: 'C\u00F3 l\u1ED7i' },
    info: { icon: 'td-icon-ellipsis', label: 'Th\u00F4ng b\u00E1o' },
    capture: { icon: 'td-icon-check', label: 'C\u1EADp nh\u1EADt' },
  }[type] || { icon: 'td-icon-ellipsis', label: 'Th\u00F4ng b\u00E1o' };
  const toast = create('div', { className: `toast toast-${type}`, attrs: { role: type === 'error' ? 'alert' : 'status' } });
  const marker = create('span', { className: 'toast-marker', attrs: { 'aria-hidden': 'true' } });
  marker.appendChild(icon(toastMeta.icon));
  const content = create('div', { className: 'toast-content' });
  content.append(create('strong', { className: 'toast-label', text: toastMeta.label }), create('span', { className: 'toast-message', text: message }));
  toast.append(marker, content);
  toast.appendChild(actionButton('Đóng', () => toast.remove(), `dismiss-toast:${Date.now()}`, 'toast-close'));
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  const duration = type === 'error' ? 8000 : 3000;
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, duration);
}

function renderMessage(container, message, retry) {
  clear(container);
  const wrapper = create('div', { className: 'ui-message' });
  wrapper.appendChild(create('p', { text: message }));
  if (retry) wrapper.appendChild(actionButton('Thử lại', retry, `retry:${container.id}`));
  container.appendChild(wrapper);
}

function renderTableMessage(tbody, message, columns, retry) {
  if (tbody.tagName !== 'TBODY') return renderMessage(tbody, message, retry);
  clear(tbody);
  const row = create('tr');
  const cell = create('td', { text: message, attrs: { colspan: columns } });
  cell.className = 'table-message';
  if (retry) cell.appendChild(actionButton('Thử lại', retry, `retry:${tbody.parentElement?.id || 'table'}`));
  row.appendChild(cell);
  tbody.appendChild(row);
}

function renderLoadingSkeleton(container, type = 'card', count = 4) {
  if (!container) return;
  clear(container);
  container.classList.add('is-loading-skeleton');
  container.setAttribute('aria-busy', 'true');
  const fragment = document.createDocumentFragment();
  if (container.tagName === 'TBODY') {
    for (let index = 0; index < count; index += 1) {
      const row = create('tr', { className: 'loading-skeleton-row' });
      for (let column = 0; column < type; column += 1) {
        const cell = create('td');
        cell.appendChild(create('span', { className: 'loading-skeleton-line' }));
        row.appendChild(cell);
      }
      fragment.appendChild(row);
    }
  } else {
    for (let index = 0; index < count; index += 1) {
      const card = create('div', { className: `loading-skeleton-card ${type}` });
      card.append(
        create('span', { className: 'loading-skeleton-avatar' }),
        create('span', { className: 'loading-skeleton-line loading-skeleton-line-title' }),
        create('span', { className: 'loading-skeleton-line loading-skeleton-line-wide' }),
        create('span', { className: 'loading-skeleton-line loading-skeleton-line-short' }),
      );
      fragment.appendChild(card);
    }
  }
  container.appendChild(fragment);
}

function clearLoadingSkeleton(container) {
  if (!container) return;
  container.classList.remove('is-loading-skeleton');
  container.removeAttribute('aria-busy');
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  state.modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  const focusable = getModalFocusable(modal)[0];
  if (focusable && typeof focusable.focus === 'function') {
    focusable.focus();
    const restoreEntryFocus = () => {
      if (modal.classList.contains('open') && !modal.contains(document.activeElement)) focusable.focus();
    };
    if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(restoreEntryFocus);
    if (typeof globalThis.setTimeout === 'function') globalThis.setTimeout(restoreEntryFocus, 50);
  }
}

function getModalFocusable(modal) {
  return [...modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
    .filter(element => !element.disabled && !element.hidden && element.getAttribute('tabindex') !== '-1' && !element.closest('[hidden]'));
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (state.modalReturnFocus?.isConnected) state.modalReturnFocus.focus();
  state.modalReturnFocus = null;
  if (!document.querySelector('.modal-overlay.open')) document.body.classList.remove('modal-open');
  if (id === 'delete-bot-modal') { state.deleteDialogRevision += 1; state.deletingBot = null; }
  if (id === 'delete-revision-modal') { state.revisionDeleteDialogRevision += 1; state.deletingRevision = null; $('#delete-revision-error').textContent = ''; $('#delete-revision-error').hidden = true; }
  if (id === 'add-tourney-modal') { state.tournamentDialogRevision += 1; $('#tournament-form-error').textContent = ''; $('#tournament-form-error').hidden = true; }
  if (id === 'register-bot-tourney-modal') { state.registrationDialogRevision += 1; $('#registration-form-error').textContent = ''; $('#registration-form-error').hidden = true; }
  if (id === 'tournament-action-modal') { state.tournamentActionRevision += 1; state.pendingTournamentAction = null; }
  if (id === 'practice-modal') {
    state.practiceAbortController?.abort();
    state.practiceAbortController = null;
    state.practiceRequestToken += 1;
    state.practiceRevision = null;
    state.practiceDraft = null;
    if (typeof stopPracticeReplay === 'function') stopPracticeReplay();
    state.practiceReplay = null;
    state.practiceReplayMoveIndex = -1;
    const scenario = $('#practice-scenario'); if (scenario) scenario.disabled = false;
    const runButton = $('#practice-run'); if (runButton) { runButton.disabled = false; runButton.textContent = 'Chạy thử'; }
  }
}

function trapModalFocus(event) {
  if (event.key !== 'Tab') return;
  const modal = document.querySelector('.modal-overlay.open, #live-game-result-modal.is-visible');
  if (!modal) return;
  const focusable = getModalFocusable(modal);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/* ==================== MODULE: navigation.js ==================== */
function toggleMobileNavigation() {
  const sidebar = $('#app-nav');
  const backdrop = $('#sidebar-backdrop');
  const toggle = $('#mobile-menu-toggle');
  const open = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', open);
  backdrop.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Đóng điều hướng' : 'Mở điều hướng');
}

const AUTHENTICATED_VIEWS = new Set(['dashboard', 'bots', 'bot-workspace', 'tournaments', 'tournament-detail', 'replay-view', 'bot-playground', 'player-guide']);

function closeMobileNavigation() {
  const sidebar = $('#app-nav');
  const backdrop = $('#sidebar-backdrop');
  const toggle = $('#mobile-menu-toggle');
  if (!sidebar || !backdrop || !toggle) return;
  sidebar.classList.remove('open');
  backdrop.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Mở điều hướng');
}

function isCurrentView(view, authRevision, viewRevision, tournamentId) {
  return state.user && state.authRevision === authRevision && state.viewRevision === viewRevision && state.activeView === view
    && (tournamentId === undefined || state.tournamentId === tournamentId);
}

function canLeaveBotWorkspace() {
  return state.activeView !== 'bot-workspace' || !hasUnsavedBotWorkspaceChanges()
    || window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời không gian mã nguồn?');
}

function renderTopbarBreadcrumb(sectionTitle, currentTitle, showParent = true, parentTarget = 'tournaments') {
  const topbarBreadcrumb = $('#topbar-breadcrumb');
  if (!topbarBreadcrumb) return;

  const current = create('span', {
    className: 'topbar-breadcrumb-current',
    text: currentTitle,
    attrs: { 'aria-current': 'page' },
  });

  if (Array.isArray(state.navigationTrail) && state.navigationTrail.length > 1) {
    const children = [];
    for (let i = 0; i < state.navigationTrail.length - 1; i += 1) {
      const entry = state.navigationTrail[i];
      const sectionLink = create('a', {
        className: 'topbar-breadcrumb-link',
        text: entry.title,
        attrs: {
          href: `#${entry.target || entry.view}`,
          'aria-label': `Về ${entry.title}`,
        },
      });
      const separator = create('span', {
        className: 'topbar-breadcrumb-separator',
        text: '/',
        attrs: { 'aria-hidden': 'true' },
      });
      children.push(sectionLink, separator);
    }
    children.push(current);
    topbarBreadcrumb.replaceChildren(...children);
    return;
  }

  if (!showParent) {
    topbarBreadcrumb.replaceChildren(current);
    return;
  }

  const sectionLink = create('a', {
    className: 'topbar-breadcrumb-link',
    text: sectionTitle,
    attrs: {
      href: `#${parentTarget}`,
      'aria-label': `Về ${sectionTitle}`,
    },
  });
  const separator = create('span', {
    className: 'topbar-breadcrumb-separator',
    text: '/',
    attrs: { 'aria-hidden': 'true' },
  });

  topbarBreadcrumb.replaceChildren(sectionLink, separator, current);
}

function updateTopbarTournamentBreadcrumb(name) {
  if (state.activeView !== 'tournament-detail' || !name) return;
  if (Array.isArray(state.navigationTrail)) {
    const item = state.navigationTrail.find(entry => entry.view === 'tournament-detail');
    if (item) item.title = name;
  }
  renderTopbarBreadcrumb(getTournamentDetailParentTitle(), name, true);
}

function getTournamentDetailParentTitle() {
  if (state.tournamentDetailSource === 'dashboard') return 'Tổng quan';
  if (state.tournamentDetailSource === 'tournaments') {
    return state.user?.role === 'organizer'
      ? 'Quản lý giải đấu'
      : state.tournamentScope === 'mine' ? 'Giải đấu của tôi' : 'Giải đấu';
  }
  return state.user?.role === 'organizer' ? 'Quản lý' : 'Giải đấu';
}

function getBotWorkspaceParent() {
  if (state.botWorkspaceSource === 'dashboard') return { title: 'Tổng quan', target: 'dashboard' };
  if (state.botWorkspaceSource === 'tournaments' || state.botWorkspaceSource === 'tournament-detail') return { title: 'Giải đấu', target: 'tournaments' };
  return { title: 'Bot của tôi', target: 'bots' };
}

function getReplayParent(sectionTitle) {
  if (state.replayContext?.practice && state.practiceReplayParent) return state.practiceReplayParent;
  if (state.replayContext?.practice && (state.practiceSourceMode === 'create' || !state.sourceWorkspaceBot?.id)) {
    return { title: 'Tạo Bot', target: 'bot-workspace' };
  }
  return state.replayContext?.practice
    ? { title: 'Bot của tôi', target: 'bots' }
    : { title: sectionTitle, target: 'tournaments' };
}

function navigate(view, options = {}) {
  const staticReplayOnly = typeof window !== 'undefined' && window.OTT_PUBLIC_REPLAY_STATIC_ONLY === true;
  if (!state.user && view !== 'auth-screen' && !(staticReplayOnly && view === 'replay-view')) return false;
  if (state.user && view === 'auth-screen') view = 'dashboard';
  if (!AUTHENTICATED_VIEWS.has(view) && view !== 'auth-screen') return false;
  if (view !== 'tournament-detail' && typeof stopMultiStagePolling === 'function') stopMultiStagePolling();
  if (view !== 'tournament-detail' && typeof stopPhase2PreflightPolling === 'function') stopPhase2PreflightPolling();
  if (view === 'bot-workspace' && state.user?.role !== 'competitor') return false;
  if (view === 'player-guide' && state.user?.role !== 'competitor') return false;
  // Opening the practice replay does not replace the draft; keep the editor
  // state intact without treating the preview transition as a destructive exit.
  const isPracticeReplay = view === 'replay-view' && state.replayContext?.practice === true;
  if (view !== state.activeView && !isPracticeReplay && !canLeaveBotWorkspace()) return false;
  if (view !== 'replay-view') {
    stopReplayPlayback();
    if (typeof stopPracticeReplay === 'function') stopPracticeReplay();
    stopLiveMatchPolling();
  }
  const target = document.getElementById(view);
  if (!target) return false;
  state.activeView = view;
  state.viewRevision += 1;
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(link => {
    const active = link.dataset.target === view
      && (!link.dataset.scope || link.dataset.scope === state.tournamentScope);
    link.classList.toggle('active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelectorAll('.bottom-nav [data-target]').forEach(link => {
    const target = link.dataset.target === 'my-tournaments' ? 'tournaments' : link.dataset.target;
    const active = target === view
      && (!link.dataset.scope || link.dataset.scope === state.tournamentScope);
    link.classList.toggle('active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });
  const tournamentCache = Array.isArray(state.tournaments) ? state.tournaments : [];
  const pageTitles = { dashboard: state.user?.role === 'organizer' ? 'Tổng quan giải đấu' : 'Tổng quan', bots: 'Bot của tôi', 'bot-workspace': 'Tạo Bot', 'bot-playground': 'Test thế cờ', 'player-guide': 'Hướng dẫn người chơi', tournaments: state.user?.role === 'organizer' ? 'Quản lý giải đấu' : 'Giải đấu', 'tournament-detail': state.currentTournament?.name || tournamentCache.find(tournament => tournament.tournamentId === state.tournamentId)?.name || 'Chi tiết giải đấu', 'replay-view': 'Xem lại trận đấu' };
  const pageTitle = $('#page-title');
  if (pageTitle) pageTitle.textContent = pageTitles[view] || 'OTT Code Arena';
  const sectionTitle = state.user?.role === 'organizer' ? 'Quản lý' : 'Giải đấu';
  const currentTitle = view === 'dashboard'
    ? 'Tổng quan'
    : pageTitles[view] || 'OTT Code Arena';
  const botWorkspaceParent = view === 'bot-workspace' ? getBotWorkspaceParent() : null;
  const replayParent = view === 'replay-view' ? getReplayParent(sectionTitle) : null;
  const breadcrumbParent = view === 'tournament-detail'
    ? getTournamentDetailParentTitle()
    : replayParent?.title || botWorkspaceParent?.title || sectionTitle;
  const breadcrumbTarget = replayParent?.target || botWorkspaceParent?.target || 'tournaments';

  if (!Array.isArray(state.navigationTrail)) state.navigationTrail = [];
  if (options.fromNav === true) {
    state.navigationTrail = [{ view, title: currentTitle, target: view }];
  } else {
    const existingIndex = state.navigationTrail.findIndex(item => item.view === view);
    if (existingIndex !== -1) {
      state.navigationTrail = state.navigationTrail.slice(0, existingIndex + 1);
      state.navigationTrail[existingIndex].title = currentTitle;
    } else {
      if (!state.navigationTrail.length && ['bot-workspace', 'tournament-detail', 'replay-view'].includes(view)) {
        state.navigationTrail.push({ view: breadcrumbTarget, title: breadcrumbParent, target: breadcrumbTarget });
      }
      state.navigationTrail.push({ view, title: currentTitle, target: view });
    }
  }

  renderTopbarBreadcrumb(breadcrumbParent, currentTitle, ['bot-workspace', 'tournament-detail', 'replay-view'].includes(view), breadcrumbTarget);
  closeMobileNavigation();
  target.classList.add('active');
  if (view === 'dashboard') void loadDashboard();
  if (view === 'bots') void loadBots();
  if (view === 'tournaments') void loadTournaments();
  if (view === 'tournament-detail' && state.tournamentId && typeof refreshTournamentDetail === 'function') void refreshTournamentDetail();
  if (view === 'bot-playground' && typeof initBotPlayground === 'function') void initBotPlayground();
  if (view === 'bot-workspace') {
    const workspace = $('#bot-source-workspace');
    if (workspace) workspace.hidden = false;
  }
  if (options.history !== false && view === 'bot-workspace' && window.location.hash !== '#bot-workspace') {
    window.history.pushState({ view }, '', '#bot-workspace');
  }
  if (options.history !== false && ['dashboard', 'bots', 'tournaments', 'bot-playground', 'player-guide'].includes(view)) {
    const hash = `#${view}`;
    if (window.location.hash !== hash) window.history.pushState({ view }, '', hash);
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('ott_active_view', view);
      if (state.tournamentScope) window.sessionStorage.setItem('ott_tournament_scope', state.tournamentScope);
    }
  } catch {}
  return true;
}

function syncLocationRoute() {
  const requestedView = window.location.hash.slice(1);

  if (!state.user) {
    if (requestedView !== 'auth-screen' || state.activeView !== 'auth-screen') showAuthScreen();
    return;
  }

  let targetView = AUTHENTICATED_VIEWS.has(requestedView) ? requestedView : 'dashboard';
  if (state.user.role !== 'competitor' && (targetView === 'bots' || targetView === 'bot-workspace' || targetView === 'player-guide')) targetView = 'dashboard';
  if (requestedView !== targetView) window.history.replaceState({ view: targetView }, '', `#${targetView}`);
  if (state.activeView !== targetView || !document.getElementById(targetView)?.classList.contains('active')) {
    navigate(targetView, { history: false });
  }
}

/* ==================== MODULE: auth.js ==================== */
function setAuthenticated(user, csrfToken) {
  state.authRevision += 1;
  state.user = user;
  state.csrfToken = csrfToken;
  $('#auth-screen').hidden = true;
  $('#app-nav').hidden = false;
  $('#app-topbar').hidden = false;
  $('#current-user').textContent = user.username;
  const roleLabel = $('#current-user-role');
  if (roleLabel) roleLabel.textContent = user.role === 'organizer' ? 'Ng\u01b0\u1eddi t\u1ed5 ch\u1ee9c' : 'Ng\u01b0\u1eddi ch\u01a1i';
  $('#dashboard-username').textContent = user.username;
  $('#user-avatar').textContent = user.username.slice(0, 1).toUpperCase();
  document.body.dataset.role = user.role;
  const bottomNavigation = $('.bottom-nav');
  if (bottomNavigation) bottomNavigation.hidden = false;
  document.querySelectorAll('.role-nav').forEach(link => { link.hidden = link.dataset.role !== user.role; });
  const competitor = user.role === 'competitor';
  const botCreateButton = $('#open-bot-modal');
  if (botCreateButton) botCreateButton.hidden = !competitor;
  const savedScope = typeof window !== 'undefined' && window.sessionStorage
    ? window.sessionStorage.getItem('ott_tournament_scope')
    : null;
  // The same hash is shared by both roles, so the role must determine the
  // default dataset before navigation. Organizers manage their tournaments;
  // competitors discover open tournaments unless they explicitly use “của tôi”.
  state.tournamentScope = competitor
    ? (savedScope === 'mine' ? 'mine' : 'discoverable')
    : 'managed';
  const hashView = typeof window !== 'undefined' && window.location.hash ? window.location.hash.slice(1) : '';
  const savedView = typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage.getItem('ott_active_view') : null;
  let targetView = (AUTHENTICATED_VIEWS.has(hashView) && document.getElementById(hashView))
    ? hashView
    : (AUTHENTICATED_VIEWS.has(savedView) && document.getElementById(savedView) ? savedView : 'dashboard');
  if (!competitor && (targetView === 'bots' || targetView === 'bot-workspace' || targetView === 'player-guide')) targetView = 'dashboard';
  navigate(targetView);
  if (targetView === 'bot-workspace' && typeof restoreBotWorkspace === 'function') void restoreBotWorkspace();
}

function showAuthScreen(message = '') {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem('ott_active_view');
    }
  } catch {}
  // End account-scoped UI work before exposing the auth screen. Without this
  // cleanup, a registration modal and its preflight result can remain visible
  // when another account signs in in the same browser tab.
  state.authRevision += 1;
  if (typeof stopRegistrationSubmissionPolling === 'function') stopRegistrationSubmissionPolling();
  state.registrationSubmission = null;
  state.tournamentRegistrationContext = null;
  const bottomNavigation = $('.bottom-nav');
  if (bottomNavigation) bottomNavigation.hidden = true;
  document.body.removeAttribute('data-role');
  const registrationStatus = $('#registration-submission-status');
  if (registrationStatus) registrationStatus.hidden = true;
  document.querySelectorAll('.modal-overlay.open').forEach(modal => closeModal(modal.id));
  const authScreen = $('#auth-screen');
  const registerForm = $('#register-form');
  const shouldResetAuthForm = authScreen.hidden || (registerForm && !registerForm.hidden);
  state.user = null;
  state.csrfToken = null;
  authScreen.hidden = false;
  $('#app-nav').hidden = true;
  $('#app-topbar').hidden = true;
  state.activeView = 'auth-screen';
  state.viewRevision += 1;
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page === authScreen));
  if (typeof window !== 'undefined' && window.location.hash !== '#auth-screen') {
    window.history.replaceState({ view: 'auth-screen' }, '', '#auth-screen');
  }
  if (shouldResetAuthForm) setAuthMode('login', false);
  if (message) setAuthMessage('login', message);
}

function setAuthMode(mode, shouldFocus = true) {
  if (state.pending.has('login') || state.pending.has('register')) return;
  const loginMode = mode === 'login';
  const loginForm = $('#login-form');
  const registerForm = $('#register-form');
  const loginSwitch = $('#show-login');
  const registerSwitch = $('#show-register');
  const title = $('#auth-title');
  if (!loginForm || !registerForm || !loginSwitch || !registerSwitch || !title) return;

  state.error = null;
  clearAuthMessage('login');
  clearAuthMessage('register');
  loginForm.classList.toggle('active-form', loginMode);
  registerForm.classList.toggle('active-form', !loginMode);
  loginForm.hidden = !loginMode;
  registerForm.hidden = loginMode;
  loginSwitch.hidden = loginMode;
  registerSwitch.hidden = !loginMode;
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  if (tabLogin) tabLogin.classList.toggle('active', loginMode);
  if (tabRegister) tabRegister.classList.toggle('active', !loginMode);
  
  // Update title based on mode
  if (loginMode) {
    title.textContent = 'Đăng nhập';
  } else {
    title.textContent = 'Tạo tài khoản';
  }

  // Clear form data and validation when switching modes
  if (loginMode) {
    $('#login-username').value = '';
    $('#login-password').value = '';
    $('#login-username').type = 'text';
    $('#login-password').type = 'password';
    $('#login-password-toggle').setAttribute('aria-expanded', 'false');
    $('#login-password-toggle').classList.remove('is-visible');
    $('#login-password-toggle').querySelector('.eye-icon').classList.remove('hidden');
    $('#login-password-toggle').querySelector('.eye-slash-icon').classList.add('hidden');
    clearErrors('login');
  } else {
    $('#register-username').value = '';
    $('#register-password').value = '';
    $('#register-username').type = 'text';
    $('#register-password').type = 'password';
    $('#register-password-toggle').setAttribute('aria-expanded', 'false');
    $('#register-password-toggle').classList.remove('is-visible');
    $('#register-password-toggle').querySelector('.eye-icon').classList.remove('hidden');
    $('#register-password-toggle').querySelector('.eye-slash-icon').classList.add('hidden');
    clearErrors('register');
  }

  if (shouldFocus) {
    setTimeout(() => {
      (loginMode ? $('#login-username') : $('#register-username')).focus();
    }, 100);
  }
}

function togglePassword(inputId, buttonId) {
  const input = $(`#${inputId}`);
  const button = $(`#${buttonId}`);
  if (!input || !button) return;
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  const eyeIcon = button.querySelector('.eye-icon');
  const eyeSlashIcon = button.querySelector('.eye-slash-icon');
  
  if (visible) {
    button.setAttribute('aria-label', 'Ẩn mật khẩu');
    button.classList.add('is-visible');
    eyeIcon.classList.add('hidden');
    eyeSlashIcon.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
  } else {
    button.setAttribute('aria-label', 'Hiện mật khẩu');
    button.classList.remove('is-visible');
    eyeIcon.classList.remove('hidden');
    eyeSlashIcon.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
  }
}

function validateField(field, fieldType) {
  const input = $(`#${field.id}`);
  const errorElement = $(`#${field.id}-error`);
  let isValid = true;
  let errorMessage = '';

  // Reset state
  input.setAttribute('aria-invalid', 'false');
  if (errorElement) {
    errorElement.textContent = '';
    errorElement.classList.remove('visible');
  }

  // Validation logic
  if (field.required && !input.value.trim()) {
    isValid = false;
    errorMessage = 'Trường này là bắt buộc.';
  } else if (fieldType === 'username' && input.value.trim()) {
    const username = input.value.trim();
    if (field.id === 'register-username' && username.length < 3) {
      isValid = false;
      errorMessage = 'Tên người dùng phải có ít nhất 3 ký tự.';
    } else if (username.length > 32) {
      isValid = false;
      errorMessage = 'Tên người dùng không được vượt quá 32 ký tự.';
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      isValid = false;
      errorMessage = 'Tên người dùng chỉ được chứa chữ cái, số và dấu gạch dưới.';
    }
  } else if (fieldType === 'password' && input.value.trim()) {
    const password = input.value;
    if (password.length < 12) {
      isValid = false;
      errorMessage = 'Mật khẩu phải có ít nhất 12 ký tự.';
    } else if (password.length > 128) {
      isValid = false;
      errorMessage = 'Mật khẩu không được vượt quá 128 ký tự.';
    } else if (!/[A-Z]/.test(password)) {
      isValid = false;
      errorMessage = 'Mật khẩu phải chứa ít nhất một chữ hoa.';
    } else if (!/[a-z]/.test(password)) {
      isValid = false;
      errorMessage = 'Mật khẩu phải chứa ít nhất một chữ thường.';
    } else if (!/[0-9]/.test(password)) {
      isValid = false;
      errorMessage = 'Mật khẩu phải chứa ít nhất một chữ số.';
    }
  }

  if (!isValid) {
    input.setAttribute('aria-invalid', 'true');
    if (errorElement) {
      errorElement.textContent = errorMessage;
      errorElement.classList.add('visible');
    }
    return false;
  }

  return true;
}

function clearErrors(formType) {
  const form = formType === 'login' ? $('#login-form') : $('#register-form');
  const inputs = form.querySelectorAll('input[required]');
  inputs.forEach(input => {
    input.setAttribute('aria-invalid', 'false');
    const errorElement = document.getElementById(`${input.id}-error`);
    if (errorElement) {
      errorElement.textContent = '';
      errorElement.classList.remove('visible');
    }
  });
}

function setAuthMessage(formType, message, type = 'error') {
  const messageElement = document.getElementById(`${formType}-form-message`);
  if (!messageElement) return;
  messageElement.textContent = message || '';
  messageElement.dataset.type = type;
  messageElement.hidden = !message;
}

function clearAuthMessage(formType) {
  setAuthMessage(formType, '');
}

function initAuthMotion() {
  const screen = document.getElementById('auth-screen');
  if (!screen || screen.dataset.motionReady === 'true') return;
  screen.dataset.motionReady = 'true';
  screen.classList.add('motion-ready');

  ['.landing-hero', '.landing-strategy-showcase', '.landing-stats-section', '.landing-cta-section', '.landing-footer']
    .forEach(selector => screen.querySelectorAll(selector).forEach(element => element.remove()));

  screen.querySelectorAll('input[required]').forEach(input => {
    input.setAttribute('aria-required', 'true');
    const errorId = `${input.id}-error`;
    let error = document.getElementById(errorId);
    if (!error) {
      error = document.createElement('p');
      error.id = errorId;
      error.className = 'field-error';
      error.setAttribute('role', 'alert');
      input.closest('.form-group')?.append(error);
    }
    input.setAttribute('aria-describedby', errorId);
  });

  const features = screen.querySelector('.landing-features-section');
  const rules = screen.querySelector('.landing-rules-section');
  const workflow = screen.querySelector('.landing-workflow-section');
  if (features && rules && workflow && features.parentElement === screen) {
    screen.insertBefore(features, rules);
    screen.insertBefore(workflow, rules.nextElementSibling);
  }

  const revealItems = screen.querySelectorAll(
    '.auth-system-panel, .auth-card, .landing-rules-section, .landing-features-section, .landing-workflow-section, .landing-feature-card, .rule-card, .win-card, .workflow-step-card'
  );
  const reveal = element => element.classList.add('is-visible');

  if (!window.IntersectionObserver) {
    revealItems.forEach(reveal);
  } else {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
    revealItems.forEach(element => observer.observe(element));
  }

  const board = screen.querySelector('.auth-system-board');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!board || reduceMotion) return;
  board.addEventListener('pointermove', event => {
    const rect = board.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    board.style.setProperty('--board-tilt-x', `${(x * 4).toFixed(2)}deg`);
    board.style.setProperty('--board-tilt-y', `${(-y * 4).toFixed(2)}deg`);
  }, { passive: true });
  board.addEventListener('pointerleave', () => {
    board.style.removeProperty('--board-tilt-x');
    board.style.removeProperty('--board-tilt-y');
  }, { passive: true });
}

function validateForm(formType) {
  const form = formType === 'login' ? $('#login-form') : $('#register-form');
  const inputs = form.querySelectorAll('input[required]');
  let isValid = true;

  inputs.forEach(input => {
    const fieldType = input.id === 'login-password'
      ? 'login-password'
      : (input.id.includes('username') ? 'username' : 'password');
    
    if (!validateField(input, fieldType)) {
      isValid = false;
    }
  });

  return isValid;
}

function updateButtonState(formType) {
  const form = formType === 'login' ? $('#login-form') : $('#register-form');
  if (!form) return;
  const submitButton = form.querySelector('.primary-btn');
  if (!submitButton) return;

  // Auth actions should always be actionable so submit-time errors can be shown in the form.
  // Only disable the active button while its request is already being submitted.
  if (formType === 'login' || formType === 'register') {
    submitButton.disabled = state.pending.has(formType);
    submitButton.classList.toggle('ready', !submitButton.disabled);
    return;
  }

  const isValid = validateForm(formType);
  
  if (isValid) {
    submitButton.disabled = false;
    submitButton.classList.add('ready');
  } else {
    submitButton.disabled = true;
    submitButton.classList.remove('ready');
  }
}

/* ==================== MODULE: api.js ==================== */
async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const conditional = options.conditional;
  const fetchOptions = { ...options };
  delete fetchOptions.conditional;
  const conditionalKey = conditional?.key
    ? `${state.authRevision}:${state.user?.id || 'anonymous'}:${state.user?.role || 'anonymous'}:${conditional.key}`
    : null;
  const cached = conditionalKey ? state.conditionalResponseCache.get(conditionalKey) : null;
  const headers = { Accept: 'application/json', ...fetchOptions.headers };
  if (cached?.etag) headers['If-None-Match'] = cached.etag;
  if (fetchOptions.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (state.csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['x-csrf-token'] = state.csrfToken;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      method,
      headers,
      credentials: 'same-origin',
      ...(method === 'GET' || method === 'HEAD' ? { cache: 'no-store' } : {}),
    });
  } catch {
    throw new Error('Không thể kết nối. Hãy kiểm tra mạng và thử lại.');
  }
  if (response.status === 304 && cached) {
    cached.lastAccess = Date.now();
    state.conditionalResponseCache.delete(conditionalKey);
    state.conditionalResponseCache.set(conditionalKey, cached);
    return cached.body;
  }
  let body = null;
  if (response.status !== 204) {
    try { body = await response.json(); }
    catch { throw new Error(response.ok ? 'Phản hồi từ máy chủ không hợp lệ.' : localizeErrorMessage(`Request failed (${response.status}).`)); }
  }
  if (!response.ok) {
    if (response.status === 401) showAuthScreen();
    const error = new Error(localizeErrorMessage(body?.error || `Request failed (${response.status}).`));
    error.status = response.status;
    error.payload = body;
    throw error;
  }
  if (conditionalKey && response.headers.get('etag')) {
    state.conditionalResponseCache.delete(conditionalKey);
    state.conditionalResponseCache.set(conditionalKey, {
      etag: response.headers.get('etag'), body, lastAccess: Date.now(),
    });
    while (state.conditionalResponseCache.size > 16) {
      const oldest = state.conditionalResponseCache.keys().next().value;
      if (oldest === undefined) break;
      state.conditionalResponseCache.delete(oldest);
    }
  }
  return body;
}

async function api(path, options = {}) {
  try { return await request(path, options); }
  catch (error) {
    state.error = localizeErrorMessage(error.message || 'Yêu cầu không thành công.');
    if (error && typeof error === 'object') error.notified = true;
    if (!path.startsWith('/auth/')) showToast(state.error, 'error');
    throw error;
  }
}

async function restoreSession() {
  const authRevisionAtStart = state.authRevision;
  try {
    const result = await request('/auth/me');
    setAuthenticated(result.user, result.csrfToken);
  } catch {
    // A login or registration may finish while the initial session check is
    // still in flight. Do not let that stale 401 undo the authenticated UI.
    if (state.authRevision === authRevisionAtStart && !state.user) showAuthScreen();
  }
}

// A deep-link or a browser tab opened during an auth transition can have a
// valid session cookie before the application state has been hydrated. Replay
// navigation must not silently discard an otherwise valid API response in
// that short window.
async function ensureReplaySession() {
  if (state.user) return true;
  try {
    const result = await request('/auth/me');
    setAuthenticated(result.user, result.csrfToken);
    return Boolean(state.user);
  } catch {
    return false;
  }
}

async function refreshQueueStats() {
  if (!state.user || state.user.role !== 'organizer') return;
  if (state.queueRefreshInFlight) return;
  state.queueRefreshInFlight = true;
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const detailTournamentId = state.activeView === 'tournament-detail' && state.detailStatus === 'running' ? state.tournamentId : null;
  const taskId = detailTournamentId ? `run_all_${detailTournamentId}` : null;
  try {
    const path = taskId ? `/system/queue?id=${encodeURIComponent(taskId)}` : '/system/queue';
    const stats = await request(path);
    if (!isCurrentView(state.activeView, authRevision, viewRevision, detailTournamentId || undefined)) return;
    const queueStats = $('#queue-stats');
    if (queueStats) queueStats.textContent = `Trận đang xử lý: ${stats.activeCount}/${stats.maxConcurrent} · ${stats.queueLength} trận đang chờ`;
    $('#dash-queue-value').textContent = String(Number(stats.activeCount) || 0);
  } catch {
    if (isCurrentView(state.activeView, authRevision, viewRevision, detailTournamentId || undefined)) {
      const queueStats = $('#queue-stats');
      if (queueStats) queueStats.textContent = 'Không thể tải trạng thái thi đấu';
      $('#dash-queue-value').textContent = '—';
    }
  } finally {
    state.queueRefreshInFlight = false;
  }
}

/* ==================== MODULE: dashboard.js ==================== */
async function loadDashboard() {
  const table = $('#dash-recent-tourneys tbody');
  const tableCard = $('#dash-recent-table');
  const emptyState = $('#dash-empty');
  const activityHeader = $('#dashboard-activity-header');
  const dashboardToolbar = $('#dashboard-tournament-toolbar');
  const botSection = $('#dash-bots-section');
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  state.loading.add('dashboard');
  state.error = null;
  $('#dash-tourney-count').textContent = '—';
  $('#dash-bot-count').textContent = '—';
  emptyState.hidden = true;
  tableCard.hidden = false;
  activityHeader.hidden = false;
  renderTableMessage(table, 'Đang tải các giải đấu…', 5);
  renderLoadingSkeleton(table, 5, 5);
  void refreshQueueStats();
  try {
    const competitor = state.user?.role === 'competitor';
    syncTournamentStatusFilters();
    const dashboard = $('#dashboard');
    dashboard?.classList.toggle('player-dashboard', competitor);
    dashboard?.classList.toggle('organizer-dashboard', !competitor);
    if (dashboardToolbar) dashboardToolbar.hidden = competitor;
    const secondaryColumn = $('#dashboard-secondary-column');
    const dashboardCopy = $('#dashboard-welcome-copy');

    const activityTitle = $('#recent-tournaments-title');
    const activityCopy = $('#dashboard-activity-copy');
    const botLabel = $('#dash-bot-label');
    const tournamentLabel = $('#dash-tourney-label');
    const queueLabel = $('#dash-queue-label');
    const queueCard = $('#dash-queue-card');
    const recordCard = $('#dash-record-card');
    const pendingCard = $('#dash-pending-card');
    const dashboardIcons = {
      bot: competitor ? 'icon-bot' : 'icon-users',
      tournament: competitor ? 'icon-users' : 'icon-trophy',
      queue: competitor ? 'icon-user-round-plus' : 'icon-activity',
    };
    [['dash-bot-icon', dashboardIcons.bot], ['dash-bot-icon-main', dashboardIcons.bot], ['dash-tourney-icon-main', dashboardIcons.tournament], ['dash-queue-icon', dashboardIcons.queue], ['dash-queue-icon-main', dashboardIcons.queue]].forEach(([id, iconId]) => {
      const use = $(`#${id}`); if (use) use.setAttribute('href', `#${iconId}`);
    });
    if (dashboardCopy) {
      dashboardCopy.replaceChildren(
        create('span', { className: 'welcome-greeting', text: 'Chào mừng trở lại, ' }),
        create('strong', { className: 'welcome-user', text: state.user?.username || '', attrs: { id: 'dashboard-username' } }),
        create('span', { className: 'welcome-message', text: competitor
          ? 'Xây dựng Bot, luyện tập và tìm giải đấu phù hợp để tham gia.'
          : 'Theo dõi và quản lý các giải đấu của bạn.' }),
      );
    }
    if (activityTitle) activityTitle.textContent = competitor ? 'Giải đấu dành cho bạn' : 'Danh sách giải đấu quản lý';
    if (activityCopy) activityCopy.textContent = competitor
      ? 'Mở chi tiết để xem thông tin, lịch đấu và đăng ký Bot khi còn thời hạn.'
      : 'Theo dõi các giải đấu gần đây và quản lý hoạt động thi đấu.';
    if (secondaryColumn) secondaryColumn.textContent = competitor ? 'Trạng thái tham gia' : 'Thể thức';
    const statusColumn = $('#dashboard-status-column');
    if (statusColumn) statusColumn.textContent = competitor ? 'Trạng thái giải' : 'Trạng thái';
    const openColumn = $('#dashboard-open-column');
    const closeColumn = $('#dashboard-close-column');
    if (openColumn) openColumn.textContent = 'Mở đăng ký';
    if (closeColumn) closeColumn.textContent = 'Đóng đăng ký';
    if (botLabel) botLabel.textContent = competitor ? 'Bot của tôi' : 'Giải mở đăng ký';
    if (tournamentLabel) tournamentLabel.textContent = competitor ? 'Đang tham gia' : 'Giải đấu quản lý';
    const botDetail = $('#dash-bot-detail');
    const tournamentDetail = $('#dash-tourney-detail');
    if (botDetail) botDetail.textContent = competitor ? 'Đã có phiên bản mã nguồn' : 'Đang nhận đăng ký từ người chơi.';
    if (tournamentDetail) tournamentDetail.textContent = competitor ? 'Giải đấu hiện tại' : 'Tổng số giải đấu do bạn tạo.';
    if (queueLabel) queueLabel.textContent = competitor ? 'Đang diễn ra' : 'Đang diễn ra';
    const queueDetail = $('#dash-queue-detail');
    if (queueDetail) queueDetail.textContent = competitor ? 'Giải đấu đang mở đăng ký' : 'Giải đấu đang thi đấu.';
    if (queueCard) queueCard.hidden = competitor;
    if (recordCard) recordCard.hidden = !competitor;
    if (pendingCard) pendingCard.hidden = competitor;
    const [tournamentResponse, bots, myTournamentResponse, botStats] = await Promise.all([
      request(competitor ? '/tournaments/discoverable' : '/tournaments'),
      competitor ? request('/bots') : Promise.resolve([]),
      competitor ? request('/my/tournaments') : Promise.resolve([]),
      competitor ? request('/my/bot-stats') : Promise.resolve(null),
    ]);
    if (!isCurrentView('dashboard', authRevision, viewRevision)) return;
    const tournaments = competitor
      ? tournamentResponse.filter(tournament => ['draft', 'registration_open', 'running'].includes(tournament.status))
      : tournamentResponse;
    if (competitor) state.bots = bots;
    const openCount = tournaments.filter(tournament => tournament.status === 'registration_open').length;
    const runningCount = tournaments.filter(tournament => ['running', 'in_progress'].includes(tournament.status)).length;
    const participatingCount = competitor
      ? myTournamentResponse.filter(tournament => tournament.participantId || tournament.request?.status === 'approved').length
      : 0;
    $('#dash-tourney-count').textContent = competitor ? participatingCount : tournaments.length;
    if (competitor) {
      if (pendingCard) pendingCard.hidden = true;
      $('#dash-bot-count').textContent = bots.length;
      const cppBotCount = bots.filter(bot => bot.selectedRevision?.runtimeId === 'cpp').length;
      const pythonBotCount = bots.filter(bot => bot.selectedRevision?.runtimeId === 'python3').length;
      if (botDetail) botDetail.textContent = `C++17: ${cppBotCount} · Python 3: ${pythonBotCount}`;
      const navBotsBadge = $('#nav-badge-bots');
      if (navBotsBadge) { navBotsBadge.textContent = bots.length; navBotsBadge.hidden = !bots.length; }
      const navTourneysBadge = $('#nav-badge-tourneys');
      if (navTourneysBadge) { navTourneysBadge.textContent = openCount; navTourneysBadge.hidden = !openCount; }
      const recordRate = $('#dash-record-rate');
      const recordMatches = $('#dash-record-matches');
      const totalMatches = Number(botStats?.totalMatches) || 0;
      const wins = Number(botStats?.wins) || 0;
      const top3Finishes = Number(botStats?.top3Finishes) || 0;
      if (tournamentDetail) tournamentDetail.textContent = `${top3Finishes} lần lọt Top 3`;
      const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;
      if (recordRate) recordRate.textContent = totalMatches > 0 ? `${winRate.toFixed(1).replace('.0', '')}%` : '—';
      if (recordMatches) {
        if (totalMatches > 0) {
          recordMatches.textContent = `${wins} thắng / ${totalMatches} trận`;
          let winBar = $('#dash-record-card .record-win-bar');
          if (!winBar) {
            winBar = create('div', { className: 'record-win-bar' });
            const fill = create('div', { className: 'record-win-bar-fill' });
            winBar.appendChild(fill);
            $('#dash-record-card .stat-card__header')?.appendChild(winBar);
          }
          const fill = winBar.querySelector('.record-win-bar-fill');
          if (fill) fill.style.width = `${Math.min(100, Math.max(0, winRate))}%`;
        } else {
          recordMatches.textContent = 'Chưa có trận tham gia';
          const winBar = $('#dash-record-card .record-win-bar');
          if (winBar) winBar.remove();
        }
      }
      $('#dash-queue-value').textContent = openCount;
      const queueLabelText = $('#dash-queue-label'); if (queueLabelText) queueLabelText.textContent = 'Giải đang mở đăng ký';
      if (botSection) { botSection.hidden = false; renderDashboardBotList(bots); }
    } else {
      if (recordCard) recordCard.hidden = true;
      if (pendingCard) pendingCard.hidden = false;
      const requestResults = await Promise.allSettled(tournaments.map(tournament => request(`/tournaments/${tournament.tournamentId}/requests`)));
      if (!isCurrentView('dashboard', authRevision, viewRevision)) return;
      const pendingCount = requestResults.reduce((total, result) => total + (result.status === 'fulfilled'
        ? result.value.filter(item => item.status === 'pending').length : 0), 0);
      $('#dash-bot-count').textContent = openCount;
      $('#dash-queue-value').textContent = runningCount;
      const pendingCountEl = $('#dash-pending-count');
      if (pendingCountEl) pendingCountEl.textContent = String(pendingCount);
      const pendingDetail = $('#dash-pending-detail');
      if (pendingDetail) pendingDetail.textContent = pendingCount > 0 ? `${pendingCount} đơn cần duyệt.` : 'Đã duyệt hết đơn đăng ký.';
      if (botSection) botSection.hidden = true;
    }
    clearLoadingSkeleton(table);
    clear(table);
    const searchTerm = state.dashboardTournamentSearch.trim().toLowerCase();
    const filteredTournaments = tournaments.filter(tournament => {
      const matchesSearch = !searchTerm || String(tournament.name || '').toLowerCase().includes(searchTerm);
      const matchesStatus = state.dashboardTournamentStatus === 'all' || tournament.status === state.dashboardTournamentStatus;
      return matchesSearch && matchesStatus;
    });
    const tournamentCountEl = $('#dashboard-tournament-count');
    if (tournamentCountEl) tournamentCountEl.textContent = `${filteredTournaments.length} giải đấu`;
    if (!tournaments.length) {
      tableCard.hidden = true;
      emptyState.hidden = false;
      activityHeader.hidden = !competitor;
      $('#dash-empty-title').textContent = competitor ? 'Chưa có giải đấu mở' : 'Bạn chưa tạo giải đấu nào';
      $('#dash-empty-copy').textContent = competitor
        ? 'Tạo Bot đầu tiên để sẵn sàng tham gia khi có giải đấu.'
        : 'Tạo giải đấu đầu tiên để bắt đầu tổ chức thi đấu.';
      if (competitor) {
        // Bot creation belongs to the Bot section below; keep the tournament
        // empty state focused on discovery instead of showing a duplicate CTA.
        $('#dash-empty-tournament').hidden = true;
      } else {
        $('#dash-empty-tournament').hidden = false;
      }
      return;
    }
    if (!filteredTournaments.length) {
      tableCard.hidden = false;
      emptyState.hidden = true;
      activityHeader.hidden = false;
      renderTableMessage(table, 'Không tìm thấy giải đấu phù hợp.', 5);
      return;
    }
    filteredTournaments.slice(0, 5).forEach(tournament => {
      const row = create('tr');
      const myStatus = tournament.myRequestStatus
        ? ({ pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' }[tournament.myRequestStatus] || tournament.myRequestStatus)
        : 'Chưa đăng ký';
      const nameCell = textCell(tournament.name);
      nameCell.classList.add('dashboard-tournament-name-cell');
      nameCell.dataset.label = 'Giải đấu';
      const secondaryCell = textCell(competitor ? myStatus : tournamentFormatLabel(tournament.format));
      secondaryCell.dataset.label = competitor ? 'Trạng thái tham gia' : 'Thể thức';
      const statusCell = create('td');
      statusCell.dataset.label = competitor ? 'Trạng thái giải' : 'Trạng thái';
      const displayStatus = competitor && tournament.status === 'draft'
        ? 'registration_not_open'
        : tournament.status;
      statusCell.appendChild(statusBadge(displayStatus));
      const schedule = tournament.schedule || {};
      const openCell = textCell(formatDashboardTournamentDate(schedule.registrationOpensAt || tournament.registrationOpenedAt));
      openCell.dataset.label = 'Mở đăng ký';
      const closeCell = textCell(formatDashboardTournamentDate(schedule.registrationClosesAt || tournament.registrationClosedAt));
      closeCell.dataset.label = 'Đóng đăng ký';
      const participantCell = textCell(`${tournament.participants?.length ?? tournament.participantCount ?? 0} Bot`);
      participantCell.dataset.label = 'Người tham gia';
      row.append(nameCell, secondaryCell, statusCell, openCell, closeCell, participantCell);
      const action = create('td');
      action.dataset.label = 'Mở giải đấu';
      action.appendChild(actionButton(competitor ? 'Xem chi tiết' : 'Xem', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`));
      row.appendChild(action);
      table.appendChild(row);
    });
  } catch (error) {
    if (isCurrentView('dashboard', authRevision, viewRevision)) {
      state.error = error.message || 'Không thể tải trang tổng quan.';
      $('#dash-tourney-count').textContent = '—';
      $('#dash-bot-count').textContent = '—';
      emptyState.hidden = true;
      tableCard.hidden = false;
      activityHeader.hidden = false;
      renderTableMessage(table, state.error, 5, loadDashboard);
    }
  }
  finally { state.loading.delete('dashboard'); }
}

function formatDashboardTournamentDate(value) {
  if (!value) return 'Chưa thiết lập';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa thiết lập';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZoneName: 'short',
  }).format(date);
}

/* ==================== MODULE: bots.js ==================== */
const BOT_WORKSPACE_DRAFT_KEY = 'ott_bot_workspace_draft_v1';
const BOT_WORKSPACE_SELECTION_KEY = 'ott_bot_workspace_selection_v1';

function botWorkspaceDraftUserKey() {
  return state.user?.id || state.user?.username || '';
}

function readBotWorkspaceDraft() {
  try {
    const raw = window.localStorage?.getItem(BOT_WORKSPACE_DRAFT_KEY);
    const draft = raw ? JSON.parse(raw) : null;
    return draft?.userKey === botWorkspaceDraftUserKey() ? draft : null;
  } catch {
    return null;
  }
}

function persistBotWorkspaceDraft() {
  const editor = $('#bot-source-editor');
  const nameInput = $('#bot-workspace-name');
  const runtime = $('#bot-source-runtime');
  const userKey = botWorkspaceDraftUserKey();
  if (!editor || !userKey || state.botWorkspaceReadOnly) return;
  try {
    window.localStorage?.setItem(BOT_WORKSPACE_DRAFT_KEY, JSON.stringify({
      userKey,
      botId: state.sourceWorkspaceBot?.id || null,
      name: nameInput?.value || '',
      runtimeId: runtime?.value || 'cpp',
      source: editor.value,
      updatedAt: new Date().toISOString(),
    }));
  } catch {}
}

function clearBotWorkspaceDraft() {
  try { window.localStorage?.removeItem(BOT_WORKSPACE_DRAFT_KEY); } catch {}
}

function botWorkspaceSelectionKey() {
  return `${BOT_WORKSPACE_SELECTION_KEY}:${state.user?.id || state.user?.username || 'anonymous'}`;
}

function readBotWorkspaceSelection() {
  try { return window.sessionStorage?.getItem(botWorkspaceSelectionKey()) || ''; } catch { return ''; }
}

function persistBotWorkspaceSelection(botId) {
  try {
    if (botId) window.sessionStorage?.setItem(botWorkspaceSelectionKey(), botId);
    else window.sessionStorage?.removeItem(botWorkspaceSelectionKey());
  } catch {}
}

function renderDashboardBotList(bots) {
  const list = $('#dash-bot-list');
  if (!list) return;
  clear(list);
  list.classList.toggle('is-empty', !bots.length);
  if (!bots.length) {
    const empty = create('div', { className: 'dashboard-bot-empty' });
    const botIcon = icon('icon-bot'); botIcon.classList.add('dashboard-bot-icon');
    const createBot = create('button', { className: 'primary-btn dashboard-bot-empty-action', type: 'button', text: '+ Tạo Bot đầu tiên' });
    createBot.addEventListener('click', () => openBotWorkspace());
    empty.append(botIcon, create('strong', { text: 'Bạn chưa có Bot nào' }), create('span', { text: 'Tạo Bot đầu tiên để bắt đầu xây dựng chiến thuật.' }), createBot);
    list.appendChild(empty);
    return;
  }
  const botColorPalettes = [
    'linear-gradient(135deg, #0d9488, #059669)',
    'linear-gradient(135deg, #2563eb, #1d4ed8)',
    'linear-gradient(135deg, #7c3aed, #6d28d9)',
    'linear-gradient(135deg, #d97706, #b45309)',
    'linear-gradient(135deg, #e11d48, #be123c)'
  ];
  bots.slice(0, 5).forEach((bot, index) => {
    const item = create('button', { className: 'dashboard-bot-item', type: 'button', attrs: { 'aria-label': `Xem Bot ${bot.name}` } });
    const initials = (bot.name || 'B').trim().slice(0, 2).toUpperCase();
    const identicon = create('span', { className: 'dashboard-bot-identicon', text: initials });
    identicon.style.background = botColorPalettes[index % botColorPalettes.length];
    const copy = create('span', { className: 'dashboard-bot-copy' });
    const nameStrong = create('strong', { text: bot.name });
    const runtime = bot.selectedRevision?.runtimeId || (bot.command === 'python3' ? 'python3' : 'cpp');
    const badge = create('span', {
      className: `dashboard-bot-badge ${runtime === 'python3' ? 'badge-python' : 'badge-cpp'}`,
      text: runtime === 'python3' ? 'Python' : 'C++17',
    });
    nameStrong.appendChild(badge);
    copy.append(nameStrong, create('small', { text: bot.currentRevisionId ? 'Đã có phiên bản mã nguồn' : 'Chưa có phiên bản mã nguồn' }));
    const arrow = icon('icon-arrow-right'); arrow.classList.add('dashboard-bot-arrow');
    item.append(identicon, copy, arrow);
    item.addEventListener('click', () => openBotWorkspace(bot));
    list.appendChild(item);
  });
  if (bots.length < 6) {
    const addItem = create('button', { className: 'dashboard-bot-item dashboard-bot-item-add', type: 'button', attrs: { 'aria-label': 'Tạo Bot mới' } });
    const plusIcon = icon('icon-plus'); plusIcon.classList.add('dashboard-bot-item-icon');
    const addCopy = create('span', { className: 'dashboard-bot-copy' });
    addCopy.append(create('strong', { text: '+ Tạo Bot mới' }), create('small', { text: 'Thêm chiến thuật thi đấu' }));
    addItem.append(plusIcon, addCopy);
    addItem.addEventListener('click', () => {
      openBotWorkspace();
    });
    list.appendChild(addItem);
  }
}

async function loadBots() {
  const list = $('#bots-list');
  const table = list;
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  state.loading.add('bots');
  state.error = null;
  list.classList.add('bot-grid-empty');
  $('#bots-toolbar').hidden = true;
  $('#open-bot-modal').hidden = true;
  renderLoadingSkeleton(table, 'bot-skeleton', 4);
  renderTableMessage(table, 'Đang tải danh sách Bot…', 5);
  try {
    const bots = await request('/bots');
    if (!isCurrentView('bots', authRevision, viewRevision)) return;
    state.bots = bots;
    renderBotList();
  } catch (error) { if (isCurrentView('bots', authRevision, viewRevision)) { state.error = localizeErrorMessage(error.message || 'Không thể tải Bot.'); $('#bots-count').textContent = 'Không thể tải Bot'; $('#bots-toolbar').hidden = true; $('#open-bot-modal').hidden = false; renderMessage(list, state.error, loadBots); } }
  finally { state.loading.delete('bots'); }
}

function renderBotList() {
  const list = $('#bots-list');
  const pagination = $('#bot-pagination');
  if (typeof clearLoadingSkeleton === 'function') clearLoadingSkeleton(list);
  if (pagination) pagination.hidden = true;
  const toolbar = $('#bots-toolbar');
  const createButton = $('#open-bot-modal');
  const query = state.botSearch.trim().toLocaleLowerCase();
  const bots = state.bots.filter(bot => bot.name.toLocaleLowerCase().includes(query));
  clear(list);
  if (state.sourceWorkspaceBot && !state.bots.some(bot => bot.id === state.sourceWorkspaceBot.id)) {
    state.sourceWorkspaceBot = null;
    state.sourceRevisions = [];
    state.sourceDirty = false;
    state.botWorkspaceMode = 'create';
  }
  const hasBots = state.bots.length > 0;
  list.classList.toggle('bot-grid-empty', !hasBots || !bots.length);
  toolbar.hidden = !hasBots;
  createButton.hidden = false;
  $('#bots-count').textContent = bots.length === state.bots.length ? `${state.bots.length} Bot` : `${bots.length} / ${state.bots.length} Bot`;
  if (!hasBots) {
    toolbar.hidden = true;
    createButton.hidden = true;
    return renderBotEmpty(list, 'Bạn chưa có Bot nào', 'Tạo Bot đầu tiên để xây dựng chiến thuật, quản lý phiên bản mã nguồn và tham gia giải đấu.');
  }
  if (!bots.length) return renderBotEmpty(list, 'Không tìm thấy Bot phù hợp', 'Hãy thử tên khác hoặc xóa nội dung tìm kiếm.', false);
  const pageSize = 12;
  const totalPages = Math.ceil(bots.length / pageSize);
  state.botPage = Math.min(Math.max(1, Number.isFinite(state.botPage) ? state.botPage : 1), totalPages);
  const pageStart = (state.botPage - 1) * pageSize;
  const pageBots = bots.slice(pageStart, pageStart + pageSize);
  pageBots.forEach(bot => {
    const card = create('article', { className: 'bot-card' });
    const header = create('div', { className: 'bot-card-header' });
    const identity = create('div', { className: 'bot-card-identity' });
    const botIcon = create('span', { className: 'bot-card-icon' }); botIcon.appendChild(icon('icon-bot'));
    const heading = create('div'); heading.append(create('h3', { className: 'bot-card-title', text: bot.name, title: bot.name }));
    const badges = create('div', { className: 'bot-card-badges' });
    identity.append(botIcon, heading);
    header.append(identity, badges); card.appendChild(header);
    const config = create('div', { className: 'bot-config' });
    const selectedRevision = bot.selectedRevision;
    const runtimeLabel = selectedRevision?.runtimeId === 'cpp' ? 'C++17' : selectedRevision?.runtimeId === 'python3' ? 'Python 3' : selectedRevision ? 'Phiên bản cũ' : null;
    const modeLabel = selectedRevision?.executionMode === 'strategy' ? 'Strategy SDK' : selectedRevision?.executionMode === 'raw' ? 'Mã nguồn trực tiếp' : null;
    if (runtimeLabel) badges.appendChild(create('span', { className: 'bot-card-badge', text: runtimeLabel }));
    if (modeLabel) badges.appendChild(create('span', { className: 'bot-card-badge bot-card-badge-muted', text: modeLabel }));
    const revisionLabel = selectedRevision?.label || (selectedRevision?.revisionId ? `Đã lưu · ${selectedRevision.revisionId.slice(0, 8)}` : null);
    const configRows = bot.currentRevisionId
      ? [['Ngôn ngữ', runtimeLabel || 'Đã lưu phiên bản'], ['Chế độ', modeLabel || 'Chưa xác định'], ['Phiên bản mới nhất', revisionLabel || 'Đã lưu phiên bản']]
      : [['Lệnh', bot.command], ['Tham số', bot.args.length ? bot.args.join(', ') : 'Không có tham số']];
    configRows.forEach(([label, value]) => {
      const row = create('div', { className: 'bot-config-row' }); row.append(create('span', { text: label }), create('code', { text: value })); config.appendChild(row);
    });
    card.appendChild(config);
    config.hidden = true;
    const revisionBody = create('div', { className: 'bot-card-body' });
    const revisionRow = create('div', { className: 'bot-revision-row' });
    const revisionIcon = icon('icon-git-commit-horizontal'); revisionIcon.classList.add('bot-revision-icon');
    const revisionText = create('div', { className: 'bot-revision-copy' });
    revisionText.append(
      create('span', { className: 'bot-revision-label', text: 'Phiên bản mã nguồn' }),
      create('code', { text: selectedRevision?.revisionId ? shortId(selectedRevision.revisionId) : 'Chưa có phiên bản' }),
    );
    revisionRow.append(revisionIcon, revisionText);
    revisionBody.appendChild(revisionRow);
    card.appendChild(revisionBody);
    const footer = create('div', { className: 'bot-card-footer' });
    const date = new Date(bot.registeredAt);
    footer.appendChild(create('small', {
      className: 'bot-card-date',
      text: Number.isNaN(date.getTime()) ? 'Không có ngày đăng ký' : `Đăng ký ngày ${date.toLocaleDateString('vi-VN')}`
    }));
    const actions = create('div', { className: 'bot-actions' });
    const actionIcons = ['icon-code-2', 'icon-activity', 'icon-trash-2'];
    const sourceBtn = actionButton('Mã nguồn', () => openSourceWorkspace(bot), `source-bot:${bot.id}`, 'primary-btn bot-action');
    sourceBtn.title = 'Mở trình soạn thảo mã nguồn';
    const testBtn = actionButton('Test thế cờ', () => typeof openPlaygroundForBot === 'function' ? openPlaygroundForBot(bot) : navigate('bot-playground'), `playground-bot:${bot.id}`, 'secondary-btn bot-action');
    testBtn.title = 'Kiểm tra thế cờ trong sa bàn thử nghiệm';
    const deleteBtn = actionButton('Xóa', () => openDeleteBotDialog(bot), `delete-bot:${bot.id}`, 'secondary-btn bot-action bot-delete');
    deleteBtn.title = 'Xóa Bot này';
    deleteBtn.setAttribute('aria-label', `Xóa Bot ${bot.name || ''}`);
    actions.append(sourceBtn, testBtn, deleteBtn);
    actionIcons.forEach((iconId, index) => {
      const action = actions.children[index];
      if (!action || action.querySelector('svg')) return;
      const actionIcon = icon(iconId); actionIcon.classList.add('ui-icon'); action.prepend(actionIcon);
    });
    footer.appendChild(actions); card.appendChild(footer); list.appendChild(card);
  });
  if (typeof renderBotPagination === 'function') renderBotPagination(totalPages);
}

function renderBotPagination(totalPages) {
  const pagination = $('#bot-pagination');
  if (!pagination) return;
  clear(pagination);
  if (totalPages <= 1) {
    pagination.hidden = true;
    return;
  }
  pagination.hidden = false;
  const previous = create('button', { className: 'secondary-btn bot-pagination-button', type: 'button', text: 'Trước' });
  previous.disabled = state.botPage === 1;
  previous.addEventListener('click', () => { state.botPage -= 1; renderBotList(); });
  const pageLabel = create('span', { className: 'bot-pagination-label', text: `Trang ${state.botPage} / ${totalPages}` });
  const next = create('button', { className: 'secondary-btn bot-pagination-button', type: 'button', text: 'Sau' });
  next.disabled = state.botPage === totalPages;
  next.addEventListener('click', () => { state.botPage += 1; renderBotList(); });
  pagination.append(previous, pageLabel, next);
}

function setSourceError(message = '') {
  const error = $('#bot-source-error');
  if (!error) return;
  error.textContent = message;
  error.hidden = !message;
}

function updateSourceRuntimeMeta(runtimeId) {
  const isPython = runtimeId === 'python3';
  const isLegacy = runtimeId === 'nodejs' || runtimeId === '';
  const runtimeLabel = isLegacy ? 'JavaScript phiên bản cũ' : isPython ? 'Python 3' : 'C++17';
  const filename = $('#bot-source-filename');
  const help = $('#bot-source-help');
  const sourceFile = $('#bot-source-file');
  if (filename) filename.textContent = isLegacy ? 'main.js' : isPython ? 'main.py' : 'main.cpp';
  if (help) help.textContent = `${runtimeLabel} · UTF-8 · Tối đa 64 KiB`;
  if (sourceFile) {
    sourceFile.accept = isPython ? '.py,text/x-python' : '.cpp,text/x-c++';
    // Uploading from an immutable revision creates an editable draft; the
    // persisted revision itself remains read-only and unchanged.
    sourceFile.disabled = false;
  }
}

async function importBotSourceFile(event) {
  const input = event?.target || $('#bot-source-file');
  const file = input?.files?.[0];
  if (!file) return;
  const runtimeId = $('#bot-source-runtime')?.value;
  const extension = runtimeId === 'python3' ? '.py' : '.cpp';
  const runtimeLabel = runtimeId === 'python3' ? 'Python 3' : 'C++17';
  const resetInput = () => { if (input) input.value = ''; };
  if (!file.name.toLowerCase().endsWith(extension)) {
    setSourceError(`File không khớp với ngôn ngữ ${runtimeLabel}. Hãy chọn file ${extension}.`);
    resetInput();
    return;
  }
  if (file.size > 64 * 1024) {
    setSourceError('Mã nguồn không được vượt quá 64 KiB.');
    resetInput();
    return;
  }
  try {
    if (state.botWorkspaceReadOnly && state.botWorkspaceMode !== 'create') {
      const revision = currentPracticeRevision();
      if (revision) await loadRevisionSource(revision, 'draft', false);
      else {
        state.botWorkspaceReadOnly = false;
        $('#bot-source-editor').readOnly = false;
        state.botWorkspaceDraftBase = null;
      }
    }
    let source;
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      throw new Error('File phải được mã hóa UTF-8.');
    }
    if (!source.trim()) throw new Error('File mã nguồn không được để trống.');
    $('#bot-source-editor').value = source;
    const github = $('#bot-github-url');
    if (github) github.value = '';
    setSourceError('');
    setSourceDirty(true);
    updateEditorMetrics();
    syncSourceEditorTools();
    setWorkspaceStatus(`Đã tải ${file.name}`);
  } catch (error) {
    setSourceError(error?.message || 'Không thể đọc file mã nguồn.');
  } finally {
    resetInput();
  }
}

function switchSourceRuntime(runtimeId) {
  if (!['cpp', 'python3'].includes(runtimeId)) return;
  const select = $('#bot-source-runtime');
  const editor = $('#bot-source-editor');
  if (!select || !editor) return;
  if (state.botWorkspaceReadOnly) {
    select.value = state.sourceRuntime || select.value;
    return;
  }
  const currentRuntime = state.sourceRuntime || select.value || 'cpp';
  state.sourceRuntimeDrafts.set(currentRuntime, { source: editor.value, dirty: state.sourceDirty });
  state.sourceRuntime = runtimeId;
  select.value = runtimeId;
  const draft = state.sourceRuntimeDrafts.get(runtimeId);
  editor.value = draft?.source ?? STRATEGY_TEMPLATES[runtimeId] ?? '';
  updateSourceRuntimeMeta(runtimeId);
  if (typeof updateEditorMetrics === 'function') updateEditorMetrics();
  setSourceDirty(draft?.dirty ?? Boolean(editor.value));
}

function updateSourceModeMeta(executionMode = '', sdkVersion = '') {
  const mode = $('#bot-source-mode');
  if (!mode) return;
  if (executionMode === 'strategy') mode.textContent = sdkVersion ? `Strategy SDK ${sdkVersion}` : 'Strategy SDK';
  else if (executionMode === 'raw') mode.textContent = 'Mã nguồn trực tiếp';
  else mode.textContent = 'Chưa có phiên bản';
}

function updateEditorMetrics() {
  const editor = $('#bot-source-editor');
  const gutter = $('#bot-source-lines');
  if (!editor) return;
  const lineCount = Math.max(1, editor.value.split('\n').length);
  if (gutter) {
    gutter.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');
    gutter.scrollTop = editor.scrollTop;
  }
  syncSourceEditorTools();
}

function renderSourceHighlight(container, source) {
  clear(container);
  if (!source) {
    container.appendChild(document.createTextNode(' '));
    return;
  }
  const tokenPattern = /(\/\/[^\n]*|#[^\n]*|\#[a-zA-Z_][\w]*|"[^"\n]*"|'[^'\n]*'|\b\d+(?:\.\d+)?\b|\b(?:class|def|return|if|else|elif|for|while|in|import|from|as|True|False|None|and|or|not|using|namespace|const|auto|int|string|bool|void|struct|vector|return|include|public|private|new)\b)/g;
  let lastIndex = 0;
  let match;
  while ((match = tokenPattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(source.slice(lastIndex, match.index)));
    }
    const token = match[0];
    let className = 'code-keyword';
    if (token.startsWith('//') || token.startsWith('#')) className = 'code-comment';
    else if (token.startsWith('"') || token.startsWith("'")) className = 'code-string';
    else if (/^\d/.test(token)) className = 'code-number';
    container.appendChild(create('span', { className, text: token }));
    lastIndex = tokenPattern.lastIndex;
  }
  if (lastIndex < source.length) {
    container.appendChild(document.createTextNode(source.slice(lastIndex)));
  }
}

function sourceSyntaxCheck(source, runtimeId) {
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  let quote = null;
  let escaped = false;
  const lines = source.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    let comment = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (comment) continue;
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") quote = character;
      else if (character === '/' && line[index + 1] === '/') { comment = true; index += 1; }
      else if (character === '#') comment = true;
      else if (['(', '[', '{'].includes(character)) stack.push({ character, line: lineIndex + 1 });
      else if (pairs[character]) {
        const last = stack.pop();
        if (!last || last.character !== pairs[character]) return `Dấu ngoặc không khớp ở dòng ${lineIndex + 1}`;
      }
    }
  }
  if (quote) return 'Chuỗi ký tự chưa được đóng';
  if (stack.length) return `Dấu ngoặc chưa đóng ở dòng ${stack[stack.length - 1].line}`;
  if (runtimeId === 'python3' && lines.some(line => /:\s*[^#]/.test(line) && line.trim().endsWith(':') === false && /^\s+(if|for|while|def|class)\b/.test(line))) return '';
  return '';
}

function syncSourceEditorTools() {
  const editor = $('#bot-source-editor');
  if (!editor) return;
  const highlight = $('#bot-source-highlight');
  if (highlight) {
    renderSourceHighlight(highlight, editor.value);
    highlight.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
  }
  const before = editor.value.slice(0, editor.selectionStart);
  const line = before.split('\n').length;
  const column = before.length - before.lastIndexOf('\n');
  const position = $('#source-cursor-position'); if (position) position.textContent = `Dòng ${line}, cột ${column}`;
  const bytes = new TextEncoder().encode(editor.value).byteLength;
  const byteCount = $('#source-byte-count'); if (byteCount) { byteCount.textContent = `${Math.ceil(bytes / 1024 * 10) / 10} / 64 KiB`; byteCount.classList.toggle('is-invalid', bytes > 64 * 1024); }
  const syntax = $('#source-syntax-status');
  if (syntax) { const message = sourceSyntaxCheck(editor.value, $('#bot-source-runtime')?.value); syntax.textContent = message || 'Cú pháp cơ bản hợp lệ'; syntax.title = message || ''; syntax.classList.toggle('is-invalid', Boolean(message)); syntax.classList.toggle('is-valid', !message); }
}

function sourceIndentOnEnter(editor) {
  const start = editor.selectionStart;
  const lineStart = editor.value.lastIndexOf('\n', start - 1) + 1;
  const currentLine = editor.value.slice(lineStart, start);
  const indent = currentLine.match(/^\s*/)?.[0] || '';
  const extra = /(?:\{|:\s*)$/.test(currentLine.trim()) ? '  ' : '';
  const next = editor.value[start] === '}' || editor.value[start] === ']' || editor.value[start] === ')' ? indent.slice(0, -2) : indent;
  editor.setRangeText(`\n${next}${extra}`, start, editor.selectionEnd, 'end');
}

function sourceInsertPair(editor, open, close) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  editor.setRangeText(open + editor.value.slice(start, end) + close, start, end, 'end');
  editor.selectionStart = start + 1;
  editor.selectionEnd = end + 1;
}

function formatSourceCode() {
  const editor = $('#bot-source-editor'); if (!editor || editor.readOnly) return;
  const runtimeId = $('#bot-source-runtime')?.value;
  const lines = editor.value.split('\n');
  let level = 0;
  const formatted = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (runtimeId === 'cpp') {
      if (trimmed.startsWith('}')) level = Math.max(0, level - 1);
      const output = `${'  '.repeat(level)}${trimmed}`;
      if (trimmed.endsWith('{')) level += 1;
      return output;
    }
    return `${line.match(/^\s*/)?.[0] || ''}${trimmed}`;
  });
  editor.value = formatted.join('\n');
  updateEditorMetrics(); setSourceDirty(true);
}

function setWorkspaceStatus(text) {
  const status = $('#bot-source-status');
  if (status) status.textContent = text;
}

function syncWorkspaceStatus() {
  if (state.botWorkspaceReadOnly) setWorkspaceStatus('Chỉ đọc · Phiên bản bất biến');
  else if (state.sourceDirty) setWorkspaceStatus('Chưa lưu thay đổi');
  else setWorkspaceStatus(state.sourceWorkspaceBot ? 'Bản nháp mới' : 'Bản nháp mới');
}

function hasUnsavedBotWorkspaceChanges() {
  if (!state.sourceDirty) return false;
  const editor = $('#bot-source-editor');
  const runtime = $('#bot-source-runtime');
  const name = $('#bot-workspace-name');
  const githubUrl = $('#bot-github-url');
  return Boolean(editor && runtime && name && (
    editor.value !== state.sourceInitialSource
    || runtime.value !== state.sourceInitialRuntime
    || name.value.trim() !== state.sourceInitialName
    || Boolean(githubUrl?.value.trim())
  ));
}

function setSourceDirty(dirty) {
  state.sourceDirty = dirty;
  const marker = $('#bot-source-dirty');
  const saveButton = $('#save-bot-source');
  if (marker) marker.hidden = !dirty;
  if (saveButton) {
    const nameChanged = ($('#bot-workspace-name')?.value.trim() || '') !== state.botWorkspaceInitialName;
    const hasSource = Boolean($('#bot-source-editor')?.value.trim() || $('#bot-github-url')?.value.trim());
    saveButton.disabled = state.botWorkspaceMode === 'create' ? !hasSource : !(dirty || nameChanged);
  }
  if (dirty) persistBotWorkspaceDraft();
  updatePracticeButton();
  syncWorkspaceStatus();
  if (typeof syncBotWorkspaceNotice === 'function') syncBotWorkspaceNotice();
}

function currentPracticeRevision() {
  const bot = state.sourceWorkspaceBot;
  return state.sourceRevisions.find(revision => revision.selected || revision.revisionId === bot?.currentRevisionId)
    || state.sourceRevisions.find(revision => ['cpp', 'python3'].includes(revision.runtimeId));
}

function updatePracticeButton() {
  const button = $('#run-bot-practice');
  if (!button) return;
  button.disabled = false;
  button.title = state.sourceDirty ? 'Hãy lưu phiên bản hiện tại trước khi chạy thử' : 'Đấu với Bot hệ thống cố định';
}

function renderRevisionList() {
  const list = $('#bot-revision-list');
  clear(list);
  $('#bot-revision-count').textContent = state.sourceRevisions.length ? `${state.sourceRevisions.length} phiên bản` : '0';
  if (!state.sourceRevisions.length) {
    const empty = create('div', { className: 'bot-revision-empty' });
    const emptyIcon = icon('icon-git-commit-horizontal');
    emptyIcon.classList.add('bot-revision-empty-icon');
    empty.append(emptyIcon, create('strong', { text: 'Chưa có phiên bản' }), create('span', { text: 'Tạo Bot để bắt đầu lưu các phiên bản mã nguồn.' }));
    list.appendChild(empty);
    return;
  }
  state.sourceRevisions.forEach(revision => {
    const item = create('article', { className: `bot-revision-item${revision.selected ? ' selected' : ''}` });
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    const activateRevision = () => revision.selected ? loadRevisionSource(revision, 'draft') : selectRevision(revision);
    const selectFromCard = event => {
      if (event.target.closest('button, details, a, input, select, textarea')) return;
      void activateRevision();
    };
    item.addEventListener('click', selectFromCard);
    item.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button, details, a, input, select, textarea')) {
        event.preventDefault();
        void activateRevision();
      }
    });
    const date = new Date(revision.createdAt);
    const meta = create('div', { className: 'bot-revision-meta' });
    const runtimeLabel = revision.runtimeId === 'cpp' ? 'C++17' : revision.runtimeId === 'python3' ? 'Python 3' : 'Node.js phiên bản cũ';
    meta.append(create('strong', { text: `${runtimeLabel} · ${revision.label || `Phiên bản ${revision.revisionId.slice(0, 8)}`}` }), create('span', { text: Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN') }));
    item.appendChild(meta);
    const technical = create('details', { className: 'bot-revision-technical' });
    technical.appendChild(create('summary', { text: 'Chi tiết kỹ thuật' }));
    if (revision.sourceDigest) technical.appendChild(create('div', { className: 'bot-revision-digest', text: `Mã nguồn · ${String(revision.sourceDigest).slice(0, 12)}…` }));
    if (revision.githubRepositoryUrl || revision.githubCommitSha) {
      const repository = revision.githubRepositoryUrl ? ` · ${revision.githubRepositoryUrl}` : '';
      const commit = revision.githubCommitSha ? ` · commit ${String(revision.githubCommitSha).slice(0, 12)}…` : '';
      technical.appendChild(create('div', { className: 'bot-revision-digest bot-revision-github', text: `Nguồn GitHub${repository}${commit}` }));
    }
    if (revision.executionMode) technical.appendChild(create('div', { className: 'bot-revision-digest', text: `Chế độ: ${revision.executionMode === 'strategy' ? 'Strategy SDK' : 'Mã nguồn trực tiếp'}` }));
    if (revision.sdkVersion) technical.appendChild(create('div', { className: 'bot-revision-digest', text: `SDK ${revision.sdkVersion}${revision.sdkDigest ? ` · ${revision.sdkDigest}` : ''}` }));
    item.appendChild(technical);
    const actions = create('div', { className: 'bot-revision-actions' });
    if (['cpp', 'python3'].includes(revision.runtimeId)) actions.appendChild(actionButton('Tạo bản nháp', () => void loadRevisionSource(revision, 'draft'), `draft-revision:${revision.revisionId}`, 'secondary-btn bot-action'));
    actions.appendChild(actionButton('Xóa', () => openDeleteRevisionDialog(revision), `delete-revision:${revision.revisionId}`, 'secondary-btn bot-action bot-delete'));
    item.appendChild(actions);
    list.appendChild(item);
  });
  updatePracticeButton();
}

function openDeleteRevisionDialog(revision) {
  state.deletingRevision = revision;
  state.revisionDeleteDialogRevision += 1;
  $('#delete-revision-name').textContent = revision.label || revision.revisionId.slice(0, 8);
  $('#delete-revision-error').textContent = '';
  $('#delete-revision-error').hidden = true;
  openModal('delete-revision-modal');
}

async function deleteRevision() {
  const revision = state.deletingRevision;
  const bot = state.sourceWorkspaceBot;
  if (!bot || !revision) return;
  const dialogRevision = state.revisionDeleteDialogRevision;
  let failure = null;
  try {
    await runPending(`confirm-delete-revision:${revision.revisionId}`, $('#confirm-delete-revision'), async () => {
      try { await api(`/bots/${bot.id}/revisions/${revision.revisionId}`, { method: 'DELETE' }); }
      catch (error) { failure = error; throw error; }
    });
    if (failure) throw failure;
    if (state.revisionDeleteDialogRevision !== dialogRevision) return;
    closeModal('delete-revision-modal');
    await loadBotRevisions(bot);
    showToast('Đã xóa phiên bản.', 'success');
  } catch (error) {
    if (state.revisionDeleteDialogRevision === dialogRevision) {
      $('#delete-revision-error').textContent = localizeErrorMessage(error.message || 'Không thể xóa phiên bản.');
      $('#delete-revision-error').hidden = false;
    }
  }
}

function syncBotWorkspaceNotice() {
  const notice = $('#bot-workspace-notice');
  const title = $('#bot-workspace-notice-title');
  const text = $('#bot-workspace-notice-text');
  const actions = $('#bot-workspace-notice-actions');
  const shell = $('.bot-editor-panel .source-editor-shell');
  const editor = $('#bot-source-editor');
  if (!notice || !title || !text) return;
  const mode = state.botWorkspaceMode;
  const isReadOnly = Boolean(state.botWorkspaceReadOnly);
  notice.classList.remove('is-readonly', 'is-draft');
  if (shell) shell.classList.toggle('is-readonly', isReadOnly);
  if (editor) editor.title = isReadOnly ? 'Nhấp vào khung mã nguồn để tạo bản nháp và bắt đầu chỉnh sửa' : '';
  clear(text);
  if (mode === 'create') {
    title.textContent = 'Hướng dẫn tạo Bot mới';
    text.append(
      document.createTextNode('Nhập '),
      create('strong', { text: 'Tên Bot' }),
      document.createTextNode(', nhấp trực tiếp vào khung mã nguồn bên dưới để tùy biến chiến thuật (hoặc tải file / nạp từ GitHub), sau đó nhấn '),
      create('strong', { text: 'Tạo Bot' }),
      document.createTextNode('.')
    );
    if (actions) actions.hidden = true;
  } else if (isReadOnly) {
    notice.classList.add('is-readonly');
    title.textContent = 'Phiên bản đã lưu (Chế độ chỉ đọc)';
    text.append(
      document.createTextNode('Phiên bản này đang ở chế độ chỉ đọc. '),
      create('strong', { text: 'Nhấp vào khung mã nguồn' }),
      document.createTextNode(' hoặc bấm nút bên phải để tạo bản nháp và bắt đầu chỉnh sửa.')
    );
    if (actions) actions.hidden = false;
  } else {
    notice.classList.add('is-draft');
    title.textContent = 'Đang chỉnh sửa bản nháp';
    text.append(
      document.createTextNode('Bạn đang chỉnh sửa mã nguồn cho phiên bản tiếp theo. Nhấp vào khung soạn thảo để viết code. Khi hoàn tất, nhấn '),
      create('strong', { text: 'Lưu phiên bản' }),
      document.createTextNode(' ở góc trên.')
    );
    if (actions) actions.hidden = true;
  }
}
async function unlockDraftFromNotice() {
  const revision = typeof currentPracticeRevision === 'function' ? currentPracticeRevision() : null;
  if (revision) {
    await loadRevisionSource(revision, 'draft', false);
    if (typeof showToast === 'function') showToast('Đã kích hoạt chế độ tạo bản nháp. Bạn có thể chỉnh sửa mã nguồn ngay.', 'info');
    $('#bot-source-editor')?.focus();
  } else {
    state.botWorkspaceReadOnly = false;
    const editor = $('#bot-source-editor');
    if (editor) {
      editor.readOnly = false;
      editor.focus();
    }
    setWorkspaceStatus('Bản nháp mới');
    syncBotWorkspaceNotice();
  }
}

async function loadRevisionSource(revision, mode = 'view', confirmBeforeReplace = true) {
  if (confirmBeforeReplace && hasUnsavedBotWorkspaceChanges() && !window.confirm('Bạn có thay đổi chưa lưu. Tiếp tục sẽ thay thế nội dung hiện tại?')) return;
  setSourceError();
  try {
    const result = await request(`/bots/${revision.botId}/revisions/${revision.revisionId}`);
    $('#bot-source-editor').value = result.source;
    updateEditorMetrics();
    $('#bot-source-runtime').value = ['cpp', 'python3'].includes(revision.runtimeId) ? revision.runtimeId : '';
    state.sourceRuntime = $('#bot-source-runtime').value || 'cpp';
    state.sourceInitialSource = result.source;
    state.sourceInitialRuntime = state.sourceRuntime;
    updateSourceRuntimeMeta($('#bot-source-runtime').value);
    updateSourceModeMeta(revision.executionMode, revision.sdkVersion);
    state.sourceExecutionMode = revision.executionMode || 'raw';
    state.botWorkspaceReadOnly = mode !== 'draft';
    state.botWorkspaceDraftBase = mode === 'draft' ? revision.revisionId : null;
    $('#bot-source-editor').readOnly = state.botWorkspaceReadOnly;
    setWorkspaceStatus(state.botWorkspaceReadOnly ? 'Chỉ đọc · Phiên bản bất biến' : 'Bản nháp từ phiên bản đã lưu');
    if (typeof syncBotWorkspaceNotice === 'function') syncBotWorkspaceNotice();
    // Opening a revision as an editable draft does not itself change the
    // source. Mark it dirty only after the editor emits an input event.
    setSourceDirty(false);
  } catch (error) { setSourceError(error.message || 'Không thể đọc phiên bản mã nguồn.'); }
}

async function loadBotRevisions(bot) {
  state.sourceRevisions = await request(`/bots/${bot.id}/revisions`);
  renderRevisionList();
  const selected = state.sourceRevisions.find(revision => revision.selected);
  if (selected) await loadRevisionSource(selected, 'view', false);
  else {
    $('#bot-source-editor').value = STRATEGY_TEMPLATES.cpp;
    $('#bot-source-editor').readOnly = false;
    state.botWorkspaceReadOnly = false;
    const sourceFile = $('#bot-source-file');
    if (sourceFile) sourceFile.disabled = false;
    state.sourceExecutionMode = 'strategy';
    updateSourceModeMeta('strategy', '1.0.0');
    setWorkspaceStatus('Bản nháp mới');
    // Loading the starter template is not a user edit. Only subsequent
    // input/runtime changes should make the workspace dirty.
    setSourceDirty(false);
  }
  if (typeof syncBotWorkspaceNotice === 'function') syncBotWorkspaceNotice();
}

function enhanceBotWorkspaceIcons() {
  const saveButton = $('#save-bot-source');
  if (saveButton && !saveButton.querySelector('svg')) {
    const saveIcon = icon('icon-save'); saveIcon.classList.add('ui-icon'); saveButton.prepend(saveIcon);
  }
  const editorHead = $('.bot-editor-panel .editor-panel-head');
  if (editorHead && !editorHead.querySelector('.workspace-file-icon')) {
    const fileIcon = icon('icon-file-code-2'); fileIcon.classList.add('workspace-file-icon'); editorHead.prepend(fileIcon);
  }
  const revisionHead = $('.bot-revision-heading');
  if (revisionHead && !revisionHead.querySelector('.workspace-revision-icon')) {
    const revisionIcon = icon('icon-git-commit-horizontal'); revisionIcon.classList.add('workspace-revision-icon'); revisionHead.prepend(revisionIcon);
  }
}

function renderBotWorkspacePicker(selectedBotId = '') {
  const picker = $('#bot-workspace-picker');
  if (!picker) return;
  picker.replaceChildren(new Option('Tạo Bot mới', ''));
  state.bots.forEach(bot => picker.appendChild(new Option(bot.name, bot.id)));
  picker.value = selectedBotId || '';
  picker.disabled = state.bots.length === 0;
}

async function ensureBotWorkspaceBots(force = false) {
  if (!force && (state.bots.length || state.user?.role !== 'competitor')) return;
  try {
    state.bots = await request('/bots');
  } catch {
    // The workspace can still create a new Bot when the list request fails.
    state.bots = [];
  }
}

async function restoreBotWorkspace() {
  await ensureBotWorkspaceBots(true);
  const selectedBot = state.bots.find(bot => bot.id === readBotWorkspaceSelection()) || null;
  await openBotWorkspace(selectedBot);
}

async function openBotWorkspace(bot = null) {
  if (state.activeView !== 'bot-workspace') state.botWorkspaceSource = state.activeView;
  if (hasUnsavedBotWorkspaceChanges() && state.sourceWorkspaceBot?.id !== bot?.id && !window.confirm('Bạn có thay đổi chưa lưu. Tiếp tục sẽ đóng nội dung hiện tại?')) return;
  state.botWorkspaceMode = bot ? 'edit' : 'create';
  state.sourceWorkspaceBot = bot;
  state.botWorkspaceReadOnly = false;
  state.sourceExecutionMode = bot ? 'raw' : 'strategy';
  persistBotWorkspaceSelection(bot?.id || '');
  const savedDraft = readBotWorkspaceDraft();
  const useDraft = Boolean(savedDraft && (!bot ? !savedDraft.botId : savedDraft.botId === bot.id));
  state.botWorkspaceDraftBase = null;
  const pendingInitial = !bot && state.pendingInitialRevision;
  if (!bot && !pendingInitial) state.pendingInitialRevision = null;
  if (!navigate('bot-workspace')) return;
  await ensureBotWorkspaceBots();
  renderBotWorkspacePicker(bot?.id || '');
  enhanceBotWorkspaceIcons();
  const pageTitle = $('#page-title');
  if (pageTitle) pageTitle.textContent = bot ? 'Chỉnh sửa Bot' : 'Tạo Bot';
  $('#bot-workspace-name').value = useDraft ? savedDraft.name : (bot?.name || '');
  state.botWorkspaceInitialName = bot?.name || '';
  $('#save-bot-source').textContent = bot ? 'Lưu phiên bản' : 'Tạo Bot';
  $('#bot-source-runtime').value = useDraft ? savedDraft.runtimeId : 'cpp';
  $('#bot-github-url').value = '';
  state.sourceRuntime = useDraft ? savedDraft.runtimeId : 'cpp';
  state.sourceInitialRuntime = $('#bot-source-runtime').value;
  state.sourceInitialName = bot?.name || '';
  updateSourceRuntimeMeta(state.sourceRuntime);
  updateSourceModeMeta(bot ? '' : 'strategy', bot ? '' : '1.0.0');
  $('#bot-source-editor').value = useDraft ? savedDraft.source : (bot ? '' : STRATEGY_TEMPLATES.cpp);
  state.sourceInitialSource = $('#bot-source-editor').value;
  updateEditorMetrics();
  $('#bot-source-editor').readOnly = false;
  const sourceFile = $('#bot-source-file'); if (sourceFile) sourceFile.disabled = false;
  setWorkspaceStatus(bot ? 'Đang chuẩn bị bản nháp' : 'Bản nháp mới');
  // A new workspace starts with a built-in template. Loading that template is
  // not a user change, so leaving immediately must not show an unsaved warning.
  setSourceDirty(useDraft);
  if (pendingInitial) {
    $('#bot-workspace-name').value = pendingInitial.bot.name;
    $('#bot-source-runtime').value = pendingInitial.runtimeId;
    $('#bot-source-editor').value = pendingInitial.source;
    updateEditorMetrics();
    $('#save-bot-source').textContent = 'Thử lưu mã nguồn';
    setSourceDirty(true);
  }
  setSourceError();
  if (bot) {
    try { await loadBotRevisions(bot); }
    catch (error) { state.sourceRevisions = []; renderRevisionList(); setSourceError(error.message || 'Không thể tải lịch sử phiên bản.'); }
  } else {
    state.sourceRevisions = [];
    renderRevisionList();
  }
  if (useDraft) {
    $('#bot-source-editor').value = savedDraft.source;
    $('#bot-source-runtime').value = savedDraft.runtimeId;
    state.sourceRuntime = savedDraft.runtimeId;
    updateSourceRuntimeMeta(savedDraft.runtimeId);
    updateEditorMetrics();
    setSourceDirty(true);
  }
  if (typeof syncBotWorkspaceNotice === 'function') syncBotWorkspaceNotice();
  (bot ? $('#bot-source-editor') : $('#bot-workspace-name')).focus();
}

function openSourceWorkspace(bot) { return openBotWorkspace(bot); }

async function saveBotSource() {
  const bot = state.sourceWorkspaceBot;
  if (!bot || state.botWorkspaceReadOnly) return;
  const source = $('#bot-source-editor').value;
  const runtimeId = $('#bot-source-runtime').value;
  setSourceError();
  if (!source.trim()) return setSourceError('Mã nguồn không được để trống.');
  if (!['cpp', 'python3'].includes(runtimeId)) return setSourceError('Hãy chọn C++17 hoặc Python 3 cho phiên bản mới.');
  if (new TextEncoder().encode(source).byteLength > 64 * 1024) return setSourceError('Mã nguồn không được vượt quá 64 KiB.');
  setWorkspaceStatus('Đang lưu phiên bản…');
  const result = await runPending(`save-source:${bot.id}`, $('#save-bot-source'), async () => {
    let revision = state.pendingSourceRevision?.revision || null;
    try {
      revision = revision || await api(`/bots/${bot.id}/revisions`, { method: 'POST', body: JSON.stringify({ source, runtimeId, executionMode: state.sourceExecutionMode }) });
      state.pendingSourceRevision = { revision, source };
      await api(`/bots/${bot.id}/revisions/${revision.revisionId}/select`, { method: 'POST', body: JSON.stringify({}) });
      state.pendingSourceRevision = null;
      setSourceDirty(false);
      if (typeof clearBotWorkspaceDraft === 'function') clearBotWorkspaceDraft();
      await loadBotRevisions(bot);
      showToast('Đã lưu phiên bản mã nguồn.', 'success');
    } catch (error) { setSourceError(error.message || 'Không thể lưu phiên bản mã nguồn.'); setSourceDirty(true); setWorkspaceStatus('Lưu thất bại · Kiểm tra lỗi bên dưới'); throw error; }
    return true;
  });
  return result === true;
}

async function selectRevision(revision) {
  const bot = state.sourceWorkspaceBot;
  if (!bot) return;
  if (hasUnsavedBotWorkspaceChanges() && !window.confirm('Bạn có thay đổi chưa lưu. Chọn phiên bản này sẽ thay thế nội dung hiện tại. Tiếp tục?')) return;
  try {
    await api(`/bots/${bot.id}/revisions/${revision.revisionId}/select`, { method: 'POST', body: JSON.stringify({}) });
    bot.currentRevisionId = revision.revisionId;
    await loadBotRevisions(bot);
    await loadRevisionSource(revision, 'draft', false);
    showToast('Đã chọn phiên bản mã nguồn.', 'success');
  } catch (error) { setSourceError(error.message || 'Không thể chọn phiên bản mã nguồn.'); }
}


function showBotFormError(message, field = null) {
  const error = field === 'bot-workspace-name' ? $('#bot-name-error') : $('#bot-source-error');
  const nameError = $('#bot-name-error');
  const sourceError = $('#bot-source-error');
  ['bot-workspace-name', 'bot-source-runtime', 'bot-source-editor', 'bot-github-url', 'bot-source-file'].forEach(id => document.getElementById(id)?.removeAttribute('aria-invalid'));
  if (field) document.getElementById(field)?.setAttribute('aria-invalid', 'true');
  if (nameError && nameError !== error) { nameError.textContent = ''; nameError.hidden = true; }
  if (sourceError && sourceError !== error) { sourceError.textContent = ''; sourceError.hidden = true; }
  error.textContent = message;
  error.hidden = false;
}
function clearBotFormError() {
  const error = $('#bot-source-error');
  const nameError = $('#bot-name-error');
  ['bot-workspace-name', 'bot-source-runtime', 'bot-source-editor', 'bot-github-url', 'bot-source-file'].forEach(id => document.getElementById(id)?.removeAttribute('aria-invalid'));
  error.textContent = '';
  error.hidden = true;
  if (nameError) { nameError.textContent = ''; nameError.hidden = true; }
}

function botNameInput() {
  const name = $('#bot-workspace-name').value.trim();
  if (!name || name.length > 50) return { error: 'Tên Bot phải có từ 1 đến 50 ký tự.', field: 'bot-workspace-name' };
  return { name };
}

function botSourceInput() {
  const runtimeId = $('#bot-source-runtime').value;
  const source = $('#bot-source-editor').value;
  const githubUrl = $('#bot-github-url')?.value.trim();
  if (!['cpp', 'python3'].includes(runtimeId)) return { error: 'Hãy chọn C++17 hoặc Python 3.', field: 'bot-source-runtime' };
  if (githubUrl) {
    try { parseClientGithubUrl(githubUrl); }
    catch { return { error: 'URL GitHub không hợp lệ hoặc không trỏ tới main.cpp/main.py công khai.', field: 'bot-github-url' }; }
    return { runtimeId, githubUrl };
  }
  if (!source.trim()) return { error: 'Mã nguồn không được để trống.', field: 'bot-source-editor' };
  if (new TextEncoder().encode(source).byteLength > 64 * 1024) return { error: 'Mã nguồn không được vượt quá 64 KiB.', field: 'bot-source-editor' };
  const syntaxError = sourceSyntaxCheck(source, runtimeId);
  if (syntaxError) return { error: syntaxError, field: 'bot-source-editor' };
  return { runtimeId, source };
}

async function resolveGitHubSource(sourceInput) {
  const parsed = parseClientGithubUrl(sourceInput.githubUrl);
  const candidates = await clientGithubCandidates(parsed, sourceInput.runtimeId);
  const compatible = candidates.filter(item => item.filename === (sourceInput.runtimeId === 'cpp' ? 'main.cpp' : 'main.py'));
  if (!compatible.length) throw new Error(`Repository không có file ${sourceInput.runtimeId === 'cpp' ? 'main.cpp' : 'main.py'} ở thư mục gốc.`);
  if (parsed.kind === 'file' && compatible[0].filename !== parsed.filename) throw new Error('File GitHub không khớp với ngôn ngữ đã chọn.');
  const selected = compatible[0];
  const source = await readClientGithubText(await fetch(selected.rawUrl, { credentials: 'omit', mode: 'cors', redirect: 'error' }));
  if (!source.trim()) throw new Error('File mã nguồn GitHub đang trống.');
  const syntaxError = sourceSyntaxCheck(source, sourceInput.runtimeId);
  if (syntaxError) throw new Error(syntaxError);
  const commitSha = /^[0-9a-f]{40}$/i.test(selected.ref) ? selected.ref.toLowerCase() : null;
  return { source, selected, commitSha };
}

async function saveGitHubRevision(bot, sourceInput) {
  const { source, selected, commitSha } = await resolveGitHubSource(sourceInput);
  const body = { source, runtimeId: sourceInput.runtimeId, executionMode: state.sourceExecutionMode };
  if (selected.repositoryUrl && commitSha) Object.assign(body, { githubRepositoryUrl: selected.repositoryUrl, githubCommitSha: commitSha });
  const revision = await api(`/bots/${bot.id}/revisions`, { method: 'POST', body: JSON.stringify(body) });
  await api(`/bots/${bot.id}/revisions/${revision.revisionId}/select`, { method: 'POST', body: JSON.stringify({}) });
  return { ...revision, githubCommitSha: commitSha };
}

async function loadGitHubSourceIntoEditor() {
  const sourceInput = botSourceInput();
  if (sourceInput.error) return showBotFormError(sourceInput.error, sourceInput.field);
  const button = $('#load-github-source');
  await runPending('load-github-source', button, async () => {
    if (state.botWorkspaceReadOnly && state.botWorkspaceMode !== 'create') {
      const revision = currentPracticeRevision();
      if (revision) await loadRevisionSource(revision, 'draft', false);
    }
    const { source, selected } = await resolveGitHubSource(sourceInput);
    $('#bot-source-editor').value = source;
    setSourceError('');
    setSourceDirty(true);
    updateEditorMetrics();
    syncSourceEditorTools();
    setWorkspaceStatus(`Đã nạp ${selected.filename} từ GitHub · Chưa lưu`);
    showToast('Đã nạp mã nguồn vào editor. Hãy kiểm tra trước khi lưu.', 'success');
  });
}

function openBotDialog(bot = null) {
  return openBotWorkspace(bot);
}

async function saveInitialRevision(bot, source, runtimeId, existingRevision = null) {
  const revision = existingRevision || await api(`/bots/${bot.id}/revisions`, {
    method: 'POST',
    body: JSON.stringify({ source, runtimeId, executionMode: 'strategy' }),
  });
  await api(`/bots/${bot.id}/revisions/${revision.revisionId}/select`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return revision;
}

async function submitBot() {
  const button = $('#save-bot-source');
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const editingBot = state.sourceWorkspaceBot;
  const isBotView = () => isCurrentView('bot-workspace', authRevision, viewRevision);
  const nameInput = botNameInput();
  clearBotFormError();
  if (nameInput.error) return showBotFormError(nameInput.error, nameInput.field);
  const sourceInput = editingBot && !state.sourceDirty ? null : botSourceInput();
  if (sourceInput?.error) return showBotFormError(sourceInput.error, sourceInput.field);
  let operationSucceeded = false;
  let createdBot = null;
  await runPending(editingBot ? `save-bot:${editingBot.id}` : 'create-bot', button, async () => {
    if (editingBot) {
      try {
        if (nameInput.name !== editingBot.name) await api(`/bots/${editingBot.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: nameInput.name, command: editingBot.command, args: editingBot.args }),
        });
        if (sourceInput?.githubUrl) {
          setWorkspaceStatus('Đang tải mã nguồn từ GitHub…');
          const revision = await saveGitHubRevision(editingBot, sourceInput);
          $('#bot-github-url').value = '';
          setSourceDirty(false);
          await loadBotRevisions(editingBot);
          const revisionLabel = revision.githubCommitSha ? ` ${revision.githubCommitSha.slice(0, 8)}` : '';
          showToast(`Đã nhập revision${revisionLabel} từ GitHub.`, 'success');
        } else if (state.sourceDirty && !(await saveBotSource())) throw new Error('Không thể hoàn tất việc chọn phiên bản mã nguồn.');
      } catch (error) {
        if (isBotView()) showBotFormError(error.message || 'Không thể lưu Bot hoặc phiên bản mã nguồn.');
        throw error;
      }
    } else {
      let bot = state.pendingInitialRevision?.bot;
      const source = sourceInput?.source || state.pendingInitialRevision?.source;
      const runtimeId = sourceInput?.runtimeId || state.pendingInitialRevision?.runtimeId;
      let revision = state.pendingInitialRevision?.revision || null;
      try {
        if (!bot) {
          bot = await api('/bots', {
            method: 'POST',
            body: JSON.stringify({ name: nameInput.name, command: 'node', args: [] }),
          });
        }
        createdBot = bot;
        if (!runtimeId) throw new Error('Mã nguồn ban đầu chưa sẵn sàng.');
        revision = sourceInput?.githubUrl
          ? await saveGitHubRevision(bot, sourceInput)
          : await saveInitialRevision(bot, source || '', runtimeId, revision);
        state.pendingInitialRevision = null;
      } catch (error) {
        if (bot) {
          state.pendingInitialRevision = { bot, source, runtimeId, revision };
          if (isBotView()) {
            showBotFormError('Bot đã được tạo nhưng phiên bản mã nguồn chưa lưu. Kiểm tra lỗi và bấm lại để thử lưu, không cần tạo Bot mới.');
            $('#save-bot-source').textContent = 'Thử lưu mã nguồn';
          }
        } else if (isBotView()) {
          showBotFormError(error.message || 'Không thể tạo Bot.');
        }
        throw error;
      }
    }
    if (!isBotView()) return;
    operationSucceeded = true;
    showToast(editingBot ? 'Đã cập nhật tên Bot.' : 'Đã tạo Bot và lưu phiên bản mã nguồn.', 'success');
    state.sourceDirty = false;
    state.pendingInitialRevision = null;
    if (typeof clearBotWorkspaceDraft === 'function') clearBotWorkspaceDraft();
    navigate('bots');
    await loadBots();
    if (!editingBot && createdBot) {
      const created = state.bots.find(item => item.id === createdBot.id) || createdBot;
      await openBotWorkspace(created);
    }
  });
  if (!operationSucceeded) return;
}

function openDeleteBotDialog(bot) {
  state.deleteDialogRevision += 1;
  state.deletingBot = bot;
  $('#delete-bot-name').textContent = bot.name;
  const error = $('#delete-bot-error'); error.textContent = ''; error.hidden = true;
  openModal('delete-bot-modal');
}

async function deleteBot() {
  const bot = state.deletingBot;
  if (!bot) return;
  const button = $('#confirm-delete-bot');
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const dialogRevision = state.deleteDialogRevision;
  await runPending(`confirm-delete:${bot.id}`, button, async () => {
    try { await api(`/bots/${bot.id}`, { method: 'DELETE' }); }
    catch (error) { if (isCurrentView('bots', authRevision, viewRevision) && state.deleteDialogRevision === dialogRevision) { const message = $('#delete-bot-error'); message.textContent = error.message || 'Unable to delete bot.'; message.hidden = false; } throw error; }
    if (!isCurrentView('bots', authRevision, viewRevision)) return;
    if (state.deleteDialogRevision !== dialogRevision) { void loadBots(); return; }
    closeModal('delete-bot-modal');
    showToast('Đã xóa Bot.', 'success');
    await loadBots();
  });
}

async function loadTournaments() {
  const list = $('#tournaments-list');
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  state.loading.add('tournaments');
  state.error = null;
  state.tournamentListError = null;
  const pageTitle = $('.tournaments-workspace-header h2');
  const pageDescription = $('.tournaments-workspace-header p');
  const isCompetitor = state.user?.role === 'competitor';
  if (isCompetitor) {
    // The competitor view is the public discovery list. Do not carry a
    // previous organizer/status-filter selection into it: visible drafts are
    // intentionally discoverable before registration opens.
    state.tournamentScope = 'all';
    state.tournamentStatusFilter = 'all';
    const statusFilter = $('#tournament-status-filter');
    if (statusFilter) statusFilter.value = 'all';
  }
  if (pageTitle) pageTitle.textContent = isCompetitor ? 'Giải đấu' : 'Quản lý giải đấu';
  if (pageDescription) pageDescription.textContent = isCompetitor
    ? 'Khám phá giải đấu đang mở và theo dõi các giải bạn đã đăng ký hoặc tham gia.'
    : 'Tạo và quản lý các giải đấu giữa những Bot đã đăng ký.';
  $('#tournaments-toolbar').hidden = true;
  $('#open-tournament-modal').hidden = true;
  renderLoadingSkeleton(list, 'tournament-skeleton', 4);
  renderMessage(list, 'Đang tải danh sách giải đấu…');
  try {
    let response;
    // Only competitors use the public discovery projection. Organizers must
    // load their owner-scoped list; the discovery projection intentionally
    // omits ownership fields and must never render management actions.
    if (isCompetitor) {
      const [discoverablePayload, minePayload] = await Promise.all([
        request('/tournaments/discoverable'),
        request('/my/tournaments'),
      ]);
      const discoverable = Array.isArray(discoverablePayload) ? discoverablePayload : [];
      const mine = Array.isArray(minePayload) ? minePayload : [];
      const merged = new Map();
      discoverable
        .filter(tournament => tournament.status === 'draft' || tournament.status === 'registration_open' || tournament.status === 'running')
        .forEach(tournament => merged.set(tournament.tournamentId, tournament));
      mine.map(item => ({
        tournamentId: item.tournamentId,
        name: item.name,
        status: item.status,
        participantCount: item.participantCount ?? 0,
        participantId: item.participantId || null,
        myRequestStatus: item.request?.status || null,
        resultsPublishedAt: item.resultsPublishedAt || null,
        registrationOpen: Boolean(item.registrationOpen),
      })).forEach(tournament => {
        merged.set(tournament.tournamentId, { ...merged.get(tournament.tournamentId), ...tournament });
      });
      response = [...merged.values()];
    } else {
      response = await request('/tournaments');
    }
    if (!isCurrentView('tournaments', authRevision, viewRevision)) return;
    state.tournaments = Array.isArray(response) ? response : [];
    renderTournamentList();
  } catch (error) { if (isCurrentView('tournaments', authRevision, viewRevision)) { state.error = localizeErrorMessage(error.message || 'Không thể tải giải đấu.'); state.tournamentListError = state.error; $('#tournaments-count').textContent = 'Không thể tải giải đấu'; $('#tournaments-toolbar').hidden = true; $('#open-tournament-modal').hidden = false; renderMessage(list, state.error, loadTournaments); } }
  finally { state.loading.delete('tournaments'); }
}

/* ==================== MODULE: practice.js ==================== */
function formatPracticeError(error) {
  const payload = error?.payload || error || {};
  if (error?.status === 429) return payload.error || 'Yêu cầu chạy thử đang bị giới hạn. Hãy thử lại sau.';
  if (payload.code === 'EXECUTOR_ERROR' || payload.code === 'EXECUTOR_UNAVAILABLE' || payload.code === 'SANDBOX_REQUIRED') return payload.error || 'Không thể chuẩn bị môi trường chạy thử. Vui lòng thử lại.';
  if (payload.code === 'COMPILATION_TIMEOUT') return payload.error || 'Biên dịch C++ quá thời gian cho phép.';
  if (payload.code === 'RUNTIME_TIMEOUT' || payload.code === 'TIMEOUT') return payload.error || 'Bot thực thi quá thời gian cho phép.';
  if (payload.code === 'PROCESS_CRASHED') return payload.error || 'Bot đã kết thúc với lỗi trong môi trường chạy thử.';
  if (payload.code === 'INVALID_JSON' || payload.code === 'INVALID_RESPONSE') return payload.error || 'Bot trả về dữ liệu không đúng giao thức.';
  if (payload.code === 'EMPTY_OUTPUT' || payload.code === 'MISSING_MOVE') return payload.error || 'Bot không trả về nước đi.';
  if (payload.code === 'INVALID_MOVE') return payload.error || 'Nước đi của Bot không nằm trong danh sách hợp lệ.';
  if (payload.code === 'RESOURCE_LIMIT_EXCEEDED') return payload.error || 'Bot vượt quá giới hạn tài nguyên.';
  return payload.error || error?.message || 'Không thể chạy thử Bot.';
}

function practiceErrorTitle(error) {
  const payload = error?.payload || error || {};
  if (error?.status === 429) return 'Yêu cầu bị giới hạn';
  const titles = {
    EXECUTOR_ERROR: 'Không thể chuẩn bị môi trường', EXECUTOR_UNAVAILABLE: 'Không thể chuẩn bị môi trường', SANDBOX_REQUIRED: 'Không thể chuẩn bị môi trường',
    COMPILATION_TIMEOUT: 'Biên dịch quá thời gian', PROCESS_CRASHED: 'Bot gặp lỗi khi chạy', RUNTIME_TIMEOUT: 'Bot chạy quá thời gian', TIMEOUT: 'Bot chạy quá thời gian',
    INVALID_JSON: 'Phản hồi không đúng giao thức', INVALID_RESPONSE: 'Phản hồi không đúng giao thức', EMPTY_OUTPUT: 'Bot không trả về nước đi', MISSING_MOVE: 'Bot không trả về nước đi',
    INVALID_MOVE: 'Nước đi không hợp lệ', RESOURCE_LIMIT_EXCEEDED: 'Vượt quá giới hạn tài nguyên',
  };
  return titles[payload.code] || 'Chạy thử thất bại';
}

function renderPracticeError(error) {
  const payload = error?.payload || error || {};
  const errorElement = $('#practice-error');
  const details = $('#practice-error-details');
  const technical = $('#practice-error-technical');
  if (errorElement) { errorElement.textContent = `${practiceErrorTitle(error)}: ${formatPracticeError(error)}`; errorElement.hidden = false; }
  const diagnostic = payload.diagnostic || {};
  const technicalParts = [
    diagnostic.stage && `Giai đoạn: ${diagnostic.stage}`,
    diagnostic.runtimeId && `Ngôn ngữ: ${diagnostic.runtimeId === 'cpp' ? 'C++17' : diagnostic.runtimeId === 'python3' ? 'Python 3' : diagnostic.runtimeId}`,
    diagnostic.executionMode && `Chế độ: ${diagnostic.executionMode === 'strategy' ? 'Strategy SDK' : 'Mã nguồn trực tiếp'}`,
    diagnostic.exitCode !== undefined && diagnostic.exitCode !== null && `Mã kết thúc: ${diagnostic.exitCode}`,
  ].filter(Boolean);
  if (details && technical) {
    technical.textContent = technicalParts.join(' · ');
    details.hidden = !technicalParts.length;
  }
}

function updatePracticeScenarioMeta(scenarioId) {
  const scenario = PRACTICE_SCENARIOS[scenarioId] || PRACTICE_SCENARIOS.initial;
  const help = $('#practice-scenario-help');
  if (help) help.textContent = scenario.help;
}

function setPracticeProgressStage(stage) {
  document.querySelectorAll('[data-progress-stage]').forEach(item => {
    item.classList.toggle('is-active', item.dataset.progressStage === stage);
    item.classList.toggle('is-complete', item.dataset.progressStage === 'prepare');
  });
}

function updatePracticeProgressElapsed() {
  const elapsed = Math.max(0, Math.floor((Date.now() - state.practiceProgressStartedAt) / 1000));
  const elapsedElement = $('#practice-progress-elapsed');
  if (elapsedElement) elapsedElement.textContent = `${elapsed} gi\u00e2y`;
}

function startPracticeProgress() {
  stopPracticeProgress();
  const progress = $('#practice-progress');
  const track = progress?.querySelector('.practice-progress-track');
  const bar = $('#practice-progress-bar');
  if (!progress || !track || !bar) return;
  state.practiceProgressStartedAt = Date.now();
  progress.hidden = false;
  progress.dataset.progressState = 'running';
  const label = $('#practice-progress-label');
  if (label) label.textContent = '\u0110\u00e3 g\u1eedi y\u00eau c\u1ea7u \u00b7 \u0111ang ch\u1edd Docker sandbox';
  track.setAttribute('aria-valuenow', '0');
  bar.style.width = '36%';
  setPracticeProgressStage('compile');
  updatePracticeProgressElapsed();
  state.practiceProgressTimer = window.setInterval(updatePracticeProgressElapsed, 250);
}

function finishPracticeProgress(success) {
  if (state.practiceProgressTimer) window.clearInterval(state.practiceProgressTimer);
  state.practiceProgressTimer = null;
  updatePracticeProgressElapsed();
  const progress = $('#practice-progress');
  const track = progress?.querySelector('.practice-progress-track');
  const bar = $('#practice-progress-bar');
  if (!progress || !track || !bar) return;
  progress.dataset.progressState = success ? 'complete' : 'error';
  const label = $('#practice-progress-label');
  if (label) label.textContent = success ? '\u0110\u00e3 nh\u1eadn k\u1ebft qu\u1ea3 tr\u1eadn th\u1eed' : 'Sandbox kh\u00f4ng tr\u1ea3 k\u1ebft qu\u1ea3';
  track.setAttribute('aria-valuenow', success ? '100' : '0');
  bar.style.width = success ? '100%' : '36%';
  document.querySelectorAll('[data-progress-stage]').forEach(item => {
    item.classList.toggle('is-active', false);
    item.classList.toggle('is-complete', success || item.dataset.progressStage === 'prepare');
  });
}

function stopPracticeProgress() {
  if (state.practiceProgressTimer) window.clearInterval(state.practiceProgressTimer);
  state.practiceProgressTimer = null;
  const progress = $('#practice-progress');
  if (progress) {
    progress.hidden = true;
    delete progress.dataset.progressState;
  }
}

function clearPracticeResult() {
  if (typeof stopPracticeProgress === 'function') stopPracticeProgress();
  stopPracticeReplay();
  state.practiceReplay = null;
  state.practiceReplayMoveIndex = -1;
  const output = $('#practice-output');
  if (output) {
    output.hidden = true;
    output.classList?.remove('practice-output--validation');
  }
  const replayToolbar = $('#practice-replay-toolbar'); if (replayToolbar) replayToolbar.hidden = true;
  const result = $('#practice-result'); if (result) result.hidden = true;
  const board = $('#practice-board-frame'); if (board) board.hidden = true;
  const error = $('#practice-error'); if (error) { error.textContent = ''; error.hidden = true; }
  const details = $('#practice-error-details'); if (details) details.hidden = true;
  const technical = $('#practice-error-technical'); if (technical) technical.textContent = '';
  const resultDetails = $('#practice-result-details'); if (resultDetails) clear(resultDetails);
  const history = $('#practice-move-history-list'); if (history) clear(history);
  const count = $('#practice-move-count'); if (count) count.textContent = '0 lượt';
}

function openBotGuide() {
  openModal('bot-guide-modal');
}

function boardCoordinate(row, col) {
  return `${'abcdefghi'[col] || '?'}${row + 1}`;
}

function renderPracticeBoard(board, selectedMove = null, capturedPieceId = null) {
  const element = $('#practice-board');
  const columns = $('#practice-columns');
  const rows = $('#practice-rows');
  clear(element); clear(columns); clear(rows);
  'abcdefghi'.split('').forEach(column => columns.appendChild(create('span', { text: column })));
  for (let row = 0; row < 9; row += 1) rows.appendChild(create('span', { text: String(row + 1) }));
  for (let row = 0; row < 9; row += 1) for (let col = 0; col < 9; col += 1) {
    const coordinate = boardCoordinate(row, col);
    const goal = row === 0 && col === 0
      ? 'Mục tiêu của người chơi B'
      : row === 8 && col === 8 ? 'Mục tiêu của người chơi A' : '';
    const cell = create('div', {
      className: 'replay-cell',
      attrs: { role: 'gridcell', 'aria-label': `${coordinate}${goal ? `, ${goal}` : ''}, ô trống` },
    });
    if (goal) {
      cell.classList.add('goal');
    }
    if (selectedMove?.from === coordinate) cell.classList.add('move-from');
    if (selectedMove?.to === coordinate) cell.classList.add('move-to');
    const piece = board?.pieces?.find(candidate => candidate.row === row && candidate.col === col);
    if (piece) {
      const label = `Người chơi ${piece.player}, ${PIECE_LABELS[piece.type] || piece.type}`;
      const token = create('span', {
        className: `replay-piece replay-player-${String(piece.player).toLowerCase()}${selectedMove?.piece_id === piece.id ? ' practice-selected-piece' : ''}`,
        attrs: { 'aria-label': label, title: label },
      });
      const symbol = PIECE_TYPES[piece.type];
      if (symbol) token.appendChild(icon(symbol)); else token.textContent = '?';
      cell.setAttribute('aria-label', `${coordinate}${goal ? `, ${goal}` : ''}, ${label}`);
      cell.appendChild(token);
    }
    if (selectedMove?.to === coordinate && capturedPieceId) {
      cell.classList.add('practice-capture');
      cell.appendChild(create('span', { className: 'practice-capture-mark', text: '×', attrs: { 'aria-hidden': 'true' } }));
      cell.setAttribute('aria-label', `${coordinate}${goal ? `, ${goal}` : ''}${piece ? `, Người chơi ${piece.player}, ${PIECE_LABELS[piece.type] || piece.type}` : ''}, quân bị ăn`);
    }
    element.appendChild(cell);
  }
}

function renderPracticeResult(result) {
  const details = $('#practice-result-details'); clear(details);
  const selectedPiece = result.state?.pieces?.find(piece => piece.id === result.move?.piece_id);
  const capturedPiece = result.state?.pieces?.find(piece => piece.id === result.capture);
  const revision = typeof state !== 'undefined' ? state.practiceRevision : null;
  const scenarioCatalog = typeof PRACTICE_SCENARIOS !== 'undefined' ? PRACTICE_SCENARIOS : {};
  const scenario = scenarioCatalog[result.scenarioId] || { label: result.scenarioLabel || result.scenarioId || 'Tình huống kiểm thử' };
  const valid = result.valid === true && result.accepted !== false;
  const moveLabel = result.move?.from && result.move?.to ? `${result.move.from} → ${result.move.to}` : 'Không có nước đi được chấp nhận';
  const resultTitle = $('#practice-result-title'); if (resultTitle) resultTitle.textContent = valid ? 'Nước đi hợp lệ' : 'Chạy thử không hợp lệ';
  const resultMove = $('#practice-result-move'); if (resultMove) resultMove.textContent = moveLabel;
  const entries = [
    ['Người chơi', result.state?.currentPlayer || result.diagnostic?.player || '—'],
    ['Quân đã chọn', selectedPiece ? `${PIECE_LABELS[selectedPiece.type] || selectedPiece.type} · ${selectedPiece.id}` : result.move?.piece_id || '—'],
    ['Từ', result.move?.from || '—'], ['Đến', result.move?.to || '—'],
    ['Kết quả ăn quân', capturedPiece ? `${PIECE_LABELS[capturedPiece.type] || capturedPiece.type} · ${capturedPiece.id}` : 'Không ăn quân'],
    ['Ngôn ngữ', result.runtimeId === 'cpp' ? 'C++17' : 'Python 3'],
    ['Revision', revision?.revisionId ? revision.revisionId.slice(0, 12) : 'Đã chọn từ không gian mã nguồn'],
    ['Tình huống', scenario.label],
  ];
  if (result.executionMode === 'strategy' && result.sdkVersion) entries.push(['SDK chiến thuật', result.sdkVersion]);
  entries.forEach(([label, value]) => details.append(create('dt', { text: label }), create('dd', { text: value })));
  $('#practice-result').hidden = false;
  renderPracticeBoard(result.state, result.move, result.capture);
  $('#practice-board-frame').hidden = false;
}

function renderPracticeValidationResult(result) {
  const resultCard = $('#practice-result');
  const output = $('#practice-output');
  const board = $('#practice-board-frame');
  const replayToolbar = $('#practice-replay-toolbar');
  const history = document.querySelector('#practice-result .practice-move-history');
  const details = $('#practice-result-details');
  const valid = result?.valid === true && result?.accepted !== false;
  const selectedMove = result?.move || result?.selectedMove || result?.response?.move;
  const from = selectedMove?.from || result?.from;
  const to = selectedMove?.to || result?.to;
  const moveLabel = from && to
    ? `${from} → ${to}`
    : 'Không có nước đi hợp lệ';

  if (output) {
    output.hidden = false;
    output.classList?.add('practice-output--validation');
  }
  if (resultCard) resultCard.hidden = false;
  if (board) board.hidden = true;
  if (replayToolbar) replayToolbar.hidden = true;
  if (history) history.hidden = true;
  if (details) clear(details);

  const title = $('#practice-result-title');
  if (title) title.textContent = valid ? 'Biên dịch thành công · Nước đi hợp lệ' : 'Kiểm tra không hợp lệ';
  const move = $('#practice-result-move');
  if (move) {
    move.hidden = false;
    move.removeAttribute?.('hidden');
    move.style.display = 'block';
    move.textContent = moveLabel;
  }
}

function renderPracticeMatchResult(result) {
  state.practiceReplay = result;
  state.practiceReplayMoveIndex = -1;
  const details = $('#practice-result-details'); clear(details);
  const winnerLabel = result.winner === 'A' ? 'Bot của bạn' : result.winner === 'B' ? result.opponentName || 'Bot hệ thống' : 'Hòa';
  const reasonLabel = result.terminationReason === 'goal_reached' ? 'Đạt ô đích' : result.terminationReason === 'all_pieces_captured' ? 'Ăn hết quân đối thủ' : result.terminationReason === 'max_turns' ? 'Đạt giới hạn lượt' : 'Không còn nước đi';
  $('#practice-result-title').textContent = result.winner === 'draw' ? 'Trận thử hòa' : `${winnerLabel} thắng`;
  $('#practice-result-move').textContent = `${result.moves?.length || 0} lượt · ${reasonLabel}`;
  const revision = state.practiceRevision;
  [['Kết quả', winnerLabel], ['Đối thủ', result.opponentName || 'Bot hệ thống'], ['Số lượt', String(result.moves?.length || 0)], ['Lý do kết thúc', reasonLabel], ['Ngôn ngữ', result.runtimeId === 'cpp' ? 'C++17' : 'Python 3'], ['Phiên bản', revision?.revisionId ? revision.revisionId.slice(0, 12) : '—']]
    .forEach(([label, value]) => details.append(create('dt', { text: label }), create('dd', { text: value })));
  $('#practice-result').hidden = false;
  $('#practice-output').hidden = false;
  $('#practice-board-frame').hidden = false;
  $('#practice-replay-toolbar').hidden = false;
  renderPracticeHistory();
  goToPracticeTurn(-1);
}

function posToPracticeCoordinate(position) {
  return `${'abcdefghi'[position?.col] || '?'}${(position?.row ?? -1) + 1}`;
}

function stopPracticeReplay() {
  if (state.practiceReplayTimer) clearTimeout(state.practiceReplayTimer);
  state.practiceReplayTimer = null;
  state.practiceReplayActive = false;
  state.practiceReplayToken = (state.practiceReplayToken || 0) + 1;
  const button = $('#practice-replay-play');
  if (button) {
    const iconNode = button.querySelector('use'); if (iconNode) iconNode.setAttribute('href', '#icon-play');
    const label = button.querySelector('span'); if (label) label.textContent = 'Phát';
    button.setAttribute('aria-label', 'Phát'); button.setAttribute('title', 'Phát'); button.setAttribute('aria-pressed', 'false');
  }
}

function practiceMoveLabel(move, index) {
  if (!move) return `Vị trí ban đầu`;
  return `Lượt ${index + 1} · Bot ${move.player}: ${move.from} → ${move.to}${move.captures ? ' · Ăn quân' : ''}`;
}

function renderPracticeHistory() {
  const list = $('#practice-move-history-list');
  const moves = state.practiceReplay?.moves || [];
  if (!list) return;
  clear(list);
  const count = $('#practice-move-count'); if (count) count.textContent = `${moves.length} lượt`;
  if (!moves.length) { list.appendChild(create('p', { className: 'practice-move-history-empty', text: 'Chưa có nước đi được ghi nhận.' })); return; }
  moves.forEach((move, index) => {
    const item = create('button', { className: 'practice-move-history-item', type: 'button' });
    item.appendChild(create('span', { text: practiceMoveLabel(move, index) }));
    item.addEventListener('click', () => { stopPracticeReplay(); goToPracticeTurn(index); });
    list.appendChild(item);
  });
}

function goToPracticeTurn(index) {
  const replay = state.practiceReplay;
  if (!replay) return;
  const moves = replay.moves || [];
  state.practiceReplayMoveIndex = Math.max(-1, Math.min(index, moves.length - 1));
  const turn = $('#practice-replay-turn'); if (turn) turn.textContent = `${Math.max(0, state.practiceReplayMoveIndex + 1)} / ${moves.length}`;
  const scrubber = $('#practice-replay-scrubber'); if (scrubber) { scrubber.max = String(Math.max(-1, moves.length - 1)); scrubber.value = String(state.practiceReplayMoveIndex); }
  const atStart = state.practiceReplayMoveIndex < 0;
  const atEnd = state.practiceReplayMoveIndex >= moves.length - 1;
  const startButton = $('#practice-replay-start'); if (startButton) startButton.disabled = atStart;
  const prevButton = $('#practice-replay-prev'); if (prevButton) prevButton.disabled = atStart;
  const nextButton = $('#practice-replay-next'); if (nextButton) nextButton.disabled = atEnd || !moves.length;
  const endButton = $('#practice-replay-end'); if (endButton) endButton.disabled = atEnd || !moves.length;
  const playButton = $('#practice-replay-play'); if (playButton) playButton.disabled = !moves.length;
  const board = replay.states?.[state.practiceReplayMoveIndex + 1] || (state.practiceReplayMoveIndex < 0 ? replay.initialState : replay.finalState || replay.state);
  const move = state.practiceReplayMoveIndex >= 0 ? moves[state.practiceReplayMoveIndex] : null;
  if (board) renderPracticeBoard(board, move ? { piece_id: move.pieceId, from: move.from, to: move.to } : null, move?.captures);
  const items = document.querySelectorAll('.practice-move-history-item');
  items.forEach((item, itemIndex) => {
    item.classList.toggle('active', itemIndex === state.practiceReplayMoveIndex);
    item.setAttribute('aria-current', itemIndex === state.practiceReplayMoveIndex ? 'step' : 'false');
  });
  const active = document.querySelector('.practice-move-history-item.active');
  if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' });
}

function togglePracticeReplay() {
  if (!state.practiceReplay) return;
  if (state.practiceReplayActive) return stopPracticeReplay();
  const moves = state.practiceReplay.moves || [];
  if (state.practiceReplayMoveIndex >= moves.length - 1) goToPracticeTurn(-1);
  const token = ++state.practiceReplayToken;
  state.practiceReplayActive = true;
  const tick = () => {
    if (token !== state.practiceReplayToken || !state.practiceReplay || state.practiceReplayMoveIndex >= moves.length - 1) { stopPracticeReplay(); return; }
    goToPracticeTurn(state.practiceReplayMoveIndex + 1);
    state.practiceReplayTimer = setTimeout(tick, Number($('#practice-replay-speed')?.value || 800));
  };
  const button = $('#practice-replay-play');
  if (button) { const iconNode = button.querySelector('use'); if (iconNode) iconNode.setAttribute('href', '#icon-pause'); const label = button.querySelector('span'); if (label) label.textContent = 'Tạm dừng'; button.setAttribute('aria-label', 'Tạm dừng'); button.setAttribute('title', 'Tạm dừng'); button.setAttribute('aria-pressed', 'true'); }
  state.practiceReplayTimer = setTimeout(tick, Number($('#practice-replay-speed')?.value || 800));
}

function practiceReplayPosition(value) {
  const match = /^([a-i])(\d)$/.exec(String(value || ''));
  return match ? { col: 'abcdefghi'.indexOf(match[1]), row: Number(match[2]) - 1 } : null;
}

function openPracticeReplayPage(result, revision) {
  const moves = (result.moves || []).map(move => ({
    player: move.player,
    turn: move.turn,
    pieceId: move.pieceId,
    from: practiceReplayPosition(move.from),
    to: practiceReplayPosition(move.to),
    captures: move.captures || null,
  }));
  const replay = {
    matchId: 'practice-fixed-opponent',
    protocolVersion: '0.1.0',
    initialState: result.initialState,
    finalState: result.finalState || result.state,
    moves,
    winner: result.winner,
    terminationReason: result.terminationReason,
    participantIdentities: {
      A: { participantName: state.sourceWorkspaceBot?.name || 'Bot của bạn', botName: state.sourceWorkspaceBot?.name || 'Bot của bạn', runtimeId: revision.runtimeId },
      B: { participantName: result.opponentName || 'Bot hệ thống cố định', botName: result.opponentName || 'Bot hệ thống cố định' },
    },
    metadata: { sourceRevisions: [{ player: 'A', revisionId: revision.revisionId, runtimeId: revision.runtimeId }] },
  };
  stopPracticeReplay();
  closeModal('practice-modal');
  state.replay = replay;
  state.replayMatchId = replay.matchId;
  state.replayMoveIndex = -1;
  state.replayContext = { practice: true, tournamentId: state.tournamentId || '', matchId: replay.matchId, authRevision: state.authRevision, sourceViewRevision: state.viewRevision };
  $('#replay-view').classList.remove('live-match-view');
  $('#replay-view-kicker').textContent = 'XEM LẠI TRẬN THỬ';
  setReplayBackLabel('Quay lại Bot của tôi');
  $('#replay-error').hidden = true;
  navigate('replay-view');
  state.replayContext.replayViewRevision = state.viewRevision;
  renderReplaySummary(replay);
  $('#replay-view-title').textContent = 'Diễn biến trận đấu';
  setReplayLoading(false);
  goToReplayTurn(-1);
}

function openPracticeRunner(revision) {
  const autoRun = arguments[1] === true;
  state.practiceRevision = revision;
  state.practiceRequestToken += 1;
  const scenarioSelect = $('#practice-scenario');
  if (scenarioSelect) { scenarioSelect.value = 'initial'; scenarioSelect.disabled = false; }
  if (typeof updatePracticeScenarioMeta === 'function') updatePracticeScenarioMeta('initial');
  $('#practice-title').textContent = 'Kiểm tra Bot';
  const runtimeLabel = revision.runtimeId === 'cpp' ? 'C++17' : revision.runtimeId === 'python3' ? 'Python 3' : revision.runtimeId;
  const practiceTitle = $('#practice-title');
  if (practiceTitle) practiceTitle.textContent = 'Bot single-turn validation';
  const checkNote = $('.practice-check-note');
  if (checkNote) checkNote.textContent = 'Single-turn compile and move validation. The system Bot is not used.';
  const opponent = document.querySelector('.practice-opponent');
  if (opponent) opponent.remove();
  const validationStage = document.querySelector('[data-progress-stage="match"]');
  if (validationStage) validationStage.textContent = 'Validate move';
  const modeLabel = revision.executionMode === 'strategy' ? 'Strategy SDK' : revision.executionMode === 'raw' ? 'Mã nguồn trực tiếp' : '';
  const revisionMeta = $('#practice-revision-meta');
  if (revisionMeta) {
    const revisionLabel = revision.label || revision.name || revision.title || (revision.revisionId.startsWith('draft-') ? 'Bản nháp hiện tại' : `Phiên bản ${revision.revisionId.slice(0, 12)}`);
    const revisionId = revision.revisionId.startsWith('draft-') ? '' : ` · Phiên bản ${revision.revisionId.slice(0, 12)}`;
    revisionMeta.textContent = `Đang chạy: ${revisionLabel} · ${runtimeLabel}${modeLabel ? ` · ${modeLabel}` : ''} · ${state.sourceWorkspaceBot?.name || 'Bot của bạn'}${revisionId}`;
  }
  $('#practice-status').textContent = 'Sẵn sàng kiểm tra một lượt.';
  if (typeof clearPracticeResult === 'function') clearPracticeResult();
  else {
    const output = $('#practice-output'); if (output) output.hidden = true;
    const result = $('#practice-result'); if (result) result.hidden = true;
    const board = $('#practice-board-frame'); if (board) board.hidden = true;
    const details = $('#practice-result-details'); if (details) clear(details);
  }
  const board = $('#practice-board'); if (board) clear(board);
  openModal('practice-modal');
  if (autoRun) setTimeout(() => void testBotRevision(), 0);
  else $('#practice-run').focus();
}

function openCurrentPracticeRunner() {
  const runtimeId = $('#bot-source-runtime')?.value;
  const source = $('#bot-source-editor')?.value || '';
  if (!source.trim()) return setSourceError('Mã nguồn không được để trống.');
  state.practiceSourceMode = state.sourceWorkspaceBot?.id ? 'edit' : 'create';
  const previousBreadcrumb = $('#topbar-breadcrumb .topbar-breadcrumb-current')?.textContent?.trim();
  state.practiceReplayParent = {
    title: previousBreadcrumb || 'Tạo Bot',
    target: state.activeView || 'bot-workspace',
  };
  if (state.sourceDirty || !currentPracticeRevision()) {
    state.practiceDraft = { source, runtimeId, executionMode: state.sourceExecutionMode };
    openPracticeRunner({ botId: state.sourceWorkspaceBot?.id || 'draft-bot', revisionId: 'draft-current', label: 'Bản nháp hiện tại', runtimeId, executionMode: state.sourceExecutionMode });
    return;
  }
  const revision = currentPracticeRevision();
  openPracticeRunner(revision);
}

async function testBotMatch() {
  const revision = state.practiceRevision;
  if (!revision) return;
  state.practiceAbortController?.abort();
  const controller = new AbortController();
  state.practiceAbortController = controller;
  const token = ++state.practiceRequestToken;
  const runButton = $('#practice-run');
  clearPracticeResult();
  if (typeof startPracticeProgress === 'function') startPracticeProgress();
  $('#practice-output').hidden = false;
  $('#practice-status').textContent = 'Đang chạy trận thử với Bot hệ thống…';
  runButton.textContent = 'Đang chạy…';
  runButton.disabled = true;
  try {
    const isDraft = Boolean(state.practiceDraft);
    const result = await request(isDraft ? '/bots/draft/test-match' : `/bots/${revision.botId}/revisions/${revision.revisionId}/test-match`, {
      method: 'POST',
      body: JSON.stringify(isDraft ? state.practiceDraft : {}),
      signal: controller.signal,
    });
    if (token !== state.practiceRequestToken || state.practiceRevision?.revisionId !== revision.revisionId) return;
    if (typeof finishPracticeProgress === 'function') finishPracticeProgress(true);
    openPracticeReplayPage(result, revision);
  } catch (error) {
    if (token !== state.practiceRequestToken || state.practiceRevision?.revisionId !== revision.revisionId) return;
    if (typeof finishPracticeProgress === 'function') finishPracticeProgress(false);
    renderPracticeError(error);
    $('#practice-status').textContent = 'Chạy thử thất bại.';
  } finally {
    if (token === state.practiceRequestToken) { runButton.disabled = false; runButton.textContent = 'Chạy thử'; }
  }
}

async function testBotRevision() {
  const revision = state.practiceRevision;
  if (!revision) return;
  const token = ++state.practiceRequestToken;
  const runButton = $('#practice-run');
  const scenarioId = $('#practice-scenario').value;
  clearPracticeResult();
  if (typeof startPracticeProgress === 'function') startPracticeProgress();
  $('#practice-output').hidden = false;
  $('#practice-status').textContent = 'Đang chạy thử Bot trong môi trường cô lập…';
  runButton.textContent = 'Đang chạy…';
  runButton.disabled = true;
  const scenarioSelect = $('#practice-scenario'); if (scenarioSelect) scenarioSelect.disabled = true;
  try {
    const isDraft = Boolean(state.practiceDraft);
    const result = await request(isDraft ? '/bots/draft/test' : `/bots/${revision.botId}/revisions/${revision.revisionId}/test`, {
      method: 'POST',
      body: JSON.stringify(isDraft ? { ...state.practiceDraft, scenarioId } : { scenarioId }),
    });
    if (token !== state.practiceRequestToken || state.practiceRevision?.revisionId !== revision.revisionId) return;
    if (typeof finishPracticeProgress === 'function') finishPracticeProgress(true);
    renderPracticeValidationResult(result);
    $('#practice-status').textContent = result.valid === true && result.accepted !== false ? 'Kiểm tra thành công · Nước đi hợp lệ.' : 'Kiểm tra hoàn tất.';
  } catch (error) {
    if (token !== state.practiceRequestToken || state.practiceRevision?.revisionId !== revision.revisionId) return;
    if (typeof finishPracticeProgress === 'function') finishPracticeProgress(false);
    renderPracticeError(error);
    $('#practice-status').textContent = error?.status === 429 ? 'Yêu cầu bị giới hạn · Bạn có thể thử lại sau.' : 'Chạy thử thất bại.';
  } finally {
    if (token === state.practiceRequestToken) {
      runButton.disabled = false; runButton.textContent = 'Chạy thử';
      if (scenarioSelect) scenarioSelect.disabled = false;
    }
  }
}

function renderBotEmpty(list, title, message, showAction = true) {
  clear(list);
  const empty = create('div', { className: 'ui-message' });
  const emptyIcon = create('span', { className: 'bot-empty-icon' });
  emptyIcon.appendChild(icon('icon-bot'));
  empty.appendChild(emptyIcon);
  empty.append(create('strong', { className: 'bot-empty-title', text: title }), create('p', { className: 'bot-empty-copy', text: message }));
  if (showAction) empty.appendChild(actionButton('Tạo Bot', () => openBotWorkspace(), 'empty-create-bot', 'primary-btn bot-empty-action'));
  if (showAction) {
    const hint = create('small', { className: 'bot-empty-hint', text: 'Bot của bạn sẽ xuất hiện tại đây sau khi được tạo.' });
    const action = empty.querySelector('.bot-empty-action');
    if (action) {
      const plusIcon = icon('icon-plus'); plusIcon.classList.add('ui-icon'); action.prepend(plusIcon);
      action.parentNode.insertBefore(hint, action);
    }
  }
  if (!showAction && title === 'Bạn chưa có Bot nào') {
    empty.appendChild(create('small', { className: 'bot-empty-hint', text: 'Bot của bạn sẽ xuất hiện tại đây sau khi được tạo.' }));
  }
  list.appendChild(empty);
}

/* ==================== MODULE: tournaments.js ==================== */
let registrationRequestRenderSequence = 0;

const PHASE2_PREFLIGHT_POLL_INTERVAL_MS = 2000;
const PHASE2_PREFLIGHT_POLL_BACKOFF_AFTER_MS = 60_000;
const PHASE2_PREFLIGHT_POLL_SLOW_INTERVAL_MS = 10_000;

function preflightDiagnosticText(preflight = {}) {
  const diagnostic = preflight?.diagnostic && typeof preflight.diagnostic === 'object' ? preflight.diagnostic : {};
  const parts = [];
  if (diagnostic.stage) parts.push(`Giai đoạn: ${diagnostic.stage}`);
  if (diagnostic.message) parts.push(String(diagnostic.message));
  const compiler = diagnostic.compilerDiagnostic || diagnostic.compilerDiagnostics;
  const runtime = diagnostic.runtimeDiagnostic;
  if (compiler) parts.push(`Trình biên dịch: ${compiler}`);
  if (runtime) parts.push(`Môi trường chạy: ${runtime}`);
  if (!compiler && diagnostic.stderr) parts.push(`stderr: ${diagnostic.stderr}`);
  if (!runtime && diagnostic.stdout) parts.push(`stdout: ${diagnostic.stdout}`);
  return parts.join(' · ').slice(0, 1600);
}

function preflightStatusLabel(preflight = {}) {
  const labels = {
    not_started: 'Chưa kiểm tra môi trường chạy',
    pending: 'Đang kiểm tra biên dịch và nước đi mẫu…',
    passed: 'Đã kiểm tra: biên dịch, giao thức và nước đi hợp lệ',
    failed: `Kiểm tra thất bại${preflight.errorCode ? ` · ${preflight.errorCode}` : ''}`,
    expired: 'Kết quả kiểm tra đã hết hạn',
  };
  return labels[preflight.status] || labels.not_started;
}

function phase2PreflightNeedsPolling(requests) {
  return requests.some(req => req.status === 'pending'
    && (req.execution?.kind === 'source-revision' || Boolean(req.revisionId))
    && ['not_started', 'pending'].includes(req.preflight?.status || 'not_started'));
}

function updatePhase2PreflightRows(container, requests) {
  const byId = new Map(requests.map(req => [req.requestId, req]));
  container.querySelectorAll('.phase-inbox-item[data-request-id]').forEach(item => {
    const request = byId.get(item.dataset.requestId);
    if (!request) return;
    const preflight = request.preflight || { status: 'not_started' };
    const status = item.querySelector('.preflight-status');
    if (status) {
      status.className = `bot-row-subtitle preflight-status preflight-${preflight.status}`;
      status.dataset.preflightStatus = preflight.status;
      status.textContent = preflightStatusLabel(preflight);
    }
    const diagnosticText = preflightDiagnosticText(preflight);
    const diagnostic = item.querySelector('.preflight-diagnostic');
    if (diagnostic) {
      diagnostic.hidden = !diagnosticText;
      diagnostic.textContent = diagnosticText;
    }
    const retry = item.querySelector('.req-retry-btn');
    if (retry) retry.disabled = preflight.status === 'pending';
    item.dataset.preflightStatus = preflight.status;
  });
}

function stopPhase2PreflightPolling() {
  const polling = state.phase2PreflightPolling;
  if (!polling) return;
  if (polling.timer) window.clearTimeout(polling.timer);
  polling.abortController?.abort();
  state.phase2PreflightPolling = null;
}

function startPhase2PreflightPolling(tournamentId, container, statsRoot, countBadge, tabs, initialRequests = []) {
  if (!phase2PreflightNeedsPolling(initialRequests)) {
    stopPhase2PreflightPolling();
    return;
  }
  const current = state.phase2PreflightPolling;
  if (current && current.tournamentId === tournamentId && current.container === container) return;
  stopPhase2PreflightPolling();
  const polling = {
    tournamentId, container, statsRoot, countBadge, tabs,
    authRevision: state.authRevision, viewRevision: state.viewRevision,
    startedAt: Date.now(), timer: null, abortController: null, inFlight: false,
  };
  state.phase2PreflightPolling = polling;
  const schedule = (delay) => {
    if (state.phase2PreflightPolling !== polling) return;
    const elapsed = Date.now() - polling.startedAt;
    const boundedDelay = delay ?? (elapsed >= PHASE2_PREFLIGHT_POLL_BACKOFF_AFTER_MS
      ? PHASE2_PREFLIGHT_POLL_SLOW_INTERVAL_MS
      : PHASE2_PREFLIGHT_POLL_INTERVAL_MS);
    polling.timer = window.setTimeout(run, boundedDelay);
  };
  const run = async () => {
    if (state.phase2PreflightPolling !== polling || polling.inFlight || !container.isConnected
      || !isCurrentView('tournament-detail', polling.authRevision, polling.viewRevision, tournamentId)) {
      if (state.phase2PreflightPolling === polling) stopPhase2PreflightPolling();
      return;
    }
    polling.inFlight = true;
    const controller = new AbortController();
    polling.abortController = controller;
    try {
      const payload = await request(`/tournaments/${tournamentId}/requests`, { signal: controller.signal });
      if (state.phase2PreflightPolling !== polling || controller.signal.aborted || !container.isConnected
        || !isCurrentView('tournament-detail', polling.authRevision, polling.viewRevision, tournamentId)) return;
      const requests = normalizeRegistrationRequestCollection(payload);
      updatePhase2PreflightRows(container, requests);
      updateRegistrationStats(statsRoot, requests);
      const stats = getRegistrationRequestStats(requests);
      if (countBadge) countBadge.textContent = `${stats.pending} đang chờ`;
      if (tabs?.pending) tabs.pending.textContent = `Chờ duyệt (${stats.pending})`;
      if (tabs?.approved) tabs.approved.textContent = `Đã duyệt (${stats.approved})`;
      if (tabs?.rejected) tabs.rejected.textContent = `Từ chối (${stats.rejected})`;
      if (!phase2PreflightNeedsPolling(requests)) { stopPhase2PreflightPolling(); return; }
    } catch (error) {
      if (error?.name !== 'AbortError' && state.phase2PreflightPolling === polling) schedule();
      return;
    } finally {
      if (state.phase2PreflightPolling === polling) {
        polling.inFlight = false;
        polling.abortController = null;
      }
    }
    schedule();
  };
  schedule(0);
}

function normalizeRegistrationRequestStatus(requestItem) {
  return String(requestItem?.status || '').trim().toLowerCase();
}

function normalizeRegistrationRequestCollection(payload) {
  let candidate = [];
  if (Array.isArray(payload)) candidate = payload;
  else if (Array.isArray(payload?.requests)) candidate = payload.requests;
  else if (Array.isArray(payload?.data)) candidate = payload.data;
  else if (Array.isArray(payload?.data?.requests)) candidate = payload.data.requests;
  else if (Array.isArray(payload?.data?.participationRequests)) candidate = payload.data.participationRequests;
  else if (Array.isArray(payload?.participationRequests)) candidate = payload.participationRequests;
  return candidate.map(requestItem => ({ ...requestItem, status: normalizeRegistrationRequestStatus(requestItem) }));
}

function getRegistrationRequestStats(requests) {
  return (Array.isArray(requests) ? requests : []).reduce((stats, requestItem) => {
    stats.total += 1;
    const status = normalizeRegistrationRequestStatus(requestItem);
    if (status === 'approved') stats.approved += 1;
    else if (status === 'pending') stats.pending += 1;
    else if (status === 'rejected') stats.rejected += 1;
    return stats;
  }, { total: 0, approved: 0, pending: 0, rejected: 0 });
}

function updateRegistrationStats(statsRoot, requests, mode = 'ready') {
  if (!statsRoot) return;
  const nodes = ['#reg-stat-total', '#reg-stat-approved', '#reg-stat-pending']
    .map(selector => statsRoot.querySelector(selector));
  if (mode === 'loading' || mode === 'error') {
    nodes.forEach(node => { if (node) node.textContent = mode === 'loading' ? '…' : '—'; });
    return;
  }
  const stats = getRegistrationRequestStats(requests);
  [stats.total, stats.approved, stats.pending].forEach((value, index) => {
    if (nodes[index]) nodes[index].textContent = String(value);
  });
}
let tournamentDetailRefreshSequence = 0;

function openTournamentDialog() {
  state.tournamentDialogRevision += 1;
  const nameInput = $('#new-tourney-name');
  const error = $('#tournament-form-error');
  if (error) { error.textContent = ''; error.hidden = true; }
  if (nameInput) nameInput.setAttribute('aria-invalid', 'false');
  state.editingTournament = null;
  $('#add-tourney-title').textContent = 'Tạo giải đấu mới';
  $('#tourney-dialog-description').textContent = 'Tạo giải đấu để tiếp nhận Bot và tổ chức các trận đấu.';
  $('.tournament-submit-label').textContent = 'Tạo giải đấu';
  $('.tournament-submit-loading').textContent = 'Đang tạo…';
  openModal('add-tourney-modal');
  if (nameInput) requestAnimationFrame(() => nameInput.focus());
}

function openEditTournamentDialog(tournament) {
  state.tournamentDialogRevision += 1;
  state.editingTournament = tournament;
  $('#new-tourney-name').value = tournament.name || '';
  $('#add-tourney-title').textContent = 'Chỉnh sửa giải đấu';
  $('#tourney-dialog-description').textContent = 'Cập nhật tên và quyền hiển thị của giải đấu.';
  $('.tournament-submit-label').textContent = 'Lưu thay đổi';
  $('.tournament-submit-loading').textContent = 'Đang lưu…';
  const error = $('#tournament-form-error'); error.textContent = ''; error.hidden = true;
  openModal('add-tourney-modal');
  requestAnimationFrame(() => $('#new-tourney-name')?.focus());
}

function setRegistrationLoadingState() {
  state.registrationBotsState = 'loading';
  $('#registration-form-error').textContent = ''; $('#registration-form-error').hidden = true;
  $('#registration-bots-loading').hidden = false;
  $('#registration-bots-empty').hidden = true;
  $('#registration-bots-error').hidden = true;
  $('#registration-fields').hidden = true;
  $('#submit-registration').hidden = true;
}

const CLIENT_GITHUB_SOURCE_LIMIT = 64 * 1024;
const CLIENT_GITHUB_REPOSITORY_CACHE_TTL_MS = 5 * 60 * 1000;
const CLIENT_GITHUB_REPOSITORY_CACHE_MAX_ENTRIES = 64;
// Cache only public repository metadata and root-file candidates. Source text
// is deliberately fetched from raw.githubusercontent.com for each import so
// the preview and revision always reflect a fresh content response.
const clientGithubRepositoryCache = new Map();

function githubRetryAfterSeconds(response) {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  }
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) return Math.max(0, Math.ceil(reset - Date.now() / 1000));
  return null;
}

function githubRateLimitError(response, fallbackMessage) {
  const retryAfterSeconds = githubRetryAfterSeconds(response);
  if (retryAfterSeconds === null) return new Error(fallbackMessage);
  const retryHint = retryAfterSeconds === 0
    ? 'Bạn có thể thử lại ngay.'
    : `Hãy thử lại sau khoảng ${retryAfterSeconds} giây.`;
  return new Error(`GitHub đang giới hạn yêu cầu. ${retryHint}`);
}

function githubRepositoryCacheKey(parsed) {
  return `${parsed.owner.toLowerCase()}/${parsed.repository.toLowerCase()}`;
}

function cloneGithubCandidates(candidates) {
  return candidates.map(candidate => ({ ...candidate }));
}

function cacheGithubRepositoryCandidates(key, candidates) {
  clientGithubRepositoryCache.delete(key);
  clientGithubRepositoryCache.set(key, { cachedAt: Date.now(), candidates: cloneGithubCandidates(candidates) });
  while (clientGithubRepositoryCache.size > CLIENT_GITHUB_REPOSITORY_CACHE_MAX_ENTRIES) {
    const oldestKey = clientGithubRepositoryCache.keys().next().value;
    if (oldestKey === undefined) break;
    clientGithubRepositoryCache.delete(oldestKey);
  }
}

function parseClientGithubUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('URL GitHub không hợp lệ.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('URL GitHub phải dùng HTTPS và không có query hoặc credential.');
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.hostname.toLowerCase() === 'raw.githubusercontent.com') {
    if (parts.length !== 4 || !['main.cpp', 'main.py'].includes(parts[3])) throw new Error('URL raw phải trỏ tới main.cpp hoặc main.py ở thư mục gốc.');
    return { kind: 'file', owner: parts[0], repository: parts[1], ref: parts[2], filename: parts[3], rawUrl: url.href, repositoryUrl: `https://github.com/${parts[0]}/${parts[1]}` };
  }
  if (url.hostname.toLowerCase() !== 'github.com' || (parts.length !== 2 && parts.length !== 5) || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37})$/.test(parts[0]) || !/^[A-Za-z0-9_.-]+$/.test(parts[1])) throw new Error('URL GitHub phải có dạng repository hoặc file main.cpp/main.py công khai.');
  if (parts.length === 2) return { kind: 'repository', owner: parts[0], repository: parts[1], repositoryUrl: url.href.replace(/\/$/, '') };
  if (parts[2] !== 'blob' || !['main.cpp', 'main.py'].includes(parts[4]) || parts.length !== 5) throw new Error('URL file phải trỏ tới main.cpp hoặc main.py ở thư mục gốc.');
  return { kind: 'file', owner: parts[0], repository: parts[1], ref: parts[3], filename: parts[4], rawUrl: `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${encodeURIComponent(parts[3])}/${parts[4]}`, repositoryUrl: `https://github.com/${parts[0]}/${parts[1]}` };
}

async function readClientGithubText(response) {
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) throw githubRateLimitError(response, 'Không thể tải file GitHub.');
    if (response.status === 404) throw new Error('Không tìm thấy file GitHub công khai.');
    throw new Error(`Không thể tải file GitHub (${response.status}).`);
  }
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > CLIENT_GITHUB_SOURCE_LIMIT) throw new Error('Mã nguồn vượt quá giới hạn 64 KiB.');
  if (!response.body) throw new Error('GitHub không trả về dữ liệu mã nguồn.');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > CLIENT_GITHUB_SOURCE_LIMIT) { await reader.cancel(); throw new Error('Mã nguồn vượt quá giới hạn 64 KiB.'); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Mã nguồn GitHub phải là UTF-8 hợp lệ.'); }
}

async function githubApiJson(url) {
  const response = await fetch(url, { credentials: 'omit', headers: { accept: 'application/vnd.github+json' } });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) throw githubRateLimitError(response, 'Không thể đọc repository GitHub.');
    if (response.status === 404) throw new Error('Repository GitHub không tồn tại hoặc không công khai.');
    throw new Error(`Không thể đọc repository GitHub (${response.status}).`);
  }
  return response.json();
}

async function clientGithubCandidates(parsed, runtimeId) {
  if (parsed.kind === 'file') {
    if (!['main.cpp', 'main.py'].includes(parsed.filename)) throw new Error('File GitHub phải là main.cpp hoặc main.py.');
    return [{ ...parsed }];
  }
  const cacheKey = githubRepositoryCacheKey(parsed);
  const cached = clientGithubRepositoryCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CLIENT_GITHUB_REPOSITORY_CACHE_TTL_MS) {
    return cloneGithubCandidates(cached.candidates);
  }
  if (cached) clientGithubRepositoryCache.delete(cacheKey);
  const metadata = await githubApiJson(`https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}`);
  if (metadata.private === true || typeof metadata.default_branch !== 'string') throw new Error('Repository phải công khai và có nhánh mặc định.');
  const contents = await githubApiJson(`https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}/contents?ref=${encodeURIComponent(metadata.default_branch)}`);
  if (!Array.isArray(contents)) throw new Error('Không thể đọc danh sách file ở thư mục gốc.');
  const candidates = contents.filter(item => item?.type === 'file' && item.path === item.name && ['main.cpp', 'main.py'].includes(item.name)).map(item => ({
    kind: 'file', owner: parsed.owner, repository: parsed.repository, ref: metadata.default_branch, filename: item.name,
    rawUrl: `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repository}/${encodeURIComponent(metadata.default_branch)}/${item.name}`,
    repositoryUrl: parsed.repositoryUrl,
  }));
  cacheGithubRepositoryCandidates(cacheKey, candidates);
  return cloneGithubCandidates(candidates);
}

function openRegistrationDialog() {
  state.registrationDialogRevision += 1;
  const context = state.tournamentRegistrationContext || state.tournaments.find(item => item.tournamentId === state.tournamentId);
  const contextNode = $('#registration-tournament-context');
  if (contextNode) {
    contextNode.textContent = context?.name ? `Giải đấu: ${context.name}` : 'Giải đấu đang chọn';
    contextNode.className = 'registration-tournament-summary';
    if (!contextNode.querySelector('svg')) {
      const trophy = icon('td-icon-trophy'); trophy.classList.add('registration-tournament-icon'); contextNode.prepend(trophy);
    }
  }
  if (contextNode) {
    clear(contextNode);
    const trophy = icon('td-icon-trophy');
    trophy.classList.add('registration-tournament-icon');
    const summaryCopy = create('span', { className: 'registration-summary-copy' });
    summaryCopy.append(
      create('small', { className: 'registration-summary-label', text: 'Giải đấu' }),
      create('strong', { text: context?.name || 'Giải đấu đang chọn' }),
    );
    contextNode.append(trophy, summaryCopy);
  }
  const description = $('#register-participant-description');
  if (description) description.textContent = 'Chọn Bot và phiên bản chiến thuật để tham gia giải đấu.';
  const closeButton = $('#register-bot-tourney-modal .modal-close');
  if (closeButton && !closeButton.querySelector('svg')) {
    clear(closeButton);
    const closeIcon = icon('td-icon-x'); closeIcon.classList.add('modal-close-icon'); closeButton.appendChild(closeIcon);
  }
  $('#registration-revision-summary').textContent = 'Chưa chọn Bot và phiên bản';
  setRegistrationLoadingState();
  const submissionPanel = $('#registration-submission-status');
  if (state.registrationSubmission?.tournamentId === state.tournamentId) {
    renderRegistrationSubmissionStatus(state.registrationSubmission);
  } else if (submissionPanel) {
    submissionPanel.hidden = true;
  }
  openModal('register-bot-tourney-modal');
  void resumeRegistrationSubmission(state.tournamentId);
}

function retryRegistrationBots() {
  state.registrationDialogRevision += 1;
  setRegistrationLoadingState();
  void populateBotSelect();
}

function showRegistrationEmptyState() {
  state.registrationBotsState = 'empty';
  $('#registration-bots-loading').hidden = true;
  $('#registration-bots-error').hidden = true;
  $('#registration-bots-empty').hidden = false;
  $('#registration-fields').hidden = true;
  $('#submit-registration').hidden = true;
}

function showRegistrationErrorState() {
  state.registrationBotsState = 'error';
  $('#registration-bots-loading').hidden = true;
  $('#registration-bots-empty').hidden = true;
  $('#registration-bots-error').hidden = false;
  $('#registration-fields').hidden = true;
  $('#submit-registration').hidden = true;
}

function showRegistrationForm() {
  state.registrationBotsState = 'ready';
  $('#registration-bots-loading').hidden = true;
  $('#registration-bots-empty').hidden = true;
  $('#registration-bots-error').hidden = true;
  const submission = state.registrationSubmission?.tournamentId === state.tournamentId
    ? state.registrationSubmission
    : null;
  const preflightStatus = submission?.preflight?.status || 'not_started';
  const locksForm = Boolean(submission) && !['failed', 'expired'].includes(preflightStatus);
  $('#registration-fields').hidden = locksForm;
  $('#submit-registration').hidden = locksForm;
  const pinningHelp = $('#reg-revision-help');
  if (pinningHelp) pinningHelp.textContent = 'Giải đấu sẽ sử dụng đúng phiên bản mã nguồn được chọn. Những chỉnh sửa sau này không làm thay đổi phiên bản đã đăng ký.';
  const submit = $('#submit-registration');
  if (submit && !submit.querySelector('svg')) {
    const actionIcon = icon('td-icon-user-round-plus'); actionIcon.classList.add('ui-icon'); submit.prepend(actionIcon);
  }
}

function setRegistrationError(message = '') {
  const error = $('#registration-form-error');
  if (!error) return;
  error.textContent = message;
  error.hidden = !message;
}

function registrationSubmissionStatusText(requestItem) {
  const preflight = requestItem?.preflight || { status: 'not_started' };
  const diagnostic = preflight.diagnostic && typeof preflight.diagnostic === 'object' ? preflight.diagnostic : {};
  const stage = diagnostic.stage ? ` · ${diagnostic.stage}` : '';
  if (preflight.status === 'passed') {
    if (requestItem?.status === 'approved') return 'Bot đã được kiểm tra thành công và yêu cầu đã được Ban tổ chức duyệt.';
    if (requestItem?.status === 'rejected') return 'Bot đã được kiểm tra thành công nhưng yêu cầu tham gia đã bị từ chối.';
    return 'Bot đã được kiểm tra thành công; yêu cầu chưa phải là tham gia chính thức và đang chờ Ban tổ chức duyệt.';
  }
  if (preflight.status === 'failed' || preflight.status === 'expired') return `Kiểm tra chưa đạt${preflight.errorCode ? ` · ${preflight.errorCode}` : ''}. Hãy chờ Ban tổ chức kiểm tra lại revision này.${stage}`;
  if (preflight.status === 'pending') return `Đang kiểm tra revision${stage}…`;
  return 'Yêu cầu đã được tiếp nhận và đang chờ đưa vào hàng đợi kiểm tra.';
}

function renderRegistrationSubmissionStatus(requestItem) {
  const panel = $('#registration-submission-status');
  if (!panel || !requestItem) return;
  const preflight = requestItem.preflight || { status: 'not_started' };
  const title = $('#registration-submission-title');
  const stateText = $('#registration-submission-state');
  const diagnostic = $('#registration-submission-diagnostic');
  const status = preflight.status || 'not_started';
  panel.hidden = false;
  panel.dataset.status = status;
  if (title) title.textContent = status === 'passed' ? 'Bot đã được xác thực' : status === 'failed' || status === 'expired' ? 'Kiểm tra Bot chưa đạt' : 'Yêu cầu đã được tiếp nhận';
  if (stateText) stateText.textContent = registrationSubmissionStatusText(requestItem);
  const diagnosticText = preflightDiagnosticText(preflight);
  if (diagnostic) {
    diagnostic.hidden = !diagnosticText;
    diagnostic.textContent = diagnosticText;
  }
}

function stopRegistrationSubmissionPolling() {
  const polling = state.registrationSubmissionPolling;
  if (!polling) return;
  if (polling.timer) window.clearTimeout(polling.timer);
  polling.abortController?.abort();
  state.registrationSubmissionPolling = null;
}

function startRegistrationSubmissionPolling(tournamentId, requestId) {
  const current = state.registrationSubmissionPolling;
  if (current?.tournamentId === tournamentId && current.requestId === requestId) return;
  stopRegistrationSubmissionPolling();
  const polling = { tournamentId, requestId, authRevision: state.authRevision, timer: null, abortController: null, inFlight: false, startedAt: Date.now() };
  state.registrationSubmissionPolling = polling;
  const schedule = (delay = 2000) => {
    if (state.registrationSubmissionPolling !== polling) return;
    polling.timer = window.setTimeout(run, delay);
  };
  const run = async () => {
    const relevantView = ['dashboard', 'tournaments', 'tournament-detail'].includes(state.activeView);
    if (state.registrationSubmissionPolling !== polling || state.authRevision !== polling.authRevision
      || state.tournamentId !== polling.tournamentId || !relevantView || polling.inFlight) {
      if (state.registrationSubmissionPolling === polling
        && (state.authRevision !== polling.authRevision || state.tournamentId !== polling.tournamentId || !relevantView)) {
        stopRegistrationSubmissionPolling();
      }
      return;
    }
    polling.inFlight = true;
    const controller = new AbortController();
    polling.abortController = controller;
    try {
      const requests = normalizeRegistrationRequestCollection(await request(`/tournaments/${tournamentId}/participation-requests/mine`, { signal: controller.signal }));
      const latest = requests.find(item => item.requestId === requestId);
      if (!latest) { stopRegistrationSubmissionPolling(); return; }
      state.registrationSubmission = { ...latest, tournamentId };
      renderRegistrationSubmissionStatus(latest);
      const terminal = ['passed', 'failed', 'expired'].includes(latest.preflight?.status || 'not_started')
        || ['approved', 'rejected'].includes(latest.status);
      if (terminal) { stopRegistrationSubmissionPolling(); return; }
    } catch (error) {
      if (error?.name === 'AbortError') return;
    } finally {
      if (state.registrationSubmissionPolling === polling) {
        polling.inFlight = false;
        polling.abortController = null;
      }
    }
    schedule(Date.now() - polling.startedAt >= 60_000 ? 10_000 : 2000);
  };
  schedule(0);
}

async function resumeRegistrationSubmission(tournamentId) {
  if (!tournamentId || state.user?.role !== 'competitor') return;
  const authRevision = state.authRevision;
  try {
    const requests = normalizeRegistrationRequestCollection(await request(`/tournaments/${tournamentId}/participation-requests/mine`));
    if (state.authRevision !== authRevision || state.tournamentId !== tournamentId) return;
    const trackedId = state.registrationSubmission?.tournamentId === tournamentId ? state.registrationSubmission.requestId : null;
    const latest = requests.find(item => item.requestId === trackedId) || requests.at(-1);
    if (!latest) return;
    state.registrationSubmission = { ...latest, tournamentId };
    const participantNameInput = $('#reg-part-name');
    if (participantNameInput && !participantNameInput.value && latest.participantName) participantNameInput.value = latest.participantName;
    renderRegistrationSubmissionStatus(latest);
    // Bot/revision loading and status restoration run concurrently when the
    // dialog is reopened. Re-apply the lock after the persisted request wins
    // the race so a passed/pending revision cannot be submitted twice.
    showRegistrationForm();
    const terminal = ['passed', 'failed', 'expired'].includes(latest.preflight?.status || 'not_started')
      || ['approved', 'rejected'].includes(latest.status);
    if (!terminal) startRegistrationSubmissionPolling(tournamentId, latest.requestId);
  } catch { /* Keep the form usable if status lookup temporarily fails. */ }
}

function goToBotsFromRegistration() {
  closeModal('register-bot-tourney-modal');
  navigate('bots');
}


function renderTournamentList() {
  syncTournamentStatusFilters();
  const list = $('#tournaments-list');
  const pagination = $('#tournament-pagination');
  clearLoadingSkeleton(list);
  if (pagination) pagination.hidden = true;
  const toolbar = $('#tournaments-toolbar');
  const createButton = $('#open-tournament-modal');
  if (state.tournamentListError) { toolbar.hidden = state.user?.role === 'competitor'; createButton.hidden = state.user?.role === 'competitor'; $('#tournaments-count').textContent = 'Không thể tải giải đấu'; return renderMessage(list, state.tournamentListError, loadTournaments); }
  const query = state.tournamentSearch.trim().toLocaleLowerCase();
  if (state.user?.role === 'competitor' && state.tournamentScope === 'discoverable') {
    state.tournamentStatusFilter = 'all';
    const statusSelect = $('#tournament-status-filter'); if (statusSelect) statusSelect.value = 'all';
  }
  const tournaments = state.tournaments.filter(tournament => tournament.name.toLocaleLowerCase().includes(query)
    && (state.user?.role !== 'competitor' || state.tournamentScope !== 'mine' || Boolean(tournament.myRequestStatus))
    && (state.tournamentStatusFilter === 'all' || tournament.status === state.tournamentStatusFilter));
  clear(list);
  const hasTournaments = state.tournaments.length > 0;
  list.classList.toggle('tournament-grid-empty', !hasTournaments);
  list.classList.toggle('tournament-grid-empty-filtered', hasTournaments && !tournaments.length);
  const competitor = state.user?.role === 'competitor';
  toolbar.hidden = !hasTournaments && competitor;
  const statusFilter = $('#tournament-status-filter');
  if (statusFilter?.parentElement) statusFilter.parentElement.hidden = competitor && state.tournamentScope === 'discoverable';
  createButton.hidden = competitor;
  if (!hasTournaments && competitor && state.tournamentScope === 'discoverable') {
    return renderTournamentEmpty('Chưa có giải đấu mở', 'Các giải đấu đang mở đăng ký sẽ xuất hiện tại đây.', false);
  }
  if (!hasTournaments && state.user?.role === 'organizer') {
    toolbar.hidden = true;
    createButton.hidden = true;
    return renderTournamentEmpty('Bạn chưa tạo giải đấu nào', 'Tạo giải đấu đầu tiên để bắt đầu tổ chức thi đấu.');
  }
  $('#tournaments-count').textContent = `${tournaments.length} / ${state.tournaments.length} giải đấu`;
  if (!hasTournaments) return renderTournamentEmpty('Bạn chưa có giải đấu nào', 'Tạo giải đấu để đăng ký Bot và bắt đầu thi đấu.');
  if (!tournaments.length) return renderTournamentEmpty(state.tournamentScope === 'mine' ? 'Chưa có yêu cầu tham gia' : 'Không tìm thấy giải đấu phù hợp', state.tournamentScope === 'mine' ? 'Các giải bạn đã gửi yêu cầu sẽ xuất hiện tại đây.' : 'Hãy thử tên khác hoặc xóa bộ lọc.', false);
  const pageSize = 8;
  const totalPages = Math.ceil(tournaments.length / pageSize);
  state.tournamentPage = Math.min(Math.max(1, state.tournamentPage), totalPages);
  const pageStart = (state.tournamentPage - 1) * pageSize;
  const pageTournaments = tournaments.slice(pageStart, pageStart + pageSize);
  if (competitor) {
    renderDiscoverableTournamentCards(list, pageTournaments);
    renderTournamentPagination(totalPages);
    return;
  }
  pageTournaments.forEach(tournament => {
    const card = create('article', { className: 'tournament-card' });
    const heading = create('div', { className: 'tournament-card-header' }); heading.append(create('h3', { text: tournament.name }), statusBadge(tournament.status)); card.appendChild(heading);
    const meta = create('div', { className: 'tournament-card-meta' });
    meta.append(tournamentMetaItem('icon-git-branch', tournamentFormatLabel(tournament.format)), tournamentMetaItem('icon-users', `${tournament.participants?.length || tournament.participantCount || 0} người tham gia`)); card.appendChild(meta);
    const footer = create('div', { className: 'tournament-card-footer' });
    const viewButton = actionButton('Xem chi tiết', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`, 'secondary-btn tournament-view-btn');
    const viewIcon = icon('icon-arrow-up-right'); viewIcon.classList.add('tournament-action-icon'); viewButton.prepend(viewIcon);
    footer.appendChild(viewButton);
    if (tournament.status === 'draft' || tournament.status === 'registration_open') footer.appendChild(actionButton('Chỉnh sửa', () => openEditTournamentDialog(tournament), `edit:${tournament.tournamentId}`, 'secondary-btn tournament-view-btn'));
    footer.appendChild(actionButton('Xóa', () => confirmTournamentAction(tournament.tournamentId, state.authRevision, state.viewRevision, 'delete', 'Xóa giải đấu', tournament.name), `delete:${tournament.tournamentId}`, 'secondary-btn tournament-action tournament-action-danger'));
    card.appendChild(footer); list.appendChild(card);
  });
  renderTournamentPagination(totalPages);
}

function renderTournamentPagination(totalPages) {
  const pagination = $('#tournament-pagination');
  if (!pagination) return;
  clear(pagination);
  if (totalPages <= 1) {
    pagination.hidden = true;
    return;
  }
  pagination.hidden = false;
  const previous = create('button', { className: 'secondary-btn tournament-pagination-button', type: 'button', text: 'Trước' });
  previous.disabled = state.tournamentPage === 1;
  previous.addEventListener('click', () => { state.tournamentPage -= 1; renderTournamentList(); });
  const pageLabel = create('span', { className: 'tournament-pagination-label', text: `Trang ${state.tournamentPage} / ${totalPages}` });
  const next = create('button', { className: 'secondary-btn tournament-pagination-button', type: 'button', text: 'Sau' });
  next.disabled = state.tournamentPage === totalPages;
  next.addEventListener('click', () => { state.tournamentPage += 1; renderTournamentList(); });
  pagination.append(previous, pageLabel, next);
}

function tournamentMetaItem(iconId, label) {
  const item = create('span', { className: 'tournament-meta-item' });
  const svg = icon(iconId);
  svg.classList.add('tournament-meta-icon');
  item.append(svg, document.createTextNode(label));
  return item;
}

function tournamentViewButton(label, callback, key) {
  const button = actionButton(label, callback, key, 'secondary-btn tournament-view-btn');
  const svg = icon('icon-arrow-up-right');
  svg.classList.add('tournament-action-icon');
  button.prepend(svg);
  return button;
}

function renderDiscoverableTournamentCards(list, tournaments) {
  tournaments.forEach(tournament => {
    const card = create('article', { className: 'tournament-card' });
    const heading = create('div');
    const publicStatus = tournament.status === 'draft' ? 'registration_not_open' : tournament.status;
    heading.append(create('h3', { text: tournament.name }), statusBadge(publicStatus), tournamentParticipationBadge(tournament));
    card.appendChild(heading);
    const meta = create('div', { className: 'tournament-card-meta' });
    meta.append(tournamentMetaItem('icon-users', `${tournament.participantCount ?? 0} ng\u01b0\u1eddi tham gia`));
    card.appendChild(meta);
    const statusLabels = { pending: 'Yêu cầu tham gia đang chờ duyệt.', approved: 'Yêu cầu tham gia đã được duyệt.', rejected: 'Yêu cầu tham gia đã bị từ chối.' };
    const participation = create('p', { className: 'tournament-participation-state', text: tournament.myRequestStatus ? statusLabels[tournament.myRequestStatus] : 'Chưa gửi yêu cầu tham gia.', attrs: { 'aria-live': 'polite' } });
    card.appendChild(participation);
    participation.hidden = true;
    const footer = create('div', { className: 'tournament-card-footer' });
    participation.textContent = tournament.status === 'registration_open'
      ? 'Mở chi tiết để xem thông tin và gửi Bot đăng ký.'
      : tournament.status === 'running'
        ? 'Đang diễn ra — mở chi tiết để xem lịch và trực tiếp.'
        : 'Mở chi tiết để xem nội dung giải đấu.';
    footer.appendChild(tournamentViewButton('Xem chi tiết', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`));
    card.appendChild(footer);
    list.appendChild(card);
  });
}

function tournamentParticipationBadge(tournament) {
  const requestStatus = tournament.myRequestStatus;
  const joined = Boolean(tournament.participantId) || requestStatus === 'approved';
  const state = joined ? 'joined' : requestStatus || 'none';
  const labels = {
    joined: 'Đã tham gia',
    pending: 'Đang chờ duyệt',
    rejected: 'Đã từ chối',
    none: 'Chưa tham gia',
  };
  const badge = create('span', {
    className: `tournament-participation-badge is-${state}`,
    attrs: { 'aria-label': `Trạng thái tham gia: ${labels[state]}` },
  });
  const iconId = joined ? 'td-icon-check' : requestStatus === 'pending' ? 'td-icon-clock-3' : 'icon-user-round-plus';
  badge.append(icon(iconId), create('span', { text: labels[state] }));
  return badge;
}

async function loadParticipationStatus(tournamentId, target, requestButton) {
  try {
    const requests = await request(`/tournaments/${tournamentId}/participation-requests/mine`);
    if (!target.isConnected) return;
    const latest = requests.length ? requests[requests.length - 1] : null;
    const labels = {
      pending: 'Yêu cầu tham gia đang chờ duyệt.',
      approved: 'Yêu cầu tham gia đã được duyệt.',
      rejected: 'Yêu cầu tham gia đã bị từ chối.',
    };
    target.textContent = latest ? (labels[latest.status] || 'Đã gửi yêu cầu tham gia.') : 'Chưa gửi yêu cầu tham gia.';
    if (latest?.status === 'pending') {
      requestButton.disabled = true;
      requestButton.textContent = 'Đang chờ duyệt';
    } else if (latest?.status === 'approved') {
      requestButton.disabled = true;
      requestButton.textContent = 'Đã được duyệt';
    }
  } catch (error) {
    if (target.isConnected) target.textContent = error?.status === 404 ? 'Chưa gửi yêu cầu tham gia.' : 'Không thể tải trạng thái đăng ký.';
  }
}

function renderTournamentEmpty(title, message, showAction = true) {
  const list = $('#tournaments-list'); clear(list);
  if (state.user?.role === 'competitor') showAction = false;
  const empty = create('div', { className: 'ui-message' });
  const emptyIcon = icon(title.includes('Không tìm thấy') ? 'icon-search-x' : 'icon-trophy');
  emptyIcon.classList.add('tournament-empty-icon');
  empty.append(emptyIcon, create('strong', { className: 'bot-empty-title', text: title }), create('p', { className: 'bot-empty-copy', text: message }));
  if (title.includes('Không tìm thấy')) {
    empty.appendChild(actionButton('Xóa bộ lọc', () => {
      state.tournamentSearch = '';
      state.tournamentStatusFilter = 'all';
      const search = $('#tournament-search');
      const filter = $('#tournament-status-filter');
      if (search) search.value = '';
      if (filter) filter.value = 'all';
      renderTournamentList();
    }, 'clear-tournament-filters', 'secondary-btn bot-empty-action'));
  }
  if (showAction) empty.appendChild(actionButton('Tạo giải đấu', openTournamentDialog, 'empty-create-tournament', 'primary-btn bot-empty-action'));
  list.appendChild(empty);
}

function syncTournamentStatusFilters() {
  const competitor = state.user?.role === 'competitor';
  const allowed = competitor
    ? new Set(['all', 'registration_open', 'registration_closed', 'running', 'completed'])
    : null;
  ['#tournament-status-filter', '#dashboard-tournament-status'].forEach(selector => {
    const filter = $(selector);
    if (!filter) return;
    [...filter.options].forEach(option => {
      option.hidden = Boolean(allowed && !allowed.has(option.value));
    });
    if (allowed && !allowed.has(filter.value)) {
      filter.value = 'all';
      if (selector === '#tournament-status-filter') state.tournamentStatusFilter = 'all';
      if (selector === '#dashboard-tournament-status') state.dashboardTournamentStatus = 'all';
    }
  });
}

async function submitNewBot() {
  await submitBot();
}

async function submitNewTournament() {
  const button = $('#submit-tournament');
  const nameInput = $('#new-tourney-name');
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const dialogRevision = state.tournamentDialogRevision;
  const name = nameInput.value.trim();
  const error = $('#tournament-form-error'); error.textContent = ''; error.hidden = true;
  nameInput.setAttribute('aria-invalid', 'false');
  if (!name || name.length > 100) {
    error.textContent = 'Tên giải đấu phải có từ 1 đến 100 ký tự.';
    error.hidden = false;
    nameInput.setAttribute('aria-invalid', 'true');
    nameInput.focus();
    return;
  }
  const submitLabel = button?.querySelector('.tournament-submit-label');
  const loadingLabel = button?.querySelector('.tournament-submit-loading');
  button?.classList.add('is-loading');
  button?.setAttribute('aria-busy', 'true');
  submitLabel?.classList.add('hidden');
  loadingLabel?.classList.remove('hidden');
  try {
    await runPending('create-tournament', button, async () => {
      let result;
      const editingTournament = state.editingTournament;
      try {
        result = editingTournament
          ? await api(`/tournaments/${editingTournament.tournamentId}`, { method: 'PATCH', body: JSON.stringify({ name }) })
          : await api('/tournaments', { method: 'POST', body: JSON.stringify({ name, format: 'multi_stage' }) });
      }
      catch (requestError) { if (state.user && state.authRevision === authRevision && state.tournamentDialogRevision === dialogRevision) { error.textContent = requestError.message || 'Không thể tạo giải đấu.'; error.hidden = false; } throw requestError; }
      if (!state.user || state.authRevision !== authRevision || state.viewRevision !== viewRevision) return;
      if (state.tournamentDialogRevision !== dialogRevision) return;
      closeModal('add-tourney-modal'); nameInput.value = '';
      state.editingTournament = null;
      showToast(editingTournament ? 'Đã cập nhật giải đấu.' : 'Đã tạo giải đấu.', 'success');
      if (editingTournament) await loadTournaments(); else await viewTournament(result.tournamentId);
    });
  } finally {
    button?.classList.remove('is-loading');
    button?.removeAttribute('aria-busy');
    submitLabel?.classList.remove('hidden');
    loadingLabel?.classList.add('hidden');
  }
}

async function viewTournament(id) {
  if (state.tournamentId !== id) state.detailRequestsFilter = 'pending';
  state.tournamentDetailSource = state.activeView;
  state.tournamentId = id;
  navigate('tournament-detail');
  await refreshTournamentDetail();
}

function appendTournamentAction(container, tournamentId, authRevision, viewRevision, label, action, confirmation = false, tournamentName = '') {
  const buttonClass = action === 'cancel' || action === 'delete' ? 'secondary-btn tournament-action tournament-action-danger' : 'primary-btn tournament-action';
  const button = actionButton(label, () => confirmation ? confirmTournamentAction(tournamentId, authRevision, viewRevision, action, label, tournamentName) : tournamentAction(tournamentId, authRevision, viewRevision, action), `tournament:${tournamentId}:${action}`, buttonClass);
  const actionIcon = action === 'cancel' || action === 'delete' || action === 'stop_execution' ? 'td-icon-circle-x' : action === 'open_registration' ? 'td-icon-user-round-plus' : action === 'run_all' || action === 'start_next_stage' ? 'td-icon-play' : null;
  if (actionIcon) {
    const labelNode = button.firstChild;
    button.insertBefore(icon(actionIcon), labelNode);
    button.firstChild.classList.add('td-icon', 'td-icon--sm');
  }
  container.appendChild(button);
  return button;
}

function getTournamentExecutionSummary(tournament) {
  // Bye pairings are automatic advances, not executable matches. Exclude
  // them from execution progress so the denominator reflects real games.
  const pairings = (tournament.rounds || []).flatMap(round => round.pairings || [])
    .filter(pairing => pairing.participantB !== null);
  const completedStatuses = new Set(['completed', 'finished', 'completed_match']);
  const runningStatuses = new Set(['running', 'in_progress', 'active']);
  const failedStatuses = new Set(['failed', 'error']);
  const completed = pairings.filter(pairing => completedStatuses.has(pairing.status)).length;
  const running = pairings.filter(pairing => runningStatuses.has(pairing.status)).length;
  const failed = pairings.filter(pairing => failedStatuses.has(pairing.status)).length;
  const waiting = pairings.length - completed - running - failed;
  return { pairings, total: pairings.length, completed, running, failed, waiting };
}

function renderExecutionStatus(tournament) {
  const status = $('#td-execution-status');
  const stats = $('#td-stats');
  if (!status || !stats) return getTournamentExecutionSummary(tournament);
  const summary = getTournamentExecutionSummary(tournament);
  status.className = 'bots-count execution-status';
  if (!summary.total) {
    status.textContent = 'Chưa có trận đấu';
    stats.textContent = '';
    return summary;
  }
  if (summary.failed) {
    status.classList.add('execution-status-error');
    status.textContent = `${summary.failed} trận lỗi cần kiểm tra`;
  } else if (summary.running) {
    status.classList.add('execution-status-running');
    status.textContent = 'Đang thực thi các trận đấu';
  } else if (summary.completed === summary.total) {
    status.classList.add('execution-status-complete');
    status.textContent = 'Tất cả trận đấu đã hoàn tất';
  } else if (summary.completed) {
    status.classList.add('execution-status-progress');
    status.textContent = `Đã hoàn thành ${summary.completed}/${summary.total} trận đấu`;
  } else {
    status.classList.add('execution-status-ready');
    status.textContent = tournament.status === 'running'
      ? 'Giải đang diễn ra · Scheduler sẵn sàng'
      : 'Sẵn sàng thực thi trận đấu';
  }
  stats.textContent = `${summary.completed}/${summary.total} trận hoàn thành`;
  return summary;
}

async function handleCloseRegistration(tournamentId, tournamentName, authRevision, viewRevision) {
  try {
    const reqs = await request(`/tournaments/${tournamentId}/requests`);
    const pendingReqs = (reqs || []).filter(r => r.status === 'pending');
    if (pendingReqs.length > 0) {
      showToast(`Không thể đóng đăng ký: còn ${pendingReqs.length} yêu cầu đang chờ xét duyệt. Vui lòng duyệt hoặc từ chối trước khi đóng.`, 'error');
      return;
    }
  } catch (err) {
    // Continue if cannot fetch requests
  }
  confirmTournamentAction(tournamentId, authRevision, viewRevision, 'close_registration', actionLabel('close_registration'), tournamentName);
}

function renderTournamentGuidance(tournament) {
  const guidance = $('#td-next-step');
  if (!guidance) return;
  if (tournament.status === 'draft' || tournament.status === 'registration_open') {
    guidance.hidden = true;
    guidance.replaceChildren();
    return;
  }
  if (getTournamentLifecyclePhase(tournament) <= 4) {
    guidance.hidden = true;
    guidance.replaceChildren();
    return;
  }
  if (getTournamentLifecyclePhase(tournament) === 5) {
    guidance.hidden = true;
    guidance.replaceChildren();
    return;
  }
  if (getTournamentLifecyclePhase(tournament) === 6) {
    guidance.hidden = true;
    guidance.replaceChildren();
    return;
  }
  if (tournament.status === 'completed' && tournament.resultsPublishedAt) {
    guidance.hidden = true;
    guidance.replaceChildren();
    return;
  }
  guidance.hidden = false;
  const scheduledMatches = tournament.rounds?.reduce((total, round) => total + (round.pairings?.length || 0), 0) || 0;
  const copy = {
    draft: ['Bước tiếp theo', 'Mở đăng ký để bắt đầu nhận Bot tham gia giải đấu.'],
    registration_open: tournament.rounds.length
      ? ['Bước tiếp theo', 'Lịch thi đấu đã sẵn sàng. Bắt đầu giải đấu để chuyển sang thi đấu.']
      : ['Bước tiếp theo', 'Đăng ký Bot, sau đó tạo lịch thi đấu cho giải.'],
    registration_closed: tournament.rounds.length
      ? ['BƯỚC TIẾP THEO', `Lịch thi đấu đã được tạo với ${tournament.participants.length} Bot và ${scheduledMatches} trận đấu. Bạn có thể bắt đầu giải đấu khi đã sẵn sàng.`]
      : ['BƯỚC TIẾP THEO', 'Tạo lịch thi đấu để chuyển sang giai đoạn thi đấu.'],
    running: ['Đang thi đấu', 'Các trận đấu đang được xử lý. Kết quả sẽ cập nhật khi hoàn tất.'],
    completed: ['Đã hoàn thành', 'Xem bảng xếp hạng và mở lại diễn biến của từng trận đấu bên dưới.'],
    cancelled: ['Đã hủy', 'Giải đấu này đã kết thúc và không còn thao tác tiếp theo.'],
  }[tournament.status] || ['Trạng thái giải đấu', 'Thông tin và thao tác sẽ được cập nhật theo trạng thái hiện tại.'];
  if (tournament.status === 'completed') {
    copy[0] = tournament.resultsPublishedAt ? 'Đã công bố' : 'Đã hoàn thành';
    copy[1] = tournament.resultsPublishedAt ? 'Kết quả và diễn biến trận đấu đã được công bố.' : (state.user?.role === 'competitor' ? 'Kết quả chưa được công bố.' : 'Công bố kết quả để cho phép người chơi xem.');
  }
  if (tournament.status === 'running') {
    const execution = getTournamentExecutionSummary(tournament);
    copy[0] = 'TRẠNG THÁI THI ĐẤU';
    if (execution.failed) {
      copy[1] = `Có ${execution.failed} trận lỗi cần kiểm tra trước khi tiếp tục thực thi.`;
    } else if (execution.running) {
      copy[1] = `Có ${execution.running} trận đang được xử lý. Kết quả sẽ cập nhật khi trận đấu hoàn tất.`;
    } else if (execution.waiting) {
      copy[1] = `Có ${execution.waiting} trận đang chờ xử lý. Chọn "Chạy tất cả trận đấu" để bắt đầu thực thi và ghi nhận kết quả.`;
    } else {
      copy[1] = 'Tất cả trận đấu đã hoàn tất và kết quả đã được ghi nhận.';
    }
  }
  guidance.classList.toggle('tournament-next-step-cancelled', tournament.status === 'cancelled');
  const runningExecution = tournament.status === 'running' ? getTournamentExecutionSummary(tournament) : null;
  const runningTitle = runningExecution?.waiting && !runningExecution.running && !runningExecution.failed
    ? 'Sẵn sàng thực thi trận đấu'
    : runningExecution?.running ? 'Đang thực thi các trận đấu'
      : runningExecution?.failed ? 'Có trận đấu lỗi'
        : 'Tất cả trận đấu đã hoàn tất';
  const titleMap = { draft: 'Mở đăng ký', registration_open: state.user?.role === 'competitor' ? 'Đăng ký Bot' : 'Đóng đăng ký', registration_closed: tournament.rounds.length ? 'Bắt đầu giải đấu' : 'Tạo lịch thi đấu', running: runningTitle, completed: tournament.resultsPublishedAt ? 'Giải đấu đã công bố' : 'Công bố kết quả', cancelled: 'Giải đấu đã hủy' };
  const iconWrap = create('span', { className: 'next-step-icon' }); iconWrap.appendChild(icon('td-icon-circle-arrow-right')); iconWrap.firstChild.classList.add('td-icon', 'td-icon--md');
  const content = create('div', { className: 'next-step-content' });
  content.append(create('span', { className: 'panel-kicker', text: copy[0] }), create('strong', { text: titleMap[tournament.status] || copy[0] }), create('p', { text: copy[1] }));
  guidance.replaceChildren(iconWrap, content);
}

function isRosterFinalPhase(tournament) {
  return tournament?.status === 'registration_closed'
    && !(tournament.rounds || []).length
    && !(tournament.stages || []).length;
}

function updateTournamentLifecycleMobileSummary(label, count, progress, cancelled = false) {
  const stage = $('#td-lifecycle-mobile-stage');
  const counter = $('#td-lifecycle-count');
  const track = $('#td-lifecycle-mobile-progress');
  const fill = $('#td-lifecycle-mobile-progress-fill');
  if (stage) stage.textContent = label;
  if (counter) counter.textContent = count;
  if (track) {
    track.setAttribute('aria-valuenow', cancelled ? '0' : String(progress));
    track.setAttribute('aria-valuetext', cancelled ? 'Đã hủy' : `${count}: ${label}`);
  }
  if (fill) fill.style.width = cancelled ? '0%' : `${Math.max(0, Math.min(100, (progress / 7) * 100))}%`;
}

function renderTournamentLifecycle(tournament) {
  updateTournamentScheduleNotice(tournament);
  const list = $('#td-lifecycle');
  if (!list) return;
  if (state.user?.role === 'competitor') {
    const lifecycleMobile = $('#td-lifecycle-mobile');
    if (lifecycleMobile) lifecycleMobile.hidden = true;
    const nextStep = $('#td-next-step');
    if (nextStep) {
      nextStep.hidden = true;
      nextStep.replaceChildren();
    }
    const phaseLabel = $('#td-phase-label');
    if (phaseLabel) phaseLabel.textContent = 'Thông tin công khai';
    return;
  }
  const lifecycleMobile = $('#td-lifecycle-mobile');
  if (lifecycleMobile) lifecycleMobile.hidden = false;
  const steps = ['Tạo giải', 'Mở đăng ký', 'Chốt danh sách', 'Lập lịch', 'Thi đấu', 'Hoàn thành', 'Công bố'];
  if (tournament.status === 'cancelled') {
    const phaseLabel = $('#td-phase-label'); if (phaseLabel) phaseLabel.textContent = 'Đã hủy';
    list.classList.remove('lifecycle-compact');
    list.dataset.current = '—';
    list.dataset.cancelled = 'true';
    const count = $('#td-lifecycle-count'); if (count) count.textContent = 'Đã hủy';
    updateTournamentLifecycleMobileSummary('Đã hủy', 'Đã hủy', 0, true);
    const item = create('li', { className: 'is-cancelled' });
    const marker = create('span', { className: 'lifecycle-marker', attrs: { 'aria-hidden': 'true' } });
    marker.appendChild(icon('td-icon-circle-x')); marker.firstChild.classList.add('td-icon', 'td-icon--sm');
    item.append(marker, create('span', { text: 'Đã hủy' }));
    list.replaceChildren(item);
    return;
  }
  if (tournament.status === 'registration_open') {
    list.classList.remove('lifecycle-compact');
    list.dataset.current = '2';
    list.dataset.cancelled = 'false';
    const count = $('#td-lifecycle-count'); if (count) count.textContent = 'Giai đoạn 2 / 7';
  }
  let currentIndex = { draft: 0, registration_open: 1, registration_closed: tournament.rounds?.length ? 3 : 2, running: 4, completed: tournament.resultsPublishedAt ? 6 : 5, cancelled: 0 }[tournament.status] ?? 0;
  const phaseLabel = $('#td-phase-label');
  if (phaseLabel) phaseLabel.textContent = `Giai đoạn ${currentIndex + 1}/7`;
  list.dataset.current = String(currentIndex + 1);
  list.dataset.cancelled = 'false';
  list.style.setProperty('--progress', String((currentIndex / (steps.length - 1)) * 100));
  const count = $('#td-lifecycle-count'); if (count) count.textContent = `Giai đoạn ${currentIndex + 1} / ${steps.length}`;
  updateTournamentLifecycleMobileSummary(steps[currentIndex], `Giai đoạn ${currentIndex + 1} / ${steps.length}`, currentIndex + 1);
  list.replaceChildren(...steps.map((label, index) => {
    const item = create('li', { className: index < currentIndex ? 'is-complete' : index === currentIndex ? 'is-current' : 'is-upcoming' });
    const marker = create('span', { className: 'lifecycle-marker', attrs: { 'aria-hidden': 'true' } });
    if (index < currentIndex) { marker.appendChild(icon('td-icon-check')); marker.firstChild.classList.add('td-icon', 'td-icon--sm'); }
    else marker.textContent = String(index + 1);
    item.append(marker, create('span', { text: label }));
    item.setAttribute('aria-current', index === currentIndex ? 'step' : 'false');
    return item;
  }));
  const current = list.querySelector('.is-current');
  if (current?.scrollIntoView && !state.detailRefreshInFlight) {
    current.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
}

function formatTournamentCountdown(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days) return `${days} ngày ${String(hours).padStart(2, '0')} giờ`;
  if (hours) return `${hours} giờ ${String(minutes).padStart(2, '0')} phút`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTournamentScheduleNotice(tournament) {
  const subtitle = $('#td-subtitle');
  if (!subtitle || !tournament) return;
  const schedule = tournament.schedule || {};
  const now = Date.now();
  const visibleAt = Date.parse(schedule.visibleAt || '');
  const opensAt = Date.parse(schedule.registrationOpensAt || '');
  const closesAt = Date.parse(schedule.registrationClosesAt || '');
  let notice = '';
  if (Number.isFinite(visibleAt) && visibleAt > now) notice = `Giải sẽ công khai sau ${formatTournamentCountdown(visibleAt - now)}.`;
  else if (tournament.status === 'draft' && Number.isFinite(opensAt) && opensAt > now) notice = `Đăng ký sẽ mở sau ${formatTournamentCountdown(opensAt - now)}.`;
  else if (tournament.status === 'registration_open' && Number.isFinite(closesAt) && closesAt > now) notice = `Đăng ký sẽ đóng sau ${formatTournamentCountdown(closesAt - now)}.`;
  else if (tournament.status === 'registration_closed' && tournament.registrationClosedReason === 'scheduled') notice = 'Đã hết hạn tiếp nhận đăng ký tự động. Organizer vẫn có thể xử lý hồ sơ đang chờ trước khi chốt danh sách.';
  if (notice) subtitle.textContent = notice;
}

function getTournamentLifecyclePhase(tournament) {
  if (!tournament) return 1;
  const status = tournament.status;
  if (status === 'draft') return 1;
  if (status === 'registration_open') return 2;
  if (status === 'registration_closed') {
    const hasRounds = (Array.isArray(tournament.rounds) && tournament.rounds.length > 0)
      || (Array.isArray(tournament.stages) && tournament.stages.some(s => (s.groups && s.groups.length > 0) || (s.rounds && s.rounds.length > 0)));
    return hasRounds ? 4 : 3;
  }
  if (status === 'running') return 5;
  if (status === 'completed') {
    return tournament.resultsPublishedAt ? 7 : 6;
  }
  if (status === 'cancelled') return 0;
  return 1;
}

function phaseLayoutClass(phase) {
  const map = {
    1: 'phase-layout-draft',
    2: 'phase-layout-registration',
    3: 'phase-layout-roster-final',
    4: 'phase-layout-schedule-preview',
    5: 'phase-layout-running',
    6: 'phase-layout-results-review',
    7: 'phase-layout-completed-archive',
  };
  return map[phase] || 'phase-layout-generic';
}

function hasTournamentSchedule(tournament) {
  return Boolean(
    (Array.isArray(tournament?.rounds) && tournament.rounds.length)
    || (Array.isArray(tournament?.stages) && tournament.stages.some(stage => (
      (stage.groups && stage.groups.length > 0) || (stage.rounds && stage.rounds.length > 0) || (stage.regions && stage.regions.length > 0)
    )))
  );
}

function renderCompetitorPublicLive(container, tournament) {
  const runningPairings = getAllTournamentPairings(tournament)
    .filter(pairing => (pairing?.status === 'in_progress' || pairing?.status === 'running') && pairing.matchId);
  const panel = create('section', { className: 'tournament-panel phase-card competitor-public-live' });
  const head = create('div', { className: 'competitor-public-section-head' });
  head.append(
    create('div', { children: [create('h3', { text: 'Đang thi đấu trực tiếp' }), create('p', { text: runningPairings.length ? 'Các trận đang chạy có thể được theo dõi trực tiếp.' : 'Hiện chưa có trận nào đang chạy.' })] }),
    create('span', { className: 'competitor-public-access-note', text: 'Live' })
  );
  panel.appendChild(head);
  if (runningPairings.length) {
    const list = create('div', { className: 'competitor-public-live-list' });
    runningPairings.forEach((pairing, index) => {
      const item = create('article', { className: 'competitor-public-live-item' });
      const names = create('strong', { text: `${resolveParticipantName(tournament, pairing.participantA, pairing.slotA)} vs ${resolveParticipantName(tournament, pairing.participantB, pairing.slotB)}` });
      item.append(names, actionButton('Xem trực tiếp', () => openLiveMatch(tournament.tournamentId, pairing.matchId, pairing.pairingId), `competitor-live:${pairing.pairingId || index}`, 'primary-btn'));
      list.appendChild(item);
    });
    panel.appendChild(list);
  }
  container.appendChild(panel);
}

function renderCompetitorPublicInfo(container, tournament) {
  const schedule = phase1Schedule(tournament);
  const rules = tournament.rulesConfig || {};
  const matchConfig = tournament.matchConfig || {};
  const scoringConfig = tournament.scoringConfig || {};
  const isMultiStage = tournament.format === 'multi_stage';
  const conversionEnabled = Boolean(rules.ruleModifiers?.conversion);
  const publicDate = value => {
    if (!value) return 'Chưa thiết lập';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZoneName: 'short',
    }).format(date);
  };
  const publicRuleCard = (title, description, items) => {
    const section = create('section', { className: 'competitor-public-rule-card' });
    section.append(create('h4', { text: title }), create('p', { text: description }));
    if (items?.length) {
      const list = create('ul', { className: 'competitor-public-rule-list' });
      items.forEach(item => list.appendChild(create('li', { children: [create('strong', { text: item[0] }), create('span', { text: item[1] })] })));
      section.appendChild(list);
    }
    return section;
  };
  const intro = create('section', { className: 'tournament-panel phase-card competitor-public-intro' });
  const introHead = create('div', { className: 'competitor-public-section-head' });
  introHead.append(
    create('div', { children: [create('h3', { text: 'Thông tin giải đấu' }), create('p', { text: 'Thông tin công khai của giải và thao tác người chơi.' })] }),
    create('span', { className: 'competitor-public-access-note', text: 'Chế độ người chơi' })
  );
  intro.appendChild(introHead);
  intro.appendChild(phase1ReadList([
    ['Tên giải đấu', tournament.name],
    ['Mô tả', tournament.description],
    ['Đơn vị tổ chức', tournament.organizerInfo],
    ['Liên hệ', tournament.contactInfo],
    ['Thể thức', tournament.format === 'multi_stage' ? 'Nhiều giai đoạn' : tournamentFormatLabel(tournament.format)],
    ['Luật thi đấu', 'OTT Standard'],
    ['Luật Conversion', rules.ruleModifiers?.conversion ? 'Đã bật' : 'Không bật'],
    ['Thời gian công khai', publicDate(schedule.visibleAt)],
    ['Mở đăng ký', publicDate(schedule.registrationOpensAt)],
    ['Đóng đăng ký', publicDate(schedule.registrationClosesAt)],
  ]));
  container.appendChild(intro);
  const standardRuleCard = publicRuleCard('Luật bàn cờ', 'Luật gốc OTT Standard luôn được bật trong mọi trận đấu.', [
    ['Bàn cờ', 'Bàn cờ 9×9; mỗi bên có 9 quân gồm Búa, Bao và Kéo.'],
    ['Di chuyển', 'Mỗi lượt đi một ô theo ngang, dọc hoặc chéo; không đi ra ngoài bàn hoặc vào ô có quân cùng phe.'],
    ['Ăn quân', 'Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa; không ăn quân cùng loại hoặc cùng phe.'],
    ['Điều kiện thắng', 'Đưa quân tới ô đích hoặc ăn hết quân đối thủ. Hòa theo các điều kiện do Engine xác định.'],
    ['Luật mở rộng', conversionEnabled ? 'Conversion đang bật' : 'Không bật Conversion'],
    ...(conversionEnabled ? [
      ['Khi ăn quân', 'Quân A di chuyển vào ô của quân B.'],
      ['Quân bị ăn', 'Giữ nguyên loại và ID, đổi sang phe A rồi trở về ô xuất phát của quân A.'],
      ['Chuyển phe nhiều lần', 'Một quân có thể tiếp tục đổi phe qua các lần bị ăn tiếp theo.'],
    ] : []),
    ['Quyền xem', 'Kết quả và replay hiển thị khi dữ liệu trận đã sẵn sàng.'],
  ]);
  standardRuleCard.appendChild(create('button', {
    className: 'secondary-btn competitor-public-guide-link',
    text: 'Xem hướng dẫn luật đầy đủ',
    attrs: { type: 'button', 'data-guide-target': 'player-guide' },
  }));
  const rulesSection = create('section', { className: 'competitor-public-rules' });
  rulesSection.append(
    create('div', { className: 'competitor-public-section-head', children: [
      create('div', { children: [create('h3', { text: 'Cách thi đấu' }), create('p', { text: 'Các quy tắc chính được áp dụng cho trận đấu và bảng xếp hạng.' })] }),
    ] }),
    create('div', { className: 'competitor-public-rule-grid', children: [
      standardRuleCard,
      publicRuleCard('Thể thức series', isMultiStage ? 'Cấu trúc series được cố định theo từng vòng.' : 'Giải legacy giữ nguyên cấu hình đã lưu.', isMultiStage
        ? [['Vòng khu vực', 'BO3'], ['Vòng bảng', 'BO2'], ['Vòng loại trực tiếp', 'BO3']]
        : [['Số ván mỗi cặp', `BO${matchConfig.bestOf || 1}`]]),
      publicRuleCard('Tính điểm', 'Điểm dùng để xếp hạng trong bảng đấu.', [
        ['Thắng', `${scoringConfig.winPoints ?? (isMultiStage ? 3 : 3)} điểm`],
        ['Hòa', `${scoringConfig.drawPoints ?? (isMultiStage ? 1 : 1)} điểm`],
        ['Thua', `${scoringConfig.lossPoints ?? 0} điểm`],
      ]),
      publicRuleCard('Giới hạn trận đấu', 'Các giới hạn kỹ thuật được áp dụng đồng nhất cho mọi Bot.', [
        ['Lượt tối đa', `${matchConfig.maxTurns ?? 200} lượt`],
        ['Timeout mỗi lượt', `${matchConfig.turnTimeoutMs ?? (tournament.configurationVersion === 2 ? 5000 : 2000)} ms (thực thi tối thiểu 5000 ms)`],
      ]),
    ] })
  );
  if (tournament.rulesNotes || tournament.policyNotes) {
    const notes = create('section', { className: 'competitor-public-notes' });
    notes.append(create('h3', { text: 'Điều lệ và ghi chú của ban tổ chức' }));
    if (tournament.rulesNotes) notes.append(create('p', { children: [create('strong', { text: 'Điều lệ: ' }), create('span', { text: tournament.rulesNotes })] }));
    if (tournament.policyNotes) notes.append(create('p', { children: [create('strong', { text: 'Chính sách tham gia: ' }), create('span', { text: tournament.policyNotes })] }));
    rulesSection.appendChild(notes);
  }
  container.appendChild(rulesSection);
  if (tournament.status === 'registration_open') renderPhase2Registration(container, tournament);
}

function setCompetitorPublicHeader() {
  const phaseLabel = $('#td-phase-label');
  if (phaseLabel) phaseLabel.textContent = 'Chi tiết công khai';
}

function ensureCompetitorPublicScheduleWorkspace(container) {
  let workspace = container.querySelector('#multi-stage-workspace');
  if (!workspace) {
    workspace = create('div', { className: 'multi-stage-workspace', attrs: { id: 'multi-stage-workspace' } });
    container.appendChild(workspace);
  }
  workspace.hidden = false;
  return workspace;
}

function renderCompetitorPublicSchedule(container, tournament, multiStageContext) {
  if (tournament.format === 'multi_stage' || multiStageContext) {
    ensureCompetitorPublicScheduleWorkspace(container);
    if (state.multiStage.progress) renderMultiStageWorkspace({ preserveFocus: true });
  } else if (hasTournamentSchedule(tournament)) renderPhase4Scheduling(container, tournament);
  else container.appendChild(create('section', { className: 'tournament-panel phase-card competitor-public-empty', children: [
    create('h3', { text: 'Lịch thi đấu' }),
    create('p', { text: 'Lịch thi đấu chưa được công bố.' }),
  ] }));
}

function renderCompetitorPublicArchive(container, tournament, multiStageContext) {
  if (tournament.status === 'completed') renderPhase7History(container, tournament, multiStageContext);
  else container.appendChild(create('section', { className: 'tournament-panel phase-card competitor-public-empty', children: [
    create('h3', { text: 'Công bố' }),
    create('p', { text: 'Kết quả chung cuộc sẽ được tổng hợp sau khi giải đấu hoàn tất.' }),
  ] }));
}

function renderCompetitorPublicTournament(container, tournament, multiStageContext) {
  container.className = 'tournament-lifecycle-body competitor-public-workspace';
  const tabDefinitions = [
    ['info', 'Thông tin giải đấu'],
    ['schedule', 'Lịch & nhánh đấu'],
    ['live', 'Xem trực tiếp'],
    ['published', 'Công bố'],
  ];
  const requestedTab = tabDefinitions.some(([key]) => key === state.publicTournamentTab) ? state.publicTournamentTab : 'info';
  state.publicTournamentTab = requestedTab;
  const nav = create('div', { className: 'competitor-public-tabs', attrs: { role: 'tablist', 'aria-label': 'Nội dung giải đấu công khai' } });
  const panels = create('div', { className: 'competitor-public-tab-panels' });
  const rendered = new Set();
  const renderTab = key => {
    if (rendered.has(key)) return;
    const panel = panels.querySelector(`[data-public-tab-panel="${key}"]`);
    if (!panel) return;
    if (key === 'info') renderCompetitorPublicInfo(panel, tournament);
    if (key === 'schedule') renderCompetitorPublicSchedule(panel, tournament, multiStageContext);
    if (key === 'live') renderCompetitorPublicLive(panel, tournament);
    if (key === 'published') renderCompetitorPublicArchive(panel, tournament, multiStageContext);
    rendered.add(key);
  };
  tabDefinitions.forEach(([key, label]) => {
    const tab = create('button', { className: `competitor-public-tab${key === requestedTab ? ' is-active' : ''}`, type: 'button', text: label, attrs: { role: 'tab', 'aria-selected': String(key === requestedTab), 'aria-controls': `public-tab-panel-${key}` } });
    tab.addEventListener('click', () => {
      state.publicTournamentTab = key;
      nav.querySelectorAll('[role="tab"]').forEach(item => {
        const active = item === tab;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
      });
      panels.querySelectorAll('[data-public-tab-panel]').forEach(item => { item.hidden = item.dataset.publicTabPanel !== key; });
      renderTab(key);
      setCompetitorPublicHeader();
    });
    nav.appendChild(tab);
    panels.appendChild(create('section', { className: 'competitor-public-tab-panel', attrs: { id: `public-tab-panel-${key}`, role: 'tabpanel', 'data-public-tab-panel': key, 'aria-label': label, ...(key === requestedTab ? {} : { hidden: 'true' }) } }));
  });
  container.append(nav, panels);
  renderTab(requestedTab);
  setCompetitorPublicHeader();
}

function renderTournamentLifecycleBody(container, tournament, multiStageContext) {
  if (!container) return;
  if (state.user?.role === 'competitor') {
    $('#tournament-detail')?.classList.add('is-competitor-view');
    clear(container);
    renderCompetitorPublicTournament(container, tournament, multiStageContext);
    container.dataset.lifecyclePhase = 'public';
    return;
  }
  $('#tournament-detail')?.classList.remove('is-competitor-view');
  const phase = getTournamentLifecyclePhase(tournament);
  const existingRequestList = container.querySelector('#phase2-request-list');
  if (phase === 2 && container.dataset.lifecyclePhase === '2' && existingRequestList) {
    container.className = `tournament-lifecycle-body ${phaseLayoutClass(phase)}`;
    void renderPhase2Requests(
      tournament.tournamentId,
      existingRequestList,
      container.querySelector('.request-pending-count'),
      tournament,
      { statsRoot: container.querySelector('.phase-reg-stats-grid') }
    );
    return;
  }
  clear(container);
  container.className = `tournament-lifecycle-body ${phaseLayoutClass(phase)}`;
  const detail = $('#tournament-detail');
  if (detail) {
    detail.classList.toggle('is-phase-1', phase === 1);
    detail.classList.toggle('is-phase-2', phase === 2);
    detail.classList.toggle('is-phase-4', phase === 4);
    detail.classList.toggle('is-phase-5', phase === 5);
  }

  if (phase === 1) {
    renderPhase1Creation(container, tournament);
  } else if (phase === 2) {
    renderPhase2Registration(container, tournament);
  } else if (phase === 3) {
    renderPhase3RosterFinal(container, tournament);
  } else if (phase === 4) {
    renderPhase4Scheduling(container, tournament);
  } else if (phase === 5) {
    renderPhase5Running(container, tournament, multiStageContext);
  } else if (phase === 6) {
    renderPhase6Results(container, tournament);
  } else if (phase === 7) {
    renderPhase7History(container, tournament, multiStageContext);
  }
  container.dataset.lifecyclePhase = String(phase);
}

function createPhase1DraftLegacy(tournament) {
  return {
    name: tournament.name || '',
    description: tournament.description || '',
    organizerInfo: tournament.organizerInfo || '',
    contactInfo: tournament.contactInfo || '',
    rulesNotes: tournament.rulesNotes || '',
    policyNotes: tournament.policyNotes || '',
  };
}

function capturePhase1DraftFromDomLegacy(tournament) {
  const draft = state.phase1Draft || createPhase1Draft(tournament);
  const fields = {
    name: 'edit-t-name',
    description: 'edit-t-desc',
    organizerInfo: 'edit-t-organizer',
    contactInfo: 'edit-t-contact',
    rulesNotes: 'edit-t-rules',
    policyNotes: 'edit-t-policy',
  };
  Object.entries(fields).forEach(([key, id]) => {
    const input = document.getElementById(id);
    if (input) draft[key] = input.value;
  });
  state.phase1Draft = draft;
  return draft;
}

function renderPhase1CreationLegacy(container, tournament) {
  const isOrganizer = state.user?.role === 'organizer';
  const formatLabel = tournamentFormatLabel(tournament.format);
  const matchConfig = tournament.matchConfig || {};
  const scoringConfig = tournament.scoringConfig || {};
  const participantCount = Array.isArray(tournament.participants)
    ? tournament.participants.length
    : Number(tournament.participantCount || 0);
  const statusLabels = {
    draft: 'Bản nháp',
    registration_open: 'Đang mở đăng ký',
    registration_closed: 'Đã đóng đăng ký',
    running: 'Đang thi đấu',
    completed: 'Đã hoàn thành',
    cancelled: 'Đã hủy',
  };
  const tournamentStatus = statusLabels[tournament.status] || tournament.status || 'Chưa xác định';
  const structureDesc = tournament.format === 'multi_stage'
    ? (tournament.stages?.length
      ? tournament.stages.map(stage => stage.name || stage.stageType).join(' → ')
      : participantCount >= 2
        ? 'Các vòng thi sẽ được xác định khi tạo lịch, dựa trên số Bot đã chốt.'
        : 'Cần ít nhất 2 Bot để xác định các vòng thi.')
    : 'Mỗi Bot gặp các Bot còn lại một lần; lịch được tạo từ danh sách Bot đã chốt.';
  const maxTurns = Number.isFinite(Number(matchConfig.maxTurns)) ? Number(matchConfig.maxTurns) : 200;
  const turnTimeoutMs = Number.isFinite(Number(matchConfig.turnTimeoutMs)) ? Number(matchConfig.turnTimeoutMs) : 2000;
  const bestOf = matchConfig.bestOf;

  // Update breadcrumb
  const breadcrumbRoot = $('#td-breadcrumb-root');
  if (breadcrumbRoot) breadcrumbRoot.textContent = 'Quản lý giải đấu';
  const breadcrumbName = $('#td-breadcrumb-name');
  if (breadcrumbName) breadcrumbName.textContent = 'Chuẩn bị giải đấu';

  // Update phase indicator label in header
  const phaseLabel = $('#td-phase-label');
  if (phaseLabel) phaseLabel.textContent = 'Giai đoạn 1/7';

  // Ensure active tab state exists
  if (!state.phase1ActiveTab) {
    state.phase1ActiveTab = 'info';
  }
  const activeTab = state.phase1ActiveTab;
  const isEditing = Boolean(state.phase1EditMode && isOrganizer);
  const draft = state.phase1Draft || createPhase1Draft(tournament);

  // Main 1-column layout
  const grid = create('div', { className: 'phase-cards-grid phase-setup-workspace-grid' });

  // ===== TOP SECTION: Tournament preparation workspace =====
  const configCard = create('section', { className: 'tournament-panel phase-card phase-config-summary phase-setup-workspace' });
  const configHead = create('div', { className: 'tournament-panel-head phase-setup-head' });
  const headCopy1 = create('div', { className: 'phase-setup-head-title' });
  headCopy1.append(icon('td-icon-clipboard-list'), create('h4', { text: 'Chuẩn bị giải đấu' }));
  configHead.appendChild(headCopy1);

  // Edit / Save / Cancel controls for Organizer
  if (isOrganizer) {
    const controls = create('div', { className: 'phase-setup-actions' });
    if (!isEditing) {
      const editBtn = actionButton('Chỉnh sửa', () => {
        state.phase1EditMode = true;
        state.phase1Draft = createPhase1Draft(tournament);
        renderTournamentLifecycleBody(container, tournament);
      }, 'btn-edit-phase1-config', 'secondary-btn phase-edit-btn');
      controls.appendChild(editBtn);
    } else {
      const cancelBtn = actionButton('Hủy', () => {
        state.phase1EditMode = false;
        state.phase1Draft = null;
        renderTournamentLifecycleBody(container, tournament);
      }, 'btn-cancel-phase1-config', 'secondary-btn phase-cancel-btn');

      const saveBtn = actionButton('Lưu thay đổi', async () => {
        const nameInput = $('#edit-t-name');
        const descInput = $('#edit-t-desc');
        const organizerInput = $('#edit-t-organizer');
        const contactInput = $('#edit-t-contact');
        const rulesInput = $('#edit-t-rules');
        const policyInput = $('#edit-t-policy');
        const draft = capturePhase1DraftFromDom(tournament);
        const newName = String(draft.name || '').trim();
        if (!newName || newName.length > 100) {
          showToast('Tên giải đấu phải từ 1 đến 100 ký tự.', 'error');
          nameInput?.focus();
          return;
        }

        const payload = {
          name: newName,
          description: String(draft.description || '').trim(),
          organizerInfo: String(draft.organizerInfo || '').trim(),
          contactInfo: String(draft.contactInfo || '').trim(),
          rulesNotes: String(draft.rulesNotes || '').trim(),
          policyNotes: String(draft.policyNotes || '').trim(),
        };

        try {
          saveBtn.disabled = true;
          saveBtn.setAttribute('aria-busy', 'true');
          const updated = await api(`/tournaments/${tournament.tournamentId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
          showToast('Đã lưu thay đổi.', 'success');
          state.phase1EditMode = false;
          state.phase1Draft = null;
          Object.assign(tournament, updated);
          const tdName = $('#td-name');
          if (tdName) tdName.textContent = tournament.name;
          renderTournamentLifecycleBody(container, tournament);
        } catch (err) {
          showToast(err.message || 'Không thể lưu thay đổi.', 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.removeAttribute('aria-busy');
        }
      }, 'btn-save-phase1-config', 'primary-btn phase-save-btn');

      controls.append(cancelBtn, saveBtn);
    }
    configHead.appendChild(controls);
  }
  configCard.appendChild(configHead);

  // Filter / Section tabs
  const tabsNav = create('div', { className: 'phase-filter-tabs phase-config-tabs', attrs: { role: 'tablist', 'aria-label': 'Nội dung giải đấu' } });
  const tabs = [
    { key: 'info', id: 'tab-config-info', label: 'Thông tin' },
    { key: 'rules', id: 'tab-config-rules', label: 'Luật chơi' },
    { key: 'policy', id: 'tab-config-policy', label: 'Quy định' },
    { key: 'format', id: 'tab-config-format', label: 'Thể thức' },
  ];
  tabs.forEach(t => {
    const tabBtn = create('button', {
      className: `phase-filter-tab${activeTab === t.key ? ' is-active' : ''}`,
      attrs: { type: 'button', role: 'tab', id: t.id, 'data-tab': t.key, 'aria-selected': String(activeTab === t.key) },
      text: t.label,
    });
    tabBtn.addEventListener('click', () => {
      if (isEditing) capturePhase1DraftFromDom(tournament);
      state.phase1ActiveTab = t.key;
      renderTournamentLifecycleBody(container, tournament);
    });
    tabsNav.appendChild(tabBtn);
  });
  configCard.appendChild(tabsNav);

  // Tab Content Container
  const tabContent = create('div', { className: 'phase-tab-pane' });

  // Tab 1: Thông tin giải đấu
  if (activeTab === 'info') {
    if (!isEditing) {
      const configList = create('dl', { className: 'phase-info-list' });
      const addInfoItem = (term, value, pill = null, isMultiLine = false) => {
        const div = create('div', { className: 'phase-info-row' });
        div.append(create('dt', { text: term }));
        const dd = create('dd', { className: isMultiLine ? 'phase-info-multiline' : '' });
        dd.append(create('span', { text: value }));
        if (pill) {
          const p = create('span', { className: 'phase-pill', text: pill });
          dd.appendChild(p);
        }
        div.appendChild(dd);
        configList.appendChild(div);
      };
      addInfoItem('Tên giải đấu', tournament.name || 'Giải đấu');
      addInfoItem('Mô tả giải đấu', tournament.description || 'Chưa cập nhật', null, true);
      addInfoItem('Đơn vị tổ chức', tournament.organizerInfo || 'Chưa cập nhật');
      addInfoItem('Thông tin liên hệ', tournament.contactInfo || 'Chưa cập nhật');
      addInfoItem('Trạng thái', tournamentStatus, tournament.status === 'draft' ? 'Chưa mở đăng ký' : null);
      tabContent.appendChild(configList);
    } else {
      const form = create('div', { className: 'phase-setup-form' });
      form.append(
        createFormGroup('Tên giải đấu', create('input', {
          className: 'dialog-input',
          attrs: { id: 'edit-t-name', type: 'text', value: draft.name, maxlength: '100', required: 'true' }
        }), 'Tên hiển thị công khai của giải đấu (tối đa 100 ký tự).'),
        createFormGroup('Mô tả giải đấu', create('textarea', {
          className: 'dialog-input phase-textarea',
          attrs: { id: 'edit-t-desc', rows: '4', maxlength: '2000', placeholder: 'Giới thiệu mục tiêu, đối tượng và nội dung giải đấu...' },
          text: draft.description
        }), 'Mô tả chi tiết và giới thiệu giải đấu (tối đa 2000 ký tự).'),
        createFormGroup('Đơn vị tổ chức', create('input', {
          className: 'dialog-input',
          attrs: { id: 'edit-t-organizer', type: 'text', value: draft.organizerInfo, maxlength: '500', placeholder: 'VD: Câu lạc bộ AI, Đại học Công Nghệ...' }
        }), 'Đơn vị tổ chức và thông tin chịu trách nhiệm giải đấu.'),
        createFormGroup('Thông tin liên hệ', create('input', {
          className: 'dialog-input',
          attrs: { id: 'edit-t-contact', type: 'text', value: draft.contactInfo, maxlength: '500', placeholder: 'VD: Email, Discord, Telegram ban tổ chức...' }
        }), 'Kênh hỗ trợ và thông báo chính thức cho tuyển thủ.')
      );
      tabContent.appendChild(form);
    }
  }

  // Tab 2: Luật chơi OTT
  else if (activeTab === 'rules') {
    const rulesWrap = create('div', { className: 'phase-rules-container' });
    const articles = [
      {
        num: 'Điều 1',
        title: 'Tổng quan trò chơi',
        content: 'Mỗi ván diễn ra trên bàn cờ 9×9. Bot Trắng đi trước (ký hiệu A), Bot Đen đi sau (ký hiệu B); hai bên lần lượt chọn nước đi.',
      },
      {
        num: 'Điều 2',
        title: 'Nước đi hợp lệ & Điều kiện chiến thắng',
        content: 'Hệ thống chỉ nhận các nước đi hợp lệ. Bot thắng khi ăn hết quân đối phương hoặc đưa quân của mình tới ô đích. OTT không dùng luật chiếu bí hoặc hết nước đi như cờ vua.',
      },
      {
        num: 'Điều 3',
        title: 'Giới hạn trận đấu & Thời gian suy nghĩ',
        content: `Mỗi ván tối đa ${maxTurns} lượt. Mỗi Bot có ${turnTimeoutMs} ms để chọn nước đi ở lượt của mình. Ván có thể được xử hòa khi đạt giới hạn lượt, lặp lại vị trí hoặc không còn đủ quân theo luật OTT.`,
      },
      {
        num: 'Điều 4',
        title: 'Cấu trúc series (BO2 & BO3)',
        content: bestOf === 2
          ? 'Mỗi cặp đấu chơi 2 ván. Ván thứ hai đổi bên. Nếu hòa 1–1, kết quả được xử lý theo luật của giai đoạn đang diễn ra.'
          : bestOf === 3
            ? 'Mỗi cặp đấu chơi tối đa 3 ván; Bot thắng 2 ván trước sẽ thắng cặp. Ván thứ hai đổi bên. Nếu cần ván thứ ba, hệ thống xác định bên đi trước theo mã cặp đấu để kết quả luôn nhất quán.'
            : tournament.format === 'multi_stage'
              ? 'Ở vòng bảng, mỗi cặp chơi 2 ván. Ở nhánh loại trực tiếp, mỗi cặp chơi tối đa 3 ván. Ván thứ hai đổi bên; nếu có ván thứ ba, bên đi trước được xác định cố định cho từng cặp.'
              : `Mỗi cặp hiện chơi ${bestOf || 1} ván.`,
      },
      {
        num: 'Điều 5',
        title: 'Tính điểm & Xếp hạng',
        content: `Thắng được ${scoringConfig.winPoints ?? 3} điểm, hòa được ${scoringConfig.drawPoints ?? 1} điểm, thua được ${scoringConfig.lossPoints ?? 0} điểm; miễn đấu được ${scoringConfig.byePoints ?? 0} điểm. Bảng xếp hạng ưu tiên tổng điểm. Nếu đúng hai Bot bằng điểm, xét kết quả đối đầu; nếu vẫn bằng nhau, dùng mã đăng ký để giữ thứ tự cố định.`,
      },
      {
        num: 'Điều 6',
        title: 'Khi Bot không thể tiếp tục ván đấu',
        content: 'Ở mỗi lượt, Bot cần trả lời đúng hạn, gửi dữ liệu hệ thống đọc được và chọn một nước đi hợp lệ.',
        details: [
          { label: 'Trả lời quá muộn', text: `Bot không gửi lựa chọn trong ${turnTimeoutMs} ms của lượt đó.` },
          { label: 'Dừng hoặc gặp lỗi khi chạy', text: 'Bot kết thúc bất thường hoặc không thể tiếp tục xử lý lượt.' },
          { label: 'Phản hồi không đọc được', text: 'Dữ liệu Bot gửi về không đúng cấu trúc mà hệ thống yêu cầu.' },
          { label: 'Chọn nước đi không hợp lệ', text: 'Nước đi không nằm trong danh sách nước đi hợp lệ của vị trí hiện tại.' },
        ],
        outcome: 'Nếu xảy ra một trong các trường hợp trên, ván đó được xử thua cho Bot gặp sự cố; đối thủ được tính thắng ván.',
      },
    ];

    const articlesList = create('div', { className: 'phase-rules-articles' });
    articles.forEach(art => {
      const artBox = create('article', { className: 'phase-rule-article' });
      const artHead = create('div', { className: 'rule-article-head' });
      artHead.append(create('span', { className: 'rule-badge', text: art.num }), create('h5', { text: art.title }));
      artBox.append(artHead, create('p', { text: art.content }));
      if (art.details) {
        const detailList = create('ul', { className: 'phase-rule-detail-list' });
        art.details.forEach(detail => {
          const item = create('li');
          item.append(create('strong', { text: `${detail.label}:` }), create('span', { text: detail.text }));
          detailList.appendChild(item);
        });
        artBox.appendChild(detailList);
      }
      if (art.outcome) artBox.appendChild(create('p', { className: 'phase-rule-outcome', text: art.outcome }));
      articlesList.appendChild(artBox);
    });
    rulesWrap.appendChild(articlesList);

    // Note on pending tiebreaker
    const tiebreakerNotice = create('div', { className: 'phase-rule-callout' });
    tiebreakerNotice.append(
      icon('td-icon-alert-circle'),
      create('p', { text: 'Nếu một cặp ở nhánh loại trực tiếp chưa xác định được người đi tiếp, cặp đó được đánh dấu là chờ phân định. Ban tổ chức cần xử lý trước khi vòng tiếp theo được mở. Hệ thống không tự mặc định một quy tắc phân định sau 3 ván.' })
    );
    rulesWrap.appendChild(tiebreakerNotice);

    // Custom organizer rules
    if (!isEditing) {
      if (tournament.rulesNotes) {
        const extraRules = create('div', { className: 'phase-extra-section' });
        extraRules.append(
          create('h5', { text: 'Điều lệ bổ sung từ Ban tổ chức' }),
          create('p', { className: 'phase-multiline-text', text: tournament.rulesNotes })
        );
        rulesWrap.appendChild(extraRules);
      }
    } else {
      const extraForm = create('div', { className: 'phase-setup-form' });
      extraForm.append(
        createFormGroup('Điều lệ bổ sung từ Ban tổ chức', create('textarea', {
          className: 'dialog-input phase-textarea',
          attrs: { id: 'edit-t-rules', rows: '3', maxlength: '2000', placeholder: 'Bổ sung các điều khoản đặc biệt hoặc hướng dẫn riêng của giải đấu...' },
          text: draft.rulesNotes
        }), 'Các quy định bổ sung không thay đổi những luật OTT mà hệ thống luôn áp dụng.')
      );
      rulesWrap.appendChild(extraForm);
    }

    tabContent.appendChild(rulesWrap);
  }

  // Tab 3: Quy định tham gia
  else if (activeTab === 'policy') {
    const policyWrap = create('div', { className: 'phase-policy-container' });
    const policyCards = [
      {
        title: 'Yêu cầu đối với Bot',
        desc: 'Bot nộp bằng mã nguồn có thể dùng C++17 hoặc Python 3. Phiên bản mã nguồn phải sẵn sàng để chạy và phản hồi theo cách hệ thống yêu cầu. Bot dùng lệnh chạy cũ được kiểm tra theo luồng riêng.',
      },
      {
        title: 'Quy trình đăng ký & Xét duyệt',
        desc: 'Khi đăng ký mở, mỗi tuyển thủ có thể gửi một Bot vào giải. Ban tổ chức duyệt hoặc từ chối từng yêu cầu; tuyển thủ theo dõi kết quả ngay tại trang giải đấu.',
      },
      {
        title: 'Cách hệ thống chạy Bot',
        desc: 'Với Bot nộp bằng mã nguồn, hệ thống chạy Bot trong môi trường được kiểm soát và lưu lại sự cố để Ban tổ chức xem lại. Khả năng sẵn sàng chạy Bot chỉ được kiểm tra khi chạy, không thể kết luận từ màn hình này.',
      },
    ];

    const cardsGrid = create('div', { className: 'phase-policy-grid' });
    policyCards.forEach(card => {
      const c = create('div', { className: 'phase-policy-card' });
      c.append(create('h5', { text: card.title }), create('p', { text: card.desc }));
      cardsGrid.appendChild(c);
    });
    policyWrap.appendChild(cardsGrid);

    // Custom organizer policy
    if (!isEditing) {
      if (tournament.policyNotes) {
        const extraPolicy = create('div', { className: 'phase-extra-section' });
        extraPolicy.append(
          create('h5', { text: 'Quy định riêng từ Ban tổ chức' }),
          create('p', { className: 'phase-multiline-text', text: tournament.policyNotes })
        );
        policyWrap.appendChild(extraPolicy);
      }
    } else {
      const extraForm = create('div', { className: 'phase-setup-form' });
      extraForm.append(
        createFormGroup('Quy định riêng từ Ban tổ chức', create('textarea', {
          className: 'dialog-input phase-textarea',
          attrs: { id: 'edit-t-policy', rows: '3', maxlength: '2000', placeholder: 'Bổ sung các yêu cầu tuyển thủ, quy định xử phạt riêng...' },
          text: draft.policyNotes
        }), 'Quy định bổ sung dành cho người chơi và tuyển thủ tham gia giải.')
      );
      policyWrap.appendChild(extraForm);
    }

    tabContent.appendChild(policyWrap);
  }

  // Tab 4: Thể thức thi đấu
  else if (activeTab === 'format') {
    const formatWrap = create('div', { className: 'phase-format-container' });
    const configList = create('dl', { className: 'phase-info-list' });
    const addFormatItem = (term, value, pill = null) => {
      const div = create('div', { className: 'phase-info-row' });
      div.append(create('dt', { text: term }));
      const dd = create('dd', {});
      dd.append(create('span', { text: value }));
      if (pill) {
        const p = create('span', { className: 'phase-pill', text: pill });
        dd.appendChild(p);
      }
      div.appendChild(dd);
      configList.appendChild(div);
    };
    addFormatItem('Hình thức thi đấu', formatLabel);
    addFormatItem('Các vòng thi', structureDesc);
    if (tournament.format === 'multi_stage') {
      const planningRule = participantCount > 200
        ? 'Với trên 200 Bot, lịch dự kiến có vòng loại theo khu vực trước khi vào vòng bảng.'
        : participantCount >= 4
          ? 'Với 4–200 Bot, lịch dự kiến vào vòng bảng. Mỗi bảng có 4–8 Bot; số bảng là lũy thừa của 2.'
          : participantCount >= 2
            ? 'Với 2–3 Bot, giải dùng nhánh loại trực tiếp; không tạo vòng bảng.'
            : 'Cần ít nhất 2 Bot để xác định cách tổ chức giải.';
      addFormatItem('Dựa trên số Bot đã chốt', planningRule);
    }
    addFormatItem('Số Bot đã có', participantCount ? `${participantCount} Bot` : 'Chưa có Bot nào');
    addFormatItem('Sắp xếp các cặp đấu', 'Hệ thống dùng danh sách Bot đã chốt để sắp xếp các cặp. Sơ đồ cụ thể xuất hiện khi tạo lịch.');
    addFormatItem('Kiểm tra trước khi chạy', 'Chỉ được thực hiện khi giải bắt đầu chạy; màn hình này không xác nhận hạ tầng đã sẵn sàng.');
    addFormatItem('Vào vòng tiếp theo', 'Chỉ mở vòng tiếp theo khi các cặp liên quan đã có kết quả và không còn cặp chờ Ban tổ chức phân định.');
    formatWrap.appendChild(configList);
    tabContent.appendChild(formatWrap);
  }

  // Tab 5: Quy định kết quả
  else if (activeTab === 'results') {
    const resultsWrap = create('div', { className: 'phase-results-container' });
    const configList = create('dl', { className: 'phase-info-list' });
    const addResultItem = (term, value) => {
      const div = create('div', { className: 'phase-info-row' });
      div.append(create('dt', { text: term }), create('dd', { text: value }));
      configList.appendChild(div);
    };
    addResultItem('Điểm khi thắng', `${scoringConfig.winPoints ?? 3} điểm`);
    addResultItem('Điểm khi hòa', `${scoringConfig.drawPoints ?? 1} điểm`);
    addResultItem('Điểm khi thua', `${scoringConfig.lossPoints ?? 0} điểm`);
    addResultItem('Điểm miễn đấu', `${scoringConfig.byePoints ?? 0} điểm`);
    addResultItem('Thứ tự xếp hạng', 'Tổng điểm → đối đầu trực tiếp (chỉ khi đúng 2 Bot bằng điểm) → mã đăng ký.');
    addResultItem('Công bố kết quả', 'Ban tổ chức công bố sau khi giải hoàn tất. Ở giai đoạn chuẩn bị, chưa ấn định thời điểm công bố.');
    resultsWrap.appendChild(configList);
    tabContent.appendChild(resultsWrap);
  }

  configCard.appendChild(tabContent);
  grid.appendChild(configCard);

  // Maintain actionLabel('open_registration') reference for lifecycle contract
  const _openActionLabel = actionLabel('open_registration');

  container.appendChild(grid);
}

function phase1Schedule(tournament) {
  return {
    visibleAt: tournament.schedule?.visibleAt ?? null,
    registrationOpensAt: tournament.schedule?.registrationOpensAt ?? tournament.registrationOpenedAt ?? null,
    registrationClosesAt: tournament.schedule?.registrationClosesAt ?? tournament.registrationClosedAt ?? null,
  };
}

function phase1DraftValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

function phase1LocalDateValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function phase1IsoDateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function phase1DisplayDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZoneName: 'short',
  }).format(date);
}

function createPhase1Draft(tournament) {
  const matchConfig = tournament.matchConfig || {};
  const scoringConfig = tournament.scoringConfig || {};
  return {
    name: tournament.name || '',
    description: tournament.description || '',
    organizerInfo: tournament.organizerInfo || '',
    contactInfo: tournament.contactInfo || '',
    rulesNotes: tournament.rulesNotes || '',
    policyNotes: tournament.policyNotes || '',
    format: tournament.format || 'multi_stage',
    schedule: phase1Schedule(tournament),
    rulesConfig: { rulesetId: tournament.rulesConfig?.rulesetId || 'ott-standard', rulesetVersion: tournament.rulesConfig?.rulesetVersion || 1, ruleModifiers: { conversion: Boolean(tournament.rulesConfig?.ruleModifiers?.conversion) } },
    matchConfig: {
      bestOf: matchConfig.bestOf ?? (tournament.configurationVersion === 2 ? 3 : 1),
      maxTurns: matchConfig.maxTurns ?? 200,
      turnTimeoutMs: matchConfig.turnTimeoutMs ?? (tournament.configurationVersion === 2 ? 5000 : 2000),
    },
    scoringConfig: {
      winPoints: scoringConfig.winPoints ?? 3,
      drawPoints: scoringConfig.drawPoints ?? 1,
      lossPoints: scoringConfig.lossPoints ?? 0,
    },
    botLimits: {
      maxSourceBytes: tournament.botLimits?.maxSourceBytes ?? 65536,
      memoryLimitMb: tournament.botLimits?.memoryLimitMb ?? 256,
      cpuLimit: tournament.botLimits?.cpuLimit ?? 1,
      maxProcesses: tournament.botLimits?.maxProcesses ?? 64,
      maxBotsPerCompetitor: tournament.botLimits?.maxBotsPerCompetitor ?? (tournament.configurationVersion === 2 ? 1 : 64),
    },
  };
}

function capturePhase1DraftFromDom(tournament) {
  const draft = state.phase1Draft || createPhase1Draft(tournament);
  const value = id => document.getElementById(id)?.value;
  const textFields = ['name', 'description', 'organizerInfo', 'contactInfo'];
  const ids = { name: 'edit-t-name', description: 'edit-t-desc', organizerInfo: 'edit-t-organizer', contactInfo: 'edit-t-contact' };
  textFields.forEach(key => { const current = value(ids[key]); if (current !== undefined) draft[key] = current; });
  const rules = value('edit-t-rules');
  const policy = value('edit-t-policy');
  if (rules !== undefined) draft.rulesNotes = rules;
  if (policy !== undefined) draft.policyNotes = policy;
  const format = value('edit-t-format');
  if (format !== undefined) draft.format = format;
  const ruleset = value('edit-t-ruleset');
  if (ruleset !== undefined) draft.rulesConfig.rulesetId = ruleset;
  const version = value('edit-t-ruleset-version');
  if (version !== undefined) draft.rulesConfig.rulesetVersion = Number(version);
  const conversion = document.getElementById('edit-t-rule-conversion');
  if (conversion) draft.rulesConfig.ruleModifiers.conversion = Boolean(conversion.checked);
  const bestOf = value('edit-t-best-of');
  if (bestOf !== undefined) draft.matchConfig.bestOf = Number(bestOf);
  ['maxTurns', 'turnTimeoutMs'].forEach(key => { const current = value(`edit-t-${key}`); if (current !== undefined) draft.matchConfig[key] = Number(current); });
  ['winPoints', 'drawPoints', 'lossPoints'].forEach(key => { const current = value(`edit-t-${key}`); if (current !== undefined) draft.scoringConfig[key] = Number(current); });
  ['maxSourceBytes', 'memoryLimitMb', 'cpuLimit', 'maxProcesses', 'maxBotsPerCompetitor'].forEach(key => { const current = value(`edit-t-${key}`); if (current !== undefined) draft.botLimits[key] = Number(current); });
  ['visibleAt', 'registrationOpensAt', 'registrationClosesAt'].forEach(key => { const current = value(`edit-t-${key}`); if (current !== undefined) draft.schedule[key] = phase1IsoDateValue(current); });
  state.phase1Draft = draft;
  return draft;
}

function phase1MaxBots(format) {
  return format === 'multi_stage' ? 4096 : 64;
}

function phase1Select(id, value, options, disabled = false) {
  const select = create('select', { className: 'dialog-input', attrs: { id, ...(disabled ? { disabled: 'true' } : {}) } });
  options.forEach(option => {
    const item = create('option', { value: option.value, text: option.label });
    if (String(option.value) === String(value)) item.selected = true;
    select.appendChild(item);
  });
  return select;
}

function phase1Number(id, value, min, max, step = 1, disabled = false) {
  return create('input', { className: 'dialog-input', value, attrs: { id, type: 'number', min, max, step, ...(disabled ? { disabled: 'true' } : {}) } });
}

function phase1Date(id, value, disabled = false) {
  return create('input', { className: 'dialog-input', value: phase1LocalDateValue(value), attrs: { id, type: 'datetime-local', ...(disabled ? { disabled: 'true' } : {}) } });
}

function phase1ValueRow(label, value, hint = '') {
  const row = create('div', { className: 'phase-settings-row' });
  row.append(create('dt', { text: label }), create('dd', { text: phase1DraftValue(value) || 'Chưa thiết lập' }));
  if (hint) row.appendChild(create('small', { className: 'phase-settings-hint', text: hint }));
  return row;
}

function phase1ReadList(items) {
  const list = create('dl', { className: 'phase-settings-list' });
  items.forEach(item => list.appendChild(phase1ValueRow(item[0], item[1], item[2])));
  return list;
}

function phase1RuntimeNote(text) {
  return create('div', { className: 'phase-runtime-note', attrs: { role: 'note' }, children: [icon('td-icon-clipboard-list'), create('span', { text })] });
}

function renderPhase1Creation(container, tournament) {
  const isOrganizer = state.user?.role === 'organizer';
  const isEditing = Boolean(state.phase1EditMode && isOrganizer);
  const draft = state.phase1Draft || createPhase1Draft(tournament);
  const settingsLocked = tournament.status !== 'draft' || Boolean(tournament.rulesetSnapshot);
  const isCurrentTournament = tournament.configurationVersion === 2;
  const canEditIntro = isOrganizer && (tournament.status === 'draft' || tournament.status === 'registration_open');
  const canEditSchedule = isOrganizer && (tournament.status === 'draft' || tournament.status === 'registration_open');
  const activeTab = ['info', 'rules', 'time', 'bots'].includes(state.phase1ActiveTab) ? state.phase1ActiveTab : 'info';
  state.phase1ActiveTab = activeTab;

  const breadcrumbRoot = $('#td-breadcrumb-root');
  if (breadcrumbRoot) breadcrumbRoot.textContent = 'Quản lý giải đấu';
  const breadcrumbName = $('#td-breadcrumb-name');
  if (breadcrumbName) breadcrumbName.textContent = 'Thiết lập giải đấu';
  const phaseLabel = $('#td-phase-label');
  if (phaseLabel) phaseLabel.textContent = 'Giai đoạn 1/7';

  const grid = create('div', { className: 'phase-cards-grid phase-setup-workspace-grid' });
  const card = create('section', { className: 'tournament-panel phase-card phase-config-summary phase-setup-workspace' });
  const head = create('div', { className: 'tournament-panel-head phase-setup-head' });
  const title = create('div', { className: 'phase-setup-head-title' });
  title.append(icon('td-icon-clipboard-list'), create('div', { children: [create('h4', { text: 'Thiết lập giải đấu' }), create('p', { className: 'phase-setup-subtitle', text: 'Cấu hình trước khi mở đăng ký. Các thay đổi được lưu qua API của giải đấu.' })] }));
  head.appendChild(title);
  if (isOrganizer) {
    const actions = create('div', { className: 'phase-setup-actions' });
    if (!isEditing && canEditIntro) {
      actions.appendChild(actionButton('Chỉnh sửa', () => { state.phase1EditMode = true; state.phase1Draft = createPhase1Draft(tournament); renderTournamentLifecycleBody(container, tournament); }, 'btn-edit-phase1-config', 'secondary-btn phase-edit-btn'));
    } else if (isEditing) {
      const cancel = actionButton('Hủy', () => { state.phase1EditMode = false; state.phase1Draft = null; renderTournamentLifecycleBody(container, tournament); }, 'btn-cancel-phase1-config', 'secondary-btn phase-cancel-btn');
      const save = actionButton('Lưu thiết lập', async () => {
        const current = capturePhase1DraftFromDom(tournament);
        if (!String(current.name || '').trim() || String(current.name).trim().length > 100) { showToast('Tên giải đấu phải từ 1 đến 100 ký tự.', 'error'); $('#edit-t-name')?.focus(); return; }
        const payload = { name: String(current.name).trim(), description: String(current.description || '').trim(), organizerInfo: String(current.organizerInfo || '').trim(), contactInfo: String(current.contactInfo || '').trim(), rulesNotes: String(current.rulesNotes || '').trim(), policyNotes: String(current.policyNotes || '').trim() };
        if (tournament.status === 'draft') Object.assign(payload, { schedule: current.schedule, rulesConfig: current.rulesConfig, matchConfig: isCurrentTournament ? { ...current.matchConfig, bestOf: undefined } : current.matchConfig, ...(isCurrentTournament ? {} : { scoringConfig: current.scoringConfig, botLimits: current.botLimits }) });
        if (tournament.status === 'registration_open') {
          const originalClose = phase1Schedule(tournament).registrationClosesAt;
          if (current.schedule.registrationClosesAt !== originalClose) payload.schedule = { registrationClosesAt: current.schedule.registrationClosesAt };
        }
        try {
          save.disabled = true;
          const updated = await api(`/tournaments/${tournament.tournamentId}`, { method: 'PATCH', body: JSON.stringify(payload) });
          Object.assign(tournament, updated);
          state.phase1EditMode = false;
          state.phase1Draft = null;
          showToast('Đã lưu thiết lập giải đấu.', 'success');
          renderTournamentLifecycleBody(container, tournament);
        } catch (error) { showToast(error?.message || 'Không thể lưu thiết lập.', 'error'); }
        finally { save.disabled = false; }
      }, 'btn-save-phase1-config', 'primary-btn phase-save-btn');
      actions.append(cancel, save);
    }
    head.appendChild(actions);
  }
  card.appendChild(head);

  const tabsNav = create('div', { className: 'phase-filter-tabs phase-config-tabs', attrs: { role: 'tablist', 'aria-label': 'Nội dung thiết lập giải đấu' } });
  [{ key: 'info', id: 'tab-config-info', label: 'Thông tin chung' }, { key: 'rules', id: 'tab-config-rules', label: 'Luật thi đấu' }, { key: 'time', id: 'tab-config-time', label: 'Thời gian' }, { key: 'bots', id: 'tab-config-bots', label: 'Giới hạn & Bot' }].forEach(tab => {
    const button = create('button', { className: `phase-filter-tab${activeTab === tab.key ? ' is-active' : ''}`, attrs: { type: 'button', role: 'tab', id: tab.id, 'aria-selected': String(activeTab === tab.key), 'aria-controls': `phase-panel-${tab.key}` }, text: tab.label });
    button.addEventListener('click', () => { if (isEditing) capturePhase1DraftFromDom(tournament); state.phase1ActiveTab = tab.key; renderTournamentLifecycleBody(container, tournament); });
    tabsNav.appendChild(button);
  });
  card.appendChild(tabsNav);
  const pane = create('div', { className: 'phase-tab-pane', attrs: { id: `phase-panel-${activeTab}`, role: 'tabpanel' } });

  if (activeTab === 'info') {
    if (!isEditing) pane.appendChild(phase1ReadList([['Tên giải đấu', tournament.name], ['Mô tả', tournament.description], ['Đơn vị tổ chức', tournament.organizerInfo], ['Liên hệ', tournament.contactInfo], ['Thể thức', tournamentFormatLabel(tournament.format)]]));
    else {
      const form = create('div', { className: 'phase-setup-form phase-settings-form' });
      const formatControl = create('input', { className: 'dialog-input', value: isCurrentTournament ? 'Nhiều giai đoạn' : tournamentFormatLabel(tournament.format), attrs: { type: 'text', readonly: 'true' } });
      form.append(createFormGroup('Tên giải đấu', create('input', { className: 'dialog-input', value: draft.name, attrs: { id: 'edit-t-name', type: 'text', maxlength: '100', required: 'true' } })), createFormGroup('Mô tả', create('textarea', { className: 'dialog-input phase-textarea', text: draft.description, attrs: { id: 'edit-t-desc', rows: '4', maxlength: '2000' } })), createFormGroup('Đơn vị tổ chức', create('input', { className: 'dialog-input', value: draft.organizerInfo, attrs: { id: 'edit-t-organizer', type: 'text', maxlength: '500' } })), createFormGroup('Liên hệ', create('input', { className: 'dialog-input', value: draft.contactInfo, attrs: { id: 'edit-t-contact', type: 'text', maxlength: '500' } })), createFormGroup('Thể thức', formatControl, isCurrentTournament ? 'Cố định: nhiều giai đoạn.' : 'Thể thức legacy được giữ nguyên và chỉ hiển thị.'));
      pane.appendChild(form);
    }
  } else if (activeTab === 'rules') {
    const rules = tournament.rulesConfig || { rulesetId: 'ott-standard', rulesetVersion: 1, ruleModifiers: { conversion: false } };
    const conversionEnabled = Boolean(draft.rulesConfig?.ruleModifiers?.conversion ?? rules.ruleModifiers?.conversion);
    if (!isEditing) pane.appendChild(phase1ReadList([['Luật gốc', 'OTT Standard (bắt buộc)'], ['Phiên bản luật', rules.rulesetVersion], ['Luật mở rộng: Conversion', conversionEnabled ? 'Đã bật' : 'Tắt'], ['Số ván mỗi cặp', isCurrentTournament ? 'Vòng bảng: BO2 · Vòng loại: BO3' : `Best of ${draft.matchConfig.bestOf}`], ['Điểm thắng', isCurrentTournament ? 3 : draft.scoringConfig.winPoints], ['Điểm hòa', isCurrentTournament ? 1 : draft.scoringConfig.drawPoints], ['Điểm thua', isCurrentTournament ? 0 : draft.scoringConfig.lossPoints], ['Điều lệ bổ sung', tournament.rulesNotes], ['Chính sách tham gia', tournament.policyNotes]]));
    else {
      const form = create('div', { className: 'phase-setup-form phase-settings-form' });
      const seriesControl = create('div', { className: 'phase-fixed-series', children: isCurrentTournament
        ? [create('span', { text: 'Vòng bảng: BO2' }), create('span', { text: 'Vòng loại: BO3' })]
        : [create('span', { text: `Legacy: BO${draft.matchConfig.bestOf || 1}` })] });
      const scoreControls = create('div', { className: 'phase-settings-grid', children: [
        createFormGroup('Điểm thắng', create('input', { className: 'dialog-input', value: isCurrentTournament ? 3 : draft.scoringConfig.winPoints, attrs: { type: 'number', readonly: 'true' } })),
        createFormGroup('Điểm hòa', create('input', { className: 'dialog-input', value: isCurrentTournament ? 1 : draft.scoringConfig.drawPoints, attrs: { type: 'number', readonly: 'true' } })),
        createFormGroup('Điểm thua', create('input', { className: 'dialog-input', value: isCurrentTournament ? 0 : draft.scoringConfig.lossPoints, attrs: { type: 'number', readonly: 'true' } })),
      ] });
      form.append(
        createFormGroup('Luật gốc', phase1Select('edit-t-ruleset', 'ott-standard', [{ value: 'ott-standard', label: 'OTT Standard' }], true), 'Luật OTT tiêu chuẩn luôn được áp dụng.'),
        createFormGroup('Phiên bản luật', phase1Select('edit-t-ruleset-version', draft.rulesConfig.rulesetVersion, [{ value: 1, label: 'Version 1' }], true)),
        createFormGroup('Số ván mỗi cặp', seriesControl, isCurrentTournament ? 'Cố định theo từng giai đoạn thi đấu.' : 'Giá trị legacy được giữ nguyên và chỉ hiển thị.'),
        create('fieldset', { className: 'phase-rule-modifiers', children: [create('legend', { text: 'Luật mở rộng' }), create('label', { className: 'phase-rule-checkbox', children: [create('input', { attrs: { id: 'edit-t-rule-conversion', type: 'checkbox', ...(conversionEnabled ? { checked: 'true' } : {}), ...(settingsLocked ? { disabled: 'true' } : {}) } }), create('span', { children: [create('strong', { text: 'Conversion' }), create('small', { text: 'Quân bị ăn đổi phe và trở về ô xuất phát của quân ăn.' })] })] })] }),
        scoreControls,
        createFormGroup('Điều lệ bổ sung', create('textarea', { className: 'dialog-input phase-textarea', text: draft.rulesNotes, attrs: { id: 'edit-t-rules', rows: '4', maxlength: '2000', ...(settingsLocked ? { disabled: 'true' } : {}) } }), 'Nội dung này chỉ bổ sung thông tin, không thay đổi luật Engine.'),
        createFormGroup('Chính sách tham gia', create('textarea', { className: 'dialog-input phase-textarea', text: draft.policyNotes, attrs: { id: 'edit-t-policy', rows: '4', maxlength: '2000', ...(settingsLocked ? { disabled: 'true' } : {}) } }))
      );
      pane.appendChild(form);
    }
    pane.appendChild(phase1RuntimeNote('OTT Standard luôn được áp dụng. Giải mới cố định vòng bảng BO2, vòng loại BO3 và tính điểm 3–1–0; Conversion chỉ được áp dụng khi bật và snapshot đã khóa.'));
  } else if (activeTab === 'time') {
    if (!isEditing) pane.appendChild(phase1ReadList([['Công khai từ', phase1DisplayDate(phase1Schedule(tournament).visibleAt)], ['Mở đăng ký', phase1DisplayDate(phase1Schedule(tournament).registrationOpensAt)], ['Đóng đăng ký', phase1DisplayDate(phase1Schedule(tournament).registrationClosesAt)]]));
    else {
      const form = create('div', { className: 'phase-setup-form phase-settings-form' });
      const closeLocked = tournament.status === 'registration_open' && !canEditSchedule;
      form.append(createFormGroup('Thời gian công khai', phase1Date('edit-t-visibleAt', draft.schedule.visibleAt, closeLocked || settingsLocked)), createFormGroup('Mở đăng ký', phase1Date('edit-t-registrationOpensAt', draft.schedule.registrationOpensAt, closeLocked || settingsLocked)), createFormGroup('Đóng đăng ký', phase1Date('edit-t-registrationClosesAt', draft.schedule.registrationClosesAt, closeLocked), tournament.status === 'registration_open' ? 'Chỉ được gia hạn sang thời điểm muộn hơn.' : 'Có thể để trống nếu chưa chốt lịch.'));
      pane.appendChild(form);
    }
    pane.appendChild(phase1RuntimeNote('Backend sẽ tự động công khai, mở và hết hạn tiếp nhận đăng ký theo lịch. Hết hạn tiếp nhận không tự duyệt hồ sơ pending và không tự lập lịch; organizer vẫn chốt danh sách bằng nghiệp vụ hiện có.'));
  } else {
    const limits = tournament.botLimits || draft.botLimits;
    if (!isEditing) pane.appendChild(phase1ReadList([['Giới hạn lượt', draft.matchConfig.maxTurns], ['Timeout mỗi lượt', `${draft.matchConfig.turnTimeoutMs} ms (source revision thực thi tối thiểu ${Math.max(draft.matchConfig.turnTimeoutMs, 5000)} ms)`], ['Số Bot tối đa theo thể thức', phase1MaxBots(tournament.format)], ['Bot tối đa mỗi competitor', limits.maxBotsPerCompetitor ?? (isCurrentTournament ? 1 : 'Không giới hạn legacy')], ['Kích thước source tối đa', `${limits.maxSourceBytes} bytes`], ['Memory', `${limits.memoryLimitMb} MB`], ['CPU', limits.cpuLimit], ['Số process', limits.maxProcesses], ['Runtime hỗ trợ', 'C++17 và Python 3']]))
    else {
      const form = create('div', { className: 'phase-setup-form phase-settings-form' });
      form.append(create('div', { className: 'phase-settings-grid', children: [createFormGroup('Giới hạn lượt', phase1Number('edit-t-maxTurns', draft.matchConfig.maxTurns, 1, 10000, 1, settingsLocked)), createFormGroup('Timeout mỗi lượt (ms)', phase1Number('edit-t-turnTimeoutMs', draft.matchConfig.turnTimeoutMs, 5000, 120000, 1, settingsLocked), 'Mặc định 5000 ms; không thể thấp hơn giới hạn thực thi của source revision.')] }), create('div', { className: 'phase-settings-grid', children: [createFormGroup('Source tối đa (bytes)', phase1Number('edit-t-maxSourceBytes', draft.botLimits.maxSourceBytes, 1, 65536, 1, true)), createFormGroup('Memory (MB)', phase1Number('edit-t-memoryLimitMb', draft.botLimits.memoryLimitMb, 64, 256, 1, true)), createFormGroup('CPU', phase1Number('edit-t-cpuLimit', draft.botLimits.cpuLimit, 0.1, 1, 0.1, true)), createFormGroup('Process tối đa', phase1Number('edit-t-maxProcesses', draft.botLimits.maxProcesses, 1, 64, 1, true)), createFormGroup('Bot tối đa mỗi competitor', phase1Number('edit-t-maxBotsPerCompetitor', draft.botLimits.maxBotsPerCompetitor, 1, 64, 1, true))] }), createFormGroup('Runtime', create('input', { className: 'dialog-input', value: 'C++17, Python 3', attrs: { id: 'edit-t-runtime', type: 'text', readonly: 'true' } }), 'Runtime được quản lý bởi Bot registration và không phải tùy chọn tự do của giải đấu.'), createFormGroup('Số trận chạy đồng thời', create('input', { className: 'dialog-input', value: '2', attrs: { id: 'edit-t-concurrency', type: 'text', readonly: 'true' } }), 'Mặc định hệ thống chạy tối đa 2 trận song song; có thể giảm về 1 bằng cấu hình máy chủ.'), create('p', { className: 'phase-settings-capacity', text: `Số Bot tối đa theo thể thức hiện tại: ${phase1MaxBots(draft.format)}.` }));
      pane.appendChild(form);
    }
    pane.appendChild(phase1RuntimeNote('Các giới hạn Bot được lưu qua API và được áp dụng khi đăng ký, preflight và thực thi trận. Không hiển thị tùy chọn ngoài contract Backend.'));
  }
  card.appendChild(pane);
  grid.appendChild(card);
  container.appendChild(grid);
  const _openActionLabel = actionLabel('open_registration');
}

function createFormGroup(label, control, helperText = null) {
  const group = create('div', { className: 'form-group phase-form-group' });
  group.appendChild(create('label', { className: 'form-label', text: label }));
  group.appendChild(control);
  if (helperText) {
    group.appendChild(create('span', { className: 'form-hint', text: helperText }));
  }
  return group;
}

function renderPhase2Registration(container, tournament) {
  const isOrganizer = state.user?.role === 'organizer';
  const isCompetitor = state.user?.role === 'competitor';
  const participants = tournament.participants || [];
  const userParticipant = participants.find(p => (state.viewerParticipantIds || []).includes(p.participantId));

  // Update breadcrumb
  const breadcrumbRoot = $('#td-breadcrumb-root');
  if (breadcrumbRoot) breadcrumbRoot.textContent = 'Quản lý giải đấu';
  const breadcrumbName = $('#td-breadcrumb-name');
  if (breadcrumbName) breadcrumbName.textContent = 'Đăng ký';

  const phaseLabel = $('#td-phase-label');
  if (phaseLabel) phaseLabel.textContent = 'Giai đoạn 2/7';

  // Competitor CTA or Registration Status
  if (isCompetitor) {
    const ctaCard = create('section', { className: 'tournament-panel phase-cta-card' });
    if (userParticipant) {
      ctaCard.classList.add('is-registered');
      const ctaContent = create('div', { className: 'phase-cta-content' });
      ctaContent.append(
        create('strong', { text: `Bot của bạn "${userParticipant.name}" đã được duyệt tham gia!` }),
        create('p', { text: 'Hãy theo dõi giải đấu để cập nhật lịch thi đấu khi ban tổ chức đóng đăng ký.' })
      );
      ctaCard.append(icon('td-icon-check'), ctaContent);
    } else {
      const ctaContent = create('div', { className: 'phase-cta-content' });
      ctaContent.append(
        create('strong', { text: 'Sẵn sàng tranh tài tại OTT Code Arena?' }),
        create('p', { text: 'Chọn một Bot có phiên bản đã biên dịch thành công từ danh sách của bạn để đăng ký vào giải.' })
      );
      ctaCard.append(
        icon('td-icon-user-round-plus'),
        ctaContent,
        actionButton('Đăng ký Bot', () => {
          const btn = $('#btn-register-bot');
          if (btn) btn.click();
        }, 'phase2-register-btn', 'primary-btn detail-register')
      );
    }
    container.appendChild(ctaCard);
    // Competitors only need the registration CTA/status. Request review,
    // counters and filter tabs are organizer-only workflow controls.
    return;
  }

  // Registration Overview: 3 Stat Cards
  const statsGrid = create('div', { className: 'phase-reg-stats-grid' });
  const statCards = [
    { id: 'reg-stat-total', label: 'Tổng yêu cầu', initial: '…' },
    { id: 'reg-stat-approved', label: 'Đã duyệt', initial: '…' },
    { id: 'reg-stat-pending', label: 'Chờ duyệt', initial: '…' },
  ];
  statCards.forEach(({ id, label, initial }) => {
    const card = create('div', { className: 'phase-reg-stat-card' });
    card.append(
      create('strong', { className: 'reg-stat-number', attrs: { id }, text: initial }),
      create('span', { className: 'reg-stat-label', text: label })
    );
    statsGrid.appendChild(card);
  });
  container.appendChild(statsGrid);

  // Dedicated Full-Width Request Management Workspace Card
  const workspaceCard = create('section', { className: 'tournament-panel phase-card phase-requests-workspace phase-requests-inbox phase-approved-roster' });
  const head = create('div', { className: 'phase-workspace-head tournament-panel-head' });
  head.append(
    create('h3', { text: 'Yêu cầu tham gia' }),
    create('span', { className: 'panel-count request-pending-count', id: 'phase2-requests-count', text: '... đang chờ' })
  );
  workspaceCard.appendChild(head);

  // Filter tabs
  const filterTabs = create('div', { className: 'phase-filter-tabs', attrs: { role: 'tablist', 'aria-label': 'Bộ lọc yêu cầu đăng ký' } });
  const activeFilter = state.detailRequestsFilter || 'pending';
  const tabsConfig = [
    { key: 'pending', id: 'tab-filter-pending', label: 'Chờ duyệt' },
    { key: 'approved', id: 'tab-filter-approved', label: 'Đã duyệt' },
    { key: 'rejected', id: 'tab-filter-rejected', label: 'Từ chối' },
  ];
  tabsConfig.forEach(t => {
    const tabBtn = create('button', {
      className: `phase-filter-tab${activeFilter === t.key ? ' is-active' : ''}`,
      attrs: { type: 'button', role: 'tab', id: t.id, 'data-filter': t.key, 'aria-selected': String(activeFilter === t.key) },
      text: `${t.label} (0)`,
    });
    filterTabs.appendChild(tabBtn);
  });
  workspaceCard.appendChild(filterTabs);

  // List container
  const listContainer = create('div', { id: 'phase2-request-list', className: 'phase-request-list', attrs: { 'aria-live': 'polite' } });
  workspaceCard.appendChild(listContainer);

  container.appendChild(workspaceCard);

  // Reference actionLabel('close_registration') for semantic registration closure
  const _closeActionLabel = actionLabel('close_registration');

  // Load & Render requests
  void renderPhase2Requests(tournament.tournamentId, listContainer, head.querySelector('.request-pending-count'), tournament, { statsRoot: statsGrid });
}

function renderPhase3RosterFinal(container, tournament) {
  const isOrganizer = state.user?.role === 'organizer';
  const participants = tournament.participants || [];

  const header = create('div', { className: 'phase-section-header' });
  header.append(
    create('span', { className: 'panel-kicker', text: 'Giai đoạn 3 / 7' }),
    create('h3', { text: 'Chốt danh sách tham gia chính thức' }),
    create('p', { className: 'dialog-copy', text: 'Cổng đăng ký đã đóng. Danh sách tuyển thủ đã được chốt và khóa. Ban tổ chức kiểm tra điều kiện để tạo lịch thi đấu.' })
  );
  container.appendChild(header);

  const pendingRequests = (tournament.participationRequests || []).filter(request => request.status === 'pending');
  if (pendingRequests.length) {
    const headerDescription = header.querySelector('.dialog-copy');
    if (headerDescription) headerDescription.textContent = 'Hạn tiếp nhận đăng ký đã kết thúc. Organizer xử lý hồ sơ đang chờ, sau đó mới chốt danh sách và tạo lịch thi đấu.';
  }
  if (isOrganizer && pendingRequests.length) {
    const requestCard = create('section', { className: 'tournament-panel phase-card phase-requests-workspace phase-requests-inbox' });
    const requestHead = create('div', { className: 'tournament-panel-head phase-workspace-head' });
    requestHead.append(create('h3', { text: 'Hồ sơ chờ xử lý trước khi chốt danh sách' }), create('span', { className: 'panel-count request-pending-count', text: `${pendingRequests.length} đang chờ` }));
    const requestList = create('div', { id: 'phase3-request-list', className: 'phase-request-list', attrs: { 'aria-live': 'polite' } });
    requestCard.append(requestHead, create('p', { className: 'phase-runtime-note', text: 'Hạn tiếp nhận đã kết thúc. Backend không nhận hồ sơ mới và không tự duyệt hoặc từ chối các hồ sơ này.' }), requestList);
    container.appendChild(requestCard);
    void renderPhase2Requests(tournament.tournamentId, requestList, requestHead.querySelector('.request-pending-count'), tournament, { statsRoot: requestCard });
  }

  const grid = create('div', { className: 'phase-cards-grid' });

  // Card 1: Roster Readiness & Next Action
  const readinessCard = create('section', { className: 'tournament-panel phase-card phase-eligibility-check' });
  const readyHead = create('div', { className: 'tournament-panel-head' });
  const headCopy1 = create('div');
  headCopy1.append(icon('td-icon-check'), create('h4', { text: 'Kiểm tra điều kiện thi đấu' }));
  readyHead.append(headCopy1, create('span', { className: 'phase-pill is-locked', text: 'Đã khóa danh sách' }));
  readinessCard.appendChild(readyHead);

  const checkList = create('ul', { className: 'phase-checklist' });
  const addCheckItem = (label, detail) => {
    const li = create('li', { className: 'phase-check-item is-ready' });
    const checkText = create('div', { className: 'phase-check-text' });
    checkText.append(create('strong', { text: label }), create('span', { text: detail }));
    li.append(icon('td-icon-check'), checkText);
    checkList.appendChild(li);
  };
  addCheckItem('Cổng đăng ký', 'Đã đóng hoàn tất — Không nhận thêm Bot mới');
  addCheckItem('Số lượng Bot tham gia', `Tổng cộng ${participants.length} Bot chính thức hợp lệ`);
  addCheckItem('Mã nguồn & Sandbox', 'Tất cả các Bot đều có revision biên dịch thành công');
  addCheckItem('Thể thức thi đấu', `Sẵn sàng tạo lịch cho thể thức ${tournamentFormatLabel(tournament.format)}`);
  readinessCard.appendChild(checkList);

  if (isOrganizer) {
    const actionBox = create('div', { className: 'phase-action-banner' });
    actionBox.appendChild(create('p', { text: pendingRequests.length
      ? 'Hãy xử lý hết hồ sơ đang chờ. Backend sẽ không tạo lịch khi còn pending.'
      : 'Danh sách tuyển thủ đã sẵn sàng. Hãy tạo lịch thi đấu để phân bảng và tạo các cặp đấu.' }));
    if (!pendingRequests.length) actionBox.appendChild(actionButton(actionLabel('generate_schedule'), () => tournamentAction(tournament.tournamentId, state.authRevision, state.viewRevision, 'generate_schedule'), 'phase3-schedule-btn', 'primary-btn'));
    readinessCard.appendChild(actionBox);
  } else {
    const notice = create('div', { className: 'phase-notice-banner' });
    notice.append(create('p', { text: 'Danh sách Bot chính thức đã được khóa. Ban tổ chức đang chuẩn bị tạo lịch thi đấu.' }));
    readinessCard.appendChild(notice);
  }
  grid.appendChild(readinessCard);

  // Card 2: Final Official Roster Table
  const tableCard = create('section', { className: 'tournament-panel phase-card phase-official-roster' });
  const tableHead = create('div', { className: 'tournament-panel-head' });
  const headCopy2 = create('div');
  headCopy2.append(icon('td-icon-users-round'), create('h4', { text: 'Danh sách thi đấu chính thức' }));
  tableHead.append(headCopy2, create('span', { className: 'panel-count', text: `${participants.length} Bot` }));
  tableCard.appendChild(tableHead);

  const tableScroll = create('div', { className: 'standings-table-scroll', attrs: { role: 'region', 'aria-label': 'Danh sách chính thức' } });
  const table = create('table', { className: 'data-table phase-roster-table' });
  const thead = create('thead');
  const htr = create('tr');
  htr.append(
    create('th', { text: 'Hạt giống' }),
    create('th', { text: 'Tên Bot' }),
    create('th', { text: 'Môi trường' }),
    create('th', { text: 'Phiên bản' }),
    create('th', { text: 'Trạng thái' })
  );
  thead.appendChild(htr);
  const tbody = create('tbody');
  participants.forEach((p, idx) => {
    const isViewer = (state.viewerParticipantIds || []).includes(p.participantId);
    const tr = create('tr', { className: isViewer ? 'is-viewer-row' : '' });
    const nameCell = create('td', { className: 'name-cell' });
    nameCell.append(create('strong', { text: p.name }));
    if (isViewer) nameCell.appendChild(create('span', { className: 'viewer-marker', text: 'Bạn' }));
    const statCell = create('td');
    statCell.appendChild(create('span', { className: 'status-badge status-ready', text: 'Sẵn sàng' }));
    tr.append(
      create('td', { className: 'seed-cell', text: `#${idx + 1}` }),
      nameCell,
      create('td', { text: p.bot?.execution?.runtimeId === 'cpp' ? 'C++17' : 'Python 3' }),
      create('td', { text: p.bot?.execution?.revisionId ? `v${p.bot.execution.revisionId.slice(0, 8)}` : 'Gốc' }),
      statCell
    );
    tbody.appendChild(tr);
  });
  table.append(thead, tbody);
  tableScroll.appendChild(table);
  tableCard.appendChild(tableScroll);
  grid.appendChild(tableCard);

  container.appendChild(grid);
}

function getPhase3RosterRows(tournament) {
  const seenBotIds = new Set();
  const uniqueParticipants = (tournament.participants || []).filter(participant => {
    const identity = participant.bot?.botId || participant.participantId;
    if (!identity || seenBotIds.has(identity)) return false;
    seenBotIds.add(identity);
    return true;
  });
  return uniqueParticipants.map((participant, index) => {
    const execution = participant.bot?.execution || {};
    const runtimeId = execution.runtimeId || '';
    const hasLegacyCommand = Boolean(participant.bot?.command);
    const runtime = runtimeId === 'cpp' ? 'C++17' : runtimeId === 'python3' ? 'Python 3' : hasLegacyCommand ? 'Legacy command' : 'Chưa xác định';
    const revisionId = execution.revisionId || '';
    return {
      participant,
      seed: index + 1,
      name: participant.name || `Bot ${index + 1}`,
      botId: participant.bot?.botId || '',
      runtime,
      runtimeId,
      revisionId,
      status: (revisionId && ['cpp', 'python3'].includes(runtimeId)) || hasLegacyCommand ? 'ready' : 'blocked',
    };
  });
}

function getPhase3Readiness(tournament, rows) {
  const minimum = 2;
  const count = rows.length;
  const missingRevision = rows.filter(row => row.status !== 'ready').length;
  const checks = [
    { label: 'Đăng ký đã đóng', detail: 'Không nhận thêm Bot mới', status: tournament.status === 'registration_closed' ? 'ready' : 'checking' },
    { label: 'Số Bot hợp lệ', detail: `${count} Bot đã được chấp nhận (tối thiểu ${minimum})`, status: count >= minimum ? 'ready' : 'blocked' },
    { label: 'Nguồn chạy & runtime', detail: missingRevision ? `${missingRevision} Bot chưa có source revision hoặc legacy command hợp lệ` : 'Tất cả Bot có source revision hoặc legacy command hợp lệ; chưa kiểm tra khả năng khởi chạy runtime', status: missingRevision ? 'blocked' : 'ready' },
    { label: 'Thể thức thi đấu', detail: tournament.format ? `Đã cấu hình ${tournamentFormatLabel(tournament.format)}; scheduler sẽ xác thực kế hoạch khi tạo lịch` : 'Đang xác minh thể thức', status: tournament.format ? 'ready' : 'checking' },
  ];
  const blocked = checks.some(check => check.status === 'blocked');
  const checking = checks.some(check => check.status === 'checking');
  return { checks, state: blocked ? 'blocked' : checking ? 'checking' : 'ready' };
}

function renderPhase3RosterFinal(container, tournament) {
  const rows = getPhase3RosterRows(tournament);
  const pageSize = 10;
  let page = 1;
  let query = '';
  let runtimeFilter = 'all';

  const roster = create('section', { className: 'tournament-panel phase-card phase-official-roster phase3-official-roster', attrs: { 'aria-labelledby': 'phase3-roster-title' } });
  const rosterHead = create('div', { className: 'phase3-roster-head' });
  rosterHead.append(create('div', { children: [create('span', { className: 'panel-kicker', text: 'Dữ liệu dùng để lập lịch' }), create('h4', { id: 'phase3-roster-title', text: 'Danh sách Bot chính thức' })] }), create('span', { className: 'panel-count', text: `${rows.length} Bot` }));
  roster.appendChild(rosterHead);
  const controls = create('div', { className: 'phase3-roster-controls' });
  const search = create('input', { className: 'phase3-roster-search', attrs: { type: 'search', placeholder: 'Tìm theo tên hoặc mã Bot…', 'aria-label': 'Tìm Bot theo tên hoặc mã' } });
  const filter = create('select', { className: 'phase3-roster-filter', attrs: { 'aria-label': 'Lọc theo runtime' } });
  [['all', 'Bộ lọc'], ['cpp', 'C++17'], ['python3', 'Python 3']].forEach(([value, label]) => filter.appendChild(create('option', { value, text: label })));
  controls.append(search, filter); roster.appendChild(controls);
  const tableScroll = create('div', { className: 'standings-table-scroll phase3-roster-table-region', attrs: { role: 'region', 'aria-label': 'Bảng danh sách Bot chính thức', tabindex: '0' } });
  const table = create('table', { className: 'data-table phase-roster-table' });
  const thead = create('thead');
  const headingRow = create('tr');
  ['Hạt giống', 'Tên Bot', 'Runtime', 'Revision', 'Trạng thái'].forEach(label => headingRow.appendChild(create('th', { text: label })));
  thead.appendChild(headingRow);
  const tbody = create('tbody');
  table.append(thead, tbody); tableScroll.appendChild(table); roster.appendChild(tableScroll);
  const pagination = create('div', { className: 'phase3-pagination', attrs: { 'aria-live': 'polite' } }); roster.appendChild(pagination); container.appendChild(roster);

  const renderRows = () => {
    const normalized = query.trim().toLowerCase();
    const filtered = rows.filter(row => (!normalized || `${row.name} ${row.botId}`.toLowerCase().includes(normalized)) && (runtimeFilter === 'all' || row.runtimeId === runtimeFilter));
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)); page = Math.min(page, totalPages);
    const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
    tbody.replaceChildren(...visible.map(row => {
      const isViewer = (state.viewerParticipantIds || []).includes(row.participant.participantId);
      const tr = create('tr', { className: isViewer ? 'is-viewer-row' : '' });
      const name = create('strong', { text: row.name }); if (isViewer) name.appendChild(create('span', { className: 'viewer-marker', text: 'Bạn' }));
      tr.append(create('td', { className: 'seed-cell', text: `#${row.seed}` }), create('td', { className: 'name-cell', children: [name, create('small', { text: row.botId ? `ID ${shortId(row.botId)}` : 'Không có mã Bot' })] }), create('td', { text: row.runtime }), create('td', { children: [create('code', { text: row.revisionId ? row.revisionId.slice(0, 8) : 'Chưa có revision' })] }));
      tr.appendChild(create('td', { children: [create('span', { className: `status-badge status-${row.status === 'ready' ? 'ready' : 'failed'}`, text: row.status === 'ready' ? 'Đã xác minh' : 'Cần xử lý' })] }));
      return tr;
    }));
    const prev = actionButton('Trước', () => { page -= 1; renderRows(); }, 'phase3-prev', 'secondary-btn tournament-pagination-button');
    const next = actionButton('Sau', () => { page += 1; renderRows(); }, 'phase3-next', 'secondary-btn tournament-pagination-button');
    prev.disabled = page <= 1; next.disabled = page >= totalPages;
    pagination.replaceChildren(prev, create('span', { text: `${filtered.length ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, filtered.length)} / ${filtered.length}` }), next);
  };
  search.addEventListener('input', () => { query = search.value; page = 1; renderRows(); });
  filter.addEventListener('change', () => { runtimeFilter = filter.value; page = 1; renderRows(); });
  renderRows();
}

function getSchedulePreviewData(tournament) {
  const participants = tournament.participants || [];
  const participantCount = participants.length;

  if (tournament.format === 'multi_stage' && Array.isArray(tournament.stages) && tournament.stages.length > 0) {
    const stages = tournament.stages;
    const groupStage = stages.find(s => s.stageType === 'group_stage');
    const prelimStage = stages.find(s => s.stageType === 'preliminary');
    const knockoutStage = stages.find(s => s.stageType === 'knockout');
    const groups = groupStage?.groups || [];
    const groupCount = groups.length;
    const preliminaryRegions = prelimStage?.regions || [];
    const regionCount = preliminaryRegions.length;
    const preliminaryRounds = prelimStage?.rounds || [];

    let totalPairings = 0;
    let scheduledPairings = 0;
    let byePairings = 0;
    let completedPairings = 0;
    let inProgressPairings = 0;
    let failedPairings = 0;

    stages.forEach(stage => {
      const stagePairings = [];
      if (stage.regions) {
        stage.regions.forEach(region => {
          (region.rounds || []).forEach(r => {
            (r.pairings || []).forEach(p => stagePairings.push(p));
          });
        });
      }
      if (stage.groups) {
        stage.groups.forEach(g => {
          (g.rounds || []).forEach(r => {
            (r.pairings || []).forEach(p => stagePairings.push(p));
          });
        });
      }
      if (stage.rounds) {
        stage.rounds.forEach(r => {
          (r.pairings || []).forEach(p => stagePairings.push(p));
        });
      }
      stagePairings.forEach(p => {
        const isBye = p.participantB === null;
        if (isBye) {
          byePairings++;
        } else {
          totalPairings++;
          if (p.status === 'completed') {
            completedPairings++;
          } else if (p.status === 'in_progress') {
            inProgressPairings++;
          } else if (p.status === 'failed') {
            failedPairings++;
          } else {
            scheduledPairings++;
          }
        }
      });
    });

    return {
      isMultiStage: true,
      participantCount,
      groupCount,
      regionCount,
      totalPairings,
      scheduledPairings,
      byePairings,
      completedPairings,
      inProgressPairings,
      failedPairings,
      groupStage,
      prelimStage,
      preliminaryRegions,
      knockoutStage,
      groups,
      stages,
    };
  } else {
    // Single-stage BO1
    const rounds = tournament.rounds || [];
    let totalPairings = 0;
    let scheduledPairings = 0;
    let byePairings = 0;
    let completedPairings = 0;
    let inProgressPairings = 0;
    let failedPairings = 0;

    rounds.forEach(r => {
      (r.pairings || []).forEach(p => {
        const isBye = p.participantB === null;
        if (isBye) {
          byePairings++;
        } else {
          totalPairings++;
          if (p.status === 'completed') {
          completedPairings++;
          } else if (p.status === 'in_progress') {
          inProgressPairings++;
          } else if (p.status === 'failed') {
          failedPairings++;
          } else {
          scheduledPairings++;
          }
        }
      });
    });

    return {
      isMultiStage: false,
      participantCount,
      groupCount: 1,
      totalPairings,
      scheduledPairings,
      byePairings,
      completedPairings,
      inProgressPairings,
      failedPairings,
      rounds,
    };
  }
}

function resolveParticipantName(tournament, participantId, slot = null) {
  if (!participantId || participantId === 'null') return 'Miễn đấu';
  if (/-winner$/i.test(participantId)) {
    if (participantId === 'Semi-1-winner' || participantId === 'Semi-2-winner') {
      return 'Chờ người thắng vòng trước';
    }
    const upstreamPairingId = slot?.sourceRef?.pairingId || participantId.replace(/-winner$/i, '');
    const upstreamMatchCode = pairingMatchCode(tournament, upstreamPairingId);
    return upstreamMatchCode ? `Thắng ${upstreamMatchCode}` : `Thắng ${upstreamPairingId}`;
  }
  if (/^(1st|2nd|3rd|4th)-Group-/i.test(participantId)) {
    const match = participantId.match(/^(\d+)(?:st|nd|rd|th)-Group-(.+)$/i);
    if (!match) return 'Chờ kết quả vòng bảng';
    const rankLabel = { 1: 'Nhất', 2: 'Nhì', 3: 'Ba', 4: 'Tư' }[Number(match[1])] || `Hạng ${match[1]}`;
    if (!tournament?.stages) {
      return `Hạng ${match[1]} Bảng ${match[2]}`;
    }
    return `${rankLabel} Bảng ${match[2]}`;
  }
  if (/^Region-(\d+)-Q(\d+)$/i.test(participantId)) {
    const match = participantId.match(/^Region-(\d+)-Q(\d+)$/i);
    return `Khu vực ${match[1]} (Hạng ${match[2]})`;
  }
  const found = (tournament.participants || []).find(p => p.participantId === participantId);
  if (found?.name) return found.name;
  if (found?.bot?.name) return found.bot.name;
  if (slot?.placeholder) return resolveParticipantName(tournament, slot.placeholder);
  if (participantId.startsWith('p-pr-') || participantId.startsWith('p-')) {
    return `Bot (${participantId.slice(0, 8)}…)`;
  }
  return participantId;
}

function getKnockoutRoundName(roundIndex, totalRounds) {
  const fromEnd = totalRounds - roundIndex;
  if (fromEnd === 0) return 'Vòng chung kết';
  if (fromEnd === 1) return 'Vòng bán kết';
  if (fromEnd === 2) return 'Vòng tứ kết';
  return `Vòng loại trực tiếp ${roundIndex}`;
}

function pairingMatchCode(tournament, pairingId) {
  const match = String(pairingId || '').match(/^KO-r(\d+)-m(\d+)$/i);
  if (!match) return null;

  const roundNumber = Number(match[1]);
  const matchNumber = Number(match[2]);
  const knockoutRounds = tournament.stages?.find(stage => stage.stageType === 'knockout')?.rounds || [];
  const totalRounds = Math.max(...knockoutRounds.map(round => Number(round.roundNumber) || 0), roundNumber);
  const roundsFromFinal = totalRounds - roundNumber;

  if (roundsFromFinal === 0) return matchNumber === 1 ? 'CK' : `CK${matchNumber}`;
  if (roundsFromFinal === 1) return `BK${matchNumber}`;
  if (roundsFromFinal === 2) return `TK${matchNumber}`;

  const fieldSize = 2 ** (roundsFromFinal + 1);
  return `V${fieldSize}-${matchNumber}`;
}

function renderPhase4ParticipantTable(container, tournament, selectedTab, preliminaryRegions, groups, knockoutStage) {
  if (selectedTab === 'knockout') return;
  const showRegions = preliminaryRegions.length > 0;
  const selected = showRegions
    ? preliminaryRegions.find(region => region.regionId === selectedTab)
    : groups.find(group => group.groupId === selectedTab);
  if (!selected) return;

  const participantIds = [...new Set(Array.isArray(selected.participantIds) ? selected.participantIds : [])];
  if (!participantIds.length) return;
  const standingsByParticipant = new Map((selected.standings || []).map(standing => [standing.participantId, standing]));
  const resultByParticipant = new Map((selected.participantResults || []).map(result => [result.participantId, result]));
  const title = showRegions ? regionalDisplayName(selected) : groupDisplayName(selected);
  const panel = create('section', { className: 'tournament-panel phase-card phase4-participant-table', attrs: { 'aria-labelledby': 'phase4-participant-table-title' } });
  const heading = create('div', { className: 'phase4-section-header' });
  heading.append(
    create('div', { children: [
      create('span', { className: 'panel-kicker', text: 'Thành phần bảng đấu' }),
      create('h4', { className: 'phase4-section-title', attrs: { id: 'phase4-participant-table-title' }, text: `Danh sách Bot · ${title}` }),
    ] }),
    create('span', { className: 'phase4-section-subtitle', text: selected.standings?.length ? 'Bảng xếp hạng hiện tại' : 'Chưa có kết quả để xếp hạng' })
  );
  panel.appendChild(heading);

  const tableScroll = create('div', { className: 'standings-table-scroll', attrs: { role: 'region', 'aria-label': `Danh sách Bot ${title}`, tabindex: '0' } });
  const table = create('table', { className: 'data-table phase4-participant-standings-table' });
  const head = create('thead');
  const headRow = create('tr');
  ['Hạng', 'Tên thi đấu', 'Điểm', 'Trạng thái'].forEach(label => headRow.appendChild(create('th', { text: label })));
  head.appendChild(headRow);
  const body = create('tbody');
  participantIds.forEach((participantId, index) => {
    const participant = (tournament.participants || []).find(item => item.participantId === participantId);
    const standing = standingsByParticipant.get(participantId) || {};
    const result = resultByParticipant.get(participantId);
    const status = standing.status || result?.status;
    const statusLabel = status === 'won' ? 'Đã thắng' : status === 'eliminated' ? 'Đã dừng' : status === 'in_progress' ? 'Đang thi đấu' : status === 'failed' ? 'Trận lỗi' : status === 'bye' ? 'Miễn đấu' : 'Chưa thi đấu';
    const name = participant?.name || resolveParticipantName(tournament, participantId);
    const row = create('tr');
    row.append(
      create('td', { text: standing.rank ? String(standing.rank) : `#${index + 1}` }),
      create('td', { className: 'phase4-participant-name-cell', children: [create('strong', { text: name }), create('small', { text: participantId })] }),
      create('td', { text: standing.points == null ? '—' : String(standing.points) }),
      create('td', { text: statusLabel })
    );
    body.appendChild(row);
  });
  table.append(head, body);
  tableScroll.appendChild(table);
  panel.appendChild(tableScroll);
  container.appendChild(panel);
}

function renderPhase4Scheduling(container, tournament) {
  const isOrganizer = state.user?.role === 'organizer';

  // 1. Breadcrumb and Header Indicators
  const breadcrumbRoot = $('#td-breadcrumb-root');
  if (breadcrumbRoot) breadcrumbRoot.textContent = 'Quản lý giải đấu';
  const breadcrumbName = $('#td-breadcrumb-name');
  if (breadcrumbName) breadcrumbName.textContent = 'Lập lịch thi đấu';
  const phaseLabel = $('#td-phase-label');
  if (phaseLabel) phaseLabel.textContent = 'Giai đoạn 4/7';

  const data = getSchedulePreviewData(tournament);
  const {
    participantCount,
    groupCount,
    regionCount,
    preliminaryRegions,
    totalPairings,
    byePairings,
    groups,
    knockoutStage,
    isMultiStage,
    rounds: singleStageRounds,
  } = data;

  const workspace = create('div', { className: 'phase4-schedule-workspace phase-layout-schedule-preview' });

  // 2. Section 1: Schedule Summary (3 Metric Cards)
  const summaryGrid = create('div', { className: 'phase4-summary-grid phase-schedule-banner' });

  const card1 = create('div', { className: 'phase4-stat-card' });
  card1.append(
    create('span', { className: 'phase4-stat-number', text: String(participantCount) }),
    create('span', { className: 'phase4-stat-label', text: 'Bot tham gia' })
  );

  const card2 = create('div', { className: 'phase4-stat-card' });
  card2.append(
    create('span', { className: 'phase4-stat-number', text: String(preliminaryRegions.length > 0 ? preliminaryRegions.length : groupCount) }),
    create('span', { className: 'phase4-stat-label', text: 'Bảng đấu' })
  );
  if (preliminaryRegions.length > 0) {
    const structureLabel = card2.querySelector('.phase4-stat-label');
    if (structureLabel) structureLabel.textContent = 'Khu vực';
  }

  const card3 = create('div', { className: 'phase4-stat-card' });
  card3.append(
    create('span', { className: 'phase4-stat-number', text: String(totalPairings) }),
    create('span', { className: 'phase4-stat-label', text: 'Cặp đấu dự kiến' })
  );
  summaryGrid.append(card1, card2, card3);
  workspace.appendChild(summaryGrid);

  // 3. Section 2: Group Overview (Phân bảng thi đấu)
  let selectedTab = state.phase4SelectedTab;
  if (!selectedTab || (preliminaryRegions.length > 0 && !preliminaryRegions.some(region => region.regionId === selectedTab))) {
    if (isMultiStage && preliminaryRegions.length > 0) {
      selectedTab = preliminaryRegions[0].regionId;
    } else if (isMultiStage && groups.length > 0) {
      selectedTab = groups[0].groupId;
    } else {
      selectedTab = 'all';
    }
    state.phase4SelectedTab = selectedTab;
  }

  if (isMultiStage && (preliminaryRegions.length > 0 || groups.length > 0 || knockoutStage?.rounds?.length)) {
    const showRegions = preliminaryRegions.length > 0;
    const groupsSection = create('section', { className: 'phase4-groups-section', attrs: { 'aria-label': 'Phân bảng thi đấu' } });
    const gHeader = create('div', { className: 'phase4-section-header' });
    gHeader.append(
      create('h4', { className: 'phase4-section-title', text: 'Phân bảng thi đấu' }),
      create('span', { className: 'phase4-section-subtitle', text: 'Chọn bảng để xem lịch' })
    );
    groupsSection.appendChild(gHeader);
    if (showRegions) {
      const title = gHeader.querySelector('.phase4-section-title');
      const subtitle = gHeader.querySelector('.phase4-section-subtitle');
      if (title) title.textContent = 'Khu vực thi đấu';
      if (subtitle) subtitle.textContent = 'Chọn khu vực để xem lịch';
      groupsSection.setAttribute('aria-label', 'Khu vực thi đấu');
    }

    const groupsGrid = create('div', { className: 'phase4-groups-grid' });
    const overviewItems = showRegions ? preliminaryRegions : groups;
    overviewItems.forEach((g, index) => {
      const gId = showRegions ? g.regionId : g.groupId;
      const gPairings = (g.rounds || []).flatMap(r => r.pairings || []).filter(p => p.participantB !== null);
      const gBotsCount = g.participantIds?.length || 0;
      const isSelected = selectedTab === gId;

      const card = create('button', {
        className: `phase4-group-card${isSelected ? ' is-selected' : ''}`,
        attrs: {
          type: 'button',
          'aria-pressed': String(isSelected),
          'data-group-id': gId,
        },
      });

      const gTitle = create('span', { className: 'phase4-group-title', text: showRegions ? `Khu vực ${String.fromCharCode(65 + index)}` : groupDisplayName(g) });
      const gBots = create('span', { className: 'phase4-group-bots', text: `${gBotsCount} Bot` });
      const gDescText = `${gPairings.length} cặp đấu`;
      const gDesc = create('span', { className: 'phase4-group-desc', text: gDescText });

      card.append(gTitle, gBots, gDesc);
      card.addEventListener('click', () => {
        state.phase4SelectedTab = gId;
        renderTournamentLifecycleBody(container, tournament);
      });
      groupsGrid.appendChild(card);
    });

    if (!showRegions && knockoutStage && knockoutStage.rounds?.length) {
      const koPairings = knockoutStage.rounds.flatMap(r => r.pairings || []).filter(p => p.participantB !== null);
      const isSelected = selectedTab === 'knockout';
      const koCard = create('button', {
        className: `phase4-group-card${isSelected ? ' is-selected' : ''}`,
        attrs: {
          type: 'button',
          'aria-pressed': String(isSelected),
          'data-group-id': 'knockout',
        },
      });
      koCard.append(
        create('span', { className: 'phase4-group-title', text: 'Vòng loại trực tiếp' }),
        create('span', { className: 'phase4-group-bots', text: `${knockoutStage.rounds.length} vòng đấu` }),
        create('span', { className: 'phase4-group-desc', text: `${koPairings.length} trận đấu (BO3)` })
      );
      koCard.addEventListener('click', () => {
        state.phase4SelectedTab = 'knockout';
        renderTournamentLifecycleBody(container, tournament);
      });
      groupsGrid.appendChild(koCard);
    }

    groupsSection.appendChild(groupsGrid);
    workspace.appendChild(groupsSection);
  }

  renderPhase4ParticipantTable(workspace, tournament, selectedTab, preliminaryRegions, groups, knockoutStage);

  // 4. Section 3: Schedule Explorer (Lịch thi đấu — Bảng / Giai đoạn được chọn)
  const explorerCard = create('section', { className: 'tournament-panel phase-card phase4-schedule-explorer phase-schedule-structure' });

  let currentTitle = 'Lịch thi đấu';
  let currentFormatBadge = 'BO2';
  let roundsToDisplay = [];

  if (isMultiStage) {
    if (selectedTab === 'knockout') {
      currentTitle = 'Lịch thi đấu — Vòng loại trực tiếp';
      currentFormatBadge = 'Vòng loại trực tiếp · BO3';
      roundsToDisplay = (knockoutStage?.rounds || []).map((r, idx) => ({
        roundNumber: r.roundNumber || idx + 1,
        title: getKnockoutRoundName(idx + 1, knockoutStage.rounds.length),
        pairings: (r.pairings || []).filter(p => p.participantB !== null),
      }));
    } else if (preliminaryRegions.length > 0 && preliminaryRegions.some(region => region.regionId === selectedTab)) {
      const activeRegion = preliminaryRegions.find(region => region.regionId === selectedTab) || preliminaryRegions[0];
      currentTitle = `Lịch thi đấu — Khu vực ${String.fromCharCode(65 + (activeRegion.regionIndex || 1) - 1)}`;
      currentFormatBadge = 'Vòng loại khu vực · BO3';
      roundsToDisplay = (activeRegion.rounds || []).map(r => ({
        roundNumber: r.roundNumber,
        title: `Vòng ${r.roundNumber}`,
        pairings: (r.pairings || []).filter(p => p.participantB !== null),
      }));
    } else {
      const activeGroup = groups.find(g => g.groupId === selectedTab) || groups[0];
      if (activeGroup) {
        currentTitle = `Lịch thi đấu — ${groupDisplayName(activeGroup)}`;
        currentFormatBadge = 'Vòng bảng · BO2';
        roundsToDisplay = (activeGroup.rounds || []).map(r => ({
          roundNumber: r.roundNumber,
          title: `Vòng ${r.roundNumber}`,
          pairings: (r.pairings || []).filter(p => p.participantB !== null),
        }));
      }
    }
  } else {
    currentTitle = 'Lịch thi đấu toàn giải';
    currentFormatBadge = 'Vòng tròn một lượt · BO1';
      roundsToDisplay = (singleStageRounds || []).map(r => ({
      roundNumber: r.roundNumber,
      title: `Vòng ${r.roundNumber}`,
        pairings: (r.pairings || []).filter(p => p.participantB !== null),
    }));
  }

  // Explorer Header
  const explorerHead = create('div', { className: 'phase4-explorer-head' });
  const titleWrap = create('div', { className: 'phase4-explorer-title-wrap' });
  titleWrap.append(
    create('h4', { className: 'phase4-explorer-title', text: currentTitle }),
    create('p', { className: 'phase4-explorer-note', text: 'Xem trước cặp đấu, không chỉnh sửa lịch nếu hệ thống không hỗ trợ' })
  );
  explorerHead.append(titleWrap, create('span', { className: 'phase4-format-badge', text: currentFormatBadge }));
  if (preliminaryRegions.length > 0 && preliminaryRegions.some(region => region.regionId === selectedTab)) {
    const note = titleWrap.querySelector('.phase4-explorer-note');
    if (note) note.textContent = 'BO3: thi đấu tối đa 3 ván; sau 2 ván, Bot có kết quả nghiêng về mình sẽ thắng (ví dụ 1–0 khi một ván thắng và một ván hòa). Chỉ thi đấu ván 3 khi tỷ số sau 2 ván vẫn hòa.';
  }
  explorerCard.appendChild(explorerHead);

  // Filter toolbar
  const toolbar = create('div', { className: 'phase4-explorer-toolbar' });
  const searchBox = create('div', { className: 'phase4-search-box' });
  const searchSvg = icon('icon-search');
  searchSvg.classList.add('phase4-search-icon');
  searchBox.appendChild(searchSvg);

  const searchInput = create('input', {
    className: 'phase4-search-input',
    attrs: {
      id: 'phase4-search-input',
      type: 'search',
      placeholder: 'Tìm Bot hoặc cặp đấu',
      'aria-label': 'Tìm kiếm Bot hoặc cặp đấu',
      value: state.phase4SearchQuery || '',
    },
  });
  searchBox.appendChild(searchInput);

  const roundSelect = create('select', {
    className: 'phase4-round-select',
    attrs: {
      id: 'phase4-round-filter',
      'aria-label': 'Lọc theo vòng thi đấu',
    },
  });
  const allOption = create('option', { text: 'Tất cả vòng', attrs: { value: 'all' } });
  roundSelect.appendChild(allOption);
  roundsToDisplay.forEach(r => {
    const opt = create('option', { text: r.title, attrs: { value: String(r.roundNumber) } });
    if (state.phase4SelectedRound === String(r.roundNumber)) opt.selected = true;
    roundSelect.appendChild(opt);
  });

  toolbar.append(searchBox, roundSelect);
  explorerCard.appendChild(toolbar);

  // List of rounds & pairings
  const listContainer = create('div', { className: 'phase4-rounds-list phase-rounds-preview' });
  explorerCard.appendChild(listContainer);
  const pagination = create('div', { className: 'phase4-pagination', attrs: { 'aria-live': 'polite' } });
  explorerCard.appendChild(pagination);
  const phase4PageSize = 10;
  let phase4Page = 1;

  const renderFilteredRounds = () => {
    clear(listContainer);
    const query = (state.phase4SearchQuery || '').trim().toLowerCase();
    const roundFilter = state.phase4SelectedRound || 'all';

    const matchingRounds = [];

    roundsToDisplay.forEach(r => {
      if (roundFilter !== 'all' && String(r.roundNumber) !== roundFilter) {
        return;
      }

      const matchingPairings = (r.pairings || []).filter(p => {
        const playerAName = resolveParticipantName(tournament, p.participantA, p.slotA);
        const playerBName = resolveParticipantName(tournament, p.participantB, p.slotB);
        if (!query) return true;
        return playerAName.toLowerCase().includes(query) || playerBName.toLowerCase().includes(query);
      });

      if (!matchingPairings.length) return;
      matchingRounds.push({ round: r, pairings: matchingPairings });
    });

    const totalVisiblePairings = matchingRounds.reduce((total, item) => total + item.pairings.length, 0);
    const totalPages = Math.max(1, Math.ceil(totalVisiblePairings / phase4PageSize));
    phase4Page = Math.min(phase4Page, totalPages);
    const pageStart = (phase4Page - 1) * phase4PageSize;
    let renderedBeforeRound = 0;

    matchingRounds.forEach(({ round: r, pairings: matchingPairings }) => {
      const visiblePairings = matchingPairings.filter((_, index) => {
        const absoluteIndex = renderedBeforeRound + index;
        return absoluteIndex >= pageStart && absoluteIndex < pageStart + phase4PageSize;
      });
      renderedBeforeRound += matchingPairings.length;
      if (!visiblePairings.length) return;

      const roundGroup = create('div', { className: 'phase4-round-group phase-round-box' });
      const rHead = create('div', { className: 'phase4-round-header' });
      rHead.append(
        create('h5', { className: 'phase4-round-title', text: r.title }),
        create('span', { className: 'phase4-round-sub', text: 'Các cặp đấu được lấy từ lịch thực tế' })
      );
      roundGroup.appendChild(rHead);

      const pairingsContainer = create('div', { className: 'phase4-round-pairings phase-round-pairings' });
      visiblePairings.forEach(p => {
        const playerAName = resolveParticipantName(tournament, p.participantA, p.slotA);
        const playerBName = resolveParticipantName(tournament, p.participantB, p.slotB);
        const matchCode = pairingMatchCode(tournament, p.pairingId);

        const pRow = create('div', { className: 'phase4-pairing-row phase-preview-pairing' });
        if (matchCode) {
          pRow.appendChild(create('span', {
            className: 'phase4-pairing-code',
            text: matchCode,
            attrs: { title: `Mã trận ${p.pairingId}`, 'aria-label': `Mã trận ${matchCode}` },
          }));
        }

        const playersWrap = create('div', { className: 'phase4-pairing-players' });
        playersWrap.append(
          create('strong', { className: 'phase4-player-name pairing-name', text: playerAName }),
          create('span', { className: 'phase4-vs pairing-vs', text: 'vs' }),
          create('strong', { className: 'phase4-player-name pairing-name', text: playerBName })
        );
        if (p.participantB === null) {
          playersWrap.appendChild(create('span', { className: 'phase4-bye-text', text: '(Miễn đấu)' }));
        }

        const statusWrap = create('div', { className: 'phase4-pairing-status' });
        if (p.participantB === null || p.status === 'bye') {
          statusWrap.appendChild(create('span', { className: 'status-badge status-bye', text: 'Miễn đấu' }));
        } else if (p.status === 'completed') {
          statusWrap.appendChild(create('span', { className: 'status-badge status-completed', text: 'Đã hoàn thành' }));
        } else if (p.status === 'in_progress') {
          statusWrap.appendChild(create('span', { className: 'status-badge status-running', text: 'Đang thi đấu' }));
        } else if (p.status === 'failed') {
          statusWrap.appendChild(create('span', { className: 'status-badge status-failed', text: 'Trận lỗi' }));
        } else {
          statusWrap.appendChild(create('span', { className: 'status-badge status-pending', text: 'Chờ thi đấu' }));
        }

        pRow.append(playersWrap, statusWrap);
        pairingsContainer.appendChild(pRow);
      });

      roundGroup.appendChild(pairingsContainer);
      listContainer.appendChild(roundGroup);
    });

    if (totalVisiblePairings === 0) {
      const empty = create('div', { className: 'phase4-empty-search' });
      empty.append(create('p', { text: query ? `Không tìm thấy cặp đấu nào phù hợp với từ khóa "${query}".` : 'Không có cặp đấu nào trong vòng này.' }));
      listContainer.appendChild(empty);
    }

    const previous = actionButton('Trước', () => { phase4Page -= 1; renderFilteredRounds(); }, `phase4-prev:${phase4Page}`, 'secondary-btn tournament-pagination-button');
    const next = actionButton('Sau', () => { phase4Page += 1; renderFilteredRounds(); }, `phase4-next:${phase4Page}`, 'secondary-btn tournament-pagination-button');
    previous.disabled = phase4Page <= 1;
    next.disabled = phase4Page >= totalPages;
    pagination.replaceChildren(previous, create('span', { text: `Trang ${phase4Page}/${totalPages} · ${totalVisiblePairings} cặp` }), next);
  };

  searchInput.addEventListener('input', (e) => {
    state.phase4SearchQuery = e.target.value;
    phase4Page = 1;
    renderFilteredRounds();
  });

  roundSelect.addEventListener('change', (e) => {
    state.phase4SelectedRound = e.target.value;
    phase4Page = 1;
    renderFilteredRounds();
  });

  renderFilteredRounds();

  // Maintain actionLabel('start') reference for lifecycle test contract
  const _startActionLabel = actionLabel('start');

  workspace.appendChild(explorerCard);
  container.appendChild(workspace);
}

function getAllTournamentPairings(tournament) {
  if (!tournament) return [];
  const pairings = [];
  if (Array.isArray(tournament.stages)) {
    tournament.stages.forEach(stage => {
      if (Array.isArray(stage.regions)) {
        stage.regions.forEach(region => {
          (region.rounds || []).forEach(round => {
            (round.pairings || []).forEach(p => pairings.push(p));
          });
        });
      }
      if (Array.isArray(stage.groups)) {
        stage.groups.forEach(group => {
          (group.rounds || []).forEach(round => {
            (round.pairings || []).forEach(p => pairings.push(p));
          });
        });
      }
      if (Array.isArray(stage.rounds)) {
        stage.rounds.forEach(round => {
          (round.pairings || []).forEach(p => pairings.push(p));
        });
      }
    });
  }
  if (Array.isArray(tournament.rounds)) {
    tournament.rounds.forEach(round => {
      (round.pairings || []).forEach(p => pairings.push(p));
    });
  }
  const seenPairingIds = new Set();
  return pairings.filter(pairing => {
    const pairingId = pairing?.pairingId;
    if (!pairingId) return true;
    if (seenPairingIds.has(pairingId)) return false;
    seenPairingIds.add(pairingId);
    return true;
  });
}

function getPhase5ExecutionSummary(tournament, progress) {
  const allPairings = getAllTournamentPairings(tournament);
  const byes = allPairings.filter(p => p.participantB === null).length;
  const playablePairings = allPairings.filter(p => p.participantB !== null);
  const pStats = progress?.progress ? multiStagePairingStats(progress.progress) : null;

  if (pStats && pStats.total > 0 && allPairings.length === 0) {
    const total = pStats.total;
    const completed = pStats.completed;
    const running = pStats.inProgress;
    const failed = pStats.failed;
    const pendingTiebreaker = pStats.pendingTiebreaker;
    const waiting = pStats.pending;
    const percent = total > 0 ? Math.floor((completed / total) * 100) : 0;
    return { total, completed, running, failed, pendingTiebreaker, waiting, percent, byes, isMultiStage: true };
  }

  let total = 0;
  let completed = 0;
  let running = 0;
  let failed = 0;
  let pendingTiebreaker = 0;
  let waiting = 0;

  playablePairings.forEach(p => {
    total++;
    if (p.status === 'completed' || p.status === 'finished') completed++;
    else if (p.status === 'in_progress' || p.status === 'running') running++;
    else if (p.status === 'failed' || p.status === 'error') failed++;
    else if (p.status === 'pending_tiebreaker') pendingTiebreaker++;
    else waiting++;
  });

  const percent = total > 0 ? Math.floor((completed / total) * 100) : 0;
  return { total, completed, running, failed, pendingTiebreaker, waiting, percent, byes, isMultiStage: Boolean(pStats) };
}

function renderPhase5Running(container, tournament, multiStageContext) {
  const isOrganizer = state.user?.role === 'organizer';
  const progressData = multiStageContext?.progress;
  const summary = getPhase5ExecutionSummary(tournament, progressData);

  // Update header breadcrumb and phase indicator
  const breadcrumbRoot = $('#td-breadcrumb-root');
  if (breadcrumbRoot) breadcrumbRoot.textContent = 'Quản lý giải đấu';
  const breadcrumbName = $('#td-breadcrumb-name');
  if (breadcrumbName) breadcrumbName.textContent = 'Thi đấu';
  const phaseLabel = $('#td-phase-label');
  if (phaseLabel) phaseLabel.textContent = 'Giai đoạn 5/7';

  // 1. Authoritative Execution Overview Card (Tiến độ thi đấu)
  const progressCard = create('section', { className: 'tournament-panel phase-card phase-live-progress phase5-execution-overview' });
  const progHead = create('div', { className: 'tournament-panel-head phase5-progress-head' });
  const pHeadCopy = create('div', { className: 'phase5-progress-title-wrap' });
  pHeadCopy.append(
    create('div', { className: 'phase5-progress-title-row', children: [icon('td-icon-play'), create('h4', { text: 'Tiến độ thi đấu' })] }),
    create('p', { className: 'phase5-progress-subtitle', text: 'Theo pairing của giai đoạn hiện tại' })
  );
  progHead.append(pHeadCopy, create('span', { className: 'phase-progress-percent', text: `${summary.percent}% hoàn thành` }));
  progressCard.appendChild(progHead);

  const track = create('div', { className: 'multi-stage-progress-track' });
  const fill = create('div', { className: 'multi-stage-progress-fill' });
  fill.style.width = `${summary.percent}%`;
  track.appendChild(fill);
  progressCard.appendChild(track);

  const statGrid = create('div', { className: 'phase-live-stats-grid phase5-stats-grid' });
  const addStatBox = (val, lbl, cls = '') => {
    const box = create('div', { className: `phase-stat-box ${cls}`.trim() });
    box.append(create('span', { className: 'phase-stat-val', text: String(val) }), create('span', { className: 'phase-stat-lbl', text: lbl }));
    statGrid.appendChild(box);
  };
  addStatBox(summary.total, 'Tổng cặp đấu');
  addStatBox(summary.completed, 'Hoàn thành', 'is-completed');
  addStatBox(summary.running, 'Đang chạy', 'is-running');
  addStatBox(summary.waiting, 'Chờ xử lý', 'is-waiting');
  if (summary.failed > 0) addStatBox(summary.failed, 'Trận lỗi', 'is-failed');
  if (summary.pendingTiebreaker > 0) addStatBox(summary.pendingTiebreaker, 'Chờ phân định', 'is-tiebreaker');
  progressCard.appendChild(statGrid);
  container.appendChild(progressCard);

  // 2. Active Match Spotlight (Trung tâm theo dõi Live)
  const allPairings = getAllTournamentPairings(tournament);
  const runningPairings = allPairings.filter(p => p.status === 'in_progress' || p.status === 'running');

  const spotlight = create('section', { className: `tournament-panel phase-card phase-active-spotlight phase5-active-spotlight${runningPairings.length ? '' : ' is-idle'}` });
  const spotHead = create('div', { className: 'phase5-spotlight-head' });
  const spotPulse = create('span', { className: `live-pulse-dot${runningPairings.length ? '' : ' is-idle'}`, attrs: { 'aria-hidden': 'true' } });
  const spotCopy = create('div', { className: 'phase-spotlight-copy' });

  if (runningPairings.length > 0) {
    spotCopy.append(
      create('span', { className: 'panel-kicker', text: 'Trực tiếp' }),
      create('strong', { text: `Có ${runningPairings.length} trận đấu đang được xử lý trong Docker Sandbox` }),
      create('p', { text: 'Các trận đấu diễn ra song song (tối đa 2 trận cùng lúc theo cấu hình hệ thống).' })
    );
    spotHead.append(spotPulse, spotCopy);
    spotlight.appendChild(spotHead);

    const activeList = create('div', { className: 'phase5-active-matches-list' });
    runningPairings.forEach((pairing, idx) => {
      const matchCard = create('div', { className: 'phase5-active-match-card' });
      const pAName = resolveParticipantName(tournament, pairing.participantA, pairing.slotA);
      const pBName = resolveParticipantName(tournament, pairing.participantB, pairing.slotB);
      const prog = pairing.seriesProgress || {};
      const isRegionalPairing = Boolean(pairing.regionId) || /^R\d+-r\d+-m\d+$/i.test(String(pairing.pairingId || ''));
      const format = isRegionalPairing ? 'BO3' : (pairing.format || (tournament.format === 'multi_stage' ? 'BO2' : 'BO1'));
      const bestOf = isRegionalPairing ? 3 : (prog.bestOf || (format === 'BO2' ? 2 : 1));
      const gameInfo = prog.nextGame ? `Ván ${prog.nextGame}/${bestOf}` : format;

      const cardMain = create('div', { className: 'phase5-active-card-main' });
      const cardTitle = create('div', { className: 'phase5-active-card-title' });
      cardTitle.append(
        create('span', { className: 'phase5-active-badge', text: `Trận ${pairing.pairingId || idx + 1}` }),
        create('span', { className: 'phase5-active-format', text: `${format} · ${gameInfo}` })
      );
      const cardPlayers = create('div', { className: 'phase5-active-card-players' });
      cardPlayers.append(
        create('strong', { className: 'phase5-player-name', text: pAName }),
        create('span', { className: 'phase5-vs', text: 'vs' }),
        create('strong', { className: 'phase5-player-name', text: pBName })
      );
      cardMain.append(cardTitle, cardPlayers);

      const cardActions = create('div', { className: 'phase5-active-card-actions' });
      if (pairing.matchId) {
        cardActions.appendChild(
          actionButton('Xem trực tiếp', () => openLiveMatch(tournament.tournamentId, pairing.matchId, pairing.pairingId), `phase5-live-btn-${pairing.pairingId}`, 'primary-btn phase5-live-btn')
        );
      }
      matchCard.append(cardMain, cardActions);
      activeList.appendChild(matchCard);
    });
    spotlight.appendChild(activeList);
  } else {
    spotCopy.append(
      create('span', { className: 'panel-kicker', text: 'Trực tiếp' }),
      create('strong', { text: 'Chưa có trận đang thi đấu' }),
      create('p', { text: 'Scheduler sẵn sàng điều phối lượt trận tiếp theo.' })
    );
    spotHead.append(spotPulse, spotCopy);
    spotlight.appendChild(spotHead);
  }
  container.appendChild(spotlight);

  // 3. Mount Stage Workspace
  if (multiStageContext) {
    let workspace = $('#multi-stage-workspace');
    if (!workspace) {
      workspace = create('div', { className: 'multi-stage-workspace', attrs: { id: 'multi-stage-workspace' } });
    }
    workspace.hidden = false;
    container.appendChild(workspace);
    renderMultiStageWorkspace({ preserveFocus: true });
  } else {
    // Single round robin schedule and standings
    const rrContainer = create('div', { className: 'phase-round-robin-workspace' });
    if (isCompetitorResultsHidden(tournament)) {
      rrContainer.appendChild(unpublishedResultsNotice());
    } else {
      const execution = getTournamentExecutionSummary(tournament);
      renderStandings(tournament.standings, execution, state.viewerParticipantIds);
      const legacyStandings = document.querySelector('#tournament-detail .standings-panel');
      if (legacyStandings) {
        legacyStandings.hidden = false;
        rrContainer.appendChild(legacyStandings);
      }
      const legacySchedule = document.querySelector('#tournament-detail .tournament-schedule');
      if (legacySchedule) {
        legacySchedule.hidden = false;
        renderSchedule(tournament, state.viewerParticipantIds);
        rrContainer.appendChild(legacySchedule);
      }
    }
    container.appendChild(rrContainer);
  }
}

function getPhase6KnockoutFinal(tournament, multiStageContext) {
  const stages = tournament?.stages
    || multiStageContext?.progress?.stages
    || multiStageContext?.compact?.stages
    || (typeof state !== 'undefined' ? state.multiStage?.stages : null)
    || [];
  const knockoutStage = stages.find(s => s.stageType === 'knockout');
  if (!knockoutStage) return null;

  let finalPairing = null;
  if (Array.isArray(knockoutStage.rounds) && knockoutStage.rounds.length > 0) {
    const finalRound = knockoutStage.rounds[knockoutStage.rounds.length - 1];
    finalPairing = finalRound?.pairings?.[0] || null;
  }
  if (!finalPairing && typeof state !== 'undefined') {
    const allKnockoutPairings = getKnockoutPairings(knockoutStage.stageId);
    if (allKnockoutPairings.length > 0) {
      const maxRound = Math.max(...allKnockoutPairings.map(p => Number(p.roundNumber) || 0));
      const finalRoundPairings = allKnockoutPairings.filter(p => (Number(p.roundNumber) || 0) === maxRound);
      finalPairing = finalRoundPairings[0] || null;
    }
  }

  if (!finalPairing) return null;

  const progress = knockoutSeriesProgress(finalPairing);
  const nameA = knockoutParticipantName(finalPairing, 'A', tournament);
  const nameB = knockoutParticipantName(finalPairing, 'B', tournament);
  const seedA = knockoutParticipantSeed(finalPairing, 'A');
  const seedB = knockoutParticipantSeed(finalPairing, 'B');
  const winnerSide = finalPairing.matchResult?.winner; // 'A' | 'B' | null

  let championName = null;
  let championId = null;
  let runnerUpName = null;
  let runnerUpId = null;

  if (winnerSide === 'A') {
    championId = finalPairing.participantA;
    championName = nameA;
    runnerUpId = finalPairing.participantB;
    runnerUpName = nameB;
  } else if (winnerSide === 'B') {
    championId = finalPairing.participantB;
    championName = nameB;
    runnerUpId = finalPairing.participantA;
    runnerUpName = nameA;
  }

  const isConfirmed = (winnerSide === 'A' || winnerSide === 'B') && (finalPairing.status === 'completed' || finalPairing.status === 'finished');

  return {
    stage: knockoutStage,
    pairing: finalPairing,
    seriesProgress: progress,
    formatLabel: seriesFormatLabel(progress),
    scoreLabel: seriesScoreLabel(progress),
    winnerSide,
    isConfirmed,
    championId,
    championName,
    runnerUpId,
    runnerUpName,
    playerA: { id: finalPairing.participantA, name: nameA, seed: seedA, wins: progress?.winsA ?? (winnerSide === 'A' ? 1 : 0) },
    playerB: { id: finalPairing.participantB, name: nameB, seed: seedB, wins: progress?.winsB ?? (winnerSide === 'B' ? 1 : 0) },
  };
}

function getPhase6Readiness(tournament, multiStageContext, knockoutFinal) {
  const allPairings = getAllTournamentPairings(tournament);
  const playable = allPairings.filter(p => p.participantB !== null);
  const pStats = multiStageContext?.progress?.progress ? multiStagePairingStats(multiStageContext.progress.progress) : null;

  const totalMatches = pStats ? pStats.total : playable.length;
  const completedMatches = pStats ? pStats.completed : playable.filter(p => p.status === 'completed' || p.status === 'finished').length;
  const failedMatches = pStats ? pStats.failed : playable.filter(p => p.status === 'failed' || p.status === 'error').length;
  const pendingTiebreakers = pStats ? pStats.pendingTiebreaker : playable.filter(p => p.status === 'pending_tiebreaker').length;

  const isMultiStage = Boolean(
    tournament.format === 'multi_stage' ||
    (Array.isArray(tournament.stages) && tournament.stages.length > 0) ||
    multiStageContext
  );

  const allPairingsCompleted = totalMatches > 0 ? (completedMatches >= totalMatches) : (tournament.status === 'completed');
  const noErrorsOrTiebreakers = failedMatches === 0 && pendingTiebreakers === 0;

  let finalAndChampionConfirmed = false;
  if (isMultiStage) {
    finalAndChampionConfirmed = Boolean(knockoutFinal && knockoutFinal.isConfirmed);
  } else {
    finalAndChampionConfirmed = (tournament.standings || []).length > 0 && allPairingsCompleted;
  }

  const isReadyToPublish = allPairingsCompleted && noErrorsOrTiebreakers && finalAndChampionConfirmed;

  return {
    totalMatches,
    completedMatches,
    failedMatches,
    pendingTiebreakers,
    allPairingsCompleted,
    noErrorsOrTiebreakers,
    finalAndChampionConfirmed,
    isReadyToPublish,
    isMultiStage,
  };
}

function phase6Stages(tournament, multiStageContext) {
  return tournament?.stages
    || multiStageContext?.compact?.stages
    || multiStageContext?.progress?.stages
    || state.multiStage?.stages
    || [];
}

function phase6StageTitle(stage) {
  if (stage?.stageType === 'preliminary') return 'Vòng loại khu vực';
  if (stage?.stageType === 'group_stage') return 'Vòng bảng';
  if (stage?.stageType === 'knockout') return 'Vòng loại trực tiếp';
  return stage?.name || 'Giai đoạn thi đấu';
}

function phase6PairingsForStage(stage) {
  if (stage?.regions) return stage.regions.flatMap(region => (region.rounds || []).flatMap(round => round.pairings || []));
  if (stage?.groups) return stage.groups.flatMap(group => (group.rounds || []).flatMap(round => round.pairings || []));
  return (stage?.rounds || []).flatMap(round => round.pairings || []);
}

function phase6PairingIsCompleted(pairing) {
  return pairing?.status === 'completed' || pairing?.status === 'finished';
}

function phase6PairingNames(tournament, pairing) {
  const isKnockoutPairing = String(pairing?.pairingId || '').startsWith('KO-') || pairing?.slotA?.sourceRef || pairing?.slotB?.sourceRef;
  return {
    A: pairing?.participantNames?.A || (isKnockoutPairing ? knockoutParticipantName(pairing, 'A', tournament) : resolveParticipantName(tournament, pairing?.participantA, pairing?.slotA)),
    B: pairing?.participantNames?.B || (isKnockoutPairing ? knockoutParticipantName(pairing, 'B', tournament) : resolveParticipantName(tournament, pairing?.participantB, pairing?.slotB)),
  };
}

function isCompetitorResultsHidden(tournament) {
  return false;
}

function isCompetitorResultsUnpublished(tournament) {
  return false;
}

function unpublishedResultsNotice() {
  return create('div', {
    className: 'phase6-results-empty',
    attrs: { role: 'status', 'aria-live': 'polite' },
    children: [
      create('strong', { text: 'Kết quả chưa được công bố' }),
      create('span', { text: 'Organizer chưa công bố kết quả. Tỉ số và Replay sẽ hiển thị sau khi được công bố.' }),
    ],
  });
}

function phase6PairingResult(tournament, pairing) {
  if (isCompetitorResultsHidden(tournament)) return 'Kết quả chưa được công bố.';
  const names = phase6PairingNames(tournament, pairing);
  const winner = pairing?.matchResult?.winner;
  const progress = knockoutSeriesProgress(pairing);
  if (winner === 'A') return `${names.A} thắng${progress ? ` · ${seriesScoreLabel(progress)}` : ''}`;
  if (winner === 'B') return `${names.B} thắng${progress ? ` · ${seriesScoreLabel(progress)}` : ''}`;
  if (winner === 'draw') return 'Hòa';
  if (pairing?.status === 'pending_tiebreaker') return 'Chờ phân định';
  if (pairing?.status === 'failed' || pairing?.status === 'error') return 'Trận lỗi';
  if (pairing?.status === 'in_progress' || pairing?.status === 'running') return 'Đang thi đấu';
  return 'Chưa có kết quả';
}

function renderPhase6ReplayAction(tournament, pairing, progress) {
  if (isCompetitorResultsHidden(tournament)) {
    return create('span', {
      className: 'phase6-replay-unavailable',
      text: 'Replay sẽ hiển thị sau khi công bố kết quả',
    });
  }
  if (!phase6PairingIsCompleted(pairing) || !pairing?.matchId) {
    return create('span', { className: 'phase6-replay-unavailable', text: 'Chưa có Replay' });
  }
  if (pairing.replayAvailable === false || pairing.matchResult?.replayAvailable === false) {
    return create('span', { className: 'phase6-replay-unavailable', text: 'Replay chưa được lưu' });
  }
  const replayProgress = progress || knockoutSeriesProgress(pairing) || {
    bestOf: 1, winsA: 0, winsB: 0, games: [], format: 'BO1',
  };
  return actionButton(
    'Xem Replay',
    () => playReplay(tournament.tournamentId, pairing.matchId, pairingReplaySeriesContext(pairing, replayProgress, tournament)),
    `phase6-results-replay:${pairing.matchId}`,
    'secondary-btn phase6-replay-btn'
  );
}

function renderPhase6MatchResultRow(tournament, pairing, index) {
  const names = phase6PairingNames(tournament, pairing);
  const code = pairing?.pairingId || `M${index + 1}`;
  const row = create('div', { className: 'phase6-result-match-row' });
  const identity = create('div', { className: 'phase6-result-match-identity' });
  identity.append(
    create('span', { className: 'phase6-result-match-code', text: code }),
    create('strong', { text: `${names.A} vs ${names.B}` })
  );
  const result = create('span', { className: `phase6-result-match-status is-${safeStatusClass(pairing?.status)}`, text: phase6PairingResult(tournament, pairing) });
  const actions = create('div', { className: 'phase6-result-match-actions' });
  actions.appendChild(renderPhase6ReplayAction(tournament, pairing, knockoutSeriesProgress(pairing)));
  row.append(identity, result, actions);
  return row;
}

function renderPhase6StandingsTable(tournament, standings, label) {
  const table = create('table', { className: 'data-table phase6-stage-standings-table' });
  const thead = create('thead');
  const header = create('tr');
  ['Hạng', 'Bot', 'Trận', 'Thắng', 'Hòa', 'Thua', 'Điểm'].forEach(text => header.appendChild(create('th', { text })));
  thead.appendChild(header);
  const tbody = create('tbody');
  if (!standings?.length) {
    const row = create('tr');
    row.appendChild(create('td', { attrs: { colspan: '7' }, className: 'text-center text-muted', text: `Chưa có bảng xếp hạng ${label}.` }));
    tbody.appendChild(row);
  } else {
    standings.forEach((standing, index) => {
      const name = standing.participantName || standing.name || resolveParticipantName(tournament, standing.participantId);
      const row = create('tr');
      row.append(
        create('td', { text: String(standing.rank || index + 1) }),
        create('td', { className: 'name-cell', children: [create('strong', { text: name })] }),
        create('td', { text: String(standing.matchesPlayed ?? 0) }),
        create('td', { text: String(standing.wins ?? 0) }),
        create('td', { text: String(standing.draws ?? 0) }),
        create('td', { text: String(standing.losses ?? 0) }),
        create('td', { className: 'points-cell', text: String(standing.points ?? 0) })
      );
      tbody.appendChild(row);
    });
  }
  table.append(thead, tbody);
  return table;
}

function renderPhase6TabbedResults(items, idPrefix, labelFor, renderItem) {
  const wrapper = create('div', { className: 'phase6-tabbed-results' });
  const tabList = create('div', { className: 'phase6-results-tabs', attrs: { role: 'tablist', 'aria-label': 'Chọn phạm vi kết quả' } });
  const panels = create('div', { className: 'phase6-results-tab-panels' });
  const entries = items || [];

  entries.forEach((item, index) => {
    const tabId = `${idPrefix}-tab-${index}`;
    const panelId = `${idPrefix}-panel-${index}`;
    const tab = create('button', {
      className: `phase6-results-tab${index === 0 ? ' is-active' : ''}`,
      attrs: { type: 'button', role: 'tab', id: tabId, 'aria-controls': panelId, 'aria-selected': index === 0 ? 'true' : 'false' },
    });
    const pairings = item?.rounds?.flatMap(round => round.pairings || []) || [];
    const playable = pairings.filter(pairing => pairing.participantB != null);
    const completed = playable.filter(phase6PairingIsCompleted).length;
    const itemStatus = item?.status ? multiStageStatusLabel(item.status) : 'Đã lưu kết quả';
    const itemName = create('span', { className: 'phase6-results-tab-top' });
    itemName.append(create('strong', { text: labelFor(item, index) }), create('span', { className: 'phase6-results-tab-status', text: itemStatus }));
    const itemDetails = create('span', { className: 'phase6-results-tab-details' });
    itemDetails.append(
      create('span', { text: `${item?.participantCount ?? item?.participantIds?.length ?? 0} Bot` }),
      create('span', { text: `${completed}/${playable.length} trận` })
    );
    const track = create('span', { className: 'phase6-results-tab-track', attrs: { 'aria-hidden': 'true' } });
    const fill = create('span');
    fill.style.width = `${playable.length ? (completed / playable.length) * 100 : 0}%`;
    track.appendChild(fill);
    tab.append(itemName, itemDetails, track, create('span', { className: 'phase6-results-tab-action', text: 'Xem kết quả →' }));
    const panel = create('div', {
      className: 'phase6-results-tab-panel',
      attrs: { role: 'tabpanel', id: panelId, 'aria-labelledby': tabId, hidden: index !== 0 },
    });
    panel.appendChild(renderItem(item, index));
    tab.addEventListener('click', () => {
      tabList.querySelectorAll('[role="tab"]').forEach(node => {
        const active = node === tab;
        node.classList.toggle('is-active', active);
        node.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panels.querySelectorAll('[role="tabpanel"]').forEach(node => { node.hidden = node === panel ? false : true; });
    });
    tabList.appendChild(tab);
    panels.appendChild(panel);
  });

  if (!entries.length) {
    panels.appendChild(create('div', { className: 'phase6-results-empty', text: 'Chưa có mục kết quả để hiển thị.' }));
  }
  wrapper.append(tabList, panels);
  return wrapper;
}

function renderPhase6RegionResult(tournament, region) {
  const card = create('div', { className: 'phase6-substage-card' });
  const pairings = (region.rounds || []).flatMap(round => round.pairings || []);
  const qualifiers = (region.advancingParticipantIds || []).map(id => resolveParticipantName(tournament, id));
  card.append(
    create('h6', { text: regionalDisplayName(region) }),
    create('span', { className: 'phase6-substage-meta', text: `${pairings.filter(phase6PairingIsCompleted).length}/${pairings.filter(pairing => pairing.participantB != null).length} trận xong · ${multiStageStatusLabel(region.status)}` })
  );
  const qualifierBox = create('div', { className: 'phase6-qualifier-list' });
  qualifierBox.append(create('strong', { text: `Bot đi tiếp (${qualifiers.length}/${region.qualifierCount ?? qualifiers.length})` }), create('span', { text: qualifiers.length ? qualifiers.join(', ') : 'Chưa xác định' }));
  card.appendChild(qualifierBox);
  const qualifierTitle = qualifierBox.querySelector('strong');
  const qualifierLimit = Number(region.qualifierLimit ?? region.qualifierCount) || qualifiers.length;
  if (qualifierTitle && qualifiers.length < qualifierLimit) {
    qualifierTitle.textContent = `Bot đi tiếp (${qualifiers.length}/tối đa ${qualifierLimit})`;
  }
  const matchList = create('div', { className: 'phase6-result-match-list' });
  pairings.filter(pairing => pairing.participantB != null).forEach((pairing, index) => matchList.appendChild(renderPhase6MatchResultRow(tournament, pairing, index)));
  card.appendChild(matchList);
  return card;
}

function renderPhase6GroupResult(tournament, group) {
  const pairings = (group.rounds || []).flatMap(round => round.pairings || []);
  const detail = create('div', { className: 'phase6-group-result-detail' });
  const displayPairings = pairings.map(pairing => {
    const names = phase6PairingNames(tournament, pairing);
    return {
      ...pairing,
      participantNames: {
        A: names.A,
        B: names.B,
      },
    };
  });
  const response = { pairings: displayPairings, pagination: { totalItems: displayPairings.filter(pairing => pairing.participantB != null).length } };
  if (!isCompetitorResultsUnpublished(state.currentTournament)) {
    renderGroupStandings(detail, group, displayPairings);
  } else {
    detail.appendChild(unpublishedResultsNotice());
  }
  renderGroupPairings(detail, response, group);
  return detail;
}

function renderPhase6KnockoutMatchCard(tournament, pairing) {
  const names = phase6PairingNames(tournament, pairing);
  const progress = knockoutSeriesProgress(pairing);
  const winner = pairing?.matchResult?.winner;
  const card = create('article', { className: 'phase6-knockout-match-card' });
  const head = create('div', { className: 'phase6-knockout-match-head' });
  head.append(
    create('strong', { className: 'knockout-match-code', text: knockoutMatchCode(pairing.pairingId) || pairing.pairingId }),
    create('span', { className: `stage-status stage-status-${safeStatusClass(pairing.status)}`, text: multiStageStatusLabel(pairing.status) })
  );
  const players = create('div', { className: 'phase6-knockout-players' });
  [['A', names.A], ['B', names.B]].forEach(([side, name]) => {
    const player = create('div', { className: `phase6-knockout-player${winner === side ? ' is-winner' : ''}` });
    player.append(create('strong', { text: name }), create('span', { text: String(knockoutParticipantScore(pairing, side, progress)) }));
    players.appendChild(player);
  });
  const footer = create('div', { className: 'phase6-knockout-match-footer' });
  footer.append(create('span', { text: phase6PairingResult(tournament, pairing) }), renderPhase6ReplayAction(tournament, pairing, progress));
  card.append(head, players, footer);
  return card;
}

function renderPhase6KnockoutBranchMatch(tournament, pairing, onSelect, sourceStage = null) {
  const winner = pairing?.matchResult?.winner;
  const progress = knockoutSeriesProgress(pairing);
  const matchCode = knockoutMatchCode(pairing.pairingId, sourceStage) || pairing.pairingId;
  const isSelected = state.phase6SelectedKnockoutPairingId === pairing.pairingId;
  const pair = create('div', {
    className: `knockout-match-node knockout-match-pair knockout-match-${safeStatusClass(pairing.status)}${isSelected ? ' is-selected-pair' : ''}`,
    attrs: { role: 'button', tabindex: '0', 'aria-label': `Trận ${matchCode || ''}`.trim(), 'aria-pressed': String(isSelected), 'data-pairing-id': String(pairing.pairingId || '') },
  });
  pair.dataset.pairingId = String(pairing.pairingId || '');
  pair.dataset.parentPairings = [pairing.participantA, pairing.participantB]
    .map(value => String(value || '').match(/winner\(([^)]+)\)|^(.+)-winner$/i))
    .map(match => match?.[1] || match?.[2])
    .filter(Boolean)
    .join('|');
  pair.appendChild(create('span', { className: 'knockout-match-code', text: matchCode }));

  [['A', 'knockout-player-a'], ['B', 'knockout-player-b']].forEach(([side, className]) => {
    const player = create('article', { className: `knockout-player ${className}${winner === side ? ' is-winner' : ''}` });
    player.append(
      create('div', { className: 'knockout-player-identity', children: [create('strong', { className: 'knockout-player-name', text: knockoutParticipantName(pairing, side, tournament) })] }),
      create('strong', { className: 'knockout-player-score', text: String(knockoutParticipantScore(pairing, side, progress)) })
    );
    pair.appendChild(player);
  });
  const select = () => onSelect?.(pairing);
  pair.addEventListener('click', event => {
    if (!event.target.closest('button, a')) select();
  });
  pair.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select();
    }
  });
  return pair;
}

function renderPhase6KnockoutResults(tournament, stage) {
  const pairings = phase6PairingsForStage(stage).filter(pairing => pairing.participantB != null);
  const byRound = new Map();
  pairings.forEach(pairing => {
    const round = Number(pairing.roundNumber) || 0;
    if (!byRound.has(round)) byRound.set(round, []);
    byRound.get(round).push(pairing);
  });
  const rounds = [...byRound.entries()].sort(([a], [b]) => a - b);
  const wrapper = create('div', { className: 'phase6-knockout-results phase6-knockout-branch' });
  if (!rounds.length) {
    wrapper.appendChild(create('div', { className: 'multi-stage-empty', text: 'Chưa có dữ liệu vòng loại trực tiếp.' }));
    return wrapper;
  }
  const maxRound = rounds.at(-1)[0];
  const bracket = create('div', { className: 'knockout-bracket phase6-knockout-bracket', attrs: { role: 'region', 'aria-label': 'Sơ đồ nhánh vòng loại trực tiếp' } });
  const detailSlot = create('div', { className: 'knockout-detail-slot phase6-knockout-detail-slot' });
  const renderSelectedDetails = pairing => {
    state.phase6SelectedKnockoutPairingId = pairing.pairingId;
    bracket.querySelectorAll('.knockout-match-node').forEach(node => {
      const selected = node.dataset.pairingId === pairing.pairingId;
      node.classList.toggle('is-selected-pair', selected);
      node.setAttribute('aria-pressed', String(selected));
    });
    clear(detailSlot);
    renderKnockoutMatchDetails(detailSlot, pairing, tournament);
  };
  bracket.style.setProperty('--knockout-bracket-height', `${Math.max(220, Math.max(...rounds.map(([, items]) => items.length), 1) * 170)}px`);
  const connectors = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  connectors.classList.add('knockout-connectors');
  connectors.setAttribute('aria-hidden', 'true');
  connectors.setAttribute('focusable', 'false');
  bracket.appendChild(connectors);
  rounds.forEach(([round, roundPairings]) => {
    const roundColumn = create('section', { className: 'knockout-round phase6-knockout-round', attrs: { 'aria-label': knockoutRoundTitle(round, roundPairings, maxRound), 'data-round': String(round) } });
    roundColumn.appendChild(create('h4', { text: knockoutRoundTitle(round, roundPairings, maxRound) }));
    const list = create('div', { className: 'knockout-match-list phase6-knockout-match-list' });
    roundPairings.sort((a, b) => String(a.pairingId).localeCompare(String(b.pairingId), undefined, { numeric: true })).forEach(pairing => list.appendChild(renderPhase6KnockoutBranchMatch(tournament, pairing, renderSelectedDetails, stage)));
    roundColumn.appendChild(list);
    bracket.appendChild(roundColumn);
  });
  wrapper.appendChild(bracket);
  const detailSection = create('section', { className: 'tournament-panel knockout-detail-card phase6-knockout-detail-card', attrs: { 'aria-labelledby': 'phase6-knockout-detail-title' } });
  const detailHeading = create('div', { className: 'multi-stage-section-heading knockout-detail-heading' });
  detailHeading.append(
    create('div', { className: 'multi-stage-heading-copy', children: [create('p', { className: 'panel-kicker', text: 'Chi tiết trận' }), create('h3', { id: 'phase6-knockout-detail-title', text: 'Thông tin trận đấu' }), create('p', { className: 'multi-stage-supporting-copy', text: 'Chọn một trận trên nhánh để xem từng ván và Replay.' })] })
  );
  detailSection.appendChild(detailHeading);
  detailSection.appendChild(detailSlot);
  const selectedPairing = pairings.find(pairing => pairing.pairingId === state.phase6SelectedKnockoutPairingId);
  if (selectedPairing) renderKnockoutMatchDetails(detailSlot, selectedPairing, tournament);
  else renderKnockoutMatchDetails(detailSlot, null, tournament);
  wrapper.appendChild(detailSection);
  observeKnockoutConnectors(bracket);
  return wrapper;
}

function renderPhase6ResultsByStage(container, tournament, multiStageContext) {
  const stages = phase6Stages(tournament, multiStageContext);
  const section = create('section', { className: 'tournament-panel phase-card phase6-results-board', attrs: { 'aria-labelledby': 'phase6-results-board-title' } });
  const head = create('div', { className: 'phase5-stage-nav-header phase6-results-board-head' });
  head.append(create('h4', { className: 'phase5-stage-nav-title', id: 'phase6-results-board-title', text: 'Kết quả theo giai đoạn' }));
  section.appendChild(head);

  if (!stages.length) {
    section.appendChild(create('div', { className: 'phase6-results-empty', text: 'Chưa có dữ liệu các giai đoạn để hiển thị.' }));
    container.appendChild(section);
    return;
  }

  const stageTabs = create('div', { className: 'phase6-stage-tabs', attrs: { role: 'tablist', 'aria-label': 'Chọn giai đoạn kết quả' } });
  const stageList = create('div', { className: 'phase6-stage-results-list' });
  stages.forEach((stage, stageIndex) => {
    const stageCard = create('article', { className: 'phase6-stage-result-card' });
    const stageTabId = `phase6-stage-tab-${stageIndex}`;
    const stagePanelId = `phase6-stage-panel-${stageIndex}`;
    const stageTab = create('button', {
      className: `multi-stage-tab phase6-stage-tab${stageIndex === 0 ? ' is-active' : ''}`,
      attrs: { type: 'button', role: 'tab', id: stageTabId, 'aria-controls': stagePanelId, 'aria-selected': stageIndex === 0 ? 'true' : 'false' },
    });
    stageTab.append(
      create('span', { className: 'multi-stage-tab-index', text: String(stageIndex + 1) }),
      create('span', { className: 'multi-stage-tab-copy', children: [create('strong', { text: phase6StageTitle(stage) }), create('small', { text: multiStageStatusLabel(stage.status) })] })
    );
    stageCard.id = stagePanelId;
    stageCard.setAttribute('role', 'tabpanel');
    stageCard.setAttribute('aria-labelledby', stageTabId);
    stageCard.hidden = stageIndex !== 0;
    stageTab.addEventListener('click', () => {
      stageTabs.querySelectorAll('[role="tab"]').forEach(node => {
        const active = node === stageTab;
        node.classList.toggle('is-active', active);
        node.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      stageList.querySelectorAll('[role="tabpanel"]').forEach(node => { node.hidden = node === stageCard ? false : true; });
    });
    stageTabs.appendChild(stageTab);
    const stageHead = create('div', { className: 'phase6-stage-result-head' });
    stageHead.append(
      create('div', { children: [create('h5', { text: phase6StageTitle(stage) }), create('span', { className: 'phase6-stage-status', text: multiStageStatusLabel(stage.status) })] }),
      create('span', { className: 'phase6-stage-count', text: `${phase6PairingsForStage(stage).filter(phase6PairingIsCompleted).length}/${phase6PairingsForStage(stage).filter(pairing => pairing.participantB != null).length} trận xong` })
    );
    stageCard.appendChild(stageHead);

    if (stage.regions?.length) {
      stageCard.appendChild(renderPhase6TabbedResults(
        stage.regions,
        `phase6-regions-${stageIndex}`,
        region => regionalDisplayName(region),
        region => renderPhase6RegionResult(tournament, region)
      ));
    }

    if (stage.groups?.length) {
      stageCard.appendChild(renderPhase6TabbedResults(
        stage.groups,
        `phase6-groups-${stageIndex}`,
        (group, index) => group.name || `Bảng ${String.fromCharCode(65 + index)}`,
        group => renderPhase6GroupResult(tournament, group)
      ));
    }

    if (stage.stageType === 'knockout') {
      stageCard.appendChild(renderPhase6KnockoutResults(tournament, stage));
    }
    stageList.appendChild(stageCard);
  });
  section.append(stageTabs, stageList);
  container.appendChild(section);
}

function renderPhase6Results(container, tournament) {
  const multiStageContext = arguments[2] || state.multiStage || null;

  if (isCompetitorResultsHidden(tournament)) {
    container.appendChild(create('section', {
      className: 'tournament-panel phase-card phase6-results-empty',
      attrs: { role: 'status', 'aria-live': 'polite' },
      children: [
        create('h4', { text: 'Kết quả chưa được công bố' }),
        create('p', { text: 'Organizer chưa công bố kết quả. Tỉ số và Replay sẽ hiển thị sau khi được công bố.' }),
      ],
    }));
    return;
  }

  const knockoutFinal = getPhase6KnockoutFinal(tournament, multiStageContext);
  // 1. Final Match Summary (Chung kết) - shown when knockout final exists
  if (knockoutFinal) {
    const finalMatchCard = create('section', { className: 'tournament-panel phase-card phase6-final-match-card', attrs: { 'aria-labelledby': 'phase6-final-match-title' } });
    const fmHead = create('div', { className: 'tournament-panel-head phase6-final-head' });
    const fmHeadCopy = create('div', { className: 'phase6-final-title-wrap' });
    fmHeadCopy.append(
      create('div', { className: 'phase6-final-title-row', children: [icon('td-icon-swords'), create('h4', { id: 'phase6-final-match-title', text: `Kết quả chung kết · ${knockoutFinal.formatLabel}` })] }),
      create('p', { className: 'phase6-final-subtitle', text: 'Trận đấu quyết định ngôi vô địch giải đấu' })
    );
    const fmStatus = create('span', {
      className: `stage-status stage-status-${safeStatusClass(knockoutFinal.pairing.status)}`,
      text: knockoutFinal.isConfirmed ? 'Đã hoàn tất' : multiStageStatusLabel(knockoutFinal.pairing.status),
    });
    fmHead.append(fmHeadCopy, fmStatus);
    finalMatchCard.appendChild(fmHead);

    // Finalists Match Grid
    const matchGrid = create('div', { className: 'phase6-final-match-grid' });

    // Finalist A
    const isWinnerA = knockoutFinal.winnerSide === 'A';
    const playerACard = create('div', { className: `phase6-finalist-card is-side-a ${isWinnerA ? 'is-winner' : ''}` });
    playerACard.append(
      create('span', { className: 'phase6-finalist-seed', text: knockoutFinal.playerA.seed || 'Nhánh A' }),
      create('strong', { className: 'phase6-finalist-name', text: knockoutFinal.playerA.name }),
      create('span', { className: 'phase6-finalist-wins', text: `${knockoutFinal.playerA.wins} ván thắng` })
    );
    if (isWinnerA) {
      playerACard.appendChild(create('span', { className: 'phase6-winner-badge', text: 'VÔ ĐỊCH' }));
    }

    // VS / Score Box
    const vsBox = create('div', { className: 'phase6-final-vs-box' });
    vsBox.append(
      create('div', { className: 'phase6-final-score-display', text: `${knockoutFinal.playerA.wins} - ${knockoutFinal.playerB.wins}` }),
      create('span', { className: 'phase6-final-format-tag', text: knockoutFinal.formatLabel })
    );

    // Finalist B
    const isWinnerB = knockoutFinal.winnerSide === 'B';
    const playerBCard = create('div', { className: `phase6-finalist-card is-side-b ${isWinnerB ? 'is-winner' : ''}` });
    playerBCard.append(
      create('span', { className: 'phase6-finalist-seed', text: knockoutFinal.playerB.seed || 'Nhánh B' }),
      create('strong', { className: 'phase6-finalist-name', text: knockoutFinal.playerB.name }),
      create('span', { className: 'phase6-finalist-wins', text: `${knockoutFinal.playerB.wins} ván thắng` })
    );
    if (isWinnerB) {
      playerBCard.appendChild(create('span', { className: 'phase6-winner-badge', text: 'VÔ ĐỊCH' }));
    }

    matchGrid.append(playerACard, vsBox, playerBCard);
    finalMatchCard.appendChild(matchGrid);

    // Games breakdown
    const gamesWrap = create('div', { className: 'phase6-games-list', attrs: { 'aria-label': 'Diễn biến từng ván của trận chung kết' } });
    if (knockoutFinal.seriesProgress && Array.isArray(knockoutFinal.seriesProgress.games) && knockoutFinal.seriesProgress.games.length > 0) {
      knockoutFinal.seriesProgress.games.forEach((game, idx) => {
        const gameRow = create('div', { className: 'phase6-game-row' });
        const gNum = game.gameNumber || (idx + 1);
        const gWinnerSide = knockoutGameWinnerSide(knockoutFinal.pairing, game); // 'A', 'B', 'draw'
        const gWinnerName = gWinnerSide === 'A' ? knockoutFinal.playerA.name : gWinnerSide === 'B' ? knockoutFinal.playerB.name : (gWinnerSide === 'draw' ? 'Hòa' : 'Chưa phân định');

        const gTitle = create('div', { className: 'phase6-game-title' });
        gTitle.append(
          create('strong', { text: `Ván ${gNum}` }),
          create('span', { className: 'phase6-game-winner-label', text: gWinnerSide === 'draw' ? 'Kết quả: Hòa' : `Thắng: ${gWinnerName}` })
        );

        const gMeta = create('span', {
          className: 'phase6-game-meta',
          text: game.turnCount ? `${game.turnCount} lượt đi` : '',
        });

        const gActions = create('div', { className: 'phase6-game-actions' });
        if (game.matchId) {
          gActions.appendChild(actionButton('Xem Replay', () => playReplay(tournament.tournamentId, game.matchId, pairingReplaySeriesContext(knockoutFinal.pairing, knockoutFinal.seriesProgress, tournament)), `p6-game-replay:${game.matchId}`, 'secondary-btn phase6-replay-btn'));
        }

        gameRow.append(gTitle, gMeta, gActions);
        gamesWrap.appendChild(gameRow);
      });
    } else if (knockoutFinal.pairing.matchId && knockoutFinal.pairing.status === 'completed') {
      const gameRow = create('div', { className: 'phase6-game-row' });
      gameRow.append(
        create('strong', { text: 'Toàn trận' }),
        create('span', { className: 'phase6-game-winner-label', text: `Thắng: ${knockoutFinal.winnerSide === 'A' ? knockoutFinal.playerA.name : knockoutFinal.playerB.name}` }),
        actionButton('Xem Replay', () => playReplay(tournament.tournamentId, knockoutFinal.pairing.matchId), `p6-final-replay:${knockoutFinal.pairing.matchId}`, 'secondary-btn phase6-replay-btn')
      );
      gamesWrap.appendChild(gameRow);
    } else {
      gamesWrap.appendChild(create('p', { className: 'detail-empty', text: 'Chưa có dữ liệu ván đấu. Trận chung kết chưa diễn ra hoặc đang chờ xử lý.' }));
    }
    finalMatchCard.appendChild(gamesWrap);
    container.appendChild(finalMatchCard);
  }

  // 4. Results by region, group and knockout stage.
  renderPhase6ResultsByStage(container, tournament, multiStageContext);

}

function renderPhase7History(container, tournament, multiStageContext) {
  const formatExecutionDuration = pairings => {
    const uniquePairings = [...new Map(pairings.filter(pairing => pairing?.pairingId).map(pairing => [pairing.pairingId, pairing])).values()];
    const totalMs = uniquePairings.reduce((total, pairing) => {
      const games = pairing.matchResult?.series?.games || pairing.seriesProgress?.games;
      if (Array.isArray(games) && games.length) {
        return total + games.reduce((sum, game) => sum + (Number(game?.durationMs) || 0), 0);
      }
      return total + (Number(pairing.matchResult?.durationMs) || 0);
    }, 0);
    if (!totalMs) return 'Chưa xác định';
    const totalSeconds = Math.round(totalMs / 1000);
    if (totalSeconds < 60) return `${totalSeconds} giây`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) return seconds ? `${minutes} phút ${seconds} giây` : `${minutes} phút`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours} giờ ${remainingMinutes} phút` : `${hours} giờ`;
  };
  const standings = tournament.standings || [];
  const rankOf = (standing, index) => Number(standing?.rank) || index + 1;
  const top1 = standings.find((standing, index) => rankOf(standing, index) === 1) || standings[0] || null;
  const top2 = standings.find((standing, index) => rankOf(standing, index) === 2) || standings[1] || null;
  const tiedThird = standings.filter((standing, index) => rankOf(standing, index) === 3);

  const contextualStages = multiStageContext?.stages
    || multiStageContext?.progress?.stages
    || multiStageContext?.progress?.progress?.stages
    || state.multiStage?.stages
    || tournament.stages
    || [];
  const contextualTournament = contextualStages.length ? { ...tournament, stages: contextualStages } : tournament;
  const knockoutStage = (contextualTournament.stages || []).find(stage => stage.stageType === 'knockout');
  const knockoutRounds = knockoutStage?.rounds || [];
  const cachedKnockoutPairings = [...(state.multiStage?.pairingPages?.values?.() || [])]
    .flatMap(response => response?.pairings || [])
    .filter(pairing => String(pairing?.pairingId || '').startsWith('KO-'));
  const knockoutPairings = [...new Map([
    ...phase6PairingsForStage(knockoutStage),
    ...cachedKnockoutPairings,
  ].filter(pairing => pairing?.pairingId).map(pairing => [pairing.pairingId, pairing])).values()];
  const knockoutRoundNumber = pairing => Number(pairing?.roundNumber)
    || Number(String(pairing?.pairingId || '').match(/^KO-r(\d+)-/i)?.[1])
    || 0;
  const maxKnockoutRound = Math.max(...knockoutPairings.map(knockoutRoundNumber), 0);
  const semifinalPairings = knockoutPairings.filter(pairing => knockoutRoundNumber(pairing) === maxKnockoutRound - 1);
  const semifinalLosers = semifinalPairings.flatMap(pairing => {
    const winnerSide = pairing.matchResult?.winner
      || pairing.matchResult?.series?.winner
      || pairing.seriesProgress?.winner;
    if (winnerSide !== 'A' && winnerSide !== 'B') return [];
    const loserSide = winnerSide === 'A' ? 'B' : 'A';
    const participantId = pairing[`participant${loserSide}`];
    const standing = standings.find(item => item.participantId === participantId);
    return [{ ...(standing || {}), participantId, participantName: knockoutParticipantName(pairing, loserSide, contextualTournament) }];
  });
  const top3 = semifinalLosers.length === 2 ? semifinalLosers : (tiedThird.length ? tiedThird : standings[2] ? [standings[2]] : []);
  const allPairings = getAllTournamentPairings(contextualTournament);
  const executionPairings = [...allPairings, ...knockoutPairings];
  const playablePairings = allPairings.filter(pairing => pairing.participantB !== null && pairing.status !== 'bye');
  const completedStatuses = new Set(['completed', 'finished', 'completed_match']);
  const playedGames = playablePairings.reduce((total, pairing) => {
    const games = pairing.seriesProgress?.games;
    return total + (Array.isArray(games) && games.length ? games.length : completedStatuses.has(pairing.status) ? 1 : 0);
  }, 0);
  const phase7Stats = [
    ['Bot tham gia', tournament.participants?.length || multiStageContext?.progress?.progress?.totalParticipants || 0],
    ['Cặp đấu thực tế', playablePairings.length],
    ['Trận hoàn thành', playablePairings.filter(pairing => completedStatuses.has(pairing.status)).length],
    ['Ván đã đấu', playedGames],
    ['Tổng thời gian chạy các trận', formatExecutionDuration(executionPairings)],
  ];

  const overviewCard = create('section', { className: 'tournament-panel phase-card phase7-overview-card', attrs: { 'aria-labelledby': 'phase7-overview-title' } });
  const overviewHead = create('div', { className: 'tournament-panel-head' });
  overviewHead.append(
    create('div', { children: [icon('td-icon-calendar-clock'), create('h4', { id: 'phase7-overview-title', text: 'Tổng quan giải đấu' })] }),
    create('span', { className: 'phase7-overview-status', text: multiStageStatusLabel(tournament.status) })
  );
  const overviewGrid = create('div', { className: 'phase7-overview-grid' });
  phase7Stats.forEach(([label, value]) => {
    const stat = create('div', { className: 'phase7-overview-stat' });
    stat.append(create('strong', { text: String(value) }), create('span', { text: label }));
    overviewGrid.appendChild(stat);
  });
  overviewCard.append(overviewHead, overviewGrid);
  container.appendChild(overviewCard);

  // Official Podium Spotlight
  const podiumCard = create('section', { className: 'tournament-panel phase-card phase-official-podium' });
  const podHead = create('div', { className: 'tournament-panel-head' });
  const pHeadCopy = create('div');
  pHeadCopy.append(icon('td-icon-trophy'), create('h4', { text: 'Bục vinh danh kết quả chung cuộc' }));
  podHead.appendChild(pHeadCopy);
  podiumCard.appendChild(podHead);

  const podiumList = create('div', { className: 'phase-podium-grid' });
  if (top1) {
    const p1 = create('div', { className: 'phase-podium-step step-gold' });
    p1.append(
      icon('td-icon-trophy'),
      create('span', { className: 'podium-rank', text: 'Hạng 1 \u00b7 Vô địch' }),
      create('strong', { className: 'podium-name', text: top1.participantName }),
    );
    podiumList.appendChild(p1);
  }
  if (top2) {
    const p2 = create('div', { className: 'phase-podium-step step-silver' });
    p2.append(
      icon('td-icon-trophy'),
      create('span', { className: 'podium-rank', text: 'Hạng 2 \u00b7 Á quân' }),
      create('strong', { className: 'podium-name', text: top2.participantName }),
    );
    podiumList.appendChild(p2);
  }
  if (top3.length) {
    const p3 = create('div', { className: 'phase-podium-step step-bronze' });
    p3.append(
      icon('td-icon-trophy'),
      create('span', { className: 'podium-rank', text: 'Đồng hạng 3' }),
    );
    const tiedNames = create('div', { className: 'phase-podium-tied-names' });
    top3.forEach(standing => tiedNames.appendChild(create('strong', { className: 'podium-name', text: standing.participantName || 'Chưa xác định' })));
    p3.append(tiedNames);
    podiumList.appendChild(p3);
  }
  podiumCard.appendChild(podiumList);
  container.appendChild(podiumCard);

  // If multi-stage: Show final Knockout bracket & detail sibling cards
  if (multiStageContext) {
    let workspace = $('#multi-stage-workspace');
    if (!workspace) {
      workspace = create('div', { className: 'multi-stage-workspace', attrs: { id: 'multi-stage-workspace' } });
    }
    workspace.hidden = false;
    container.appendChild(workspace);
    renderMultiStageWorkspace({ preserveFocus: true, hideProgressSummary: true });
  } else {
    // Single round robin final standings
    const legacyStandings = document.querySelector('#tournament-detail .standings-panel');
    if (legacyStandings) {
      legacyStandings.hidden = false;
      renderStandings(tournament.standings, null, state.viewerParticipantIds);
      container.appendChild(legacyStandings);
    }
  }

}

async function renderPhase2Requests(tournamentId, container, countBadge, tournament = null, renderContext = {}) {
  const activePolling = state.phase2PreflightPolling;
  if (activePolling && (activePolling.tournamentId !== tournamentId || activePolling.container !== container)) stopPhase2PreflightPolling();
  const isOrganizer = state.user?.role === 'organizer';
  const isCompetitor = state.user?.role === 'competitor';
  const participants = tournament?.participants || state.tournaments.find(t => t.tournamentId === tournamentId)?.participants || [];

  if (!state.detailRequestsFilter) {
    state.detailRequestsFilter = 'pending';
  }

  const statsRoot = renderContext.statsRoot || container.closest('#tournament-detail') || document;
  const detailRoot = container.closest('#tournament-detail') || document;
  const tabPending = detailRoot.querySelector('#tab-filter-pending');
  const tabApproved = detailRoot.querySelector('#tab-filter-approved');
  const tabRejected = detailRoot.querySelector('#tab-filter-rejected');

  const renderSequence = ++registrationRequestRenderSequence;
  const cachedTournament = state.tournaments.find(item => item.tournamentId === tournamentId);
  const detailRequests = normalizeRegistrationRequestCollection(
    tournament?.participationRequests
      ?? tournament?.data?.participationRequests
      ?? tournament?.data?.requests
      ?? cachedTournament?.participationRequests
  );
  if (detailRequests.length) {
    const seedStats = getRegistrationRequestStats(detailRequests);
    updateRegistrationStats(statsRoot, detailRequests);
    if (countBadge) countBadge.textContent = `${seedStats.pending} đang chờ`;
    if (tabPending) tabPending.textContent = `Chờ duyệt (${seedStats.pending})`;
    if (tabApproved) tabApproved.textContent = `Đã duyệt (${seedStats.approved})`;
    if (tabRejected) tabRejected.textContent = `Từ chối (${seedStats.rejected})`;
  }
  if (!detailRequests.length) updateRegistrationStats(statsRoot, [], 'loading');
  let requests = [];
  try {
    if (isOrganizer) {
      const payload = await request(`/tournaments/${tournamentId}/requests`);
      requests = normalizeRegistrationRequestCollection(payload);
    } else if (isCompetitor) {
      const payload = await request(`/tournaments/${tournamentId}/participation-requests/mine`).catch(() => []);
      requests = normalizeRegistrationRequestCollection(payload);
    }
  } catch (err) {
    if (detailRequests.length) requests = detailRequests;
    else {
      updateRegistrationStats(statsRoot, [], 'error');
      if (container.isConnected) {
        clear(container);
        container.appendChild(create('p', { className: 'detail-error', text: 'Không thể tải yêu cầu đăng ký. Vui lòng thử lại.' }));
      }
      return;
    }
  }

  if (renderSequence !== registrationRequestRenderSequence
    || !container.isConnected) return;

  let pendingList = [];
  let approvedList = [];
  let rejectedList = [];

  if (isOrganizer) {
    pendingList = requests.filter(r => normalizeRegistrationRequestStatus(r) === 'pending');
    approvedList = requests.filter(r => normalizeRegistrationRequestStatus(r) === 'approved');
    rejectedList = requests.filter(r => normalizeRegistrationRequestStatus(r) === 'rejected');
  } else {
    approvedList = participants.map(p => ({
      requestId: p.participantId,
      botName: p.name,
      status: 'approved',
      username: p.username || 'Tuyển thủ',
      execution: p.bot?.execution || null,
      runtime: p.bot?.execution?.runtimeId || p.bot?.runtime,
      revisionId: p.bot?.execution?.revisionId || '',
    }));
    pendingList = requests.filter(r => normalizeRegistrationRequestStatus(r) === 'pending');
    rejectedList = requests.filter(r => normalizeRegistrationRequestStatus(r) === 'rejected');
  }

  const registrationRequests = isOrganizer ? requests : [...pendingList, ...approvedList, ...rejectedList];
  const requestStats = getRegistrationRequestStats(registrationRequests);
  const totalCount = requestStats.total;
  const approvedCount = requestStats.approved;
  const pendingCount = requestStats.pending;
  const rejectedCount = requestStats.rejected;

  updateRegistrationStats(statsRoot, registrationRequests);

  if (countBadge) {
    countBadge.textContent = `${pendingCount} đang chờ`;
  }

  if (tabPending) {
    tabPending.textContent = `Chờ duyệt (${pendingCount})`;
  }
  if (tabApproved) {
    tabApproved.textContent = `Đã duyệt (${approvedCount})`;
  }
  if (tabRejected) {
    tabRejected.textContent = `Từ chối (${rejectedCount})`;
  }

  const pageSize = 10;
  const selectedRequestIds = new Set();
  let page = 1;
  let selectionItems = pendingList;
  let bulkSelectAll = null;
  let bulkSelectionCount = null;
  let bulkApproveAllButton = null;
  let bulkRejectAllButton = null;
  let bulkUndoAllButton = null;
  let bulkProcessing = false;
  const BULK_OPERATION_DELAY_MS = 150;

  const waitBetweenBulkOperations = async (index, total) => {
    if (index >= total - 1) return;
    await new Promise(resolve => window.setTimeout(resolve, BULK_OPERATION_DELAY_MS));
  };

  const setBulkProcessing = processing => {
    bulkProcessing = processing;
    container.querySelectorAll('button, input').forEach(control => { control.disabled = processing; });
    updateBulkSelection();
  };

  const updateBulkSelection = () => {
    const selectedCount = [...selectedRequestIds].filter(requestId => selectionItems.some(req => req.requestId === requestId)).length;
    if (bulkSelectionCount) bulkSelectionCount.textContent = `${selectedCount} đã chọn`;
    if (bulkApproveAllButton) {
      bulkApproveAllButton.textContent = selectedCount ? 'Duyệt đã chọn' : 'Duyệt tất cả';
      bulkApproveAllButton.disabled = bulkProcessing || pendingList.length === 0;
    }
    if (bulkRejectAllButton) {
      bulkRejectAllButton.textContent = selectedCount ? 'Từ chối đã chọn' : 'Từ chối tất cả';
      bulkRejectAllButton.disabled = bulkProcessing || pendingList.length === 0;
    }
    if (bulkUndoAllButton) {
      bulkUndoAllButton.textContent = selectedCount ? 'Hoàn tác đã chọn' : 'Hoàn tác tất cả';
      bulkUndoAllButton.disabled = bulkProcessing || selectionItems.length === 0;
    }
    if (bulkSelectAll) {
      const selectableIds = selectionItems.map(req => req.requestId);
      const selectedItemsCount = selectableIds.filter(requestId => selectedRequestIds.has(requestId)).length;
      bulkSelectAll.checked = selectableIds.length > 0 && selectedItemsCount === selectableIds.length;
      bulkSelectAll.indeterminate = selectedItemsCount > 0 && selectedItemsCount < selectableIds.length;
      bulkSelectAll.disabled = bulkProcessing || selectableIds.length === 0;
    }
  };

  const runBulkReview = async (decision, all = false) => {
    const requestIds = (all ? pendingList : pendingList.filter(req => selectedRequestIds.has(req.requestId))).map(req => req.requestId);
    if (!requestIds.length) return;
    setBulkProcessing(true);
    let successCount = 0;
    let failureCount = 0;
    try {
      for (const [index, requestId] of requestIds.entries()) {
        try {
          await api(`/tournaments/${tournamentId}/requests/${requestId}/${decision}`, { method: 'POST' });
          successCount += 1;
        } catch (error) {
          failureCount += 1;
        }
        await waitBetweenBulkOperations(index, requestIds.length);
      }
      if (failureCount) {
        showToast(`Đã xử lý ${successCount}/${requestIds.length} yêu cầu; ${failureCount} yêu cầu lỗi.`, 'error');
      } else {
        showToast(`Đã ${decision === 'approve' ? 'duyệt' : 'từ chối'} ${successCount} yêu cầu.`, decision === 'approve' ? 'success' : 'info');
      }
      await refreshTournamentDetail({ force: true });
    } catch (error) {
      showToast(error?.message || 'Không thể hoàn tất thao tác hàng loạt.', 'error');
    } finally {
      setBulkProcessing(false);
    }
  };

  const runBulkUndo = async (all = false) => {
    const requestIds = (all ? selectionItems : selectionItems.filter(req => selectedRequestIds.has(req.requestId))).map(req => req.requestId);
    if (!requestIds.length) return;
    setBulkProcessing(true);
    let successCount = 0;
    let failureCount = 0;
    try {
      for (const [index, requestId] of requestIds.entries()) {
        try {
          await api(`/tournaments/${tournamentId}/requests/${requestId}/undo`, { method: 'POST' });
          successCount += 1;
        } catch (error) {
          failureCount += 1;
        }
        await waitBetweenBulkOperations(index, requestIds.length);
      }
      showToast(
        failureCount ? `Đã hoàn tác ${successCount}/${requestIds.length}; ${failureCount} yêu cầu lỗi.` : `Đã hoàn tác ${successCount} yêu cầu.`,
        failureCount ? 'error' : 'success'
      );
      await refreshTournamentDetail({ force: true });
    } catch (error) {
      showToast(error?.message || 'Không thể hoàn tất thao tác hoàn tác.', 'error');
    } finally {
      setBulkProcessing(false);
    }
  };

  const renderList = (filter, requestedPage = 1) => {
    state.detailRequestsFilter = filter;
    const filteredItems = filter === 'pending' ? pendingList : filter === 'approved' ? approvedList : rejectedList;
    selectionItems = filteredItems;
    const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
    page = Math.min(Math.max(1, requestedPage), pageCount);

    [tabPending, tabApproved, tabRejected].forEach(tab => {
      if (!tab) return;
      const isActive = tab.dataset.filter === filter;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    clear(container);

    if (isOrganizer && ['pending', 'approved', 'rejected'].includes(filter)) {
      const bulkToolbar = create('div', { className: 'phase-request-bulk-toolbar', attrs: { role: 'group', 'aria-label': 'Thao tác yêu cầu đã chọn' } });
      const selectAllLabel = create('label', { className: 'phase-request-select-all' });
      bulkSelectAll = create('input', { className: 'phase-request-checkbox', type: 'checkbox', attrs: { 'aria-label': 'Chọn tất cả yêu cầu đang chờ duyệt' } });
      bulkSelectAll.addEventListener('change', () => {
        selectionItems.forEach(req => bulkSelectAll.checked ? selectedRequestIds.add(req.requestId) : selectedRequestIds.delete(req.requestId));
        renderList(filter, page);
      });
      selectAllLabel.append(bulkSelectAll, create('span', { text: 'Chọn tất cả' }));
      bulkSelectionCount = create('span', { className: 'phase-request-selection-count', text: '0 đã chọn' });
      if (filter === 'pending') {
        bulkApproveAllButton = actionButton('Duyệt tất cả', () => runBulkReview('approve', !selectionItems.some(req => selectedRequestIds.has(req.requestId))), `bulk-review-${tournamentId}-approve`, 'primary-btn phase-request-bulk-btn');
        bulkRejectAllButton = actionButton('Từ chối tất cả', () => runBulkReview('reject', !selectionItems.some(req => selectedRequestIds.has(req.requestId))), `bulk-review-${tournamentId}-reject`, 'secondary-btn phase-request-bulk-btn phase-request-bulk-reject-btn');
        bulkToolbar.append(selectAllLabel, bulkSelectionCount, bulkApproveAllButton, bulkRejectAllButton);
      } else {
        bulkUndoAllButton = actionButton('Hoàn tác tất cả', () => runBulkUndo(!selectionItems.some(req => selectedRequestIds.has(req.requestId))), `bulk-review-${tournamentId}-undo`, 'secondary-btn phase-request-bulk-btn');
        bulkToolbar.append(selectAllLabel, bulkSelectionCount, bulkUndoAllButton);
      }
      bulkToolbar.addEventListener('click', event => {
        const target = event.target;
        if (target instanceof Element && target.closest('button, input, label')) return;
        bulkSelectAll.checked = !bulkSelectAll.checked;
        bulkSelectAll.dispatchEvent(new Event('change', { bubbles: true }));
      });
      container.appendChild(bulkToolbar);
    } else {
      bulkSelectAll = null;
      bulkSelectionCount = null;
      bulkApproveAllButton = null;
      bulkRejectAllButton = null;
      bulkUndoAllButton = null;
    }

    let activeItems = [];
    if (filter === 'pending') activeItems = pendingList;
    else if (filter === 'approved') activeItems = approvedList;
    else if (filter === 'rejected') activeItems = rejectedList;

    if (!activeItems.length) {
      const emptyDiv = create('div', { className: 'phase-empty-inbox' });
      const emptyIconName = filter === 'pending' ? 'td-icon-check' : filter === 'approved' ? 'td-icon-bot' : 'td-icon-circle-x';
      const emptyTitle = filter === 'pending'
        ? 'Không có yêu cầu chờ duyệt'
        : filter === 'approved'
          ? 'Chưa có Bot nào được duyệt'
          : 'Chưa có yêu cầu bị từ chối';
      const emptyDesc = filter === 'pending'
        ? 'Tất cả các yêu cầu gửi Bot đã được xử lý.'
        : filter === 'approved'
          ? (isOrganizer ? 'Duyệt các yêu cầu tham gia ở tab "Chờ duyệt" để bổ sung Bot.' : 'Chưa có Bot nào được phê duyệt.')
          : 'Không có yêu cầu nào bị từ chối trong giải đấu này.';

      const emptySvg = icon(emptyIconName);
      emptySvg.classList.add('td-icon', 'td-icon--lg');
      emptyDiv.append(emptySvg, create('strong', { text: emptyTitle }), create('span', { text: emptyDesc }));
      container.appendChild(emptyDiv);
      updateBulkSelection();
      return;
    }

    const list = create('ul', { className: 'phase-bot-rows-list phase-inbox-list' });
    activeItems.slice((page - 1) * pageSize, page * pageSize).forEach(req => {
      const item = create('li', { className: 'phase-bot-row phase-inbox-item', attrs: { 'data-request-id': req.requestId } });

      if (isOrganizer && ['pending', 'approved', 'rejected'].includes(req.status)) {
        item.classList.add('is-selectable');
        item.tabIndex = 0;
        item.setAttribute('aria-label', `Chọn yêu cầu ${req.participantName || req.botName || req.bot?.name || `Bot #${shortId(req.botId)}`}`);
        const toggleRowSelection = () => {
          const checkbox = item.querySelector('.phase-request-checkbox');
          if (!checkbox) return;
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        };
        item.addEventListener('click', event => {
          const target = event.target;
          if (target instanceof Element && target.closest('button, input, a, label')) return;
          toggleRowSelection();
        });
        item.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          toggleRowSelection();
        });
      }

      if (isOrganizer && ['pending', 'approved', 'rejected'].includes(req.status)) {
        const requestCheckbox = create('input', {
          className: 'phase-request-checkbox',
          type: 'checkbox',
          attrs: { 'aria-label': `Chọn ${req.participantName || req.botName || req.bot?.name || `Bot #${shortId(req.botId)}`}` },
        });
        requestCheckbox.checked = selectedRequestIds.has(req.requestId);
        item.classList.toggle('is-selected', requestCheckbox.checked);
        requestCheckbox.addEventListener('change', () => {
          if (requestCheckbox.checked) selectedRequestIds.add(req.requestId);
          else selectedRequestIds.delete(req.requestId);
          item.classList.toggle('is-selected', requestCheckbox.checked);
          updateBulkSelection();
        });
        item.appendChild(requestCheckbox);
      }

      // Left
      const left = create('div', { className: 'bot-row-left inbox-copy' });
      const avatar = create('span', { className: 'bot-row-avatar' });
      const botSvg = icon('td-icon-bot');
      botSvg.classList.add('td-icon', 'td-icon--md');
      avatar.appendChild(botSvg);

      const info = create('div', { className: 'bot-row-info' });
      const name = create('strong', { className: 'bot-row-title', text: req.participantName || req.botName || req.bot?.name || `Bot #${shortId(req.botId)}` });

      let metaText = '';
      if (req.status === 'pending') {
        const user = req.username || req.competitorUsername;
        const botLabel = req.botName || req.bot?.name;
        metaText = [botLabel ? `Bot: ${botLabel}` : '', user ? `Yêu cầu đang chờ xét duyệt · ${user}` : 'Yêu cầu đang chờ xét duyệt'].filter(Boolean).join(' · ');
      } else if (req.status === 'approved') {
        const user = req.username || req.competitorUsername;
        const runtime = req.execution?.runtimeId === 'cpp' ? 'C++17' : req.execution?.runtimeId === 'python3' ? 'Python 3' : (req.runtime === 'cpp' ? 'C++17' : req.runtime === 'python3' ? 'Python 3' : '');
        metaText = [user ? `Tuyển thủ: ${user}` : '', runtime].filter(Boolean).join(' · ') || 'Đã duyệt tham gia';
      } else {
        const user = req.username || req.competitorUsername;
        metaText = user ? `Đã từ chối · ${user}` : 'Yêu cầu đã bị từ chối';
      }
      const subtitle = create('span', { className: 'bot-row-subtitle inbox-meta', text: metaText });
      info.append(name, subtitle);
      if (req.execution || req.revisionId) {
        const preflight = req.preflight || { status: 'not_started' };
        const validation = create('span', { className: `bot-row-subtitle preflight-status preflight-${preflight.status}`, text: preflightStatusLabel(preflight), attrs: { 'data-preflight-status': preflight.status } });
        const diagnosticText = preflightDiagnosticText(preflight);
        const diagnostic = create('span', { className: 'bot-row-subtitle preflight-diagnostic', text: diagnosticText });
        diagnostic.hidden = !diagnosticText;
        info.append(validation, diagnostic);
      }
      left.append(avatar, info);

      // Right
      const right = create('div', { className: 'bot-row-right inbox-actions' });
      const preflight = req.preflight || { status: 'not_started' };
      if (isOrganizer && req.status === 'pending' && ['failed', 'expired'].includes(preflight.status)) {
        const retry = actionButton('Kiểm tra lại', async () => {
          try {
            await api(`/tournaments/${tournamentId}/requests/${req.requestId}/preflight/retry`, { method: 'POST' });
            showToast('Đã đưa Bot vào hàng đợi kiểm tra lại.', 'info');
            startPhase2PreflightPolling(tournamentId, container, statsRoot, countBadge, { pending: tabPending, approved: tabApproved, rejected: tabRejected }, requests);
          }
          catch (e) { showToast(e.message || 'Không thể chạy lại kiểm tra Bot.', 'error'); }
        }, `retry-preflight-${req.requestId}`, 'secondary-btn req-retry-btn');
        right.appendChild(retry);
      }

      if (isOrganizer && req.status === 'pending') {
        const approveBtn = actionButton('Duyệt', async () => {
          try {
            const result = await api(`/tournaments/${tournamentId}/requests/${req.requestId}/approve`, { method: 'POST' });
            if (result?.status === 'pending') {
              showToast('Đang kiểm tra Bot trong Sandbox. Bạn có thể tiếp tục thao tác và duyệt lại sau.', 'info');
              startPhase2PreflightPolling(tournamentId, container, statsRoot, countBadge, { pending: tabPending, approved: tabApproved, rejected: tabRejected }, requests);
            } else {
              showToast('Đã duyệt yêu cầu tham gia.', 'success');
              await refreshTournamentDetail({ force: true });
            }
          } catch (e) {
            showToast(e.message || 'Không thể duyệt yêu cầu.', 'error');
          }
        }, `approve-req-${req.requestId}`, 'primary-btn req-approve-btn');

        const rejectBtn = actionButton('Từ chối', async () => {
          try {
            await api(`/tournaments/${tournamentId}/requests/${req.requestId}/reject`, { method: 'POST' });
            showToast('Đã từ chối yêu cầu.', 'info');
            await refreshTournamentDetail({ force: true });
          } catch (e) {
            showToast(e.message || 'Không thể từ chối yêu cầu.', 'error');
          }
        }, `reject-req-${req.requestId}`, 'secondary-btn req-reject-btn');

        right.append(approveBtn, rejectBtn);
      } else if (isOrganizer && (req.status === 'approved' || req.status === 'rejected')) {
        const undoBtn = actionButton('Hoàn tác', async () => {
          try {
            await api(`/tournaments/${tournamentId}/requests/${req.requestId}/undo`, { method: 'POST' });
            showToast('Đã hoàn tác quyết định. Yêu cầu quay lại trạng thái chờ duyệt.', 'success');
            await refreshTournamentDetail({ force: true });
          } catch (e) {
            showToast(e.message || 'Không thể hoàn tác quyết định.', 'error');
          }
        }, `undo-req-${req.requestId}`, 'secondary-btn req-undo-btn');
        right.appendChild(undoBtn);
      }

      item.append(left, right);
      list.appendChild(item);
    });

    container.appendChild(list);
    if (pageCount > 1) {
      const pagination = create('nav', { className: 'phase-request-pagination', attrs: { 'aria-label': 'Phân trang yêu cầu tham gia' } });
      const previous = actionButton('Trước', () => renderList(filter, page - 1), 'phase-request-prev', 'secondary-btn tournament-pagination-button');
      const next = actionButton('Sau', () => renderList(filter, page + 1), 'phase-request-next', 'secondary-btn tournament-pagination-button');
      previous.disabled = page === 1;
      next.disabled = page === pageCount;
      pagination.append(previous, create('span', { className: 'phase-request-page-status', text: `Trang ${page} / ${pageCount}` }), next);
      container.appendChild(pagination);
    }
    updateBulkSelection();
    if (bulkProcessing) container.querySelectorAll('button, input').forEach(control => { control.disabled = true; });
  };

  [
    [tabPending, 'pending'],
    [tabApproved, 'approved'],
    [tabRejected, 'rejected'],
  ].forEach(([tab, filter]) => {
    if (!tab) return;
    tab.onclick = () => renderList(filter, 1);
  });

  renderList(state.detailRequestsFilter || 'pending');
  startPhase2PreflightPolling(tournamentId, container, statsRoot, countBadge, { pending: tabPending, approved: tabApproved, rejected: tabRejected }, requests);
}

function stopMultiStagePolling() {
  const multiStage = state.multiStage;
  if (!multiStage) return;
  if (multiStage.pollTimer) window.clearTimeout(multiStage.pollTimer);
  if (multiStage.visibilityHandler) document.removeEventListener('visibilitychange', multiStage.visibilityHandler);
  multiStage.visibilityHandler = null;
  if (multiStage.abortController) multiStage.abortController.abort();
  if (multiStage.pairingController) multiStage.pairingController.abort();
  multiStage.pollTimer = null;
  multiStage.abortController = null;
  multiStage.pairingController = null;
  multiStage.requestToken += 1;
}

const MULTI_STAGE_POLL_RUNNING_INTERVAL_MS = 7000;
const MULTI_STAGE_POLL_PAUSED_INTERVAL_MS = 15000;

function multiStageNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

function multiStagePairingStats(progress = {}) {
  return {
    total: Number(progress.total) || 0,
    completed: Number(progress.completed) || 0,
    inProgress: Number(progress.inProgress ?? progress.running) || 0,
    pending: Number(progress.pending) || 0,
    failed: Number(progress.failed) || 0,
    pendingTiebreaker: Number(progress.pendingTiebreaker ?? progress.pendingTiebreakers) || 0,
  };
}

function setLegacyTournamentDetailVisibility(hidden) {
  ['td-podium-panel', 'td-requests', 'td-overview', 'td-schedule']
    .forEach(id => { const node = document.getElementById(id); if (node) node.hidden = hidden; });
  const overview = document.querySelector('#tournament-detail .tournament-overview');
  if (overview) overview.hidden = hidden;
  const schedule = document.querySelector('#tournament-detail .tournament-schedule');
  if (schedule) schedule.hidden = hidden;
}

function getMultiStageTournamentName(tournamentId) {
  return state.tournaments.find(item => item.tournamentId === tournamentId)?.name
    || state.tournamentRegistrationContext?.name
    || 'Giải đấu nhiều giai đoạn';
}

function multiStageStatusLabel(status) {
  const labels = {
    draft: 'Bản nháp',
    registration_open: 'Đang mở đăng ký',
    registration_closed: 'Đã đóng đăng ký',
    running: 'Đang diễn ra',
    completed: 'Đã hoàn thành',
    paused: 'Đang tạm dừng',
    cancelled: 'Đã hủy',
    scheduled: 'Đang chờ',
    pending: 'Chưa bắt đầu',
    in_progress: 'Đang diễn ra',
    failed: 'Thất bại',
    pending_tiebreaker: 'Chờ phân định',
  };
  return labels[status] || status || 'Chưa xác định';
}

function multiStageName(stage) {
  if (!stage) return '';
  if (stage.stageType === 'preliminary') return 'Vòng loại khu vực';
  if (stage.stageType === 'group_stage' || stage.name === 'Group Stage') return 'Vòng bảng';
  if (stage.stageType === 'knockout' || stage.name === 'Knockout Stage' || stage.name === 'Knockout') return 'Vòng loại trực tiếp';
  if (stage.stageType === 'regional_qualifiers' || stage.stageType === 'regional-qualifiers' || stage.name === 'Regional Qualifiers') return 'Vòng loại khu vực';
  return stage.name || stage.stageType || '';
}

function renderMultiStageActions(tournamentId, authRevision, viewRevision, progress, tournament = null) {
  const actions = $('#td-actions');
  if (!actions) return;
  actions.replaceChildren(actionButton('Cập nhật', () => refreshTournamentDetail({ force: true }), `refresh-multi-stage:${tournamentId}`, 'secondary-btn tournament-action tournament-refresh-action'));
  if (state.user?.role !== 'organizer') return;

  const status = progress?.status;
  if (status === 'draft') {
    const openBtn = actionButton(actionLabel('open_registration'), () => confirmTournamentAction(tournamentId, authRevision, viewRevision, 'open_registration', actionLabel('open_registration'), progress?.name || 'giải đấu'), `tournament:${tournamentId}:open_registration`, 'primary-btn tournament-action phase-open-reg-cta');
    actions.replaceChildren(openBtn);
    return;
  }
  if (status === 'registration_open') {
    const closeBtn = actionButton(actionLabel('close_registration'), () => handleCloseRegistration(tournamentId, progress.name || 'giải đấu', authRevision, viewRevision), `tournament:${tournamentId}:close_registration`, 'primary-btn tournament-action phase-close-cta');
    actions.replaceChildren(closeBtn);
    return;
  }
  if (status === 'registration_closed') {
    const scheduledPairings = Number(progress.progress?.total) || 0;
    appendTournamentAction(
      actions,
      tournamentId,
      authRevision,
      viewRevision,
      scheduledPairings > 0 ? actionLabel('start') : actionLabel('generate_schedule'),
      scheduledPairings > 0 ? 'start' : 'generate_schedule',
    );
    return;
  }
  if (status === 'completed') {
    const resultsPublished = Boolean(tournament?.resultsPublishedAt || progress?.resultsPublishedAt || progress?.progress?.resultsPublishedAt);
    if (!resultsPublished) {
      appendTournamentAction(
        actions,
        tournamentId,
        authRevision,
        viewRevision,
        'Công bố kết quả',
        'publish',
        true,
        progress.name || 'giải đấu'
      );
    }
    return;
  }
  if (status !== 'running') return;

  const currentStage = progress?.currentStage || tournament?.stages?.find(stage => stage.status === 'pending' || stage.status === 'in_progress');
  if (currentStage?.status === 'pending') {
    appendTournamentAction(
      actions,
      tournamentId,
      authRevision,
      viewRevision,
      actionLabel('start_next_stage'),
      'start_next_stage',
      true,
      progress.name || 'giai đoạn tiếp theo'
    );
    return;
  }

  const execution = progress.progress || progress || {};
  const pending = Number(execution.pending) || 0;
  const running = Number(execution.running) || 0;
  const activePairings = Number(execution.inProgress) || running;
  const failed = Number(execution.failed) || 0;
  if (pending <= 0 && activePairings <= 0) return;

  const action = activePairings > 0 ? 'stop_execution' : 'run_all';
  const label = activePairings > 0
    ? actionLabel('stop_execution')
    : failed > 0
      ? 'Chạy lại giải đấu'
      : actionLabel('run_all');
  const runButton = appendTournamentAction(actions, tournamentId, authRevision, viewRevision, label, action, true, progress.name || 'giải đấu');
  if (activePairings > 0) {
    runButton.title = 'Dừng thực thi các trận đấu đang xử lý.';
  }
}

function renderMultiStageProgressSummary(container, progress, viewedStage, actualStage = viewedStage) {
  const stats = multiStagePairingStats(progress);
  const items = [
    ['Đã hoàn thành', stats.completed, 'completed'],
    ['Đang thi đấu', stats.inProgress, 'running'],
    ['Đang chờ xử lý', stats.pending, 'pending'],
    ['Trận lỗi', stats.failed, 'failed'],
    ['Chờ phân định', stats.pendingTiebreaker, 'tiebreaker'],
  ];
  const section = create('section', { className: 'multi-stage-progress-summary', attrs: { 'aria-labelledby': 'multi-stage-progress-title' } });
  const heading = create('div', { className: 'multi-stage-section-heading' });
  heading.append(create('div', { className: 'multi-stage-heading-copy' }), create('span', { className: 'multi-stage-current-stage' }));
  const headingCopy = heading.querySelector('.multi-stage-heading-copy');
  headingCopy.append(create('p', { className: 'panel-kicker', text: `Đang xem · ${multiStageName(viewedStage) || 'Vòng loại khu vực'}` }), create('h3', { id: 'multi-stage-progress-title', text: 'Tiến độ giải đấu' }));
  heading.querySelector('.multi-stage-current-stage').textContent = actualStage
    ? `Giải đang ở: ${multiStageName(actualStage) || 'Giai đoạn cuối'} · ${multiStageStatusLabel(actualStage.status)}`
    : 'Giải chưa bắt đầu';
  section.appendChild(heading);
  const grid = create('div', { className: 'multi-stage-progress-grid' });
  items.forEach(([label, value, tone]) => {
    const item = create('div', { className: `multi-stage-progress-item is-${tone}` });
    item.append(create('strong', { text: multiStageNumber(value) }), create('span', { text: label }));
    grid.appendChild(item);
  });
  section.appendChild(grid);
  const denominator = Math.max(stats.total, 1);
  const progressBar = create('div', { className: 'multi-stage-progress-track', attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(stats.total), 'aria-valuenow': String(stats.completed), 'aria-label': 'Tiến độ trận đấu' } });
  const fill = create('span', { className: 'multi-stage-progress-fill' });
  fill.style.width = `${Math.min(100, (stats.completed / denominator) * 100)}%`;
  progressBar.appendChild(fill);
  section.appendChild(progressBar);
  container.appendChild(section);
}

function getCachedPendingTiebreakers() {
  const pairings = new Map();
  state.multiStage.pairingPages.forEach(response => {
    (response.pairings || []).forEach(pairing => {
      if (pairing.status === 'pending_tiebreaker') pairings.set(pairing.pairingId, pairing);
    });
  });
  return [...pairings.values()];
}

function tiebreakerResolutionModal() {
  let modal = $('#tiebreaker-resolution-modal');
  if (modal) return modal;
  modal = create('div', { className: 'modal-overlay', attrs: { id: 'tiebreaker-resolution-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tiebreaker-resolution-title', 'aria-hidden': 'true' } });
  const panel = create('div', { className: 'modal-box tiebreaker-resolution-panel' });
  const header = create('div', { className: 'modal-head' });
  const close = create('button', { className: 'icon-btn modal-close', type: 'button', attrs: { 'aria-label': 'Đóng', 'data-close-modal': 'tiebreaker-resolution-modal' } });
  close.append(icon('icon-x'));
  header.append(create('h2', { id: 'tiebreaker-resolution-title', text: 'Phân định trận hòa' }), close);
  const body = create('div', { className: 'tiebreaker-resolution-body' });
  body.append(create('p', { className: 'tiebreaker-resolution-match' }), create('div', { className: 'tiebreaker-resolution-options', attrs: { role: 'radiogroup', 'aria-label': 'Chọn Bot thắng' } }));
  const reason = create('textarea', { className: 'input-control tiebreaker-resolution-reason', attrs: { id: 'tiebreaker-resolution-reason', rows: '4', maxlength: '500', placeholder: 'Nhập lý do phân định (bắt buộc)…' } });
  body.append(create('label', { className: 'field-label', attrs: { for: 'tiebreaker-resolution-reason' }, text: 'Lý do phân định' }), reason, create('p', { className: 'form-error tiebreaker-resolution-error', attrs: { role: 'alert', hidden: 'true' } }));
  const footer = create('div', { className: 'dialog-actions' });
  footer.append(create('button', { className: 'secondary-btn tiebreaker-resolution-replay', type: 'button', text: 'Xem lại diễn biến' }), create('button', { className: 'primary-btn tiebreaker-resolution-submit', type: 'button', text: 'Xác nhận phân định' }));
  panel.append(header, body, footer); modal.appendChild(panel); document.body.appendChild(modal);
  modal.querySelector('[data-close-modal]').addEventListener('click', () => closeModal(modal.id));
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal.id); });
  return modal;
}

function showTiebreakerError(modal, message) {
  const error = modal.querySelector('.tiebreaker-resolution-error');
  if (error) { error.textContent = message; error.hidden = !message; }
}

function openTiebreakerResolution(pairing) {
  if (state.user?.role !== 'organizer' || pairing?.status !== 'pending_tiebreaker') return;
  const modal = tiebreakerResolutionModal();
  const match = modal.querySelector('.tiebreaker-resolution-match');
  const options = modal.querySelector('.tiebreaker-resolution-options');
  const reason = modal.querySelector('.tiebreaker-resolution-reason');
  const submit = modal.querySelector('.tiebreaker-resolution-submit');
  const replay = modal.querySelector('.tiebreaker-resolution-replay');
  const nameA = knockoutSlotLabel(pairing, 'A');
  const nameB = knockoutSlotLabel(pairing, 'B');
  match.textContent = `${nameA} · ${nameB} · Kết quả: Hòa`;
  options.replaceChildren(...['A', 'B'].map(side => {
    const label = create('label', { className: 'tiebreaker-resolution-option' });
    const input = create('input', { type: 'radio', attrs: { name: 'tiebreaker-winner', value: side } });
    label.append(input, create('span', { text: side === 'A' ? nameA : nameB }));
    return label;
  }));
  reason.value = '';
  showTiebreakerError(modal, '');
  replay.hidden = !(pairing.matchId && pairing.matchResult);
  replay.onclick = () => { if (pairing.matchId && pairing.matchResult) playReplay(state.tournamentId, pairing.matchId); };
  submit.onclick = () => {
    const winner = modal.querySelector('input[name="tiebreaker-winner"]:checked')?.value;
    const explanation = reason.value.trim();
    if (!winner) { showTiebreakerError(modal, 'Hãy chọn Bot thắng.'); return; }
    if (!explanation) { showTiebreakerError(modal, 'Hãy nhập lý do phân định.'); reason.focus(); return; }
    void resolveTiebreaker(pairing, winner, explanation, submit, modal);
  };
  openModal(modal.id);
  modal.querySelector('input[name="tiebreaker-winner"]')?.focus();
}

async function resolveTiebreaker(pairing, winner, reason, submit, modal) {
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const key = `tiebreaker:${state.tournamentId}:${pairing.pairingId}`;
  await runPending(key, submit, async () => {
    try {
      await request(`/tournaments/${state.tournamentId}/pairings/${encodeURIComponent(pairing.pairingId)}/resolve-tiebreaker`, { method: 'POST', body: JSON.stringify({ winner, reason }) });
      // The POST is authoritative. A background poll may rotate requestToken
      // while it is in flight; that must not discard a successful resolution.
      if (authRevision !== state.authRevision || viewRevision !== state.viewRevision || state.activeView !== 'tournament-detail') {
        closeModal(modal.id);
        return;
      }
      closeModal(modal.id);
      await refreshTournamentDetail();
      showToast('Đã ghi nhận kết quả phân định.', 'success');
    } catch (error) {
      const message = error.status === 409
        ? 'Trận đấu đã được phân định trước đó hoặc kết quả bị xung đột.'
        : error.status === 403 ? 'Bạn không có quyền phân định trận đấu này.'
          : error.status === 404 ? 'Không tìm thấy trận đấu chờ phân định.'
            : error.status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
              : error.message || 'Không thể ghi nhận phân định.';
      showTiebreakerError(modal, message);
      error.notified = true;
      throw error;
    }
  });
}

function pendingTiebreakerStage(currentStage) {
  const stages = state.multiStage.stages || [];
  return stages.find(stage => Number(stage.progress?.pendingTiebreaker) > 0)
    || currentStage
    || stages.find(stage => stage.stageType === 'knockout')
    || null;
}

function renderPendingTiebreakerPanel(container, currentStage) {
  const count = multiStagePairingStats(state.multiStage.progress?.progress || state.multiStage.progress).pendingTiebreaker;
  if (!count) return;
  const panel = create('section', { className: 'pending-tiebreaker-panel', attrs: { 'aria-labelledby': 'pending-tiebreaker-title' } });
  const heading = create('div', { className: 'multi-stage-section-heading' });
  const copy = create('div', { className: 'multi-stage-heading-copy' });
  copy.append(create('p', { className: 'panel-kicker', text: 'Cần xử lý' }), create('h3', { id: 'pending-tiebreaker-title', text: `${multiStageNumber(count)} trận chờ phân định` }), create('p', { className: 'multi-stage-supporting-copy', text: 'Kết quả hòa hợp lệ chưa thể mở khóa nhánh tiếp theo.' }));
  heading.append(copy, create('span', { className: 'stage-status stage-status-pending_tiebreaker', text: 'Chờ phân định' })); panel.appendChild(heading);
  const pairings = getCachedPendingTiebreakers();
  if (!pairings.length) {
    panel.appendChild(create('div', { className: 'pending-tiebreaker-empty', text: 'Tải danh sách trận chờ phân định khi cần xem chi tiết.' }));
    const pendingStage = pendingTiebreakerStage(currentStage);
    panel.appendChild(actionButton('Tải danh sách trận', () => loadPendingTiebreakerPairings(pendingStage?.stageId), `pending-tiebreakers:${pendingStage?.stageId}`, 'secondary-btn'));
  } else {
    const list = create('div', { className: 'pending-tiebreaker-list' });
    pairings.forEach(pairing => {
      const item = create('article', { className: 'pending-tiebreaker-item' });
      item.append(create('div', { className: 'pending-tiebreaker-copy' }), create('span', { className: 'stage-status stage-status-pending_tiebreaker', text: 'Hòa' }));
      item.querySelector('.pending-tiebreaker-copy').append(create('strong', { text: `${knockoutSlotLabel(pairing, 'A')} · ${knockoutSlotLabel(pairing, 'B')}` }), create('small', { text: `Trận ${pairing.pairingId}` }));
      const actions = create('div', { className: 'pending-tiebreaker-actions' });
      if (pairing.matchId && pairing.matchResult) actions.appendChild(actionButton('Xem lại', () => playReplay(state.tournamentId, pairing.matchId), `pending-replay:${pairing.matchId}`, 'secondary-btn'));
      if (state.user?.role === 'organizer') actions.appendChild(actionButton('Phân định', () => openTiebreakerResolution(pairing), `pending-resolve:${pairing.pairingId}`, 'primary-btn'));
      item.appendChild(actions); list.appendChild(item);
    });
    panel.appendChild(list);
  }
  container.appendChild(panel);
}

async function loadPendingTiebreakerPairings(stageId) {
  if (!stageId || state.activeView !== 'tournament-detail') return;
  const response = await request(`/tournaments/${state.tournamentId}/pairings?stageId=${encodeURIComponent(stageId)}&page=1&pageSize=100`);
  const stage = state.multiStage.stages?.find(item => item.stageId === stageId);
  state.multiStage.pairingPages.set(stage?.stageType === 'knockout' ? knockoutPairingCacheKey(stageId, 1) : `pending:${stageId}`, response);
  renderMultiStageWorkspace();
}

function renderMultiStageNavigation(container, stages, activeStageId) {
  const wrap = create('div', { className: 'phase5-stage-nav-wrap' });
  const navHead = create('div', { className: 'phase5-stage-nav-header' });
  navHead.append(create('h4', { className: 'phase5-stage-nav-title', text: 'Theo dõi giai đoạn' }));
  wrap.appendChild(navHead);

  const section = create('section', { className: 'multi-stage-navigation', attrs: { 'aria-label': 'Các giai đoạn giải đấu' } });
  stages.forEach((stage, index) => {
    const isRegional = stage.stageType === 'preliminary' || stage.stageType === 'regional_qualifiers' || stage.stageType === 'regional-qualifiers';
    const supported = isRegional
      ? Boolean(stage.regions && stage.regions.length > 0)
      : (Boolean(stage.groups?.length) || stage.stageType === 'group_stage' || stage.stageType === 'knockout');
    if (!supported) return;

    const active = stage.stageId === activeStageId;
    const button = create('button', { className: `multi-stage-tab${active ? ' is-active' : ''}`, type: 'button', attrs: { 'aria-selected': String(active), role: 'tab', 'data-multi-stage-focus': `stage:${stage.stageId}` } });
    button.append(create('span', { className: 'multi-stage-tab-index', text: String(index + 1) }), create('span', { className: 'multi-stage-tab-copy' }));
    const copy = button.querySelector('.multi-stage-tab-copy');
    copy.append(create('strong', { text: multiStageName(stage) || `Giai đoạn ${index + 1}` }), create('small', { text: multiStageStatusLabel(stage.status) }));
    if (!active) button.addEventListener('click', () => {
      state.multiStage.activeStageId = stage.stageId;
      renderMultiStageWorkspace();
    });
    section.appendChild(button);
  });
  wrap.appendChild(section);
  container.appendChild(wrap);
}

function regionalDisplayName(region) {
  const raw = String(region?.name || '');
  const match = raw.match(/^Region\s+(\d+)$/i);
  if (match) return `Khu vực ${match[1]}`;
  return raw || `Khu vực ${region?.regionIndex ?? ''}`;
}

function syncRegionalCardsSelection(activeRegionId) {
  const workspace = $('#multi-stage-workspace');
  if (!workspace) return;
  const cards = workspace.querySelectorAll('.regional-region-card');
  cards.forEach(card => {
    const isSelected = card.getAttribute('data-multi-stage-focus') === `region:${activeRegionId}`;
    card.classList.toggle('is-selected', isSelected);
    card.setAttribute('aria-pressed', String(isSelected));
    const actionLink = card.querySelector('.regional-action-link');
    if (actionLink) {
      actionLink.textContent = isSelected ? '✓ Đang xem khu vực này' : 'Xem lịch và kết quả khu vực →';
    }
    const badges = card.querySelector('.regional-card-badges');
    if (badges) {
      let badge = badges.querySelector('.regional-selected-badge');
      if (isSelected) {
        if (!badge) {
          badge = create('span', { className: 'regional-selected-badge', text: '✓ Đang xem' });
          badges.prepend(badge);
        }
      } else if (badge) {
        badge.remove();
      }
    }
  });
}

function renderRegionalRegionCard(region, stageId, selectedRegionId) {
  const progress = multiStagePairingStats(region.progress);
  const active = region.regionId === selectedRegionId;
  const card = create('button', { className: `regional-region-card${active ? ' is-selected' : ''}`, type: 'button', attrs: { 'aria-pressed': String(active), 'data-multi-stage-focus': `region:${region.regionId}` } });
  const top = create('span', { className: 'regional-region-card-top' });
  top.append(create('strong', { text: regionalDisplayName(region) }));
  const badgeWrap = create('span', { className: 'regional-card-badges' });
  if (active) {
    badgeWrap.appendChild(create('span', { className: 'regional-selected-badge', text: '✓ Đang xem' }));
  }
  badgeWrap.appendChild(create('span', { className: `stage-status stage-status-${safeStatusClass(region.status)}`, text: multiStageStatusLabel(region.status) }));
  top.appendChild(badgeWrap);
  card.appendChild(top);
  const counts = create('span', { className: 'regional-region-counts' });
  const qualifierCount = Number(region.qualifierCount) || 0;
  const qualifierLimit = Number(region.qualifierLimit ?? region.qualifierCount) || qualifierCount;
  const qualifierLabel = qualifierCount < qualifierLimit
    ? `${multiStageNumber(qualifierCount)} suất đi tiếp · tối đa ${multiStageNumber(qualifierLimit)}`
    : `${multiStageNumber(qualifierCount)} suất đi tiếp`;
  counts.append(create('span', { text: `${multiStageNumber(region.participantCount)} Bot` }), create('span', { text: `${multiStageNumber(region.qualifierCount)} suất đi tiếp` }));
  card.appendChild(counts);
  const qualifierCountLabel = counts.querySelectorAll('span')[1];
  if (qualifierCountLabel) qualifierCountLabel.textContent = qualifierLabel;
  const track = create('span', { className: 'regional-region-track', attrs: { 'aria-hidden': 'true' } });
  const fill = create('span'); fill.style.width = `${progress.total ? (progress.completed / progress.total) * 100 : 0}%`; track.appendChild(fill); card.appendChild(track);
  card.append(create('span', { className: 'regional-region-meta', text: `${multiStageNumber(progress.completed)}/${multiStageNumber(progress.total)} trận hoàn thành` }));
  const regionalActionLink = create('span', { className: 'regional-action-link', text: 'Xem lịch và kết quả khu vực →' });
  if (active) regionalActionLink.textContent = '✓ Đang xem khu vực này';
  card.append(regionalActionLink);
  card.addEventListener('click', () => {
    state.multiStage.activeStageId = stageId;
    state.multiStage.activeRegionId = region.regionId;
    syncRegionalCardsSelection(region.regionId);
    void loadRegionalPairings(stageId, region.regionId);
  });
  return card;
}

function renderRegionalPairings(container, response, region) {
  const panel = create('section', { className: 'regional-pairings-panel', attrs: { 'aria-labelledby': 'regional-pairings-title' } });
  const heading = create('div', { className: 'multi-stage-section-heading' });
  const copy = create('div', { className: 'multi-stage-heading-copy' });
  copy.append(create('p', { className: 'panel-kicker', text: 'Lịch thi đấu' }), create('h3', { id: 'regional-pairings-title', text: regionalDisplayName(region) }));
  heading.append(copy, create('span', { className: 'multi-stage-pairing-count', text: `${multiStageNumber(response.pagination?.totalItems)} trận` }));
  if (!isCompetitorResultsUnpublished(state.currentTournament)) {
    renderRegionalStandings(panel, region);
  } else {
    panel.appendChild(unpublishedResultsNotice());
  }
  panel.appendChild(heading);
  const pairings = (response.pairings || []).filter(pairing => pairing.participantB !== null);
  if (!pairings.length) {
    const empty = create('div', { className: 'multi-stage-empty' });
    empty.append(icon('td-icon-calendar-days'), create('strong', { text: 'Chưa có trận đấu' }), create('span', { text: 'Lịch đấu của khu vực sẽ xuất hiện khi giai đoạn được mở.' }));
    empty.querySelector('svg')?.classList.add('td-icon', 'td-icon--lg');
    panel.appendChild(empty);
  } else {
    const list = create('div', { className: 'group-pairing-list regional-pairing-list' });
    if (!state.multiStage.expandedRegionalPairings) state.multiStage.expandedRegionalPairings = new Set();
    pairings.forEach((pairing, index) => {
      const card = create('article', { className: 'group-pairing-card regional-pairing-card', attrs: { 'data-pairing-id': pairing.pairingId } });
      const progress = regionalSeriesProgress(pairing);
      const header = create('div', { className: 'group-pairing-card-header' });
      const main = create('div', { className: 'group-pairing-main' });
      const names = create('div', { className: 'group-pairing-names' });
      names.append(
        create('strong', { className: 'group-pairing-player', text: pairing.participantNames?.A || resolveParticipantName(state.currentTournament, pairing.participantA) }),
        create('span', { className: 'group-pairing-vs', text: 'vs' }),
        create('strong', { className: 'group-pairing-player', text: pairing.participantNames?.B || resolveParticipantName(state.currentTournament, pairing.participantB) })
      );
      main.append(names, create('div', { className: 'group-pairing-meta', children: [create('span', { className: 'group-series-pill', text: 'BO3' })] }));
      main.appendChild(create('span', {
        className: 'group-series-score',
        text: isCompetitorResultsUnpublished(state.currentTournament) && pairing.status === 'completed'
          ? 'Kết quả chưa được công bố.'
          : seriesHasStarted(pairing, progress) ? `Tỉ số ${progress.winsA || 0}–${progress.winsB || 0}` : 'Chưa thi đấu',
      }));
      const headerRight = create('div', { className: 'group-pairing-header-right' });
      headerRight.appendChild(statusBadge(pairing.status));
      const expanded = false;
      const toggle = create('button', { className: 'group-pairing-toggle secondary-btn', type: 'button', attrs: { 'aria-expanded': String(expanded), 'aria-controls': `regional-games-${pairing.pairingId}`, 'aria-label': `Chi tiết các ván cho trận ${pairing.pairingId}` } });
      toggle.append(create('span', { text: 'Chi tiết các ván' }), createChevronIcon());
      const replayGame = latestReplayGame(progress);
      if (pairing.status === 'completed' && (replayGame || isCompetitorResultsUnpublished(state.currentTournament))) {
        toggle.textContent = isCompetitorResultsUnpublished(state.currentTournament) ? 'Replay sau khi công bố' : 'Xem Replay ↗';
        toggle.setAttribute('aria-label', toggle.textContent);
        toggle.disabled = isCompetitorResultsUnpublished(state.currentTournament);
        headerRight.appendChild(toggle);
      }
      header.append(main, headerRight);
      card.appendChild(header);
      const details = create('div', { className: 'group-pairing-games', attrs: { id: `regional-games-${pairing.pairingId}`, ...(expanded ? {} : { hidden: 'true' }) } });
      const gameNumbers = seriesGameNumbers(pairing, progress);
      if (gameNumbers.length) {
        for (const gameNumber of gameNumbers) {
          const game = progress.games.find(gameItem => Number(gameItem.gameNumber) === gameNumber);
          details.appendChild(renderGroupGame(pairing, gameNumber, game, progress));
        }
      } else {
        details.appendChild(create('p', { className: 'knockout-detail-empty', text: 'Trận này chưa có dữ liệu series.' }));
      }
      card.appendChild(details);
      if (pairing.status === 'completed' && replayGame) toggle.addEventListener('click', () => playReplay(state.tournamentId, replayGame.matchId, pairingReplaySeriesContext(pairing, progress)));
      list.appendChild(card);
    });
    panel.appendChild(list);
  }
  const pagination = response.pagination || {};
  const paginationBar = create('div', { className: 'multi-stage-pagination' });
  const page = Number(pagination.page) || 1;
  const totalPages = Number(pagination.totalPages) || 1;
  const previous = actionButton('Trước', () => loadRegionalPairings(state.multiStage.activeStageId, state.multiStage.activeRegionId, page - 1), `regional-prev:${page}`, 'secondary-btn tournament-pagination-button');
  const next = actionButton('Sau', () => loadRegionalPairings(state.multiStage.activeStageId, state.multiStage.activeRegionId, page + 1), `regional-next:${page}`, 'secondary-btn tournament-pagination-button');
  previous.disabled = page <= 1; next.disabled = page >= totalPages;
  paginationBar.append(previous, create('span', { text: `Trang ${page}/${totalPages}` }), next);
  panel.appendChild(paginationBar);
  container.appendChild(panel);
}

function regionalSeriesProgress(pairing) {
  const progress = pairing?.seriesProgress || pairing?.matchResult?.series || {};
  return {
    ...progress,
    format: 'BO3',
    bestOf: 3,
    games: Array.isArray(progress.games) ? progress.games : [],
    winsA: Number(progress.winsA) || 0,
    winsB: Number(progress.winsB) || 0,
    nextGame: Math.min(Math.max(Number(progress.nextGame) || progress.games?.length + 1 || 1, 1), 3),
  };
}

function renderRegionalStandings(container, region) {
  const participantIds = Array.isArray(region?.participantIds) ? region.participantIds : [];
  const advancingIds = Array.isArray(region?.advancingParticipantIds) ? region.advancingParticipantIds : [];
  const participantResults = new Map((region?.participantResults || []).map(result => [result.participantId, result.status]));
  if (!participantIds.length && !advancingIds.length) return;

  const orderedIds = [...advancingIds, ...participantIds.filter(id => !advancingIds.includes(id))];
  const panel = create('section', { className: 'regional-standings-panel', attrs: { 'aria-labelledby': 'regional-standings-title' } });
  const heading = create('div', { className: 'multi-stage-section-heading' });
  heading.append(
    create('div', { className: 'multi-stage-heading-copy', children: [
      create('p', { className: 'panel-kicker', text: 'Bảng xếp hạng' }),
      create('h4', { id: 'regional-standings-title', text: regionalDisplayName(region) }),
    ] }),
    create('span', { className: 'multi-stage-pairing-count', text: `${multiStageNumber(advancingIds.length)} Bot đi tiếp` })
  );
  panel.appendChild(heading);

  const tableWrap = create('div', { className: 'group-standings-scroll', attrs: { role: 'region', 'aria-label': `Bảng xếp hạng ${regionalDisplayName(region)}`, tabindex: '0' } });
  const table = create('table', { className: 'data-table regional-standings-table' });
  const head = create('thead');
  const headRow = create('tr');
  ['Hạng', 'Bot', 'Kết quả'].forEach(label => headRow.appendChild(textCell(label, 'th')));
  head.appendChild(headRow);
  const body = create('tbody');
  table.append(head, body);
  tableWrap.appendChild(table);
  panel.appendChild(tableWrap);
  const pagination = create('div', { className: 'regional-standings-pagination', attrs: { 'aria-live': 'polite' } });
  panel.appendChild(pagination);
  const pageSize = 10;
  let page = 1;
  const renderPage = () => {
    const totalPages = Math.max(1, Math.ceil(orderedIds.length / pageSize));
    page = Math.min(page, totalPages);
    const start = (page - 1) * pageSize;
    body.replaceChildren(...orderedIds.slice(start, start + pageSize).map((participantId, offset) => {
      const index = start + offset;
      const isAdvancing = advancingIds.includes(participantId);
      const resultStatus = participantResults.get(participantId);
      const resultLabel = isAdvancing
        ? 'Đi tiếp'
        : resultStatus === 'won'
          ? 'Đã thắng trận'
          : resultStatus === 'eliminated'
            ? 'Đã dừng'
            : resultStatus === 'in_progress'
              ? 'Đang thi đấu'
              : resultStatus === 'failed'
                ? 'Trận lỗi'
                : resultStatus === 'bye'
                  ? 'Miễn đấu'
                  : 'Chờ thi đấu';
      const row = create('tr', { className: isAdvancing ? 'regional-standing-qualified' : '' });
      row.append(
        textCell(isAdvancing ? String(index + 1) : '—'),
        textCell(resolveParticipantName(state.currentTournament, participantId)),
        textCell(resultLabel)
      );
      return row;
    }));
    const previous = actionButton('Trước', () => { page -= 1; renderPage(); }, `regional-standings-prev:${page}`, 'secondary-btn tournament-pagination-button');
    const next = actionButton('Sau', () => { page += 1; renderPage(); }, `regional-standings-next:${page}`, 'secondary-btn tournament-pagination-button');
    previous.disabled = page <= 1;
    next.disabled = page >= totalPages;
    pagination.replaceChildren(previous, create('span', { text: `Trang ${page}/${totalPages}` }), next);
  };
  renderPage();
  container.appendChild(panel);
}

async function loadRegionalPairings(stageId, regionId, page = 1) {
  if (!stageId || !regionId || state.activeView !== 'tournament-detail') return;
  const multiStage = state.multiStage;
  const token = multiStage.requestToken;
  const controller = new AbortController();
  if (multiStage.pairingController) multiStage.pairingController.abort();
  multiStage.pairingController = controller;
  multiStage.activeStageId = stageId;
  multiStage.activeRegionId = regionId;
  syncRegionalCardsSelection(regionId);
  const workspace = $('#multi-stage-workspace');
  const pairingsTarget = workspace?.querySelector('.regional-pairings-slot');
  if (!pairingsTarget) return;
  clear(pairingsTarget);
  const loading = create('div', { className: 'multi-stage-inline-loading', attrs: { role: 'status' } });
  loading.append(create('span', { className: 'multi-stage-spinner', attrs: { 'aria-hidden': 'true' } }), create('span', { text: 'Đang tải lịch đấu khu vực…' }));
  pairingsTarget.appendChild(loading);
  try {
    const response = await request(`/tournaments/${state.tournamentId}/pairings?stageId=${encodeURIComponent(stageId)}&regionId=${encodeURIComponent(regionId)}&page=${page}&pageSize=10&excludeByes=true`, { signal: controller.signal });
    if (token !== multiStage.requestToken || controller.signal.aborted || state.activeView !== 'tournament-detail') return;
    multiStage.pairingPages.set(`region:${stageId}:${regionId}:${page}`, response);
    const stage = multiStage.stages?.find(item => item.stageId === stageId);
    const region = stage?.regions?.find(item => item.regionId === regionId);
    clear(pairingsTarget); renderRegionalPairings(pairingsTarget, response, region);
  } catch (error) {
    if (controller.signal.aborted) return;
    clear(pairingsTarget);
    const errorState = create('div', { className: 'multi-stage-inline-error', attrs: { role: 'alert' } });
    errorState.append(create('span', { text: error.message || 'Không thể tải lịch đấu khu vực.' }), actionButton('Thử lại', () => loadRegionalPairings(stageId, regionId, page), `regional-retry:${stageId}:${regionId}:${page}`, 'secondary-btn'));
    pairingsTarget.appendChild(errorState);
  }
}

function groupExpectedMatches(participantCount) {
  const count = Number(participantCount) || 0;
  return count > 1 ? (count * (count - 1)) / 2 : 0;
}

function groupDisplayName(group) {
  const raw = String(group?.name || group?.groupId || 'Bảng đấu');
  const match = raw.match(/^Group\s+(.+)$/i);
  return match ? `B\u1ea3ng ${match[1]}` : raw;
}

function groupStandingsConfirmed(group) {
  const standings = Array.isArray(group?.standings) ? group.standings : [];
  const required = Math.min(Number(group.participantCount) || 0, 2);
  return required >= 2 && group?.status === 'completed' && standings.length >= required;
}

function syncGroupCardsSelection(activeGroupId) {
  const workspace = $('#multi-stage-workspace');
  if (!workspace) return;
  const cards = workspace.querySelectorAll('.group-stage-card');
  cards.forEach(card => {
    const isSelected = card.getAttribute('data-multi-stage-focus') === `group:${activeGroupId}`;
    card.classList.toggle('is-selected', isSelected);
    card.setAttribute('aria-pressed', String(isSelected));
    const actionLink = card.querySelector('.group-stage-action-link');
    if (actionLink) {
      actionLink.textContent = isSelected ? '✓ Đang xem bảng đấu này' : 'Xem bảng đấu →';
    }
    const badges = card.querySelector('.group-card-badges');
    if (badges) {
      let badge = badges.querySelector('.group-selected-badge');
      if (isSelected) {
        if (!badge) {
          badge = create('span', { className: 'group-selected-badge', text: '✓ Đang xem' });
          badges.prepend(badge);
        }
      } else if (badge) {
        badge.remove();
      }
    }
  });
}

function renderGroupCard(group, stageId, selectedGroupId) {
  const progress = multiStagePairingStats(group.progress);
  const active = group.groupId === selectedGroupId;
  const expectedMatches = progress.total || groupExpectedMatches(group.participantCount);
  const confirmed = groupStandingsConfirmed(group);
  const card = create('button', { className: `group-stage-card${active ? ' is-selected' : ''}`, type: 'button', attrs: { 'aria-pressed': String(active), 'data-multi-stage-focus': `group:${group.groupId}` } });
  const top = create('span', { className: 'group-stage-card-top' });
  top.append(create('strong', { text: groupDisplayName(group) }));
  const badgeWrap = create('span', { className: 'group-card-badges' });
  if (active) {
    badgeWrap.appendChild(create('span', { className: 'group-selected-badge', text: '✓ Đang xem' }));
  }
  badgeWrap.appendChild(create('span', { className: `stage-status stage-status-${safeStatusClass(group.status)}`, text: multiStageStatusLabel(group.status) }));
  top.appendChild(badgeWrap);
  card.appendChild(top);
  const details = create('span', { className: 'group-stage-card-details' });
  details.append(create('span', { text: `${multiStageNumber(group.participantCount)} Bot` }), create('span', { text: `${multiStageNumber(progress.completed)}/${multiStageNumber(expectedMatches)} trận` }));
  card.appendChild(details);
  const track = create('span', { className: 'group-stage-track', attrs: { 'aria-hidden': 'true' } });
  const fill = create('span'); fill.style.width = `${expectedMatches ? Math.min(100, (progress.completed / expectedMatches) * 100) : 0}%`; track.appendChild(fill); card.appendChild(track);
  const groupActionLink = create('span', { className: 'group-stage-action-link', text: 'Xem bảng đấu →' });
  if (active) groupActionLink.textContent = '✓ Đang xem bảng đấu này';
  card.append(groupActionLink);

  card.addEventListener('click', () => {
    state.multiStage.activeStageId = stageId;
    if (active) {
      state.multiStage.activeGroupId = null;
      state.multiStage.expandedGroupPairings?.clear();
      state.multiStage.pairingController?.abort();
      state.multiStage.pairingController = null;
    } else {
      state.multiStage.activeGroupId = group.groupId;
    }
    renderMultiStageWorkspace();
  });
  return card;
}

function groupStandingsRows(group, pairings = []) {
  const standings = Array.isArray(group?.standings) ? group.standings : [];
  if (standings.length) {
    return standings.map(standing => ({
      ...standing,
      participantName: resolveParticipantName(
        state.currentTournament,
        standing.participantId || standing.participantName
      ),
    }));
  }

  // Planned slot ids are not standings. Only render fallback rows when the
  // API returned real group pairings; otherwise show the pending empty state.
  const participantIds = [...new Set((pairings || [])
    .filter(pairing => pairing?.participantB != null && pairing?.status !== 'bye')
    .flatMap(pairing => [pairing.participantA, pairing.participantB])
    .filter(Boolean))];
  return participantIds.map(participantId => {
    const participant = state.currentTournament?.participants?.find(item => item.participantId === participantId);
    const pairing = (pairings || []).find(item => item.participantA === participantId || item.participantB === participantId);
    const participantName = participant?.name
      || (pairing?.participantA === participantId ? pairing.participantNames?.A : pairing?.participantNames?.B)
      || resolveParticipantName(state.currentTournament, participantId);
    const displayName = /^Region-\d+-Q\d+$/i.test(participantName)
      ? resolveParticipantName(state.currentTournament, participantName)
      : participantName;
    return { participantId, participantName: displayName, matchesPlayed: 0, wins: 0, draws: 0, losses: 0, points: 0 };
  });
}

function formatStandingDifference(standing) {
  const difference = (Number(standing?.wins) || 0) - (Number(standing?.losses) || 0);
  return difference > 0 ? `+${difference}` : String(difference);
}

function renderGroupStandings(container, group, pairings = []) {
  const panel = create('section', { className: 'group-standings-panel', attrs: { 'aria-labelledby': 'group-standings-title' } });
  const heading = create('div', { className: 'multi-stage-section-heading' });
  const copy = create('div', { className: 'multi-stage-heading-copy' });
  copy.append(create('p', { className: 'panel-kicker', text: 'Bảng xếp hạng' }), create('h3', { id: 'group-standings-title', text: groupDisplayName(group) }));
  heading.append(copy, create('span', { className: 'multi-stage-pairing-count', text: '2 vị trí đầu đi tiếp' }));
  panel.appendChild(heading);
  const standings = groupStandingsRows(group, pairings);
  if (!standings.length) {
    const empty = create('div', { className: 'multi-stage-empty' });
    empty.append(icon('td-icon-trophy'), create('strong', { text: 'Chưa có dữ liệu xếp hạng' }), create('span', { text: 'Bảng xếp hạng sẽ hiển thị khi vòng loại khu vực hoàn tất và lịch thi đấu của bảng được tạo.' }));
    empty.querySelector('svg')?.classList.add('td-icon', 'td-icon--lg');
    panel.appendChild(empty);
    container.appendChild(panel);
    return;
  }
  const confirmed = groupStandingsConfirmed(group);
  const tableWrap = create('div', { className: 'group-standings-scroll', attrs: { role: 'region', 'aria-label': `Bảng xếp hạng ${groupDisplayName(group)}`, tabindex: '0' } });
  const table = create('table', { className: 'data-table group-standings-table' });
  const head = create('thead');
  const headRow = create('tr');
  ['Hạng', 'Bot', 'Trận', 'Thắng', 'Hòa', 'Thua', 'Hiệu số', 'Điểm'].forEach(label => {
    const cell = textCell(label, 'th');
    if (label === 'Hiệu số') cell.title = 'Số trận thắng trừ số trận thua';
    headRow.appendChild(cell);
  });
  head.appendChild(headRow);
  const body = create('tbody');
  standings.forEach((standing, index) => {
    const rank = index + 1;
    const row = create('tr', { className: confirmed && rank <= 2 ? 'group-standing-qualified' : '' });
    row.append(textCell(String(rank)), textCell(standing.participantName || 'Bot chưa công bố'), textCell(standing.matchesPlayed), textCell(standing.wins), textCell(standing.draws), textCell(standing.losses), textCell(formatStandingDifference(standing)), textCell(standing.points));
    if (confirmed && rank <= 2) row.setAttribute('aria-label', `${standing.participantName || 'Bot'} — vị trí ${rank} đi tiếp`);
    body.appendChild(row);
  });
  table.append(head, body); tableWrap.appendChild(table); panel.appendChild(tableWrap);
  if (!confirmed) panel.appendChild(create('p', { className: 'group-standings-note', text: 'Chưa có kết quả chính thức; thứ hạng sẽ cập nhật sau khi các trận đấu được ghi nhận.' }));
  container.appendChild(panel);
}

function createChevronIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('group-pairing-chevron');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm6 9 6 6 6-6');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

function groupSeriesProgress(pairing) {
  const progress = pairing?.seriesProgress;
  // Group Stage is always BO2. Keep this stage-specific contract authoritative
  // even if an older/inconsistent payload contains a stale BO3 format label.
  const bestOf = 2;
  const format = 'BO2';
  const games = Array.isArray(progress?.games) ? progress.games : [];
  return {
    ...progress,
    format,
    bestOf,
    games,
    winsA: Number(progress?.winsA) || 0,
    winsB: Number(progress?.winsB) || 0,
    nextGame: Math.min(Math.max(Number(progress?.nextGame) || games.length + 1, 1), bestOf),
  };
}

function groupSeriesSupportingText(pairing, progress) {
  if (!progress) return 'Chưa thi đấu';
  const winsA = progress.winsA || 0;
  const winsB = progress.winsB || 0;
  const draws = seriesDrawCount(progress);
  const maxWins = Math.max(winsA, winsB);
  const minWins = Math.min(winsA, winsB);

  if (pairing?.status !== 'completed') {
    if (maxWins === 0 && minWins === 0 && draws === 0) {
      return pairing?.status === 'in_progress' ? 'Đang diễn ra' : 'Chưa thi đấu';
    }
    if (pairing?.status === 'in_progress') {
      if (draws > 0 && maxWins === 0) return `${draws} hòa · Đang diễn ra`;
      if (maxWins > 0 && minWins === 0 && draws === 0) return `${maxWins} thắng · Đang diễn ra`;
      return 'Đang diễn ra';
    }
  }

  if (maxWins > 0 && minWins > 0) {
    return `${maxWins} thắng · ${minWins} thua${draws ? ` · ${draws} hòa` : ''}`;
  }
  if (maxWins > 0 && minWins === 0) {
    return `${maxWins} thắng${draws ? ` · ${draws} hòa` : ''}`;
  }
  if (draws > 0) {
    return `${draws} hòa`;
  }
  return 'Chưa thi đấu';
}

function seriesGameNumbers(pairing, progress) {
  const numbers = new Set((progress?.games || [])
    .map(game => Number(game?.gameNumber))
    .filter(number => Number.isInteger(number) && number > 0 && number <= progress.bestOf));
  if (pairing?.status === 'in_progress' && progress?.nextGame) {
    numbers.add(progress.nextGame);
  }
  return [...numbers].sort((a, b) => a - b);
}

function latestReplayGame(progress) {
  return [...(progress?.games || [])].reverse().find(game => game?.matchId && game.replayAvailable !== false) || null;
}

function seriesHasStarted(pairing, progress) {
  return pairing?.status === 'in_progress'
    || pairing?.status === 'completed'
    || (progress?.games || []).length > 0;
}

function appendSeriesViewerAction(headerRight, pairing, progress, keyPrefix) {
  if (isCompetitorResultsUnpublished(state.currentTournament) && pairing?.status === 'completed') return;
  if (pairing?.status === 'in_progress' && pairing.matchId) {
    headerRight.appendChild(actionButton('Live ●', () => openLiveMatch(state.tournamentId, pairing.matchId, pairing.pairingId), `${keyPrefix}:live:${pairing.pairingId}`, 'group-game-action-btn secondary-btn'));
    return;
  }
  if (pairing?.status !== 'completed') return;
  const replayGame = latestReplayGame(progress);
  if (replayGame) {
    headerRight.appendChild(actionButton('Xem Replay ↗', () => playReplay(state.tournamentId, replayGame.matchId, pairingReplaySeriesContext(pairing, progress)), `${keyPrefix}:replay:${replayGame.matchId}`, 'group-game-action-btn secondary-btn'));
  }
}

function renderGroupGame(pairing, gameNumber, game, progress) {
  const status = knockoutGameStatus(pairing, gameNumber, game, progress);
  const row = create('div', { className: `group-game-row is-${status}` });
  const info = create('div', { className: 'group-game-info' });
  info.append(create('strong', { className: 'group-game-title', text: `Ván ${gameNumber}` }));
  if (isCompetitorResultsUnpublished(state.currentTournament) && status === 'completed') {
    info.appendChild(create('span', { className: 'group-game-result', text: 'Kết quả chưa được công bố.' }));
    row.appendChild(info);
    return row;
  }
  const sides = game?.participantNames || {
    A: knockoutSlotLabel(pairing, 'A'),
    B: knockoutSlotLabel(pairing, 'B'),
  };
  let resultText = 'Chưa bắt đầu';
  if (game?.winner === 'draw') {
    resultText = 'Hòa';
  } else if (game?.winner === 'A') {
    resultText = `${sides.A} thắng`;
  } else if (game?.winner === 'B') {
    resultText = `${sides.B} thắng`;
  } else if (status === 'in_progress') {
    resultText = 'Đang thi đấu';
  } else if (status === 'completed') {
    resultText = 'Đã xong';
  }
  info.appendChild(create('span', { className: 'group-game-result', text: resultText }));
  row.appendChild(info);

  const actions = create('div', { className: 'group-game-actions' });
  if (status === 'in_progress' && pairing.matchId) {
    actions.appendChild(actionButton('Live ●', () => openLiveMatch(state.tournamentId, pairing.matchId, pairing.pairingId), `group-game-live:${pairing.pairingId}:${gameNumber}`, 'group-game-action-btn secondary-btn'));
  } else if (status === 'completed' && game?.matchId && game?.replayAvailable !== false) {
    actions.appendChild(actionButton('Replay ↗', () => playReplay(state.tournamentId, game.matchId, pairingReplaySeriesContext(pairing, progress)), `group-game-replay:${game.matchId}`, 'group-game-action-btn secondary-btn'));
  } else if (status === 'completed') {
    actions.appendChild(create('span', { className: 'group-game-unavailable', text: 'Replay chưa có' }));
  }
  if (actions.childElementCount) row.appendChild(actions);
  return row;
}

function renderGroupPairings(container, response, group) {
  const panel = create('section', { className: 'group-pairings-panel', attrs: { 'aria-labelledby': 'group-pairings-title' } });
  const heading = create('div', { className: 'multi-stage-section-heading' });
  const copy = create('div', { className: 'multi-stage-heading-copy' });
  copy.append(create('p', { className: 'panel-kicker', text: 'Lịch thi đấu bảng' }), create('h3', { id: 'group-pairings-title', text: groupDisplayName(group) }));
  heading.append(copy, create('span', { className: 'multi-stage-pairing-count', text: `${multiStageNumber(response.pagination?.totalItems)} trận` }));
  panel.appendChild(heading);
  const pairings = (response.pairings || []).filter(pairing => pairing.participantB !== null && pairing.status !== 'bye');
  if (!pairings.length) {
    const empty = create('div', { className: 'multi-stage-empty' });
    empty.append(icon('td-icon-calendar-days'), create('strong', { text: 'Chưa có trận đấu' }), create('span', { text: 'Lịch đấu sẽ xuất hiện khi bảng bắt đầu.' }));
    empty.querySelector('svg')?.classList.add('td-icon', 'td-icon--lg');
    panel.appendChild(empty);
  } else {
    const list = create('div', { className: 'group-pairing-list' });
    if (!state.multiStage.expandedGroupPairings) {
      state.multiStage.expandedGroupPairings = new Set();
    }
    pairings.forEach(pairing => {
      const card = create('article', { className: 'group-pairing-card', attrs: { 'data-pairing-id': pairing.pairingId } });
      const progress = groupSeriesProgress(pairing);

      const header = create('div', { className: 'group-pairing-card-header' });
      const main = create('div', { className: 'group-pairing-main' });

      const names = create('div', { className: 'group-pairing-names' });
      const playerAName = pairing.participantNames?.A || knockoutSlotLabel(pairing, 'A');
      const playerBName = pairing.participantNames?.B || knockoutSlotLabel(pairing, 'B');
      names.append(
        create('strong', { className: 'group-pairing-player', text: playerAName }),
        create('span', { className: 'group-pairing-vs', text: 'vs' }),
        create('strong', { className: 'group-pairing-player', text: playerBName })
      );

      const meta = create('div', { className: 'group-pairing-meta' });
      meta.append(
        create('span', { className: 'group-series-pill', text: progress.format }),
      );
      main.append(names, meta, create('span', { className: 'group-series-score', text: seriesHasStarted(pairing, progress) ? `Tỉ số ${progress.winsA || 0}–${progress.winsB || 0}` : 'Chưa thi đấu' }));

      const headerRight = create('div', { className: 'group-pairing-header-right' });
      headerRight.appendChild(statusBadge(pairing.status));

      const isExpanded = false;
      const toggle = create('button', {
        className: 'group-pairing-toggle secondary-btn',
        type: 'button',
        attrs: {
          'aria-expanded': String(isExpanded),
          'aria-controls': `group-games-${pairing.pairingId}`,
          'aria-label': `Chi tiết các ván cho trận ${pairing.pairingId}`,
        },
      });
      toggle.append(
        create('span', { text: 'Chi tiết các ván' }),
        createChevronIcon()
      );

      const replayGame = latestReplayGame(progress);
      if (pairing.status === 'completed' && replayGame) {
        toggle.textContent = 'Xem Replay ↗';
        toggle.setAttribute('aria-label', 'Xem Replay');
        headerRight.appendChild(toggle);
      }
      header.append(main, headerRight);
      card.appendChild(header);

      const details = create('div', {
        className: 'group-pairing-games',
        attrs: {
          id: `group-games-${pairing.pairingId}`,
          ...(isExpanded ? {} : { hidden: 'true' }),
        },
      });

      for (const gameNumber of seriesGameNumbers(pairing, progress)) {
        const game = progress.games.find(g => Number(g.gameNumber) === gameNumber);
        details.appendChild(renderGroupGame(pairing, gameNumber, game, progress));
      }
      card.appendChild(details);

      if (pairing.status === 'completed' && replayGame) toggle.addEventListener('click', () => playReplay(state.tournamentId, replayGame.matchId, pairingReplaySeriesContext(pairing, progress)));

      list.appendChild(card);
    });
    panel.appendChild(list);
  }
  const pagination = response.pagination || {};
  const page = Number(pagination.page) || 1;
  const totalPages = Number(pagination.totalPages) || 1;
  const paginationBar = create('div', { className: 'multi-stage-pagination' });
  const previous = actionButton('Trước', () => loadGroupPairings(state.multiStage.activeStageId, state.multiStage.activeGroupId, page - 1), `group-prev:${group?.groupId}:${page}`, 'secondary-btn tournament-pagination-button');
  const next = actionButton('Sau', () => loadGroupPairings(state.multiStage.activeStageId, state.multiStage.activeGroupId, page + 1), `group-next:${group?.groupId}:${page}`, 'secondary-btn tournament-pagination-button');
  previous.disabled = page <= 1; next.disabled = page >= totalPages;
  paginationBar.append(previous, create('span', { text: `Trang ${page}/${totalPages}` }), next); panel.appendChild(paginationBar);
  container.appendChild(panel);
}

async function loadGroupPairings(stageId, groupId, page = 1) {
  if (!stageId || !groupId || state.activeView !== 'tournament-detail') return;
  const multiStage = state.multiStage;
  const token = multiStage.requestToken;
  const controller = new AbortController();
  if (multiStage.pairingController) multiStage.pairingController.abort();
  multiStage.pairingController = controller;
  multiStage.activeStageId = stageId;
  multiStage.activeGroupId = groupId;
  syncGroupCardsSelection(groupId);
  const workspace = $('#multi-stage-workspace');
  const target = workspace?.querySelector('.group-stage-detail-slot');
  if (!target) return;
  clear(target);
  const loading = create('div', { className: 'multi-stage-inline-loading', attrs: { role: 'status' } });
  loading.append(create('span', { className: 'multi-stage-spinner', attrs: { 'aria-hidden': 'true' } }), create('span', { text: 'Đang tải bảng xếp hạng và lịch đấu…' }));
  target.appendChild(loading);
  try {
    const response = await request(`/tournaments/${state.tournamentId}/pairings?stageId=${encodeURIComponent(stageId)}&groupId=${encodeURIComponent(groupId)}&page=${page}&pageSize=10&excludeByes=true`, { signal: controller.signal });
    if (token !== multiStage.requestToken || controller.signal.aborted || state.activeView !== 'tournament-detail') return;
    multiStage.pairingPages.set(`group:${stageId}:${groupId}:${page}`, response);
    const stage = multiStage.stages?.find(item => item.stageId === stageId);
    const group = stage?.groups?.find(item => item.groupId === groupId);
    clear(target);
    if (group && !isCompetitorResultsUnpublished(state.currentTournament)) renderGroupStandings(target, group, response.pairings || []);
    else if (isCompetitorResultsUnpublished(state.currentTournament)) target.appendChild(unpublishedResultsNotice());
    renderGroupPairings(target, response, group);
  } catch (error) {
    if (controller.signal.aborted) return;
    clear(target);
    const errorState = create('div', { className: 'multi-stage-inline-error', attrs: { role: 'alert' } });
    errorState.append(create('span', { text: error.message || 'Không thể tải dữ liệu bảng đấu.' }), actionButton('Thử lại', () => loadGroupPairings(stageId, groupId, page), `group-retry:${stageId}:${groupId}:${page}`, 'secondary-btn'));
    target.appendChild(errorState);
  }
}

function renderGroupStage(container, stage) {
  const section = create('section', { className: 'group-stage-view', attrs: { 'aria-labelledby': 'group-stage-title' } });
  const heading = create('div', { className: 'multi-stage-section-heading group-stage-heading' });
  const copy = create('div', { className: 'multi-stage-heading-copy' });
  copy.append(create('p', { className: 'panel-kicker', text: 'Giai đoạn hiện tại' }), create('h3', { id: 'group-stage-title', text: multiStageName(stage) || 'Vòng bảng' }), create('p', { className: 'multi-stage-supporting-copy', text: 'Theo dõi cục diện các bảng đấu cùng hai bot giành quyền đi tiếp.' }));
  heading.append(copy); section.appendChild(heading);
  const groups = stage?.groups || [];
  if (!groups.length) {
    const empty = create('div', { className: 'multi-stage-empty' });
    empty.append(icon('td-icon-trophy'), create('strong', { text: 'Chưa có bảng đấu' }), create('span', { text: 'Các bảng sẽ xuất hiện khi vòng loại khu vực hoàn tất và giai đoạn được mở.' }));
    empty.querySelector('svg')?.classList.add('td-icon', 'td-icon--lg'); section.appendChild(empty);
  } else {
    const grid = create('div', { className: 'group-stage-grid' });
    groups.forEach(group => grid.appendChild(renderGroupCard(group, stage.stageId, state.multiStage.activeGroupId)));
    section.appendChild(grid); section.appendChild(create('div', { className: 'group-stage-detail-slot' }));
  }
  container.appendChild(section);
}

function knockoutPairingCacheKey(stageId, page) {
  return `knockout:${stageId}:${page}`;
}

function getKnockoutPairings(stageId) {
  const pairings = new Map();
  state.multiStage.pairingPages.forEach((response, key) => {
    if (!key.startsWith(`knockout:${stageId}:`)) return;
    (response.pairings || []).forEach(pairing => pairings.set(pairing.pairingId, pairing));
  });
  return [...pairings.values()];
}

function captureMultiStageFocus() {
  const workspace = $('#multi-stage-workspace');
  const active = document.activeElement;
  if (!workspace?.contains(active)) return null;
  const key = active?.getAttribute('data-multi-stage-focus');
  return key ? { key } : null;
}

function restoreMultiStageFocus(focus) {
  if (!focus) return;
  const target = [...document.querySelectorAll('[data-multi-stage-focus]')]
    .find(element => element.getAttribute('data-multi-stage-focus') === focus.key);
  if (target instanceof HTMLElement) target.focus({ preventScroll: true });
}

function knockoutSlotLabel(pairing, side) {
  const slot = pairing?.[`slot${side}`];
  const raw = pairing?.[`participant${side}`] || slot?.placeholder;
  const named = pairing?.participantNames?.[side];
  if (!raw) return 'Miễn đấu';
  if (named && named !== raw && named !== 'Miễn đấu') return named;
  const seed = knockoutParticipantSeed(pairing, side);
  if (seed) return seed;
  const winnerReference = String(raw).match(/^winner\(([^)]+)\)$|^(.+)-winner$/i);
  if (winnerReference) {
    const upstreamPairingId = slot?.sourceRef?.pairingId || winnerReference[1] || winnerReference[2];
    const matchCode = knockoutMatchCode(upstreamPairingId);
    return matchCode ? `Thắng ${matchCode}` : `Thắng ${upstreamPairingId}`;
  }
  return named || 'Bot chưa công bố';
}

function knockoutMatchCode(pairingId, sourceStage = null) {
  const match = String(pairingId || '').match(/^KO-r(\d+)-m(\d+)$/i);
  if (!match) return null;
  const roundNumber = Number(match[1]);
  const matchNumber = Number(match[2]);
  const ids = [];
  const collect = stages => (stages || []).filter(stage => stage.stageType === 'knockout').forEach(stage => {
    (stage.rounds || []).forEach(round => (round.pairings || []).forEach(pairing => ids.push(pairing.pairingId)));
  });
  if (sourceStage) collect([sourceStage]);
  collect(state.currentTournament?.stages);
  collect(state.multiStage?.stages);
  state.multiStage?.pairingPages?.forEach(response => (response.pairings || []).forEach(pairing => {
    if (String(pairing.pairingId || '').startsWith('KO-')) ids.push(pairing.pairingId);
  }));
  const maxRound = Math.max(...ids.map(id => Number(String(id).match(/^KO-r(\d+)-/i)?.[1]) || 0), roundNumber);
  const roundsFromFinal = maxRound - roundNumber;
  if (roundsFromFinal === 0) return matchNumber === 1 ? 'CK' : `CK${matchNumber}`;
  if (roundsFromFinal === 1) return `BK${matchNumber}`;
  if (roundsFromFinal === 2) return `TK${matchNumber}`;
  return `V${2 ** (roundsFromFinal + 1)}-${matchNumber}`;
}

function knockoutWinnerLabel(pairing) {
  const winner = pairing?.matchResult?.winner;
  if (winner === 'A' || winner === 'B') return knockoutSlotLabel(pairing, winner);
  if (winner === 'draw' || pairing?.status === 'pending_tiebreaker') return 'Hòa · chờ phân định';
  return 'Chưa xác định';
}

function knockoutRoundTitle(roundNumber, pairings, maxRound) {
  const roundsFromFinal = maxRound - roundNumber;
  if (roundsFromFinal === 0) return pairings.length === 1 ? 'Chung kết' : 'Vòng cuối';
  if (roundsFromFinal === 1) return 'Bán kết';
  if (roundsFromFinal === 2) return 'Tứ kết';
  return `Vòng 1/${2 ** roundsFromFinal}`;
}

function knockoutSeriesProgress(pairing) {
  const progress = pairing?.seriesProgress;
  if (!progress) return null;
  const bestOf = Number(progress.bestOf) === 2 ? 2 : 3;
  const games = Array.isArray(progress.games) ? progress.games : [];
  return {
    ...progress,
    bestOf,
    games,
    winsA: Number(progress.winsA) || 0,
    winsB: Number(progress.winsB) || 0,
    nextGame: Math.min(Math.max(Number(progress.nextGame) || games.length + 1, 1), bestOf),
  };
}

function seriesFormatLabel(progress) {
  return progress?.format?.toUpperCase() || `BO${progress?.bestOf || 3}`;
}

function seriesDrawCount(progress) {
  return (progress?.games || []).filter(game => game?.winner === 'draw' || game?.winnerParticipantId === null).length;
}

function seriesScoreLabel(progress) {
  const draws = seriesDrawCount(progress);
  return `${progress?.winsA || 0}–${progress?.winsB || 0}${draws ? ` · ${draws} hòa` : ''}`;
}

function pairingReplaySeriesContext(pairing, progress, tournament = null) {
  const rawNames = pairing?.participantNames || {};
  const names = {
    A: rawNames.A || knockoutParticipantName(pairing, 'A', tournament || state.currentTournament),
    B: rawNames.B || knockoutParticipantName(pairing, 'B', tournament || state.currentTournament),
  };
  return {
    format: seriesFormatLabel(progress),
    bestOf: progress.bestOf,
    winsA: progress.winsA,
    winsB: progress.winsB,
    games: progress.games,
    winner: pairing?.matchResult?.winner,
    participantIdentities: {
      A: { participantId: pairing?.participantA, participantName: names.A },
      B: { participantId: pairing?.participantB, participantName: names.B },
    },
    matchId: pairing?.matchId,
  };
}

function knockoutGameStatus(pairing, gameNumber, game, progress) {
  if (game) return game.winner === null || game.winner === undefined ? 'pending' : 'completed';
  if (pairing?.status === 'in_progress' && gameNumber === progress?.nextGame) return 'in_progress';
  return 'pending';
}

function knockoutGameWinnerSide(pairing, game) {
  if (game?.winnerParticipantId && game.winnerParticipantId === pairing?.participantA) return 'A';
  if (game?.winnerParticipantId && game.winnerParticipantId === pairing?.participantB) return 'B';
  return game?.winner;
}

function knockoutGameLabel(status) {
  return status === 'completed' ? 'Đã xong' : status === 'in_progress' ? 'Trực tiếp' : 'Chưa bắt đầu';
}

function renderKnockoutGame(pairing, gameNumber, game, progress) {
  const tournament = arguments[4] || null;
  const status = knockoutGameStatus(pairing, gameNumber, game, progress);
  const row = create('div', { className: `knockout-game-row is-${status}` });
  const gameTitle = create('div', { className: 'knockout-game-title' });
  gameTitle.append(create('strong', { text: `Ván ${gameNumber}` }), create('span', { className: 'knockout-game-status', text: knockoutGameLabel(status) }));
  const sides = {
    A: game?.participantNames?.A || knockoutParticipantName(pairing, 'A', tournament),
    B: game?.participantNames?.B || knockoutParticipantName(pairing, 'B', tournament),
  };
  const winnerSide = knockoutGameWinnerSide(pairing, game);
  const result = winnerSide === 'draw' ? 'Hòa' : winnerSide === 'A' ? sides.A : winnerSide === 'B' ? sides.B : status === 'in_progress' ? 'Đang thi đấu' : 'Chờ kết quả';
  const detail = create('span', { className: 'knockout-game-result', text: result });
  row.append(gameTitle, detail);
  const actions = create('div', { className: 'knockout-game-actions' });
  if (status === 'in_progress' && pairing.matchId) {
    actions.appendChild(actionButton('Live', () => openLiveMatch(state.tournamentId, pairing.matchId, pairing.pairingId), `knockout-game-live:${pairing.pairingId}:${gameNumber}`, 'secondary-btn'));
  } else if (status === 'completed' && game?.matchId && game?.replayAvailable !== false) {
    actions.appendChild(actionButton('Replay', () => playReplay(state.tournamentId, game.matchId, pairingReplaySeriesContext(pairing, progress, tournament || state.currentTournament)), `knockout-game-replay:${game.matchId}`, 'secondary-btn'));
  } else if (status === 'completed') {
    actions.appendChild(create('span', { className: 'knockout-game-unavailable', text: 'Replay chưa có' }));
  }
  if (actions.childElementCount) row.appendChild(actions);
  return row;
}

function knockoutParticipantSeed(pairing, side) {
  const slot = pairing?.[`slot${side}`];
  const placeholder = String(slot?.placeholder || pairing?.[`participant${side}`] || '');
  const match = placeholder.match(/^(1st|2nd|3rd|4th)-Group-(.+)$/i);
  if (match) {
    const ordinal = { '1st': 'Nhất', '2nd': 'Nhì', '3rd': 'Ba', '4th': 'Tư' }[match[1].toLowerCase()] || match[1];
    return `${ordinal} ${match[2]}`;
  }
  if (slot?.sourceRef?.groupId && slot?.sourceRef?.rank) {
    const ordinal = { 1: 'Nhất', 2: 'Nhì', 3: 'Ba', 4: 'Tư' }[slot.sourceRef.rank] || `Hạng ${slot.sourceRef.rank}`;
    const groupLabel = String(slot.sourceRef.groupId).replace(/^(Group[-_\s]*)/i, '');
    return `${ordinal} ${groupLabel}`;
  }
  const participantId = pairing?.[`participant${side}`];
  if (participantId && typeof state !== 'undefined' && state.multiStage?.stages) {
    for (const stage of state.multiStage.stages) {
      if (stage.groups && Array.isArray(stage.groups)) {
        for (const group of stage.groups) {
          const standing = (group.standings || []).find(s => s.participantId === participantId);
          if (standing && standing.rank) {
            const ordinal = { 1: 'Nhất', 2: 'Nhì', 3: 'Ba', 4: 'Tư' }[standing.rank] || `Hạng ${standing.rank}`;
            const groupLabel = group.name?.replace(/^Bảng\s*/i, '').replace(/^Group\s*/i, '') || group.groupId?.replace(/^Group-?/i, '') || '';
            if (groupLabel) {
              return `${ordinal} ${groupLabel}`;
            }
          }
        }
      }
    }
  }
  return '';
}

function knockoutSourceParticipantName(pairing, side, tournament = null) {
  const slot = pairing?.[`slot${side}`];
  const placeholder = String(slot?.placeholder || pairing?.[`participant${side}`] || '');
  const sourceGroupId = slot?.sourceRef?.groupId;
  const sourceRank = Number(slot?.sourceRef?.rank)
    || ({ '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 }[placeholder.match(/^(1st|2nd|3rd|4th)-Group-/i)?.[1]?.toLowerCase()] || 0);
  const groupToken = sourceGroupId || placeholder.match(/^(?:1st|2nd|3rd|4th)-Group-(.+)$/i)?.[1];
  if (!groupToken || !sourceRank) return null;

  const stages = [
    ...(tournament?.stages || []),
    ...(state.currentTournament?.stages || []),
    ...(state.multiStage?.stages || []),
  ];
  for (const stage of stages) {
    for (const group of stage.groups || []) {
      const groupId = String(group.groupId || '').replace(/^Group[-_\s]*/i, '').toLowerCase();
      const groupName = String(group.name || '').replace(/^(?:Group|Bảng)[-\s]*/i, '').toLowerCase();
      const token = String(groupToken).replace(/^Group[-_\s]*/i, '').toLowerCase();
      if (groupId !== token && groupName !== token && group.groupId !== groupToken) continue;
      const standing = (group.standings || []).find(item => Number(item.rank) === sourceRank) || group.standings?.[sourceRank - 1];
      if (!standing) continue;
      return standing.participantName || resolveParticipantName(tournament || state.currentTournament || {}, standing.participantId);
    }
  }
  return null;
}

function findKnockoutPairing(tournament, pairingId) {
  const stages = [
    ...(tournament?.stages || []),
    ...(state.currentTournament?.stages || []),
    ...(state.multiStage?.stages || []),
  ];
  for (const stage of stages) {
    for (const round of stage.rounds || []) {
      const pairing = (round.pairings || []).find(item => item?.pairingId === pairingId);
      if (pairing) return pairing;
    }
    const pairing = (stage.pairings || []).find(item => item?.pairingId === pairingId);
    if (pairing) return pairing;
  }
  for (const response of state.multiStage?.pairingPages?.values?.() || []) {
    const pairing = (response?.pairings || []).find(item => item?.pairingId === pairingId);
    if (pairing) return pairing;
  }
  return null;
}

function knockoutParticipantName(pairing, side, tournament = null, visited = new Set()) {
  const raw = pairing?.[`participant${side}`];
  const named = pairing?.participantNames?.[side];
  if (named && named !== raw && named !== 'Bot chưa công bố') return named;
  const winnerReference = String(raw || '').match(/^winner\(([^)]+)\)$|^(.+)-winner$/i);
  if (winnerReference) {
    const upstreamPairingId = pairing?.[`slot${side}`]?.sourceRef?.pairingId || winnerReference[1] || winnerReference[2];
    if (upstreamPairingId && !visited.has(upstreamPairingId)) {
      const upstream = findKnockoutPairing(tournament, upstreamPairingId);
      const winnerSide = upstream?.matchResult?.winner;
      if (upstream && (winnerSide === 'A' || winnerSide === 'B')) {
        const nextVisited = new Set(visited);
        nextVisited.add(upstreamPairingId);
        return knockoutParticipantName(upstream, winnerSide, tournament, nextVisited);
      }
    }
  }
  if (raw && !/^winner\(/i.test(String(raw)) && !/-winner$/i.test(String(raw))) {
    const resolved = resolveParticipantName(tournament || state.currentTournament || {}, raw, pairing?.[`slot${side}`]);
    if (resolved && resolved !== raw && !/^Bot \(/.test(resolved)) return resolved;
  }
  const sourceName = knockoutSourceParticipantName(pairing, side, tournament);
  if (sourceName) return sourceName;
  return knockoutSlotLabel(pairing, side);
}

function knockoutParticipantScore(pairing, side, progress) {
  if (progress) return side === 'A' ? (Number(progress.winsA) || 0) : (Number(progress.winsB) || 0);
  if (pairing?.matchResult?.series) {
    return side === 'A' ? (Number(pairing.matchResult.series.winsA) || 0) : (Number(pairing.matchResult.series.winsB) || 0);
  }
  return pairing?.matchResult?.winner === side ? 1 : 0;
}

function renderKnockoutMatch(pairing) {
  const winner = pairing?.matchResult?.winner;
  const progress = knockoutSeriesProgress(pairing);
  const isSelected = state.multiStage.activeKnockoutPairingId === pairing.pairingId;
  const matchCode = knockoutMatchCode(pairing.pairingId) || pairing.pairingId;
  const pair = create('div', {
    className: `knockout-match-node knockout-match-pair knockout-match-${safeStatusClass(pairing.status)}${isSelected ? ' is-selected-pair' : ''}`,
    attrs: {
      role: 'group',
      'aria-label': `Trận ${matchCode || ''}`.trim(),
      'data-pairing-id': String(pairing.pairingId || ''),
    },
  });
  pair.appendChild(create('span', { className: 'knockout-match-code', text: matchCode }));
  pair.dataset.pairingId = String(pairing.pairingId || '');
  pair.dataset.parentPairings = [pairing.participantA, pairing.participantB]
    .map(value => {
      const match = String(value || '').match(/winner\(([^)]+)\)|^(.+)-winner$/i);
      return match?.[1] || match?.[2];
    })
    .filter(Boolean)
    .join('|');

  const selectMatch = () => {
    state.multiStage.activeKnockoutPairingId = pairing.pairingId;
    renderMultiStageWorkspace({ preserveFocus: true });
  };

  [['A', 'knockout-player-a'], ['B', 'knockout-player-b']].forEach(([side, className]) => {
    const isWinner = winner === side;
    const name = knockoutParticipantName(pairing, side);
    const seed = knockoutParticipantSeed(pairing, side);
    const score = knockoutParticipantScore(pairing, side, progress);
    const displayName = name;
    const node = create('article', {
      className: `knockout-player ${className}${isWinner ? ' is-winner' : ''}${isSelected ? ' is-selected-match' : ''}`,
      attrs: {
        role: 'button',
        tabindex: '0',
        'aria-label': `${name}${seed ? ` (${seed})` : ''} - Điểm: ${score}`,
        'data-multi-stage-focus': `match:${pairing.pairingId}:${side}`,
      },
    });
    const identity = create('div', { className: 'knockout-player-identity' });
    identity.append(create('strong', { className: 'knockout-player-name', text: displayName }));
    if (seed && displayName !== seed) identity.append(create('small', { className: 'knockout-player-seed', text: seed }));
    const scoreNode = create('strong', { className: 'knockout-player-score', text: String(score) });
    node.append(identity, scoreNode);

    node.addEventListener('click', event => {
      if (!event.target.closest('button, a')) selectMatch();
    });
    node.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button, a')) {
        event.preventDefault();
        selectMatch();
      }
    });

    pair.appendChild(node);
  });

  return pair;
}

function renderKnockoutPagination(container, stageId) {
  const pages = [...state.multiStage.pairingPages.entries()]
    .filter(([key]) => key.startsWith(`knockout:${stageId}:`))
    .map(([, response]) => response.pagination)
    .filter(Boolean);
  const pagination = pages.find(item => Number(item.page) === Number(state.multiStage.knockoutPage)) || pages.at(-1);
  if (!pagination || Number(pagination.totalPages) <= 1) return;
  const page = Number(pagination.page) || state.multiStage.knockoutPage;
  const totalPages = Number(pagination.totalPages) || 1;
  const bar = create('div', { className: 'multi-stage-pagination knockout-pagination' });
  const previous = actionButton('Trước', () => loadKnockoutPairings(stageId, page - 1), `knockout-prev:${stageId}:${page}`, 'secondary-btn tournament-pagination-button');
  const next = actionButton('Sau', () => loadKnockoutPairings(stageId, page + 1), `knockout-next:${stageId}:${page}`, 'secondary-btn tournament-pagination-button');
  previous.disabled = page <= 1; next.disabled = page >= totalPages;
  bar.append(previous, create('span', { text: `Trang ${page}/${totalPages}` }), next);
  container.appendChild(bar);
}

function drawKnockoutConnectors(bracket) {
  const svg = bracket?.querySelector('.knockout-connectors');
  if (!svg || !bracket.isConnected) return;
  const firstPlayer = bracket.querySelector('.knockout-player');
  if (!firstPlayer) return;
  const firstPlayerRect = firstPlayer.getBoundingClientRect();
  if (firstPlayerRect.width === 0 && firstPlayerRect.height === 0) {
    window.requestAnimationFrame(() => drawKnockoutConnectors(bracket));
    return;
  }
  const bracketRect = bracket.getBoundingClientRect();
  const bracketWidth = Math.max(bracket.clientWidth, bracket.scrollWidth);
  const bracketHeight = Math.max(bracket.clientHeight, bracket.scrollHeight);
  svg.style.width = `${Math.max(1, bracketWidth)}px`;
  svg.style.height = `${Math.max(1, bracketHeight)}px`;
  svg.setAttribute('viewBox', `0 0 ${Math.max(1, bracketWidth)} ${Math.max(1, bracketHeight)}`);
  svg.replaceChildren();

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'knockout-arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto');
  const arrowHead = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowHead.setAttribute('d', 'M 0 1.5 L 8 5 L 0 8.5 z');
  arrowHead.setAttribute('fill', '#9ab8a3');
  marker.appendChild(arrowHead);
  defs.appendChild(marker);
  svg.appendChild(defs);

  const appendPath = (d, withArrow = false) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'knockout-connector');
    if (withArrow) {
      path.setAttribute('marker-end', 'url(#knockout-arrow)');
    }
    svg.appendChild(path);
  };
  const rounds = [...bracket.querySelectorAll('.knockout-round')];
  const championColumn = bracket.querySelector('.knockout-champion-column');
  const championCard = championColumn?.querySelector('.knockout-champion-card');
  const scrollLeft = bracket.scrollLeft || 0;
  const scrollTop = bracket.scrollTop || 0;

  rounds.forEach((roundEl, roundIndex) => {
    const isFinalRound = roundIndex === rounds.length - 1;
    const matchNodes = [...roundEl.querySelectorAll('.knockout-match-node')];
    const nextRound = rounds[roundIndex + 1];
    const nextMatches = nextRound ? [...nextRound.querySelectorAll('.knockout-match-node')] : [];

    matchNodes.forEach((matchNode, matchIndex) => {
      const match = matchNode;
      const players = [...matchNode.querySelectorAll('.knockout-player')];
      if (players.length < 2) return;

      const rectA = players[0].getBoundingClientRect();
      const rectB = players[1].getBoundingClientRect();
      const xA = rectA.right - bracketRect.left + scrollLeft;
      const yA = rectA.top + rectA.height / 2 - bracketRect.top + scrollTop;
      const xB = rectB.right - bracketRect.left + scrollLeft;
      const yB = rectB.top + rectB.height / 2 - bracketRect.top + scrollTop;
      const stemX = Math.max(xA, xB) + 24;
      const yMid = (yA + yB) / 2;

      // Draw match-level fork
      appendPath(`M ${xA} ${yA} H ${stemX}`);
      appendPath(`M ${xB} ${yB} H ${stemX}`);
      appendPath(`M ${stemX} ${yA} V ${yB}`);

      // Advancing line
      if (isFinalRound && championCard) {
        const champRect = championCard.getBoundingClientRect();
        const targetX = champRect.left - bracketRect.left + scrollLeft;
        const targetY = champRect.top + champRect.height / 2 - bracketRect.top + scrollTop;
        if (Math.abs(yMid - targetY) < 2) {
          appendPath(`M ${stemX} ${yMid} H ${targetX}`, true);
        } else {
          const midX = stemX + (targetX - stemX) / 2;
          appendPath(`M ${stemX} ${yMid} H ${midX} V ${targetY} H ${targetX}`, true);
        }
      } else if (nextMatches.length > 0) {
        let targetMatch = nextMatches.find(next => {
          const parentIds = String(next.dataset.parentPairings || '').split('|').filter(Boolean);
          return parentIds.includes(match.dataset.pairingId);
        });
        let targetSlotIndex = matchIndex % 2;
        if (!targetMatch) {
          const nextMatchIndex = Math.floor(matchIndex / 2);
          targetMatch = nextMatches[nextMatchIndex];
        } else {
          const parentIds = String(targetMatch.dataset.parentPairings || '').split('|').filter(Boolean);
          targetSlotIndex = parentIds.indexOf(match.dataset.pairingId) === 1 ? 1 : 0;
        }

        if (targetMatch) {
          const targetPlayers = [...targetMatch.querySelectorAll('.knockout-player')];
          const targetPlayer = targetPlayers[targetSlotIndex] || targetMatch;
          const targetRect = targetPlayer.getBoundingClientRect();
          const targetX = targetRect.left - bracketRect.left + scrollLeft;
          const targetY = targetRect.top + targetRect.height / 2 - bracketRect.top + scrollTop;
          const midX = stemX + (targetX - stemX) / 2;
          appendPath(`M ${stemX} ${yMid} H ${midX} V ${targetY} H ${targetX}`, true);
        }
      }
    });
  });
}

function observeKnockoutConnectors(bracket) {
  let frameId = null;
  const redraw = () => {
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      drawKnockoutConnectors(bracket);
    });
  };

  redraw();
  window.setTimeout(redraw, 50);
  window.setTimeout(redraw, 150);
  window.setTimeout(redraw, 300);

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(redraw);
    observer.observe(bracket);
    bracket.querySelectorAll('.knockout-round, .knockout-player, .knockout-champion-card').forEach(el => observer.observe(el));
    bracket._knockoutConnectorObserver = observer;
  }
  window.addEventListener('resize', redraw, { passive: true });
  bracket.addEventListener('scroll', redraw, { passive: true });
}

function renderKnockoutChampionCard(pairing) {
  const champion = pairing?.matchResult?.winner === 'A' || pairing?.matchResult?.winner === 'B'
    ? knockoutSlotLabel(pairing, pairing.matchResult.winner)
    : 'Chưa xác định';
  const card = create('article', { className: 'knockout-champion-card', attrs: { 'aria-label': `Vô địch: ${champion}` } });
  card.append(create('span', { className: 'knockout-champion-kicker', text: '★ Vô địch' }), create('strong', { text: champion }));
  return card;
}

function renderKnockoutMatchDetails(container, pairing) {
  const tournament = arguments[2] || null;
  const panel = create('section', { className: 'knockout-match-detail-panel', attrs: { 'aria-labelledby': 'knockout-match-detail-title' } });
  if (!pairing) {
    const empty = create('div', { className: 'knockout-detail-empty-state' });
    empty.append(
      icon('td-icon-swords'),
      create('strong', { text: 'Chọn một trận để xem chi tiết' }),
      create('p', { text: 'Chọn một cặp đấu trên sơ đồ để xem từng ván, trạng thái Live và Replay.' })
    );
    empty.querySelector('svg')?.classList.add('td-icon', 'td-icon--lg');
    panel.appendChild(empty);
    container.appendChild(panel);
    return;
  }
  const progress = knockoutSeriesProgress(pairing);
  const card = create('article', { className: 'group-pairing-card knockout-selected-pairing-card' });
  const header = create('div', { className: 'group-pairing-card-header' });
  const main = create('div', { className: 'group-pairing-main' });
  const names = create('div', { className: 'group-pairing-names' });
  names.append(
    create('strong', { className: 'group-pairing-player', text: knockoutParticipantName(pairing, 'A', tournament) }),
    create('span', { className: 'group-pairing-vs', text: 'vs' }),
    create('strong', { className: 'group-pairing-player', text: knockoutParticipantName(pairing, 'B', tournament) })
  );
  const meta = create('div', { className: 'group-pairing-meta' });
  if (progress) meta.appendChild(create('span', { className: 'group-series-pill', text: seriesFormatLabel(progress) }));
  main.append(names, meta);

  const headerRight = create('div', { className: 'group-pairing-header-right' });
  headerRight.appendChild(statusBadge(pairing.status));
  const games = create('div', { className: 'group-pairing-games', attrs: { id: `knockout-games-${pairing.pairingId}` } });
  const toggle = create('button', {
    className: 'group-pairing-toggle secondary-btn',
    type: 'button',
    attrs: {
      'aria-expanded': 'false',
      'aria-controls': `knockout-games-${pairing.pairingId}`,
      'aria-label': `Chi tiết các ván cho trận ${pairing.pairingId}`,
    },
  });
  toggle.append(create('span', { text: 'Chi tiết các ván' }), createChevronIcon());
  toggle.addEventListener('click', () => {
    games.hidden = !games.hidden;
    toggle.setAttribute('aria-expanded', String(!games.hidden));
  });
  headerRight.appendChild(toggle);
  header.append(main, headerRight);
  card.appendChild(header);

  if (progress) {
    for (const gameNumber of seriesGameNumbers(pairing, progress)) {
      games.appendChild(renderKnockoutGame(pairing, gameNumber, progress.games.find(game => Number(game.gameNumber) === gameNumber), progress, tournament));
    }
  } else {
    games.appendChild(create('p', { className: 'knockout-detail-empty', text: 'Trận này chưa có dữ liệu series.' }));
  }
  games.hidden = true;
  card.appendChild(games);
  panel.appendChild(card);
  container.appendChild(panel);
}

function renderKnockoutStage(container, stage) {
  const bracketSection = create('section', { className: 'tournament-panel knockout-view knockout-bracket-card', attrs: { 'aria-labelledby': 'knockout-title' } });
  const heading = create('div', { className: 'multi-stage-section-heading knockout-heading' });
  const copy = create('div', { className: 'multi-stage-heading-copy' });
  copy.append(create('p', { className: 'panel-kicker', text: 'Sơ đồ nhánh đấu' }), create('h3', { id: 'knockout-title', text: multiStageName(stage) || 'Vòng loại trực tiếp' }));
  heading.append(copy);
  bracketSection.appendChild(heading);
  const pairings = getKnockoutPairings(stage.stageId);
  if (!pairings.length) {
    const empty = create('div', { className: 'multi-stage-empty knockout-empty' });
    empty.append(icon('td-icon-swords'), create('strong', { text: 'Chưa có dữ liệu nhánh đấu' }), create('span', { text: 'Các cặp đấu vòng loại trực tiếp sẽ được tải khi giai đoạn này sẵn sàng.' }));
    empty.querySelector('svg')?.classList.add('td-icon', 'td-icon--lg');
    bracketSection.append(empty, create('div', { className: 'knockout-data-slot' }));
    container.appendChild(bracketSection);
    return;
  }
  const byRound = new Map();
  pairings.forEach(pairing => {
    const round = Number(pairing.roundNumber) || 0;
    if (!byRound.has(round)) byRound.set(round, []);
    byRound.get(round).push(pairing);
  });
  const rounds = [...byRound.entries()].sort(([a], [b]) => a - b);
  if (!rounds.some(([round]) => round === state.multiStage.activeKnockoutRound)) state.multiStage.activeKnockoutRound = rounds[0][0];
  const bracket = create('div', { className: 'knockout-bracket', attrs: { role: 'region', 'aria-label': 'Nhánh đấu loại trực tiếp' } });
  const maxRoundMatches = Math.max(...rounds.map(([, roundPairings]) => roundPairings.length), 1);
  bracket.style.setProperty('--knockout-bracket-height', `${Math.max(220, maxRoundMatches * 170)}px`);
  const connectors = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  connectors.classList.add('knockout-connectors');
  connectors.setAttribute('aria-hidden', 'true');
  connectors.setAttribute('focusable', 'false');
  bracket.appendChild(connectors);
  rounds.forEach(([round, roundPairings]) => {
    const roundTitle = knockoutRoundTitle(round, roundPairings, rounds.at(-1)[0]);
    const roundColumn = create('section', { className: `knockout-round${state.multiStage.activeKnockoutRound === round ? ' is-selected' : ''}`, attrs: { 'aria-label': roundTitle || 'Người tham gia', 'data-round': String(round) } });
    if (roundTitle) roundColumn.appendChild(create('h4', { id: `knockout-round-${round}`, text: roundTitle }));
    const list = create('div', { className: 'knockout-match-list' });
    roundPairings.sort((a, b) => String(a.pairingId).localeCompare(String(b.pairingId), undefined, { numeric: true })).forEach(pairing => list.appendChild(renderKnockoutMatch(pairing)));
    roundColumn.appendChild(list);
    bracket.appendChild(roundColumn);
  });
  const finalPairing = rounds.at(-1)[1][0];
  const championColumn = create('section', { className: 'knockout-champion-column', attrs: { 'aria-label': 'Vô địch' } });
  championColumn.appendChild(renderKnockoutChampionCard(finalPairing));
  bracket.appendChild(championColumn);
  bracketSection.appendChild(bracket);
  const dataSlot = create('div', { className: 'knockout-data-slot' });
  renderKnockoutPagination(dataSlot, stage.stageId);
  bracketSection.appendChild(dataSlot);
  container.appendChild(bracketSection);

  // Separate sibling card: Chi tiết cặp đấu
  const detailSection = create('section', { className: 'tournament-panel knockout-detail-card', attrs: { 'aria-labelledby': 'knockout-detail-title' } });
  const detailHeading = create('div', { className: 'multi-stage-section-heading knockout-detail-heading' });
  const detailCopy = create('div', { className: 'multi-stage-heading-copy' });
  detailCopy.append(create('p', { className: 'panel-kicker', text: 'Chi tiết cặp đấu' }), create('h3', { id: 'knockout-detail-title', text: 'Diễn biến và kết quả trận đấu' }), create('p', { className: 'multi-stage-supporting-copy', text: 'Chọn cặp đấu trên sơ đồ nhánh để xem diễn biến từng ván và mở Live/Replay.' }));
  const selectedPairing = pairings.find(pairing => pairing.pairingId === state.multiStage.activeKnockoutPairingId) || null;
  const detailBadge = create('span', {
    className: selectedPairing ? `stage-status stage-status-${safeStatusClass(selectedPairing.status)}` : 'status-badge status-secondary',
    text: selectedPairing ? multiStageStatusLabel(selectedPairing.status) : 'Chọn một trận',
  });
  detailHeading.append(detailCopy, detailBadge);
  detailSection.appendChild(detailHeading);
  const detailSlot = create('div', { className: 'knockout-detail-slot' });
  renderKnockoutMatchDetails(detailSlot, selectedPairing);
  detailSection.appendChild(detailSlot);
  container.appendChild(detailSection);

  observeKnockoutConnectors(bracket);
}

async function loadKnockoutPairings(stageId, page = 1) {
  if (!stageId || state.activeView !== 'tournament-detail') return;
  const multiStage = state.multiStage;
  const token = multiStage.requestToken;
  const controller = new AbortController();
  if (multiStage.pairingController) multiStage.pairingController.abort();
  multiStage.pairingController = controller;
  multiStage.activeStageId = stageId;
  multiStage.knockoutPage = page;
  const workspace = $('#multi-stage-workspace');
  const target = workspace?.querySelector('.knockout-data-slot');
  if (target) {
    clear(target);
    target.appendChild(create('div', { className: 'multi-stage-inline-loading', attrs: { role: 'status' }, text: 'Đang tải nhánh đấu…' }));
  }
  try {
    const response = await request(`/tournaments/${state.tournamentId}/pairings?stageId=${encodeURIComponent(stageId)}&page=${page}&pageSize=100`, { signal: controller.signal });
    if (token !== multiStage.requestToken || controller.signal.aborted || state.activeView !== 'tournament-detail') return;
    multiStage.pairingPages.set(knockoutPairingCacheKey(stageId, page), response);
    const stage = multiStage.stages?.find(item => item.stageId === stageId);
    if (stage) {
      renderMultiStageWorkspace({ preserveFocus: true });
      const lifecycleBody = $('#td-lifecycle-body');
      if (lifecycleBody && getTournamentLifecyclePhase(state.currentTournament) === 7 && state.currentTournament) {
        renderTournamentLifecycleBody(lifecycleBody, state.currentTournament, {
          progress: multiStage.progress,
          compact: { stages: multiStage.stages },
        });
      }
    }
  } catch (error) {
    if (controller.signal.aborted || !target) return;
    clear(target);
    const errorState = create('div', { className: 'multi-stage-inline-error', attrs: { role: 'alert' } });
    errorState.append(create('span', { text: error.message || 'Không thể tải nhánh đấu.' }), actionButton('Thử lại', () => loadKnockoutPairings(stageId, page), `knockout-retry:${stageId}:${page}`, 'secondary-btn'));
    target.appendChild(errorState);
  }
}

function renderRegionalQualifiers(container, stage) {
  const section = create('section', { className: 'regional-qualifiers-view', attrs: { 'aria-labelledby': 'regional-qualifiers-title' } });
  const heading = create('div', { className: 'multi-stage-section-heading regional-heading' });
  const copy = create('div', { className: 'multi-stage-heading-copy' });
  copy.append(
    create('p', { className: 'panel-kicker', text: 'Giai đoạn thi đấu · Vòng loại khu vực' }),
    create('h3', { id: 'regional-qualifiers-title', text: multiStageName(stage) || 'Vòng loại khu vực' }),
    create('p', { className: 'multi-stage-supporting-copy', text: 'Theo dõi từng khu vực và xác định Bot đủ điều kiện vào vòng bảng.' })
  );
  heading.append(copy);
  heading.appendChild(create('span', { className: `stage-status stage-status-${safeStatusClass(stage?.status)}`, text: multiStageStatusLabel(stage?.status) }));
  section.appendChild(heading);
  const regions = stage?.regions || [];
  if (!regions.length) {
    const empty = create('div', { className: 'multi-stage-empty' });
    empty.append(icon('td-icon-users-round'), create('strong', { text: 'Chưa có khu vực thi đấu' }), create('span', { text: 'Các khu vực sẽ xuất hiện sau khi lịch thi đấu được tạo.' }));
    empty.querySelector('svg')?.classList.add('td-icon', 'td-icon--lg');
    section.appendChild(empty);
  } else {
    const regionGrid = create('div', { className: 'regional-region-grid' });
    regions.forEach(region => regionGrid.appendChild(renderRegionalRegionCard(region, stage.stageId, state.multiStage.activeRegionId)));
    section.appendChild(regionGrid);

    const pairingsSlot = create('div', { className: 'regional-pairings-slot' });
    section.appendChild(pairingsSlot);

   
  }
  container.appendChild(section);
}

function renderMultiStageWorkspace(options = {}) {
  const workspace = $('#multi-stage-workspace');
  if (!workspace) return;
  const preservedFocus = options.preserveFocus ? captureMultiStageFocus() : null;
  workspace.querySelectorAll('.knockout-bracket').forEach(bracket => bracket._knockoutConnectorObserver?.disconnect());
  clear(workspace);
  const multiStage = state.multiStage;
  const progress = multiStage.progress || {};
  const stages = multiStage.stages || progress.stages || [];
  if (isCompetitorResultsHidden(state.currentTournament)) {
    workspace.appendChild(unpublishedResultsNotice());
    return;
  }
  const activeStage = stages.find(stage => stage.stageId === multiStage.activeStageId) || stages.find(stage => stage.regions?.length) || stages[0];
  if (activeStage) multiStage.activeStageId = activeStage.stageId;
  if (!activeStage?.regions?.some(region => region.regionId === multiStage.activeRegionId)) {
    multiStage.activeRegionId = activeStage?.regions?.[0]?.regionId || null;
  }
  if (!activeStage?.groups?.some(group => group.groupId === multiStage.activeGroupId)) multiStage.activeGroupId = null;
  if (activeStage?.stageType !== 'knockout') {
    multiStage.activeKnockoutRound = null;
    multiStage.activeKnockoutPairingId = null;
  }
  const actualStage = progress.currentStage || stages.find(stage => stage.status === 'in_progress') || stages.at(-1) || activeStage;
  const isPhase5Workspace = workspace.closest('.phase-layout-running') !== null;
  const isPhase7Workspace = workspace.closest('.phase-layout-completed-archive') !== null;
  const isCompetitorPublicWorkspace = state.user?.role === 'competitor';
  if (!options.hideProgressSummary && !isCompetitorPublicWorkspace && !isPhase5Workspace && !isPhase7Workspace && getTournamentLifecyclePhase(state.currentTournament) !== 5) {
    renderMultiStageProgressSummary(workspace, progress.progress || progress, activeStage, actualStage);
  }
  renderMultiStageNavigation(workspace, stages, activeStage?.stageId);
  renderPendingTiebreakerPanel(workspace, activeStage);
  if (activeStage?.regions?.length || activeStage?.stageType === 'regional_qualifiers' || activeStage?.stageType === 'regional-qualifiers') renderRegionalQualifiers(workspace, activeStage);
  else if (activeStage?.groups?.length || activeStage?.stageType === 'group_stage') renderGroupStage(workspace, activeStage);
  else if (activeStage?.stageType === 'knockout') renderKnockoutStage(workspace, activeStage);
  else {
    const empty = create('div', { className: 'multi-stage-empty' });
    empty.append(create('strong', { text: 'Giai đoạn này chưa sẵn sàng' }), create('span', { text: 'Chưa có dữ liệu bảng đấu để hiển thị.' }));
    workspace.appendChild(empty);
  }
  if (multiStage.activeRegionId && activeStage) void loadRegionalPairings(activeStage.stageId, multiStage.activeRegionId);
  if (multiStage.activeGroupId && activeStage?.groups?.length) void loadGroupPairings(activeStage.stageId, multiStage.activeGroupId);
  if (activeStage?.stageType === 'knockout' && !getKnockoutPairings(activeStage.stageId).length) void loadKnockoutPairings(activeStage.stageId, multiStage.knockoutPage || 1);
  restoreMultiStageFocus(preservedFocus);
}

function renderMultiStageLoading() {
  const workspace = $('#multi-stage-workspace');
  if (!workspace) return;
  clear(workspace);
  workspace.appendChild(create('div', { className: 'multi-stage-loading-skeleton', attrs: { role: 'status' } }));
}

function renderMultiStageError(error, retry) {
  const workspace = $('#multi-stage-workspace');
  if (!workspace) return;
  clear(workspace);
  const errorState = create('div', { className: 'multi-stage-error-state', attrs: { role: 'alert' } });
  errorState.append(icon('td-icon-circle-x'), create('strong', { text: 'Không thể tải tiến độ giải đấu' }), create('span', { text: error.message || 'Hãy thử lại sau.' }), actionButton('Thử lại', retry, 'multi-stage-retry', 'primary-btn'));
  errorState.querySelector('svg')?.classList.add('td-icon', 'td-icon--lg');
  workspace.appendChild(errorState);
}

function scheduleMultiStagePolling(tournamentId, authRevision, viewRevision) {
  const multiStage = state.multiStage;
  const isPublicSchedulePreview = state.user?.role === 'competitor' && state.detailStatus === 'registration_closed';
  if (multiStage.pollTimer || (!['running', 'paused'].includes(state.detailStatus) && !isPublicSchedulePreview)) return;
  if (!multiStage.visibilityHandler) {
    multiStage.visibilityHandler = () => {
      const canRefreshPublicSchedule = state.user?.role === 'competitor' && state.detailStatus === 'registration_closed';
      if (document.hidden || (!['running', 'paused'].includes(state.detailStatus) && !canRefreshPublicSchedule)
        || !isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) return;
      if (multiStage.pollTimer) {
        window.clearTimeout(multiStage.pollTimer);
        multiStage.pollTimer = null;
      }
      if (!multiStage.abortController) void refreshTournamentDetail();
    };
    document.addEventListener('visibilitychange', multiStage.visibilityHandler);
  }
  if (document.hidden) return;
  const delay = state.detailStatus === 'paused'
    ? MULTI_STAGE_POLL_PAUSED_INTERVAL_MS
    : MULTI_STAGE_POLL_RUNNING_INTERVAL_MS;
  multiStage.pollTimer = window.setTimeout(() => {
    multiStage.pollTimer = null;
    if (document.hidden) return;
    if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) void refreshTournamentDetail();
  }, delay);
}

async function loadMultiStageTournamentDetail(tournamentId, authRevision, viewRevision) {
  stopMultiStagePolling();
  const multiStage = state.multiStage;
  const activeStageIdAtRequest = multiStage.activeStageId;
  const isBackgroundRefresh = multiStage.loadedTournamentId === tournamentId
    && multiStage.loadedViewRevision === viewRevision
    && Boolean(multiStage.progress);
  const preservedScroll = isBackgroundRefresh && typeof window !== 'undefined' && typeof window.scrollX === 'number' && typeof window.scrollY === 'number'
    ? { left: window.scrollX, top: window.scrollY }
    : null;
  if (!isBackgroundRefresh) multiStage.pairingPages.clear();
  if (!isBackgroundRefresh) {
    multiStage.expandedGroupPairings?.clear();
    multiStage.activeKnockoutRound = null;
    multiStage.knockoutPage = 1;
    renderMultiStageLoading();
  }
  const token = multiStage.requestToken;
  const controller = new AbortController();
  multiStage.abortController = controller;
  try {
    const progress = await request(`/tournaments/${tournamentId}/progress`, {
      signal: controller.signal,
      conditional: { key: `tournament:${tournamentId}:progress` },
    });
    if (token !== multiStage.requestToken || controller.signal.aborted || !isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) return true;
    if (progress.isLegacy || progress.format !== 'multi_stage') {
      multiStage.loadedTournamentId = null;
      multiStage.loadedViewRevision = null;
      return false;
    }
    const compact = await request(`/tournaments/${tournamentId}/stages?compact=true`, {
      signal: controller.signal,
      conditional: { key: `tournament:${tournamentId}:stages:compact` },
    });
    if (token !== multiStage.requestToken || controller.signal.aborted || !isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) return true;
    const dataSignature = JSON.stringify({
      progress: progress.progress,
      currentStage: progress.currentStage,
      stages: compact.stages || progress.stages || [],
    });
    const shouldRenderWorkspace = !isBackgroundRefresh || multiStage.renderSignature !== dataSignature;
    multiStage.progress = progress;
    multiStage.loadedTournamentId = tournamentId;
    multiStage.loadedViewRevision = viewRevision;
    multiStage.stages = compact.stages || progress.stages || [];
    multiStage.renderSignature = dataSignature;
    const selectedStageId = multiStage.activeStageId;
    const selectionChangedDuringRequest = selectedStageId !== activeStageIdAtRequest;
    const stageSelection = selectionChangedDuringRequest ? selectedStageId : activeStageIdAtRequest;
    multiStage.activeStageId = multiStage.stages.some(stage => stage.stageId === selectedStageId)
      ? stageSelection
      : progress.currentStage?.stageId || multiStage.stages.find(stage => stage.regions?.length)?.stageId || multiStage.stages[0]?.stageId || null;
    const tournament = await request(`/tournaments/${tournamentId}`, {
      signal: controller.signal,
      conditional: { key: `tournament:${tournamentId}:detail` },
    });
    if (token !== multiStage.requestToken || controller.signal.aborted || !isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) return true;
    state.currentTournament = tournament;
    state.viewerParticipantIds = Array.isArray(tournament.viewerParticipantIds) ? tournament.viewerParticipantIds : [];
    state.viewerParticipantId = state.viewerParticipantIds[0] ?? null;
    state.detailStatus = tournament.status;
    state.spectatorMode = progress.status === 'running';
    state.tournamentRegistrationContext = { name: tournament.name || getMultiStageTournamentName(tournamentId), status: tournament.status };
    const name = tournament.name || getMultiStageTournamentName(tournamentId);
    $('#td-name').textContent = name;
    updateTopbarTournamentBreadcrumb(name);
    const breadcrumbName = $('#td-breadcrumb-name'); if (breadcrumbName) breadcrumbName.textContent = name;
    const badge = $('#td-status'); badge.className = `status-badge status-${safeStatusClass(tournament.status)}`; badge.textContent = multiStageStatusLabel(tournament.status);
    const subtitle = $('#td-subtitle');
    if (subtitle) subtitle.textContent = tournament.status === 'running'
      ? 'Theo dõi diễn biến các trận đấu trực tiếp và tiến độ giải đấu.'
      : tournament.status === 'completed'
        ? (tournament.resultsPublishedAt ? 'Kết quả chính thức và kho lưu trữ Replay của giải đấu.' : 'Kiểm tra và công bố kết quả chung cuộc.')
        : '';
    if (shouldRenderWorkspace) {
      $('#td-pcount').textContent = multiStageNumber(tournament.participants?.length || progress.progress?.totalParticipants || compact.participantCount || 0);
      renderMultiStageActions(tournamentId, authRevision, viewRevision, progress, tournament);
      renderTournamentLifecycle(tournament);
      renderTournamentGuidance(tournament);
      const register = $('#btn-register-bot'); if (register) register.hidden = state.user?.role !== 'competitor' || tournament.status !== 'registration_open';
      setLegacyTournamentDetailVisibility(true);
      const lifecycleBody = $('#td-lifecycle-body');
      if (lifecycleBody) {
        renderTournamentLifecycleBody(lifecycleBody, tournament, { progress, compact });
      }
    }
    const detail = $('#tournament-detail');
    if (state.user?.role === 'competitor' && tournament.format === 'multi_stage') {
      const publicSchedulePanel = detail?.querySelector('[data-public-tab-panel="schedule"]');
      const existingPublicWorkspace = $('#multi-stage-workspace');
      if (publicSchedulePanel) {
        if (existingPublicWorkspace && !publicSchedulePanel.contains(existingPublicWorkspace)) {
          publicSchedulePanel.appendChild(existingPublicWorkspace);
        } else if (!existingPublicWorkspace) {
          ensureCompetitorPublicScheduleWorkspace(publicSchedulePanel);
        }
      }
    }
    let workspace = $('#multi-stage-workspace');
    if (!workspace) { workspace = create('div', { className: 'multi-stage-workspace', attrs: { id: 'multi-stage-workspace' } }); detail.querySelector('.tournament-detail-hero')?.after(workspace); }
    const currentLifecyclePhase = getTournamentLifecyclePhase(tournament);
    const canShowPublicSchedule = state.user?.role === 'competitor'
      && currentLifecyclePhase === 4
      && hasTournamentSchedule(tournament);
    if (tournament.status === 'draft' || tournament.status === 'registration_open' || isRosterFinalPhase(tournament)) {
      if (workspace) { workspace.hidden = true; clear(workspace); }
    } else if (currentLifecyclePhase < 5 && !canShowPublicSchedule) {
      if (workspace) { workspace.hidden = true; clear(workspace); }
    } else if (currentLifecyclePhase === 6 && state.user?.role !== 'competitor') {
      if (workspace) { workspace.hidden = true; clear(workspace); }
    } else {
      if (workspace) workspace.hidden = false;
      if (shouldRenderWorkspace) renderMultiStageWorkspace({ preserveFocus: isBackgroundRefresh });
    }
    if (preservedScroll && typeof window.scrollTo === 'function') window.scrollTo(preservedScroll.left, preservedScroll.top);
    if (isBackgroundRefresh) {
      if (shouldRenderWorkspace && currentLifecyclePhase >= 5) {
        if (multiStage.activeStageId && multiStage.stages.find(stage => stage.stageId === multiStage.activeStageId)?.stageType === 'knockout') {
          void loadKnockoutPairings(multiStage.activeStageId, multiStage.knockoutPage || 1);
        } else if (multiStage.activeStageId && multiStage.activeRegionId) {
          void loadRegionalPairings(multiStage.activeStageId, multiStage.activeRegionId);
        } else if (multiStage.activeStageId && multiStage.activeGroupId) {
          void loadGroupPairings(multiStage.activeStageId, multiStage.activeGroupId);
        }
      }
    }
    if (currentLifecyclePhase >= 5 || canShowPublicSchedule) {
      scheduleMultiStagePolling(tournamentId, authRevision, viewRevision);
    }
    return true;
  } catch (error) {
    if (controller.signal.aborted) return true;
    if (!isBackgroundRefresh && isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) renderMultiStageError(error, () => refreshTournamentDetail());
    return true;
  } finally {
    if (multiStage.abortController === controller) multiStage.abortController = null;
  }
}

async function refreshTournamentDetail() {
  const options = arguments[0] || {};
  if (options?.force) {
    state.multiStage.renderSignature = null;
    state.legacyRenderSignature = null;
  }
  if (state.user?.role === 'competitor' && state.activeView === 'tournaments') {
    await loadTournaments();
    return;
  }
  if (!state.tournamentId) return;
  const tournamentId = state.tournamentId;
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const isOrganizer = state.user?.role === 'organizer';
  const refreshSequence = ++tournamentDetailRefreshSequence;
  try {
    const isMultiStage = await loadMultiStageTournamentDetail(tournamentId, authRevision, viewRevision);
    if (isMultiStage) return;
    const tournament = await request(`/tournaments/${tournamentId}`);
    if (refreshSequence !== tournamentDetailRefreshSequence
      || !isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) return;
    const isRegOpen = tournament.status === 'registration_open';
    const rosterFinalPhase = isRosterFinalPhase(tournament);
    setLegacyTournamentDetailVisibility(isRegOpen || rosterFinalPhase);
    const legacyStandingsPanel = document.querySelector('#tournament-detail .standings-panel');
    if (legacyStandingsPanel) legacyStandingsPanel.hidden = rosterFinalPhase;
    const multiStageWorkspace = $('#multi-stage-workspace'); if (multiStageWorkspace) multiStageWorkspace.hidden = true;
    state.viewerParticipantIds = Array.isArray(tournament.viewerParticipantIds) ? tournament.viewerParticipantIds : [];
    state.viewerParticipantId = state.viewerParticipantIds[0] ?? null;
    state.currentTournament = tournament;
    state.detailStatus = tournament.status;
    state.spectatorMode = tournament.spectatorAccess === true;
    state.tournamentRegistrationContext = { name: tournament.name, status: tournament.status };
    $('#td-name').textContent = tournament.name;
    updateTopbarTournamentBreadcrumb(tournament.name);
    const breadcrumbName = $('#td-breadcrumb-name'); if (breadcrumbName) breadcrumbName.textContent = tournament.name;
    const badge = $('#td-status'); badge.className = `status-badge status-${safeStatusClass(tournament.status)}`; badge.textContent = localizeStatus(tournament.status);
    const legacySignature = JSON.stringify({
      status: tournament.status,
      resultsPublishedAt: tournament.resultsPublishedAt,
      rounds: (tournament.rounds || []).map(r => (r.pairings || []).map(p => `${p.pairingId || p.matchId}:${p.status}:${p.winner || ''}:${p.matchResult ? 1 : 0}`)),
      participants: tournament.participants.map(p => p.participantId),
    });
    const isLegacyBackground = state.legacyLoadedTournamentId === tournamentId && !options?.force;
    const shouldRenderLegacy = !isLegacyBackground || state.legacyRenderSignature !== legacySignature;
    state.legacyLoadedTournamentId = tournamentId;
    state.legacyRenderSignature = legacySignature;
    if (shouldRenderLegacy) {
      renderTournamentLifecycle(tournament);
      renderTournamentGuidance(tournament);
      $('#td-pcount').textContent = tournament.participants.length;

    const lifecycleBody = $('#td-lifecycle-body');
    if (lifecycleBody) {
      renderTournamentLifecycleBody(lifecycleBody, tournament, null);
    }

    const participants = $('#td-participants'); clear(participants);
    if (!tournament.participants.length) {
      const item = create('li', { className: 'participant-empty' });
      item.append(icon('td-icon-users-round'), create('strong', { text: 'Chưa có người tham gia' }), create('span', { text: tournament.status === 'registration_open' ? 'Đăng ký Bot để bắt đầu giải đấu.' : 'Danh sách sẽ xuất hiện khi có Bot tham gia.' }));
      item.firstChild.classList.add('td-icon', 'td-icon--lg');
      participants.appendChild(item);
    }
    const participantList = tournament.participants.map(participant => ({
      ...participant,
      bot: participant.bot || { botId: '', player: 'A', command: '', args: [] },
    }));
    participantList.forEach(participant => {
      const isViewerParticipant = state.viewerParticipantIds.includes(participant.participantId);
      const item = create('li', { className: isViewerParticipant ? 'is-viewer-participant' : '', attrs: { 'data-bot-id': participant.bot.botId } });
      const copy = create('div', { className: 'participant-copy' });
      const name = create('strong', { text: participant.name });
      const botId = participant.bot.botId ? `Bot ${participant.bot.botId.slice(0, 8)}...` : '';
      const execution = participant.bot.execution;
      const runtime = execution?.kind === 'source-revision' ? (execution.runtimeId === 'cpp' ? 'C++17' : execution.runtimeId === 'python3' ? 'Python 3' : '') : '';
      const revision = execution?.kind === 'source-revision' && execution.revisionId ? `Phiên bản ${execution.revisionId.slice(0, 8)}` : '';
      const metadata = [participant.bot.botId ? `ID ${shortId(participant.bot.botId)}` : '', runtime, revision].filter(Boolean).join(' · ');
      const meta = create('span', { className: 'participant-meta', text: metadata });
      meta.textContent = [runtime, revision, botId].filter(Boolean).join(' \u00b7 ');
      const botLine = create('div', { className: 'participant-bot-line' });
      botLine.appendChild(meta);
      if (isViewerParticipant) {
        const marker = create('span', { className: 'viewer-marker', text: 'Bạn' });
        item.appendChild(marker);
      }
      copy.append(name, botLine); item.appendChild(copy); participants.appendChild(item);
    });

    const actions = $('#td-actions'); clear(actions);
    const refreshButton = actionButton('Cập nhật', async () => {
      await refreshTournamentDetail({ force: true });
      showToast('Đã cập nhật dữ liệu giải đấu.', 'success');
    }, `refresh-tournament-detail:${tournamentId}`, 'secondary-btn tournament-action tournament-refresh-action');
    const refreshIcon = icon('td-icon-refresh-cw');
    refreshIcon.classList.add('td-icon', 'td-icon--sm');
    refreshButton.prepend(refreshIcon);
    actions.appendChild(refreshButton);
    const register = $('#btn-register-bot'); register.hidden = state.user?.role !== 'competitor' || tournament.status !== 'registration_open';
    if (isOrganizer && tournament.status === 'draft') {
      const openBtn = actionButton(actionLabel('open_registration'), () => confirmTournamentAction(tournamentId, authRevision, viewRevision, 'open_registration', actionLabel('open_registration'), tournament.name), `tournament:${tournamentId}:open_registration`, 'primary-btn tournament-action phase-open-reg-cta');
      actions.replaceChildren(openBtn);
    }
    if (isOrganizer && tournament.status === 'registration_open') {
      const closeBtn = actionButton(actionLabel('close_registration'), () => handleCloseRegistration(tournamentId, tournament.name, authRevision, viewRevision), `tournament:${tournamentId}:close_registration`, 'primary-btn tournament-action phase-close-cta');
      actions.replaceChildren(closeBtn);
    }
    if (isOrganizer && tournament.status === 'registration_closed' && tournament.rounds.length) {
      appendTournamentAction(actions, tournamentId, authRevision, viewRevision, actionLabel('start'), 'start');
    }
    if (isOrganizer && tournament.status === 'running') {
      const execution = getTournamentExecutionSummary(tournament);
      const runLabel = execution.failed
        ? 'Chạy lại giải đấu'
        : execution.completed > 0 || execution.running > 0
          ? 'Tiếp tục giải đấu'
          : actionLabel('run_all');
      appendTournamentAction(actions, tournamentId, authRevision, viewRevision, runLabel, 'run_all', true);
    }
    if (state.user?.role === 'organizer' && tournament.status === 'completed' && !tournament.resultsPublishedAt) {
      appendTournamentAction(actions, tournamentId, authRevision, viewRevision, 'Công bố kết quả', 'publish', true, tournament.name);
    }
    if (isOrganizer && (tournament.status === 'draft' || tournament.status === 'registration_open' || tournament.status === 'running')) appendTournamentAction(actions, tournamentId, authRevision, viewRevision, actionLabel('cancel'), 'cancel', true, tournament.name);

    if (!isRegOpen && !rosterFinalPhase) {
      await renderParticipationRequestsV2(tournamentId, tournament.status);
      const executionSummary = renderExecutionStatus(tournament);
      renderStandings(tournament.standings, executionSummary, state.viewerParticipantIds);
      renderTournamentPodium(tournament);
      renderSchedule(tournament, state.viewerParticipantIds);
    }
    }
    if (tournament.status === 'completed' || tournament.status === 'running') {
      request(`/tournaments/${tournamentId}/stats`).then(stats => {
        if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) $('#td-stats').textContent = `${stats.completedMatches}/${stats.totalMatches} trận hoàn thành`;
      }).catch(() => {
        if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) $('#td-stats').textContent = '';
      });
    } else $('#td-stats').textContent = '';
  } catch (error) {
    if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) {
      $('#td-name').textContent = 'Không thể tải giải đấu';
      state.detailStatus = null;
      $('#td-status').className = 'status-badge status-unknown'; $('#td-status').textContent = 'Không khả dụng';
      $('#td-pcount').textContent = '0'; clear($('#td-participants')); clear($('#td-actions')); clear($('#td-standings tbody')); $('#td-standings').hidden = true; $('#td-standings-empty').hidden = false; $('#td-standings-empty').textContent = 'Không thể tải bảng xếp hạng.'; $('#td-next-step').replaceChildren(); $('#td-stats').textContent = ''; renderTournamentPodium(null);
      $('#btn-register-bot').hidden = true;
      renderMessage($('#td-schedule'), error.message || 'Không thể tải giải đấu.', refreshTournamentDetail);
    }
  }
}

async function renderParticipationRequestsV2(tournamentId, status) {
  const panel = $('#td-requests');
  const list = $('#td-request-list');
  if (!panel || !list) return;
  // Participation requests are an inbox for the registration phase only.
  // Once registration is closed, the approved participants section is the
  // source of truth and should be the primary view for the organizer.
  panel.hidden = state.user?.role !== 'organizer' || status !== 'registration_open';
  if (panel.hidden) return;
  clear(list);
  try {
    const requests = await request(`/tournaments/${tournamentId}/requests`);
    const pendingRequests = requests.filter(item => item.status === 'pending');
    state.detailRequestBotNames = new Map(requests.filter(item => item.botName).map(item => [item.botId, item.botName]));
    document.querySelectorAll('#td-participants [data-bot-id]').forEach(item => {
      const botId = item.dataset.botId;
      const botLabel = item.querySelector('.participant-bot-id');
      if (botLabel && state.detailRequestBotNames.has(botId)) botLabel.textContent = state.detailRequestBotNames.get(botId);
    });
    const pendingCount = pendingRequests.length;
    const count = $('#td-requests-count'); if (count) { count.textContent = pendingCount ? `${pendingCount} chờ duyệt` : ''; count.hidden = pendingCount === 0; }
    if (!pendingRequests.length) {
      const empty = create('div', { className: 'requests-empty' });
      empty.append(icon('td-icon-clipboard-list'), create('strong', { text: 'Không có yêu cầu chờ duyệt' }), create('span', { text: 'Các yêu cầu đăng ký Bot mới sẽ xuất hiện tại đây.' }));
      empty.firstChild.classList.add('td-icon', 'td-icon--lg');
      list.appendChild(empty);
      return;
    }
    pendingRequests.forEach(participation => {
      const row = create('article', { className: 'participant-request-row' });
      const identity = create('div', { className: 'request-identity' });
      const botIcon = create('span', { className: 'request-bot-icon' }); botIcon.appendChild(icon('td-icon-bot')); botIcon.firstChild.classList.add('td-icon', 'td-icon--md');
      const copy = create('div', { className: 'request-copy' });
      copy.append(create('strong', { text: participation.botName || participation.participantName || 'Bot không xác định' }));
      const metadata = [
        participation.botId ? `Bot ID: ${participation.botId}` : '',
        participation.runtimeId === 'cpp' ? 'C++17' : participation.runtimeId === 'python3' ? 'Python 3' : '',
        participation.revisionId ? `Revision ${participation.revisionId.slice(0, 8)}` : '',
        participation.requestedAt ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(participation.requestedAt)) : '',
      ].filter(Boolean);
      copy.append(create('span', { className: 'request-meta', text: metadata.join(' · ') }));
      const title = copy.querySelector('strong');
      if (title) title.textContent = `${participation.participantName || 'Người chơi'} · ${participation.botName || 'Bot không xác định'}`;
      const existingMeta = copy.querySelector('.request-meta');
      if (title) title.textContent = participation.participantName || participation.botName || 'Người chơi';
      if (existingMeta) {
        existingMeta.textContent = metadata.map((value, index) => index === 0 ? `Bot ID: ${shortId(participation.botId)}` : value).join(' · ');
        const metaRow = create('div', { className: 'request-meta-row' });
        existingMeta.replaceWith(metaRow); metaRow.appendChild(existingMeta);
        if (participation.botId) {
          const copyButton = create('button', { className: 'request-copy-id', type: 'button', attrs: { 'aria-label': `Sao chép Bot ID ${shortId(participation.botId)}`, title: 'Sao chép Bot ID' } });
          copyButton.appendChild(icon('td-icon-clipboard-list')); copyButton.firstChild.classList.add('td-icon', 'td-icon--sm');
          copyButton.addEventListener('click', () => {
            if (!navigator.clipboard?.writeText) { showToast('Trình duyệt không hỗ trợ sao chép tự động.', 'error'); return; }
            void navigator.clipboard.writeText(participation.botId).then(() => showToast('Đã sao chép Bot ID.', 'success')).catch(() => showToast('Không thể sao chép Bot ID.', 'error'));
          });
          metaRow.appendChild(copyButton);
        }
      }
      identity.append(botIcon, copy);
      const controls = create('div', { className: 'request-controls' });
      const lockRequestActions = async operation => {
        const buttons = [...controls.querySelectorAll('button')];
        buttons.forEach(button => { button.disabled = true; button.setAttribute('aria-busy', 'true'); });
        try { await operation(); }
        finally { if (row.isConnected) buttons.forEach(button => { button.disabled = false; button.removeAttribute('aria-busy'); }); }
      };
      const status = create('span', { className: `request-status request-status-${participation.status}` });
      if (participation.status === 'pending') { status.appendChild(icon('td-icon-clock-3')); status.firstChild.classList.add('td-icon', 'td-icon--sm'); status.appendChild(document.createTextNode('Chờ duyệt')); }
      else status.textContent = participation.status === 'approved' ? 'Đã duyệt' : participation.status === 'rejected' ? 'Đã từ chối' : participation.status;
      controls.appendChild(status);
      if (participation.status === 'pending') {
        const reject = actionButton('Từ chối', async () => {
          await lockRequestActions(async () => {
            await api(`/tournaments/${tournamentId}/requests/${participation.requestId}/reject`, { method: 'POST', body: JSON.stringify({}) });
            await refreshTournamentDetail({ force: true });
          });
        }, `reject:${participation.requestId}`, 'request-action request-action-danger');
        const rejectIcon = icon('td-icon-x'); rejectIcon.classList.add('td-icon', 'td-icon--sm'); reject.prepend(rejectIcon);
        const approve = actionButton('Duyệt', async () => {
          await lockRequestActions(async () => {
            await api(`/tournaments/${tournamentId}/requests/${participation.requestId}/approve`, { method: 'POST' });
            await refreshTournamentDetail({ force: true });
          });
        }, `approve:${participation.requestId}`, 'request-action request-action-primary');
        const approveIcon = icon('td-icon-check'); approveIcon.classList.add('td-icon', 'td-icon--sm'); approve.prepend(approveIcon);
        controls.append(reject, approve);
      }
      row.append(identity, controls);
      list.appendChild(row);
    });
  } catch (error) {
    renderMessage(list, error.message || 'Không thể tải yêu cầu tham gia.', () => renderParticipationRequestsV2(tournamentId, status));
  }
}

async function renderParticipationRequests(tournamentId, status) {
  const panel = $('#td-requests');
  const list = $('#td-request-list');
  if (!panel || !list) return;
  panel.hidden = state.user?.role !== 'organizer' || status !== 'registration_open';
  if (panel.hidden) return;
  clear(list);
  try {
    const requests = await request(`/tournaments/${tournamentId}/requests`);
    const pendingCount = requests.filter(item => item.status === 'pending').length;
    $('#td-requests-title').textContent = pendingCount ? `Yêu cầu tham gia · ${pendingCount} chờ duyệt` : 'Yêu cầu tham gia';
    if (!requests.length) {
      const empty = create('div', { className: 'requests-empty' });
      empty.append(icon('td-icon-users-round'), create('strong', { text: 'Chưa có yêu cầu tham gia' }), create('span', { text: 'Các yêu cầu đăng ký Bot sẽ hiển thị tại đây.' }));
      empty.firstChild.classList.add('td-icon', 'td-icon--md');
      list.appendChild(empty);
      return;
    }
    if (!requests.length) {
      list.appendChild(create('p', { text: 'Chưa có yêu cầu tham gia.' }));
      return;
    }
    requests.forEach(participation => {
      const row = create('div', { className: 'participant-request-row' });
      const runtimeLabel = participation.runtimeId === 'cpp' ? 'C++17' : participation.runtimeId === 'python3' ? 'Python 3' : 'Legacy';
      const revisionLabel = participation.revisionId ? ` · ${runtimeLabel} · ${participation.revisionId.slice(0, 8)}` : '';
      const statusLabels = { pending: 'Đang chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' };
      row.append(create('strong', { text: `${participation.participantName} · ${participation.botId}${revisionLabel}` }), create('span', { text: statusLabels[participation.status] || participation.status }));
      if (participation.status === 'pending') {
        row.appendChild(actionButton('Duyệt', async () => {
          await api(`/tournaments/${tournamentId}/requests/${participation.requestId}/approve`, { method: 'POST' });
          await refreshTournamentDetail();
        }, `approve:${participation.requestId}`, 'secondary-btn'));
        row.appendChild(actionButton('Từ chối', async () => {
          await api(`/tournaments/${tournamentId}/requests/${participation.requestId}/reject`, { method: 'POST', body: JSON.stringify({}) });
          await refreshTournamentDetail();
        }, `reject:${participation.requestId}`, 'secondary-btn'));
      }
      list.appendChild(row);
    });
  } catch (error) {
    list.appendChild(create('p', { text: error.message || 'Không thể tải yêu cầu tham gia.' }));
  }
}

function renderStandings(standings, executionSummary = { completed: 0 }, viewerParticipantIds = []) {
  executionSummary = executionSummary || { completed: 0 };
  const tbody = $('#td-standings tbody'); clear(tbody);
  const table = $('#td-standings');
  const empty = $('#td-standings-empty');
  if (!standings.length) {
    table.hidden = true;
    empty.hidden = false;
    empty.replaceChildren(icon('td-icon-trophy'), create('strong', { text: 'Chưa có kết quả' }), create('span', { text: 'Bảng xếp hạng sẽ xuất hiện sau khi các trận đấu được ghi nhận.' }));
    empty.firstChild.classList.add('td-icon', 'td-icon--lg');
    return;
  }
  table.hidden = false;
  empty.hidden = true;
  const hasRecordedResult = executionSummary.completed > 0 || standings.some(standing => Number(standing.matchesPlayed) > 0 || Number(standing.wins) > 0 || Number(standing.draws) > 0 || Number(standing.losses) > 0 || Number(standing.points) !== 0);
  standings.forEach((standing, index) => {
    const row = create('tr');
    if (viewerParticipantIds.includes(standing.participantId)) row.classList.add('is-viewer-standing');
    const rank = hasRecordedResult ? (standing.rank ?? index + 1) : null;
    if (rank >= 1 && rank <= 3) row.classList.add(`standing-top-${rank}`);
    const rankCell = textCell(rank ?? '—');
    rankCell.classList.add('standing-rank-cell');
    if (rank >= 1 && rank <= 3) rankCell.replaceChildren(create('span', { className: 'standing-rank-badge', text: String(rank) }));
    row.append(rankCell, textCell(standing.participantName), textCell(standing.matchesPlayed), textCell(standing.wins), textCell(standing.draws), textCell(standing.losses), textCell(standing.points));
    tbody.appendChild(row);
  });
}

function renderTournamentPodium(tournament) {
  const panel = $('#td-podium-panel');
  const list = $('#td-podium-list');
  if (!panel || !list) return;
  clear(list);
  const standings = Array.isArray(tournament?.standings) ? tournament.standings : [];
  const isPublished = tournament?.status === 'completed' && Boolean(tournament.resultsPublishedAt);
  const leaders = standings.slice(0, 3).map((standing, index) => ({
    ...standing,
    rank: Number(standing.rank) >= 1 ? Number(standing.rank) : index + 1,
  }));
  if (!isPublished || !leaders.length) {
    panel.hidden = true;
    return;
  }
  leaders.forEach((standing, index) => {
    const rank = Number(standing.rank) || index + 1;
    const place = rank === 1 ? 'Nhà vô địch' : `Hạng ${rank}`;
    const matches = Number(standing.matchesPlayed) || 0;
    const wins = Number(standing.wins) || 0;
    const points = Number(standing.points) || 0;
    const card = create('article', { className: `podium-card podium-rank-${rank}` });
    card.append(
      create('span', { className: 'podium-medal', text: String(rank), attrs: { 'aria-label': place } }),
      create('span', { className: 'podium-place', text: place }),
      create('strong', { className: 'podium-name', text: standing.participantName || 'Chưa xác định' }),
      create('span', { className: 'podium-meta', text: `${matches} trận · ${wins} thắng · ${points} điểm` }),
    );
    list.appendChild(card);
  });
  panel.hidden = false;
}

function renderScheduleLegacy(tournament) {
  const schedule = $('#td-schedule'); clear(schedule);
  if (!tournament.rounds.length) {
    clear(schedule);
    const empty = create('div', { className: 'schedule-empty' });
    empty.append(icon('td-icon-calendar-clock'), create('strong', { text: 'Chưa có lịch thi đấu' }), create('p', { text: tournament.status === 'registration_open' ? 'Đăng ký Bot và đóng đăng ký để có thể tạo lịch.' : 'Lịch thi đấu sẽ hiển thị khi giải đấu chuyển sang bước lập lịch.' }));
    empty.firstChild.classList.add('td-icon', 'td-icon--lg');
    schedule.appendChild(empty);
    return;
  }
  const failedPairings = tournament.rounds.flatMap(round => round.pairings).filter(pairing => pairing.status === 'failed');
  const failedMatches = failedPairings.length;
  // const failedPairings = pairings.filter(pairing => pairing.status === 'failed');
  tournament.rounds.forEach(round => {
    const pairings = round.pairings;
    const hasMatchActions = pairings.some(pairing => Boolean(pairing.matchId) || pairing.status === 'failed');
    const failedPairings = pairings.filter(pairing => pairing.status === 'failed');
    const failedMatches = failedPairings.length;
    const section = create('section', { className: 'schedule-round' });
    const heading = create('h4');
    const headingIcon = icon('td-icon-swords'); headingIcon.classList.add('td-icon', 'td-icon--sm');
    heading.append(headingIcon, create('span', { text: `Vòng ${round.roundNumber}` })); section.appendChild(heading);
    const table = create('table', { className: 'data-table schedule-table schedule-desktop-table' });
    const head = create('thead'); const headRow = create('tr');
    ['Trận đấu', 'Người chơi A', 'Người chơi B', 'Trạng thái', 'Người thắng', ...(hasMatchActions ? ['Thao tác'] : [])].forEach(label => headRow.appendChild(textCell(label, 'th')));
    const body = create('tbody');
    const mobileList = create('div', { className: 'schedule-mobile-list' });
    round.pairings.forEach((pairing, pairingIndex) => {
      const playerA = tournament.participants.find(participant => participant.participantId === pairing.participantA)?.name || pairing.participantA;
      const playerB = pairing.participantB ? (tournament.participants.find(participant => participant.participantId === pairing.participantB)?.name || pairing.participantB) : 'Miễn đấu';
      let winner = '-'; if (pairing.matchResult?.winner === 'A') winner = playerA; else if (pairing.matchResult?.winner === 'B') winner = playerB; else if (pairing.matchResult?.winner === 'draw') winner = 'Hòa';
      const row = create('tr'); row.append(textCell(`Trận ${pairingIndex + 1}`), textCell(playerA), textCell(playerB));
      const status = create('td'); status.appendChild(statusBadge(pairing.status)); row.appendChild(status); row.appendChild(textCell(winner));
      if (pairing.matchResult?.series) {
        const seriesFormat = (pairing.matchResult.series.format || (pairing.matchResult.series.bestOf ? `BO${pairing.matchResult.series.bestOf}` : 'BO3')).toUpperCase();
        winner += ` · ${seriesFormat} ${pairing.matchResult.series.winsA}-${pairing.matchResult.series.winsB}`;
      }
      row.lastChild.textContent = winner;
      if (hasMatchActions) {
        const action = create('td');
        if (pairing.matchId && pairing.status === 'in_progress' && (state.user?.role === 'organizer' || state.spectatorMode)) {
          action.appendChild(actionButton('Xem trực tiếp', () => openLiveMatch(tournament.tournamentId, pairing.matchId), `live:${pairing.matchId}`));
        } else if (pairing.status === 'failed' && state.user?.role === 'organizer') {
          action.appendChild(actionButton('Đưa vào hàng đợi', () => requeueTournamentPairing(tournament.tournamentId, pairing.pairingId), `requeue:${tournament.tournamentId}:${pairing.pairingId}`, 'primary-btn tournament-retry-action'));
        } else if (pairing.matchId && pairing.status !== 'failed') {
          action.appendChild(actionButton('Xem lại', () => playReplay(tournament.tournamentId, pairing.matchId), `replay:${pairing.matchId}`));
          if (pairing.status === 'completed' && state.user?.role === 'organizer') action.appendChild(rematchUnavailableButton(tournament.tournamentId, pairing.pairingId));
        }
        row.appendChild(action);
      }
      body.appendChild(row);
    });
    table.append(head, body);
    const tableWrap = create('div', {
      className: 'schedule-table-scroll',
      attrs: { role: 'region', 'aria-label': `Lịch thi đấu vòng ${round.roundNumber}`, tabindex: '0' },
    });
    tableWrap.appendChild(table);
    round.pairings.forEach((pairing, pairingIndex) => {
      const playerAName = tournament.participants.find(participant => participant.participantId === pairing.participantA)?.name || pairing.participantA;
      const playerBName = pairing.participantB ? (tournament.participants.find(participant => participant.participantId === pairing.participantB)?.name || pairing.participantB) : 'Miễn đấu';
      let winnerName = 'Chưa có';
      if (pairing.matchResult?.winner === 'A') winnerName = playerAName;
      else if (pairing.matchResult?.winner === 'B') winnerName = playerBName;
      else if (pairing.matchResult?.winner === 'draw') winnerName = 'Hòa';
      const card = create('article', { className: 'schedule-match-card' });
      const cardHeader = create('div', { className: 'schedule-card-header' });
      cardHeader.append(create('strong', { text: `Trận ${pairingIndex + 1}` }), statusBadge(pairing.status));
      const players = create('div', { className: 'schedule-card-players' });
      const playerA = create('div', { className: 'schedule-card-player' });
      playerA.append(create('small', { text: 'Người chơi A' }), create('strong', { text: playerAName }));
      const playerB = create('div', { className: 'schedule-card-player' });
      playerB.append(create('small', { text: 'Người chơi B' }), create('strong', { text: playerBName }));
      players.append(playerA, create('span', { className: 'schedule-card-vs', text: 'vs', attrs: { 'aria-hidden': 'true' } }), playerB);
      if (pairing.matchResult?.series) {
        const seriesFormat = (pairing.matchResult.series.format || (pairing.matchResult.series.bestOf ? `BO${pairing.matchResult.series.bestOf}` : 'BO3')).toUpperCase();
        winnerName += ` · ${seriesFormat} ${pairing.matchResult.series.winsA}-${pairing.matchResult.series.winsB}`;
      }
      const cardFooter = create('div', { className: 'schedule-card-footer' });
      cardFooter.appendChild(create('span', { className: 'schedule-card-winner', text: `Người thắng: ${winnerName}` }));
      if (pairing.status === 'failed') cardFooter.appendChild(create('small', { className: 'schedule-card-error', text: pairing.failureReason || 'Có thể thử lại; kết quả chưa được ghi nhận.' }));
      if (pairing.matchId && pairing.status === 'in_progress' && (state.user?.role === 'organizer' || state.spectatorMode)) {
        cardFooter.appendChild(actionButton('Xem trực tiếp', () => openLiveMatch(tournament.tournamentId, pairing.matchId), `live:${pairing.matchId}`));
      } else if (pairing.status === 'failed' && state.user?.role === 'organizer') {
        cardFooter.appendChild(actionButton('Đưa vào hàng đợi', () => requeueTournamentPairing(tournament.tournamentId, pairing.pairingId), `requeue:${tournament.tournamentId}:${pairing.pairingId}`, 'primary-btn tournament-retry-action'));
      } else if (pairing.matchId && pairing.status !== 'failed') {
        cardFooter.appendChild(actionButton('Xem lại', () => playReplay(tournament.tournamentId, pairing.matchId), `replay:${pairing.matchId}`));
        if (pairing.status === 'completed' && state.user?.role === 'organizer') cardFooter.appendChild(rematchUnavailableButton(tournament.tournamentId, pairing.pairingId));
      }
      card.append(cardHeader, players, cardFooter);
      mobileList.appendChild(card);
    });
    section.appendChild(mobileList);
    section.appendChild(tableWrap);
    schedule.appendChild(section);
  });
}

function confirmTournamentAction(tournamentId, authRevision, viewRevision, action, label, tournamentName = '') {
  state.pendingTournamentAction = { tournamentId, authRevision, viewRevision, action };
  state.tournamentActionRevision += 1;
  const title = $('#tournament-action-title');
  const copy = $('#tournament-action-copy');
  const support = $('#tournament-action-support');
  if (action === 'publish') {
    title.textContent = 'Công bố kết quả';
    copy.textContent = 'Kết quả đã được kiểm tra và sẽ được hiển thị cho người chơi.';
    support.textContent = 'Thao tác này không thể hoàn tác sau khi công bố.';
    $('#confirm-tournament-action').textContent = 'Công bố kết quả';
  } else if (action === 'delete') {
    title.textContent = 'Xóa giải đấu';
    copy.textContent = `Bạn có chắc muốn xóa giải đấu “${tournamentName}” không?`;
    support.textContent = 'Dữ liệu giải đấu, người tham gia và kết quả đã lưu sẽ bị xóa vĩnh viễn.';
    $('#confirm-tournament-action').textContent = 'Xóa giải đấu';
  } else if (action === 'cancel') {
    title.textContent = 'Hủy giải đấu';
    copy.textContent = `Bạn có chắc muốn hủy giải đấu “${tournamentName}” không?`;
    support.textContent = 'Hành động này không thể hoàn tác trong không gian làm việc.';
    $('#confirm-tournament-action').textContent = 'Hủy giải đấu';
  } else if (action === 'close_registration') {
    title.textContent = 'Đóng đăng ký';
    copy.textContent = 'Sau khi đóng, người chơi sẽ không thể gửi yêu cầu tham gia mới.';
    support.textContent = 'Bạn vẫn có thể tạo lịch thi đấu nếu các yêu cầu đang chờ đã được xử lý.';
    $('#confirm-tournament-action').textContent = 'Đóng đăng ký';
  } else if (action === 'open_registration') {
    title.textContent = 'Mở đăng ký';
    copy.textContent = `Bạn có chắc muốn mở đăng ký cho giải đấu “${tournamentName}” không?`;
    support.textContent = 'Sau khi mở, người chơi có thể gửi yêu cầu đăng ký Bot theo thể lệ của giải đấu.';
    $('#confirm-tournament-action').textContent = 'Mở đăng ký';
  } else if (action === 'stop_execution') {
    title.textContent = 'Dừng trận đấu';
    copy.textContent = 'Bạn có chắc muốn dừng thực thi các trận đấu đang chạy không?';
    support.textContent = 'Các kết quả đã commit được giữ nguyên; trận chưa hoàn tất có thể chạy lại sau.';
    $('#confirm-tournament-action').textContent = 'Dừng trận đấu';
  } else if (action === 'start_next_stage') {
    title.textContent = 'Chạy giai đoạn tiếp theo';
    copy.textContent = `Bắt đầu giai đoạn tiếp theo của giải “${tournamentName}”?`;
    support.textContent = 'Sau khi xác nhận, scheduler sẽ chạy các trận của giai đoạn này theo lịch đã tạo.';
    $('#confirm-tournament-action').textContent = 'Chạy giai đoạn tiếp theo';
  } else {
    title.textContent = label;
    copy.textContent = 'Đưa tất cả trận đấu còn lại vào hàng đợi?';
    support.textContent = 'Việc thực thi sẽ tuân theo chính sách bảo mật của máy chủ.';
    $('#confirm-tournament-action').textContent = label;
  }
  openModal('tournament-action-modal');
}

async function tournamentAction(tournamentId, authRevision, viewRevision, action, payload = {}) {
  if (action === 'edit') {
    const tournament = await request(`/tournaments/${tournamentId}`);
    if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) openEditTournamentDialog(tournament);
    return;
  }
  if (action === 'delete') {
    await api(`/tournaments/${tournamentId}`, { method: 'DELETE' });
  } else {
    const endpoint = action === 'publish' ? `/tournaments/${tournamentId}/publish` : `/tournaments/${tournamentId}/action`;
    await api(endpoint, { method: 'POST', body: action === 'publish' ? undefined : JSON.stringify({ action, ...payload }) });
  }
  if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) {
    showToast(action === 'delete' ? 'Đã xóa giải đấu.' : ACTION_SUCCESS_MESSAGES[action] || 'Đã cập nhật giải đấu.', 'success');
    if (action === 'delete') navigate('tournaments'); else await refreshTournamentDetail({ force: true });
  } else if (action === 'delete' && isCurrentView('tournaments', authRevision, viewRevision)) {
    showToast('Đã xóa giải đấu.', 'success');
    await loadTournaments();
  }
}

async function requeueTournamentPairing(tournamentId, pairingId) {
  const retryKey = `${tournamentId}:${pairingId}`;
  if (state.retryingPairings.has(retryKey)) return;
  if (!window.confirm('Đưa pairing lỗi vào hàng đợi lại? Các checkpoint BO2/BO3 và lịch sử đã commit sẽ được giữ nguyên.')) return;
  state.retryingPairings.add(retryKey);
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  try {
    await api(`/tournaments/${tournamentId}/pairings/${pairingId}/requeue`, { method: 'POST' });
  } catch (error) {
    state.retryingPairings.delete(retryKey);
    showToast(error?.message || 'Không thể đưa pairing vào hàng đợi.', 'error');
    return;
  }
  if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) {
    showToast('Đã đưa trận đấu vào hàng đợi chạy lại.', 'success');
    await refreshTournamentDetail();
  }

  // The endpoint acknowledges queue admission first. Keep this pairing
  // locked until the persisted status changes, so a stale failed row cannot
  // enqueue duplicate retries while the first attempt is still running.
  const deadline = Date.now() + 30_000;
  let finalStatus = 'failed';
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (state.activeView !== 'tournament-detail' || state.tournamentId !== tournamentId) break;
    try {
      const detail = await request(`/tournaments/${tournamentId}`);
      const currentPairing = detail?.rounds?.flatMap(round => round.pairings || [])
        .find(pairing => pairing.pairingId === pairingId);
      finalStatus = currentPairing?.status || 'failed';
      if (finalStatus !== 'failed') {
        await refreshTournamentDetail();
        break;
      }
    } catch {
      break;
    }
  }
  state.retryingPairings.delete(retryKey);
  if (finalStatus === 'failed' && state.activeView === 'tournament-detail' && state.tournamentId === tournamentId) {
    await refreshTournamentDetail();
  }
}

function rematchUnavailableButton(tournamentId, pairingId) {
  const button = actionButton('Rematch không khả dụng', () => {}, `rematch-blocked:${tournamentId}:${pairingId}`, 'secondary-btn tournament-rematch-action');
  button.disabled = true;
  button.title = 'Rematch bị chặn: kết quả đã ghi nhận ảnh hưởng standings hoặc vòng phụ thuộc.';
  return button;
}

async function submitTournamentRegistration() {
  const button = $('#submit-registration');
  const tournamentId = state.tournamentId;
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const dialogRevision = state.registrationDialogRevision;
  const sourceView = state.activeView;
  const participantName = $('#reg-part-name').value.trim();
  const botId = $('#reg-bot-select').value;
  const revisionId = $('#reg-revision-select').value;
  const error = $('#registration-form-error'); error.textContent = ''; error.hidden = true;
  $('#reg-part-name').setAttribute('aria-invalid', participantName ? 'false' : 'true');
  $('#reg-bot-select').setAttribute('aria-invalid', botId ? 'false' : 'true');
  $('#reg-revision-select').setAttribute('aria-invalid', revisionId ? 'false' : 'true');
  if (!participantName || !botId || !revisionId) { error.textContent = 'Hãy chọn Bot, phiên bản mã nguồn và nhập tên người tham gia.'; error.hidden = false; return; }
  if (state.registrationSubmission?.tournamentId === tournamentId
    && state.registrationSubmission.botId === botId
    && state.registrationSubmission.revisionId === revisionId) {
    renderRegistrationSubmissionStatus(state.registrationSubmission);
    startRegistrationSubmissionPolling(tournamentId, state.registrationSubmission.requestId);
    return;
  }
  await runPending('register-participant', button, async () => {
    const endpoint = state.user?.role === 'competitor' ? `/tournaments/${tournamentId}/participation-requests` : `/tournaments/${tournamentId}/register`;
    let result;
    try { result = await api(endpoint, { method: 'POST', body: JSON.stringify({ participantName, botId, revisionId }) }); }
    catch (requestError) { if (state.authRevision === authRevision && ['dashboard', 'tournaments', 'tournament-detail'].includes(state.activeView) && state.viewRevision === viewRevision && state.registrationDialogRevision === dialogRevision) { error.textContent = requestError.message || 'Unable to register bot.'; error.hidden = false; } throw requestError; }
    if (state.authRevision !== authRevision || state.registrationDialogRevision !== dialogRevision) return;
    state.registrationSubmission = { ...result, tournamentId };
    renderRegistrationSubmissionStatus(state.registrationSubmission);
    $('#registration-fields').hidden = true;
    button.hidden = true;
    $('#reg-part-name').value = '';
    $('#reg-part-name').removeAttribute('aria-invalid');
    $('#reg-bot-select').removeAttribute('aria-invalid');
    showToast('Đã gửi Bot đi kiểm tra. Chưa tham gia chính thức; hãy chờ Ban tổ chức duyệt.', 'success');
    startRegistrationSubmissionPolling(tournamentId, result.requestId);
    if (sourceView === 'tournament-detail') await refreshTournamentDetail();
    else if (sourceView === 'dashboard') await loadDashboard();
    else await loadTournaments();
  });
}

async function populateBotSelect() {
  const select = $('#reg-bot-select'); clear(select);
  const authRevision = state.authRevision;
  const tournamentId = state.tournamentId;
  const viewRevision = state.viewRevision;
  const dialogRevision = state.registrationDialogRevision;
  try {
    const bots = await request('/bots');
    if (state.authRevision !== authRevision || !['dashboard', 'tournaments', 'tournament-detail'].includes(state.activeView)
      || state.registrationDialogRevision !== dialogRevision) return false;
    if (!bots.length) { showRegistrationEmptyState(); return false; }
    select.appendChild(create('option', { text: 'Chọn Bot tham gia', attrs: { value: '', disabled: 'disabled', selected: 'selected' } }));
    bots.forEach(bot => select.appendChild(create('option', { text: `${bot.name} · ${shortId(bot.id)}`, attrs: { value: bot.id } })));
    await populateRevisionSelect('');
    showRegistrationForm();
  } catch {
    if (state.authRevision === authRevision && ['dashboard', 'tournaments', 'tournament-detail'].includes(state.activeView)
      && state.registrationDialogRevision === dialogRevision) showRegistrationErrorState();
  }
  return state.registrationBotsState === 'ready'
    && state.authRevision === authRevision && ['dashboard', 'tournaments', 'tournament-detail'].includes(state.activeView)
    && state.registrationDialogRevision === dialogRevision;
}

async function populateRevisionSelect(botId) {
  const select = $('#reg-revision-select');
  setRegistrationError();
  clear(select);
  select.appendChild(create('option', { text: 'Chọn phiên bản mã nguồn', attrs: { value: '', disabled: 'disabled', selected: 'selected' } }));
  if (!botId) return;
  try {
    const revisions = await request(`/bots/${botId}/revisions`);
    const supportedRevisions = revisions.filter(revision => ['cpp', 'python3'].includes(revision.runtimeId));
    state.registrationRevisions = supportedRevisions;
    supportedRevisions.forEach(revision => {
      const language = revision.runtimeId === 'cpp' ? 'C++17' : 'Python 3';
      const label = revision.label ? ` — ${revision.label}` : '';
      select.appendChild(create('option', { text: `${language}${label} (${revision.revisionId.slice(0, 8)})`, attrs: { value: revision.revisionId } }));
    });
    if (supportedRevisions.length === 1) select.value = supportedRevisions[0].revisionId;
    updateRegistrationRevisionSummary(select.value);
    if (!supportedRevisions.length) setRegistrationError('Bot chưa có phiên bản C++17 hoặc Python 3 để tham gia.');
  } catch (error) {
    setRegistrationError(error.message || 'Không thể tải phiên bản mã nguồn.');
  }
}

function updateRegistrationRevisionSummary(revisionId = $('#reg-revision-select')?.value) {
  const target = $('#registration-revision-summary');
  if (!target) return;
  const revision = state.registrationRevisions.find(item => item.revisionId === revisionId);
  if (!revision) { target.textContent = 'Chưa chọn Bot và revision'; return; }
  const language = revision.runtimeId === 'cpp' ? 'C++17' : revision.runtimeId === 'python3' ? 'Python 3' : 'Runtime không hỗ trợ';
  const mode = revision.executionMode === 'strategy' ? 'Chiến thuật' : revision.executionMode === 'raw' ? 'Mã nguồn trực tiếp' : '';
  target.textContent = `Revision bất biến: ${language}${mode ? ` · ${mode}` : ''} · ${revision.revisionId}`;
}

const PIECE_TYPES = { dam: 'icon-piece-dam', la: 'icon-piece-la', keo: 'icon-piece-keo' };
const PIECE_LABELS = { dam: 'Búa', la: 'Bao', keo: 'Kéo' };

function renderScheduleBeforeScore(tournament) {
  const schedule = $('#td-schedule');
  clear(schedule);
  if (!schedule || !tournament?.rounds?.length) return;

  tournament.rounds.forEach(round => {
    const section = create('section', { className: 'schedule-round' });
    const heading = create('div', { className: 'schedule-round-heading' });
    const title = create('div', { className: 'schedule-round-title' });
    title.append(icon('td-icon-swords'), create('span', { text: `Vòng ${round.roundNumber}` }));
    heading.append(title, create('span', {
      className: 'schedule-round-count',
      text: `${round.pairings.length} trận đấu`,
    }));
    section.appendChild(heading);

    const table = create('table', { className: 'data-table schedule-table schedule-desktop-table' });
    const headRow = create('tr');
    ['Trận đấu', 'Đội 1', 'Đội 2', 'Trạng thái', 'Đội thắng', 'Thao tác'].forEach(label => headRow.appendChild(textCell(label, 'th')));
    const body = create('tbody');
    const mobileList = create('div', { className: 'schedule-mobile-list' });

    round.pairings.forEach((pairing, pairingIndex) => {
      const playerA = tournament.participants.find(participant => participant.participantId === pairing.participantA)?.name || pairing.participantA;
      const playerB = pairing.participantB
        ? (tournament.participants.find(participant => participant.participantId === pairing.participantB)?.name || pairing.participantB)
        : 'Miễn đấu';
      const isBye = pairing.participantB === null;
      const winnerSide = pairing.matchResult?.winner;
      let winner = isBye ? '—' : winnerSide === 'A' ? playerA : winnerSide === 'B' ? playerB : winnerSide === 'draw' ? 'Hòa' : 'Chưa có';
      if (pairing.matchResult?.series) {
        const seriesFormat = (pairing.matchResult.series.format || (pairing.matchResult.series.bestOf ? `BO${pairing.matchResult.series.bestOf}` : 'BO3')).toUpperCase();
        winner += ` · ${seriesFormat} ${pairing.matchResult.series.winsA}-${pairing.matchResult.series.winsB}`;
      }

      const row = create('tr', { className: 'schedule-match-row' });
      row.append(textCell(`Trận ${pairingIndex + 1}`), textCell(playerA), textCell(playerB));
      const statusCell = create('td');
      statusCell.appendChild(statusBadge(isBye ? 'bye' : pairing.status));
      row.append(statusCell);
      const winnerCell = textCell(winner);
      winnerCell.classList.add('schedule-winner-cell');
      row.append(winnerCell);
      const actionCell = create('td', { className: 'schedule-action-cell' });
      if (pairing.status === 'failed' && state.user?.role === 'organizer') {
        const unavailableReplay = actionButton('Xem diễn biến', () => { }, `replay-unavailable:${tournament.tournamentId}:${pairing.pairingId}`, 'secondary-btn');
        unavailableReplay.disabled = true;
        unavailableReplay.title = 'Trận lỗi không có replay hợp lệ';
        actionCell.appendChild(unavailableReplay);
      }
      if (pairing.status === 'failed' && state.user?.role === 'organizer') {
        actionCell.appendChild(actionButton('Đưa vào hàng đợi', () => requeueTournamentPairing(tournament.tournamentId, pairing.pairingId), `requeue:${tournament.tournamentId}:${pairing.pairingId}`, 'primary-btn tournament-retry-action'));
      }
      if (pairing.matchId && pairing.status === 'in_progress' && (state.user?.role === 'organizer' || state.spectatorMode)) {
        actionCell.appendChild(actionButton('Xem trực tiếp', () => openLiveMatch(tournament.tournamentId, pairing.matchId), `live:${pairing.matchId}`));
      } else if (pairing.matchId && pairing.status !== 'failed') {
        actionCell.appendChild(actionButton('Xem chi tiết', () => playReplay(tournament.tournamentId, pairing.matchId), `replay:${pairing.matchId}`));
        if (pairing.status === 'completed' && state.user?.role === 'organizer') actionCell.appendChild(rematchUnavailableButton(tournament.tournamentId, pairing.pairingId));
      }
      if (!actionCell.childElementCount) actionCell.appendChild(create('span', { className: 'schedule-action-empty', text: '—' }));
      const actionContent = create('div', { className: 'action-content' });
      while (actionCell.firstChild) actionContent.appendChild(actionCell.firstChild);
      actionCell.appendChild(actionContent);
      row.append(actionCell);
      body.appendChild(row);

      const card = create('article', { className: 'schedule-match-card' });
      const cardHeader = create('div', { className: 'schedule-card-header' });
      cardHeader.append(create('strong', { text: `Trận ${pairingIndex + 1}` }), statusBadge(isBye ? 'bye' : pairing.status));
      const players = create('div', { className: 'schedule-card-players' });
      const playerCard = (label, name, isWinner) => {
        const item = create('div', { className: `schedule-card-player${isWinner ? ' is-winner' : ''}` });
        item.append(create('small', { text: label }), create('strong', { text: name }));
        if (isWinner) item.append(create('span', { className: 'schedule-winner-mark', text: 'THẮNG' }));
        return item;
      };
      players.append(playerCard('Đội 1', playerA, !isBye && winnerSide === 'A'), create('span', { className: 'schedule-card-vs', text: 'VS', attrs: { 'aria-hidden': 'true' } }), playerCard('Đội 2', playerB, !isBye && winnerSide === 'B'));
      const footer = create('div', { className: 'schedule-card-footer' });
      if (pairing.status === 'failed' && state.user?.role === 'organizer') {
        const unavailableReplay = actionButton('Xem diễn biến', () => { }, `replay-unavailable:${tournament.tournamentId}:${pairing.pairingId}`, 'secondary-btn');
        unavailableReplay.disabled = true;
        unavailableReplay.title = 'Trận lỗi không có replay hợp lệ';
        footer.appendChild(unavailableReplay);
      }
      if (pairing.status === 'failed' && state.user?.role === 'organizer') footer.appendChild(actionButton('Đưa vào hàng đợi', () => requeueTournamentPairing(tournament.tournamentId, pairing.pairingId), `requeue:${tournament.tournamentId}:${pairing.pairingId}`, 'primary-btn tournament-retry-action'));
      footer.appendChild(create('span', { className: 'schedule-card-winner', text: isBye ? 'Miễn đấu' : `Đội thắng: ${winner}` }));
      if (pairing.matchId && pairing.status === 'in_progress' && (state.user?.role === 'organizer' || state.spectatorMode)) {
        footer.appendChild(actionButton('Xem trực tiếp', () => openLiveMatch(tournament.tournamentId, pairing.matchId), `live:${pairing.matchId}`));
      }
      else if (pairing.matchId) {
        footer.appendChild(actionButton('Xem chi tiết', () => playReplay(tournament.tournamentId, pairing.matchId), `replay:${pairing.matchId}`));
        if (pairing.status === 'completed' && state.user?.role === 'organizer') footer.appendChild(rematchUnavailableButton(tournament.tournamentId, pairing.pairingId));
      }
      card.append(cardHeader, players, footer);
      mobileList.appendChild(card);
    });

    const head = create('thead');
    head.appendChild(headRow);
    table.append(head, body);
    const tableWrap = create('div', { className: 'schedule-table-scroll', attrs: { role: 'region', 'aria-label': `Lịch thi đấu vòng ${round.roundNumber}`, tabindex: '0' } });
    tableWrap.appendChild(table);
    section.append(mobileList, tableWrap);
    schedule.appendChild(section);
  });
}

function renderSchedule(tournament, viewerParticipantIds = []) {
  renderScheduleBeforeScore(tournament);
  const rounds = [...document.querySelectorAll('#td-schedule .schedule-round')];
  rounds.forEach((section, roundIndex) => {
    const pairings = tournament.rounds?.[roundIndex]?.pairings || [];
    const table = section.querySelector('.schedule-table');
    const headerRow = table?.querySelector('thead tr');
    if (headerRow) headerRow.insertBefore(textCell('T\u1ec9 s\u1ed1', 'th'), headerRow.cells[4]);
    section.querySelectorAll('.schedule-table tbody tr').forEach((row, pairingIndex) => {
      const pairing = pairings[pairingIndex];
      if (pairing && (viewerParticipantIds.includes(pairing.participantA) || viewerParticipantIds.includes(pairing.participantB))) row.classList.add('is-viewer-match');
      const score = pairing?.matchResult?.series
        ? `${pairing.matchResult.series.winsA}\u2013${pairing.matchResult.series.winsB}`
        : pairing?.matchResult?.score
        || (pairing?.matchResult?.winner === 'A' ? '1\u20130' : pairing?.matchResult?.winner === 'B' ? '0\u20131' : pairing?.matchResult?.winner === 'draw' ? '0\u20130' : '\u2014');
      const scoreCell = textCell(score);
      scoreCell.classList.add('schedule-score-cell');
      row.insertBefore(scoreCell, row.cells[4]);
      const winnerCell = row.cells[5];
      if (winnerCell && pairing?.matchResult?.winner) {
        const winnerId = pairing.matchResult.winner === 'A' ? pairing.participantA : pairing.matchResult.winner === 'B' ? pairing.participantB : null;
        const winnerName = winnerId ? tournament.participants.find(participant => participant.participantId === winnerId)?.name || winnerId : 'Hòa';
        winnerCell.textContent = winnerName;
      }
    });
    section.querySelectorAll('.schedule-table td .secondary-btn, .schedule-card-footer .secondary-btn').forEach(button => {
      button.textContent = 'Xem di\u1ec5n bi\u1ebfn';
    });
    section.querySelectorAll('.schedule-mobile-list .schedule-match-card').forEach((card, pairingIndex) => {
      const pairing = pairings[pairingIndex];
      if (pairing && (viewerParticipantIds.includes(pairing.participantA) || viewerParticipantIds.includes(pairing.participantB))) card.classList.add('is-viewer-match');
      const score = pairing?.matchResult?.series
        ? `${pairing.matchResult.series.winsA}\u2013${pairing.matchResult.series.winsB}`
        : pairing?.matchResult?.score
        || (pairing?.matchResult?.winner === 'A' ? '1\u20130' : pairing?.matchResult?.winner === 'B' ? '0\u20131' : pairing?.matchResult?.winner === 'draw' ? '0\u20130' : '\u2014');
      const winner = card.querySelector('.schedule-card-winner');
      if (winner) winner.textContent = `${winner.textContent.replace(/\s*·.*$/, '')} · Tỷ số: ${score}`;
    });
  });
}

/* ==================== MODULE: live.js ==================== */
function stopLiveMatchPolling() {
  state.liveTransitionToken += 1;
  if (state.liveMatchPollingTimer) clearTimeout(state.liveMatchPollingTimer);
  state.liveMatchPollingTimer = null;
  if (state.liveStreamSource) state.liveStreamSource.close();
  state.liveStreamSource = null;
  state.liveStreamMode = false;
  state.livePollBackoffMs = 0;
  state.liveMatchContext = null;
  state.liveMatchSnapshot = null;
  document.querySelector('#replay-view .replay-player-a-label')?.classList.remove('is-winner');
  document.querySelector('#replay-view .replay-player-b-label')?.classList.remove('is-winner');
  state.liveMatchStartedGames.clear();
  state.liveLatestSnapshot = null;
  state.liveHistoryGame = null;
  state.liveHistory = [];
  state.liveHistoryIndex = 0;
  state.liveHistoryQueue = [];
  state.liveLastSequence = 0;
  state.liveAcceptedSnapshot = null;
  if (state.liveTransitionTimer) clearTimeout(state.liveTransitionTimer);
  state.liveTransitionTimer = null;
  state.livePendingSnapshot = null;
  hideLiveGameResultModal();
  if (state.liveHistoryTimer) clearTimeout(state.liveHistoryTimer);
  state.liveHistoryTimer = null;
  $('#replay-view')?.classList.remove('live-match-view');
}

function showLiveGameResultModal(snapshot, completedGame = null) {
  const series = snapshot.series;
  if (snapshot.status !== 'finished' && snapshot.status !== 'completed') return;
  if (snapshot.status === 'finished' && series?.active) {
    const gameNumber = Number(completedGame || series.currentGame || snapshot.gameNumber || 1);
    const confirmedWins = Number(series.winsA ?? 0) + Number(series.winsB ?? 0);
    if (confirmedWins < gameNumber) {
      hideLiveGameResultModal();
      return;
    }
  }
  const game = completedGame || series.currentGame || snapshot.gameNumber || 1;
  // BO3 sides can swap between games. The modal must show the series score
  // against the fixed competitors, not the temporary A/B sides of the game
  // that just ended.
  const participants = snapshot.participants || {};
  const fixedA = series?.competitorA || series?.competitorX || participants.A;
  const fixedB = series?.competitorB || series?.competitorY || participants.B;
  const participantFor = (competitor, fallback) => {
    if (!competitor?.participantId) return fallback;
    return Object.values(participants).find(item => item?.participantId === competitor.participantId) || fallback;
  };
  const playerA = participantFor(fixedA, participants.A);
  const playerB = participantFor(fixedB, participants.B);
  const title = $('#live-game-result-title');
  const score = $('#live-game-result-score');
  const next = $('#live-game-result-next');
  const transition = Boolean(series?.active);
  if (title) title.textContent = transition ? `Ván ${game} đã kết thúc` : 'Trận đấu đã kết thúc';
  if (score) score.textContent = series ? `Tỷ số ${series.winsA ?? 0}-${series.winsB ?? 0}` : 'Kết quả đã được ghi nhận';
  const nextGame = series?.nextGame || (series && Number(game) < Number(series.bestOf || 3) ? Number(game) + 1 : null);
  const currentParticipants = snapshot.currentParticipants || snapshot.participants || {};
  const seriesDecidedWinner = (series?.winner === 'A' || series?.winner === 'B' || series?.winner === 'draw')
    ? series.winner
    : (series && typeof series.winsA === 'number' && typeof series.winsB === 'number' && (!series.active || series.winsA >= 2 || series.winsB >= 2)
      ? (series.winsA > series.winsB ? 'A' : series.winsB > series.winsA ? 'B' : (series.winsA === series.winsB && !series.active ? 'draw' : null))
      : null);
  const winnerSide = transition
    ? snapshot.winner
    : (seriesDecidedWinner || (series ? null : snapshot.winner));
  const winnerParticipants = transition ? currentParticipants : (snapshot.participants || currentParticipants);
  const winnerName = winnerSide && winnerSide !== 'draw'
    ? (winnerSide === 'A' ? (playerA?.participantName || fixedA?.participantName || fixedA?.name || winnerParticipants?.A?.participantName)
      : winnerSide === 'B' ? (playerB?.participantName || fixedB?.participantName || fixedB?.name || winnerParticipants?.B?.participantName)
      : (winnerParticipants?.[winnerSide]?.participantName || null))
    : null;
  const setText = (selector, value) => { const element = $(selector); if (element) element.textContent = value || '—'; };
  setText('#live-game-player-a', fixedA?.participantName || fixedA?.name);
  setText('#live-game-player-b', fixedB?.participantName || fixedB?.name);
  setText('#live-game-bot-a', playerA?.botName ? `Bot · ${playerA.botName}` : 'Đội A');
  setText('#live-game-bot-b', playerB?.botName ? `Bot · ${playerB.botName}` : 'Đội B');
  setText('#live-game-score-a', series ? String(series.winsA ?? 0) : '—');
  setText('#live-game-score-b', series ? String(series.winsB ?? 0) : '—');
  const scoreA = $('#live-game-score-a');
  const scoreB = $('#live-game-score-b');
  scoreA?.classList.toggle('is-leading', Boolean(series && (series.winsA ?? 0) > (series.winsB ?? 0)));
  scoreB?.classList.toggle('is-leading', Boolean(series && (series.winsB ?? 0) > (series.winsA ?? 0)));
  const winnerLabel = $('#live-game-result-winner');
  if (winnerLabel) winnerLabel.textContent = transition
    ? 'Kết quả ván đã được ghi nhận'
    : (winnerSide === 'draw' ? 'Trận đấu kết thúc với kết quả hòa' : (winnerName ? `${winnerName} chiến thắng` : 'Kết quả đã được ghi nhận'));
  if (next) next.textContent = transition
    ? (nextGame ? `Đang chuẩn bị Ván ${nextGame}` : 'Đang chuẩn bị ván tiếp theo')
    : (winnerSide === 'draw' ? 'Trận đấu kết thúc với kết quả hòa' : (winnerName ? `${winnerName} chiến thắng` : 'Kết quả đã được ghi nhận'));
  const close = $('#live-game-result-close');
  if (close) close.hidden = transition;
  const modal = $('#live-game-result-modal');
  if (modal) {
    if (!modal.classList.contains('is-visible')) {
      state.liveModalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    modal.classList.add('is-visible');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const closeButton = $('#live-game-result-close');
    if (closeButton && !closeButton.hidden) closeButton.focus();
  }
}

function hideLiveGameResultModal() {
  const modal = $('#live-game-result-modal');
  if (modal) {
    modal.classList.remove('is-visible');
    modal.setAttribute('aria-hidden', 'true');
  }
  if (state.liveModalReturnFocus?.isConnected) state.liveModalReturnFocus.focus();
  state.liveModalReturnFocus = null;
  if (!document.querySelector('.modal-overlay.open')) document.body.classList.remove('modal-open');
}

function closeLiveGameResultModal() {
  hideLiveGameResultModal();
}

function replayParticipantName(participants, player) {
  return participants?.[player]?.participantName || (player ? `Người chơi ${player}` : 'Người chơi');
}

function replayMovePlayer(move) {
  if (move?.player === 'A' || move?.player === 'B') return move.player;
  return null;
}

function updateReplayTurnHighlight(player) {
  document.querySelector('#replay-view .replay-player-a-label')?.classList.toggle('is-turn', player === 'A');
  document.querySelector('#replay-view .replay-player-b-label')?.classList.toggle('is-turn', player === 'B');
}

function updateReplaySeriesScore(winsA = 0, winsB = 0) {
  const scoreA = $('#r-p1-score');
  const scoreB = $('#r-p2-score');
  if (scoreA) scoreA.textContent = String(winsA);
  if (scoreB) scoreB.textContent = String(winsB);
  document.querySelector('#replay-view .replay-player-a-label')?.classList.toggle('is-leading', Number(winsA) > Number(winsB));
  document.querySelector('#replay-view .replay-player-b-label')?.classList.toggle('is-leading', Number(winsB) > Number(winsA));
}

function updateReplaySeriesSideColors(game, fixedAId, fixedBId) {
  const playerA = document.querySelector('#replay-view .replay-series-card .replay-player-a-label');
  const playerB = document.querySelector('#replay-view .replay-series-card .replay-player-b-label');
  if (!playerA || !playerB || !game) return;
  const fixedAIsSideA = game.participantA === fixedAId;
  const fixedBIsSideA = game.participantA === fixedBId;
  playerA.classList.toggle('is-current-side-a', fixedAIsSideA);
  playerA.classList.toggle('is-current-side-b', !fixedAIsSideA);
  playerB.classList.toggle('is-current-side-a', fixedBIsSideA);
  playerB.classList.toggle('is-current-side-b', !fixedBIsSideA);
}

function renderLiveMatchSnapshot(snapshot) {
  const statusText = snapshot.status === 'in_progress'
    ? `Đang thực thi · Lượt ${snapshot.turn}`
    : snapshot.status === 'finished' || snapshot.status === 'completed' ? 'Trận đấu đã hoàn tất' : snapshot.status === 'failed' ? 'Trận đấu lỗi' : 'Trận đấu đã hủy';
  const series = snapshot.series;
  if (snapshot.status === 'finished' || snapshot.status === 'completed') showLiveGameResultModal(snapshot);
  else if (snapshot.status === 'in_progress') hideLiveGameResultModal();
  const gameText = series ? `Ván ${series.currentGame}/${series.bestOf}` : 'Ván 1';
  const statusBadge = $('#replay-status-badge');
  if (statusBadge) statusBadge.textContent = snapshot.status === 'in_progress' ? 'Đang diễn ra' : snapshot.status === 'failed' ? 'Thất bại' : 'Đã hoàn thành';
  const contextNote = $('#replay-context-note');
  if (contextNote) contextNote.textContent = series ? `Trận BO${series.bestOf} · ${gameText}` : 'Trận BO1';
  const boardTitle = $('#replay-board-title');
  if (boardTitle) boardTitle.textContent = `${gameText} · Diễn biến`;
  const scoreText = series
    ? `${series.active ? 'Tỷ số hiện tại' : 'Tỷ số'} ${series.winsA}-${series.winsB}`
    : 'Tỷ số 0-0';
  const resultText = $('#r-result-text'); if (resultText) resultText.textContent = `${gameText} · ${scoreText} · ${statusText}${snapshot.error ? ` · ${snapshot.error}` : ''}`;
  const matchId = $('#r-match-id'); if (matchId) matchId.textContent = String(snapshot.matchId || '—');
  const winner = $('#r-winner'); if (winner) winner.textContent = snapshot.status === 'in_progress' ? 'Chưa có' : snapshot.status === 'failed' ? 'Không xác định' : 'Đang cập nhật';
  const termination = $('#r-termination'); if (termination) termination.textContent = snapshot.error || (snapshot.status === 'in_progress' ? 'Đang thực thi' : 'Đã kết thúc');
  const protocol = $('#r-protocol'); if (protocol) protocol.textContent = 'Dữ liệu trực tiếp';
  const participants = snapshot.participants || {};
  const currentParticipants = snapshot.currentParticipants || participants;
  const latestMove = snapshot.state?.lastMove || snapshot.latestMove;
  const latestMovePlayer = replayMovePlayer(latestMove);
  const activePlayer = snapshot.currentPlayer;
  const fixedAId = participants.A?.participantId;
  const fixedBId = participants.B?.participantId;
  const currentSideAId = currentParticipants.A?.participantId;
  const currentSideBId = currentParticipants.B?.participantId;
  updateReplaySeriesSideColors(
    { participantA: currentSideAId, participantB: currentSideBId },
    fixedAId,
    fixedBId,
  );
  const activeParticipantId = activePlayer === 'A' ? currentSideAId : currentSideBId;
  const fixedActivePlayer = activeParticipantId === fixedAId ? 'A' : activeParticipantId === fixedBId ? 'B' : activePlayer;
  const currentMove = $('#r-current-move'); if (currentMove) currentMove.textContent = latestMove?.pieceId
    ? `Lượt ${latestMove.turn ?? snapshot.turn} · ${replayParticipantName(currentParticipants, latestMovePlayer)}: ${replayCoordinate(latestMove.from)} → ${replayCoordinate(latestMove.to)}`
    : `Lượt ${snapshot.turn} · ${replayParticipantName(currentParticipants, snapshot.currentPlayer)} đang thực thi`;
  const latestParticipantId = latestMovePlayer === 'A' ? currentSideAId : latestMovePlayer === 'B' ? currentSideBId : null;
  // The move highlight follows the army that made the move in this game,
  // while the header identity remains fixed to the series competitor.
  currentMove?.classList.toggle('replay-current-move-a', latestMovePlayer === 'A');
  currentMove?.classList.toggle('replay-current-move-b', latestMovePlayer === 'B');
  const selected = $('#r-selected-move'); if (selected) selected.textContent = currentMove?.textContent || statusText;
  const turnDisplay = $('#r-turn-display'); if (turnDisplay) turnDisplay.textContent = `Lượt ${snapshot.turn}`;
  $('#r-p1-name').textContent = replayParticipantName(participants, 'A');
  $('#r-p2-name').textContent = replayParticipantName(participants, 'B');
  $('#r-p1-bot').textContent = participants.A?.botId ? `Bot ${shortId(participants.A.botId)}` : '';
  $('#r-p2-bot').textContent = participants.B?.botId ? `Bot ${shortId(participants.B.botId)}` : '';
  updateReplaySeriesScore(series?.winsA ?? 0, series?.winsB ?? 0);
  updateReplayTurnHighlight(fixedActivePlayer);
  $('#replay-content').hidden = false;
  const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = false;
  $('#replay-loading').hidden = true;
  $('#replay-error').hidden = true;
  renderReplayBoard(snapshot.state, latestMove);
  renderReplayPieceCounts(snapshot.state, {
    A: currentSideAId === fixedAId ? 'A' : 'B',
    B: currentSideBId === fixedAId ? 'A' : 'B',
  });
  if (series?.active && snapshot.status === 'finished') {
    const transition = $('#r-result-text');
    if (transition) transition.textContent = `Ván ${series.currentGame}/${series.bestOf} · Tỷ số ${series.winsA}-${series.winsB} · Đang chuyển sang Ván ${series.nextGame}`;
  }
}

function playLiveHistoryFrame() {
  const latest = state.liveLatestSnapshot;
  if (!latest || state.activeView !== 'replay-view') return;
  const frame = state.liveHistoryQueue.shift();
  const hasMove = Boolean(frame?.state?.lastMove || frame?.latestMove);
  if (frame) {
    renderLiveMatchSnapshot({
      ...latest,
      ...frame,
      series: latest.series,
      participants: latest.participants,
      // A history frame belongs to its own game. BO3 may swap sides between
      // games, so never reuse the latest game's side mapping for an older
      // frame; doing so labels a move with the wrong Bot name.
      currentParticipants: frame.currentParticipants || latest.currentParticipants,
      history: latest.history,
    });
    state.liveLastSequence = Math.max(state.liveLastSequence, Number(frame.sequence) || 0);
  }
  // Give each actual move enough time to be readable instead of flashing
  // through several turns when the live endpoint returns a burst of snapshots.
  state.liveHistoryTimer = state.liveHistoryQueue.length
    ? setTimeout(playLiveHistoryFrame, hasMove ? 900 : 800)
    : null;
  if (!state.liveHistoryTimer && state.livePendingSnapshot && !state.liveTransitionTimer) {
    const pending = state.livePendingSnapshot;
    const completedGame = state.liveHistoryGame;
    state.livePendingSnapshot = null;
    showLiveGameResultModal({ ...pending, status: 'finished' }, completedGame);
    const transitionToken = state.liveTransitionToken;
    state.liveTransitionTimer = setTimeout(() => {
      if (transitionToken !== state.liveTransitionToken || state.activeView !== 'replay-view') return;
      state.liveTransitionTimer = null;
      hideLiveGameResultModal();
      updateLiveHistory(pending);
    }, 300);
  }
}

function updateLiveHistory(snapshot) {
  // Series progress is authoritative during BO3 transitions. A completed
  // game snapshot may still be attached to the response while game 2/3 is
  // already active, so do not let the old frame pin the viewer to game 1.
  const game = snapshot.series?.currentGame || snapshot.gameNumber || 1;
  const currentGame = state.liveHistoryGame === null ? null : Number(state.liveHistoryGame);
  const incomingSequence = Number(snapshot.sequence) || 0;
  const lastSequence = Number(state.liveLastSequence) || 0;
  const previousAccepted = state.liveAcceptedSnapshot;
  const sameFrame = previousAccepted
    && Number(previousAccepted.gameNumber ?? previousAccepted.series?.currentGame ?? 1) === Number(game)
    && Number(previousAccepted.sequence) === incomingSequence
    && JSON.stringify(previousAccepted) === JSON.stringify(snapshot);
  const sameSequenceLifecycleUpdate = currentGame !== null && game === currentGame && incomingSequence === lastSequence && !sameFrame;
  if (currentGame !== null && (game < currentGame || (game === currentGame && incomingSequence < lastSequence))) return;
  if (sameFrame) return;
  state.liveAcceptedSnapshot = snapshot;
  if (snapshot.status === 'in_progress' && state.liveHistoryGame !== null && game > state.liveHistoryGame) {
    hideLiveGameResultModal();
  }
  const history = (snapshot.history || [])
    .filter(frame => (frame.gameNumber || 1) === game)
    .sort((left, right) => left.sequence - right.sequence);
  if (state.liveStreamMode) {
    state.liveHistoryGame = game;
    state.liveHistory = history;
    state.liveHistoryIndex = history.length;
    state.liveHistoryQueue = [];
    state.liveLastSequence = Number(snapshot.sequence) || Number(history.at(-1)?.sequence) || 0;
    if (state.liveHistoryTimer) clearTimeout(state.liveHistoryTimer);
    state.liveHistoryTimer = null;
    renderLiveMatchSnapshot(snapshot);
    return;
  }
  if (state.liveHistoryGame !== null && game > state.liveHistoryGame
    && (state.liveHistoryQueue.length || state.liveHistoryTimer)) {
    state.livePendingSnapshot = snapshot;
    return;
  }
  // Live view must open at the current snapshot. Replaying history from
  // turn one belongs to the explicit replay view, not to live spectating.
  if (state.liveHistoryGame !== game) {
    const previousGame = state.liveHistoryGame;
    state.liveHistoryGame = game;
    state.liveHistory = history;
    state.liveHistoryIndex = history.length;
    state.liveHistoryQueue = [];
    state.liveLastSequence = Number(snapshot.sequence) || Number(history.at(-1)?.sequence) || 0;
    if (state.liveHistoryTimer) clearTimeout(state.liveHistoryTimer);
    state.liveHistoryTimer = null;
    if (previousGame !== null && game > previousGame) {
      if (state.liveTransitionTimer) clearTimeout(state.liveTransitionTimer);
      state.livePendingSnapshot = snapshot;
      const resultText = $('#r-result-text');
      if (resultText) resultText.textContent = `Ván ${previousGame} hoàn tất · Tỷ số ${snapshot.series?.winsA ?? 0}-${snapshot.series?.winsB ?? 0} · Đang chuyển sang Ván ${game}`;
      const transitionToken = state.liveTransitionToken;
      state.liveTransitionTimer = setTimeout(() => {
        if (transitionToken !== state.liveTransitionToken || state.activeView !== 'replay-view') return;
        state.liveTransitionTimer = null;
        const pending = state.livePendingSnapshot;
        state.livePendingSnapshot = null;
        if (pending && state.activeView === 'replay-view') renderLiveMatchSnapshot(pending);
        if (!state.liveHistoryTimer && state.liveHistoryQueue.length) playLiveHistoryFrame();
      }, 0);
    } else {
      renderLiveMatchSnapshot(snapshot);
    }
  } else {
    state.liveHistory = history;
    if (sameSequenceLifecycleUpdate) renderLiveMatchSnapshot(snapshot);
    const queuedSequences = new Set(state.liveHistoryQueue.map(frame => Number(frame.sequence)));
    for (const frame of history) {
      const sequence = Number(frame.sequence) || 0;
      if (sequence > state.liveLastSequence && !queuedSequences.has(sequence)) state.liveHistoryQueue.push(frame);
    }
    state.liveHistoryQueue.sort((left, right) => (Number(left.sequence) || 0) - (Number(right.sequence) || 0));
  }
  if (!state.liveTransitionTimer && !state.liveHistoryTimer && state.liveHistoryQueue.length) playLiveHistoryFrame();
}

function scheduleLiveMatchPoll() {
  if (!state.liveMatchContext || state.activeView !== 'replay-view') return;
  if (state.liveMatchPollingTimer) return;
  const transitioning = state.liveLatestSnapshot?.status === 'finished' && state.liveLatestSnapshot?.series?.active;
  const baseDelay = transitioning ? 500 : 1500;
  const delay = Math.min(30_000, state.livePollBackoffMs || baseDelay) + Math.floor(Math.random() * 250);
  state.liveMatchPollingTimer = setTimeout(() => { void pollLiveMatch(); }, delay);
}

function startLiveMatchStream() {
  const context = state.liveMatchContext;
  const StreamCtor = typeof window !== 'undefined' ? window['Event' + 'Source'] : undefined;
  if (!context || typeof StreamCtor !== 'function') return false;
  const endpoint = `/api/tournaments/${context.tournamentId}/spectator/matches/${context.matchId}/live/stream`;
  const source = new StreamCtor(endpoint, { withCredentials: true });
  state.liveStreamSource = source;
  state.liveStreamMode = true;
  source.onmessage = event => {
    if (state.liveStreamSource !== source || state.liveMatchContext !== context || state.activeView !== 'replay-view') return;
    try {
      const raw = JSON.parse(event.data);
      if (raw.status === 'unavailable') {
        $('#replay-content').hidden = true;
        const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = true;
        $('#replay-loading').hidden = false;
        return;
      }
      const snapshot = normalizeSpectatorLive(raw);
      state.livePollBackoffMs = 0;
      state.liveLatestSnapshot = snapshot;
      updateLiveHistory(snapshot);
      if (snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'cancelled') {
        source.close();
        state.liveStreamSource = null;
      }
    } catch {
      // Ignore malformed individual events; the stream error handler will recover.
    }
  };
  source.onerror = () => {
    if (state.liveStreamSource !== source) return;
    source.close();
    state.liveStreamSource = null;
    scheduleLiveMatchPoll();
  };
  return true;
}

async function pollLiveMatch() {
  const context = state.liveMatchContext;
  if (!context || state.activeView !== 'replay-view') return;
  try {
    // Live snapshots are ephemeral; prevent an intermediary/browser cache
    // from returning the same turn (notably the old turn-100 snapshot).
    const endpoint = context.spectator
      ? `/tournaments/${context.tournamentId}/spectator/matches/${context.matchId}/live?ts=${Date.now()}`
      : `/tournaments/${context.tournamentId}/matches/${context.matchId}/live?ts=${Date.now()}`;
    const rawSnapshot = await api(endpoint);
    const snapshot = context.spectator ? normalizeSpectatorLive(rawSnapshot) : rawSnapshot;
    state.livePollBackoffMs = 0;
    if (state.liveMatchContext !== context || state.activeView !== 'replay-view') return;
    if (snapshot.status === 'unavailable') {
      $('#replay-content').hidden = true;
      const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = true;
      $('#replay-loading').hidden = false;
      const resultText = $('#r-result-text'); if (resultText) resultText.textContent = 'Chưa có dữ liệu trực tiếp';
      scheduleLiveMatchPoll();
      return;
    }
    state.liveLatestSnapshot = snapshot;
    updateLiveHistory(snapshot);
    if (snapshot.status === 'in_progress' || snapshot.series?.active) scheduleLiveMatchPoll();
  } catch (error) {
    $('#replay-content').hidden = true;
    const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = true;
    $('#replay-loading').hidden = false;
    if (state.liveMatchContext !== context || state.activeView !== 'replay-view') return;
    if (error?.status === 429) state.livePollBackoffMs = Math.min(30_000, Math.max(3_000, (state.livePollBackoffMs || 1500) * 2));
    const resultText = $('#r-result-text'); if (resultText) resultText.textContent = error.message || 'Không thể tải dữ liệu trực tiếp';
    scheduleLiveMatchPoll();
  }
}

function normalizeSpectatorLive(response) {
  const game = response.game;
  const series = response.series || {};
  const frame = game ? {
    matchId: response.matchId,
    gameNumber: game.gameNumber,
    status: game.status,
    sequence: game.sequence,
    turn: game.turn,
    currentPlayer: game.currentPlayer,
    state: game.board,
    latestMove: game.latestMove,
    outcome: game.outcome,
    winner: game.outcome?.winner || null,
    updatedAt: game.observedAt,
  } : null;
  const history = (response.history || []).map(item => ({
    ...item,
    matchId: response.matchId,
    state: item.board,
    latestMove: item.latestMove,
    updatedAt: item.observedAt,
    status: item.status,
    sequence: item.sequence,
    turn: item.turn,
    currentPlayer: item.currentPlayer,
    gameNumber: item.gameNumber,
    currentParticipants: {
      A: item.sideA ? { participantId: item.sideA.participantId, participantName: item.sideA.name } : null,
      B: item.sideB ? { participantId: item.sideB.participantId, participantName: item.sideB.name } : null,
    },
  }));
  return {
    ...frame,
    ...(frame || { matchId: response.matchId, status: response.status, gameNumber: series.currentGameNumber || 1, sequence: 0, turn: 0, currentPlayer: 'A', state: null, latestMove: null, updatedAt: new Date().toISOString() }),
    status: response.status === 'between_games' ? 'finished' : response.status,
    history,
    series: {
      format: series.format,
      bestOf: series.bestOf,
      currentGame: series.currentGameNumber,
      competitorA: series.competitorX,
      competitorB: series.competitorY,
      winsA: series.score?.A ?? 0,
      winsB: series.score?.B ?? 0,
      winner: series.winner ?? null,
      active: response.status === 'in_progress' || response.status === 'between_games',
    },
    participants: {
      A: series.competitorX ? { participantId: series.competitorX.participantId, participantName: series.competitorX.name } : null,
      B: series.competitorY ? { participantId: series.competitorY.participantId, participantName: series.competitorY.name } : null,
    },
    currentParticipants: {
      A: game?.sideA ? { participantId: game.sideA.participantId, participantName: game.sideA.name } : null,
      B: game?.sideB ? { participantId: game.sideB.participantId, participantName: game.sideB.name } : null,
    },
    historyTruncated: response.historyTruncated,
  };
}

function openLiveMatch(tournamentId, matchId, pairingId = null) {
  stopReplayPlayback();
  stopLiveMatchPolling();
  hideLiveGameResultModal();
  // Game selector buttons belong to replay navigation, not live viewing.
  document.querySelector('#replay-series-controls')?.remove();
  const inferredPairingId = pairingId || (String(matchId).startsWith(`${tournamentId}-`) ? String(matchId).slice(String(tournamentId).length + 1) : null);
  state.liveMatchContext = { tournamentId, matchId, pairingId: inferredPairingId, spectator: state.spectatorMode === true };
  state.replayMatchId = matchId;
  $('#replay-view').classList.add('live-match-view');
  $('#replay-view-kicker').textContent = 'XEM TRỰC TIẾP TRẬN ĐẤU';
  setReplayBackLabel('Quay lại chi tiết giải đấu');
  $('#replay-view-title').textContent = 'Diễn biến trận đấu';
  $('#replay-content').hidden = true;
  const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = true;
  $('#replay-error').hidden = true;
  $('#replay-loading').hidden = false;
  $('#replay-loading').textContent = 'Đang kết nối dữ liệu trực tiếp…';
  navigate('replay-view');
  state.liveMatchContext = { tournamentId, matchId, pairingId: inferredPairingId, spectator: state.spectatorMode === true };
  if (!startLiveMatchStream()) void pollLiveMatch();
  if (!inferredPairingId) {
    void request(`/tournaments/${tournamentId}`).then(tournament => {
      const pairing = tournament.rounds?.flatMap(round => round.pairings || []).find(item => item.matchId === matchId);
      if (state.liveMatchContext?.matchId !== matchId || !pairing) return;
      state.liveMatchContext.pairingId = pairing.pairingId;
    }).catch(() => {});
  }
}

function closeReplay() {
  stopReplayPlayback();
  stopLiveMatchPolling();
  const isPracticeReplay = state.replayContext?.practice === true;
  state.replay = null;
  state.replaySeries = null;
  state.replayGameIndex = 0;
  state.replayContext = null;
  state.replayMatchId = null;
  state.replayMoveIndex = -1;
  state.replayLoading = false;
  state.liveMatchContext = null;
  state.liveMatchSnapshot = null;
  if (isPracticeReplay) {
    state.practiceAbortController?.abort();
    state.practiceAbortController = null;
    clearPracticeResult();
    state.practiceReplay = null;
    state.practiceReplayMoveIndex = -1;
    state.practiceRevision = null;
    state.practiceDraft = null;
    state.practiceRequestToken += 1;
  }
  navigate(isPracticeReplay ? 'bot-workspace' : 'tournament-detail');
}

function setReplayLoading(isLoading) {
  state.replayLoading = isLoading;
  const loading = $('#replay-loading');
  const content = $('#replay-content');
  if (loading) loading.hidden = !isLoading;
  if (content) content.hidden = isLoading;
  if (isLoading) {
    const seriesCard = $('#replay-series-card');
    if (seriesCard) seriesCard.hidden = true;
    document.querySelector('#replay-view .replay-player-a-label')?.classList.remove('is-winner');
    document.querySelector('#replay-view .replay-player-b-label')?.classList.remove('is-winner');
  }
}

/* ==================== MODULE: replay.js ==================== */
function stopReplayPlayback() {
  if (state.replayTimer) clearTimeout(state.replayTimer);
  state.replayTimer = null;
  state.replayPlaybackActive = false;
  state.replayPlaybackToken = (state.replayPlaybackToken || 0) + 1;
  const button = $('#btn-replay-play');
  if (button) {
    const label = button.querySelector('.replay-control-label'); if (label) label.textContent = 'Phát';
    const playIcon = button.querySelector('use'); if (playIcon) playIcon.setAttribute('href', '#icon-play');
    button.setAttribute('aria-label', 'Phát'); button.setAttribute('title', 'Phát');
    button.setAttribute('aria-pressed', 'false');
  }
}

function setReplayBackLabel(label) {
  const target = $('#replay-back-label');
  if (target) target.textContent = label;
}


function formatReplayReason(reason) { return localizeReason(reason); }

function replayResultLabel(replay) {
  if (replay.winner === 'A') return 'Người chơi A chiến thắng';
  if (replay.winner === 'B') return 'Người chơi B chiến thắng';
  if (replay.winner === 'draw') return 'Trận hòa';
  return replay.terminationReason ? 'Trận đấu đã kết thúc' : 'Trận đấu chưa hoàn tất';
}

function replayWinnerLabel(replay) {
  // A selected BO2/BO3 game can have a local winner side that differs from
  // the aggregate series winner. Prefer the series winner whenever the
  // replay envelope contains a series result.
  const winner = replay?.series?.winner ?? replay?.winner;
  if (winner === 'A' || winner === 'B') {
    const identity = replay.participantIdentities?.[winner]?.participantName;
    return identity ? `${identity} chiến thắng` : replayResultLabel(replay);
  }
  if (winner === 'draw') return 'Hòa';
  return '—';
}

function getActiveReplay() {
  return state.replay;
}

function renderReplaySeriesControls(replay) {
  const existing = $('#replay-series-controls');
  if (existing) existing.remove();
  if (!Array.isArray(replay?.series?.games) || !replay.series.games.length) return;
  const controls = create('div', { className: 'replay-series-controls', attrs: { id: 'replay-series-controls', role: 'group', 'aria-label': 'Chọn ván trong series BO3' } });
  const identities = Object.values(replay.participantIdentities || {}).filter(Boolean);
  const names = new Map(identities.map(identity => [identity.participantId, identity.participantName]));
  const seriesLabel = replay.series.format?.toUpperCase() || `BO${replay.series.bestOf || 3}`;
  controls.setAttribute('aria-label', `Chá»n vÃ¡n trong series ${seriesLabel}`);
  replay.series.games.forEach((game, index) => {
    const available = isReplayShape(game.replay);
    const sideA = names.get(game.participantA) || game.participantA;
    const sideB = names.get(game.participantB) || game.participantB;
    const result = game.winnerParticipantId ? ` · ${names.get(game.winnerParticipantId) || game.winnerParticipantId} thắng` : ' · Hòa';
    const button = actionButton(`Ván ${game.gameNumber}: ${sideA} / ${sideB}${result}`, () => selectReplayGame(index), `replay-series-game:${index}`, 'secondary-btn');
    button.classList.toggle('active', index === state.replayGameIndex);
    button.textContent = `Ván ${game.gameNumber}`;
    button.disabled = !available;
    if (!available) button.title = 'Ván đấu này không có dữ liệu xem lại hợp lệ.';
    controls.appendChild(button);
  });
  $('#replay-series-slot')?.appendChild(controls);
}

function selectReplayGame(index) {
  const game = state.replaySeries?.series?.games?.[index];
  if (!isReplayShape(game?.replay)) return;
  stopReplayPlayback();
  state.replayGameIndex = index;
  state.replay = game.replay;
  document.querySelector('#replay-view .replay-player-a-label')?.classList.remove('is-winner');
  document.querySelector('#replay-view .replay-player-b-label')?.classList.remove('is-winner');
  renderReplaySeriesControls(state.replaySeries);
  renderReplaySummaryV2(state.replaySeries);
  goToReplayTurn(-1);
}

function isReplayShape(replay) {
  return replay && replay.initialState && Number(replay.initialState.boardSize) === 9
    && Array.isArray(replay.initialState.pieces) && Array.isArray(replay.moves)
    && replay.finalState && Number(replay.finalState.boardSize) === 9;
}

function availableSeriesReplayIndexes(replay) {
  return Array.isArray(replay?.series?.games)
    ? replay.series.games.map((game, index) => isReplayShape(game?.replay) ? index : -1).filter(index => index >= 0)
    : [];
}

function applyReplayParticipantIdentities(replay) {
  const identities = replay.participantIdentities || {};
  const revisions = replay.metadata?.sourceRevisions || [];
  const runtimeLabel = runtime => runtime === 'cpp' ? 'C++17' : runtime === 'python3' ? 'Python 3' : '';
  const renderIdentity = (side, fallback) => {
    const identity = identities[side] || {};
    const revision = revisions.find(item => item.player === side);
    const participantName = identity.participantName || fallback;
    $(`#r-p${side === 'A' ? '1' : '2'}-name`).textContent = participantName;
    // In practice matches the participant and bot can intentionally have the
    // same display name. Do not render the same name twice in the header.
    const botName = identity.botName && identity.botName !== participantName ? identity.botName : '';
    const details = [botName, runtimeLabel(identity.runtimeId || revision?.runtimeId), revision?.revisionId ? `Revision ${shortId(revision.revisionId)}` : ''].filter(Boolean).join(' · ');
    $(`#r-p${side === 'A' ? '1' : '2'}-bot`).textContent = details;
  };
  renderIdentity('A', 'Người chơi A');
  renderIdentity('B', 'Người chơi B');
}

function renderReplaySummary(replay) {
  const title = $('#replay-view-title'); if (title) title.textContent = `Trận đấu ${shortId(replay.matchId || state.replayMatchId)}`;
  $('#r-match-id').textContent = String(replay.matchId || state.replayMatchId || 'â€”');
  $('#replay-scrubber').max = String(Math.max(-1, replay.moves.length - 1));
  applyReplayParticipantIdentities(replay);
  // Practice replays are BO1 and use this legacy summary renderer. The score
  // cards must still reflect the completed result instead of staying at 0-0.
  updateReplaySeriesScore(replay.winner === 'A' ? 1 : 0, replay.winner === 'B' ? 1 : 0);
  $('#r-result-text').textContent = `${replayResultLabel(replay)} · ${formatReplayReason(replay.terminationReason)}`;
  const winnerText = replayWinnerLabel(replay);
  const winnerEl = $('#r-winner');
  if (winnerEl) {
    winnerEl.textContent = (replay.winner === 'A' || replay.winner === 'B') ? `🏆 ${winnerText}` : winnerText;
    winnerEl.classList.toggle('has-winner', replay.winner === 'A' || replay.winner === 'B');
  }
  $('#r-termination').textContent = formatReplayReason(replay.terminationReason) || 'Chưa xác định';
  $('#r-protocol').textContent = String(replay.protocolVersion || 'unknown');
  const statusBadge = $('#replay-status-badge'); if (statusBadge) statusBadge.textContent = 'Đã hoàn thành';
  const contextNote = $('#replay-context-note'); if (contextNote) contextNote.textContent = state.replayContext?.practice ? 'Trận đấu thử' : 'Trận BO1';
  const boardTitle = $('#replay-board-title'); if (boardTitle) boardTitle.textContent = 'Ván 1 · Diễn biến';
  const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = false;
}

function replayParentSeries() {
  return state.replaySeries?.series || state.replayContext?.seriesContext || null;
}

function replayParentSeriesEnvelope() {
  if (state.replaySeries) return state.replaySeries;
  const series = replayParentSeries();
  return series ? { series, participantIdentities: series.participantIdentities || {}, winner: series.winner } : null;
}

function replaySeriesDrawCount(series) {
  return (series?.games || []).filter(game => game?.winner === 'draw' || game?.winnerParticipantId === null).length;
}

function replaySeriesScoreText(series) {
  const label = series?.format?.toUpperCase() || `BO${series?.bestOf || 3}`;
  const draws = replaySeriesDrawCount(series);
  return `${label} · Tỷ số ${series?.winsA || 0}-${series?.winsB || 0}${draws ? ` · ${draws} hòa` : ''}`;
}

function renderReplaySummaryV2Base(replay) {
  const active = state.replay || replay;
  const seriesEnvelope = replayParentSeriesEnvelope();
  const series = seriesEnvelope?.series;
  const title = $('#replay-view-title');
  if (title) title.textContent = series ? `Series ${series.format?.toUpperCase() || `BO${series.bestOf || 3}`}` : `Trận đấu ${shortId(active.matchId || state.replayMatchId)}`;
  $('#r-match-id').textContent = String(seriesEnvelope?.matchId || active.matchId || state.replayMatchId || '—');
  $('#replay-scrubber').max = String(Math.max(-1, active.moves.length - 1));
  // BO3 can swap temporary sides A/B. Keep the aggregate series identities
  // in the header while the board uses the selected game's replay.
  const identityReplay = series && seriesEnvelope?.participantIdentities
    ? { ...active, participantIdentities: seriesEnvelope.participantIdentities, metadata: seriesEnvelope.metadata }
    : active;
  applyReplayParticipantIdentities(identityReplay);
  if (series) {
    const identities = seriesEnvelope?.participantIdentities || {};
    const playerAId = identities.A?.participantId;
    const playerBId = identities.B?.participantId;
    const selectedIndex = Math.max(0, Math.min(Number(state.replayGameIndex) || 0, series.games.length - 1));
    updateReplaySeriesSideColors(series.games[selectedIndex], playerAId, playerBId);
    const visibleGames = series.games.slice(0, selectedIndex + 1);
    // A/ B are game-local sides and may be swapped between BO3 games. Prefer
    // the immutable participant identity; only fall back to the local side
    // when a legacy game record does not include winnerParticipantId.
    const winnerParticipantId = game => game?.winnerParticipantId
      ?? (game?.winner === 'A' ? game.participantA : game?.winner === 'B' ? game.participantB : null);
    const scoreA = visibleGames.filter(game => winnerParticipantId(game) === playerAId).length;
    const scoreB = visibleGames.filter(game => winnerParticipantId(game) === playerBId).length;
    const shownScoreA = playerAId ? scoreA : series.winsA;
    const shownScoreB = playerBId ? scoreB : series.winsB;
    updateReplaySeriesScore(shownScoreA, shownScoreB);
    $('#r-result-text').textContent = `${replaySeriesScoreText(series)} · ${replayWinnerLabel(seriesEnvelope)}`;
    $('#r-winner').textContent = replayWinnerLabel(seriesEnvelope);
    $('#r-termination').textContent = `Đã đấu ${series.games.length} ván`;
    const contextNote = $('#replay-context-note'); if (contextNote) contextNote.textContent = `Trận ${series.format?.toUpperCase() || `BO${series.bestOf || 3}`} · Ván ${(Number(state.replayGameIndex) || 0) + 1}/${series.games.length}`;
    const boardTitle = $('#replay-board-title'); if (boardTitle) boardTitle.textContent = `Ván ${selectedIndex + 1} · Diễn biến`;
  } else {
    updateReplaySeriesScore(active.winner === 'A' ? 1 : 0, active.winner === 'B' ? 1 : 0);
    $('#r-result-text').textContent = `${replayResultLabel(active)} · ${formatReplayReason(active.terminationReason)}`;
    $('#r-winner').textContent = replayWinnerLabel(active);
    $('#r-termination').textContent = formatReplayReason(active.terminationReason) || 'Chưa xác định';
    const contextNote = $('#replay-context-note'); if (contextNote) contextNote.textContent = 'Trận BO1';
    const boardTitle = $('#replay-board-title'); if (boardTitle) boardTitle.textContent = 'Ván 1 · Diễn biến';
  }
  $('#r-protocol').textContent = String(active.protocolVersion || 'unknown');
  const statusBadge = $('#replay-status-badge'); if (statusBadge) statusBadge.textContent = 'Đã hoàn thành';
  const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = false;
}

function renderReplaySummaryV2(replay) {
  renderReplaySummaryV2Base(replay);
  const series = replayParentSeries();
  if (!series) return;
  const seriesLabel = series.format?.toUpperCase() || `BO${series.bestOf || 3}`;
  const active = state.replay || replay;
  const title = $('#replay-view-title'); if (title) title.textContent = `Series ${seriesLabel} · Ván ${(Number(state.replayGameIndex) || 0) + 1}`;
  const result = $('#r-result-text'); if (result) result.textContent = `${replaySeriesScoreText(series)} · ${replayWinnerLabel(replayParentSeriesEnvelope())}`;
  const contextNote = $('#replay-context-note'); if (contextNote) contextNote.textContent = `Trận ${seriesLabel} · Ván ${(Number(state.replayGameIndex) || 0) + 1}/${series.games.length}`;
  const boardTitle = $('#replay-board-title'); if (boardTitle) boardTitle.textContent = `Ván ${(Number(state.replayGameIndex) || 0) + 1} · Diễn biến`;
  if (active) $('#r-match-id').textContent = String(replayParentSeriesEnvelope()?.matchId || active.matchId || state.replayMatchId || '—');
}

class PublicReplayTerminalError extends Error {
  constructor(message) { super(message); this.name = 'PublicReplayTerminalError'; this.publicReplayTerminal = true; }
}

class PublicReplayUnavailableError extends Error {
  constructor(message) { super(message); this.name = 'PublicReplayUnavailableError'; this.publicReplayRecoverable = true; }
}

function publicReplayBaseUrl() {
  const configured = typeof window !== 'undefined' ? window.OTT_PUBLIC_REPLAY_BASE_URL : '';
  if (typeof configured !== 'string' || !configured.trim()) return null;
  try {
    const url = new URL(configured, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('invalid public replay base');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    url.search = '';
    return url;
  } catch {
    throw new PublicReplayTerminalError('Cấu hình replay công khai không hợp lệ.');
  }
}

function publicReplaySafeId(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value); }
function publicReplayHash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }

function publicReplayUrl(base, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\') || relativePath.includes('%')) {
    throw new PublicReplayTerminalError('Đường dẫn replay công khai không hợp lệ.');
  }
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(relativePath) || relativePath.split('/').some(part => part === '..' || part === '.')) {
    throw new PublicReplayTerminalError('Đường dẫn replay công khai không an toàn.');
  }
  const resolved = new URL(relativePath, base);
  if (resolved.origin !== base.origin || resolved.search || resolved.hash) throw new PublicReplayTerminalError('Đường dẫn replay công khai không an toàn.');
  return resolved;
}

async function publicReplayFetchJson(url, missingMessage) {
  let response;
  try { response = await fetch(url, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } }); }
  catch { throw new PublicReplayUnavailableError('Không thể kết nối kho replay công khai.'); }
  if (response.status === 404) throw new PublicReplayUnavailableError(missingMessage);
  if (!response.ok) throw new PublicReplayTerminalError(`Kho replay công khai trả về lỗi ${response.status}.`);
  let bytes;
  try { bytes = await response.arrayBuffer(); }
  catch { throw new PublicReplayUnavailableError('Không thể đọc dữ liệu replay công khai.'); }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new PublicReplayTerminalError('Dữ liệu replay công khai không hợp lệ.'); }
}

async function publicReplaySha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new PublicReplayTerminalError('Trình duyệt không hỗ trợ kiểm tra toàn vẹn replay.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function publicReplayShapeMatches(replay, requestedMatchId) {
  if (!isReplayShape(replay)) return false;
  if (replay.matchId === requestedMatchId) return true;
  return Array.isArray(replay.series?.games) && replay.series.games.some(game => game?.matchId === requestedMatchId && isReplayShape(game.replay));
}

async function loadPublicReplay(tournamentId, requestedMatchId, seriesContext = null) {
  const base = publicReplayBaseUrl();
  if (!base) return null;
  if (!publicReplaySafeId(tournamentId) || !publicReplaySafeId(requestedMatchId)) throw new PublicReplayTerminalError('Định danh replay công khai không hợp lệ.');
  const manifestUrl = publicReplayUrl(base, `tournaments/${tournamentId}/index.json`);
  const manifest = await publicReplayFetchJson(manifestUrl, 'Không tìm thấy manifest replay công khai.');
  if (!manifest || manifest.schemaVersion !== 1 || manifest.tournamentId !== tournamentId) throw new PublicReplayTerminalError('Manifest replay công khai không hợp lệ.');
  if (manifest.status !== 'published') throw new PublicReplayTerminalError('Replay công khai đã bị thu hồi hoặc chưa được phát hành.');
  if (!Array.isArray(manifest.entries)) throw new PublicReplayTerminalError('Manifest replay công khai không hợp lệ.');
  const aggregateMatchId = publicReplaySafeId(seriesContext?.matchId) ? seriesContext.matchId : requestedMatchId;
  const entry = manifest.entries.find(item => item?.matchId === aggregateMatchId);
  if (!entry || !publicReplaySafeId(entry.matchId) || !publicReplayHash(entry.replayHash) || entry.matchId !== aggregateMatchId) {
    throw new PublicReplayUnavailableError('Không tìm thấy replay công khai cho trận đấu này.');
  }
  const expectedPath = `tournaments/${tournamentId}/matches/${entry.matchId}-${entry.replayHash}.json`;
  if (entry.path !== expectedPath || entry.sha256 !== entry.replayHash) throw new PublicReplayTerminalError('Manifest replay công khai không toàn vẹn.');
  const replayUrl = publicReplayUrl(base, entry.path);
  let response;
  try { response = await fetch(replayUrl, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } }); }
  catch { throw new PublicReplayUnavailableError('Không thể kết nối replay công khai.'); }
  if (response.status === 404) throw new PublicReplayUnavailableError('Không tìm thấy tệp replay công khai.');
  if (!response.ok) throw new PublicReplayTerminalError(`Tệp replay công khai trả về lỗi ${response.status}.`);
  let bytes;
  try { bytes = await response.arrayBuffer(); }
  catch { throw new PublicReplayUnavailableError('Không thể đọc tệp replay công khai.'); }
  if (await publicReplaySha256(bytes) !== entry.replayHash) throw new PublicReplayTerminalError('Replay công khai không vượt qua kiểm tra SHA-256.');
  let replay;
  try { replay = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new PublicReplayTerminalError('JSON replay công khai không hợp lệ.'); }
  if (!publicReplayShapeMatches(replay, requestedMatchId)) throw new PublicReplayTerminalError('Replay công khai không khớp với trận đấu được yêu cầu.');
  return replay;
}

async function loadReplayWithAuthorizedFallback(tournamentId, matchId, seriesContext = null) {
  let publicReplayError = null;
  try {
    const replay = await loadPublicReplay(tournamentId, matchId, seriesContext);
    if (replay) return replay;
  } catch (error) {
    publicReplayError = error;
  }
  // A static export is deliberately public-only.  It must not turn a revoked,
  // corrupt or missing public artifact into an API request just because the
  // embedding page happens to have an application session.
  if (typeof window !== 'undefined' && window.OTT_PUBLIC_REPLAY_STATIC_ONLY) {
    throw publicReplayError || new Error('Replay công khai không khả dụng.');
  }
  if (!await ensureReplaySession()) throw publicReplayError || new Error('Cần đăng nhập để xem replay này.');
  return api(state.spectatorMode
    ? `/tournaments/${tournamentId}/spectator/matches/${matchId}/replay`
    : `/tournaments/${tournamentId}/replays/${matchId}`);
}

function replayPieceSideMap() {
  const series = replayParentSeries();
  const identities = replayParentSeriesEnvelope()?.participantIdentities || {};
  const selectedGame = series?.games?.[Math.max(0, Number(state.replayGameIndex) || 0)];
  if (!selectedGame || !identities.A?.participantId || !identities.B?.participantId) {
    return { A: 'A', B: 'B' };
  }
  return {
    A: selectedGame.participantA === identities.A.participantId ? 'A' : 'B',
    B: selectedGame.participantA === identities.B.participantId ? 'A' : 'B',
  };
}

function renderReplayPieceCounts(board, sideMap = replayPieceSideMap()) {
  const labels = { dam: 'B\u00faa', la: 'Bao', keo: 'K\u00e9o' };
  ['A', 'B'].forEach(fixedSide => {
    const boardSide = sideMap[fixedSide] || fixedSide;
    const counts = { dam: 0, la: 0, keo: 0 };
    board.pieces.filter(piece => piece.player === boardSide).forEach(piece => {
      if (Object.hasOwn(counts, piece.type)) counts[piece.type] += 1;
    });
    const target = $(`#r-p${fixedSide === 'A' ? '1' : '2'}-pieces`);
    if (!target) return;
    target.replaceChildren();
    Object.entries(labels).forEach(([type, label], index) => {
      const item = create('span', {
        className: 'replay-piece-count',
        attrs: { 'aria-label': `${label} ${counts[type]}` },
      });
      const pieceIcon = icon(PIECE_TYPES[type]);
      pieceIcon.classList.add('replay-count-icon');
      pieceIcon.setAttribute('aria-hidden', 'true');
      item.append(pieceIcon, create('span', { className: 'replay-count-value', text: `×${counts[type]}` }));
      target.append(item);
      if (index < Object.keys(labels).length - 1) target.append(create('span', { className: 'replay-piece-count-separator', text: '·', attrs: { 'aria-hidden': 'true' } }));
    });
  });
}

async function playReplay(tournamentId, matchId, seriesContext = null) {
  closeModal('tiebreaker-resolution-modal');
  stopReplayPlayback();
  stopLiveMatchPolling();
  $('#replay-view').classList.remove('live-match-view');
  $('#replay-view-kicker').textContent = 'XEM LẠI TRẬN ĐẤU';
  setReplayBackLabel('Quay lại chi tiết giải đấu');
  state.tournamentId = tournamentId;
  const authRevision = state.authRevision;
  const sourceViewRevision = state.viewRevision;
  const replayRevision = ++state.replayRevision;
  state.replayContext = { tournamentId, matchId, authRevision, sourceViewRevision, seriesContext };
  state.replay = null;
  state.replaySeries = null;
  state.replayMatchId = matchId;
  state.replayMoveIndex = -1;
  renderReplaySeriesControls(null);
  $('#replay-error').hidden = true;
  setReplayLoading(true);
  navigate('replay-view');
  const replayViewRevision = state.viewRevision;
  let replay;
  try {
    replay = await loadReplayWithAuthorizedFallback(tournamentId, matchId, seriesContext);
    if (!isReplayShape(replay)) throw new Error('Dữ liệu xem lại không hợp lệ.');
    if (replay.series && !availableSeriesReplayIndexes(replay).length) throw new Error('Series không có ván nào có dữ liệu xem lại hợp lệ.');
  }
  catch (error) {
    if (state.authRevision === authRevision && state.replayRevision === replayRevision && state.activeView === 'replay-view'
      && state.replayContext?.tournamentId === tournamentId && state.replayContext?.matchId === matchId) {
      setReplayLoading(false);
      $('#replay-content').hidden = true;
      const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = true;
      $('#replay-error-message').textContent = error.message || 'Không thể tải dữ liệu xem lại.';
      $('#replay-error').hidden = false;
    }
    return;
  }
  const staticReplayOnly = typeof window !== 'undefined' && window.OTT_PUBLIC_REPLAY_STATIC_ONLY === true;
  if ((!state.user && !staticReplayOnly) || state.authRevision !== authRevision || state.replayRevision !== replayRevision
    || state.activeView !== 'replay-view' || state.viewRevision !== replayViewRevision
    || state.tournamentId !== tournamentId || state.replayContext?.matchId !== matchId) return;
  state.replay = replay;
  state.replaySeries = replay.series ? replay : null;
  const availableIndexes = availableSeriesReplayIndexes(replay);
  const requestedGameNumber = seriesContext?.games?.find(game => game.matchId === matchId)?.gameNumber;
  const requestedGameIndex = replay.series?.games?.findIndex(game => game.matchId === matchId
    || (requestedGameNumber !== undefined && Number(game.gameNumber) === Number(requestedGameNumber))) ?? -1;
  state.replayGameIndex = availableIndexes.includes(requestedGameIndex)
    ? requestedGameIndex
    : (availableIndexes[0] ?? 0);
  if (state.replaySeries?.series?.games?.[state.replayGameIndex]?.replay) state.replay = state.replaySeries.series.games[state.replayGameIndex].replay;
  state.replayContext.replayViewRevision = replayViewRevision;
  renderReplaySeriesControls(replay);
  renderReplaySummaryV2(replay);
  setReplayLoading(false);
  goToReplayTurn(-1);
}

function retryReplay() {
  if (!state.replayContext) return;
  void playReplay(state.replayContext.tournamentId, state.replayContext.matchId, state.replayContext.seriesContext || null);
}

function buildStateAt(moveIndex) {
  if (!state.replay || !state.replay.initialState || !Array.isArray(state.replay.initialState.pieces)) return null;
  const board = { ...state.replay.initialState, pieces: state.replay.initialState.pieces.map(piece => ({ ...piece })) };
  for (let index = 0; index <= moveIndex; index += 1) {
    const move = state.replay.moves[index]; if (!move) continue;
    const piece = board.pieces.find(candidate => candidate.id === move.pieceId);
    if (!piece || !move.to) continue;
    if (move.captures) {
      const captured = board.pieces.find(candidate => candidate.id === move.captures);
      if (captured && state.replay.ruleModifiers?.conversion) {
        captured.player = move.player;
        captured.row = piece.row;
        captured.col = piece.col;
      } else {
        board.pieces = board.pieces.filter(candidate => candidate.id !== move.captures);
      }
    }
    piece.row = move.to.row; piece.col = move.to.col;
    board.currentPlayer = move.player === 'A' ? 'B' : 'A';
    board.turn = Number(move.turn) + 1;
  }
  return board;
}

function renderReplayBoard(board, liveMove = null) {
  const element = $('#r-board'); clear(element);
  const lastMove = liveMove || (state.replayMoveIndex >= 0 ? state.replay.moves[state.replayMoveIndex] : null);
  const previousBoard = state.replayMoveIndex > 0 ? buildStateAt(state.replayMoveIndex - 1) : state.replay?.initialState;
  const capturedPiece = lastMove?.captures && previousBoard?.pieces?.find(piece => piece.id === lastMove.captures);
  const boardSize = Number(board.boardSize) === 9 ? 9 : 0;
  if (!boardSize) {
    element.appendChild(create('p', { className: 'ui-message', text: 'Bản xem lại này có kích thước bàn cờ không được hỗ trợ.' }));
    return;
  }
  const columns = 'abcdefghi';
  for (let row = 0; row < boardSize; row += 1) for (let col = 0; col < boardSize; col += 1) {
    const coordinate = `${columns[col]}${row + 1}`;
    const cell = create('div', { className: 'replay-cell', attrs: { role: 'gridcell', 'aria-label': `${coordinate}, ô trống` } });
    if (lastMove?.pieceId && lastMove.from?.row === row && lastMove.from?.col === col) cell.classList.add('move-from');
    if (lastMove?.pieceId && lastMove.to?.row === row && lastMove.to?.col === col) cell.classList.add('move-to');
    if (capturedPiece?.row === row && capturedPiece?.col === col) cell.classList.add('capture');
    const goal = row === 0 && col === 0
      ? 'Mục tiêu của người chơi B'
      : row === 8 && col === 8 ? 'Mục tiêu của người chơi A' : '';
    if (goal) {
      cell.classList.add('goal');
      cell.setAttribute('aria-label', `${coordinate}, ${goal}, ô trống`);
    }
    const piece = board.pieces.find(candidate => candidate.row === row && candidate.col === col);
    if (piece) {
      const isPlayerA = piece.player === 'A';
      const isGoalReached = (row === 8 && col === 8 && isPlayerA) || (row === 0 && col === 0 && !isPlayerA);
      if (isGoalReached) {
        cell.classList.add('goal-reached', 'victory-cell');
      }
      const label = `Người chơi ${piece.player}, ${PIECE_LABELS[piece.type] || piece.type}${isGoalReached ? ' (ĐẠT Ô ĐÍCH CHIẾN THẮNG)' : ''}`;
      const token = create('span', { className: `replay-piece replay-player-${piece.player.toLowerCase()}${isGoalReached ? ' victory-piece' : ''}`, attrs: { 'aria-label': label, title: label } });
      const symbolId = PIECE_TYPES[piece.type];
      if (symbolId) token.appendChild(icon(symbolId));
      else token.textContent = '?';
      cell.setAttribute('aria-label', `${coordinate}, ${goal ? `${goal}, ` : ''}${label}`);
      cell.appendChild(token);
    }
    element.appendChild(cell);
  }
}

function getReplayWinningParticipantSlot() {
  const replay = state.replay;
  if (!replay) return null;
  const matchWinner = replay.winner;
  if (matchWinner !== 'A' && matchWinner !== 'B') return null;

  // Case 1: BO3 Series Game
  if (state.replaySeries?.series?.games) {
    const series = state.replaySeries.series;
    const selectedIndex = Math.max(0, Math.min(Number(state.replayGameIndex) || 0, series.games.length - 1));
    const currentGame = series.games[selectedIndex];
    const identities = state.replaySeries.participantIdentities || {};
    const playerAId = identities.A?.participantId;
    const playerBId = identities.B?.participantId;

    if (currentGame) {
      const winnerId = currentGame.winnerParticipantId || (
        currentGame.winner === 'A' ? currentGame.participantA :
        currentGame.winner === 'B' ? currentGame.participantB : null
      );
      if (winnerId && playerAId && winnerId === playerAId) return 'A';
      if (winnerId && playerBId && winnerId === playerBId) return 'B';
    }
  }

  // Case 2: Swapped side classes on participant labels
  const playerAEl = document.querySelector('#replay-view .replay-player-a-label');
  const playerBEl = document.querySelector('#replay-view .replay-player-b-label');
  if (playerAEl && playerBEl) {
    if (playerAEl.classList.contains('is-current-side-b')) {
      return matchWinner === 'B' ? 'A' : 'B';
    }
    if (playerAEl.classList.contains('is-current-side-a')) {
      return matchWinner === 'A' ? 'A' : 'B';
    }
  }

  // Case 3: Standard BO1 / Practice matches
  return matchWinner === 'A' ? 'A' : 'B';
}

function goToReplayTurn(index) {
  if (!state.replay || state.activeView !== 'replay-view') return;
  state.replayMoveIndex = Math.max(-1, Math.min(index, state.replay.moves.length - 1));
  $('#r-turn-display').textContent = `${Math.max(0, state.replayMoveIndex + 1)} / ${state.replay.moves.length} lượt`;
  const scrubber = $('#replay-scrubber');
  if (scrubber) scrubber.value = String(state.replayMoveIndex);
  const board = buildStateAt(state.replayMoveIndex);
  if (board) { renderReplayBoard(board); renderReplayPieceCounts(board); }
  renderReplayTimeline();
  const move = state.replayMoveIndex >= 0 ? state.replay.moves[state.replayMoveIndex] : null;
  $('#btn-replay-start').disabled = state.replayMoveIndex < 0;
  $('#btn-replay-prev').disabled = state.replayMoveIndex < 0;
  $('#btn-replay-next').disabled = state.replayMoveIndex >= state.replay.moves.length - 1;
  $('#btn-replay-end').disabled = state.replayMoveIndex >= state.replay.moves.length - 1;
  const selected = $('#r-selected-move');
  if (selected) selected.textContent = move?.pieceId
    ? `Move ${move.turn} · Player ${move.player}: ${replayCoordinate(move.from)} → ${replayCoordinate(move.to)}`
    : state.replayMoveIndex < 0 ? 'Initial position' : 'No applied move at this position';
  const currentMove = $('#r-current-move');
  currentMove?.classList.toggle('replay-current-move-a', move?.player === 'A');
  currentMove?.classList.toggle('replay-current-move-b', move?.player === 'B');
  const totalMoves = state.replay?.moves?.length || 0;
  const isFinalMove = totalMoves === 0 ? true : (state.replayMoveIndex >= totalMoves - 1 && state.replayMoveIndex >= 0);
  const matchWinner = state.replay?.winner;
  const isDecidedMatch = isFinalMove && (matchWinner === 'A' || matchWinner === 'B');
  currentMove?.classList.toggle('is-victory-announcement', isDecidedMatch);

  // Update winner visual states on participant cards (A = left card / Player 1, B = right card / Player 2)
  const winningSlot = isDecidedMatch ? getReplayWinningParticipantSlot() : null;
  document.querySelector('#replay-view .replay-player-a-label')?.classList.toggle('is-winner', winningSlot === 'A');
  document.querySelector('#replay-view .replay-player-b-label')?.classList.toggle('is-winner', winningSlot === 'B');

  if (isDecidedMatch) {
    const winningCardName = winningSlot === 'A'
      ? document.querySelector('#replay-view #r-p1-name')?.textContent?.trim()
      : winningSlot === 'B'
        ? document.querySelector('#replay-view #r-p2-name')?.textContent?.trim()
        : '';
    const rawWinner = replayWinnerLabel(state.replay);
    const cleanWinner = winningCardName || (rawWinner.endsWith(' chiến thắng') ? rawWinner.slice(0, -' chiến thắng'.length) : rawWinner);
    const reason = formatReplayReason(state.replay.terminationReason) || 'Chiến thắng';
    currentMove.textContent = `🏆 CHIẾN THẮNG: ${cleanWinner} (${reason})`;
  } else {
    currentMove.textContent = move?.pieceId
      ? `Lượt ${move.turn} · ${replayHistoryPlayerName(move.player)}: ${replayCoordinate(move.from)} → ${replayCoordinate(move.to)}`
      : state.replayMoveIndex >= 0 ? `Lượt ${move.turn} · ${replayHistoryPlayerName(move.player)}: không có nước đi được áp dụng` : 'Vị trí ban đầu';
  }
}

  if (false) {
    const selected = $('#r-selected-move');
  if (selected) selected.textContent = move?.pieceId ? $('#r-current-move').textContent : state.replayMoveIndex < 0 ? 'Vị trí ban đầu' : 'Không có nước đi được áp dụng';
}

function setupReplayCoordinates() {
  const header = $('#coord-header'); const side = $('#coord-side'); clear(header); clear(side);
  'abcdefghi'.split('').forEach(column => header.appendChild(create('span', { className: 'coord', text: column, attrs: { 'aria-hidden': 'true' } })));
  Array.from({ length: 9 }, (_, index) => index + 1).forEach(row => side.appendChild(create('span', { className: 'coord', text: row, attrs: { 'aria-hidden': 'true' } })));
}

function replayCoordinate(position) { return position ? `${'abcdefghi'[position.col] || '?'}${Number(position.row) + 1}` : '?'; }
function replayHistoryPlayerName(player) {
  const identity = state.replay?.participantIdentities?.[player];
  if (identity?.participantName) return identity.participantName;
  const name = $(`#r-p${player === 'A' ? '1' : '2'}-name`)?.textContent?.trim();
  return name || `Người chơi ${player}`;
}
function renderReplayTimeline() {
  const list = $('#replay-timeline'); clear(list);
  const moves = state.replay?.moves || [];
  const historyTitle = $('#replay-history-title'); if (historyTitle) historyTitle.textContent = 'Lịch sử nước đi';
  const historyCount = $('#replay-history-count'); if (historyCount) historyCount.textContent = `${moves.length} lượt`;
  if (!state.replay?.moves.length) { list.appendChild(create('p', { className: 'ui-message', text: 'Chưa có nước đi nào được ghi nhận cho trận đấu này.' })); return; }
  state.replay.moves.forEach((move, index) => {
    const item = actionButton('', () => { stopReplayPlayback(); goToReplayTurn(index); }, `replay-seek:${index}`, 'replay-move');
    item.classList.toggle('active', index === state.replayMoveIndex);
    const applied = Boolean(move.pieceId);
    item.classList.toggle('replay-move-unapplied', !applied);
    const playerName = replayHistoryPlayerName(move.player);
    const side = String(move.player || '').toLowerCase();
    item.classList.add(`replay-move-side-${side}`);
    const label = applied ? `Lượt ${move.turn} · ${playerName}: ${replayCoordinate(move.from)} → ${replayCoordinate(move.to)}${move.captures ? ' · ăn quân' : ''}` : `Lượt ${move.turn} · ${playerName}: không có nước đi được áp dụng`;
    item.setAttribute('aria-label', label);
    item.setAttribute('aria-current', index === state.replayMoveIndex ? 'step' : 'false');
    const number = create('span', { className: 'replay-move-number', text: `#${index + 1}` });
    const player = create('span', { className: `replay-move-player replay-move-player-${side}`, text: playerName });
    const path = create('span', { className: 'replay-move-path', text: applied ? `${replayCoordinate(move.from)} → ${replayCoordinate(move.to)}${move.captures ? ' · Ăn quân' : ''}` : 'Không có nước đi được áp dụng' });
    item.append(number, player, path);
    list.appendChild(item);
  });
  const active = list.querySelector('.replay-move.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function toggleReplayPlayback() {
  if (!state.replay || state.activeView !== 'replay-view') return;
  if (state.replayPlaybackActive) return stopReplayPlayback();
  if (state.replayTimer) return stopReplayPlayback();
  if (state.replayMoveIndex >= state.replay.moves.length - 1) goToReplayTurn(-1);
  const token = (state.replayPlaybackToken || 0) + 1;
  state.replayPlaybackToken = token;
  state.replayPlaybackActive = true;
  const replayId = state.replayMatchId;
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const tick = () => {
    const isPracticeReplay = state.replayContext?.practice === true;
    if (state.replayPlaybackToken !== token || !state.replay || state.replayMatchId !== replayId
      || (!isPracticeReplay && state.replayContext?.tournamentId !== state.tournamentId)
      || !isCurrentView('replay-view', authRevision, viewRevision) || state.replayMoveIndex >= state.replay.moves.length - 1) {
    if (state.replayPlaybackToken === token) stopReplayPlayback();
      return;
    }
    goToReplayTurn(state.replayMoveIndex + 1);
    state.replayTimer = setTimeout(tick, state.replaySpeed);
  };
  const playButton = $('#btn-replay-play');
  const playLabel = playButton?.querySelector('.replay-control-label'); if (playLabel) playLabel.textContent = 'Tạm dừng';
  const pauseIcon = playButton?.querySelector('use'); if (pauseIcon) pauseIcon.setAttribute('href', '#icon-pause');
  if (playButton) { playButton.setAttribute('aria-label', 'Tạm dừng'); playButton.setAttribute('title', 'Tạm dừng'); }
  $('#btn-replay-play').setAttribute('aria-pressed', 'true');
  state.replayTimer = setTimeout(tick, state.replaySpeed);
}

/* ==================== MODULE: playground.js ==================== */
/* ==================== MODULE: playground.js ==================== */

const PLAYGROUND_PIECE_TYPES = { dam: 'icon-piece-dam', la: 'icon-piece-la', keo: 'icon-piece-keo' };
const PLAYGROUND_PIECE_LABELS = { dam: 'Búa', la: 'Bao', keo: 'Kéo' };

function playgroundCoordinateToPos(value) {
  const match = /^([a-i])([1-9])$/.exec(String(value || '').toLowerCase());
  return match ? { col: 'abcdefghi'.indexOf(match[1]), row: Number(match[2]) - 1 } : null;
}

const PLAYGROUND_STARTER_CODE = {
  cpp: `using namespace std;

Move chooseMove(const GameState& state, const vector<Move>& legalMoves) {
    // Ưu tiên nước đi ăn quân
    for (const Move& move : legalMoves) {
        if (move.has_capture) return move;
    }
    // Hoặc chọn nước đi hợp lệ đầu tiên
    return legalMoves.front();
}`,
  python3: `from ott_strategy_sdk import Move, GameState

def choose_move(state: GameState, legal_moves: list[Move]) -> Move:
    # Ưu tiên nước đi ăn quân
    for move in legal_moves:
        if move.captures is not None:
            return move
    # Hoặc chọn nước đi hợp lệ đầu tiên
    return legal_moves[0]`
};

let playgroundPieces = [
  { player: 'A', type: 'dam', row: 4, col: 4 },
  { player: 'B', type: 'keo', row: 4, col: 5 }
];
let playgroundSelectedCell = null;
let playgroundHistory = [];
let playgroundBusy = false;
let playgroundEventsBound = false;

function initBotPlayground() {
  const container = $('#bot-playground');
  if (!container) return;

  setupPlaygroundEvents();
  loadPlaygroundBotsList();
  setupPlaygroundCode();
  setupPlaygroundPiecePickerTokens();
  renderPlaygroundBoard();
}

function setupPlaygroundPiecePickerTokens() {
  ['dam', 'la', 'keo'].forEach(type => {
    const token = document.querySelector(`.piece-choice-btn[data-piece-type="${type}"] .replay-piece`);
    if (token) {
      const symbol = PLAYGROUND_PIECE_TYPES[type] || 'icon-piece-dam';
      token.replaceChildren(icon(symbol));
    }
  });
}

async function openPlaygroundForBot(bot) {
  if (!bot) return;
  navigate('bot-playground');
  loadPlaygroundBotsList();
  const select = $('#playground-bot-selector');
  if (select) {
    select.value = bot.id;
    select.dispatchEvent(new Event('change'));
  }
}

async function loadPlaygroundBotsList(botsList = null) {
  const select = $('#playground-bot-selector');
  if (!select) return;

  let bots = Array.isArray(botsList) ? botsList : (Array.isArray(state.bots) ? state.bots : []);

  if (!botsList && state.user?.role === 'competitor' && (!bots.length || state.botsDirty)) {
    try {
      const freshBots = await api('/bots');
      if (Array.isArray(freshBots)) {
        bots = freshBots;
        state.bots = freshBots;
        state.botsDirty = false;
      }
    } catch {}
  }

  const currentVal = select.value;
  select.replaceChildren(create('option', { value: '', text: '-- Chọn Bot để kiểm thử --' }));

  if (bots.length > 0) {
    const userGroup = create('optgroup', { label: 'Bot của bạn' });
    bots.forEach(bot => {
      userGroup.appendChild(create('option', {
        value: bot.id,
        text: `${bot.name || bot.id} (${bot.selectedRevision?.runtimeId === 'python3' ? 'Python 3' : 'C++17'})`
      }));
    });
    select.appendChild(userGroup);
  }

  const sampleGroup = create('optgroup', { label: 'Bot mẫu có sẵn (Strategy SDK)' });
  sampleGroup.appendChild(create('option', {
    value: 'sample-cpp',
    text: '🤖 Bot mẫu C++17 (Strategy SDK)'
  }));
  sampleGroup.appendChild(create('option', {
    value: 'sample-python3',
    text: '🐍 Bot mẫu Python 3 (Strategy SDK)'
  }));
  select.appendChild(sampleGroup);

  const noBotsBanner = $('#playground-no-bots-banner');
  if (noBotsBanner) {
    noBotsBanner.hidden = (bots.length > 0);
  }

  if (currentVal && (bots.some(b => b.id === currentVal) || currentVal.startsWith('sample-'))) {
    select.value = currentVal;
  } else {
    select.value = '';
    const codeArea = $('#playground-code');
    if (codeArea && !state.practiceDraft?.source) {
      codeArea.value = '';
      codeArea.readOnly = true;
      updatePlaygroundCodeStats();
    }
    const runtimeSelect = $('#playground-runtime-selector');
    if (runtimeSelect && !state.practiceDraft?.runtimeId) {
      runtimeSelect.disabled = true;
    }
  }
}

function setupPlaygroundCode() {
  const codeArea = $('#playground-code');
  const runtimeSelect = $('#playground-runtime-selector');
  if (!codeArea || !runtimeSelect) return;

  codeArea.readOnly = true;
  runtimeSelect.disabled = true;

  // Nếu người dùng vừa từ workspace sang và có draft
  if (state.practiceDraft?.source) {
    codeArea.value = state.practiceDraft.source;
    if (state.practiceDraft.runtimeId) {
      runtimeSelect.value = state.practiceDraft.runtimeId;
    }
  }

  updatePlaygroundCodeStats();
}

function updatePlaygroundCodeStats() {
  const codeArea = $('#playground-code');
  const stats = $('#playground-code-stats');
  if (!codeArea || !stats) return;

  const code = codeArea.value;
  const chars = code.length;
  const lines = code ? code.split('\n').length : 1;
  stats.textContent = `${chars.toLocaleString()} ký tự · ${lines} dòng`;
  syncPlaygroundCodeHighlight();
}

function syncPlaygroundCodeHighlight() {
  const codeArea = $('#playground-code');
  const highlight = $('#playground-code-highlight');
  if (!codeArea || !highlight || typeof renderSourceHighlight !== 'function') return;
  renderSourceHighlight(highlight, codeArea.value);
  highlight.style.transform = `translate(${-codeArea.scrollLeft}px, ${-codeArea.scrollTop}px)`;
}

function renderPlaygroundBoard() {
  const element = $('#playground-board');
  const columns = $('#playground-columns');
  const rows = $('#playground-rows');
  if (!element || !columns || !rows) return;

  clear(element);
  clear(columns);
  clear(rows);

  'abcdefghi'.split('').forEach(col => columns.appendChild(create('span', { className: 'coord', text: col, attrs: { 'aria-hidden': 'true' } })));
  for (let r = 0; r < 9; r += 1) rows.appendChild(create('span', { className: 'coord', text: String(r + 1), attrs: { 'aria-hidden': 'true' } }));

  for (let r = 0; r < 9; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const coordinate = `${'abcdefghi'[c]}${r + 1}`;
      const isGoalA = (r === 8 && c === 8);
      const isGoalB = (r === 0 && c === 0);

      const cell = create('div', {
        className: 'replay-cell',
        attrs: {
          role: 'gridcell',
          'data-row': String(r),
          'data-col': String(c),
          'aria-label': `Ô ${coordinate}${isGoalA ? ', Mục tiêu Bot A' : isGoalB ? ', Mục tiêu Bot B' : ''}`
        }
      });

      if (isGoalA) {
        cell.classList.add('goal', 'goal-a');
        const flag = create('span', {
          className: 'goal-flag goal-flag-a',
          attrs: { 'aria-hidden': 'true', title: 'Mục tiêu Bot A (i9)' }
        });
        flag.appendChild(icon('icon-flag'));
        cell.appendChild(flag);
      } else if (isGoalB) {
        cell.classList.add('goal', 'goal-b');
        const flag = create('span', {
          className: 'goal-flag goal-flag-b',
          attrs: { 'aria-hidden': 'true', title: 'Mục tiêu Bot B (a1)' }
        });
        flag.appendChild(icon('icon-flag'));
        cell.appendChild(flag);
      }

      const piece = playgroundPieces.find(p => p.row === r && p.col === c);
      if (piece) {
        const isPlayerA = piece.player === 'A';
        const label = `Bot ${piece.player}, ${PLAYGROUND_PIECE_LABELS[piece.type] || piece.type}`;
        const token = create('span', {
          className: `replay-piece ${isPlayerA ? 'replay-player-a' : 'replay-player-b'}`,
          attrs: {
            'aria-label': label,
            title: label
          }
        });
        const symbol = PLAYGROUND_PIECE_TYPES[piece.type] || 'icon-piece-dam';
        token.appendChild(icon(symbol));
        cell.appendChild(token);
      }

      cell.addEventListener('click', () => openPlaygroundPiecePicker(r, c));
      element.appendChild(cell);
    }
  }

  updatePlaygroundHint();
}

function updatePlaygroundHint() {
  const hint = $('#playground-placement-hint');
  if (!hint) return;

  const hasA = playgroundPieces.some(p => p.player === 'A');
  if (!hasA) {
    hint.textContent = 'Hãy nhấp vào ô trống để đặt đúng 1 quân của Bot A (Quân bạn).';
  } else {
    hint.textContent = 'Đã có quân Bot A. Bạn có thể nhấp ô trống để đặt thêm quân Bot B hoặc nhấp quân đã đặt để xoá/đổi.';
  }
}

function openPlaygroundPiecePicker(row, col) {
  playgroundSelectedCell = { row, col };
  const coordinate = `${'abcdefghi'[col]}${row + 1}`;
  const existing = playgroundPieces.find(p => p.row === row && p.col === col);
  const hasA = playgroundPieces.some(p => p.player === 'A');

  const modal = $('#playground-piece-menu');
  const backdrop = $('#playground-piece-menu-backdrop');
  const title = $('#playground-menu-title');
  const desc = $('#playground-menu-description');
  const removeBtn = $('#playground-remove-piece-btn');
  if (!modal || !backdrop || !title || !desc || !removeBtn) return;

  const targetPlayer = existing ? existing.player : (hasA ? 'B' : 'A');
  modal.dataset.targetPlayer = targetPlayer;

  modal.querySelectorAll('.piece-choice-btn .replay-piece').forEach(token => {
    token.className = `replay-piece replay-player-${targetPlayer.toLowerCase()}`;
  });

  if (existing) {
    title.textContent = `Quân ô ${coordinate} (${existing.player === 'A' ? 'Bot A' : 'Bot B'})`;
    desc.textContent = `Đang có quân ${PLAYGROUND_PIECE_LABELS[existing.type] || existing.type}. Bạn có thể đổi loại quân hoặc xoá quân này.`;
    removeBtn.hidden = false;
  } else {
    removeBtn.hidden = true;
    if (!hasA) {
      title.textContent = `Đặt quân Bot A tại ô ${coordinate}`;
      desc.textContent = 'Chọn loại quân duy nhất cho Bot A của bạn.';
    } else {
      title.textContent = `Đặt quân Bot B tại ô ${coordinate}`;
      desc.textContent = 'Chọn loại quân của đối thủ để thử nghiệm chiến thuật.';
    }
  }

  modal.hidden = false;
  backdrop.hidden = false;
}

function closePlaygroundPiecePicker() {
  const modal = $('#playground-piece-menu');
  const backdrop = $('#playground-piece-menu-backdrop');
  if (modal) modal.hidden = true;
  if (backdrop) backdrop.hidden = true;
  playgroundSelectedCell = null;
}

function selectPlaygroundPieceType(type) {
  if (!playgroundSelectedCell) return;
  const { row, col } = playgroundSelectedCell;
  const existingIndex = playgroundPieces.findIndex(p => p.row === row && p.col === col);
  const hasA = playgroundPieces.some(p => p.player === 'A');

  if (existingIndex >= 0) {
    playgroundPieces[existingIndex].type = type;
  } else {
    const player = hasA ? 'B' : 'A';
    playgroundPieces.push({ player, type, row, col });
  }

  closePlaygroundPiecePicker();
  renderPlaygroundBoard();
}

function removeSelectedPlaygroundPiece() {
  if (!playgroundSelectedCell) return;
  const { row, col } = playgroundSelectedCell;
  playgroundPieces = playgroundPieces.filter(p => !(p.row === row && p.col === col));
  closePlaygroundPiecePicker();
  renderPlaygroundBoard();
}

function clearPlaygroundBoard() {
  playgroundPieces = [];
  closePlaygroundPiecePicker();
  renderPlaygroundBoard();
  setPlaygroundToast('Đã xoá toàn bộ quân trên bàn cờ kiểm thử.', 'info');
}

function applyPlaygroundPreset(preset) {
  if (preset === 'capture') {
    playgroundPieces = [
      { player: 'A', type: 'dam', row: 4, col: 4 },
      { player: 'B', type: 'keo', row: 4, col: 5 }
    ];
    setPlaygroundToast('Đã nạp kịch bản: Có cơ hội ăn quân (Đấm A ở e5, Kéo B ở f5).', 'info');
  } else if (preset === 'near-goal') {
    playgroundPieces = [
      { player: 'A', type: 'dam', row: 7, col: 7 },
      { player: 'B', type: 'dam', row: 1, col: 1 }
    ];
    setPlaygroundToast('Đã nạp kịch bản: Tiến gần ô đích (Đấm A ở h8 gần mục tiêu i9).', 'info');
  }
  renderPlaygroundBoard();
}

function setPlaygroundToast(message, type = 'error') {
  const toast = $('#playground-toast');
  if (!toast) return;

  if (!message) {
    toast.textContent = '';
    toast.hidden = true;
    return;
  }

  toast.textContent = message;
  toast.className = `playground-toast ${type === 'error' ? 'form-error' : 'ui-message'}`;
  toast.hidden = false;
}

async function runPlaygroundSingleTest() {
  if (playgroundBusy) return;

  const playerAPieces = playgroundPieces.filter(p => p.player === 'A');
  if (playerAPieces.length !== 1) {
    setPlaygroundToast('Bạn cần đặt đúng 1 quân của Bot A (Quân bạn) trước khi test.', 'error');
    return;
  }

  const botSelect = $('#playground-bot-selector');
  const selectedBotId = botSelect?.value || '';

  const codeArea = $('#playground-code');
  const source = codeArea?.value || '';
  const runtimeId = $('#playground-runtime-selector')?.value || 'cpp';
  if (!selectedBotId || !source.trim()) {
    setPlaygroundToast('Vui lòng chọn Bot từ danh sách hoặc nạp Bot mẫu trước khi kiểm thử.', 'error');
    return;
  }

  const runButton = $('#playground-run-test');
  const resultCard = $('#playground-result-card');
  const resultBody = $('#playground-result-body');
  const resultBanner = $('#playground-result-banner');
  const statusText = $('#playground-result-status-text');
  const moveText = $('#playground-result-move-text');
  const detailsList = $('#playground-result-dl');

  setPlaygroundToast('');
  const emptyHint = $('#playground-result-empty');
  if (emptyHint) emptyHint.hidden = true;
  playgroundBusy = true;
  if (runButton) {
    runButton.disabled = true;
    runButton.textContent = 'Đang chạy…';
  }

  try {
    const payload = {
      source,
      runtimeId,
      executionMode: 'strategy',
      customPieces: playgroundPieces.map(p => ({
        player: p.player,
        type: p.type,
        row: p.row,
        col: p.col
      }))
    };

    let result;
    if (selectedBotId && !selectedBotId.startsWith('sample-')) {
      const selectedBot = (state.bots || []).find(b => b.id === selectedBotId);
      const revisionId = selectedBot?.selectedRevision?.revisionId;
      if (revisionId && !state.sourceDirty) {
        result = await api(`/bots/${selectedBotId}/revisions/${revisionId}/test`, {
          method: 'POST',
          body: JSON.stringify({ customPieces: payload.customPieces })
        });
      } else {
        result = await api('/bots/draft/test', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
    } else {
      result = await api('/bots/draft/test', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    // Xử lý thành công
    if (result.valid && result.accepted) {
      const move = result.move;
      const captureLabel = result.capture ? ` · Ăn quân đối thủ (${result.capture})` : ' · Không ăn quân';
      const label = `${move.from} → ${move.to}${captureLabel}`;

      if (statusText) statusText.textContent = 'Test thành công · Nước đi hợp lệ';
      if (moveText) moveText.textContent = label;
      if (resultBanner) {
        resultBanner.className = 'playground-result-banner';
      }

      clear(detailsList);
      [
        ['Quân đã chọn', move.piece_id],
        ['Từ ô', move.from],
        ['Đến ô', move.to],
        ['Kết quả ăn quân', result.capture ? `Quân ${result.capture}` : 'Không'],
        ['Thời gian chạy', `${result.timings?.durationMs || result.timings?.practiceRequestMs || 0} ms`],
        ['Ngôn ngữ', result.runtimeId === 'cpp' ? 'C++17' : 'Python 3'],
        ['Giai đoạn', 'Move accepted by Engine']
      ].forEach(([key, val]) => {
        detailsList.append(create('dt', { text: key }), create('dd', { text: val }));
      });

      if (resultBody) resultBody.hidden = false;
      switchPlaygroundTab('result');
      const botLabel = selectedBotId === 'sample-cpp'
        ? 'Bot mẫu C++17'
        : selectedBotId === 'sample-python3'
          ? 'Bot mẫu Python 3'
          : (state.bots?.find(b => b.id === selectedBotId)?.name || 'Bot');
      setPlaygroundToast(`Test thành công! ${botLabel} đã chọn nước đi ${move.from} → ${move.to}.`, 'info');

      // Kích hoạt animation nước đi trên bàn cờ
      animatePlaygroundMove(move.from, move.to, move.piece_id, result.capture);

      addPlaygroundHistoryEntry({
        success: true,
        summary: `${botLabel}: ${move.from} → ${move.to}`,
        detail: `Quân ${move.piece_id}${result.capture ? ` ăn ${result.capture}` : ''}`,
        at: new Date()
      });
    } else {
      throw result;
    }
  } catch (error) {
    const errorMsg = error?.error || error?.message || 'Bot không trả về nước đi hợp lệ.';
    if (statusText) statusText.textContent = 'Chạy thử chưa hợp lệ';
    if (moveText) moveText.textContent = errorMsg;
    if (resultBanner) {
      resultBanner.className = 'playground-result-banner error';
    }

    clear(detailsList);
    [
      ['Lý do lỗi', error?.code || 'INVALID_BOT'],
      ['Thông báo', errorMsg],
      ['Giai đoạn', error?.diagnostic?.stage || 'move_validation'],
      ['Ngôn ngữ', runtimeId === 'cpp' ? 'C++17' : 'Python 3']
    ].forEach(([key, val]) => {
      detailsList.append(create('dt', { text: key }), create('dd', { text: val }));
    });

    if (resultBody) resultBody.hidden = false;
    switchPlaygroundTab('result');
    setPlaygroundToast(errorMsg, 'error');

    addPlaygroundHistoryEntry({
      success: false,
      summary: 'Lỗi thực thi / nước đi không hợp lệ',
      detail: errorMsg,
      at: new Date()
    });
  } finally {
    playgroundBusy = false;
    if (runButton) {
      runButton.disabled = false;
      runButton.textContent = 'Test 1 lượt';
    }
  }
}

function animatePlaygroundMove(fromAlg, toAlg, pieceId, capturedId) {
  const fromPos = playgroundCoordinateToPos(fromAlg);
  const toPos = playgroundCoordinateToPos(toAlg);
  if (!fromPos || !toPos) return;

  // Cập nhật toạ độ quân A trong danh sách
  const movingPiece = playgroundPieces.find(p => p.player === 'A');
  if (movingPiece) {
    movingPiece.row = toPos.row;
    movingPiece.col = toPos.col;
  }

  // Nếu có quân bị ăn, xoá quân đó khỏi bàn cờ
  if (capturedId) {
    playgroundPieces = playgroundPieces.filter(p => !(p.player === 'B' && p.row === toPos.row && p.col === toPos.col));
  }

  renderPlaygroundBoard();

  // Highlight ô xuất phát và ô đến
  const fromCell = $(`#playground-board [data-row="${fromPos.row}"][data-col="${fromPos.col}"]`);
  const toCell = $(`#playground-board [data-row="${toPos.row}"][data-col="${toPos.col}"]`);

  if (fromCell) fromCell.classList.add('move-from');
  if (toCell) {
    toCell.classList.add('move-to');
    if (capturedId) toCell.classList.add('practice-capture');
  }

  setTimeout(() => {
    if (fromCell) fromCell.classList.remove('move-from');
    if (toCell) {
      toCell.classList.remove('move-to');
      toCell.classList.remove('practice-capture');
    }
  }, 2400);
}


function switchPlaygroundTab(tabName) {
  const resultCard = $('#playground-result-card');
  const historyCard = $('.playground-history-card');
  const tabBtns = document.querySelectorAll('.playground-tab-btn');
  tabBtns.forEach(btn => {
    const isTarget = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isTarget);
    btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });
  if (resultCard && historyCard) {
    if (tabName === 'history') {
      resultCard.hidden = true;
      historyCard.hidden = false;
    } else {
      resultCard.hidden = false;
      historyCard.hidden = true;
    }
  }
}

function addPlaygroundHistoryEntry(entry) {
  playgroundHistory.unshift(entry);
  const countEl = $('#playground-history-count');
  if (countEl) countEl.textContent = String(playgroundHistory.length);
  renderPlaygroundHistory();
}

function renderPlaygroundHistory() {
  const list = $('#playground-history-list');
  if (!list) return;

  clear(list);
  if (!playgroundHistory.length) {
    list.appendChild(create('p', { className: 'practice-move-history-empty', text: 'Chưa có lần test nào.' }));
    return;
  }

  playgroundHistory.slice(0, 10).forEach(item => {
    const el = create('div', {
      className: `playground-history-item ${item.success ? 'success' : 'error'}`
    });
    const content = create('div');
    content.append(
      create('strong', { text: item.summary }),
      create('p', { className: 'field-help', text: item.detail })
    );
    const time = create('span', {
      className: 'playground-history-time',
      text: item.at.toLocaleTimeString('vi-VN')
    });
    el.append(content, time);
    list.appendChild(el);
  });
}

function setupPlaygroundEvents() {
  if (playgroundEventsBound) return;
  playgroundEventsBound = true;

  $('#playground-close-menu-btn')?.addEventListener('click', closePlaygroundPiecePicker);
  $('#playground-piece-menu-backdrop')?.addEventListener('click', closePlaygroundPiecePicker);
  $('#playground-remove-piece-btn')?.addEventListener('click', removeSelectedPlaygroundPiece);

  document.querySelectorAll('.piece-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.pieceType;
      if (type) selectPlaygroundPieceType(type);
    });
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      if (preset) applyPlaygroundPreset(preset);
    });
  });

  $('#playground-clear-board')?.addEventListener('click', clearPlaygroundBoard);
  $('#playground-header-clear')?.addEventListener('click', clearPlaygroundBoard);
  $('#playground-run-test')?.addEventListener('click', runPlaygroundSingleTest);
  $('#playground-header-run')?.addEventListener('click', runPlaygroundSingleTest);

  document.querySelectorAll('.playground-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab) switchPlaygroundTab(btn.dataset.tab);
    });
  });

  $('#playground-code')?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runPlaygroundSingleTest();
    }
  });

  $('#playground-clear-history')?.addEventListener('click', () => {
    playgroundHistory = [];
    const countEl = $('#playground-history-count');
    if (countEl) countEl.textContent = '0';
    renderPlaygroundHistory();
  });

  $('#playground-reset-code')?.addEventListener('click', () => {
    const runtime = $('#playground-runtime-selector')?.value || 'cpp';
    const codeArea = $('#playground-code');
    if (codeArea) {
      codeArea.value = PLAYGROUND_STARTER_CODE[runtime] || PLAYGROUND_STARTER_CODE.cpp;
      updatePlaygroundCodeStats();
    }
  });

  $('#playground-runtime-selector')?.addEventListener('change', (e) => {
    const runtime = e.target.value;
    const codeArea = $('#playground-code');
    if (codeArea && !codeArea.value.trim()) {
      codeArea.value = PLAYGROUND_STARTER_CODE[runtime] || PLAYGROUND_STARTER_CODE.cpp;
      updatePlaygroundCodeStats();
    }
  });

  $('#playground-code')?.addEventListener('input', updatePlaygroundCodeStats);
  $('#playground-code')?.addEventListener('scroll', syncPlaygroundCodeHighlight, { passive: true });

  $('#playground-create-bot-btn')?.addEventListener('click', () => {
    if (typeof navigate === 'function') {
      navigate('bot-workspace');
    }
  });

  $('#playground-load-sample-cpp')?.addEventListener('click', () => {
    const select = $('#playground-bot-selector');
    if (select) {
      select.value = 'sample-cpp';
      select.dispatchEvent(new Event('change'));
    }
  });

  $('#playground-load-sample-py')?.addEventListener('click', () => {
    const select = $('#playground-bot-selector');
    if (select) {
      select.value = 'sample-python3';
      select.dispatchEvent(new Event('change'));
    }
  });

  $('#playground-bot-selector')?.addEventListener('change', async (e) => {
    const botId = e.target.value;
    const codeArea = $('#playground-code');
    const runtimeSelect = $('#playground-runtime-selector');
    const codeNote = $('#playground-code-note');

    if (!botId) {
      if (codeArea) {
        codeArea.value = '';
        codeArea.readOnly = true;
        updatePlaygroundCodeStats();
      }
      if (runtimeSelect) runtimeSelect.disabled = true;
      if (codeNote) {
        codeNote.textContent = 'Chỉ hiển thị mã nguồn Bot được chọn. Để sửa code, hãy vào Không gian Bot.';
      }
      return;
    }

    if (botId === 'sample-cpp' || botId === 'sample-python3') {
      const runtime = botId === 'sample-python3' ? 'python3' : 'cpp';
      if (runtimeSelect) {
        runtimeSelect.value = runtime;
        runtimeSelect.disabled = true;
      }
      if (codeArea) {
        codeArea.value = PLAYGROUND_STARTER_CODE[runtime] || PLAYGROUND_STARTER_CODE.cpp;
        codeArea.readOnly = true;
        updatePlaygroundCodeStats();
      }
      if (codeNote) {
        codeNote.textContent = `Đang xem Bot mẫu ${runtime === 'cpp' ? 'C++17' : 'Python 3'} (Strategy SDK). Tạo Bot để tùy biến chiến thuật.`;
      }
      setPlaygroundToast('');
      return;
    }

    try {
      let bot = (state.bots || []).find(b => b.id === botId);
      if (!bot) {
        try {
          const freshBots = await api('/bots');
          if (Array.isArray(freshBots)) {
            state.bots = freshBots;
            await loadPlaygroundBotsList(freshBots);
            bot = freshBots.find(b => b.id === botId);
          }
        } catch {}
      }

      if (!bot) {
        setPlaygroundToast('Không tìm thấy Bot đã chọn trong danh sách của bạn.', 'error');
        return;
      }

      let revisionId = bot.selectedRevision?.revisionId || bot.currentRevisionId;

      if (!revisionId) {
        try {
          const revisions = await api(`/bots/${botId}/revisions`);
          if (Array.isArray(revisions) && revisions.length > 0) {
            revisionId = revisions[0].revisionId;
          }
        } catch (revErr) {
          console.warn('Could not query revisions for bot', revErr);
        }
      }

      if (revisionId) {
        const revData = await api(`/bots/${botId}/revisions/${revisionId}`);
        if (revData?.runtimeId && runtimeSelect) {
          runtimeSelect.value = revData.runtimeId;
          runtimeSelect.disabled = true;
        }
        if (typeof revData?.source === 'string') {
          if (codeArea) {
            codeArea.value = revData.source;
            codeArea.readOnly = true;
            updatePlaygroundCodeStats();
          }
        }
        if (codeNote) {
          codeNote.textContent = 'Chỉ hiển thị mã nguồn Bot được chọn. Để sửa code, hãy vào Không gian Bot.';
        }
      }
    } catch (err) {
      console.warn('Could not load bot source for playground', err);
      // If server returned 404 Bot not found, purge stale bots from select
      if (err?.message?.includes('Bot not found') || err?.status === 404) {
        try {
          const freshBots = await api('/bots');
          if (Array.isArray(freshBots)) {
            state.bots = freshBots;
            await loadPlaygroundBotsList(freshBots);
          }
        } catch {}
      }
      setPlaygroundToast('Không thể tải mã nguồn của Bot đã chọn.', 'error');
    }
  });
}

/* ==================== MODULE: events.js ==================== */
const domBindingRegistry = new WeakMap();

function bindEvent(target, eventName, handler, { required = false, feature = eventName, options } = {}) {
  const element = typeof target === 'string' ? $(target) : target;
  if (!element) {
    if (required) console.error(`[DOM binding] Missing required control for ${feature}: ${typeof target === 'string' ? target : 'event target'}`);
    return false;
  }
  let bindings = domBindingRegistry.get(element);
  if (!bindings) {
    bindings = new Set();
    domBindingRegistry.set(element, bindings);
  }
  const bindingKey = `${eventName}:${feature}`;
  if (bindings.has(bindingKey)) return true;
  element.addEventListener(eventName, handler, options);
  bindings.add(bindingKey);
  return true;
}

function bindEvents() {
  const on = (target, eventName, handler, options = {}) => bindEvent(target, eventName, handler, {
    ...options,
    feature: options.feature || (typeof target === 'string' ? target : eventName),
  });
  document.querySelectorAll('.nav-link').forEach(link => on(link, 'click', () => {
    if (link.dataset.target === 'tournaments' && link.dataset.scope) state.tournamentScope = link.dataset.scope;
    navigate(link.dataset.target, { fromNav: true });
  }));
  on(document, 'click', event => {
    const guideAction = event.target?.closest?.('[data-guide-target]');
    if (!guideAction) return;
    const target = guideAction.dataset.guideTarget;
    if (!target) return;
    event.preventDefault();
    navigate(target);
  }, { feature: 'player guide actions' });
  on(document, 'click', event => {
    const breadcrumbLink = event.target?.closest?.('.topbar-breadcrumb-link');
    if (!breadcrumbLink) return;
    event.preventDefault();
    const targetView = breadcrumbLink.getAttribute('href')?.slice(1) || 'tournaments';
    if (targetView === 'tournaments' && state.user?.role === 'organizer') state.tournamentScope = 'managed';
    navigate(targetView);
  }, { feature: 'topbar breadcrumb navigation' });
    on('#show-register', 'click', () => setAuthMode('register'));
   on('#show-login', 'click', () => setAuthMode('login'));
  // Auth markup may be loaded as a page fragment after the initial bindings.
  // Delegate these two stable actions so optional/missing tabs do not produce
  // noisy required-control warnings and late-loaded tabs remain interactive.
  on(document, 'click', event => {
    const tab = event.target?.closest?.('#tab-register, #tab-login');
    if (!tab) return;
    setAuthMode(tab.id === 'tab-register' ? 'register' : 'login');
  }, { feature: 'authentication tabs delegation' });
    on('#login-password-toggle', 'click', () => togglePassword('login-password', 'login-password-toggle'));
    on('#register-password-toggle', 'click', () => togglePassword('register-password', 'register-password-toggle'));
   
  // Add real-time validation
  on('#login-username', 'input', () => { clearAuthMessage('login'); validateField($('#login-username'), 'username'); updateButtonState('login'); });
  on('#login-password', 'input', () => { clearAuthMessage('login'); validateField($('#login-password'), 'login-password'); updateButtonState('login'); });
  on('#register-username', 'input', () => { clearAuthMessage('register'); validateField($('#register-username'), 'username'); updateButtonState('register'); });
  on('#register-password', 'input', () => { clearAuthMessage('register'); validateField($('#register-password'), 'password'); updateButtonState('register'); });

  on('#login-form', 'submit', event => { event.preventDefault(); void runPending('login', $('#login-submit'), async () => {
    const username = $('#login-username').value.trim();
    const password = $('#login-password').value;
    if (!username || !password) {
      setAuthMessage('login', 'Vui lòng nhập đầy đủ thông tin.');
      return;
    }
    try {
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      setAuthMessage('login', '');
      setAuthenticated(result.user, result.csrfToken);
    } catch (error) {
      setAuthMessage('login', error.message || 'Đăng nhập không thành công.');
    }
  }); }, { required: true, feature: 'authentication login form' });
  on('#register-form', 'submit', event => { event.preventDefault(); void runPending('register', $('#register-submit'), async () => {
    if (!validateForm('register')) {
      setAuthMessage('register', 'Vui lòng điền đủ thông tin và dùng mật khẩu có ít nhất 12 ký tự, gồm chữ hoa, chữ thường và số.');
      return;
    }
    try {
      const result = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username: $('#register-username').value, password: $('#register-password').value }) });
      setAuthMessage('register', '');
      setAuthenticated(result.user, result.csrfToken);
    } catch (error) {
      setAuthMessage('register', error.message || 'Không thể tạo tài khoản.');
    }
  }); }, { required: true, feature: 'authentication registration form' });
  on('#logout-button', 'click', () => void runPending('logout', $('#logout-button'), async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { showAuthScreen(); } }));
  on('#open-bot-modal', 'click', () => openBotWorkspace()); on('#open-tournament-modal', 'click', openTournamentDialog);
  on('#dashboard-open-tournaments', 'click', () => { state.tournamentScope = state.user?.role === 'organizer' ? 'managed' : 'discoverable'; navigate('tournaments'); });
  on('#dashboard-open-bots', 'click', () => navigate('bots'));
  on('#dash-empty-tournament', 'click', openTournamentDialog);
  on('#bot-workspace-picker', 'change', event => {
    const bot = state.bots.find(item => item.id === event.target.value);
    void openBotWorkspace(bot || null);
  });
  on('#notice-create-draft-btn', 'click', () => {
    if (typeof unlockDraftFromNotice === 'function') void unlockDraftFromNotice();
  });
  on('#bot-search', 'input', event => { state.botSearch = event.target.value; state.botPage = 1; renderBotList(); });
  on('#bot-workspace-name', 'input', () => {
    const nameChanged = ($('#bot-workspace-name')?.value.trim() || '') !== state.sourceInitialName;
    setSourceDirty(state.sourceDirty || nameChanged);
    persistBotWorkspaceDraft();
  });
  on('#bot-workspace-name', 'keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    const saveButton = $('#save-bot-source');
    if (!saveButton.disabled) void submitBot();
  });
   on('#bot-source-runtime', 'change', event => switchSourceRuntime(event.target.value));
  on('#bot-source-runtime', 'change', event => updateSourceRuntimeMeta(event.target.value), { feature: 'bot-source-runtime-meta' });
  on('#bot-source-file', 'change', event => void importBotSourceFile(event), { feature: 'bot-source-file-upload' });
  on('#bot-source-editor', 'input', () => setSourceDirty(true));
  on('#bot-github-url', 'input', () => setSourceDirty(true));
  on('#bot-github-url', 'keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    void loadGitHubSourceIntoEditor();
  }, { feature: 'bot-github-source-enter' });
  on('#load-github-source', 'click', () => void loadGitHubSourceIntoEditor(), { feature: 'bot-github-source-load' });
  on('#bot-source-editor', 'keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) event.stopPropagation();
    if (state.botWorkspaceReadOnly) {
      const revision = typeof currentPracticeRevision === 'function' ? currentPracticeRevision() : null;
      if (revision && typeof loadRevisionSource === 'function') {
        event.preventDefault();
        void loadRevisionSource(revision, 'draft', false).then(() => {
          if (typeof showToast === 'function') showToast('Đã kích hoạt chế độ tạo bản nháp. Bạn có thể chỉnh sửa mã nguồn ngay.', 'info');
          $('#bot-source-editor')?.focus();
        });
      }
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.target.readOnly) {
      event.preventDefault();
      sourceIndentOnEnter(event.target);
      setSourceDirty(true); updateEditorMetrics();
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.target.readOnly && ['(', '[', '{'].includes(event.key)) {
      event.preventDefault();
      sourceInsertPair(event.target, event.key, { '(': ')', '[': ']', '{': '}' }[event.key]);
      setSourceDirty(true); updateEditorMetrics();
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.target.readOnly && [')', ']', '}'].includes(event.key) && event.target.value[event.target.selectionStart] === event.key && event.target.selectionStart === event.target.selectionEnd) {
      event.preventDefault(); event.target.selectionStart += 1; event.target.selectionEnd = event.target.selectionStart; syncSourceEditorTools(); return;
    }
    if (event.key === 'Backspace' && !event.target.readOnly && event.target.selectionStart === event.target.selectionEnd) {
      const cursor = event.target.selectionStart;
      if ('([{'.includes(event.target.value[cursor - 1]) && { '(': ')', '[': ']', '{': '}' }[event.target.value[cursor - 1]] === event.target.value[cursor]) {
        event.preventDefault(); event.target.setRangeText('', cursor - 1, cursor + 1, 'end'); setSourceDirty(true); updateEditorMetrics(); return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      const saveButton = $('#save-bot-source');
      if (!saveButton.disabled) void submitBot();
      return;
    }
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || event.target.readOnly) return;
    event.preventDefault();
    const editor = event.target;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = editor.value.slice(start, end);
    const hasMultipleLines = selected.includes('\n');
    if (hasMultipleLines) {
      const blockStart = editor.value.lastIndexOf('\n', start - 1) + 1;
      const blockEndIndex = editor.value.indexOf('\n', end);
      const blockEnd = blockEndIndex < 0 ? editor.value.length : blockEndIndex;
      const block = editor.value.slice(blockStart, blockEnd);
      const changed = event.shiftKey
        ? block.replace(/^ {1,2}/gm, '')
        : block.replace(/^/gm, '  ');
      editor.setRangeText(changed, blockStart, blockEnd, 'select');
    } else if (event.shiftKey) {
      const lineStart = editor.value.lastIndexOf('\n', start - 1) + 1;
      const removeCount = Math.min(2, editor.value.slice(lineStart, start).match(/^ {1,2}/)?.[0].length || 0);
      if (removeCount) {
        editor.setRangeText('', lineStart, lineStart + removeCount, 'end');
        editor.selectionStart = Math.max(lineStart, start - removeCount);
        editor.selectionEnd = Math.max(lineStart, end - removeCount);
      }
    } else {
      editor.setRangeText('  ', start, end, 'end');
    }
    setSourceDirty(true);
    updateEditorMetrics();
  });
  on('#bot-source-editor', 'input', updateEditorMetrics, { feature: 'bot-source-editor-metrics' });
  on('#bot-source-editor', 'keyup', syncSourceEditorTools, { feature: 'bot-source-editor-cursor' });
  on('#bot-source-editor', 'click', () => {
    syncSourceEditorTools();
    if (state.botWorkspaceReadOnly) {
      const revision = typeof currentPracticeRevision === 'function' ? currentPracticeRevision() : null;
      if (revision && typeof loadRevisionSource === 'function') {
        void loadRevisionSource(revision, 'draft', false).then(() => {
          if (typeof showToast === 'function') showToast('Đã kích hoạt chế độ tạo bản nháp. Bạn có thể chỉnh sửa mã nguồn ngay.', 'info');
          $('#bot-source-editor')?.focus();
        });
      }
    }
  }, { feature: 'bot-source-editor-cursor-click' });
  on('#bot-source-editor', 'scroll', updateEditorMetrics, { options: { passive: true } });
  on('#source-format', 'click', formatSourceCode);
  on('#source-theme', 'click', () => {
    const shell = $('.source-editor-shell'); if (!shell) return;
    const light = shell.classList.toggle('is-light');
    const button = $('#source-theme'); if (button) button.textContent = light ? 'Tối' : 'Sáng';
  });
  on('#source-expand', 'click', () => {
    const panel = $('.bot-editor-panel'); if (!panel) return;
    const expanded = panel.classList.toggle('is-expanded'); const button = $('#source-expand'); if (button) button.textContent = expanded ? 'Thu nhỏ' : 'Phóng to';
    updateEditorMetrics();
  });
  on('#save-bot-source', 'click', () => void submitBot());
  on('#run-bot-practice', 'click', openCurrentPracticeRunner);
  on('#open-bot-playground-from-ws', 'click', () => {
    const editor = $('#bot-source-editor');
    const runtime = $('#bot-source-runtime');
    if (editor && editor.value) {
      state.practiceDraft = {
        source: editor.value,
        runtimeId: runtime ? runtime.value : 'cpp'
      };
      const playgroundCode = $('#playground-code');
      const playgroundRuntime = $('#playground-runtime-selector');
      if (playgroundCode) playgroundCode.value = editor.value;
      if (playgroundRuntime && runtime) playgroundRuntime.value = runtime.value;
    }
    navigate('bot-playground');
  });
  on('#practice-run', 'click', () => void testBotRevision());
  on('#practice-replay-start', 'click', () => { stopPracticeReplay(); goToPracticeTurn(-1); });
  on('#practice-replay-prev', 'click', () => { stopPracticeReplay(); goToPracticeTurn(state.practiceReplayMoveIndex - 1); });
  on('#practice-replay-next', 'click', () => { stopPracticeReplay(); goToPracticeTurn(state.practiceReplayMoveIndex + 1); });
  on('#practice-replay-end', 'click', () => { stopPracticeReplay(); goToPracticeTurn((state.practiceReplay?.moves?.length || 1) - 1); });
  on('#practice-replay-play', 'click', togglePracticeReplay);
  on('#practice-replay-scrubber', 'input', event => { stopPracticeReplay(); goToPracticeTurn(Number(event.target.value)); });
  on('#practice-replay-speed', 'change', () => { if (state.practiceReplayActive) { stopPracticeReplay(); togglePracticeReplay(); } });
  on('#practice-scenario', 'change', () => {
    state.practiceAbortController?.abort();
    state.practiceAbortController = null;
    state.practiceRequestToken += 1;
    clearPracticeResult();
  });
    on('#tournament-search', 'input', event => { state.tournamentSearch = event.target.value; state.tournamentPage = 1; renderTournamentList(); });
    on('#tournament-status-filter', 'change', event => { state.tournamentStatusFilter = event.target.value; state.tournamentPage = 1; renderTournamentList(); });
   on('#dashboard-tournament-search', 'input', event => { state.dashboardTournamentSearch = event.target.value; void loadDashboard(); });
   on('#dashboard-tournament-status', 'change', event => { state.dashboardTournamentStatus = event.target.value; void loadDashboard(); });
  on('#confirm-delete-bot', 'click', () => void deleteBot());
  on('#confirm-delete-revision', 'click', () => void deleteRevision());
  on('#confirm-tournament-action', 'click', () => { const pending = state.pendingTournamentAction; if (!pending) return; const revision = state.tournamentActionRevision; void runPending(`tournament:${pending.tournamentId}:${pending.action}`, $('#confirm-tournament-action'), async () => { await tournamentAction(pending.tournamentId, pending.authRevision, pending.viewRevision, pending.action); if (state.tournamentActionRevision === revision) closeModal('tournament-action-modal'); }); });
  on('#mobile-menu-toggle', 'click', toggleMobileNavigation); on('#sidebar-backdrop', 'click', closeMobileNavigation);
  on('#open-bot-guide', 'click', openBotGuide);
  on('#btn-register-bot', 'click', () => { openRegistrationDialog(); void populateBotSelect(); });
  on('#go-to-bots-from-registration', 'click', goToBotsFromRegistration);
  on('#retry-registration-bots', 'click', retryRegistrationBots);
  on('#reg-part-name', 'input', () => { $('#reg-part-name').setAttribute('aria-invalid', $('#reg-part-name').value.trim() ? 'false' : 'true'); });
  on('#reg-bot-select', 'change', () => { $('#reg-bot-select').setAttribute('aria-invalid', $('#reg-bot-select').value ? 'false' : 'true'); });
  on('#reg-bot-select', 'change', event => { void populateRevisionSelect(event.target.value); }, { feature: 'registration-revision-loader' });
   on('#reg-revision-select', 'change', () => { $('#reg-revision-select').setAttribute('aria-invalid', $('#reg-revision-select').value ? 'false' : 'true'); updateRegistrationRevisionSummary(); });
   on('#copy-replay-match-id', 'click', () => {
     const matchId = state.replayMatchId;
     if (!matchId || !navigator.clipboard?.writeText) { showToast('Không thể sao chép mã trận.', 'error'); return; }
     void navigator.clipboard.writeText(matchId).then(() => showToast('Đã sao chép mã trận.', 'success')).catch(() => showToast('Không thể sao chép mã trận.', 'error'));
   });
  on('#close-replay', 'click', closeReplay); on('#btn-replay-play', 'click', toggleReplayPlayback); on('#replay-retry', 'click', retryReplay); on('#replay-speed', 'change', event => { state.replaySpeed = Number(event.target.value); if (state.replayPlaybackActive) { stopReplayPlayback(); toggleReplayPlayback(); } }); on('#replay-scrubber', 'input', event => { stopReplayPlayback(); goToReplayTurn(Number(event.target.value)); }); on('#new-tourney-name', 'input', () => { $('#new-tourney-name').setAttribute('aria-invalid', 'false'); $('#tournament-form-error').hidden = true; }); on('#submit-tournament', 'click', () => void submitNewTournament()); on('#submit-registration', 'click', () => void submitTournamentRegistration());
  on('#live-game-result-close', 'click', closeLiveGameResultModal);
  on('#live-game-result-modal', 'click', event => { if (event.target === event.currentTarget) closeLiveGameResultModal(); });
  document.querySelectorAll('[data-close-modal]').forEach(button => on(button, 'click', () => closeModal(button.dataset.closeModal)));
  document.querySelectorAll('.modal-overlay').forEach(modal => on(modal, 'click', event => { if (event.target === modal) closeModal(modal.id); }));
  on(document, 'keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(modal => closeModal(modal.id));
      if (document.querySelector('#live-game-result-modal.is-visible')) closeLiveGameResultModal();
      closeMobileNavigation();
    }
    else if (state.activeView === 'replay-view' && (!(event.target instanceof Element) || !event.target.closest('input:not(#replay-scrubber), textarea, select'))) {
      if (event.key === ' ') { event.preventDefault(); toggleReplayPlayback(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); stopReplayPlayback(); goToReplayTurn(state.replayMoveIndex - 1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); stopReplayPlayback(); goToReplayTurn(state.replayMoveIndex + 1); }
      else if (event.key === 'Home') { event.preventDefault(); stopReplayPlayback(); goToReplayTurn(-1); }
      else if (event.key === 'End' && state.replay) { event.preventDefault(); stopReplayPlayback(); goToReplayTurn(state.replay.moves.length - 1); }
    } else trapModalFocus(event);
  }, { required: true, feature: 'global keyboard navigation' });
  on(window, 'beforeunload', event => {
    // A draft may remain in memory after navigating to another view. The
    // browser warning is only relevant while the editor is visible.
    if (state.activeView !== 'bot-workspace' || !hasUnsavedBotWorkspaceChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  on(window, 'hashchange', syncLocationRoute, { required: true, feature: 'hash route synchronization' });
  on(window, 'popstate', syncLocationRoute, { required: true, feature: 'history navigation' });
  on('#btn-replay-start', 'click', () => { stopReplayPlayback(); goToReplayTurn(-1); }); on('#btn-replay-prev', 'click', () => { stopReplayPlayback(); goToReplayTurn(state.replayMoveIndex - 1); }); on('#btn-replay-next', 'click', () => { stopReplayPlayback(); goToReplayTurn(state.replayMoveIndex + 1); }); on('#btn-replay-end', 'click', () => { stopReplayPlayback(); if (state.replay) goToReplayTurn(state.replay.moves.length - 1); });
}

// Clearer tournament schedule presentation: use explicit labels, winner emphasis,
// and a compact match summary so the table can be understood at a glance.

bindEvents();
document.querySelectorAll('.bottom-nav [data-target]').forEach(button => bindEvent(button, 'click', () => {
  state.tournamentScope = button.dataset.target === 'my-tournaments'
    ? 'mine'
    : button.dataset.scope || (state.user?.role === 'organizer' ? 'managed' : 'discoverable');
  navigate(button.dataset.target === 'my-tournaments' ? 'tournaments' : button.dataset.target, { fromNav: true });
}));
if (window.ResizeObserver) {
  const editor = $('#bot-source-editor');
  if (editor) new ResizeObserver(updateEditorMetrics).observe(editor);
}
updateEditorMetrics();
setAuthMode('login', false); setupReplayCoordinates();
if (!(typeof window !== 'undefined' && window.OTT_PUBLIC_REPLAY_STATIC_ONLY === true)) void restoreSession();
initAuthMotion();
setInterval(() => {
  if (state.user) void refreshQueueStats();
  const multiStagePollingOwnsDetail = state.multiStage?.loadedTournamentId === state.tournamentId
    && Boolean(state.multiStage?.progress);
  if (state.activeView === 'tournament-detail' && state.detailStatus === 'running'
    && !multiStagePollingOwnsDetail && !state.detailRefreshInFlight) {
    state.detailRefreshInFlight = true;
    void refreshTournamentDetail().finally(() => { state.detailRefreshInFlight = false; });
  }
}, 5000);

setInterval(() => {
  if (state.activeView !== 'tournament-detail' || !state.currentTournament) return;
  updateTournamentScheduleNotice(state.currentTournament);
  const schedule = state.currentTournament.schedule || {};
  const now = Date.now();
  const nextLifecycleTimestamp = state.currentTournament.status === 'draft'
    ? Date.parse(schedule.registrationOpensAt || '')
    : state.currentTournament.status === 'registration_open'
      ? Date.parse(schedule.registrationClosesAt || '')
      : NaN;
  const due = Number.isFinite(nextLifecycleTimestamp) && nextLifecycleTimestamp <= now;
  if (due && !state.detailRefreshInFlight) {
    state.detailRefreshInFlight = true;
    void refreshTournamentDetail().finally(() => { state.detailRefreshInFlight = false; });
  }
}, 1000);
