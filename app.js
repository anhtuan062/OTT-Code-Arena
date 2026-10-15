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
  replaySeries: null,
  replayGameIndex: 0,
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
  pendingInitialRevision: null,
  practiceRevision: null,
  practiceDraft: null,
  practiceReplay: null,
  practiceReplayMoveIndex: -1,
  practiceReplayTimer: null,
  practiceReplayToken: 0,
  practiceRequestToken: 0,
  practiceAbortController: null,
  tournaments: [],
  tournamentSearch: '',
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
  $('#registration-revision-summary').textContent = 'Chưa chọn Bot và phiên bản';
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
    if (queueStats) queueStats.textContent = `Hàng đợi: ${stats.activeCount}/${stats.maxConcurrent} đang chạy, ${stats.queueLength} đang chờ`;
    $('#dash-queue-value').textContent = String(Number(stats.activeCount) || 0);
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
  renderLoadingSkeleton(table, 5, 5);
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
    const activityCopy = $('#dashboard-activity-copy');
    const botLabel = $('#dash-bot-label');
    const tournamentLabel = $('#dash-tourney-label');
    const queueLabel = $('#dash-queue-label');
    const queueCard = $('#dash-queue-card');
    const recordCard = $('#dash-record-card');
    const dashboardIcons = {
      bot: competitor ? 'icon-bot' : 'icon-users',
      tournament: competitor ? 'icon-users' : 'icon-trophy',
      queue: competitor ? 'icon-user-round-plus' : 'icon-activity',
    };
    [['dash-bot-icon', dashboardIcons.bot], ['dash-bot-icon-main', dashboardIcons.bot], ['dash-tourney-icon-main', dashboardIcons.tournament], ['dash-queue-icon', dashboardIcons.queue], ['dash-queue-icon-main', dashboardIcons.queue]].forEach(([id, iconId]) => {
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
    if (activityCopy) activityCopy.textContent = competitor
      ? 'Các giải đấu bạn có thể gửi yêu cầu tham gia.'
      : 'Theo dõi các giải đấu gần đây và quản lý hoạt động thi đấu.';
    if (secondaryColumn) secondaryColumn.textContent = competitor ? 'Trạng thái tham gia' : 'Thể thức';
    if (botLabel) botLabel.textContent = competitor ? 'Bot của tôi' : 'Mở đăng ký';
    if (tournamentLabel) tournamentLabel.textContent = competitor ? 'Đang tham gia' : 'Giải đấu quản lý';
    const botDetail = $('#dash-bot-detail');
    const tournamentDetail = $('#dash-tourney-detail');
    if (botDetail) botDetail.textContent = competitor ? 'Đã có phiên bản mã nguồn' : 'Đang nhận đăng ký';
    if (tournamentDetail) tournamentDetail.textContent = competitor ? 'Giải đấu hiện tại' : 'Tổng số giải đấu';
    if (queueLabel) queueLabel.textContent = competitor ? 'Đang diễn ra' : 'Đang diễn ra';
    if (queueCard) queueCard.hidden = competitor;
    if (recordCard) recordCard.hidden = !competitor;
    const [tournamentResponse, bots, myTournamentResponse, botStats] = await Promise.all([
      request(competitor ? '/tournaments/discoverable' : '/tournaments'),
      competitor ? request('/bots') : Promise.resolve([]),
      competitor ? request('/my/tournaments') : Promise.resolve([]),
      competitor ? request('/my/bot-stats') : Promise.resolve(null),
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
      const recordRate = $('#dash-record-rate');
      const recordMatches = $('#dash-record-matches');
      const totalMatches = Number(botStats?.totalMatches) || 0;
      const wins = Number(botStats?.wins) || 0;
      const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;
      if (recordRate) recordRate.textContent = totalMatches > 0 ? `${winRate.toFixed(1).replace('.0', '')}%` : '—';
      if (recordMatches) recordMatches.textContent = totalMatches > 0
        ? `${totalMatches} trận tham gia · ${wins} thắng`
        : 'Chưa có trận tham gia';
      $('#dash-queue-value').textContent = openCount;
      const queueLabelText = $('#dash-queue-label'); if (queueLabelText) queueLabelText.textContent = 'Giải đang mở đăng ký';
      if (botSection) { botSection.hidden = false; renderDashboardBotList(bots); }
    } else {
      if (recordCard) recordCard.hidden = true;
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
    const createBotActionLabel = $('#dashboard-create-bot-label');
    if (competitor && createBotAction) {
      if (createBotActionLabel) createBotActionLabel.textContent = hasRevision ? 'Mã nguồn Bot' : 'Lưu phiên bản mã nguồn';
      createBotAction.title = hasRevision ? 'Mở không gian Bot' : 'Tạo Bot và lưu phiên bản C++17 hoặc Python 3 trước khi tham gia';
    }
    if (competitor && createBotAction) {
      if (createBotActionLabel) createBotActionLabel.textContent = bots.length ? 'Mã nguồn Bot' : 'Tạo Bot';
      createBotAction.title = bots.length ? 'Mở không gian Bot' : 'Tạo Bot mới';
    }
    clearLoadingSkeleton(table);
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
    const arrow = icon('icon-chevron-down'); arrow.classList.add('dashboard-bot-arrow');
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
  clearLoadingSkeleton(list);
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
  const runtimeLabel = isLegacy ? 'JavaScript phiên bản cũ' : isPython ? 'Python 3' : 'C++17';
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
  else if (executionMode === 'raw') mode.textContent = 'Mã nguồn trực tiếp';
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
  syncSourceEditorTools();
}

function escapeSourceHtml(value) {
  return String(value).replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character]));
}

function highlightSourceCode(source) {
  const escaped = escapeSourceHtml(source);
  const tokenPattern = /(\/\/[^\n]*|#[^\n]*|\#[a-zA-Z_][\w]*|"[^"\n]*"|'[^'\n]*'|\b\d+(?:\.\d+)?\b|\b(?:class|def|return|if|else|elif|for|while|in|import|from|as|True|False|None|and|or|not|using|namespace|const|auto|int|string|bool|void|struct|vector|return|include|public|private|new)\b)/g;
  return escaped.replace(tokenPattern, token => {
    if (token.startsWith('//') || token.startsWith('#')) return `<span class="code-comment">${token}</span>`;
    if (token.startsWith('"') || token.startsWith("'")) return `<span class="code-string">${token}</span>`;
    if (/^\d/.test(token)) return `<span class="code-number">${token}</span>`;
    return `<span class="code-keyword">${token}</span>`;
  }) || ' ';
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
    highlight.innerHTML = highlightSourceCode(editor.value);
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

function setSourceDirty(dirty) {
  state.sourceDirty = dirty;
  const marker = $('#bot-source-dirty');
  const saveButton = $('#save-bot-source');
  if (marker) marker.hidden = !dirty;
  if (saveButton) {
    const nameChanged = ($('#bot-workspace-name')?.value.trim() || '') !== state.botWorkspaceInitialName;
    const hasSource = Boolean($('#bot-source-editor')?.value.trim());
    saveButton.disabled = state.botWorkspaceMode === 'create' ? !hasSource : !(dirty || nameChanged);
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
    // Opening a revision as an editable draft does not itself change the
    // source. Mark it dirty only after the editor emits an input event.
    setSourceDirty(false);
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
  $('#bot-source-description').textContent = `${bot?.name || 'Bot của tôi'} / ${bot ? 'Chỉnh sửa Bot' : 'Tạo Bot mới'}`;
  $('#save-bot-source').textContent = bot ? 'Lưu phiên bản' : 'Tạo Bot';
  $('#bot-source-runtime').value = 'cpp';
  state.sourceRuntime = 'cpp';
  updateSourceRuntimeMeta('cpp');
  updateSourceModeMeta(bot ? '' : 'strategy', bot ? '' : '1.0.0');
  $('#bot-source-editor').value = bot ? '' : STRATEGY_TEMPLATES.cpp;
  updateEditorMetrics();
  $('#bot-source-editor').readOnly = false;
  setWorkspaceStatus(bot ? 'Đang chuẩn bị bản nháp' : 'Bản nháp mới');
  // A new workspace starts with a built-in template. Loading that template is
  // not a user change, so leaving immediately must not show an unsaved warning.
  setSourceDirty(false);
  if (pendingInitial) {
    $('#bot-workspace-name').value = pendingInitial.bot.name;
    $('#bot-source-runtime').value = pendingInitial.runtimeId;
    $('#bot-source-editor').value = pendingInitial.source;
    updateEditorMetrics();
    $('#bot-source-description').textContent = `${pendingInitial.bot.name} / Tạo Bot mới`;
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
    await loadRevisionSource(revision, 'draft');
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
    ['Phiên bản', revision?.revisionId ? revision.revisionId.slice(0, 12) : 'Đã chọn từ không gian mã nguồn'],
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
  $('#replay-error').hidden = true;
  navigate('replay-view');
  state.replayContext.replayViewRevision = state.viewRevision;
  renderReplaySummary(replay);
  $('#replay-view-title').textContent = 'Trận đấu thử';
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
  $('#practice-title').textContent = 'Trận đấu thử';
  const runtimeLabel = revision.runtimeId === 'cpp' ? 'C++17' : revision.runtimeId === 'python3' ? 'Python 3' : revision.runtimeId;
  const modeLabel = revision.executionMode === 'strategy' ? 'Strategy SDK' : revision.executionMode === 'raw' ? 'Mã nguồn trực tiếp' : '';
  const revisionMeta = $('#practice-revision-meta');
  if (revisionMeta) {
    const revisionLabel = revision.label || revision.name || revision.title || (revision.revisionId.startsWith('draft-') ? 'Bản nháp hiện tại' : `Phiên bản ${revision.revisionId.slice(0, 12)}`);
    const revisionId = revision.revisionId.startsWith('draft-') ? '' : ` · Phiên bản ${revision.revisionId.slice(0, 12)}`;
    revisionMeta.textContent = `Đang chạy: ${revisionLabel} · ${runtimeLabel}${modeLabel ? ` · ${modeLabel}` : ''} · ${state.sourceWorkspaceBot?.name || 'Bot của bạn'}${revisionId}`;
  }
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
  if (autoRun) setTimeout(() => void testBotMatch(), 0);
  else $('#practice-run').focus();
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
  state.practiceAbortController?.abort();
  const controller = new AbortController();
  state.practiceAbortController = controller;
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
      signal: controller.signal,
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
  const syntaxError = sourceSyntaxCheck(source, runtimeId);
  if (syntaxError) return { error: syntaxError, field: 'bot-source-editor' };
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
  renderLoadingSkeleton(list, 'tournament-skeleton', 4);
  renderMessage(list, 'Đang tải danh sách giải đấu…');
  try {
    let response;
    // Only competitors use the public discovery projection. Organizers must
    // load their owner-scoped list; the discovery projection intentionally
    // omits ownership fields and must never render management actions.
    if (state.user?.role === 'competitor' && state.tournamentScope === 'discoverable') {
      response = await request('/tournaments/discoverable');
    } else {
      const path = state.user?.role === 'competitor' ? '/my/tournaments' : '/tournaments';
      response = await request(path);
    }
    const scopedResponse = state.user?.role === 'competitor' && state.tournamentScope === 'discoverable'
      // The discovery endpoint also supports finding a running tournament
      // for live spectating, but terminal/draft tournaments do not belong in
      // the "open tournaments" view.
      ? response.filter(tournament => tournament.status === 'registration_open' || tournament.status === 'running')
      : response;
    const tournaments = state.user?.role === 'competitor' && state.tournamentScope === 'mine'
      ? response.map(item => ({
        tournamentId: item.tournamentId,
        name: item.name,
        status: item.status,
        participantCount: item.participantCount ?? 0,
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
  clearLoadingSkeleton(list);
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
    if (tournament.spectatorAccess) {
      participation.textContent = tournament.status === 'running' ? 'Bạn có quyền xem trực tiếp trận đấu.' : 'Bạn có quyền xem giải đấu này.';
      footer.appendChild(tournamentViewButton(tournament.status === 'running' ? 'Xem trực tiếp' : 'Xem giải đấu', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`));
      card.appendChild(footer);
      list.appendChild(card);
      return;
    }
    if (published) {
      participation.textContent = 'Kết quả đã được công bố.';
      footer.appendChild(tournamentViewButton('Xem k\u1ebft qu\u1ea3', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`));
      card.appendChild(footer);
      list.appendChild(card);
      return;
    }
    if (tournament.status !== 'registration_open') {
      participation.textContent = tournament.status === 'running' ? 'Đang diễn ra — có thể xem trực tiếp.' : 'Xem thông tin giải đấu.';
      footer.appendChild(tournamentViewButton('Xem giải đấu', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`));
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
        ? await api(`/tournaments/${editingTournament.tournamentId}`, { method: 'PATCH', body: JSON.stringify({ name }) })
        : await api('/tournaments', { method: 'POST', body: JSON.stringify({ name }) }); }
      catch (requestError) { if (state.user && state.authRevision === authRevision && state.tournamentDialogRevision === dialogRevision) { error.textContent = requestError.message || 'Unable to create tournament.'; error.hidden = false; } throw requestError; }
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
  // The detail page refreshes while a tournament is running. Do not call
  // scrollIntoView here: rebuilding the lifecycle must never move the user's
  // document position while they are reading the schedule below.
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
    state.viewerParticipantIds = Array.isArray(tournament.viewerParticipantIds) ? tournament.viewerParticipantIds : [];
    state.viewerParticipantId = state.viewerParticipantIds[0] ?? null;
    state.detailStatus = tournament.status;
    state.spectatorMode = tournament.spectatorAccess === true;
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
      await refreshTournamentDetail();
      showToast('Đã cập nhật dữ liệu giải đấu.', 'success');
    }, `refresh-tournament-detail:${tournamentId}`, 'secondary-btn tournament-action tournament-refresh-action');
    const refreshIcon = icon('td-icon-refresh-cw');
    refreshIcon.classList.add('td-icon', 'td-icon--sm');
    refreshButton.prepend(refreshIcon);
    actions.appendChild(refreshButton);
    const register = $('#btn-register-bot'); register.hidden = state.user?.role !== 'competitor' || tournament.status !== 'registration_open';
    const isOrganizer = state.user?.role === 'organizer';
    if (isOrganizer && tournament.status === 'draft') appendTournamentAction(actions, tournamentId, authRevision, viewRevision, actionLabel('open_registration'), 'open_registration');
    if (isOrganizer && tournament.status === 'registration_open') {
      appendTournamentAction(actions, tournamentId, authRevision, viewRevision, actionLabel('close_registration'), 'close_registration', true, tournament.name);
    }
    if (isOrganizer && tournament.status === 'registration_closed') {
      if (tournament.rounds.length) appendTournamentAction(actions, tournamentId, authRevision, viewRevision, actionLabel('start'), 'start');
      else appendTournamentAction(actions, tournamentId, authRevision, viewRevision, actionLabel('generate_schedule'), 'generate_schedule');
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

    await renderParticipationRequestsV2(tournamentId, tournament.status);

    const executionSummary = renderExecutionStatus(tournament);
    renderStandings(tournament.standings, executionSummary, state.viewerParticipantIds);
    renderTournamentPodium(tournament);
    renderSchedule(tournament, state.viewerParticipantIds);
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

function renderStandings(standings, executionSummary = { completed: 0 }, viewerParticipantIds = []) {
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
       if (pairing.matchResult?.series) winner += ` · BO3 ${pairing.matchResult.series.winsA}-${pairing.matchResult.series.winsB}`;
       row.lastChild.textContent = winner;
       if (hasMatchActions) {
        const action = create('td');
        if (pairing.matchId && pairing.status === 'in_progress' && (state.user?.role === 'organizer' || state.spectatorMode)) {
          action.appendChild(actionButton('Xem trực tiếp', () => openLiveMatch(tournament.tournamentId, pairing.matchId), `live:${pairing.matchId}`));
        } else if (pairing.status === 'failed' && state.user?.role === 'organizer') {
          action.appendChild(actionButton('Chạy lại trận', () => retryTournamentPairing(tournament.tournamentId, pairing.pairingId), `retry:${tournament.tournamentId}:${pairing.pairingId}`, 'primary-btn tournament-retry-action'));
        } else if (pairing.matchId && pairing.status !== 'failed') {
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
      if (pairing.matchResult?.series) winnerName += ` · BO3 ${pairing.matchResult.series.winsA}-${pairing.matchResult.series.winsB}`;
      const cardFooter = create('div', { className: 'schedule-card-footer' });
      cardFooter.appendChild(create('span', { className: 'schedule-card-winner', text: `Người thắng: ${winnerName}` }));
      if (pairing.status === 'failed') cardFooter.appendChild(create('small', { className: 'schedule-card-error', text: pairing.failureReason || 'Có thể thử lại; kết quả chưa được ghi nhận.' }));
      if (pairing.matchId && pairing.status === 'in_progress' && (state.user?.role === 'organizer' || state.spectatorMode)) {
        cardFooter.appendChild(actionButton('Xem trực tiếp', () => openLiveMatch(tournament.tournamentId, pairing.matchId), `live:${pairing.matchId}`));
      } else if (pairing.status === 'failed' && state.user?.role === 'organizer') {
        cardFooter.appendChild(actionButton('Chạy lại trận', () => retryTournamentPairing(tournament.tournamentId, pairing.pairingId), `retry:${tournament.tournamentId}:${pairing.pairingId}`, 'primary-btn tournament-retry-action'));
      } else if (pairing.matchId && pairing.status !== 'failed') {
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
    if (action === 'delete') navigate('tournaments'); else await refreshTournamentDetail();
  } else if (action === 'delete' && isCurrentView('tournaments', authRevision, viewRevision)) {
    showToast('Đã xóa giải đấu.', 'success');
    await loadTournaments();
  }
}

async function retryTournamentPairing(tournamentId, pairingId) {
  const retryKey = `${tournamentId}:${pairingId}`;
  if (state.retryingPairings.has(retryKey)) return;
  state.retryingPairings.add(retryKey);
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  try {
    await api(`/tournaments/${tournamentId}/pairings/${pairingId}/retry`, { method: 'POST' });
  } catch {
    state.retryingPairings.delete(retryKey);
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
  const mode = revision.executionMode === 'strategy' ? 'Chiến thuật' : revision.executionMode === 'raw' ? 'Mã nguồn trực tiếp' : '';
  target.textContent = `Phiên bản bất biến: ${language}${mode ? ` · ${mode}` : ''} · ${revision.revisionId}`;
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
  state.liveTransitionToken += 1;
  if (state.liveMatchPollingTimer) clearTimeout(state.liveMatchPollingTimer);
  state.liveMatchPollingTimer = null;
  if (state.liveStreamSource) state.liveStreamSource.close();
  state.liveStreamSource = null;
  state.liveStreamMode = false;
  state.livePollBackoffMs = 0;
  state.liveMatchContext = null;
  state.liveMatchSnapshot = null;
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
  const winnerSide = snapshot.winner || series?.winner;
  const winnerName = winnerSide && snapshot.participants?.[winnerSide]?.participantName
    ? snapshot.participants[winnerSide].participantName
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
  if (winnerLabel) winnerLabel.textContent = transition ? 'Kết quả ván đã được ghi nhận' : (winnerName ? `${winnerName} chiến thắng` : 'Kết quả đã được ghi nhận');
  if (next) next.textContent = transition
    ? (nextGame ? `Đang chuẩn bị Ván ${nextGame}` : 'Đang chuẩn bị ván tiếp theo')
    : (winnerName ? `${winnerName} chiến thắng` : 'Kết quả đã được ghi nhận');
  const close = $('#live-game-result-close');
  if (close) close.hidden = transition;
  const modal = $('#live-game-result-modal');
  if (modal) {
    modal.classList.add('is-visible');
    modal.setAttribute('aria-hidden', 'false');
  }
}

function hideLiveGameResultModal() {
  const modal = $('#live-game-result-modal');
  if (modal) {
    modal.classList.remove('is-visible');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function closeLiveGameResultModal() {
  hideLiveGameResultModal();
}

function replayParticipantName(participants, player) {
  return participants?.[player]?.participantName || (player ? `Người chơi ${player}` : 'Người chơi');
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
  const latestMove = snapshot.state?.lastMove || snapshot.latestMove;
  const activePlayer = snapshot.currentPlayer;
  const currentMove = $('#r-current-move'); if (currentMove) currentMove.textContent = latestMove?.pieceId
    ? `Lượt ${latestMove.turn ?? snapshot.turn} · ${replayParticipantName(participants, latestMove.player)}: ${replayCoordinate(latestMove.from)} → ${replayCoordinate(latestMove.to)}`
    : `Lượt ${snapshot.turn} · ${replayParticipantName(participants, snapshot.currentPlayer)} đang thực thi`;
  currentMove?.classList.toggle('replay-current-move-a', latestMove?.player === 'A' || (!latestMove && snapshot.currentPlayer === 'A'));
  currentMove?.classList.toggle('replay-current-move-b', latestMove?.player === 'B' || (!latestMove && snapshot.currentPlayer === 'B'));
  const selected = $('#r-selected-move'); if (selected) selected.textContent = currentMove?.textContent || statusText;
  const turnDisplay = $('#r-turn-display'); if (turnDisplay) turnDisplay.textContent = `Lượt ${snapshot.turn}`;
  $('#r-p1-name').textContent = replayParticipantName(participants, 'A');
  $('#r-p2-name').textContent = replayParticipantName(participants, 'B');
  $('#r-p1-bot').textContent = participants.A?.botId ? `Bot ${shortId(participants.A.botId)}` : '';
  $('#r-p2-bot').textContent = participants.B?.botId ? `Bot ${shortId(participants.B.botId)}` : '';
  updateReplaySeriesScore(series?.winsA ?? 0, series?.winsB ?? 0);
  updateReplayTurnHighlight(activePlayer);
  $('#replay-content').hidden = false;
  const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = false;
  $('#replay-loading').hidden = true;
  $('#replay-error').hidden = true;
  renderReplayBoard(snapshot.state, latestMove);
  renderReplayPieceCounts(snapshot.state);
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
    renderLiveMatchSnapshot({ ...latest, ...frame, series: latest.series, participants: latest.participants, history: latest.history });
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
      active: response.status === 'in_progress' || response.status === 'between_games',
    },
    participants: { A: game?.sideA ? { participantName: game.sideA.name } : null, B: game?.sideB ? { participantName: game.sideB.name } : null },
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
  if (isLoading) { const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = true; }
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

function getActiveReplay() {
  return state.replay;
}

function renderReplaySeriesControls(replay) {
  const existing = $('#replay-series-controls');
  if (existing) existing.remove();
  if (!replay?.series?.games?.length) return;
  const controls = create('div', { className: 'replay-series-controls', attrs: { id: 'replay-series-controls', role: 'group', 'aria-label': 'Chọn ván trong series BO3' } });
  const identities = Object.values(replay.participantIdentities || {}).filter(Boolean);
  const names = new Map(identities.map(identity => [identity.participantId, identity.participantName]));
  replay.series.games.forEach((game, index) => {
    const sideA = names.get(game.participantA) || game.participantA;
    const sideB = names.get(game.participantB) || game.participantB;
    const result = game.winnerParticipantId ? ` · ${names.get(game.winnerParticipantId) || game.winnerParticipantId} thắng` : ' · Hòa';
    const button = actionButton(`Ván ${game.gameNumber}: ${sideA} / ${sideB}${result}`, () => selectReplayGame(index), `replay-series-game:${index}`, 'secondary-btn');
    button.classList.toggle('active', index === state.replayGameIndex);
    button.textContent = `Ván ${game.gameNumber}`;
    controls.appendChild(button);
  });
  $('#replay-series-slot')?.appendChild(controls);
}

function selectReplayGame(index) {
  if (!state.replaySeries?.series?.games?.[index]) return;
  stopReplayPlayback();
  state.replayGameIndex = index;
  state.replay = state.replaySeries.series.games[index].replay;
  renderReplaySeriesControls(state.replaySeries);
  renderReplaySummaryV2(state.replaySeries);
  goToReplayTurn(-1);
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
  $('#r-winner').textContent = replayWinnerLabel(replay);
  $('#r-termination').textContent = formatReplayReason(replay.terminationReason) || 'Chưa xác định';
  $('#r-protocol').textContent = String(replay.protocolVersion || 'unknown');
  const statusBadge = $('#replay-status-badge'); if (statusBadge) statusBadge.textContent = 'Đã hoàn thành';
  const contextNote = $('#replay-context-note'); if (contextNote) contextNote.textContent = state.replayContext?.practice ? 'Trận đấu thử' : 'Trận BO1';
  const boardTitle = $('#replay-board-title'); if (boardTitle) boardTitle.textContent = 'Ván 1 · Diễn biến';
  const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = false;
}

function renderReplaySummaryV2(replay) {
  const active = state.replay || replay;
  const series = state.replaySeries?.series;
  const title = $('#replay-view-title');
  if (title) title.textContent = series ? 'Series BO3' : `Trận đấu ${shortId(active.matchId || state.replayMatchId)}`;
  $('#r-match-id').textContent = String(state.replaySeries?.matchId || active.matchId || state.replayMatchId || '—');
  $('#replay-scrubber').max = String(Math.max(-1, active.moves.length - 1));
  // BO3 can swap temporary sides A/B. Keep the aggregate series identities
  // in the header while the board uses the selected game's replay.
  const identityReplay = series && state.replaySeries?.participantIdentities
    ? { ...active, participantIdentities: state.replaySeries.participantIdentities, metadata: state.replaySeries.metadata }
    : active;
  applyReplayParticipantIdentities(identityReplay);
  if (series) {
    const identities = state.replaySeries?.participantIdentities || {};
    const playerAId = identities.A?.participantId;
    const playerBId = identities.B?.participantId;
    const selectedIndex = Math.max(0, Math.min(Number(state.replayGameIndex) || 0, series.games.length - 1));
    updateReplaySeriesSideColors(series.games[selectedIndex], playerAId, playerBId);
    const visibleGames = series.games.slice(0, selectedIndex + 1);
    const scoreA = visibleGames.filter(game => game.winnerParticipantId === playerAId).length;
    const scoreB = visibleGames.filter(game => game.winnerParticipantId === playerBId).length;
    const shownScoreA = playerAId ? scoreA : series.winsA;
    const shownScoreB = playerBId ? scoreB : series.winsB;
    updateReplaySeriesScore(shownScoreA, shownScoreB);
    $('#r-result-text').textContent = `BO3 · Tỷ số ${series.winsA}-${series.winsB} · ${replayWinnerLabel(state.replaySeries)}`;
    $('#r-winner').textContent = replayWinnerLabel(state.replaySeries);
    $('#r-termination').textContent = `Đã đấu ${series.games.length} ván`;
    const contextNote = $('#replay-context-note'); if (contextNote) contextNote.textContent = `Trận BO3 · ${series.games.length} ván`;
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
  if (!await ensureReplaySession()) return;
  stopReplayPlayback();
  stopLiveMatchPolling();
  $('#replay-view').classList.remove('live-match-view');
  $('#replay-view-kicker').textContent = 'XEM LẠI TRẬN ĐẤU';
  state.tournamentId = tournamentId;
  const authRevision = state.authRevision;
  const sourceViewRevision = state.viewRevision;
  const replayRevision = ++state.replayRevision;
  state.replayContext = { tournamentId, matchId, authRevision, sourceViewRevision };
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
    replay = await api(state.spectatorMode
      ? `/tournaments/${tournamentId}/spectator/matches/${matchId}/replay`
      : `/tournaments/${tournamentId}/replays/${matchId}`);
    if (!isReplayShape(replay)) throw new Error('Dữ liệu xem lại không hợp lệ.');
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
  if (!state.user || state.authRevision !== authRevision || state.replayRevision !== replayRevision
    || state.activeView !== 'replay-view' || state.viewRevision !== replayViewRevision
    || state.tournamentId !== tournamentId || state.replayContext?.matchId !== matchId) return;
  state.replay = replay;
  state.replaySeries = replay.series ? replay : null;
  state.replayGameIndex = 0;
  if (state.replaySeries?.series?.games?.[0]?.replay) state.replay = state.replaySeries.series.games[0].replay;
  state.replayContext.replayViewRevision = replayViewRevision;
  renderReplaySeriesControls(replay);
  renderReplaySummaryV2(replay);
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
  currentMove.textContent = move?.pieceId
    ? `Lượt ${move.turn} · ${replayHistoryPlayerName(move.player)}: ${replayCoordinate(move.from)} → ${replayCoordinate(move.to)}`
    : state.replayMoveIndex >= 0 ? `Lượt ${move.turn} · ${replayHistoryPlayerName(move.player)}: không có nước đi được áp dụng` : 'Vị trí ban đầu';
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
    if (link.dataset.target === 'tournaments') state.tournamentScope = link.dataset.scope || 'discoverable';
    navigate(link.dataset.target);
  }));
    on('#show-register', 'click', () => setAuthMode('register'));
   on('#show-login', 'click', () => setAuthMode('login'));
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
  on('#dashboard-create-bot', 'click', () => openBotWorkspace()); on('#dashboard-create-tournament', 'click', openTournamentDialog);
  on('#dashboard-open-tournaments', 'click', () => { state.tournamentScope = 'discoverable'; navigate('tournaments'); });
  on('#dashboard-open-bots', 'click', () => navigate('bots'));
  on('#dash-empty-bot', 'click', () => {
    if (state.user?.role === 'competitor' && state.bots.length) {
      state.tournamentScope = 'discoverable';
      navigate('tournaments');
      return;
    }
    openBotWorkspace();
  }); on('#dash-empty-tournament', 'click', openTournamentDialog);
  on('#bot-search', 'input', event => { state.botSearch = event.target.value; renderBotList(); });
  on('#bot-workspace-name', 'input', () => setSourceDirty(state.sourceDirty));
  on('#bot-workspace-name', 'keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    const saveButton = $('#save-bot-source');
    if (!saveButton.disabled) void submitBot();
  });
   on('#bot-source-runtime', 'change', event => switchSourceRuntime(event.target.value));
  on('#bot-source-runtime', 'change', event => updateSourceRuntimeMeta(event.target.value), { feature: 'bot-source-runtime-meta' });
  on('#bot-source-editor', 'input', () => setSourceDirty(true));
  on('#bot-source-editor', 'keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) event.stopPropagation();
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
  on('#bot-source-editor', 'click', syncSourceEditorTools, { feature: 'bot-source-editor-cursor-click' });
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
  on('#practice-run', 'click', () => void testBotMatch());
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
  on('#bot-workspace-back', 'click', () => navigate('bots'));
   on('#tournament-search', 'input', event => { state.tournamentSearch = event.target.value; renderTournamentList(); });
   on('#tournament-status-filter', 'change', event => { state.tournamentStatusFilter = event.target.value; renderTournamentList(); });
   on('#dashboard-tournament-search', 'input', event => { state.dashboardTournamentSearch = event.target.value; void loadDashboard(); });
   on('#dashboard-tournament-status', 'change', event => { state.dashboardTournamentStatus = event.target.value; void loadDashboard(); });
  on('#confirm-delete-bot', 'click', () => void deleteBot());
  on('#confirm-delete-revision', 'click', () => void deleteRevision());
  on('#confirm-tournament-action', 'click', () => { const pending = state.pendingTournamentAction; if (!pending) return; const revision = state.tournamentActionRevision; void runPending(`tournament:${pending.tournamentId}:${pending.action}`, $('#confirm-tournament-action'), async () => { await tournamentAction(pending.tournamentId, pending.authRevision, pending.viewRevision, pending.action); if (state.tournamentActionRevision === revision) closeModal('tournament-action-modal'); }); });
  on('#mobile-menu-toggle', 'click', toggleMobileNavigation); on('#sidebar-backdrop', 'click', closeMobileNavigation);
  on('#open-bot-guide', 'click', openBotGuide);
  on('#back-to-tournaments', 'click', () => navigate('tournaments')); on('#btn-register-bot', 'click', () => { openRegistrationDialog(); void populateBotSelect(); });
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
  document.querySelectorAll('[data-close-modal]').forEach(button => on(button, 'click', () => closeModal(button.dataset.closeModal)));
  document.querySelectorAll('.modal-overlay').forEach(modal => on(modal, 'click', event => { if (event.target === modal) closeModal(modal.id); }));
  on(document, 'keydown', event => {
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
  }, { required: true, feature: 'global keyboard navigation' });
  on(window, 'beforeunload', event => {
    if (!state.sourceDirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
  on(window, 'popstate', () => {
    const hashView = window.location.hash.slice(1);
    if (hashView === 'bot-workspace') return;
    if (['dashboard', 'bots', 'tournaments'].includes(hashView)) {
      if (hashView === 'tournaments' && state.user?.role === 'competitor') state.tournamentScope = 'discoverable';
      navigate(hashView, { history: false });
    } else if (state.activeView === 'bot-workspace') navigate('bots', { history: false });
  }, { required: true, feature: 'history navigation' });
  on('#btn-replay-start', 'click', () => { stopReplayPlayback(); goToReplayTurn(-1); }); on('#btn-replay-prev', 'click', () => { stopReplayPlayback(); goToReplayTurn(state.replayMoveIndex - 1); }); on('#btn-replay-next', 'click', () => { stopReplayPlayback(); goToReplayTurn(state.replayMoveIndex + 1); }); on('#btn-replay-end', 'click', () => { stopReplayPlayback(); if (state.replay) goToReplayTurn(state.replay.moves.length - 1); });
}

// Clearer tournament schedule presentation: use explicit labels, winner emphasis,
// and a compact match summary so the table can be understood at a glance.
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
      if (pairing.matchResult?.series) winner += ` · BO3 ${pairing.matchResult.series.winsA}-${pairing.matchResult.series.winsB}`;

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
        const unavailableReplay = actionButton('Xem diễn biến', () => {}, `replay-unavailable:${tournament.tournamentId}:${pairing.pairingId}`, 'secondary-btn');
        unavailableReplay.disabled = true;
        unavailableReplay.title = 'Trận lỗi không có replay hợp lệ';
        actionCell.appendChild(unavailableReplay);
      }
      if (pairing.status === 'failed' && state.user?.role === 'organizer') {
        actionCell.appendChild(actionButton('Chạy lại trận', () => retryTournamentPairing(tournament.tournamentId, pairing.pairingId), `retry:${tournament.tournamentId}:${pairing.pairingId}`, 'primary-btn tournament-retry-action'));
      }
      if (pairing.matchId && pairing.status === 'in_progress' && (state.user?.role === 'organizer' || state.spectatorMode)) {
        actionCell.appendChild(actionButton('Xem trực tiếp', () => openLiveMatch(tournament.tournamentId, pairing.matchId), `live:${pairing.matchId}`));
      } else if (pairing.matchId && pairing.status !== 'failed') {
        actionCell.appendChild(actionButton('Xem chi tiết', () => playReplay(tournament.tournamentId, pairing.matchId), `replay:${pairing.matchId}`));
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
        const unavailableReplay = actionButton('Xem diễn biến', () => {}, `replay-unavailable:${tournament.tournamentId}:${pairing.pairingId}`, 'secondary-btn');
        unavailableReplay.disabled = true;
        unavailableReplay.title = 'Trận lỗi không có replay hợp lệ';
        footer.appendChild(unavailableReplay);
      }
      if (pairing.status === 'failed' && state.user?.role === 'organizer') footer.appendChild(actionButton('Chạy lại trận', () => retryTournamentPairing(tournament.tournamentId, pairing.pairingId), `retry:${tournament.tournamentId}:${pairing.pairingId}`, 'primary-btn tournament-retry-action'));
      footer.appendChild(create('span', { className: 'schedule-card-winner', text: isBye ? 'Miễn đấu' : `Đội thắng: ${winner}` }));
      if (pairing.matchId && pairing.status === 'in_progress' && (state.user?.role === 'organizer' || state.spectatorMode)) {
        footer.appendChild(actionButton('Xem trực tiếp', () => openLiveMatch(tournament.tournamentId, pairing.matchId), `live:${pairing.matchId}`));
      }
      else if (pairing.matchId) footer.appendChild(actionButton('Xem chi tiết', () => playReplay(tournament.tournamentId, pairing.matchId), `replay:${pairing.matchId}`));
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
      if (winner) winner.textContent = `${winner.textContent.replace(/\s*[·Â·].*$/, '')} · T\u1ec9 s\u1ed1: ${score}`;
    });
  });
}

repairMojibakeDom();
bindEvents();
if (window.MutationObserver) {
  const mojibakeObserver = new MutationObserver(() => repairMojibakeDom());
  mojibakeObserver.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder'] });
}
document.querySelectorAll('.bottom-nav [data-target]').forEach(button => bindEvent(button, 'click', () => {
  state.tournamentScope = button.dataset.target === 'my-tournaments' ? 'mine' : 'discoverable';
  navigate(button.dataset.target === 'my-tournaments' ? 'tournaments' : button.dataset.target);
}));
if (window.ResizeObserver) {
  const editor = $('#bot-source-editor');
  if (editor) new ResizeObserver(updateEditorMetrics).observe(editor);
}
updateEditorMetrics();
setAuthMode('login', false); setupReplayCoordinates(); void restoreSession();
setInterval(() => {
  if (state.user) void refreshQueueStats();
  if (state.activeView === 'tournament-detail' && state.detailStatus === 'running' && !state.detailRefreshInFlight) {
    state.detailRefreshInFlight = true;
    void refreshTournamentDetail().finally(() => { state.detailRefreshInFlight = false; });
  }
}, 5000);
