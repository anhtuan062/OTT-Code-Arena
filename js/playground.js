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

  loadPlaygroundBotsList();
  setupPlaygroundCode();
  setupPlaygroundPiecePickerTokens();
  renderPlaygroundBoard();
  setupPlaygroundEvents();
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
  select.replaceChildren(create('option', { value: '', text: 'Bản nháp tự do (hoặc mã hiện tại)' }));

  bots.forEach(bot => {
    select.appendChild(create('option', {
      value: bot.id,
      text: `${bot.name} (${bot.selectedRevision?.runtimeId === 'python3' ? 'Python 3' : 'C++17'})`
    }));
  });

  if (currentVal && bots.some(b => b.id === currentVal)) {
    select.value = currentVal;
  }
}

function setupPlaygroundCode() {
  const codeArea = $('#playground-code');
  const runtimeSelect = $('#playground-runtime-selector');
  if (!codeArea || !runtimeSelect) return;

  // Nếu người dùng vừa từ workspace sang và có draft
  if (state.practiceDraft?.source && !codeArea.value.trim()) {
    codeArea.value = state.practiceDraft.source;
    if (state.practiceDraft.runtimeId) {
      runtimeSelect.value = state.practiceDraft.runtimeId;
    }
  } else if (!codeArea.value.trim()) {
    const runtime = runtimeSelect.value || 'cpp';
    codeArea.value = PLAYGROUND_STARTER_CODE[runtime] || PLAYGROUND_STARTER_CODE.cpp;
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
}

function renderPlaygroundBoard() {
  const element = $('#playground-board');
  const columns = $('#playground-columns');
  const rows = $('#playground-rows');
  if (!element || !columns || !rows) return;

  clear(element);
  clear(columns);
  clear(rows);

  'abcdefghi'.split('').forEach(col => columns.appendChild(create('span', { text: col })));
  for (let r = 0; r < 9; r += 1) rows.appendChild(create('span', { text: String(r + 1) }));

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

  const codeArea = $('#playground-code');
  const source = codeArea?.value || '';
  if (!source.trim()) {
    setPlaygroundToast('Hãy nhập mã nguồn Bot trước khi kiểm thử.', 'error');
    return;
  }

  const runtimeSelect = $('#playground-runtime-selector');
  const runtimeId = runtimeSelect?.value || 'cpp';
  const botSelect = $('#playground-bot-selector');
  const selectedBotId = botSelect?.value || '';

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
    if (selectedBotId) {
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
      setPlaygroundToast(`Test thành công! Bot đã chọn nước đi ${move.from} → ${move.to}.`, 'info');

      // Kích hoạt animation nước đi trên bàn cờ
      animatePlaygroundMove(move.from, move.to, move.piece_id, result.capture);

      addPlaygroundHistoryEntry({
        success: true,
        summary: `Đi từ ${move.from} → ${move.to}`,
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

  $('#playground-bot-selector')?.addEventListener('change', async (e) => {
    const botId = e.target.value;
    if (!botId) return;

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
        if (revData?.runtimeId) {
          const runtimeSelect = $('#playground-runtime-selector');
          if (runtimeSelect) runtimeSelect.value = revData.runtimeId;
        }
        if (typeof revData?.source === 'string') {
          const codeArea = $('#playground-code');
          if (codeArea) {
            codeArea.value = revData.source;
            updatePlaygroundCodeStats();
          }
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
