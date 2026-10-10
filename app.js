const API_URL = '/api';
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
  editingBot: null,
  deletingBot: null,
  botDialogRevision: 0,
  deleteDialogRevision: 0,
  tournaments: [],
  tournamentSearch: '',
  pendingTournamentAction: null,
  tournamentActionRevision: 0,
  tournamentListError: null,
  tournamentDialogRevision: 0,
  registrationDialogRevision: 0,
  replayTimer: null,
  replaySpeed: 800,
  replayRevision: 0,
  replayMatchId: null,
  replayContext: null,
  replayLoading: false,
  replayPlaybackToken: 0,
};

const $ = (selector, root = document) => root.querySelector(selector);
const create = (tag, options = {}) => {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  if (options.type) element.type = options.type;
  if (options.attrs) Object.entries(options.attrs).forEach(([name, value]) => element.setAttribute(name, String(value)));
  return element;
};
const clear = (element) => element.replaceChildren();
const textCell = (text, tag = 'td') => create(tag, { text });

function icon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}

function statusBadge(status) {
  const normalized = safeStatusClass(status);
  return create('span', {
    className: `status-badge status-${normalized}`,
    text: normalized.replaceAll('_', ' ').toUpperCase(),
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
  if (button) button.disabled = true;
  try { return await action(); }
  catch (error) {
    if (!error?.notified) showToast(error?.message || 'Action failed. Please try again.', 'error');
    return undefined;
  } finally {
    state.pending.delete(key);
    if (button) button.disabled = false;
  }
}

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  if (!container) return;
  const toast = create('div', { className: `toast toast-${type}`, attrs: { role: type === 'error' ? 'alert' : 'status' } });
  toast.appendChild(create('span', { text: message }));
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function renderMessage(container, message, retry) {
  clear(container);
  const wrapper = create('div', { className: 'ui-message' });
  wrapper.appendChild(create('p', { text: message }));
  if (retry) wrapper.appendChild(actionButton('Try again', retry, `retry:${container.id}`));
  container.appendChild(wrapper);
}

function renderTableMessage(tbody, message, columns, retry) {
  if (tbody.tagName !== 'TBODY') return renderMessage(tbody, message, retry);
  clear(tbody);
  const row = create('tr');
  const cell = create('td', { text: message, attrs: { colspan: columns } });
  cell.className = 'table-message';
  if (retry) cell.appendChild(actionButton('Try again', retry, `retry:${tbody.parentElement?.id || 'table'}`));
  row.appendChild(cell);
  tbody.appendChild(row);
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  state.modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  const focusable = modal.querySelector('input, select, button');
  if (focusable instanceof HTMLElement) focusable.focus();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (state.modalReturnFocus?.isConnected) state.modalReturnFocus.focus();
  state.modalReturnFocus = null;
  if (id === 'add-bot-modal') { state.botDialogRevision += 1; state.editingBot = null; clearBotFormError(); }
  if (id === 'delete-bot-modal') { state.deleteDialogRevision += 1; state.deletingBot = null; }
  if (id === 'add-tourney-modal') { state.tournamentDialogRevision += 1; $('#tournament-form-error').textContent = ''; $('#tournament-form-error').hidden = true; }
  if (id === 'register-bot-tourney-modal') { state.registrationDialogRevision += 1; $('#registration-form-error').textContent = ''; $('#registration-form-error').hidden = true; }
  if (id === 'tournament-action-modal') { state.tournamentActionRevision += 1; state.pendingTournamentAction = null; }
}

function trapModalFocus(event) {
  if (event.key !== 'Tab') return;
  const modal = document.querySelector('.modal-overlay.open');
  if (!modal) return;
  const focusable = [...modal.querySelectorAll('input, select, button:not([disabled])')];
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
  toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
}

function closeMobileNavigation() {
  const sidebar = $('#app-nav');
  const backdrop = $('#sidebar-backdrop');
  const toggle = $('#mobile-menu-toggle');
  if (!sidebar || !backdrop || !toggle) return;
  sidebar.classList.remove('open');
  backdrop.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open navigation');
}

function isCurrentView(view, authRevision, viewRevision, tournamentId) {
  return state.user && state.authRevision === authRevision && state.viewRevision === viewRevision && state.activeView === view
    && (tournamentId === undefined || state.tournamentId === tournamentId);
}

function navigate(view) {
  if (view !== 'replay-view') stopReplayPlayback();
  const target = document.getElementById(view);
  if (!target) return;
  state.activeView = view;
  state.viewRevision += 1;
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(link => {
    const active = link.dataset.target === view;
    link.classList.toggle('active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });
  const pageTitles = { dashboard: 'Dashboard', bots: 'Bots', tournaments: 'Tournaments', 'tournament-detail': 'Tournament details', 'replay-view': 'Match replay' };
  const pageTitle = $('#page-title');
  if (pageTitle) pageTitle.textContent = pageTitles[view] || 'OTT Code Arena';
  closeMobileNavigation();
  target.classList.add('active');
  if (view === 'dashboard') void loadDashboard();
  if (view === 'bots') void loadBots();
  if (view === 'tournaments') void loadTournaments();
}

function openTournamentDialog() {
  state.tournamentDialogRevision += 1;
  $('#tournament-form-error').textContent = ''; $('#tournament-form-error').hidden = true;
  openModal('add-tourney-modal');
}

function openRegistrationDialog() {
  state.registrationDialogRevision += 1;
  $('#registration-form-error').textContent = ''; $('#registration-form-error').hidden = true;
  openModal('register-bot-tourney-modal');
}

function setAuthenticated(user, csrfToken) {
  state.authRevision += 1;
  state.user = user;
  state.csrfToken = csrfToken;
  $('#auth-screen').hidden = true;
  $('#app-nav').hidden = false;
  $('#app-topbar').hidden = false;
  $('#current-user').textContent = user.username;
  $('#dashboard-username').textContent = user.username;
  $('#user-avatar').textContent = user.username.slice(0, 1).toUpperCase();
  navigate('dashboard');
}

function showAuthScreen() {
  stopReplayPlayback();
  state.authRevision += 1;
  state.viewRevision += 1;
  state.user = null;
  state.csrfToken = null;
  state.tournamentId = null;
  state.replay = null;
  state.replayContext = null;
  state.replayMatchId = null;
  document.querySelectorAll('.modal-overlay.open').forEach(modal => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  });
  state.modalReturnFocus = null;
  state.activeView = 'auth-screen';
  $('#auth-screen').hidden = false;
  $('#app-nav').hidden = true;
  $('#app-topbar').hidden = true;
  closeMobileNavigation();
  document.querySelectorAll('.page:not(#auth-screen)').forEach(page => page.classList.remove('active'));
  $('#auth-screen').classList.add('active');
}

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (state.csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['x-csrf-token'] = state.csrfToken;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, method, headers, credentials: 'same-origin' });
  } catch {
    throw new Error('Network error. Check your connection and try again.');
  }
  let body = null;
  if (response.status !== 204) {
    try { body = await response.json(); }
    catch { throw new Error(response.ok ? 'Invalid server response.' : `Request failed (${response.status}).`); }
  }
  if (!response.ok) {
    if (response.status === 401) showAuthScreen();
    const error = new Error(body?.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function api(path, options = {}) {
  try { return await request(path, options); }
  catch (error) {
    state.error = error.message || 'Request failed.';
    if (error && typeof error === 'object') error.notified = true;
    showToast(state.error, 'error');
    throw error;
  }
}

async function restoreSession() {
  $('#auth-status').textContent = 'Restoring your secure session…';
  try {
    const result = await request('/auth/me');
    setAuthenticated(result.user, result.csrfToken);
  } catch {
    $('#auth-status').textContent = 'Sign in to manage your bots and tournaments.';
    showAuthScreen();
  }
}

async function refreshQueueStats() {
  if (!state.user) return;
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  try {
    const stats = await request('/system/queue');
    if (!isCurrentView(state.activeView, authRevision, viewRevision)) return;
    $('#queue-stats').textContent = `Queue: ${stats.activeCount}/${stats.maxConcurrent} active, ${stats.queueLength} queued`;
    $('#dash-queue-value').textContent = `${stats.activeCount} / ${stats.maxConcurrent}`;
    $('#dash-queue-detail').textContent = stats.queueLength ? `${stats.queueLength} waiting` : 'No bots waiting';
  } catch {
    if (isCurrentView(state.activeView, authRevision, viewRevision)) {
      $('#queue-stats').textContent = 'Queue status unavailable';
      $('#dash-queue-value').textContent = '—';
      $('#dash-queue-detail').textContent = 'Queue status unavailable';
    }
  }
}

async function loadDashboard() {
  const table = $('#dash-recent-tourneys tbody');
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  state.loading.add('dashboard');
  state.error = null;
  $('#dash-tourney-count').textContent = '—';
  $('#dash-bot-count').textContent = '—';
  $('#dash-tourney-detail').textContent = 'Loading dashboard data';
  $('#dash-bot-detail').textContent = 'Loading dashboard data';
  renderTableMessage(table, 'Loading tournaments…', 5);
  void refreshQueueStats();
  try {
    const [tournaments, bots] = await Promise.all([request('/tournaments'), request('/bots')]);
    if (!isCurrentView('dashboard', authRevision, viewRevision)) return;
    $('#dash-tourney-count').textContent = tournaments.length;
    $('#dash-bot-count').textContent = bots.length;
    $('#dash-tourney-detail').textContent = tournaments.length ? 'In your workspace' : 'Create your first event';
    $('#dash-bot-detail').textContent = bots.length ? 'Ready for competition' : 'Register your first bot';
    clear(table);
    if (!tournaments.length) return renderTableMessage(table, 'No tournaments yet. Create one to get started.', 5);
    tournaments.slice(0, 5).forEach(tournament => {
      const row = create('tr');
      row.append(textCell(tournament.name), textCell(tournament.format), (() => { const cell = create('td'); cell.appendChild(statusBadge(tournament.status)); return cell; })(), textCell(tournament.participants.length));
      const action = create('td'); action.appendChild(actionButton('View', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`)); row.appendChild(action);
      table.appendChild(row);
    });
  } catch (error) {
    if (isCurrentView('dashboard', authRevision, viewRevision)) {
      state.error = error.message || 'Unable to load dashboard.';
      $('#dash-tourney-count').textContent = '—';
      $('#dash-bot-count').textContent = '—';
      $('#dash-tourney-detail').textContent = 'Unable to load data';
      $('#dash-bot-detail').textContent = 'Unable to load data';
      renderTableMessage(table, state.error, 5, loadDashboard);
    }
  }
  finally { state.loading.delete('dashboard'); }
}

async function loadBots() {
  const list = $('#bots-list');
  const table = list;
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  state.loading.add('bots');
  state.error = null;
  renderTableMessage(table, 'Loading bots…', 5);
  try {
    const bots = await request('/bots');
    if (!isCurrentView('bots', authRevision, viewRevision)) return;
    state.bots = bots;
    renderBotList();
  } catch (error) { if (isCurrentView('bots', authRevision, viewRevision)) { state.error = error.message || 'Unable to load bots.'; $('#bots-count').textContent = 'Bots unavailable'; renderMessage(list, state.error, loadBots); } }
  finally { state.loading.delete('bots'); }
}

function renderBotList() {
  const list = $('#bots-list');
  const query = state.botSearch.trim().toLocaleLowerCase();
  const bots = state.bots.filter(bot => bot.name.toLocaleLowerCase().includes(query));
  clear(list);
  $('#bots-count').textContent = state.bots.length === 1 ? '1 bot' : `${state.bots.length} bots`;
  if (!state.bots.length) return renderBotEmpty(list, 'No bots yet', 'Create a bot configuration to make it available for tournament registration.');
  if (!bots.length) return renderBotEmpty(list, 'No matching bots', 'Try a different name or clear the search field.', false);
  bots.forEach(bot => {
    const card = create('article', { className: 'bot-card' });
    const header = create('div', { className: 'bot-card-header' });
    const heading = create('div'); heading.append(create('h3', { className: 'bot-card-title', text: bot.name }), create('span', { className: 'bot-card-id', text: bot.id }));
    header.appendChild(heading); card.appendChild(header);
    const config = create('div', { className: 'bot-config' });
    [['Command', bot.command], ['Arguments', bot.args.length ? bot.args.join(' ') : 'No arguments']].forEach(([label, value]) => {
      const row = create('div', { className: 'bot-config-row' }); row.append(create('span', { text: label }), create('code', { text: value })); config.appendChild(row);
    });
    card.appendChild(config);
    const footer = create('div', { className: 'bot-card-footer' });
    const date = new Date(bot.registeredAt); footer.appendChild(create('small', { text: Number.isNaN(date.getTime()) ? 'Registration date unavailable' : `Registered ${date.toLocaleDateString()}` }));
    const actions = create('div', { className: 'bot-actions' });
    actions.append(actionButton('Edit', () => openBotDialog(bot), `edit-bot:${bot.id}`, 'secondary-btn bot-action'), actionButton('Delete', () => openDeleteBotDialog(bot), `delete-bot:${bot.id}`, 'secondary-btn bot-action bot-delete'));
    footer.appendChild(actions); card.appendChild(footer); list.appendChild(card);
  });
}

function renderBotEmpty(list, title, message, showAction = true) {
  clear(list);
  const empty = create('div', { className: 'ui-message' });
  empty.append(create('strong', { className: 'bot-empty-title', text: title }), create('p', { className: 'bot-empty-copy', text: message }));
  if (showAction) empty.appendChild(actionButton('Create bot', () => openBotDialog(), 'empty-create-bot', 'primary-btn bot-empty-action'));
  list.appendChild(empty);
}

function showBotFormError(message) { const error = $('#bot-form-error'); error.textContent = message; error.hidden = false; }
function clearBotFormError() { const error = $('#bot-form-error'); error.textContent = ''; error.hidden = true; }

function botInput() {
  const name = $('#new-bot-name').value.trim();
  const command = $('#new-bot-cmd').value;
  const rawArguments = $('#new-bot-args').value;
  const args = rawArguments === '' ? [] : rawArguments.split(',').map(value => value.trim());
  if (!name || name.length > 50) return { error: 'Bot name must be between 1 and 50 characters.' };
  if (!['node', 'python', 'python3'].includes(command)) return { error: 'Choose an approved command.' };
  if (args.length > 32 || args.some(arg => arg.length > 256)) return { error: 'Use no more than 32 arguments, each up to 256 characters.' };
  if (args.some(arg => arg.startsWith('-') && arg !== '--fast')) return { error: 'Only the --fast argument flag is allowed.' };
  if (args.some(arg => arg.includes('..') || /^(?:[A-Za-z]:[\\/]|[\\/])/.test(arg))) return { error: 'Absolute paths and parent-path segments are not allowed.' };
  return { name, command, args };
}

function openBotDialog(bot = null) {
  state.botDialogRevision += 1;
  state.editingBot = bot;
  clearBotFormError();
  $('#add-bot-title').textContent = bot ? 'EDIT BOT' : 'CREATE BOT';
  $('#bot-dialog-description').textContent = bot ? 'Update this saved runtime command and its arguments.' : 'Store an approved runtime command and its arguments for tournament registration.';
  $('#submit-bot').textContent = bot ? 'Save changes' : 'Create bot';
  $('#new-bot-name').value = bot?.name || '';
  $('#new-bot-cmd').value = bot?.command || 'node';
  $('#new-bot-args').value = bot?.args.join(', ') || '';
  openModal('add-bot-modal');
}

async function submitBot() {
  const button = $('#submit-bot');
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const dialogRevision = state.botDialogRevision;
  const editingBot = state.editingBot;
  const isBotView = () => isCurrentView('bots', authRevision, viewRevision)
    || isCurrentView('dashboard', authRevision, viewRevision);
  const input = botInput();
  clearBotFormError();
  if (input.error) return showBotFormError(input.error);
  await runPending(editingBot ? `save-bot:${editingBot.id}` : 'create-bot', button, async () => {
    try { await api(editingBot ? `/bots/${editingBot.id}` : '/bots', { method: editingBot ? 'PUT' : 'POST', body: JSON.stringify(input) }); }
    catch (error) { if (isBotView() && state.botDialogRevision === dialogRevision) showBotFormError(error.message || 'Unable to save bot.'); throw error; }
    if (!isBotView()) return;
    if (state.botDialogRevision !== dialogRevision) { void loadBots(); return; }
    closeModal('add-bot-modal');
    showToast(editingBot ? 'Bot updated successfully.' : 'Bot registered successfully.', 'success');
    if (state.activeView === 'bots') await loadBots();
    else await loadDashboard();
  });
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
    showToast('Bot deleted.', 'success');
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
  renderMessage(list, 'Loading tournaments…');
  try {
    const tournaments = await request('/tournaments');
    if (!isCurrentView('tournaments', authRevision, viewRevision)) return;
    state.tournaments = tournaments;
    renderTournamentList();
  } catch (error) { if (isCurrentView('tournaments', authRevision, viewRevision)) { state.error = error.message || 'Unable to load tournaments.'; state.tournamentListError = state.error; $('#tournaments-count').textContent = 'Tournaments unavailable'; renderMessage(list, state.error, loadTournaments); } }
  finally { state.loading.delete('tournaments'); }
}

function renderTournamentList() {
  const list = $('#tournaments-list');
  if (state.tournamentListError) { $('#tournaments-count').textContent = 'Tournaments unavailable'; return renderMessage(list, state.tournamentListError, loadTournaments); }
  const query = state.tournamentSearch.trim().toLocaleLowerCase();
  const tournaments = state.tournaments.filter(tournament => tournament.name.toLocaleLowerCase().includes(query));
  clear(list);
  $('#tournaments-count').textContent = state.tournaments.length === 1 ? '1 tournament' : `${state.tournaments.length} tournaments`;
  if (!state.tournaments.length) return renderTournamentEmpty('No tournaments yet', 'Create a tournament to register bots and begin a competition.');
  if (!tournaments.length) return renderTournamentEmpty('No matching tournaments', 'Try another name or clear the search field.', false);
  tournaments.forEach(tournament => {
    const card = create('article', { className: 'tournament-card' });
    const heading = create('div'); heading.append(create('h3', { text: tournament.name }), statusBadge(tournament.status)); card.appendChild(heading);
    const meta = create('div', { className: 'tournament-card-meta' });
    meta.append(create('span', { text: 'Single round robin' }), create('span', { text: `${tournament.participants?.length || 0} participants` })); card.appendChild(meta);
    const footer = create('div', { className: 'tournament-card-footer' }); footer.append(create('small', { text: tournament.tournamentId })); footer.appendChild(actionButton('View details', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`, 'secondary-btn tournament-view-btn')); card.appendChild(footer); list.appendChild(card);
  });
}

function renderTournamentEmpty(title, message, showAction = true) {
  const list = $('#tournaments-list'); clear(list);
  const empty = create('div', { className: 'ui-message' }); empty.append(create('strong', { className: 'bot-empty-title', text: title }), create('p', { className: 'bot-empty-copy', text: message }));
  if (showAction) empty.appendChild(actionButton('Create tournament', openTournamentDialog, 'empty-create-tournament', 'primary-btn bot-empty-action'));
  list.appendChild(empty);
}

async function submitNewBot() {
  await submitBot();
}

async function submitNewTournament() {
  const button = $('#submit-tournament');
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const dialogRevision = state.tournamentDialogRevision;
  const name = $('#new-tourney-name').value.trim();
  const error = $('#tournament-form-error'); error.textContent = ''; error.hidden = true;
  if (!name || name.length > 100) { error.textContent = 'Tournament name must be between 1 and 100 characters.'; error.hidden = false; return; }
  await runPending('create-tournament', button, async () => {
    let result;
    try { result = await api('/tournaments', { method: 'POST', body: JSON.stringify({ name }) }); }
    catch (requestError) { if (state.user && state.authRevision === authRevision && state.tournamentDialogRevision === dialogRevision) { error.textContent = requestError.message || 'Unable to create tournament.'; error.hidden = false; } throw requestError; }
    if (!state.user || state.authRevision !== authRevision || state.viewRevision !== viewRevision) return;
    if (state.tournamentDialogRevision !== dialogRevision) return;
    closeModal('add-tourney-modal'); $('#new-tourney-name').value = '';
    showToast('Tournament created.', 'success'); await viewTournament(result.tournamentId);
  });
}

async function viewTournament(id) {
  state.tournamentId = id;
  navigate('tournament-detail');
  await refreshTournamentDetail();
}

function appendTournamentAction(container, tournamentId, authRevision, viewRevision, label, action, confirmation = false) {
  const button = actionButton(label, () => confirmation ? confirmTournamentAction(tournamentId, authRevision, viewRevision, action, label) : tournamentAction(tournamentId, authRevision, viewRevision, action), `tournament:${tournamentId}:${action}`, `secondary-btn tournament-action${action === 'cancel' ? ' tournament-action-danger' : ''}`);
  container.appendChild(button);
}

async function refreshTournamentDetail() {
  if (!state.tournamentId) return;
  const tournamentId = state.tournamentId;
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  try {
    const tournament = await request(`/tournaments/${tournamentId}`);
    if (!isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) return;
    $('#td-name').textContent = tournament.name;
    const badge = $('#td-status'); badge.className = `status-badge status-${safeStatusClass(tournament.status)}`; badge.textContent = String(tournament.status).replaceAll('_', ' ').toUpperCase();
    $('#td-pcount').textContent = tournament.participants.length;
    const participants = $('#td-participants'); clear(participants);
    if (!tournament.participants.length) participants.appendChild(create('li', { text: 'No participants registered yet.' }));
    tournament.participants.forEach(participant => {
      const item = create('li'); item.style.padding = '8px 0'; item.style.borderBottom = '1px solid var(--border-light)';
      const name = create('strong', { text: participant.name }); const bot = create('span', { text: ` (${participant.bot.botId})` }); bot.style.color = 'var(--text-faint)'; bot.style.fontSize = '.8rem';
      item.append(name, bot); participants.appendChild(item);
    });

    const actions = $('#td-actions'); clear(actions);
    const register = $('#btn-register-bot'); register.hidden = tournament.status !== 'registration_open';
    if (tournament.status === 'draft') appendTournamentAction(actions, tournamentId, authRevision, viewRevision, 'Open registration', 'open_registration');
    if (tournament.status === 'registration_open') {
      if (tournament.rounds.length) appendTournamentAction(actions, tournamentId, authRevision, viewRevision, 'Start tournament', 'start');
      else appendTournamentAction(actions, tournamentId, authRevision, viewRevision, 'Generate schedule', 'generate_schedule');
    }
    if (tournament.status === 'running') appendTournamentAction(actions, tournamentId, authRevision, viewRevision, 'Run all matches', 'run_all', true);
    if (tournament.status === 'draft' || tournament.status === 'registration_open' || tournament.status === 'running') appendTournamentAction(actions, tournamentId, authRevision, viewRevision, 'Cancel tournament', 'cancel', true);

    renderStandings(tournament.standings);
    renderSchedule(tournament);
    if (tournament.status === 'completed' || tournament.status === 'running') {
      request(`/tournaments/${tournamentId}/stats`).then(stats => {
        if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) $('#td-stats').textContent = `Matches: ${stats.completedMatches}/${stats.totalMatches} | Avg Turns: ${stats.averageTurns}`;
      }).catch(() => {
        if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) $('#td-stats').textContent = '';
      });
    } else $('#td-stats').textContent = '';
  } catch (error) {
    if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) {
      $('#td-name').textContent = 'Tournament unavailable';
      $('#td-status').className = 'status-badge status-unknown'; $('#td-status').textContent = 'UNAVAILABLE';
      $('#td-pcount').textContent = '0'; clear($('#td-participants')); clear($('#td-actions')); clear($('#td-standings tbody')); $('#td-stats').textContent = '';
      $('#btn-register-bot').hidden = true;
      renderMessage($('#td-schedule'), error.message || 'Unable to load tournament.', refreshTournamentDetail);
    }
  }
}

function renderStandings(standings) {
  const tbody = $('#td-standings tbody'); clear(tbody);
  if (!standings.length) return renderTableMessage(tbody, 'Standings appear after participants are registered.', 7);
  standings.forEach((standing, index) => {
    const row = create('tr');
    row.append(textCell(index + 1), textCell(standing.participantName), textCell(standing.matchesPlayed), textCell(standing.wins), textCell(standing.draws), textCell(standing.losses), textCell(standing.points));
    tbody.appendChild(row);
  });
}

function renderSchedule(tournament) {
  const schedule = $('#td-schedule'); clear(schedule);
  if (!tournament.rounds.length) return renderMessage(schedule, 'A schedule will appear after registration is complete.');
  tournament.rounds.forEach(round => {
    const section = create('section', { className: 'schedule-round' });
    const heading = create('h4', { text: `Round ${round.roundNumber}` }); section.appendChild(heading);
    const table = create('table', { className: 'data-table' });
    const head = create('thead'); const headRow = create('tr'); ['Match', 'Player A', 'Player B', 'Status', 'Winner', 'Action'].forEach(label => headRow.appendChild(textCell(label, 'th'))); head.appendChild(headRow);
    const body = create('tbody');
    round.pairings.forEach(pairing => {
      const playerA = tournament.participants.find(participant => participant.participantId === pairing.participantA)?.name || pairing.participantA;
      const playerB = pairing.participantB ? (tournament.participants.find(participant => participant.participantId === pairing.participantB)?.name || pairing.participantB) : 'BYE';
      let winner = '-'; if (pairing.matchResult?.winner === 'A') winner = playerA; else if (pairing.matchResult?.winner === 'B') winner = playerB; else if (pairing.matchResult?.winner === 'draw') winner = 'Draw';
      const row = create('tr'); row.append(textCell(pairing.pairingId), textCell(playerA), textCell(playerB));
      const status = create('td'); status.appendChild(statusBadge(pairing.status)); row.appendChild(status); row.appendChild(textCell(winner));
      const action = create('td'); if (pairing.matchId) action.appendChild(actionButton('Watch', () => playReplay(tournament.tournamentId, pairing.matchId), `replay:${pairing.matchId}`)); row.appendChild(action); body.appendChild(row);
    });
    table.append(head, body); section.appendChild(table); schedule.appendChild(section);
  });
}

function confirmTournamentAction(tournamentId, authRevision, viewRevision, action, label) {
  state.pendingTournamentAction = { tournamentId, authRevision, viewRevision, action };
  state.tournamentActionRevision += 1;
  $('#tournament-action-title').textContent = label.toUpperCase();
  $('#tournament-action-copy').textContent = action === 'cancel' ? 'Cancel this tournament? This cannot be undone from the workspace.' : 'Queue all remaining matches for execution? Match execution follows the server security policy.';
  $('#confirm-tournament-action').textContent = label;
  openModal('tournament-action-modal');
}

async function tournamentAction(tournamentId, authRevision, viewRevision, action) {
  await api(`/tournaments/${tournamentId}/action`, { method: 'POST', body: JSON.stringify({ action }) });
  if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) {
    showToast(`Action ${action.replaceAll('_', ' ')} successful.`, 'success');
    await refreshTournamentDetail();
  }
}

async function submitTournamentRegistration() {
  const button = $('#submit-registration');
  const tournamentId = state.tournamentId;
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const dialogRevision = state.registrationDialogRevision;
  const participantName = $('#reg-part-name').value.trim();
  const botId = $('#reg-bot-select').value;
  const error = $('#registration-form-error'); error.textContent = ''; error.hidden = true;
  if (!participantName || !botId) { error.textContent = 'Choose a bot and enter a participant name.'; error.hidden = false; return; }
  await runPending('register-participant', button, async () => {
    try { await api(`/tournaments/${tournamentId}/register`, { method: 'POST', body: JSON.stringify({ participantName, botId }) }); }
    catch (requestError) { if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId) && state.registrationDialogRevision === dialogRevision) { error.textContent = requestError.message || 'Unable to register bot.'; error.hidden = false; } throw requestError; }
    if (!isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) return;
    if (state.registrationDialogRevision !== dialogRevision) return;
    closeModal('register-bot-tourney-modal'); $('#reg-part-name').value = ''; showToast('Registered successfully.', 'success'); await refreshTournamentDetail();
  });
}

async function populateBotSelect() {
  const select = $('#reg-bot-select'); clear(select);
  const authRevision = state.authRevision;
  const tournamentId = state.tournamentId;
  const viewRevision = state.viewRevision;
  try {
    const bots = await request('/bots');
    if (!isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) return false;
    if (!bots.length) { select.appendChild(create('option', { text: 'No bots available', attrs: { value: '' } })); return true; }
    bots.forEach(bot => select.appendChild(create('option', { text: `${bot.name} (${bot.id})`, attrs: { value: bot.id } })));
  } catch {
    if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) select.appendChild(create('option', { text: 'Unable to load bots', attrs: { value: '' } }));
  }
  return isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId);
}

const PIECE_TYPES = { dam: 'icon-piece-dam', la: 'icon-piece-la', keo: 'icon-piece-keo' };
const PIECE_LABELS = { dam: 'Rock', la: 'Paper', keo: 'Scissors' };
function stopReplayPlayback() {
  if (state.replayTimer) clearTimeout(state.replayTimer);
  state.replayTimer = null;
  state.replayPlaybackToken = (state.replayPlaybackToken || 0) + 1;
  const button = $('#btn-replay-play');
  if (button) {
    button.textContent = 'Play';
    button.setAttribute('aria-pressed', 'false');
  }
}

function closeReplay() {
  stopReplayPlayback();
  state.replay = null;
  state.replayContext = null;
  state.replayMatchId = null;
  state.replayMoveIndex = -1;
  navigate('tournament-detail');
}

function setReplayLoading(isLoading) {
  state.replayLoading = isLoading;
  const loading = $('#replay-loading');
  const content = $('#replay-content');
  if (loading) loading.hidden = !isLoading;
  if (content) content.hidden = isLoading;
}

function formatReplayReason(reason) {
  return String(reason || 'unknown').replaceAll('_', ' ');
}

function replayResultLabel(replay) {
  if (replay.winner === 'A') return 'Player A won';
  if (replay.winner === 'B') return 'Player B won';
  if (replay.winner === 'draw') return 'Draw';
  return 'No winner';
}

function isReplayShape(replay) {
  return replay && replay.initialState && Number(replay.initialState.boardSize) === 9
    && Array.isArray(replay.initialState.pieces) && Array.isArray(replay.moves)
    && replay.finalState && Number(replay.finalState.boardSize) === 9;
}

function renderReplaySummary(replay) {
  $('#r-p1-name').textContent = 'PLAYER A';
  $('#r-p2-name').textContent = 'PLAYER B';
  $('#r-result-text').textContent = `${replayResultLabel(replay)} · ${formatReplayReason(replay.terminationReason)}`;
  $('#r-winner').textContent = replayResultLabel(replay);
  $('#r-termination').textContent = formatReplayReason(replay.terminationReason);
  $('#r-protocol').textContent = String(replay.protocolVersion || 'unknown');
}

async function playReplay(tournamentId, matchId) {
  stopReplayPlayback();
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
    if (!isReplayShape(replay)) throw new Error('Replay data is invalid.');
  }
  catch (error) {
    if (state.authRevision === authRevision && state.replayRevision === replayRevision && state.activeView === 'replay-view'
      && state.replayContext?.tournamentId === tournamentId && state.replayContext?.matchId === matchId) {
      setReplayLoading(false);
      $('#replay-content').hidden = true;
      $('#replay-error-message').textContent = error.message || 'Unable to load replay.';
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
  }
  return board;
}

function renderReplayBoard(board) {
  const element = $('#r-board'); clear(element);
  const lastMove = state.replayMoveIndex >= 0 ? state.replay.moves[state.replayMoveIndex] : null;
  const boardSize = Number(board.boardSize) === 9 ? 9 : 0;
  if (!boardSize) {
    element.appendChild(create('p', { className: 'ui-message', text: 'This replay has an unsupported board size.' }));
    return;
  }
  const columns = 'abcdefghi';
  for (let row = 0; row < boardSize; row += 1) for (let col = 0; col < boardSize; col += 1) {
    const coordinate = `${columns[col]}${row + 1}`;
    const cell = create('div', { className: 'replay-cell', attrs: { role: 'gridcell', 'aria-label': `${coordinate}, empty` } });
    if (lastMove?.pieceId && lastMove.from?.row === row && lastMove.from?.col === col) cell.classList.add('move-from');
    if (lastMove?.pieceId && lastMove.to?.row === row && lastMove.to?.col === col) cell.classList.add('move-to');
    if ((row === 0 && col === 0) || (row === 8 && col === 8)) { cell.classList.add('goal'); const flag = create('span', { className: 'goal-flag' }); flag.appendChild(icon('icon-flag')); cell.appendChild(flag); }
    const piece = board.pieces.find(candidate => candidate.row === row && candidate.col === col);
    if (piece) {
      const label = `Player ${piece.player}, ${PIECE_LABELS[piece.type]}`;
      const token = create('span', { className: `replay-piece replay-player-${piece.player.toLowerCase()}`, text: piece.type === 'dam' ? 'R' : piece.type === 'la' ? 'P' : 'S', attrs: { 'aria-label': label, title: label } });
      cell.setAttribute('aria-label', `${coordinate}, ${label}`);
      cell.appendChild(token);
    }
    element.appendChild(cell);
  }
}

function goToReplayTurn(index) {
  if (!state.replay || state.activeView !== 'replay-view') return;
  state.replayMoveIndex = Math.max(-1, Math.min(index, state.replay.moves.length - 1));
  $('#r-turn-display').textContent = `${Math.max(0, state.replayMoveIndex + 1)} / ${state.replay.moves.length}`;
  const board = buildStateAt(state.replayMoveIndex); if (board) renderReplayBoard(board);
  renderReplayTimeline();
  const move = state.replayMoveIndex >= 0 ? state.replay.moves[state.replayMoveIndex] : null;
  $('#r-current-move').textContent = move?.pieceId
    ? `Turn ${move.turn}: ${replayCoordinate(move.from)} to ${replayCoordinate(move.to)}`
    : state.replayMoveIndex >= 0 ? `Turn ${move.turn}: no applied move` : 'Initial position';
}

function setupReplayCoordinates() {
  const header = $('#coord-header'); const side = $('#coord-side'); clear(header); clear(side);
  'abcdefghi'.split('').forEach(column => header.appendChild(create('span', { className: 'coord', text: column, attrs: { 'aria-hidden': 'true' } })));
  Array.from({ length: 9 }, (_, index) => index + 1).forEach(row => side.appendChild(create('span', { className: 'coord', text: row, attrs: { 'aria-hidden': 'true' } })));
}

function replayCoordinate(position) { return position ? `${'abcdefghi'[position.col] || '?'}${Number(position.row) + 1}` : '?'; }
function renderReplayTimeline() {
  const list = $('#replay-timeline'); clear(list);
  if (!state.replay?.moves.length) { list.appendChild(create('p', { className: 'ui-message', text: 'No moves were recorded for this match.' })); return; }
  state.replay.moves.forEach((move, index) => {
    const item = actionButton('', () => { stopReplayPlayback(); goToReplayTurn(index); }, `replay-seek:${index}`, 'replay-move');
    item.classList.toggle('active', index === state.replayMoveIndex);
    const label = move.pieceId ? `Turn ${move.turn} · Player ${move.player}: ${replayCoordinate(move.from)} to ${replayCoordinate(move.to)}${move.captures ? ' · capture' : ''}` : `Turn ${move.turn} · Player ${move.player}: no applied move`;
    item.textContent = label; list.appendChild(item);
  });
}

function toggleReplayPlayback() {
  if (!state.replay || state.activeView !== 'replay-view') return;
  if (state.replayTimer) return stopReplayPlayback();
  if (state.replayMoveIndex >= state.replay.moves.length - 1) goToReplayTurn(-1);
  const token = (state.replayPlaybackToken || 0) + 1;
  state.replayPlaybackToken = token;
  const replayId = state.replayMatchId;
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const tick = () => {
    if (state.replayPlaybackToken !== token || !state.replay || state.replayMatchId !== replayId
      || state.replayContext?.tournamentId !== state.tournamentId
      || !isCurrentView('replay-view', authRevision, viewRevision) || state.replayMoveIndex >= state.replay.moves.length - 1) {
      if (state.replayPlaybackToken === token) stopReplayPlayback();
      return;
    }
    goToReplayTurn(state.replayMoveIndex + 1);
    state.replayTimer = setTimeout(tick, state.replaySpeed);
  };
  $('#btn-replay-play').textContent = 'Pause';
  $('#btn-replay-play').setAttribute('aria-pressed', 'true');
  state.replayTimer = setTimeout(tick, state.replaySpeed);
}

function bindEvents() {
  document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => navigate(link.dataset.target)));
  $('#login-form').addEventListener('submit', event => { event.preventDefault(); void runPending('login', $('#login-submit'), async () => { const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: $('#login-username').value, password: $('#login-password').value }) }); setAuthenticated(result.user, result.csrfToken); }); });
  $('#register-form').addEventListener('submit', event => { event.preventDefault(); void runPending('register', $('#register-submit'), async () => { const result = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username: $('#register-username').value, password: $('#register-password').value }) }); setAuthenticated(result.user, result.csrfToken); }); });
  $('#logout-button').addEventListener('click', () => void runPending('logout', $('#logout-button'), async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { showAuthScreen(); } }));
  $('#open-bot-modal').addEventListener('click', () => openBotDialog()); $('#open-tournament-modal').addEventListener('click', openTournamentDialog);
  $('#dashboard-create-bot').addEventListener('click', () => openBotDialog()); $('#dashboard-create-tournament').addEventListener('click', openTournamentDialog);
  $('#bot-search').addEventListener('input', event => { state.botSearch = event.target.value; renderBotList(); });
  $('#tournament-search').addEventListener('input', event => { state.tournamentSearch = event.target.value; renderTournamentList(); });
  $('#confirm-delete-bot').addEventListener('click', () => void deleteBot());
  $('#confirm-tournament-action').addEventListener('click', () => { const pending = state.pendingTournamentAction; if (!pending) return; const revision = state.tournamentActionRevision; void runPending(`tournament:${pending.tournamentId}:${pending.action}`, $('#confirm-tournament-action'), async () => { await tournamentAction(pending.tournamentId, pending.authRevision, pending.viewRevision, pending.action); if (state.tournamentActionRevision === revision) closeModal('tournament-action-modal'); }); });
  $('#mobile-menu-toggle').addEventListener('click', toggleMobileNavigation); $('#sidebar-backdrop').addEventListener('click', closeMobileNavigation);
  $('#back-to-tournaments').addEventListener('click', () => navigate('tournaments')); $('#btn-register-bot').addEventListener('click', async () => { if (await populateBotSelect()) openRegistrationDialog(); });
  $('#close-replay').addEventListener('click', closeReplay); $('#btn-replay-play').addEventListener('click', toggleReplayPlayback); $('#replay-retry').addEventListener('click', retryReplay); $('#replay-speed').addEventListener('change', event => { state.replaySpeed = Number(event.target.value); if (state.replayTimer) { stopReplayPlayback(); toggleReplayPlayback(); } }); $('#submit-bot').addEventListener('click', () => void submitNewBot()); $('#submit-tournament').addEventListener('click', () => void submitNewTournament()); $('#submit-registration').addEventListener('click', () => void submitTournamentRegistration());
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
  document.querySelectorAll('.modal-overlay').forEach(modal => modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal.id); }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(modal => closeModal(modal.id));
      closeMobileNavigation();
    }
    else trapModalFocus(event);
  });
  $('#btn-replay-start').addEventListener('click', () => { stopReplayPlayback(); goToReplayTurn(-1); }); $('#btn-replay-prev').addEventListener('click', () => { stopReplayPlayback(); goToReplayTurn(state.replayMoveIndex - 1); }); $('#btn-replay-next').addEventListener('click', () => { stopReplayPlayback(); goToReplayTurn(state.replayMoveIndex + 1); }); $('#btn-replay-end').addEventListener('click', () => { stopReplayPlayback(); if (state.replay) goToReplayTurn(state.replay.moves.length - 1); });
}

bindEvents(); setupReplayCoordinates(); void restoreSession();
setInterval(() => { if (state.user) void refreshQueueStats(); if (state.activeView === 'tournament-detail') void refreshTournamentDetail(); }, 5000);
