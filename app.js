const API_URL = '/api';
let currentUser = null;
let csrfToken = null;

// Utilities
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  document.getElementById(pageId).classList.add('active');
  const link = document.querySelector(`.nav-link[data-target="${pageId}"]`);
  if (link) link.classList.add('active');

  if (pageId === 'dashboard') loadDashboard();
  else if (pageId === 'bots') loadBots();
  else if (pageId === 'tournaments') loadTournaments();
}

function setAuthenticated(user, csrf) {
  currentUser = user;
  csrfToken = csrf;
  document.getElementById('auth-screen').hidden = true;
  document.getElementById('app-nav').hidden = false;
  document.getElementById('current-user').textContent = user.username;
  document.getElementById('dashboard').classList.add('active');
  loadDashboard();
}

function showAuthScreen() {
  currentUser = null;
  csrfToken = null;
  document.getElementById('auth-screen').hidden = false;
  document.getElementById('app-nav').hidden = true;
  document.querySelectorAll('.page:not(#auth-screen)').forEach(page => page.classList.remove('active'));
}

// Navigation binding
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    navigate(e.currentTarget.dataset.target);
  });
});

setInterval(refreshQueueStats, 5000);

// API Calls
async function api(path, options = {}) {
  try {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (csrfToken && method !== 'GET' && method !== 'HEAD') headers['x-csrf-token'] = csrfToken;
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'same-origin',
      headers
    });
    const data = res.status === 204 ? null : await res.json();
    if (!res.ok) {
      if (res.status === 401) showAuthScreen();
      throw new Error(data?.error || 'API Error');
    }
    return data;
  } catch (err) {
    if (err.message) showToast(err.message, 'error');
    throw err;
  }
}

async function restoreSession() {
  try {
    const result = await api('/auth/me');
    setAuthenticated(result.user, result.csrfToken);
  } catch {
    showAuthScreen();
  }
}

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('login-username').value,
        password: document.getElementById('login-password').value
      })
    });
    setAuthenticated(result.user, result.csrfToken);
  } catch {}
});

document.getElementById('register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('register-username').value,
        password: document.getElementById('register-password').value
      })
    });
    setAuthenticated(result.user, result.csrfToken);
  } catch {}
});

document.getElementById('logout-button').addEventListener('click', async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    showAuthScreen();
  }
});

restoreSession();

// ---------------------------------------------------
// Dashboard
// ---------------------------------------------------
async function refreshQueueStats() {
  try {
    const stats = await api('/system/queue');
    document.getElementById('queue-stats').textContent =
      `Queue: ${stats.activeCount}/${stats.maxConcurrent} active, ${stats.queueLength} queued`;
  } catch (e) {
    document.getElementById('queue-stats').textContent = 'Queue status offline';
  }
}

async function loadDashboard() {
  refreshQueueStats();
  const [tourneys, bots] = await Promise.all([
    api('/tournaments').catch(() => []),
    api('/bots').catch(() => [])
  ]);

  document.getElementById('dash-tourney-count').textContent = tourneys.length;
  document.getElementById('dash-bot-count').textContent = bots.length;

  const tbody = document.querySelector('#dash-recent-tourneys tbody');
  tbody.innerHTML = '';

  tourneys.slice(0, 5).forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.format}</td>
      <td><span class="status-badge status-${t.status}">${t.status.replace('_', ' ').toUpperCase()}</span></td>
      <td>${t.participants.length}</td>
      <td><button class="secondary-btn" style="padding: 4px 8px;" onclick="viewTournament('${t.tournamentId}')">View</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------
// Bots
// ---------------------------------------------------
async function loadBots() {
  const bots = await api('/bots');
  const tbody = document.querySelector('#bots-table tbody');
  tbody.innerHTML = '';
  bots.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${b.id}</code></td>
      <td>${b.name}</td>
      <td><code>${b.command}</code></td>
      <td><code>${b.args.join(' ')}</code></td>
      <td>${new Date(b.registeredAt).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function submitNewBot() {
  const name = document.getElementById('new-bot-name').value;
  const command = document.getElementById('new-bot-cmd').value;
  const argsRaw = document.getElementById('new-bot-args').value;
  const args = argsRaw ? argsRaw.split(',').map(s => s.trim()) : [];

  try {
    await api('/bots', { method: 'POST', body: JSON.stringify({ name, command, args }) });
    closeModal('add-bot-modal');
    document.getElementById('new-bot-name').value = '';
    document.getElementById('new-bot-cmd').value = '';
    document.getElementById('new-bot-args').value = '';
    showToast('Bot registered successfully', 'success');
    loadBots();
  } catch (e) {
    // Error handled in api()
  }
}

// ---------------------------------------------------
// Tournaments
// ---------------------------------------------------
async function loadTournaments() {
  const tourneys = await api('/tournaments');
  const tbody = document.querySelector('#tourneys-table tbody');
  tbody.innerHTML = '';
  tourneys.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${t.tournamentId}</code></td>
      <td>${t.name}</td>
      <td><span class="status-badge status-${t.status}">${t.status.replace('_', ' ').toUpperCase()}</span></td>
      <td><button class="secondary-btn" style="padding: 4px 8px;" onclick="viewTournament('${t.tournamentId}')">View</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function submitNewTourney() {
  const name = document.getElementById('new-tourney-name').value;
  try {
    const result = await api('/tournaments', { method: 'POST', body: JSON.stringify({ name }) });
    closeModal('add-tourney-modal');
    document.getElementById('new-tourney-name').value = '';
    showToast('Tournament created', 'success');
    viewTournament(result.tournamentId);
  } catch (e) {
    // Handled
  }
}

let currentTourneyId = null;

async function viewTournament(id) {
  currentTourneyId = id;
  navigate('tournament-detail');
  await refreshTournamentDetail();
}

async function refreshTournamentDetail() {
  if (!currentTourneyId) return;
  const t = await api(`/tournaments/${currentTourneyId}`);

  document.getElementById('td-name').textContent = t.name;
  document.getElementById('td-status').className = `status-badge status-${t.status}`;
  document.getElementById('td-status').textContent = t.status.replace('_', ' ').toUpperCase();
  document.getElementById('td-pcount').textContent = t.participants.length;

  const plist = document.getElementById('td-participants');
  plist.innerHTML = '';
  t.participants.forEach(p => {
    const li = document.createElement('li');
    li.style.padding = '8px 0';
    li.style.borderBottom = '1px solid var(--border-light)';
    li.innerHTML = `<strong>${p.name}</strong> <span style="color:var(--text-faint); font-size:0.8rem;">(${p.bot.botId})</span>`;
    plist.appendChild(li);
  });

  // Actions based on status
  const actions = document.getElementById('td-actions');
  actions.innerHTML = '';
  const btnReg = document.getElementById('btn-register-bot');
  btnReg.style.display = 'none';

  if (t.status === 'draft') {
    actions.innerHTML += `<button class="primary-btn" style="padding:8px;" onclick="tourneyAction('open_registration')">Open Registration</button>`;
  } else if (t.status === 'registration_open') {
    btnReg.style.display = 'block';
    actions.innerHTML += `<button class="primary-btn" style="padding:8px;" onclick="tourneyAction('generate_schedule')">Generate Schedule</button>`;
  } else if (t.status === 'running') {
    actions.innerHTML += `<button class="primary-btn" style="padding:8px;" onclick="tourneyAction('run_all')">Run All Matches</button>`;
  }

  // Load standings
  const tbody = document.querySelector('#td-standings tbody');
  tbody.innerHTML = '';
  t.standings.forEach((s, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${s.participantName}</strong></td>
      <td>${s.matchesPlayed}</td>
      <td>${s.wins}</td>
      <td>${s.draws}</td>
      <td>${s.losses}</td>
      <td><strong>${s.points}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  if (t.status === 'completed' || t.status === 'running') {
    api(`/tournaments/${currentTourneyId}/stats`).then(stats => {
      document.getElementById('td-stats').textContent =
        `Matches: ${stats.completedMatches}/${stats.totalMatches} | Avg Turns: ${stats.averageTurns}`;
    }).catch(()=>{});
  }

  // Schedule
  const sched = document.getElementById('td-schedule');
  sched.innerHTML = '';
  t.rounds.forEach(r => {
    const roundDiv = document.createElement('div');
    roundDiv.innerHTML = `<h4 style="color:var(--text-secondary); border-bottom:1px solid var(--border-light); padding-bottom:5px; margin-bottom:10px;">Round ${r.roundNumber}</h4>`;

    const table = document.createElement('table');
    table.className = 'data-table';
    let thtml = `<thead><tr><th>Match</th><th>Player A</th><th>Player B</th><th>Status</th><th>Winner</th><th>Action</th></tr></thead><tbody>`;

    r.pairings.forEach(p => {
      const pA = t.participants.find(x => x.participantId === p.participantA)?.name || p.participantA;
      const pB = p.participantB ? (t.participants.find(x => x.participantId === p.participantB)?.name || p.participantB) : 'BYE';

      let winnerName = '-';
      if (p.matchResult) {
        if (p.matchResult.winner === 'A') winnerName = pA;
        else if (p.matchResult.winner === 'B') winnerName = pB;
        else if (p.matchResult.winner === 'draw') winnerName = 'Draw';
      }

      thtml += `<tr>
        <td><code style="font-size:0.75rem;">${p.pairingId}</code></td>
        <td>${pA}</td>
        <td>${pB}</td>
        <td><span class="status-badge status-${p.status}">${p.status.toUpperCase()}</span></td>
        <td>${winnerName}</td>
        <td>
          ${p.matchId ? `<button class="secondary-btn" style="padding:4px 8px;" onclick="playReplay('${t.tournamentId}', '${p.matchId}')">Watch</button>` : ''}
        </td>
      </tr>`;
    });
    table.innerHTML = thtml + '</tbody>';
    roundDiv.appendChild(table);
    sched.appendChild(roundDiv);
  });
}

async function tourneyAction(action) {
  try {
    await api(`/tournaments/${currentTourneyId}/action`, { method: 'POST', body: JSON.stringify({ action }) });
    showToast(`Action ${action} successful`, 'success');
    if (action === 'generate_schedule') {
      await api(`/tournaments/${currentTourneyId}/action`, { method: 'POST', body: JSON.stringify({ action: 'start' }) });
    }
    refreshTournamentDetail();
  } catch (e) {}
}

async function submitTourneyRegistration() {
  const name = document.getElementById('reg-part-name').value;
  const botId = document.getElementById('reg-bot-select').value;
  try {
    await api(`/tournaments/${currentTourneyId}/register`, { method: 'POST', body: JSON.stringify({ participantName: name, botId }) });
    closeModal('register-bot-tourney-modal');
    document.getElementById('reg-part-name').value = '';
    showToast('Registered successfully', 'success');
    refreshTournamentDetail();
  } catch (e) {}
}

// Populate bot select when opening modal
document.getElementById('btn-register-bot')?.addEventListener('click', async () => {
  const bots = await api('/bots').catch(()=>[]);
  const sel = document.getElementById('reg-bot-select');
  sel.innerHTML = bots.map(b => `<option value="${b.id}">${b.name} (${b.id})</option>`).join('');
});


// ---------------------------------------------------
// REPLAY VIEWER
// ---------------------------------------------------
let currentReplay = null;
let currentReplayMoveIndex = -1;

const BOARD_SIZE = 9;
const PIECE_TYPES = {
  dam: { icon: 'icon-piece-dam', name: 'Búa' },
  la: { icon: 'icon-piece-la', name: 'Lá' },
  keo: { icon: 'icon-piece-keo', name: 'Kéo' }
};

function closeReplay() {
  navigate('tournament-detail');
  currentReplay = null;
}

function svgUse(iconId) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${iconId}"></use></svg>`;
}

async function playReplay(tourneyId, matchId) {
  try {
    const replay = await api(`/tournaments/${tourneyId}/replays/${matchId}`);
    currentReplay = replay;

    // Setup UI
    document.getElementById('r-p1-name').textContent = "PLAYER A"; // We could fetch real names if we pass them
    document.getElementById('r-p2-name').textContent = "PLAYER B";

    let wtxt = '';
    if (replay.winner === 'A') wtxt = 'PLAYER A WON';
    else if (replay.winner === 'B') wtxt = 'PLAYER B WON';
    else wtxt = 'DRAW';

    document.getElementById('r-result-text').textContent = `Result: ${wtxt} (${replay.terminationReason || 'unknown'})`;

    navigate('replay-view');
    goToReplayTurn(-1); // Start at initial state
  } catch (e) {
    showToast('Failed to load replay', 'error');
  }
}

function renderReplayBoard(state) {
  const boardEl = document.getElementById('r-board');
  boardEl.innerHTML = '';

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = document.createElement('div');
      cell.className = 'cell';

      if ((row === 0 && col === 0) || (row === 8 && col === 8)) {
        cell.classList.add('goal');
        cell.innerHTML = `<span class="goal-flag">${svgUse('icon-flag')}</span>`;
      }

      const pieceId = state.board[row][col];
      if (pieceId) {
        const piece = state.pieces[pieceId];
        const pel = document.createElement('span');
        pel.className = `piece player${piece.player === 'A' ? '1' : '2'}`;
        pel.innerHTML = svgUse(PIECE_TYPES[piece.type].icon);
        cell.appendChild(pel);
      }
      boardEl.appendChild(cell);
    }
  }
}

function buildStateAt(moveIndex) {
  if (!currentReplay) return null;
  // Deep clone initial state
  const state = JSON.parse(JSON.stringify(currentReplay.initialState));

  // Apply moves up to index
  for (let i = 0; i <= moveIndex; i++) {
    const move = currentReplay.moves[i];

    // Find piece
    let pieceId = null;
    let pieceObj = null;
    for (const [pid, p] of Object.entries(state.pieces)) {
      if (p.row === move.from.row && p.col === move.from.col) {
        pieceId = pid;
        pieceObj = p;
        break;
      }
    }

    if (pieceObj) {
      // Remove from old
      state.board[move.from.row][move.from.col] = null;
      // Capture target if any
      const targetId = state.board[move.to.row][move.to.col];
      if (targetId) {
        delete state.pieces[targetId];
      }
      // Move to new
      pieceObj.row = move.to.row;
      pieceObj.col = move.to.col;
      state.board[move.to.row][move.to.col] = pieceId;
    }
  }
  return state;
}

function goToReplayTurn(index) {
  if (!currentReplay) return;
  if (index < -1) index = -1;
  if (index >= currentReplay.moves.length) index = currentReplay.moves.length - 1;

  currentReplayMoveIndex = index;
  document.getElementById('r-turn-display').textContent = `${index + 1} / ${currentReplay.moves.length}`;

  const state = buildStateAt(index);
  if (state) renderReplayBoard(state);
}

document.getElementById('btn-replay-start').addEventListener('click', () => goToReplayTurn(-1));
document.getElementById('btn-replay-prev').addEventListener('click', () => goToReplayTurn(currentReplayMoveIndex - 1));
document.getElementById('btn-replay-next').addEventListener('click', () => goToReplayTurn(currentReplayMoveIndex + 1));
document.getElementById('btn-replay-end').addEventListener('click', () => {
  if (currentReplay) goToReplayTurn(currentReplay.moves.length - 1);
});

// Render static board coordinates for replay
function setupReplayCoords() {
  const cols = 'abcdefghi'.split('');
  const header = document.getElementById('coord-header');
  const side = document.getElementById('coord-side');
  if(header && side) {
    header.innerHTML = '<div class="corner" style="width:25px"></div>' + cols.map(c => `<div class="coord" style="width:min(6.8vw, 61px);text-align:center">${c}</div>`).join('');
    side.innerHTML = Array.from({length:9}, (_,i)=>`<div class="coord" style="height:min(6.8vw, 61px);display:flex;align-items:center">${i+1}</div>`).join('');
  }
}
setupReplayCoords();

// Polling for tournament updates while on the detail page
setInterval(() => {
  if (document.getElementById('tournament-detail').classList.contains('active')) {
    refreshTournamentDetail();
  }
}, 5000);
