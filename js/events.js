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
    navigate(link.dataset.target);
  }));
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
  on('#bot-source-editor', 'input', () => setSourceDirty(true));
  on('#bot-github-url', 'input', () => setSourceDirty(true));
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
  document.querySelectorAll('[data-close-modal]').forEach(button => on(button, 'click', () => closeModal(button.dataset.closeModal)));
  document.querySelectorAll('.modal-overlay').forEach(modal => on(modal, 'click', event => { if (event.target === modal) closeModal(modal.id); }));
  on(document, 'keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(modal => closeModal(modal.id));
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
  state.tournamentScope = button.dataset.target === 'my-tournaments' ? 'mine' : 'discoverable';
  navigate(button.dataset.target === 'my-tournaments' ? 'tournaments' : button.dataset.target);
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
