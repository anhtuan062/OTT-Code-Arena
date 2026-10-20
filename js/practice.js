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
    const result = await request(`/bots/${revision.botId}/revisions/${revision.revisionId}/test`, {
      method: 'POST', body: JSON.stringify({ scenarioId }),
    });
    if (token !== state.practiceRequestToken || state.practiceRevision?.revisionId !== revision.revisionId) return;
    if (typeof finishPracticeProgress === 'function') finishPracticeProgress(true);
    renderPracticeResult(result);
    $('#practice-status').textContent = result.valid === true && result.accepted !== false ? 'Chạy thử thành công · Engine đã chấp nhận nước đi.' : 'Chạy thử hoàn tất.';
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

