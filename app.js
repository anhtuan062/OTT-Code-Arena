const API_URL = '/api';
const STRATEGY_TEMPLATES = {
  cpp: '#include "ott_strategy_sdk.hpp"\n\n// Strategy SDK 1.0.0: GameState, Move và Piece đã được định nghĩa trong file header này.\n// Bạn chỉ cần viết chooseMove; không viết main, JSON hoặc stdin/stdout.\n//\n// struct Move {\n//     string piece_id;       // Mã quân cờ\n//     string from;           // Ô xuất phát, ví dụ: c1\n//     string to;             // Ô đích, ví dụ: d2\n//     string captures;       // Mã quân bị ăn\n//     bool has_capture;      // Có ăn quân hay không\n// };\n//\n// struct Piece {\n//     string id;              // Mã quân\n//     string type;            // dam, la hoặc keo\n//     char player;            // A hoặc B\n//     string pos;             // Vị trí, ví dụ: a1\n// };\n//\n// struct GameState {\n//     string protocol_version;\n//     string match_id;\n//     int turn;               // Bắt đầu từ 1\n//     char player;            // Bot đang được gọi: A hoặc B\n//     int board_size;         // 9\n//     vector<Piece> pieces;\n// };\n\nusing namespace std; // Dùng string, vector... mà không cần viết std::\n\nMove chooseMove(const GameState& state, const vector<Move>& legalMoves) {\n    // state.player cho biết Bot đang được gọi là A hay B.\n    // Ví dụ mẫu: A chọn nước đầu, B chọn nước cuối.\n    if (state.player == \'A\') return legalMoves.front();\n    return legalMoves.back();\n}\n',
  python3: 'from ott_strategy_sdk import Move, GameState\n\n# Strategy SDK 1.0.0: hệ thống gọi choose_move mỗi lượt.\n# Không cần viết JSON, stdin/stdout hoặc vòng lặp trận đấu.\n#\n# @dataclass(frozen=True)\n# class Move:\n#     piece_id: str       # Mã quân cờ\n#     from_position: str  # Ô xuất phát, ví dụ: c1\n#     to: str             # Ô đích, ví dụ: d2\n#     captures: str | None  # Mã quân bị ăn, None nếu không ăn\n#\n# @dataclass(frozen=True)\n# class Piece:\n#     id: str             # Mã quân\n#     type: str           # dam, la hoặc keo\n#     player: str         # A hoặc B\n#     pos: str            # Vị trí, ví dụ: a1\n#\n# @dataclass(frozen=True)\n# class GameState:\n#     protocol_version: str\n#     match_id: str\n#     turn: int           # Bắt đầu từ 1\n#     player: str         # Bot đang được gọi: A hoặc B\n#     board_size: int     # 9\n#     pieces: tuple[Piece, ...]\n\ndef choose_move(state: GameState, legal_moves: list[Move]) -> Move:\n    # legal_moves đã chỉ chứa các nước đi hợp lệ.\n    return legal_moves[0]\n',
};
const state = {
  user: null,
  csrfToken: null,
  activeView: 'auth-screen',
  tournamentId: null,
  replay: null,
  replayMoveIndex: -1,
  modalReturnFocus: null,
  authRevision: 0,
  viewRevision: 0,
  loading: new Set(),
  error: null,
  pending: new Set(),
  bots: [],
  botSearch: '',
  deletingBot: null,
  deleteDialogRevision: 0,
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
  pendingInitialRevision: null,
  practiceRevision: null,
  practiceDraft: null,
  practiceReplay: null,
  practiceReplayMoveIndex: -1,
  practiceReplayTimer: null,
  practiceReplayToken: 0,
  practiceRequestToken: 0,
  tournaments: [],
  tournamentSearch: '',
  tournamentScope: 'discoverable',
  tournamentStatusFilter: 'all',
  dashboardTournamentSearch: '',
  dashboardTournamentStatus: 'all',
  tournamentRegistrationContext: null,
  pendingTournamentAction: null,
  tournamentActionRevision: 0,
  tournamentListError: null,
  tournamentDialogRevision: 0,
  editingTournament: null,
  registrationDialogRevision: 0,
  registrationBotsState: 'idle',
  registrationRevisions: [],
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
  liveMatchPollingTimer: null,
  detailStatus: null,
  detailRefreshInFlight: false,
  queueRefreshInFlight: false,
  detailRequestBotNames: new Map(),
};

const CP1252_BYTES = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

function repairMojibake(value) {
  if (typeof value !== 'string' || !/[ÃÄÂáâ]/.test(value)) return value;
  const bytes = [];
  for (const character of value) {
    const code = CP1252_BYTES[character] ?? character.charCodeAt(0);
    if (code > 255) return value;
    bytes.push(code);
  }
  try {
    const repaired = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    return repaired.includes('�') ? value : repaired;
  } catch {
    return value;
  }
}

function repairMojibakeDom() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach(node => {
    const repaired = repairMojibake(node.nodeValue || '');
    if (repaired !== node.nodeValue) node.nodeValue = repaired;
  });
  document.querySelectorAll('[aria-label], [title], [placeholder]').forEach(element => {
    ['aria-label', 'title', 'placeholder'].forEach(attribute => {
      if (element.hasAttribute(attribute)) {
        const value = element.getAttribute(attribute);
        const repaired = repairMojibake(value || '');
        if (repaired !== value) element.setAttribute(attribute, repaired);
      }
    });
  });
}

const $ = (selector, root = document) => root.querySelector(selector);
const create = (tag, options = {}) => {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = repairMojibake(String(options.text));
  if (options.type) element.type = options.type;
  if (options.attrs) Object.entries(options.attrs).forEach(([name, value]) => element.setAttribute(name, String(value)));
  return element;
};
const clear = (element) => element.replaceChildren();
const textCell = (text, tag = 'td') => create(tag, { text });
const shortId = value => {
  const id = String(value || '');
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
};

const PRACTICE_SCENARIOS = {
  initial: { label: 'Bàn cờ ban đầu', help: 'Vị trí khởi đầu để kiểm tra nước đi đầu tiên.' },
  capture: { label: 'Có cơ hội ăn quân', help: 'Kiểm tra nước đi có thể ăn quân đối phương.' },
  'near-goal': { label: 'Tiến gần ô đích', help: 'Kiểm tra lựa chọn khi quân đã gần ô đích.' },
};

const STATUS_LABELS = {
  draft: 'Bản nháp',
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

const REASON_LABELS = {
  goal_reached: 'Đến ô đích',
  type_elimination: 'Loại hết một loại quân',
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
  run_all: 'Chạy tất cả trận đấu',
  cancel: 'Hủy giải đấu',
};

const ACTION_SUCCESS_MESSAGES = {
  open_registration: 'Đã mở đăng ký giải đấu.',
  close_registration: 'Đã đóng đăng ký giải đấu.',
  generate_schedule: 'Đã tạo lịch thi đấu.',
  start: 'Đã bắt đầu giải đấu.',
  run_all: 'Đã đưa các trận đấu vào hàng đợi.',
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
    transform: 'translate(12 11.5) scale(1.3 1.45) translate(-11.5 -11.5)',
    shapes: [{
      tag: 'path',
      attrs: {
        d: 'M16 13V7a2 2 0 0 0-4 0v2 M12 9V5a2 2 0 0 0-4 0v4 M8 9V6a2 2 0 0 0-4 0v7a5 5 0 0 0 5 5h4a5 5 0 0 0 5-5v-2a2 2 0 0 0-4 0 M4 11a3 3 0 0 1 3-3h3a2 2 0 0 1 2 2v2a3 3 0 0 1-3 3H7',
        fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      },
    }],
  },
  'icon-piece-la': {
    transform: 'translate(12 11.8) scale(1.9 1.5) translate(-11.85 -13.3)',
    shapes: [{
      tag: 'path',
      attrs: {
        d: 'M8.6 12.6V7.9a1.05 1.05 0 0 1 2.1 0v3.6M10.7 11.2V6.7a1.05 1.05 0 0 1 2.1 0v4.6M12.8 11.3V7.3a1.05 1.05 0 0 1 2.1 0v4.7M14.9 12v-2a1 1 0 0 1 2 0v4c0 2.6-2 4.7-4.5 4.9h-.6c-1.8 0-3.4-1-4.3-2.6l-1.1-2.1a1 1 0 0 1 1.7-1l.9 1.2',
        fill: 'none', stroke: 'currentColor', 'stroke-width': '1.1', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      },
    }],
  },
  'icon-piece-keo': {
    transform: 'translate(12 12) scale(1.9) translate(-12 -12)',
    shapes: [
      { tag: 'circle', attrs: { cx: '8.5', cy: '8.5', r: '1.7', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.1' } },
      { tag: 'circle', attrs: { cx: '8.5', cy: '15.5', r: '1.7', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.1' } },
      { tag: 'path', attrs: { d: 'M9.8 9.6L17 15.5M9.8 14.4L17 8.5', stroke: 'currentColor', 'stroke-width': '1.1', 'stroke-linecap': 'round' } },
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
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const pieceDefinition = PIECE_SVG_DEFINITIONS[id];
  if (pieceDefinition) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('transform', pieceDefinition.transform);
    pieceDefinition.shapes.forEach(shape => appendSvgShape(group, shape));
    svg.appendChild(group);
    return svg;
  }
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}

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
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); button.classList.add('is-loading'); }
  try { return await action(); }
  catch (error) {
    if (!error?.notified) showToast(error?.message || 'Thao tác thất bại. Vui lòng thử lại.', 'error');
    return undefined;
  } finally {
    state.pending.delete(key);
    if (button) { button.disabled = false; button.removeAttribute('aria-busy'); button.classList.remove('is-loading'); }
  }
}

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  if (!container) return;
  const toast = create('div', { className: `toast toast-${type}`, attrs: { role: type === 'error' ? 'alert' : 'status' } });
  toast.appendChild(create('span', { text: message }));
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

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  state.modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  const focusable = getModalFocusable(modal)[0];
  if (focusable instanceof HTMLElement) focusable.focus();
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
  if (id === 'add-tourney-modal') { state.tournamentDialogRevision += 1; $('#tournament-form-error').textContent = ''; $('#tournament-form-error').hidden = true; }
  if (id === 'register-bot-tourney-modal') { state.registrationDialogRevision += 1; $('#registration-form-error').textContent = ''; $('#registration-form-error').hidden = true; }
  if (id === 'tournament-action-modal') { state.tournamentActionRevision += 1; state.pendingTournamentAction = null; }
  if (id === 'practice-modal') {
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
  const modal = document.querySelector('.modal-overlay.open');
  if (!modal) return;
  const focusable = getModalFocusable(modal);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

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
  return state.activeView !== 'bot-workspace' || !state.sourceDirty
    || window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời không gian mã nguồn?');
}

function navigate(view, options = {}) {
  if (view === 'bot-workspace' && state.user?.role !== 'competitor') return false;
  if (view !== state.activeView && !canLeaveBotWorkspace()) return false;
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
    const active = view === 'tournaments'
      ? (state.tournamentScope === 'mine' ? link.dataset.target === 'my-tournaments' : link.dataset.target === 'tournaments')
      : link.dataset.target === view;
    link.classList.toggle('active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });
  const pageTitles = { dashboard: state.user?.role === 'organizer' ? 'Tổng quan giải đấu' : 'Tổng quan', bots: 'Bot của tôi', 'bot-workspace': 'Không gian mã nguồn', tournaments: state.tournamentScope === 'mine' ? 'Giải đấu của tôi' : state.user?.role === 'organizer' ? 'Quản lý giải đấu' : 'Giải đấu đang mở', 'tournament-detail': 'Chi tiết giải đấu', 'replay-view': 'Xem lại trận đấu' };
  const pageTitle = $('#page-title');
  if (pageTitle) pageTitle.textContent = pageTitles[view] || 'OTT Code Arena';
  const breadcrumb = $('#topbar-breadcrumb');
  if (breadcrumb) breadcrumb.textContent = state.user?.role === 'organizer' && view === 'dashboard' ? 'Quản lý / Tổng quan' : `OTT Code Arena / ${pageTitles[view] || 'Không gian làm việc'}`;
  closeMobileNavigation();
  target.classList.add('active');
  if (view === 'dashboard') void loadDashboard();
  if (view === 'bots') void loadBots();
  if (view === 'tournaments') void loadTournaments();
  if (view === 'bot-workspace') {
    const workspace = $('#bot-source-workspace');
    if (workspace) workspace.hidden = false;
  }
  if (options.history !== false && view === 'bot-workspace' && window.location.hash !== '#bot-workspace') {
    window.history.pushState({ view }, '', '#bot-workspace');
  }
  if (options.history !== false && ['dashboard', 'bots', 'tournaments'].includes(view)) {
    const hash = `#${view}`;
    if (window.location.hash !== hash) window.history.pushState({ view }, '', hash);
  }
  return true;
}

function openTournamentDialog() {
  state.tournamentDialogRevision += 1;
  const nameInput = $('#new-tourney-name');
  const error = $('#tournament-form-error');
  if (error) { error.textContent = ''; error.hidden = true; }
  if (nameInput) nameInput.setAttribute('aria-invalid', 'false');
  state.editingTournament = null;
  $('#add-tourney-title').textContent = 'Tạo giải đấu mới';
  $('#tourney-dialog-description').textContent = 'Thiết lập giải đấu để đăng ký Bot và tổ chức các trận đấu.';
  $('.tournament-submit-label').textContent = 'Tạo giải đấu';
  $('.tournament-submit-loading').textContent = 'Đang tạo…';
  openModal('add-tourney-modal');
  if (nameInput) requestAnimationFrame(() => nameInput.focus());
}

function openEditTournamentDialog(tournament) {
  state.tournamentDialogRevision += 1;
  state.editingTournament = tournament;
  $('#new-tourney-name').value = tournament.name || '';
  $('#new-tourney-visibility').value = tournament.metadata?.access === 'public' ? 'public' : 'private';
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
  $('#registration-revision-summary').textContent = 'Chưa chọn Bot và revision';
  setRegistrationLoadingState();
  openModal('register-bot-tourney-modal');
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
  $('#registration-fields').hidden = false;
  $('#submit-registration').hidden = false;
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

function goToBotsFromRegistration() {
  closeModal('register-bot-tourney-modal');
  navigate('bots');
}

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
  const competitor = user.role === 'competitor';
  document.body.dataset.role = user.role;
  const bottomNavigation = $('.bottom-nav');
  if (bottomNavigation) bottomNavigation.hidden = !competitor;
  document.querySelectorAll('.role-nav').forEach(link => { link.hidden = link.dataset.role !== user.role; });
  ['#dashboard-create-bot', '#dash-empty-bot', '#open-bot-modal'].forEach(selector => { const element = $(selector); if (element) element.hidden = !competitor; });
  ['#dashboard-create-tournament', '#dash-empty-tournament', '#open-tournament-modal'].forEach(selector => { const element = $(selector); if (element) element.hidden = competitor; });
  navigate('dashboard');
}

function showAuthScreen(message = '') {
  const authScreen = $('#auth-screen');
  const registerForm = $('#register-form');
  const shouldResetAuthForm = authScreen.hidden || (registerForm && !registerForm.hidden);
  state.user = null;
  state.csrfToken = null;
  authScreen.hidden = false;
  $('#app-nav').hidden = true;
  $('#app-topbar').hidden = true;
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

  state.error = null;
  clearAuthMessage('login');
  clearAuthMessage('register');
  loginForm.classList.toggle('active-form', loginMode);
  registerForm.classList.toggle('active-form', !loginMode);
  loginForm.hidden = !loginMode;
  registerForm.hidden = loginMode;
  loginSwitch.hidden = loginMode;
  registerSwitch.hidden = !loginMode;
  
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
    if (username.length < 3) {
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

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (state.csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['x-csrf-token'] = state.csrfToken;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      method,
      headers,
      credentials: 'same-origin',
      ...(method === 'GET' || method === 'HEAD' ? { cache: 'no-store' } : {}),
    });
  } catch {
    throw new Error('Không thể kết nối. Hãy kiểm tra mạng và thử lại.');
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
  try {
    const result = await request('/auth/me');
    setAuthenticated(result.user, result.csrfToken);
  } catch {
    showAuthScreen();
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
    if (queueStats) queueStats.textContent = `Hàng đợi: ${stats.activeCount}/${stats.maxConcurrent} đang chạy, ${stats.queueLength} đang chờ`;
    $('#dash-queue-value').textContent = `${stats.activeCount} / ${stats.maxConcurrent}`;
  } catch {
    if (isCurrentView(state.activeView, authRevision, viewRevision, detailTournamentId || undefined)) {
      const queueStats = $('#queue-stats');
      if (queueStats) queueStats.textContent = 'Không thể tải trạng thái hàng đợi';
      $('#dash-queue-value').textContent = '—';
    }
  } finally {
    state.queueRefreshInFlight = false;
  }
}

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
  void refreshQueueStats();
  try {
    const competitor = state.user?.role === 'competitor';
    const dashboard = $('#dashboard');
    dashboard?.classList.toggle('player-dashboard', competitor);
    if (dashboardToolbar) dashboardToolbar.hidden = competitor;
    const secondaryColumn = $('#dashboard-secondary-column');
    const dashboardTitle = $('#dashboard-welcome-title');
    const dashboardCopy = $('#dashboard-welcome-copy');
    const activityTitle = $('#recent-tournaments-title');
    const botLabel = $('#dash-bot-label');
    const tournamentLabel = $('#dash-tourney-label');
    const queueLabel = $('#dash-queue-label');
    const queueCard = $('#dash-queue-card');
    const dashboardIcons = {
      bot: competitor ? 'icon-bot' : 'icon-user-round-plus',
      tournament: competitor ? 'icon-trophy' : 'icon-shield-check',
      queue: competitor ? 'icon-user-round-plus' : 'icon-activity',
    };
    [['dash-bot-icon', dashboardIcons.bot], ['dash-tourney-icon', dashboardIcons.tournament], ['dash-queue-icon', dashboardIcons.queue]].forEach(([id, iconId]) => {
      const use = $(`#${id}`); if (use) use.setAttribute('href', `#${iconId}`);
    });
    if (dashboardTitle) dashboardTitle.textContent = competitor ? 'Tổng quan của tôi' : 'Tổng quan giải đấu';
    if (dashboardCopy) {
      dashboardCopy.replaceChildren(
        document.createTextNode('Chào mừng trở lại, '),
        create('span', { text: state.user?.username || '', attrs: { id: 'dashboard-username' } }),
        document.createTextNode(`. ${competitor ? 'Tạo Bot và tìm giải đấu phù hợp.' : 'Theo dõi và quản lý các giải đấu của bạn.'}`),
      );
    }
    if (activityTitle) activityTitle.textContent = competitor ? 'Giải đấu dành cho bạn' : 'Giải đấu gần đây';
    if (secondaryColumn) secondaryColumn.textContent = competitor ? 'Trạng thái tham gia' : 'Thể thức';
    if (botLabel) botLabel.textContent = competitor ? 'Bot của tôi' : 'Mở đăng ký';
    if (tournamentLabel) tournamentLabel.textContent = competitor ? 'Đang tham gia' : 'Giải đấu quản lý';
    if (queueLabel) queueLabel.textContent = competitor ? 'Đang diễn ra' : 'Đang diễn ra';
    if (queueCard) queueCard.hidden = competitor;
    const [tournamentResponse, bots, myTournamentResponse] = await Promise.all([
      request(competitor ? '/tournaments/discoverable' : '/tournaments'),
      competitor ? request('/bots') : Promise.resolve([]),
      competitor ? request('/my/tournaments') : Promise.resolve([]),
    ]);
    if (!isCurrentView('dashboard', authRevision, viewRevision)) return;
    const tournaments = competitor
      ? tournamentResponse.filter(tournament => tournament.status === 'registration_open')
      : tournamentResponse;
    if (competitor) state.bots = bots;
    const openCount = tournaments.filter(tournament => tournament.status === 'registration_open').length;
    const runningCount = tournaments.filter(tournament => ['running', 'in_progress'].includes(tournament.status)).length;
    const participatingCount = competitor
      ? myTournamentResponse.filter(tournament => tournament.participantId || tournament.request?.status === 'approved').length
      : 0;
    $('#dash-tourney-count').textContent = competitor ? participatingCount : tournaments.length;
    if (competitor) {
      $('#dash-bot-count').textContent = bots.length;
      $('#dash-queue-value').textContent = openCount;
      const queueLabelText = $('#dash-queue-label'); if (queueLabelText) queueLabelText.textContent = 'Giải đang mở đăng ký';
      if (botSection) { botSection.hidden = false; renderDashboardBotList(bots); }
    } else {
      const requestResults = await Promise.allSettled(tournaments.map(tournament => request(`/tournaments/${tournament.tournamentId}/requests`)));
      if (!isCurrentView('dashboard', authRevision, viewRevision)) return;
      const pendingCount = requestResults.reduce((total, result) => total + (result.status === 'fulfilled'
        ? result.value.filter(item => item.status === 'pending').length : 0), 0);
      $('#dash-bot-count').textContent = openCount;
      $('#dash-queue-value').textContent = runningCount;
      if (botSection) botSection.hidden = true;
    }
    const hasRevision = bots.some(bot => Boolean(bot.currentRevisionId));
    const createBotAction = $('#dashboard-create-bot');
    if (competitor && createBotAction) {
      createBotAction.textContent = hasRevision ? 'Mã nguồn Bot' : 'Lưu phiên bản mã nguồn';
      createBotAction.title = hasRevision ? 'Mở không gian Bot' : 'Tạo Bot và lưu phiên bản C++17 hoặc Python 3 trước khi tham gia';
    }
    if (competitor && createBotAction) {
      createBotAction.textContent = bots.length ? 'Mã nguồn Bot' : 'Tạo Bot';
      createBotAction.title = bots.length ? 'Mở không gian Bot' : 'Tạo Bot mới';
    }
    clear(table);
    const searchTerm = state.dashboardTournamentSearch.trim().toLowerCase();
    const filteredTournaments = tournaments.filter(tournament => {
      const matchesSearch = !searchTerm || String(tournament.name || '').toLowerCase().includes(searchTerm);
      const matchesStatus = state.dashboardTournamentStatus === 'all' || tournament.status === state.dashboardTournamentStatus;
      return matchesSearch && matchesStatus;
    });
    if (!tournaments.length) {
      tableCard.hidden = true;
      emptyState.hidden = false;
      activityHeader.hidden = !competitor;
      if (!emptyState.querySelector('.dashboard-empty-icon')) {
        const emptyIcon = icon('icon-trophy'); emptyIcon.classList.add('dashboard-empty-icon'); emptyState.prepend(emptyIcon);
      }
      if (competitor) {
        $('#dash-empty-title').textContent = 'Chưa có giải đấu mở';
        $('#dash-empty-copy').textContent = 'Tạo Bot đầu tiên để sẵn sàng tham gia khi có giải đấu.';
        if (!emptyState.querySelector('.dashboard-empty-icon')) {
          const emptyIcon = icon('icon-trophy'); emptyIcon.classList.add('dashboard-empty-icon'); emptyState.prepend(emptyIcon);
        }
      }
      $('#dash-empty-title').textContent = competitor ? 'Chưa có giải đấu mở' : 'Bạn chưa tạo giải đấu nào';
      $('#dash-empty-copy').textContent = bots.length
        ? 'Khi có giải đấu phù hợp, bạn có thể gửi yêu cầu tham gia tại đây.'
        : competitor ? 'Tạo Bot đầu tiên để sẵn sàng tham gia khi có giải đấu.' : 'Tạo giải đấu đầu tiên để bắt đầu tổ chức thi đấu.';
      if (competitor) {
        $('#dash-empty-title').textContent = 'Chưa có giải đấu mở';
        $('#dash-empty-copy').textContent = 'Tạo Bot đầu tiên để sẵn sàng tham gia khi có giải đấu.';
      }
      $('#dash-empty-bot').hidden = true;
      if (competitor) $('#dash-empty-bot').textContent = bots.length ? 'Xem giải đấu đang mở' : 'Đăng ký Bot';
      $('#dash-empty-tournament').hidden = true;
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
      row.append(textCell(tournament.name), textCell(competitor ? myStatus : 'Vòng tròn một lượt'), (() => { const cell = create('td'); cell.appendChild(statusBadge(tournament.status)); return cell; })(), textCell(tournament.participants?.length ?? tournament.participantCount ?? 0));
      const action = create('td');
      if (competitor) action.appendChild(actionButton('Đăng ký Bot', () => {
        state.tournamentId = tournament.tournamentId;
        state.tournamentRegistrationContext = { name: tournament.name, status: tournament.status };
        openRegistrationDialog();
        void populateBotSelect();
      }, `request:${tournament.tournamentId}`));
      else action.appendChild(actionButton('Xem', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`));
      if (competitor && tournament.myRequestStatus) {
        clear(action);
        if (tournament.myRequestStatus === 'approved') {
          action.appendChild(actionButton('Xem giáº£i Ä‘áº¥u', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`));
        } else {
          const statusAction = actionButton(tournament.myRequestStatus === 'pending' ? 'Chá» duyá»‡t' : 'ÄÃ£ tá»« chá»‘i', () => {}, `request:${tournament.tournamentId}`);
          statusAction.disabled = true;
          action.appendChild(statusAction);
        }
      }
      row.appendChild(action);
      table.appendChild(row);
    });
  } catch (error) {
    if (isCurrentView('dashboard', authRevision, viewRevision)) {
      state.error = error.message || 'Unable to load dashboard.';
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

function renderDashboardBotList(bots) {
  const list = $('#dash-bot-list');
  if (!list) return;
  clear(list);
  list.classList.toggle('is-empty', !bots.length);
  if (!bots.length) {
    const empty = create('div', { className: 'dashboard-bot-empty' });
    const botIcon = icon('icon-bot'); botIcon.classList.add('dashboard-bot-icon');
    empty.append(botIcon, create('strong', { text: 'Báº¡n chÆ°a cÃ³ Bot nÃ o' }), create('span', { text: 'Táº¡o Bot Ä‘áº§u tiÃªn Ä‘á»ƒ báº¯t Ä‘áº§u xÃ¢y dá»±ng chiáº¿n thuáº­t.' }));
    list.appendChild(empty);
    return;
  }
  bots.slice(0, 5).forEach(bot => {
    const item = create('button', { className: 'dashboard-bot-item', type: 'button', attrs: { 'aria-label': `Xem Bot ${bot.name}` } });
    const botIcon = icon('icon-bot'); botIcon.classList.add('dashboard-bot-item-icon');
    const copy = create('span', { className: 'dashboard-bot-copy' });
    copy.append(create('strong', { text: bot.name }), create('small', { text: bot.currentRevisionId ? 'ÄÃ£ cÃ³ phiÃªn báº£n mÃ£ nguá»“n' : 'ChÆ°a cÃ³ phiÃªn báº£n mÃ£ nguá»“n' }));
    const arrow = icon('icon-arrow-up-right'); arrow.classList.add('dashboard-bot-arrow');
    item.append(botIcon, copy, arrow);
    item.addEventListener('click', () => openBotWorkspace(bot));
    list.appendChild(item);
  });
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
  const toolbar = $('#bots-toolbar');
  const createButton = $('#open-bot-modal');
  const headerDescription = $('.bots-workspace-header p');
  if (headerDescription) headerDescription.textContent = 'Quản lý Bot và các phiên bản mã nguồn của bạn.';
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
  if (!hasBots) return renderBotEmpty(list, 'Bạn chưa có Bot nào', 'Tạo Bot đầu tiên để xây dựng chiến thuật, quản lý phiên bản mã nguồn và tham gia giải đấu.', false);
  if (!bots.length) return renderBotEmpty(list, 'Không tìm thấy Bot phù hợp', 'Hãy thử tên khác hoặc xóa nội dung tìm kiếm.', false);
  bots.forEach(bot => {
    const card = create('article', { className: 'bot-card' });
    const header = create('div', { className: 'bot-card-header' });
    const identity = create('div', { className: 'bot-card-identity' });
    const botIcon = create('span', { className: 'bot-card-icon' }); botIcon.appendChild(icon('icon-bot'));
    const heading = create('div'); heading.append(create('h3', { className: 'bot-card-title', text: bot.name }));
    const badges = create('div', { className: 'bot-card-badges' });
    identity.append(botIcon, heading);
    header.append(identity, badges); card.appendChild(header);
    const config = create('div', { className: 'bot-config' });
    const selectedRevision = bot.selectedRevision;
    const runtimeLabel = selectedRevision?.runtimeId === 'cpp' ? 'C++17' : selectedRevision?.runtimeId === 'python3' ? 'Python 3' : selectedRevision ? 'Legacy' : null;
    const modeLabel = selectedRevision?.executionMode === 'strategy' ? 'Strategy SDK' : selectedRevision?.executionMode === 'raw' ? 'Raw' : null;
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
    const date = new Date(bot.registeredAt); footer.appendChild(create('small', { text: Number.isNaN(date.getTime()) ? 'Không có ngày đăng ký' : `Đăng ký ngày ${date.toLocaleDateString('vi-VN')}` }));
    const actions = create('div', { className: 'bot-actions' });
    const actionIcons = ['icon-code-2', 'icon-trash-2'];
    actions.append(actionButton('Mã nguồn', () => openSourceWorkspace(bot), `source-bot:${bot.id}`, 'primary-btn bot-action'), actionButton('Xóa', () => openDeleteBotDialog(bot), `delete-bot:${bot.id}`, 'secondary-btn bot-action bot-delete'));
    actionIcons.forEach((iconId, index) => {
      const action = actions.children[index];
      if (!action || action.querySelector('svg')) return;
      const actionIcon = icon(iconId); actionIcon.classList.add('ui-icon'); action.prepend(actionIcon);
    });
    footer.appendChild(actions); card.appendChild(footer); list.appendChild(card);
  });
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
  const runtimeLabel = isLegacy ? 'Legacy JavaScript' : isPython ? 'Python 3' : 'C++17';
  const filename = $('#bot-source-filename');
  const help = $('#bot-source-help');
  if (filename) filename.textContent = isLegacy ? 'main.js' : isPython ? 'main.py' : 'main.cpp';
  if (help) help.textContent = `${runtimeLabel} · UTF-8 · Tối đa 64 KiB`;
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
  else if (executionMode === 'raw') mode.textContent = 'Raw';
  else mode.textContent = 'Chưa có phiên bản';
}

function updateEditorMetrics() {
  const editor = $('#bot-source-editor');
  const gutter = $('#bot-source-lines');
  if (!editor || !gutter) return;
  const lineCount = Math.max(1, editor.value.split('\n').length);
  gutter.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');
  gutter.scrollTop = editor.scrollTop;
  gutter.style.height = `${editor.clientHeight}px`;
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

function setSourceDirty(dirty) {
  state.sourceDirty = dirty;
  const marker = $('#bot-source-dirty');
  const saveButton = $('#save-bot-source');
  if (marker) marker.hidden = !dirty;
  if (saveButton) {
    const nameChanged = ($('#bot-workspace-name')?.value.trim() || '') !== state.botWorkspaceInitialName;
    saveButton.disabled = state.botWorkspaceMode === 'create' ? !dirty : !(dirty || nameChanged);
  }
  updatePracticeButton();
  syncWorkspaceStatus();
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
  $('#bot-revision-count').textContent = `${state.sourceRevisions.length} phiên bản`;
  if (!state.sourceRevisions.length) {
    list.appendChild(create('p', { className: 'dialog-copy', text: 'Chưa có phiên bản mã nguồn.' }));
    return;
  }
  state.sourceRevisions.forEach(revision => {
    const item = create('article', { className: `bot-revision-item${revision.selected ? ' selected' : ''}` });
    const date = new Date(revision.createdAt);
    const meta = create('div', { className: 'bot-revision-meta' });
    const runtimeLabel = revision.runtimeId === 'cpp' ? 'C++17' : revision.runtimeId === 'python3' ? 'Python 3' : 'Legacy Node.js';
    meta.append(create('strong', { text: `${runtimeLabel} · ${revision.label || `Phiên bản ${revision.revisionId.slice(0, 8)}`}` }), create('span', { text: Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN') }));
    item.appendChild(meta);
    const technical = create('details', { className: 'bot-revision-technical' });
    technical.appendChild(create('summary', { text: 'Chi tiết kỹ thuật' }));
    if (revision.sourceDigest) technical.appendChild(create('div', { className: 'bot-revision-digest', text: `Mã nguồn · ${String(revision.sourceDigest).slice(0, 12)}…` }));
    if (revision.executionMode) technical.appendChild(create('div', { className: 'bot-revision-digest', text: `Chế độ: ${revision.executionMode === 'strategy' ? 'Strategy SDK' : 'Raw'}` }));
    if (revision.sdkVersion) technical.appendChild(create('div', { className: 'bot-revision-digest', text: `SDK ${revision.sdkVersion}${revision.sdkDigest ? ` · ${revision.sdkDigest}` : ''}` }));
    item.appendChild(technical);
    const actions = create('div', { className: 'bot-revision-actions' });
    actions.appendChild(actionButton('Xem phiên bản', () => void loadRevisionSource(revision, 'view'), `view-revision:${revision.revisionId}`, 'secondary-btn bot-action'));
    if (['cpp', 'python3'].includes(revision.runtimeId)) actions.appendChild(actionButton('Chạy thử', () => openPracticeRunner(revision), `practice-revision:${revision.revisionId}`, 'secondary-btn bot-action'));
    if (['cpp', 'python3'].includes(revision.runtimeId)) actions.appendChild(actionButton('Tạo bản nháp', () => void loadRevisionSource(revision, 'draft'), `draft-revision:${revision.revisionId}`, 'secondary-btn bot-action'));
    if (!revision.selected) actions.appendChild(actionButton('Chọn phiên bản', () => void selectRevision(revision), `select-revision:${revision.revisionId}`, 'secondary-btn bot-action'));
    else actions.appendChild(create('span', { className: 'source-runtime', text: 'Đang chọn' }));
    item.appendChild(actions);
    list.appendChild(item);
  });
  updatePracticeButton();
}

async function loadRevisionSource(revision, mode = 'view') {
  if (state.sourceDirty && !window.confirm('Bạn có thay đổi chưa lưu. Tiếp tục sẽ thay thế nội dung hiện tại?')) return;
  setSourceError();
  try {
    const result = await request(`/bots/${revision.botId}/revisions/${revision.revisionId}`);
    $('#bot-source-editor').value = result.source;
    updateEditorMetrics();
    $('#bot-source-runtime').value = ['cpp', 'python3'].includes(revision.runtimeId) ? revision.runtimeId : '';
    state.sourceRuntime = $('#bot-source-runtime').value || 'cpp';
    updateSourceRuntimeMeta($('#bot-source-runtime').value);
    updateSourceModeMeta(revision.executionMode, revision.sdkVersion);
    state.sourceExecutionMode = revision.executionMode || 'raw';
    state.botWorkspaceReadOnly = mode !== 'draft';
    state.botWorkspaceDraftBase = mode === 'draft' ? revision.revisionId : null;
    $('#bot-source-editor').readOnly = state.botWorkspaceReadOnly;
    setWorkspaceStatus(state.botWorkspaceReadOnly ? 'Chỉ đọc · Phiên bản bất biến' : 'Bản nháp từ phiên bản đã lưu');
    setSourceDirty(mode === 'draft');
  } catch (error) { setSourceError(error.message || 'Không thể đọc phiên bản mã nguồn.'); }
}

async function loadBotRevisions(bot) {
  state.sourceRevisions = await request(`/bots/${bot.id}/revisions`);
  renderRevisionList();
  const selected = state.sourceRevisions.find(revision => revision.selected);
  if (selected) await loadRevisionSource(selected, 'view');
  else {
    $('#bot-source-editor').value = STRATEGY_TEMPLATES.cpp;
    $('#bot-source-editor').readOnly = false;
    state.botWorkspaceReadOnly = false;
    state.sourceExecutionMode = 'strategy';
    updateSourceModeMeta('strategy', '1.0.0');
    setWorkspaceStatus('Bản nháp mới');
    setSourceDirty(true);
  }
}

function enhanceBotWorkspaceIcons() {
  const breadcrumb = $('#bot-workspace-back');
  if (breadcrumb && !breadcrumb.querySelector('svg')) {
    const arrow = icon('icon-arrow-left'); arrow.classList.add('workspace-inline-icon');
    breadcrumb.firstChild.textContent = '';
    breadcrumb.prepend(arrow);
  }
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

async function openBotWorkspace(bot = null) {
  if (state.sourceDirty && state.sourceWorkspaceBot?.id !== bot?.id && !window.confirm('Bạn có thay đổi chưa lưu. Tiếp tục sẽ đóng nội dung hiện tại?')) return;
  state.botWorkspaceMode = bot ? 'edit' : 'create';
  state.sourceWorkspaceBot = bot;
  state.botWorkspaceReadOnly = false;
  state.sourceExecutionMode = bot ? 'raw' : 'strategy';
  state.botWorkspaceDraftBase = null;
  const pendingInitial = !bot && state.pendingInitialRevision;
  if (!bot && !pendingInitial) state.pendingInitialRevision = null;
  if (!navigate('bot-workspace')) return;
  enhanceBotWorkspaceIcons();
  $('#bot-workspace-name').value = bot?.name || '';
  state.botWorkspaceInitialName = bot?.name || '';
  $('#bot-source-title').textContent = 'Không gian mã nguồn';
  $('#bot-workspace-breadcrumb-current').textContent = bot?.name || 'Tạo Bot mới';
  $('#bot-source-description').textContent = 'Viết và quản lý mã nguồn Bot';
  $('#save-bot-source').textContent = bot ? 'Lưu phiên bản' : 'Tạo Bot';
  $('#bot-source-runtime').value = 'cpp';
  state.sourceRuntime = 'cpp';
  updateSourceRuntimeMeta('cpp');
  updateSourceModeMeta(bot ? '' : 'strategy', bot ? '' : '1.0.0');
  $('#bot-source-editor').value = bot ? '' : STRATEGY_TEMPLATES.cpp;
  updateEditorMetrics();
  $('#bot-source-editor').readOnly = false;
  setWorkspaceStatus(bot ? 'Đang chuẩn bị bản nháp' : 'Bản nháp mới');
  setSourceDirty(!bot);
  if (pendingInitial) {
    $('#bot-workspace-name').value = pendingInitial.bot.name;
    $('#bot-source-runtime').value = pendingInitial.runtimeId;
    $('#bot-source-editor').value = pendingInitial.source;
    updateEditorMetrics();
    $('#bot-workspace-breadcrumb-current').textContent = 'Tạo Bot mới';
    $('#bot-source-description').textContent = 'Bot đã được tạo nhưng phiên bản đầu tiên chưa lưu. Kiểm tra lỗi rồi thử lại.';
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
  if (state.sourceDirty && !window.confirm('Bạn có thay đổi chưa lưu. Chọn phiên bản này sẽ thay thế nội dung hiện tại. Tiếp tục?')) return;
  try {
    await api(`/bots/${bot.id}/revisions/${revision.revisionId}/select`, { method: 'POST', body: JSON.stringify({}) });
    bot.currentRevisionId = revision.revisionId;
    await loadBotRevisions(bot);
    showToast('Đã chọn phiên bản mã nguồn.', 'success');
  } catch (error) { setSourceError(error.message || 'Không thể chọn phiên bản mã nguồn.'); }
}

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
    diagnostic.executionMode && `Chế độ: ${diagnostic.executionMode === 'strategy' ? 'Strategy SDK' : 'Raw'}`,
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

function clearPracticeResult() {
  stopPracticeReplay();
  state.practiceReplay = null;
  state.practiceReplayMoveIndex = -1;
  const output = $('#practice-output'); if (output) output.hidden = true;
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
      const flag = create('span', { className: 'goal-flag', attrs: { 'aria-hidden': 'true' } });
      flag.appendChild(icon('icon-flag')); cell.appendChild(flag);
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
    ['Revision', revision?.revisionId ? revision.revisionId.slice(0, 12) : 'Đã chọn từ Workspace'],
    ['Tình huống', scenario.label],
  ];
  if (result.executionMode === 'strategy' && result.sdkVersion) entries.push(['SDK chiến thuật', result.sdkVersion]);
  entries.forEach(([label, value]) => details.append(create('dt', { text: label }), create('dd', { text: value })));
  $('#practice-result').hidden = false;
  renderPracticeBoard(result.state, result.move, result.capture);
  $('#practice-board-frame').hidden = false;
}

function renderPracticeMatchResult(result) {
  state.practiceReplay = result;
  state.practiceReplayMoveIndex = -1;
  const details = $('#practice-result-details'); clear(details);
  const winnerLabel = result.winner === 'A' ? 'Bot của bạn' : result.winner === 'B' ? result.opponentName || 'Bot hệ thống' : 'Hòa';
  const reasonLabel = result.terminationReason === 'goal_reached' ? 'Đạt ô đích' : result.terminationReason === 'type_elimination' ? 'Loại toàn bộ hệ quân' : result.terminationReason === 'max_turns' ? 'Đạt giới hạn lượt' : 'Không còn nước đi';
  $('#practice-result-title').textContent = result.winner === 'draw' ? 'Trận thử hòa' : `${winnerLabel} thắng`;
  $('#practice-result-move').textContent = `${result.moves?.length || 0} lượt · ${reasonLabel}`;
  const revision = state.practiceRevision;
  [['Kết quả', winnerLabel], ['Đối thủ', result.opponentName || 'Bot hệ thống'], ['Số lượt', String(result.moves?.length || 0)], ['Lý do kết thúc', reasonLabel], ['Ngôn ngữ', result.runtimeId === 'cpp' ? 'C++17' : 'Python 3'], ['Revision', revision?.revisionId ? revision.revisionId.slice(0, 12) : '—']]
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
  $('#replay-error').hidden = true;
  navigate('replay-view');
  state.replayContext.replayViewRevision = state.viewRevision;
  renderReplaySummary(replay);
  $('#replay-view-title').textContent = 'Trận đấu thử';
  setReplayLoading(false);
  goToReplayTurn(-1);
}

function openPracticeRunner(revision) {
  state.practiceRevision = revision;
  state.practiceRequestToken += 1;
  const scenarioSelect = $('#practice-scenario');
  if (scenarioSelect) { scenarioSelect.value = 'initial'; scenarioSelect.disabled = false; }
  if (typeof updatePracticeScenarioMeta === 'function') updatePracticeScenarioMeta('initial');
  $('#practice-title').textContent = 'Trận đấu thử';
  const runtimeLabel = revision.runtimeId === 'cpp' ? 'C++17' : revision.runtimeId === 'python3' ? 'Python 3' : revision.runtimeId;
  const modeLabel = revision.executionMode === 'strategy' ? 'Strategy SDK' : revision.executionMode === 'raw' ? 'Raw' : '';
  const revisionMeta = $('#practice-revision-meta');
  if (revisionMeta) revisionMeta.textContent = `${state.sourceWorkspaceBot?.name || 'Bot của bạn'} · ${runtimeLabel}${modeLabel ? ` · ${modeLabel}` : ''} · ${revision.revisionId.startsWith('draft-') ? 'Bản nháp hiện tại' : `Revision ${revision.revisionId.slice(0, 12)}`}`;
  $('#practice-status').textContent = 'Sẵn sàng chạy thử.';
  if (typeof clearPracticeResult === 'function') clearPracticeResult();
  else {
    const output = $('#practice-output'); if (output) output.hidden = true;
    const result = $('#practice-result'); if (result) result.hidden = true;
    const board = $('#practice-board-frame'); if (board) board.hidden = true;
    const details = $('#practice-result-details'); if (details) clear(details);
  }
  const board = $('#practice-board'); if (board) clear(board);
  openModal('practice-modal');
  $('#practice-run').focus();
}

function openCurrentPracticeRunner() {
  const runtimeId = $('#bot-source-runtime')?.value;
  const source = $('#bot-source-editor')?.value || '';
  if (!source.trim()) return setSourceError('Mã nguồn không được để trống.');
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
  const token = ++state.practiceRequestToken;
  const runButton = $('#practice-run');
  clearPracticeResult();
  $('#practice-output').hidden = false;
  $('#practice-status').textContent = 'Đang chạy trận thử với Bot hệ thống…';
  runButton.textContent = 'Đang chạy…';
  runButton.disabled = true;
  try {
    const isDraft = Boolean(state.practiceDraft);
    const result = await request(isDraft ? '/bots/draft/test-match' : `/bots/${revision.botId}/revisions/${revision.revisionId}/test-match`, {
      method: 'POST',
      body: JSON.stringify(isDraft ? state.practiceDraft : {}),
    });
    if (token !== state.practiceRequestToken || state.practiceRevision?.revisionId !== revision.revisionId) return;
    openPracticeReplayPage(result, revision);
  } catch (error) {
    if (token !== state.practiceRequestToken || state.practiceRevision?.revisionId !== revision.revisionId) return;
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
  $('#practice-output').hidden = false;
  $('#practice-status').textContent = 'Đang chạy thử Bot trong môi trường cô lập…';
  runButton.textContent = 'Đang chạy…';
  runButton.disabled = true;
  const scenarioSelect = $('#practice-scenario'); if (scenarioSelect) scenarioSelect.disabled = true;
  try {
    const result = await request(`/bots/${revision.botId}/revisions/${revision.revisionId}/test`, {
      method: 'POST', body: JSON.stringify({ scenarioId }),
    });
    if (token !== state.practiceRequestToken || state.practiceRevision?.revisionId !== revision.revisionId) return;
    renderPracticeResult(result);
    $('#practice-status').textContent = result.valid === true && result.accepted !== false ? 'Chạy thử thành công · Engine đã chấp nhận nước đi.' : 'Chạy thử hoàn tất.';
  } catch (error) {
    if (token !== state.practiceRequestToken || state.practiceRevision?.revisionId !== revision.revisionId) return;
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

function showBotFormError(message, field = null) {
  const error = field === 'bot-workspace-name' ? $('#bot-name-error') : $('#bot-source-error');
  const nameError = $('#bot-name-error');
  const sourceError = $('#bot-source-error');
  ['bot-workspace-name', 'bot-source-runtime', 'bot-source-editor'].forEach(id => document.getElementById(id)?.removeAttribute('aria-invalid'));
  if (field) document.getElementById(field)?.setAttribute('aria-invalid', 'true');
  if (nameError && nameError !== error) { nameError.textContent = ''; nameError.hidden = true; }
  if (sourceError && sourceError !== error) { sourceError.textContent = ''; sourceError.hidden = true; }
  error.textContent = message;
  error.hidden = false;
}
function clearBotFormError() {
  const error = $('#bot-source-error');
  const nameError = $('#bot-name-error');
  ['bot-workspace-name', 'bot-source-runtime', 'bot-source-editor'].forEach(id => document.getElementById(id)?.removeAttribute('aria-invalid'));
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
  if (!['cpp', 'python3'].includes(runtimeId)) return { error: 'Hãy chọn C++17 hoặc Python 3.', field: 'bot-source-runtime' };
  if (!source.trim()) return { error: 'Mã nguồn không được để trống.', field: 'bot-source-editor' };
  if (new TextEncoder().encode(source).byteLength > 64 * 1024) return { error: 'Mã nguồn không được vượt quá 64 KiB.', field: 'bot-source-editor' };
  return { runtimeId, source };
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
        if (state.sourceDirty && !(await saveBotSource())) throw new Error('Không thể hoàn tất việc chọn phiên bản mã nguồn.');
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
        if (!source || !runtimeId) throw new Error('Mã nguồn ban đầu chưa sẵn sàng.');
        revision = await saveInitialRevision(bot, source, runtimeId, revision);
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
  const isDiscoverable = isCompetitor && state.tournamentScope === 'discoverable';
  if (pageTitle) pageTitle.textContent = isDiscoverable ? 'Giải đấu đang mở' : isCompetitor ? 'Giải đấu của tôi' : 'Quản lý giải đấu';
  if (pageDescription) pageDescription.textContent = isDiscoverable
    ? 'Khám phá các giải đấu đang mở đăng ký và gửi yêu cầu tham gia.'
    : isCompetitor ? 'Theo dõi các giải đấu bạn đã gửi yêu cầu hoặc đang tham gia.' : 'Tạo và quản lý các giải đấu giữa những Bot đã đăng ký.';
  $('#tournaments-toolbar').hidden = true;
  $('#open-tournament-modal').hidden = true;
  renderMessage(list, 'Đang tải danh sách giải đấu…');
  try {
    const path = state.user?.role === 'competitor'
      ? (state.tournamentScope === 'mine' ? '/my/tournaments' : '/tournaments/discoverable')
      : '/tournaments';
    const response = await request(path);
    const scopedResponse = state.user?.role === 'competitor' && state.tournamentScope === 'discoverable'
      ? response.filter(tournament => tournament.status === 'registration_open')
      : response;
    const tournaments = state.user?.role === 'competitor' && state.tournamentScope === 'mine'
      ? response.map(item => ({
        tournamentId: item.tournamentId,
        name: item.name,
        status: item.status,
        participantCount: item.participantId ? 1 : 0,
        myRequestStatus: item.request?.status || null,
        resultsPublishedAt: item.resultsPublishedAt || null,
        registrationOpen: Boolean(item.registrationOpen),
      }))
      : scopedResponse;
    if (!isCurrentView('tournaments', authRevision, viewRevision)) return;
    state.tournaments = tournaments;
    renderTournamentList();
  } catch (error) { if (isCurrentView('tournaments', authRevision, viewRevision)) { state.error = localizeErrorMessage(error.message || 'Không thể tải giải đấu.'); state.tournamentListError = state.error; $('#tournaments-count').textContent = 'Không thể tải giải đấu'; $('#tournaments-toolbar').hidden = true; $('#open-tournament-modal').hidden = false; renderMessage(list, state.error, loadTournaments); } }
  finally { state.loading.delete('tournaments'); }
}

function renderTournamentList() {
  const list = $('#tournaments-list');
  const toolbar = $('#tournaments-toolbar');
  const createButton = $('#open-tournament-modal');
  if (state.tournamentListError) { toolbar.hidden = true; createButton.hidden = false; $('#tournaments-count').textContent = 'Không thể tải giải đấu'; return renderMessage(list, state.tournamentListError, loadTournaments); }
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
  toolbar.hidden = !hasTournaments;
  const competitor = state.user?.role === 'competitor';
  const statusFilter = $('#tournament-status-filter');
  if (statusFilter?.parentElement) statusFilter.parentElement.hidden = competitor && state.tournamentScope === 'discoverable';
  createButton.hidden = competitor;
  if (!hasTournaments && competitor && state.tournamentScope === 'discoverable') {
    return renderTournamentEmpty('Chưa có giải đấu mở', 'Các giải đấu đang mở đăng ký sẽ xuất hiện tại đây.', false);
  }
  if (!hasTournaments && state.user?.role === 'organizer') {
    return renderTournamentEmpty('Bạn chưa tạo giải đấu nào', 'Tạo giải đấu đầu tiên để bắt đầu tổ chức thi đấu.', false);
  }
  $('#tournaments-count').textContent = `${tournaments.length} / ${state.tournaments.length} giải đấu`;
  if (!hasTournaments) return renderTournamentEmpty('Bạn chưa có giải đấu nào', 'Tạo giải đấu để đăng ký Bot và bắt đầu thi đấu.');
  if (!tournaments.length) return renderTournamentEmpty(state.tournamentScope === 'mine' ? 'Chưa có yêu cầu tham gia' : 'Không tìm thấy giải đấu phù hợp', state.tournamentScope === 'mine' ? 'Các giải bạn đã gửi yêu cầu sẽ xuất hiện tại đây.' : 'Hãy thử tên khác hoặc xóa bộ lọc.', false);
  if (competitor) return renderDiscoverableTournamentCards(list, tournaments);
  tournaments.forEach(tournament => {
    const card = create('article', { className: 'tournament-card' });
    const heading = create('div', { className: 'tournament-card-header' }); heading.append(create('h3', { text: tournament.name }), statusBadge(tournament.status)); card.appendChild(heading);
    const meta = create('div', { className: 'tournament-card-meta' });
    meta.append(tournamentMetaItem('icon-git-branch', 'Vòng tròn một lượt'), tournamentMetaItem('icon-users', `${tournament.participants?.length || tournament.participantCount || 0} người tham gia`)); card.appendChild(meta);
    const footer = create('div', { className: 'tournament-card-footer' });
    const viewButton = actionButton('Xem chi tiết', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`, 'secondary-btn tournament-view-btn');
    const viewIcon = icon('icon-arrow-up-right'); viewIcon.classList.add('tournament-action-icon'); viewButton.prepend(viewIcon);
    footer.appendChild(viewButton);
    if (tournament.status === 'draft' || tournament.status === 'registration_open') footer.appendChild(actionButton('Chỉnh sửa', () => openEditTournamentDialog(tournament), `edit:${tournament.tournamentId}`, 'secondary-btn tournament-view-btn'));
    footer.appendChild(actionButton('Xóa', () => confirmTournamentAction(tournament.tournamentId, state.authRevision, state.viewRevision, 'delete', 'Xóa giải đấu', tournament.name), `delete:${tournament.tournamentId}`, 'secondary-btn tournament-action tournament-action-danger'));
    card.appendChild(footer); list.appendChild(card);
  });
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
    heading.append(create('h3', { text: tournament.name }), statusBadge(tournament.status));
    card.appendChild(heading);
    const meta = create('div', { className: 'tournament-card-meta' });
    meta.append(tournamentMetaItem('icon-git-branch', 'V\u00f2ng tr\u00f2n m\u1ed9t l\u01b0\u1ee3t'), tournamentMetaItem('icon-users', `${tournament.participantCount ?? 0} ng\u01b0\u1eddi tham gia`));
    card.appendChild(meta);
    const statusLabels = { pending: 'Yêu cầu tham gia đang chờ duyệt.', approved: 'Yêu cầu tham gia đã được duyệt.', rejected: 'Yêu cầu tham gia đã bị từ chối.' };
    const participation = create('p', { className: 'tournament-participation-state', text: tournament.myRequestStatus ? statusLabels[tournament.myRequestStatus] : 'Chưa gửi yêu cầu tham gia.', attrs: { 'aria-live': 'polite' } });
    card.appendChild(participation);
    const footer = create('div', { className: 'tournament-card-footer' });
    const published = tournament.status === 'completed' && Boolean(tournament.resultsPublishedAt);
    if (published) {
      participation.textContent = 'Kết quả đã được công bố.';
      footer.appendChild(tournamentViewButton('Xem k\u1ebft qu\u1ea3', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`));
      card.appendChild(footer);
      list.appendChild(card);
      return;
    }
    const requestButton = actionButton('G\u1eedi y\u00eau c\u1ea7u tham gia', () => {
      state.tournamentId = tournament.tournamentId;
      state.tournamentRegistrationContext = { name: tournament.name, status: tournament.status };
      openRegistrationDialog();
      void populateBotSelect();
    }, `request:${tournament.tournamentId}`, 'secondary-btn tournament-view-btn');
    if (tournament.myRequestStatus === 'pending') { requestButton.disabled = true; requestButton.textContent = 'Đang chờ duyệt'; }
    else if (tournament.myRequestStatus === 'approved') { requestButton.disabled = true; requestButton.textContent = 'Đã duyệt'; }
    footer.appendChild(requestButton);
    card.appendChild(footer);
    list.appendChild(card);
  });
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
  const visibility = $('#new-tourney-visibility').value;
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
      try { result = editingTournament
        ? await api(`/tournaments/${editingTournament.tournamentId}`, { method: 'PATCH', body: JSON.stringify({ name, visibility }) })
        : await api('/tournaments', { method: 'POST', body: JSON.stringify({ name, visibility }) }); }
      catch (requestError) { if (state.user && state.authRevision === authRevision && state.tournamentDialogRevision === dialogRevision) { error.textContent = requestError.message || 'Unable to create tournament.'; error.hidden = false; } throw requestError; }
      if (!state.user || state.authRevision !== authRevision || state.viewRevision !== viewRevision) return;
      if (state.tournamentDialogRevision !== dialogRevision) return;
      closeModal('add-tourney-modal'); nameInput.value = ''; $('#new-tourney-visibility').value = 'private';
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
  state.tournamentId = id;
  navigate('tournament-detail');
  await refreshTournamentDetail();
}

function appendTournamentAction(container, tournamentId, authRevision, viewRevision, label, action, confirmation = false, tournamentName = '') {
  const buttonClass = action === 'cancel' || action === 'delete' ? 'secondary-btn tournament-action tournament-action-danger' : 'primary-btn tournament-action';
  const button = actionButton(label, () => confirmation ? confirmTournamentAction(tournamentId, authRevision, viewRevision, action, label, tournamentName) : tournamentAction(tournamentId, authRevision, viewRevision, action), `tournament:${tournamentId}:${action}`, buttonClass);
  const actionIcon = action === 'cancel' || action === 'delete' ? 'td-icon-circle-x' : action === 'open_registration' ? 'td-icon-user-round-plus' : action === 'run_all' ? 'td-icon-play' : null;
  if (actionIcon) {
    const labelNode = button.firstChild;
    button.insertBefore(icon(actionIcon), labelNode);
    button.firstChild.classList.add('td-icon', 'td-icon--sm');
  }
  container.appendChild(button);
}

function getTournamentExecutionSummary(tournament) {
  const pairings = (tournament.rounds || []).flatMap(round => round.pairings || []);
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
    status.textContent = 'Sẵn sàng thực thi trận đấu';
  }
  stats.textContent = `${summary.completed}/${summary.total} trận hoàn thành`;
  return summary;
}

function renderTournamentGuidance(tournament) {
  const guidance = $('#td-next-step');
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
    completed: ['Đã hoàn thành', 'Xem bảng xếp hạng và mở lại replay của từng trận đấu bên dưới.'],
    cancelled: ['Đã hủy', 'Giải đấu này đã kết thúc và không còn thao tác tiếp theo.'],
  }[tournament.status] || ['Trạng thái giải đấu', 'Thông tin và thao tác sẽ được cập nhật theo trạng thái hiện tại.'];
  if (tournament.status === 'completed') {
    copy[0] = tournament.resultsPublishedAt ? 'Đã công bố' : 'Đã hoàn thành';
    copy[1] = tournament.resultsPublishedAt ? 'Kết quả và replay đã được công bố.' : (state.user?.role === 'competitor' ? 'Kết quả chưa được công bố.' : 'Công bố kết quả để cho phép người chơi xem.');
  }
  if (tournament.status === 'registration_open' && state.user?.role === 'organizer') {
    copy[0] = 'Bước tiếp theo';
    const minimumParticipants = tournament.format === 'single_round_robin' ? 2 : null;
    copy[1] = minimumParticipants && tournament.participants.length < minimumParticipants
      ? `Hiện có ${tournament.participants.length} Bot đã được duyệt. Cần ít nhất ${minimumParticipants} Bot để lập lịch Vòng tròn một lượt.`
      : 'Khi đã tiếp nhận đủ Bot tham gia, hãy đóng đăng ký để chuyển sang giai đoạn lập lịch thi đấu.';
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

function renderTournamentLifecycle(tournament) {
  const list = $('#td-lifecycle');
  if (!list) return;
  const steps = ['Tạo giải', 'Mở đăng ký', 'Đóng đăng ký', 'Lập lịch', 'Thi đấu', 'Hoàn thành', 'Công bố'];
  if (tournament.status === 'cancelled') {
    list.dataset.current = '—';
    list.dataset.cancelled = 'true';
    const count = $('#td-lifecycle-count'); if (count) count.textContent = 'Đã hủy';
    const item = create('li', { className: 'is-cancelled' });
    const marker = create('span', { className: 'lifecycle-marker', attrs: { 'aria-hidden': 'true' } });
    marker.appendChild(icon('td-icon-circle-x')); marker.firstChild.classList.add('td-icon', 'td-icon--sm');
    item.append(marker, create('span', { text: 'Đã hủy' }));
    list.replaceChildren(item);
    return;
  }
  let currentIndex = { draft: 0, registration_open: 1, registration_closed: tournament.rounds?.length ? 3 : 2, running: 4, completed: tournament.resultsPublishedAt ? 6 : 5, cancelled: 0 }[tournament.status] ?? 0;
  list.dataset.current = String(currentIndex + 1);
  list.dataset.cancelled = 'false';
  list.style.setProperty('--progress', String((currentIndex / (steps.length - 1)) * 100));
  const count = $('#td-lifecycle-count'); if (count) count.textContent = `Bước ${currentIndex + 1} / ${steps.length}`;
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
  if (current?.scrollIntoView) requestAnimationFrame(() => current.scrollIntoView({ inline: 'center', block: 'nearest' }));
}

async function refreshTournamentDetail() {
  if (state.user?.role === 'competitor' && state.activeView === 'tournaments') {
    await loadTournaments();
    return;
  }
  if (!state.tournamentId) return;
  const tournamentId = state.tournamentId;
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  try {
    const tournament = await request(`/tournaments/${tournamentId}`);
    if (!isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) return;
    state.detailStatus = tournament.status;
    state.tournamentRegistrationContext = { name: tournament.name, status: tournament.status };
    $('#td-name').textContent = tournament.name;
    const breadcrumbName = $('#td-breadcrumb-name'); if (breadcrumbName) breadcrumbName.textContent = tournament.name;
    const badge = $('#td-status'); badge.className = `status-badge status-${safeStatusClass(tournament.status)}`; badge.textContent = localizeStatus(tournament.status);
    renderTournamentLifecycle(tournament);
    renderTournamentGuidance(tournament);
    $('#td-pcount').textContent = tournament.participants.length;
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
      const item = create('li', { attrs: { 'data-bot-id': participant.bot.botId } });
      const copy = create('div', { className: 'participant-copy' });
      const name = create('strong', { text: participant.name });
      const botId = participant.bot.botId ? `Bot ${participant.bot.botId.slice(0, 8)}...` : '';
      const execution = participant.bot.execution;
      const runtime = execution?.kind === 'source-revision' ? (execution.runtimeId === 'cpp' ? 'C++17' : execution.runtimeId === 'python3' ? 'Python 3' : '') : '';
      const revision = execution?.kind === 'source-revision' && execution.revisionId ? `Revision ${execution.revisionId.slice(0, 8)}` : '';
      const metadata = [participant.bot.botId ? `ID ${shortId(participant.bot.botId)}` : '', runtime, revision].filter(Boolean).join(' · ');
      const meta = create('span', { className: 'participant-meta', text: metadata });
      meta.textContent = [runtime, revision, botId].filter(Boolean).join(' \u00b7 ');
      const botLine = create('div', { className: 'participant-bot-line' });
      botLine.appendChild(meta);
      copy.append(name, botLine); item.appendChild(copy); participants.appendChild(item);
    });

    const actions = $('#td-actions'); clear(actions);
    const register = $('#btn-register-bot'); register.hidden = state.user?.role !== 'competitor' || tournament.status !== 'registration_open';
    if (tournament.status === 'draft') appendTournamentAction(actions, tournamentId, authRevision, viewRevision, actionLabel('open_registration'), 'open_registration');
    if (tournament.status === 'registration_open') {
      appendTournamentAction(actions, tournamentId, authRevision, viewRevision, actionLabel('close_registration'), 'close_registration', true, tournament.name);
    }
    if (tournament.status === 'registration_closed') {
      if (tournament.rounds.length) appendTournamentAction(actions, tournamentId, authRevision, viewRevision, actionLabel('start'), 'start');
      else appendTournamentAction(actions, tournamentId, authRevision, viewRevision, actionLabel('generate_schedule'), 'generate_schedule');
    }
    if (tournament.status === 'running') appendTournamentAction(actions, tournamentId, authRevision, viewRevision, actionLabel('run_all'), 'run_all', true);
    if (state.user?.role === 'organizer' && tournament.status === 'completed' && !tournament.resultsPublishedAt) {
      appendTournamentAction(actions, tournamentId, authRevision, viewRevision, 'Công bố kết quả', 'publish', true, tournament.name);
    }
    if (tournament.status === 'draft' || tournament.status === 'registration_open' || tournament.status === 'running') appendTournamentAction(actions, tournamentId, authRevision, viewRevision, actionLabel('cancel'), 'cancel', true, tournament.name);

    await renderParticipationRequestsV2(tournamentId, tournament.status);

    const executionSummary = renderExecutionStatus(tournament);
    renderStandings(tournament.standings, executionSummary);
    renderSchedule(tournament);
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
      $('#td-pcount').textContent = '0'; clear($('#td-participants')); clear($('#td-actions')); clear($('#td-standings tbody')); $('#td-standings').hidden = true; $('#td-standings-empty').hidden = false; $('#td-standings-empty').textContent = 'Không thể tải bảng xếp hạng.'; $('#td-next-step').replaceChildren(); $('#td-stats').textContent = '';
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
    state.detailRequestBotNames = new Map(requests.filter(item => item.botName).map(item => [item.botId, item.botName]));
    document.querySelectorAll('#td-participants [data-bot-id]').forEach(item => {
      const botId = item.dataset.botId;
      const botLabel = item.querySelector('.participant-bot-id');
      if (botLabel && state.detailRequestBotNames.has(botId)) botLabel.textContent = state.detailRequestBotNames.get(botId);
    });
    const pendingCount = requests.filter(item => item.status === 'pending').length;
    const count = $('#td-requests-count'); if (count) { count.textContent = pendingCount ? `${pendingCount} chờ duyệt` : ''; count.hidden = pendingCount === 0; }
    if (!requests.length) {
      const empty = create('div', { className: 'requests-empty' });
      empty.append(icon('td-icon-clipboard-list'), create('strong', { text: 'Không có yêu cầu chờ duyệt' }), create('span', { text: 'Các yêu cầu đăng ký Bot mới sẽ xuất hiện tại đây.' }));
      empty.firstChild.classList.add('td-icon', 'td-icon--lg');
      list.appendChild(empty);
      return;
    }
    requests.forEach(participation => {
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
            await refreshTournamentDetail();
          });
        }, `reject:${participation.requestId}`, 'request-action request-action-danger');
        const rejectIcon = icon('td-icon-x'); rejectIcon.classList.add('td-icon', 'td-icon--sm'); reject.prepend(rejectIcon);
        const approve = actionButton('Duyệt', async () => {
          await lockRequestActions(async () => {
            await api(`/tournaments/${tournamentId}/requests/${participation.requestId}/approve`, { method: 'POST' });
            await refreshTournamentDetail();
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

function renderStandings(standings, executionSummary = { completed: 0 }) {
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
    row.append(textCell(hasRecordedResult ? (standing.rank ?? index + 1) : '—'), textCell(standing.participantName), textCell(standing.matchesPlayed), textCell(standing.wins), textCell(standing.draws), textCell(standing.losses), textCell(standing.points));
    tbody.appendChild(row);
  });
}

function renderSchedule(tournament) {
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
    const hasMatchActions = pairings.some(pairing => Boolean(pairing.matchId));
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
      if (hasMatchActions) {
        const action = create('td');
        if (pairing.matchId && pairing.status === 'in_progress' && state.user?.role === 'organizer') {
          action.appendChild(actionButton('Xem trực tiếp', () => openLiveMatch(tournament.tournamentId, pairing.matchId), `live:${pairing.matchId}`));
        } else if (pairing.matchId) {
          action.appendChild(actionButton('Xem lại', () => playReplay(tournament.tournamentId, pairing.matchId), `replay:${pairing.matchId}`));
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
      const cardFooter = create('div', { className: 'schedule-card-footer' });
      cardFooter.appendChild(create('span', { className: 'schedule-card-winner', text: `Người thắng: ${winnerName}` }));
      if (pairing.status === 'failed') cardFooter.appendChild(create('small', { className: 'schedule-card-error', text: pairing.failureReason || 'Có thể thử lại; kết quả chưa được ghi nhận.' }));
      if (pairing.matchId && pairing.status === 'in_progress' && state.user?.role === 'organizer') {
        cardFooter.appendChild(actionButton('Xem trực tiếp', () => openLiveMatch(tournament.tournamentId, pairing.matchId), `live:${pairing.matchId}`));
      } else if (pairing.matchId) {
        cardFooter.appendChild(actionButton('Xem lại', () => playReplay(tournament.tournamentId, pairing.matchId), `replay:${pairing.matchId}`));
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
  } else {
    title.textContent = label;
    copy.textContent = 'Đưa tất cả trận đấu còn lại vào hàng đợi?';
    support.textContent = 'Việc thực thi sẽ tuân theo chính sách bảo mật của máy chủ.';
    $('#confirm-tournament-action').textContent = label;
  }
  openModal('tournament-action-modal');
}

async function tournamentAction(tournamentId, authRevision, viewRevision, action) {
  if (action === 'edit') {
    const tournament = await request(`/tournaments/${tournamentId}`);
    if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) openEditTournamentDialog(tournament);
    return;
  }
  if (action === 'delete') {
    await api(`/tournaments/${tournamentId}`, { method: 'DELETE' });
  } else {
    const endpoint = action === 'publish' ? `/tournaments/${tournamentId}/publish` : `/tournaments/${tournamentId}/action`;
    await api(endpoint, { method: 'POST', body: action === 'publish' ? undefined : JSON.stringify({ action }) });
  }
  if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) {
    showToast(action === 'delete' ? 'Đã xóa giải đấu.' : ACTION_SUCCESS_MESSAGES[action] || 'Đã cập nhật giải đấu.', 'success');
    if (action === 'delete') navigate('tournaments'); else await refreshTournamentDetail();
  } else if (action === 'delete' && isCurrentView('tournaments', authRevision, viewRevision)) {
    showToast('Đã xóa giải đấu.', 'success');
    await loadTournaments();
  }
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
  await runPending('register-participant', button, async () => {
    const endpoint = state.user?.role === 'competitor' ? `/tournaments/${tournamentId}/participation-requests` : `/tournaments/${tournamentId}/register`;
    let result;
    try { result = await api(endpoint, { method: 'POST', body: JSON.stringify({ participantName, botId, revisionId }) }); }
    catch (requestError) { if (state.authRevision === authRevision && ['dashboard', 'tournaments', 'tournament-detail'].includes(state.activeView) && state.viewRevision === viewRevision && state.registrationDialogRevision === dialogRevision) { error.textContent = requestError.message || 'Unable to register bot.'; error.hidden = false; } throw requestError; }
    if (state.authRevision !== authRevision || state.registrationDialogRevision !== dialogRevision) return;
    if (state.registrationDialogRevision !== dialogRevision) return;
    closeModal('register-bot-tourney-modal'); $('#reg-part-name').value = ''; $('#reg-part-name').removeAttribute('aria-invalid'); $('#reg-bot-select').removeAttribute('aria-invalid'); showToast(`Đã đăng ký ${botId} · revision ${(result?.revisionId || revisionId).slice(0, 8)}.`, 'success');
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
  const mode = revision.executionMode === 'strategy' ? 'Strategy' : revision.executionMode === 'raw' ? 'Raw' : '';
  target.textContent = `Revision bất biến: ${language}${mode ? ` · ${mode}` : ''} · ${revision.revisionId}`;
}

const PIECE_TYPES = { dam: 'icon-piece-dam', la: 'icon-piece-la', keo: 'icon-piece-keo' };
const PIECE_LABELS = { dam: 'Búa', la: 'Bao', keo: 'Kéo' };
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

function stopLiveMatchPolling() {
  if (state.liveMatchPollingTimer) clearTimeout(state.liveMatchPollingTimer);
  state.liveMatchPollingTimer = null;
  state.liveMatchContext = null;
  state.liveMatchSnapshot = null;
  $('#replay-view')?.classList.remove('live-match-view');
}

function replayParticipantName(participants, player) {
  return participants?.[player]?.participantName || (player ? `Người chơi ${player}` : 'Người chơi');
}

function updateReplayTurnHighlight(player) {
  document.querySelector('#replay-view .replay-player-a-label')?.classList.toggle('is-turn', player === 'A');
  document.querySelector('#replay-view .replay-player-b-label')?.classList.toggle('is-turn', player === 'B');
}

function renderLiveMatchSnapshot(snapshot) {
  state.liveMatchSnapshot = snapshot;
  const statusText = snapshot.status === 'in_progress'
    ? `Đang thực thi · Lượt ${snapshot.turn}`
    : snapshot.status === 'finished' ? 'Trận đấu đã hoàn tất' : snapshot.status === 'failed' ? 'Trận đấu lỗi' : 'Trận đấu đã hủy';
  const resultText = $('#r-result-text'); if (resultText) resultText.textContent = statusText;
  const matchId = $('#r-match-id'); if (matchId) matchId.textContent = String(snapshot.matchId || '—');
  const winner = $('#r-winner'); if (winner) winner.textContent = snapshot.status === 'in_progress' ? 'Chưa có' : snapshot.status === 'failed' ? 'Không xác định' : 'Đang cập nhật';
  const termination = $('#r-termination'); if (termination) termination.textContent = snapshot.error || (snapshot.status === 'in_progress' ? 'Đang thực thi' : 'Đã kết thúc');
  const protocol = $('#r-protocol'); if (protocol) protocol.textContent = 'Live snapshot';
  const participants = snapshot.participants || {};
  const latestMove = snapshot.state?.lastMove || snapshot.latestMove;
  const activePlayer = snapshot.currentPlayer;
  const currentMove = $('#r-current-move'); if (currentMove) currentMove.textContent = latestMove?.pieceId
    ? `Lượt ${latestMove.turn ?? snapshot.turn} · ${replayParticipantName(participants, latestMove.player)}: ${replayCoordinate(latestMove.from)} → ${replayCoordinate(latestMove.to)}`
    : `Lượt ${snapshot.turn} · ${replayParticipantName(participants, snapshot.currentPlayer)} đang thực thi`;
  const selected = $('#r-selected-move'); if (selected) selected.textContent = currentMove?.textContent || statusText;
  const turnDisplay = $('#r-turn-display'); if (turnDisplay) turnDisplay.textContent = `Lượt ${snapshot.turn}`;
  $('#r-p1-name').textContent = replayParticipantName(participants, 'A');
  $('#r-p2-name').textContent = replayParticipantName(participants, 'B');
  $('#r-p1-bot').textContent = participants.A?.botId ? `Bot ${shortId(participants.A.botId)}` : '';
  $('#r-p2-bot').textContent = participants.B?.botId ? `Bot ${shortId(participants.B.botId)}` : '';
  updateReplayTurnHighlight(activePlayer);
  $('#replay-content').hidden = false;
  $('#replay-loading').hidden = true;
  $('#replay-error').hidden = true;
  renderReplayBoard(snapshot.state, latestMove);
  renderReplayPieceCounts(snapshot.state);
}

function scheduleLiveMatchPoll() {
  if (!state.liveMatchContext || state.activeView !== 'replay-view') return;
  state.liveMatchPollingTimer = setTimeout(() => { void pollLiveMatch(); }, 1200);
}

async function pollLiveMatch() {
  const context = state.liveMatchContext;
  if (!context || state.activeView !== 'replay-view') return;
  try {
    const snapshot = await api(`/tournaments/${context.tournamentId}/matches/${context.matchId}/live`);
    if (state.liveMatchContext !== context || state.activeView !== 'replay-view') return;
    if (snapshot.status === 'unavailable') {
      const resultText = $('#r-result-text'); if (resultText) resultText.textContent = 'Chưa có dữ liệu trực tiếp';
      scheduleLiveMatchPoll();
      return;
    }
    renderLiveMatchSnapshot(snapshot);
    if (snapshot.status === 'in_progress') scheduleLiveMatchPoll();
  } catch (error) {
    if (state.liveMatchContext !== context || state.activeView !== 'replay-view') return;
    const resultText = $('#r-result-text'); if (resultText) resultText.textContent = error.message || 'Không thể tải dữ liệu trực tiếp';
    scheduleLiveMatchPoll();
  }
}

function openLiveMatch(tournamentId, matchId) {
  stopReplayPlayback();
  stopLiveMatchPolling();
  state.liveMatchContext = { tournamentId, matchId };
  state.replayMatchId = matchId;
  $('#replay-view').classList.add('live-match-view');
  $('#replay-view-kicker').textContent = 'XEM TRỰC TIẾP TRẬN ĐẤU';
  $('#replay-view-title').textContent = 'Diễn biến trận đấu';
  $('#replay-content').hidden = true;
  $('#replay-error').hidden = true;
  $('#replay-loading').hidden = false;
  $('#replay-loading').textContent = 'Đang kết nối dữ liệu trực tiếp…';
  navigate('replay-view');
  state.liveMatchContext = { tournamentId, matchId };
  void pollLiveMatch();
}

function closeReplay() {
  stopReplayPlayback();
  stopLiveMatchPolling();
  const isPracticeReplay = state.replayContext?.practice === true;
  state.replay = null;
  state.replayContext = null;
  state.replayMatchId = null;
  state.replayMoveIndex = -1;
  state.replayLoading = false;
  state.liveMatchContext = null;
  state.liveMatchSnapshot = null;
  if (isPracticeReplay) {
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
}

function formatReplayReason(reason) { return localizeReason(reason); }

function replayResultLabel(replay) {
  if (replay.winner === 'A') return 'Người chơi A chiến thắng';
  if (replay.winner === 'B') return 'Người chơi B chiến thắng';
  if (replay.winner === 'draw') return 'Trận hòa';
  return replay.terminationReason ? 'Trận đấu đã kết thúc' : 'Trận đấu chưa hoàn tất';
}

function replayWinnerLabel(replay) {
  if (replay.winner === 'A' || replay.winner === 'B') {
    const identity = replay.participantIdentities?.[replay.winner]?.participantName;
    return identity ? `${identity} chiến thắng` : replayResultLabel(replay);
  }
  if (replay.winner === 'draw') return 'Hòa';
  return '—';
}

function isReplayShape(replay) {
  return replay && replay.initialState && Number(replay.initialState.boardSize) === 9
    && Array.isArray(replay.initialState.pieces) && Array.isArray(replay.moves)
    && replay.finalState && Number(replay.finalState.boardSize) === 9;
}

function applyReplayParticipantIdentities(replay) {
  const identities = replay.participantIdentities || {};
  const revisions = replay.metadata?.sourceRevisions || [];
  const runtimeLabel = runtime => runtime === 'cpp' ? 'C++17' : runtime === 'python3' ? 'Python 3' : '';
  const renderIdentity = (side, fallback) => {
    const identity = identities[side] || {};
    const revision = revisions.find(item => item.player === side);
    $(`#r-p${side === 'A' ? '1' : '2'}-name`).textContent = identity.participantName || fallback;
    const details = [identity.botName, runtimeLabel(identity.runtimeId || revision?.runtimeId), revision?.revisionId ? `Revision ${shortId(revision.revisionId)}` : ''].filter(Boolean).join(' · ');
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
  $('#r-result-text').textContent = `${replayResultLabel(replay)} · ${formatReplayReason(replay.terminationReason)}`;
  $('#r-winner').textContent = replayWinnerLabel(replay);
  $('#r-termination').textContent = formatReplayReason(replay.terminationReason) || 'Chưa xác định';
  $('#r-protocol').textContent = String(replay.protocolVersion || 'unknown');
}

function renderReplayPieceCounts(board) {
  const labels = { dam: 'Búa', la: 'Bao', keo: 'Kéo' };
  ['A', 'B'].forEach(side => {
    const counts = { dam: 0, la: 0, keo: 0 };
    board.pieces.filter(piece => piece.player === side).forEach(piece => {
      if (Object.hasOwn(counts, piece.type)) counts[piece.type] += 1;
    });
    const target = $(`#r-p${side === 'A' ? '1' : '2'}-pieces`);
    if (target) target.textContent = Object.entries(labels).map(([type, label]) => `${label} ×${counts[type]}`).join(' · ');
  });
}

async function playReplay(tournamentId, matchId) {
  stopReplayPlayback();
  stopLiveMatchPolling();
  $('#replay-view').classList.remove('live-match-view');
  $('#replay-view-kicker').textContent = 'XEM LẠI TRẬN ĐẤU';
  const authRevision = state.authRevision;
  const sourceViewRevision = state.viewRevision;
  const replayRevision = ++state.replayRevision;
  state.replayContext = { tournamentId, matchId, authRevision, sourceViewRevision };
  state.replay = null;
  state.replayMatchId = matchId;
  state.replayMoveIndex = -1;
  $('#replay-error').hidden = true;
  setReplayLoading(true);
  navigate('replay-view');
  const replayViewRevision = state.viewRevision;
  let replay;
  try {
    replay = await api(`/tournaments/${tournamentId}/replays/${matchId}`);
    if (!isReplayShape(replay)) throw new Error('Dữ liệu xem lại không hợp lệ.');
  }
  catch (error) {
    if (state.authRevision === authRevision && state.replayRevision === replayRevision && state.activeView === 'replay-view'
      && state.replayContext?.tournamentId === tournamentId && state.replayContext?.matchId === matchId) {
      setReplayLoading(false);
      $('#replay-content').hidden = true;
      $('#replay-error-message').textContent = error.message || 'Không thể tải dữ liệu xem lại.';
      $('#replay-error').hidden = false;
    }
    return;
  }
  if (!state.user || state.authRevision !== authRevision || state.replayRevision !== replayRevision
    || state.activeView !== 'replay-view' || state.viewRevision !== replayViewRevision
    || state.tournamentId !== tournamentId || state.replayContext?.matchId !== matchId) return;
  state.replay = replay;
  state.replayContext.replayViewRevision = replayViewRevision;
  renderReplaySummary(replay);
  setReplayLoading(false);
  goToReplayTurn(-1);
}

function retryReplay() {
  if (!state.replayContext) return;
  void playReplay(state.replayContext.tournamentId, state.replayContext.matchId);
}

function buildStateAt(moveIndex) {
  if (!state.replay || !state.replay.initialState || !Array.isArray(state.replay.initialState.pieces)) return null;
  const board = { ...state.replay.initialState, pieces: state.replay.initialState.pieces.map(piece => ({ ...piece })) };
  for (let index = 0; index <= moveIndex; index += 1) {
    const move = state.replay.moves[index]; if (!move) continue;
    const piece = board.pieces.find(candidate => candidate.id === move.pieceId);
    if (!piece || !move.to) continue;
    if (move.captures) board.pieces = board.pieces.filter(candidate => candidate.id !== move.captures);
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
      const flag = create('span', { className: 'goal-flag', attrs: { 'aria-hidden': 'true' } });
      flag.appendChild(icon('icon-flag'));
      cell.appendChild(flag);
    }
    const piece = board.pieces.find(candidate => candidate.row === row && candidate.col === col);
    if (piece) {
      const label = `Người chơi ${piece.player}, ${PIECE_LABELS[piece.type] || piece.type}`;
      const token = create('span', { className: `replay-piece replay-player-${piece.player.toLowerCase()}`, attrs: { 'aria-label': label, title: label } });
      const symbolId = PIECE_TYPES[piece.type];
      if (symbolId) token.appendChild(icon(symbolId));
      else token.textContent = '?';
      cell.setAttribute('aria-label', `${coordinate}, ${goal ? `${goal}, ` : ''}${label}`);
      cell.appendChild(token);
    }
    element.appendChild(cell);
  }
}

function goToReplayTurn(index) {
  if (!state.replay || state.activeView !== 'replay-view') return;
  state.replayMoveIndex = Math.max(-1, Math.min(index, state.replay.moves.length - 1));
  $('#r-turn-display').textContent = `${Math.max(0, state.replayMoveIndex + 1)} / ${state.replay.moves.length}`;
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
  $('#r-current-move').textContent = move?.pieceId
    ? `Lượt ${move.turn} · Người chơi ${move.player}: ${replayCoordinate(move.from)} → ${replayCoordinate(move.to)}`
    : state.replayMoveIndex >= 0 ? `Lượt ${move.turn} · Người chơi ${move.player}: không có nước đi được áp dụng` : 'Vị trí ban đầu';
}

  if (false) {
    const selected = $('#r-selected-move');
  if (selected) selected.textContent = move?.pieceId ? $('#r-current-move').textContent : state.replayMoveIndex < 0 ? 'Vá»‹ trÃ­ ban Ä‘áº§u' : 'KhÃ´ng cÃ³ nÆ°á»›c Ä‘i Ä‘Æ°á»£c Ã¡p dá»¥ng';
}

function setupReplayCoordinates() {
  const header = $('#coord-header'); const side = $('#coord-side'); clear(header); clear(side);
  'abcdefghi'.split('').forEach(column => header.appendChild(create('span', { className: 'coord', text: column, attrs: { 'aria-hidden': 'true' } })));
  Array.from({ length: 9 }, (_, index) => index + 1).forEach(row => side.appendChild(create('span', { className: 'coord', text: row, attrs: { 'aria-hidden': 'true' } })));
}

function replayCoordinate(position) { return position ? `${'abcdefghi'[position.col] || '?'}${Number(position.row) + 1}` : '?'; }
function renderReplayTimeline() {
  const list = $('#replay-timeline'); clear(list);
  const moves = state.replay?.moves || [];
  const historyTitle = $('#replay-history-title'); if (historyTitle) historyTitle.textContent = `Lịch sử nước đi · ${moves.length}`;
  if (!state.replay?.moves.length) { list.appendChild(create('p', { className: 'ui-message', text: 'Chưa có nước đi nào được ghi nhận cho trận đấu này.' })); return; }
  state.replay.moves.forEach((move, index) => {
    const item = actionButton('', () => { stopReplayPlayback(); goToReplayTurn(index); }, `replay-seek:${index}`, 'replay-move');
    item.classList.toggle('active', index === state.replayMoveIndex);
    const applied = Boolean(move.pieceId);
    item.classList.toggle('replay-move-unapplied', !applied);
    const label = applied ? `Lượt ${move.turn} · Người chơi ${move.player}: ${replayCoordinate(move.from)} → ${replayCoordinate(move.to)}${move.captures ? ' · ăn quân' : ''}` : `Lượt ${move.turn} · Người chơi ${move.player}: không có nước đi được áp dụng`;
    item.setAttribute('aria-label', label);
    item.setAttribute('aria-current', index === state.replayMoveIndex ? 'step' : 'false');
    item.textContent = label; list.appendChild(item);
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

function bindEvents() {
  document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => {
    if (link.dataset.target === 'tournaments') state.tournamentScope = link.dataset.scope || 'discoverable';
    navigate(link.dataset.target);
  }));
    $('#show-register').addEventListener('click', () => setAuthMode('register'));
   $('#show-login').addEventListener('click', () => setAuthMode('login'));
    $('#login-password-toggle').addEventListener('click', () => togglePassword('login-password', 'login-password-toggle'));
    $('#register-password-toggle').addEventListener('click', () => togglePassword('register-password', 'register-password-toggle'));
   
  // Add real-time validation
  $('#login-username').addEventListener('input', () => { clearAuthMessage('login'); validateField($('#login-username'), 'username'); updateButtonState('login'); });
  $('#login-password').addEventListener('input', () => { clearAuthMessage('login'); validateField($('#login-password'), 'login-password'); updateButtonState('login'); });
  $('#register-username').addEventListener('input', () => { clearAuthMessage('register'); validateField($('#register-username'), 'username'); updateButtonState('register'); });
  $('#register-password').addEventListener('input', () => { clearAuthMessage('register'); validateField($('#register-password'), 'password'); updateButtonState('register'); });

  $('#login-form').addEventListener('submit', event => { event.preventDefault(); void runPending('login', $('#login-submit'), async () => { 
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
  }); });
  $('#register-form').addEventListener('submit', event => { event.preventDefault(); void runPending('register', $('#register-submit'), async () => { 
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
  }); });
  $('#logout-button').addEventListener('click', () => void runPending('logout', $('#logout-button'), async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { showAuthScreen(); } }));
  $('#open-bot-modal').addEventListener('click', () => openBotWorkspace()); $('#open-tournament-modal').addEventListener('click', openTournamentDialog);
  $('#dashboard-create-bot').addEventListener('click', () => openBotWorkspace()); $('#dashboard-create-tournament').addEventListener('click', openTournamentDialog);
  $('#dashboard-open-tournaments').addEventListener('click', () => { state.tournamentScope = 'discoverable'; navigate('tournaments'); });
  $('#dashboard-open-bots').addEventListener('click', () => navigate('bots'));
  $('#dash-empty-bot').addEventListener('click', () => {
    if (state.user?.role === 'competitor' && state.bots.length) {
      state.tournamentScope = 'discoverable';
      navigate('tournaments');
      return;
    }
    openBotWorkspace();
  }); $('#dash-empty-tournament').addEventListener('click', openTournamentDialog);
  $('#bot-search').addEventListener('input', event => { state.botSearch = event.target.value; renderBotList(); });
  $('#bot-workspace-name').addEventListener('input', () => setSourceDirty(state.sourceDirty));
  $('#bot-workspace-name').addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    const saveButton = $('#save-bot-source');
    if (!saveButton.disabled) void submitBot();
  });
   $('#bot-source-runtime').addEventListener('change', event => switchSourceRuntime(event.target.value));
  $('#bot-source-runtime').addEventListener('change', event => updateSourceRuntimeMeta(event.target.value));
  $('#bot-source-editor').addEventListener('input', () => setSourceDirty(true));
  $('#bot-source-editor').addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      const saveButton = $('#save-bot-source');
      if (!saveButton.disabled) void submitBot();
      return;
    }
    if (event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.target.readOnly) return;
    event.preventDefault();
    const editor = event.target;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.setRangeText('  ', start, end, 'end');
    setSourceDirty(true);
  });
  $('#bot-source-editor').addEventListener('input', updateEditorMetrics);
  $('#bot-source-editor').addEventListener('scroll', updateEditorMetrics, { passive: true });
  $('#save-bot-source').addEventListener('click', () => void submitBot());
  $('#run-bot-practice').addEventListener('click', openCurrentPracticeRunner);
  $('#practice-run').addEventListener('click', () => void testBotMatch());
  $('#practice-replay-start').addEventListener('click', () => { stopPracticeReplay(); goToPracticeTurn(-1); });
  $('#practice-replay-prev').addEventListener('click', () => { stopPracticeReplay(); goToPracticeTurn(state.practiceReplayMoveIndex - 1); });
  $('#practice-replay-next').addEventListener('click', () => { stopPracticeReplay(); goToPracticeTurn(state.practiceReplayMoveIndex + 1); });
  $('#practice-replay-end').addEventListener('click', () => { stopPracticeReplay(); goToPracticeTurn((state.practiceReplay?.moves?.length || 1) - 1); });
  $('#practice-replay-play').addEventListener('click', togglePracticeReplay);
  $('#practice-replay-scrubber').addEventListener('input', event => { stopPracticeReplay(); goToPracticeTurn(Number(event.target.value)); });
  $('#practice-replay-speed').addEventListener('change', () => { if (state.practiceReplayActive) { stopPracticeReplay(); togglePracticeReplay(); } });
  if ($('#practice-scenario')) $('#practice-scenario').addEventListener('change', () => {
    state.practiceRequestToken += 1;
    clearPracticeResult();
  });
  $('#bot-workspace-back').addEventListener('click', () => navigate('bots'));
   $('#tournament-search').addEventListener('input', event => { state.tournamentSearch = event.target.value; renderTournamentList(); });
   $('#tournament-status-filter').addEventListener('change', event => { state.tournamentStatusFilter = event.target.value; renderTournamentList(); });
   $('#dashboard-tournament-search').addEventListener('input', event => { state.dashboardTournamentSearch = event.target.value; void loadDashboard(); });
   $('#dashboard-tournament-status').addEventListener('change', event => { state.dashboardTournamentStatus = event.target.value; void loadDashboard(); });
  $('#confirm-delete-bot').addEventListener('click', () => void deleteBot());
  $('#confirm-tournament-action').addEventListener('click', () => { const pending = state.pendingTournamentAction; if (!pending) return; const revision = state.tournamentActionRevision; void runPending(`tournament:${pending.tournamentId}:${pending.action}`, $('#confirm-tournament-action'), async () => { await tournamentAction(pending.tournamentId, pending.authRevision, pending.viewRevision, pending.action); if (state.tournamentActionRevision === revision) closeModal('tournament-action-modal'); }); });
  $('#mobile-menu-toggle').addEventListener('click', toggleMobileNavigation); $('#sidebar-backdrop').addEventListener('click', closeMobileNavigation);
  $('#open-bot-guide').addEventListener('click', openBotGuide);
  $('#back-to-tournaments').addEventListener('click', () => navigate('tournaments')); $('#btn-register-bot').addEventListener('click', () => { openRegistrationDialog(); void populateBotSelect(); });
  $('#go-to-bots-from-registration').addEventListener('click', goToBotsFromRegistration);
  $('#retry-registration-bots').addEventListener('click', retryRegistrationBots);
  $('#reg-part-name').addEventListener('input', () => { $('#reg-part-name').setAttribute('aria-invalid', $('#reg-part-name').value.trim() ? 'false' : 'true'); });
  $('#reg-bot-select').addEventListener('change', () => { $('#reg-bot-select').setAttribute('aria-invalid', $('#reg-bot-select').value ? 'false' : 'true'); });
  $('#reg-bot-select').addEventListener('change', event => { void populateRevisionSelect(event.target.value); });
   $('#reg-revision-select').addEventListener('change', () => { $('#reg-revision-select').setAttribute('aria-invalid', $('#reg-revision-select').value ? 'false' : 'true'); updateRegistrationRevisionSummary(); });
   $('#copy-replay-match-id').addEventListener('click', () => {
     const matchId = state.replayMatchId;
     if (!matchId || !navigator.clipboard?.writeText) { showToast('Không thể sao chép mã trận.', 'error'); return; }
     void navigator.clipboard.writeText(matchId).then(() => showToast('Đã sao chép mã trận.', 'success')).catch(() => showToast('Không thể sao chép mã trận.', 'error'));
   });
  $('#close-replay').addEventListener('click', closeReplay); $('#btn-replay-play').addEventListener('click', toggleReplayPlayback); $('#replay-retry').addEventListener('click', retryReplay); $('#replay-speed').addEventListener('change', event => { state.replaySpeed = Number(event.target.value); if (state.replayPlaybackActive) { stopReplayPlayback(); toggleReplayPlayback(); } }); $('#replay-scrubber').addEventListener('input', event => { stopReplayPlayback(); goToReplayTurn(Number(event.target.value)); }); $('#new-tourney-name').addEventListener('input', () => { $('#new-tourney-name').setAttribute('aria-invalid', 'false'); $('#tournament-form-error').hidden = true; }); $('#new-tourney-visibility').addEventListener('change', () => { $('#tournament-form-error').hidden = true; }); $('#submit-tournament').addEventListener('click', () => void submitNewTournament()); $('#submit-registration').addEventListener('click', () => void submitTournamentRegistration());
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
  document.querySelectorAll('.modal-overlay').forEach(modal => modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal.id); }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(modal => closeModal(modal.id));
      closeMobileNavigation();
    }
    else if (state.activeView === 'replay-view' && (!(event.target instanceof Element) || !event.target.closest('input, textarea, select, button'))) {
      if (event.key === ' ') { event.preventDefault(); toggleReplayPlayback(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); stopReplayPlayback(); goToReplayTurn(state.replayMoveIndex - 1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); stopReplayPlayback(); goToReplayTurn(state.replayMoveIndex + 1); }
      else if (event.key === 'Home') { event.preventDefault(); stopReplayPlayback(); goToReplayTurn(-1); }
      else if (event.key === 'End' && state.replay) { event.preventDefault(); stopReplayPlayback(); goToReplayTurn(state.replay.moves.length - 1); }
    } else trapModalFocus(event);
  });
  window.addEventListener('beforeunload', event => {
    if (!state.sourceDirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
  window.addEventListener('popstate', () => {
    const hashView = window.location.hash.slice(1);
    if (hashView === 'bot-workspace') return;
    if (['dashboard', 'bots', 'tournaments'].includes(hashView)) {
      if (hashView === 'tournaments' && state.user?.role === 'competitor') state.tournamentScope = 'discoverable';
      navigate(hashView, { history: false });
    } else if (state.activeView === 'bot-workspace') navigate('bots', { history: false });
  });
  $('#btn-replay-start').addEventListener('click', () => { stopReplayPlayback(); goToReplayTurn(-1); }); $('#btn-replay-prev').addEventListener('click', () => { stopReplayPlayback(); goToReplayTurn(state.replayMoveIndex - 1); }); $('#btn-replay-next').addEventListener('click', () => { stopReplayPlayback(); goToReplayTurn(state.replayMoveIndex + 1); }); $('#btn-replay-end').addEventListener('click', () => { stopReplayPlayback(); if (state.replay) goToReplayTurn(state.replay.moves.length - 1); });
}

repairMojibakeDom();
bindEvents();
if (window.MutationObserver) {
  const mojibakeObserver = new MutationObserver(() => repairMojibakeDom());
  mojibakeObserver.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder'] });
}
document.querySelectorAll('.bottom-nav [data-target]').forEach(button => button.addEventListener('click', () => {
  state.tournamentScope = button.dataset.target === 'my-tournaments' ? 'mine' : 'discoverable';
  navigate(button.dataset.target === 'my-tournaments' ? 'tournaments' : button.dataset.target);
}));
if (window.ResizeObserver) new ResizeObserver(updateEditorMetrics).observe($('#bot-source-editor'));
updateEditorMetrics();
setAuthMode('login', false); setupReplayCoordinates(); void restoreSession();
setInterval(() => {
  if (state.user) void refreshQueueStats();
  if (state.activeView === 'tournament-detail' && state.detailStatus === 'running' && !state.detailRefreshInFlight) {
    state.detailRefreshInFlight = true;
    void refreshTournamentDetail().finally(() => { state.detailRefreshInFlight = false; });
  }
}, 5000);
