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
  state.authRevision += 1;
  state.viewRevision += 1;
  state.user = null;
  state.csrfToken = null;
  state.tournamentId = null;
  state.replay = null;
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
  const input = botInput();
  clearBotFormError();
  if (input.error) return showBotFormError(input.error);
  await runPending(editingBot ? `save-bot:${editingBot.id}` : 'create-bot', button, async () => {
    try { await api(editingBot ? `/bots/${editingBot.id}` : '/bots', { method: editingBot ? 'PUT' : 'POST', body: JSON.stringify(input) }); }
    catch (error) { if (isCurrentView('bots', authRevision, viewRevision) && state.botDialogRevision === dialogRevision) showBotFormError(error.message || 'Unable to save bot.'); throw error; }
    if (!isCurrentView('bots', authRevision, viewRevision)) return;
    if (state.botDialogRevision !== dialogRevision) { void loadBots(); return; }
    closeModal('add-bot-modal');
    showToast(editingBot ? 'Bot updated successfully.' : 'Bot registered successfully.', 'success');
    await loadBots();
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
  const table = $('#tourneys-table tbody');
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  state.loading.add('tournaments');
  state.error = null;
  renderTableMessage(table, 'Loading tournaments…', 4);
  try {
    const tournaments = await request('/tournaments');
    if (!isCurrentView('tournaments', authRevision, viewRevision)) return;
    clear(table);
    if (!tournaments.length) return renderTableMessage(table, 'No tournaments yet. Create one to get started.', 4);
    tournaments.forEach(tournament => {
      const row = create('tr');
      row.append(textCell(tournament.tournamentId), textCell(tournament.name));
      const status = create('td'); status.appendChild(statusBadge(tournament.status)); row.appendChild(status);
      const action = create('td'); action.appendChild(actionButton('View', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`)); row.appendChild(action);
      table.appendChild(row);
    });
  } catch (error) { if (isCurrentView('tournaments', authRevision, viewRevision)) { state.error = error.message || 'Unable to load tournaments.'; renderTableMessage(table, state.error, 4, loadTournaments); } }
  finally { state.loading.delete('tournaments'); }
}

async function submitNewBot() {
  await submitBot();
}

async function submitNewTournament() {
  const button = $('#submit-tournament');
  const authRevision = state.authRevision;
  await runPending('create-tournament', button, async () => {
    const result = await api('/tournaments', { method: 'POST', body: JSON.stringify({ name: $('#new-tourney-name').value }) });
    if (!state.user || state.authRevision !== authRevision) return;
    closeModal('add-tourney-modal'); $('#new-tourney-name').value = '';
    showToast('Tournament created.', 'success'); await viewTournament(result.tournamentId);
  });
}

async function viewTournament(id) {
  state.tournamentId = id;
  navigate('tournament-detail');
  await refreshTournamentDetail();
}

function appendTournamentAction(container, tournamentId, authRevision, label, action) {
  const button = actionButton(label, () => tournamentAction(tournamentId, authRevision, action), `tournament:${tournamentId}:${label}`, 'primary-btn');
  button.style.padding = '8px';
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
    if (tournament.status === 'draft') appendTournamentAction(actions, tournamentId, authRevision, 'Open Registration', 'open_registration');
    if (tournament.status === 'registration_open') appendTournamentAction(actions, tournamentId, authRevision, 'Generate Schedule', 'generate_schedule');
    if (tournament.status === 'running') appendTournamentAction(actions, tournamentId, authRevision, 'Run All Matches', 'run_all');

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
      $('#td-name').textContent = 'Tournament unavailable'; renderMessage($('#td-schedule'), error.message || 'Unable to load tournament.', refreshTournamentDetail);
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
    const section = create('section');
    const heading = create('h4', { text: `Round ${round.roundNumber}` }); heading.style.color = 'var(--text-secondary)'; heading.style.borderBottom = '1px solid var(--border-light)'; heading.style.paddingBottom = '5px'; heading.style.marginBottom = '10px'; section.appendChild(heading);
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

async function tournamentAction(tournamentId, authRevision, action) {
  await api(`/tournaments/${tournamentId}/action`, { method: 'POST', body: JSON.stringify({ action }) });
  if (action === 'generate_schedule') await api(`/tournaments/${tournamentId}/action`, { method: 'POST', body: JSON.stringify({ action: 'start' }) });
  if (state.user && state.authRevision === authRevision && state.tournamentId === tournamentId) {
    showToast(`Action ${action.replaceAll('_', ' ')} successful.`, 'success');
    await refreshTournamentDetail();
  }
}

async function submitTournamentRegistration() {
  const button = $('#submit-registration');
  const tournamentId = state.tournamentId;
  const authRevision = state.authRevision;
  await runPending('register-participant', button, async () => {
    await api(`/tournaments/${tournamentId}/register`, { method: 'POST', body: JSON.stringify({ participantName: $('#reg-part-name').value, botId: $('#reg-bot-select').value }) });
    if (!state.user || state.authRevision !== authRevision || state.tournamentId !== tournamentId) return;
    closeModal('register-bot-tourney-modal'); $('#reg-part-name').value = ''; showToast('Registered successfully.', 'success'); await refreshTournamentDetail();
  });
}

async function populateBotSelect() {
  const select = $('#reg-bot-select'); clear(select);
  const authRevision = state.authRevision;
  const tournamentId = state.tournamentId;
  try {
    const bots = await request('/bots');
    if (!state.user || state.authRevision !== authRevision || state.tournamentId !== tournamentId) return false;
    if (!bots.length) { select.appendChild(create('option', { text: 'No bots available', attrs: { value: '' } })); return true; }
    bots.forEach(bot => select.appendChild(create('option', { text: `${bot.name} (${bot.id})`, attrs: { value: bot.id } })));
  } catch {
    if (state.user && state.authRevision === authRevision && state.tournamentId === tournamentId) select.appendChild(create('option', { text: 'Unable to load bots', attrs: { value: '' } }));
  }
  return state.user && state.authRevision === authRevision && state.tournamentId === tournamentId;
}

const PIECE_TYPES = { dam: 'icon-piece-dam', la: 'icon-piece-la', keo: 'icon-piece-keo' };
function closeReplay() { navigate('tournament-detail'); state.replay = null; }
async function playReplay(tournamentId, matchId) {
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const replay = await api(`/tournaments/${tournamentId}/replays/${matchId}`);
  if (!isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) return;
  state.replay = replay; state.replayMoveIndex = -1;
  $('#r-p1-name').textContent = 'PLAYER A'; $('#r-p2-name').textContent = 'PLAYER B';
  const result = replay.winner === 'A' ? 'PLAYER A WON' : replay.winner === 'B' ? 'PLAYER B WON' : 'DRAW';
  $('#r-result-text').textContent = `Result: ${result} (${replay.terminationReason || 'unknown'})`;
  navigate('replay-view'); goToReplayTurn(-1);
}

function buildStateAt(moveIndex) {
  if (!state.replay) return null;
  const board = JSON.parse(JSON.stringify(state.replay.initialState));
  for (let index = 0; index <= moveIndex; index += 1) {
    const move = state.replay.moves[index]; if (!move) continue;
    const pieceId = Object.keys(board.pieces).find(id => board.pieces[id].row === move.from.row && board.pieces[id].col === move.from.col);
    if (!pieceId) continue;
    const target = board.board[move.to.row][move.to.col]; if (target) delete board.pieces[target];
    board.board[move.from.row][move.from.col] = null; board.pieces[pieceId].row = move.to.row; board.pieces[pieceId].col = move.to.col; board.board[move.to.row][move.to.col] = pieceId;
  }
  return board;
}

function renderReplayBoard(board) {
  const element = $('#r-board'); clear(element);
  for (let row = 0; row < 9; row += 1) for (let col = 0; col < 9; col += 1) {
    const cell = create('div', { className: 'cell' });
    if ((row === 0 && col === 0) || (row === 8 && col === 8)) { cell.classList.add('goal'); const flag = create('span', { className: 'goal-flag' }); flag.appendChild(icon('icon-flag')); cell.appendChild(flag); }
    const id = board.board[row][col]; const piece = id && board.pieces[id];
    if (piece) { const token = create('span', { className: `piece player${piece.player === 'A' ? '1' : '2'}` }); token.appendChild(icon(PIECE_TYPES[piece.type])); cell.appendChild(token); }
    element.appendChild(cell);
  }
}

function goToReplayTurn(index) {
  if (!state.replay) return;
  state.replayMoveIndex = Math.max(-1, Math.min(index, state.replay.moves.length - 1));
  $('#r-turn-display').textContent = `${state.replayMoveIndex + 1} / ${state.replay.moves.length}`;
  const board = buildStateAt(state.replayMoveIndex); if (board) renderReplayBoard(board);
}

function setupReplayCoordinates() {
  const header = $('#coord-header'); const side = $('#coord-side'); clear(header); clear(side);
  header.appendChild(create('div', { className: 'corner' }));
  'abcdefghi'.split('').forEach(column => { const item = create('div', { className: 'coord', text: column }); item.style.width = 'min(6.8vw, 61px)'; header.appendChild(item); });
  Array.from({ length: 9 }, (_, index) => index + 1).forEach(row => { const item = create('div', { className: 'coord', text: row }); item.style.height = 'min(6.8vw, 61px)'; side.appendChild(item); });
}

function bindEvents() {
  document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => navigate(link.dataset.target)));
  $('#login-form').addEventListener('submit', event => { event.preventDefault(); void runPending('login', $('#login-submit'), async () => { const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: $('#login-username').value, password: $('#login-password').value }) }); setAuthenticated(result.user, result.csrfToken); }); });
  $('#register-form').addEventListener('submit', event => { event.preventDefault(); void runPending('register', $('#register-submit'), async () => { const result = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username: $('#register-username').value, password: $('#register-password').value }) }); setAuthenticated(result.user, result.csrfToken); }); });
  $('#logout-button').addEventListener('click', () => void runPending('logout', $('#logout-button'), async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { showAuthScreen(); } }));
  $('#open-bot-modal').addEventListener('click', () => openBotDialog()); $('#open-tournament-modal').addEventListener('click', () => openModal('add-tourney-modal'));
  $('#dashboard-create-bot').addEventListener('click', () => openBotDialog()); $('#dashboard-create-tournament').addEventListener('click', () => openModal('add-tourney-modal'));
  $('#bot-search').addEventListener('input', event => { state.botSearch = event.target.value; renderBotList(); });
  $('#confirm-delete-bot').addEventListener('click', () => void deleteBot());
  $('#mobile-menu-toggle').addEventListener('click', toggleMobileNavigation); $('#sidebar-backdrop').addEventListener('click', closeMobileNavigation);
  $('#back-to-tournaments').addEventListener('click', () => navigate('tournaments')); $('#btn-register-bot').addEventListener('click', async () => { if (await populateBotSelect()) openModal('register-bot-tourney-modal'); });
  $('#close-replay').addEventListener('click', closeReplay); $('#submit-bot').addEventListener('click', () => void submitNewBot()); $('#submit-tournament').addEventListener('click', () => void submitNewTournament()); $('#submit-registration').addEventListener('click', () => void submitTournamentRegistration());
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
  document.querySelectorAll('.modal-overlay').forEach(modal => modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal.id); }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(modal => closeModal(modal.id));
      closeMobileNavigation();
    }
    else trapModalFocus(event);
  });
  $('#btn-replay-start').addEventListener('click', () => goToReplayTurn(-1)); $('#btn-replay-prev').addEventListener('click', () => goToReplayTurn(state.replayMoveIndex - 1)); $('#btn-replay-next').addEventListener('click', () => goToReplayTurn(state.replayMoveIndex + 1)); $('#btn-replay-end').addEventListener('click', () => state.replay && goToReplayTurn(state.replay.moves.length - 1));
}

bindEvents(); setupReplayCoordinates(); void restoreSession();
setInterval(() => { if (state.user) void refreshQueueStats(); if (state.activeView === 'tournament-detail') void refreshTournamentDetail(); }, 5000);
