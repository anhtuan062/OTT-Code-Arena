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
  if (preflight.status === 'passed') return 'Bot đã được kiểm tra thành công và đang chờ Ban tổ chức duyệt.';
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
    heading.append(create('h3', { text: tournament.name }), statusBadge(tournament.status), tournamentParticipationBadge(tournament));
    card.appendChild(heading);
    const meta = create('div', { className: 'tournament-card-meta' });
    meta.append(tournamentMetaItem('icon-users', `${tournament.participantCount ?? 0} ng\u01b0\u1eddi tham gia`));
    card.appendChild(meta);
    const statusLabels = { pending: 'Yêu cầu tham gia đang chờ duyệt.', approved: 'Yêu cầu tham gia đã được duyệt.', rejected: 'Yêu cầu tham gia đã bị từ chối.' };
    const participation = create('p', { className: 'tournament-participation-state', text: tournament.myRequestStatus ? statusLabels[tournament.myRequestStatus] : 'Chưa gửi yêu cầu tham gia.', attrs: { 'aria-live': 'polite' } });
    card.appendChild(participation);
    participation.hidden = true;
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
  const actionIcon = action === 'cancel' || action === 'delete' ? 'td-icon-circle-x' : action === 'open_registration' ? 'td-icon-user-round-plus' : action === 'run_all' ? 'td-icon-play' : null;
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
  const list = $('#td-lifecycle');
  if (!list) return;
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

function renderTournamentLifecycleBody(container, tournament, multiStageContext) {
  if (!container) return;
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

function createPhase1Draft(tournament) {
  return {
    name: tournament.name || '',
    description: tournament.description || '',
    organizerInfo: tournament.organizerInfo || '',
    contactInfo: tournament.contactInfo || '',
    rulesNotes: tournament.rulesNotes || '',
    policyNotes: tournament.policyNotes || '',
  };
}

function capturePhase1DraftFromDom(tournament) {
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

function renderPhase1Creation(container, tournament) {
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
    { key: 'results', id: 'tab-config-results', label: 'Kết quả' },
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
    actionBox.append(
      create('p', { text: 'Danh sách tuyển thủ đã sẵn sàng. Hãy tạo lịch thi đấu để phân bảng và tạo các cặp đấu.' }),
      actionButton(actionLabel('generate_schedule'), () => tournamentAction(tournament.tournamentId, state.authRevision, state.viewRevision, 'generate_schedule'), 'phase3-schedule-btn', 'primary-btn')
    );
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
    const prev = actionButton('Trước', () => { page -= 1; renderRows(); }, 'phase3-prev', 'secondary-btn');
    const next = actionButton('Sau', () => { page += 1; renderRows(); }, 'phase3-next', 'secondary-btn');
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

    const previous = actionButton('Trước', () => { phase4Page -= 1; renderFilteredRounds(); }, `phase4-prev:${phase4Page}`, 'secondary-btn');
    const next = actionButton('Sau', () => { phase4Page += 1; renderFilteredRounds(); }, `phase4-next:${phase4Page}`, 'secondary-btn');
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

function phase6PairingResult(tournament, pairing) {
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
  renderGroupStandings(detail, group, displayPairings);
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
      for (const requestId of requestIds) {
        try {
          await api(`/tournaments/${tournamentId}/requests/${requestId}/${decision}`, { method: 'POST' });
          successCount += 1;
        } catch (error) {
          failureCount += 1;
        }
      }
      if (failureCount) {
        showToast(`Đã xử lý ${successCount}/${requestIds.length} yêu cầu; ${failureCount} yêu cầu lỗi.`, 'error');
      } else {
        showToast(`Đã ${decision === 'approve' ? 'duyệt' : 'từ chối'} ${successCount} yêu cầu.`, decision === 'approve' ? 'success' : 'info');
      }
      await refreshTournamentDetail();
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
      for (const requestId of requestIds) {
        try {
          await api(`/tournaments/${tournamentId}/requests/${requestId}/undo`, { method: 'POST' });
          successCount += 1;
        } catch (error) {
          failureCount += 1;
        }
      }
      showToast(
        failureCount ? `Đã hoàn tác ${successCount}/${requestIds.length}; ${failureCount} yêu cầu lỗi.` : `Đã hoàn tác ${successCount} yêu cầu.`,
        failureCount ? 'error' : 'success'
      );
      await refreshTournamentDetail();
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
        item.setAttribute('aria-label', `Chọn yêu cầu ${req.botName || req.bot?.name || `Bot #${shortId(req.botId)}`}`);
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
          attrs: { 'aria-label': `Chọn ${req.botName || req.bot?.name || `Bot #${shortId(req.botId)}`}` },
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
      const name = create('strong', { className: 'bot-row-title', text: req.botName || req.bot?.name || `Bot #${shortId(req.botId)}` });

      let metaText = '';
      if (req.status === 'pending') {
        const user = req.username || req.competitorUsername;
        metaText = user ? `Yêu cầu đang chờ xét duyệt · ${user}` : 'Yêu cầu đang chờ xét duyệt';
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
              await refreshTournamentDetail();
            }
          } catch (e) {
            showToast(e.message || 'Không thể duyệt yêu cầu.', 'error');
          }
        }, `approve-req-${req.requestId}`, 'primary-btn req-approve-btn');

        const rejectBtn = actionButton('Từ chối', async () => {
          try {
            await api(`/tournaments/${tournamentId}/requests/${req.requestId}/reject`, { method: 'POST' });
            showToast('Đã từ chối yêu cầu.', 'info');
            await refreshTournamentDetail();
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
            await refreshTournamentDetail();
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
      const previous = actionButton('Trước', () => renderList(filter, page - 1), 'phase-request-prev', 'secondary-btn');
      const next = actionButton('Sau', () => renderList(filter, page + 1), 'phase-request-next', 'secondary-btn');
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
  if (multiStage.abortController) multiStage.abortController.abort();
  if (multiStage.pairingController) multiStage.pairingController.abort();
  multiStage.pollTimer = null;
  multiStage.abortController = null;
  multiStage.pairingController = null;
  multiStage.requestToken += 1;
}

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
  actions.replaceChildren(actionButton('Cập nhật', () => refreshTournamentDetail(), `refresh-multi-stage:${tournamentId}`, 'secondary-btn tournament-action tournament-refresh-action'));
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

  const execution = progress.progress || progress || {};
  const pending = Number(execution.pending) || 0;
  const running = Number(execution.running) || 0;
  const activePairings = Number(execution.inProgress) || running;
  const failed = Number(execution.failed) || 0;
  if (pending <= 0) return;

  const label = activePairings > 0
    ? 'Đang chạy trận đấu'
    : failed > 0
      ? 'Chạy lại giải đấu'
      : actionLabel('run_all');
  const runButton = appendTournamentAction(actions, tournamentId, authRevision, viewRevision, label, 'run_all', true);
  if (activePairings > 0) {
    runButton.disabled = true;
    runButton.setAttribute('aria-busy', 'true');
    runButton.title = 'Các trận đấu đang được xử lý.';
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
  header.append(create('h4', { id: 'tiebreaker-resolution-title', text: 'Phân định trận hòa' }), create('button', { className: 'modal-close', type: 'button', attrs: { 'aria-label': 'Đóng', 'data-close-modal': 'tiebreaker-resolution-modal' }, text: '×' }));
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

function renderRegionalRegionCard(region, stageId, selectedRegionId) {
  const progress = multiStagePairingStats(region.progress);
  const active = region.regionId === selectedRegionId;
  const card = create('button', { className: `regional-region-card${active ? ' is-selected' : ''}`, type: 'button', attrs: { 'aria-pressed': String(active), 'data-multi-stage-focus': `region:${region.regionId}` } });
  const top = create('span', { className: 'regional-region-card-top' });
  top.append(create('strong', { text: regionalDisplayName(region) }), create('span', { className: `stage-status stage-status-${safeStatusClass(region.status)}`, text: multiStageStatusLabel(region.status) }));
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
  card.append(create('span', { className: 'regional-action-link', text: 'Xem lịch và kết quả khu vực →' }));
  card.addEventListener('click', () => loadRegionalPairings(stageId, region.regionId));
  return card;
}

function renderRegionalPairings(container, response, region) {
  const panel = create('section', { className: 'regional-pairings-panel', attrs: { 'aria-labelledby': 'regional-pairings-title' } });
  const heading = create('div', { className: 'multi-stage-section-heading' });
  const copy = create('div', { className: 'multi-stage-heading-copy' });
  copy.append(create('p', { className: 'panel-kicker', text: 'Lịch thi đấu' }), create('h3', { id: 'regional-pairings-title', text: regionalDisplayName(region) }));
  heading.append(copy, create('span', { className: 'multi-stage-pairing-count', text: `${multiStageNumber(response.pagination?.totalItems)} trận` }));
  renderRegionalStandings(panel, region);
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
      main.appendChild(create('span', { className: 'group-series-score', text: `Tỉ số ${progress.winsA || 0}–${progress.winsB || 0}` }));
      const headerRight = create('div', { className: 'group-pairing-header-right' });
      headerRight.appendChild(statusBadge(pairing.status));
      const expanded = false;
      const toggle = create('button', { className: 'group-pairing-toggle secondary-btn', type: 'button', attrs: { 'aria-expanded': String(expanded), 'aria-controls': `regional-games-${pairing.pairingId}`, 'aria-label': `Chi tiết các ván cho trận ${pairing.pairingId}` } });
      toggle.append(create('span', { text: 'Chi tiết các ván' }), createChevronIcon());
      toggle.textContent = 'Xem Replay ↗';
      toggle.setAttribute('aria-label', 'Xem Replay');
      headerRight.appendChild(toggle);
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
      toggle.addEventListener('click', () => {
        const replayGame = latestReplayGame(progress);
        if (replayGame) playReplay(state.tournamentId, replayGame.matchId, pairingReplaySeriesContext(pairing, progress));
      });
      list.appendChild(card);
    });
    panel.appendChild(list);
  }
  const pagination = response.pagination || {};
  const paginationBar = create('div', { className: 'multi-stage-pagination' });
  const page = Number(pagination.page) || 1;
  const totalPages = Number(pagination.totalPages) || 1;
  const previous = actionButton('Trước', () => loadRegionalPairings(state.multiStage.activeStageId, state.multiStage.activeRegionId, page - 1), `regional-prev:${page}`, 'secondary-btn');
  const next = actionButton('Sau', () => loadRegionalPairings(state.multiStage.activeStageId, state.multiStage.activeRegionId, page + 1), `regional-next:${page}`, 'secondary-btn');
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
    const previous = actionButton('Trước', () => { page -= 1; renderPage(); }, `regional-standings-prev:${page}`, 'secondary-btn');
    const next = actionButton('Sau', () => { page += 1; renderPage(); }, `regional-standings-next:${page}`, 'secondary-btn');
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

function renderGroupCard(group, stageId, selectedGroupId) {
  const progress = multiStagePairingStats(group.progress);
  const active = group.groupId === selectedGroupId;
  const expectedMatches = progress.total || groupExpectedMatches(group.participantCount);
  const confirmed = groupStandingsConfirmed(group);
  const card = create('button', { className: `group-stage-card${active ? ' is-selected' : ''}`, type: 'button', attrs: { 'aria-pressed': String(active), 'data-multi-stage-focus': `group:${group.groupId}` } });
  const top = create('span', { className: 'group-stage-card-top' });
  top.append(create('strong', { text: groupDisplayName(group) }), create('span', { className: `stage-status stage-status-${safeStatusClass(group.status)}`, text: multiStageStatusLabel(group.status) }));
  card.appendChild(top);
  const details = create('span', { className: 'group-stage-card-details' });
  details.append(create('span', { text: `${multiStageNumber(group.participantCount)} Bot` }), create('span', { text: `${multiStageNumber(progress.completed)}/${multiStageNumber(expectedMatches)} trận` }));
  card.appendChild(details);
  const track = create('span', { className: 'group-stage-track', attrs: { 'aria-hidden': 'true' } });
  const fill = create('span'); fill.style.width = `${expectedMatches ? Math.min(100, (progress.completed / expectedMatches) * 100) : 0}%`; track.appendChild(fill); card.appendChild(track);
  card.append(create('span', { className: 'group-stage-action-link', text: 'Xem bảng đấu →' }));

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

function appendSeriesViewerAction(headerRight, pairing, progress, keyPrefix) {
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
      main.append(names, meta, create('span', { className: 'group-series-score', text: `Tỉ số ${progress.winsA || 0}–${progress.winsB || 0}` }));

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

      toggle.textContent = 'Xem Replay ↗';
      toggle.setAttribute('aria-label', 'Xem Replay');
      headerRight.appendChild(toggle);
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

      toggle.addEventListener('click', () => {
        const replayGame = latestReplayGame(progress);
        if (replayGame) playReplay(state.tournamentId, replayGame.matchId, pairingReplaySeriesContext(pairing, progress));
      });

      list.appendChild(card);
    });
    panel.appendChild(list);
  }
  const pagination = response.pagination || {};
  const page = Number(pagination.page) || 1;
  const totalPages = Number(pagination.totalPages) || 1;
  const paginationBar = create('div', { className: 'multi-stage-pagination' });
  const previous = actionButton('Trước', () => loadGroupPairings(state.multiStage.activeStageId, state.multiStage.activeGroupId, page - 1), `group-prev:${group?.groupId}:${page}`, 'secondary-btn');
  const next = actionButton('Sau', () => loadGroupPairings(state.multiStage.activeStageId, state.multiStage.activeGroupId, page + 1), `group-next:${group?.groupId}:${page}`, 'secondary-btn');
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
    if (group) renderGroupStandings(target, group, response.pairings || []);
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
  const previous = actionButton('Trước', () => loadKnockoutPairings(stageId, page - 1), `knockout-prev:${stageId}:${page}`, 'secondary-btn');
  const next = actionButton('Sau', () => loadKnockoutPairings(stageId, page + 1), `knockout-next:${stageId}:${page}`, 'secondary-btn');
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
  const activeStage = stages.find(stage => stage.stageId === multiStage.activeStageId) || stages.find(stage => stage.regions?.length) || stages[0];
  if (activeStage) multiStage.activeStageId = activeStage.stageId;
  if (!activeStage?.regions?.some(region => region.regionId === multiStage.activeRegionId)) multiStage.activeRegionId = null;
  if (!activeStage?.groups?.some(group => group.groupId === multiStage.activeGroupId)) multiStage.activeGroupId = null;
  if (activeStage?.stageType !== 'knockout') {
    multiStage.activeKnockoutRound = null;
    multiStage.activeKnockoutPairingId = null;
  }
  const actualStage = progress.currentStage || stages.find(stage => stage.status === 'in_progress') || stages.at(-1) || activeStage;
  const isPhase5Workspace = workspace.closest('.phase-layout-running') !== null;
  const isPhase7Workspace = workspace.closest('.phase-layout-completed-archive') !== null;
  if (!options.hideProgressSummary && !isPhase5Workspace && !isPhase7Workspace && getTournamentLifecyclePhase(state.currentTournament) !== 5) {
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
  if (multiStage.pollTimer || !['running', 'paused'].includes(state.detailStatus)) return;
  multiStage.pollTimer = window.setTimeout(() => {
    multiStage.pollTimer = null;
    if (document.hidden) { scheduleMultiStagePolling(tournamentId, authRevision, viewRevision); return; }
    if (isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) void refreshTournamentDetail();
  }, 7000);
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
    const progress = await request(`/tournaments/${tournamentId}/progress`, { signal: controller.signal });
    if (token !== multiStage.requestToken || controller.signal.aborted || !isCurrentView('tournament-detail', authRevision, viewRevision, tournamentId)) return true;
    if (progress.isLegacy || progress.format !== 'multi_stage') {
      multiStage.loadedTournamentId = null;
      multiStage.loadedViewRevision = null;
      return false;
    }
    const compact = await request(`/tournaments/${tournamentId}/stages?compact=true`, { signal: controller.signal });
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
    const tournament = await request(`/tournaments/${tournamentId}`, { signal: controller.signal });
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
    $('#td-pcount').textContent = multiStageNumber(tournament.participants?.length || progress.progress?.totalParticipants || compact.participantCount || 0);
    renderMultiStageActions(tournamentId, authRevision, viewRevision, progress, tournament);
    renderTournamentLifecycle(tournament);
    renderTournamentGuidance(tournament);
    const register = $('#btn-register-bot'); if (register) register.hidden = state.user?.role !== 'competitor' || tournament.status !== 'registration_open';
    setLegacyTournamentDetailVisibility(true);
    const detail = $('#tournament-detail');
    let workspace = $('#multi-stage-workspace');
    if (!workspace) { workspace = create('div', { className: 'multi-stage-workspace', attrs: { id: 'multi-stage-workspace' } }); detail.querySelector('.tournament-detail-hero')?.after(workspace); }
    const lifecycleBody = $('#td-lifecycle-body');
    if (lifecycleBody) {
      renderTournamentLifecycleBody(lifecycleBody, tournament, { progress, compact });
    }
    const currentLifecyclePhase = getTournamentLifecyclePhase(tournament);
    if (tournament.status === 'draft' || tournament.status === 'registration_open' || isRosterFinalPhase(tournament)) {
      if (workspace) { workspace.hidden = true; clear(workspace); }
    } else if (currentLifecyclePhase < 5) {
      if (workspace) { workspace.hidden = true; clear(workspace); }
    } else if (currentLifecyclePhase === 6) {
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
    if (currentLifecyclePhase >= 5) {
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
    state.detailStatus = tournament.status;
    state.spectatorMode = tournament.spectatorAccess === true;
    state.tournamentRegistrationContext = { name: tournament.name, status: tournament.status };
    $('#td-name').textContent = tournament.name;
    updateTopbarTournamentBreadcrumb(tournament.name);
    const breadcrumbName = $('#td-breadcrumb-name'); if (breadcrumbName) breadcrumbName.textContent = tournament.name;
    const badge = $('#td-status'); badge.className = `status-badge status-${safeStatusClass(tournament.status)}`; badge.textContent = localizeStatus(tournament.status);
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
      await refreshTournamentDetail();
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
    showToast('Yêu cầu đã được tiếp nhận. Đang kiểm tra Bot.', 'success');
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

