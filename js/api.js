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

