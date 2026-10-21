import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readAssembledFrontendMarkup, readAssembledFrontendStyles } from './frontend-fixtures';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('Phase 2 Registration Management Workspace', () => {
  it('retrieves Bot workspace GitHub source in the browser and persists only validated source', async () => {
    const bots = await source('js/bots.js');
    expect(bots).toContain('parseClientGithubUrl(sourceInput.githubUrl)');
    expect(bots).toContain('clientGithubCandidates(parsed, sourceInput.runtimeId)');
    expect(bots).toContain("fetch(selected.rawUrl, { credentials: 'omit', mode: 'cors', redirect: 'error' })");
    expect(bots).toContain('githubRepositoryUrl');
    expect(bots).toContain('githubCommitSha');
    expect(bots).not.toContain('/revisions/github');
  });

  it('uses direct raw downloads and bounded browser caching for repository discovery', async () => {
    const tournaments = await source('js/tournaments.js');
    expect(tournaments).toContain('raw.githubusercontent.com');
    expect(tournaments).toContain('CLIENT_GITHUB_REPOSITORY_CACHE_TTL_MS');
    expect(tournaments).toContain('CLIENT_GITHUB_REPOSITORY_CACHE_MAX_ENTRIES');
    expect(tournaments).toContain('return cloneGithubCandidates(cached.candidates);');
    expect(tournaments).toContain('response.headers.get(\'retry-after\')');
    expect(tournaments).toContain('response.headers.get(\'x-ratelimit-reset\')');
    expect(tournaments).toContain('response.status === 403 || response.status === 429');
    expect(tournaments).not.toContain('github.com/search');
  });

  it('keeps tournament registration limited to existing Bot and revision selection', async () => {
    const [markup, tournaments, events, css] = await Promise.all([
      readAssembledFrontendMarkup(), source('js/tournaments.js'), source('js/events.js'), readAssembledFrontendStyles(),
    ]);
    expect(markup).not.toContain('open-github-import-from-registration');
    expect(markup).not.toContain('registration-github-import');
    expect(markup).not.toContain('registration-github-runtime');
    expect(markup).toContain('id="reg-bot-select"');
    expect(markup).toContain('id="reg-revision-select"');
    expect(tournaments).not.toContain('importGithubBotForRegistration');
    expect(events).not.toContain('openRegistrationGithubImport');
    expect(events).not.toContain('importGithubBotForRegistration');
    expect(css).not.toContain('.registration-github-import');
    expect(tournaments).toContain('void populateBotSelect();');
    expect(tournaments).toContain('updateRegistrationRevisionSummary');
  });

  it('declares organizer authorization context before rendering tournament actions', async () => {
    const tournaments = await source('js/tournaments.js');
    const start = tournaments.indexOf('async function refreshTournamentDetail()');
    const end = tournaments.indexOf('async function renderParticipationRequestsV2', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(tournaments.slice(start, end)).toContain("const isOrganizer = state.user?.role === 'organizer';");
  });

  it('implements dedicated Registration Management Workspace structure in Phase 2', async () => {
    const [app, tournaments, markup] = await Promise.all([
      source('app.js'),
      source('js/tournaments.js'),
      readAssembledFrontendMarkup(),
    ]);

    // Header enhancements
    expect(markup).toContain('id="td-breadcrumb-root"');
    expect(markup).toContain('id="td-phase-label"');

    // Breadcrumb and phase label updates
    expect(tournaments).toContain("breadcrumbRoot.textContent = 'Quản lý giải đấu'");
    expect(tournaments).toContain("breadcrumbName.textContent = 'Đăng ký'");
    expect(tournaments).toContain("phaseLabel.textContent = 'Giai đoạn 2/7'");

    // Registration overview stat cards
    expect(tournaments).toContain('phase-reg-stats-grid');
    expect(tournaments).toContain("id: 'reg-stat-total'");
    expect(tournaments).toContain("label: 'Tổng yêu cầu'");
    expect(tournaments).toContain("id: 'reg-stat-approved'");
    expect(tournaments).toContain("label: 'Đã duyệt'");
    expect(tournaments).toContain("id: 'reg-stat-pending'");
    expect(tournaments).toContain("create('strong', { className: 'reg-stat-number', attrs: { id }, text: initial })");
    expect(tournaments).toContain("label: 'Chờ duyệt'");

    // Full-width requests workspace card with count badge and filter tabs
    expect(tournaments).toContain('phase-requests-workspace');
    expect(tournaments).toContain('phase-workspace-head');
    expect(tournaments).toContain('phase-filter-tabs');
    expect(tournaments).toContain("id: 'tab-filter-pending'");
    expect(tournaments).toContain("id: 'tab-filter-approved'");
    expect(tournaments).toContain("id: 'tab-filter-rejected'");
    expect(tournaments).toContain("id: 'phase2-request-list'");

    // Compact bot rows layout
    expect(tournaments).toContain('phase-bot-rows-list');
    expect(tournaments).toContain('phase-bot-row');
    expect(tournaments).toContain('bot-row-avatar');
    expect(tournaments).toContain('bot-row-info');
    expect(tournaments).toContain('bot-row-right');

    // Bundled app includes the workspace implementation
    expect(app).toContain('phase-reg-stats-grid');
    expect(app).toContain('phase-requests-workspace');
    expect(app).toContain('phase-filter-tabs');
    expect(app).toContain('phase-bot-rows-list');
  });

  it('enforces organizer permissions for approve/reject actions and closing registration', async () => {
    const tournaments = await source('js/tournaments.js');

    // Approve/Reject actions are only rendered for organizer and pending requests
    expect(tournaments).toContain("if (isOrganizer && ['pending', 'approved', 'rejected'].includes(req.status))");
    expect(tournaments).toContain('/requests/${req.requestId}/approve');
    expect(tournaments).toContain('/requests/${req.requestId}/reject');
    expect(tournaments).toContain('/requests/${req.requestId}/undo');
    expect(tournaments).toContain('req-undo-btn');
    expect(tournaments).toContain('Hoàn tác');
    expect(tournaments).toContain('Hoàn tác tất cả');
    expect(tournaments).toContain('runBulkUndo');
    expect(tournaments).toContain('let bulkProcessing = false');
    expect(tournaments).toContain('setBulkProcessing(true)');
    expect(tournaments).toContain('req-approve-btn');
    expect(tournaments).toContain('req-reject-btn');
    expect(tournaments).toContain('phase-request-checkbox');
    expect(tournaments).toContain('Chọn tất cả yêu cầu đang chờ duyệt');
    expect(tournaments).toContain('Duyệt tất cả');
    expect(tournaments).toContain('Từ chối tất cả');
    expect(tournaments).toContain('Duyệt đã chọn');
    expect(tournaments).toContain('Từ chối đã chọn');
    expect(tournaments).toContain('for (const requestId of requestIds)');
    expect(tournaments).toContain("bulkToolbar.addEventListener('click'");
    expect(tournaments).toContain("bulkSelectAll.dispatchEvent(new Event('change'");
    expect(tournaments).toContain("item.addEventListener('click'");
    expect(tournaments).toContain("item.addEventListener('keydown'");

    // Primary close registration CTA in header
    expect(tournaments).toContain('phase-close-cta');
    expect(tournaments).toContain("actionLabel('close_registration')");
    expect(tournaments).toContain('handleCloseRegistration');

    // Competitor view has registration CTA without moderation controls
    expect(tournaments).toContain('if (isCompetitor)');
    expect(tournaments).toContain('phase-cta-card');
    expect(tournaments).toContain('phase2-register-btn');
  });

  it('validates pre-flight conditions before closing registration', async () => {
    const tournaments = await source('js/tournaments.js');

    // Pre-flight pending requests check
    expect(tournaments).toContain('async function handleCloseRegistration');
    expect(tournaments).toContain("const reqs = await request(`/tournaments/${tournamentId}/requests`)");
    expect(tournaments).toContain("const pendingReqs = (reqs || []).filter(r => r.status === 'pending')");
    expect(tournaments).toContain('pendingReqs.length > 0');
    expect(tournaments).toContain('Không thể đóng đăng ký: còn');
    expect(tournaments).toContain('Vui lòng duyệt hoặc từ chối trước khi đóng.');
  });

  it('renders clean empty states for pending, approved, and rejected tabs without oversized empty cards', async () => {
    const tournaments = await source('js/tournaments.js');

    expect(tournaments).toContain('phase-empty-inbox');
    expect(tournaments).toContain('Không có yêu cầu chờ duyệt');
    expect(tournaments).toContain('Tất cả các yêu cầu gửi Bot đã được xử lý.');
    expect(tournaments).toContain('Chưa có Bot nào được duyệt');
    expect(tournaments).toContain('Chưa có yêu cầu bị từ chối');
    expect(tournaments).toContain('Không có yêu cầu nào bị từ chối trong giải đấu này.');
  });

  it('suppresses match progress, preliminary/group panels, and redundant guidance while registration is open', async () => {
    const tournaments = await source('js/tournaments.js');

    // Guidance next step (#td-next-step) is hidden in registration_open
    expect(tournaments).toContain("if (tournament.status === 'registration_open') {");
    expect(tournaments).toContain('guidance.hidden = true;');
    expect(tournaments).toContain('guidance.replaceChildren();');

    // Multi-stage workspace is hidden and cleared during registration_open
    expect(tournaments).toContain("if (tournament.status === 'registration_open') {");
    expect(tournaments).toContain('if (workspace) { workspace.hidden = true; clear(workspace); }');

    // Registration keeps all seven lifecycle steps visible.
    expect(tournaments).toContain("list.classList.remove('lifecycle-compact')");
    expect(tournaments).toContain("const steps = ['Tạo giải', 'Mở đăng ký', 'Chốt danh sách', 'Lập lịch', 'Thi đấu', 'Hoàn thành', 'Công bố']");
    expect(tournaments).toContain("} else if (action === 'open_registration') {");
    expect(tournaments).toContain("textContent = 'Sau khi mở, người chơi có thể gửi yêu cầu đăng ký Bot theo thể lệ của giải đấu.'");
  });

  it('maintains responsive layouts and light green visual language for all breakpoints', async () => {
    const css = await readAssembledFrontendStyles();

    // Stats grid & workspace card styling
    expect(css).toContain('.phase-reg-stats-grid');
    expect(css).toContain('.phase-reg-stat-card');
    expect(css).toContain('.phase-requests-workspace');
    expect(css).toContain('.phase-workspace-head');
    expect(css).toContain('.phase-filter-tabs');
    expect(css).toContain('.phase-filter-tab');
    expect(css).toContain('.phase-filter-tab.is-active');

    // Bot rows styling
    expect(css).toContain('.phase-bot-rows-list');
    expect(css).toContain('.phase-bot-row');
    expect(css).toContain('.bot-row-avatar');
    expect(css).toContain('.bot-row-info');
    expect(css).toContain('.bot-row-right');
    expect(css).toContain('.bot-status-pill.is-pending');
    expect(css).toContain('.bot-status-pill.is-approved');
    expect(css).toContain('.bot-status-pill.is-rejected');
    expect(css).toContain('white-space: nowrap;');
    expect(css).toContain('.phase-request-pagination .secondary-btn');
    expect(css).toContain('.phase-request-pagination .secondary-btn:disabled');
    expect(css).toContain('width: 56px;');
    expect(css).toContain('.inbox-actions .req-reject-btn');
    expect(css).toContain('flex-wrap: nowrap;');
    expect(css).toContain('.phase-inbox-item > .inbox-copy');
    expect(css).toContain('min-width: 56px;');
    expect(css).toContain('width: auto !important;');
    expect(css).toContain('font-size: .8rem !important;');
    expect(css).toContain('.phase-request-bulk-toolbar');
    expect(css).toContain('.phase-request-checkbox');
    expect(css).toContain('.phase-request-bulk-btn');
    expect(css).toContain('.phase-inbox-item.is-selectable');
    expect(css).toContain('.req-approve-btn');
    expect(css).toContain('.req-reject-btn');
    expect(css).toContain('.phase-close-cta');

    // Light green visual palette
    expect(css).toContain('#176b50');
    expect(css).toContain('#e4f1eb');
    expect(css).toContain('#edf5ef');

    // Responsive media queries: <= 800px and <= 620px
    expect(css).toContain('@media (max-width: 800px)');
    expect(css).toContain('@media (max-width: 620px)');
    expect(css).toContain('.phase-bot-row {');
    expect(css).toContain('flex-direction: column;');
    expect(css).toContain('.phase-filter-tabs {');
    expect(css).toContain('overflow-x: auto;');
  });

  it('derives counters and rows from one authoritative request response and ignores stale refreshes', async () => {
    const tournaments = await source('js/tournaments.js');

    expect(tournaments).toContain('const renderSequence = ++registrationRequestRenderSequence');
    expect(tournaments).toContain('function normalizeRegistrationRequestCollection(payload)');
    expect(tournaments).toContain('Array.isArray(payload?.data?.requests)');
    expect(tournaments).toContain('renderSequence !== registrationRequestRenderSequence');
    expect(tournaments).toContain('|| !container.isConnected) return;');
    expect(tournaments).toContain('function getRegistrationRequestStats(requests)');
    expect(tournaments).toContain('const requestStats = getRegistrationRequestStats(registrationRequests);');
    expect(tournaments).toContain('const detailRequests = normalizeRegistrationRequestCollection(');
    expect(tournaments).toContain("updateRegistrationStats(statsRoot, [], 'loading')");
    expect(tournaments).toContain("updateRegistrationStats(statsRoot, [], 'error')");
    expect(tournaments).toContain('renderPhase2Requests(');
    expect(tournaments).toContain("container.dataset.lifecyclePhase === '2'");
  });

  it('renders 32 requests progressively and preserves actions after approval/rejection refresh', async () => {
    const tournaments = await source('js/tournaments.js');

    expect(tournaments).toContain('const pageSize = 10');
    expect(tournaments).toContain('activeItems.slice((page - 1) * pageSize, page * pageSize)');
    expect(tournaments).toContain('Trang ${page} / ${pageCount}');
    expect(tournaments).toContain('await refreshTournamentDetail();');
    expect(tournaments).toContain('/requests/${req.requestId}/approve');
    expect(tournaments).toContain('/requests/${req.requestId}/reject');
  });

  it('covers delayed loading, polling refresh and DOM re-render protection for registration stats', async () => {
    const tournaments = await source('js/tournaments.js');

    expect(tournaments).toContain("[stats.total, stats.approved, stats.pending]");
    expect(tournaments).toContain("if (mode === 'loading' || mode === 'error')");
    expect(tournaments).toContain("mode === 'loading' ? '…' : '—'");
    expect(tournaments).toContain("{ statsRoot: container.querySelector('.phase-reg-stats-grid') }");
    expect(tournaments).toContain('const existingRequestList = container.querySelector(\'#phase2-request-list\')');
    expect(tournaments).toContain('const registrationRequests = isOrganizer ? requests : [...pendingList, ...approvedList, ...rejectedList];');
  });
  it('resets the request inbox to pending when opening a different tournament', async () => {
    const tournaments = await source('js/tournaments.js');
    expect(tournaments).toContain("if (state.tournamentId !== id) state.detailRequestsFilter = 'pending';");
    expect(tournaments).toContain("state.tournamentId = id;");
  });

  it('polls pending preflight rows without replacing the request workspace', async () => {
    const tournaments = await source('js/tournaments.js');

    expect(tournaments).toContain('PHASE2_PREFLIGHT_POLL_INTERVAL_MS = 2000');
    expect(tournaments).toContain('PHASE2_PREFLIGHT_POLL_BACKOFF_AFTER_MS = 60_000');
    expect(tournaments).toContain('PHASE2_PREFLIGHT_POLL_SLOW_INTERVAL_MS = 10_000');
    expect(tournaments).not.toContain('PHASE2_PREFLIGHT_POLL_MAX_MS');
    expect(tournaments).toContain('elapsed >= PHASE2_PREFLIGHT_POLL_BACKOFF_AFTER_MS');
    expect(tournaments).toContain('polling.inFlight');
    expect(tournaments).toContain('stopPhase2PreflightPolling');
    expect(tournaments).toContain('updatePhase2PreflightRows(container, requests)');
    expect(tournaments).toContain('isCurrentView(\'tournament-detail\', polling.authRevision, polling.viewRevision, tournamentId)');
    expect(tournaments).toContain('preflightDiagnosticText(preflight)');
    expect(tournaments).toContain('data-preflight-status');
    expect(tournaments).toContain('Boolean(req.revisionId)');
    expect(tournaments).toContain("startPhase2PreflightPolling(tournamentId, container");
  });

  it('keeps the competitor submission modal open while tracking the persisted preflight request', async () => {
    const [tournaments, markup, index] = await Promise.all([
      source('js/tournaments.js'),
      readAssembledFrontendMarkup(),
      source('index.html'),
    ]);

    expect(markup).toContain('id="registration-submission-status"');
    // The browser serves index.html directly; keep the runtime shell in sync
    // with the modal fragment used by the assembled-markup fixture.
    expect(index).toContain('id="registration-submission-status"');
    expect(tournaments).toContain('registrationSubmissionPolling');
    expect(tournaments).toContain('startRegistrationSubmissionPolling(tournamentId, result.requestId)');
    expect(tournaments).toContain('/tournaments/${tournamentId}/participation-requests/mine');
    expect(tournaments).toContain('state.registrationSubmission?.tournamentId === tournamentId ? state.registrationSubmission.requestId : null');
    expect(tournaments).toContain('void resumeRegistrationSubmission(state.tournamentId)');
    expect(tournaments).toContain('await refreshTournamentDetail();');
  });

  it('uses only persisted status and sanitized diagnostics, without fabricated progress or queue positions', async () => {
    const tournaments = await source('js/tournaments.js');
    const start = tournaments.indexOf('function registrationSubmissionStatusText(');
    const end = tournaments.indexOf('function stopRegistrationSubmissionPolling', start);
    const submissionStatus = tournaments.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(submissionStatus).toContain('preflight.status');
    expect(submissionStatus).toContain('diagnostic.stage');
    expect(submissionStatus).toContain('preflightDiagnosticText(preflight)');
    expect(submissionStatus).not.toMatch(/queue\s*(position|length)|queue position|\b\d+%/i);
  });

  it('deduplicates polling, stops at terminal status, and resumes after the modal is reopened', async () => {
    const [tournaments, auth] = await Promise.all([source('js/tournaments.js'), source('js/auth.js')]);
    const start = tournaments.indexOf('function startRegistrationSubmissionPolling(');
    const end = tournaments.indexOf('function goToBotsFromRegistration', start);
    const polling = tournaments.slice(start, end);

    expect(polling).toContain('current?.tournamentId === tournamentId && current.requestId === requestId');
    expect(polling).toContain('polling.inFlight');
    expect(polling).toContain("['passed', 'failed', 'expired']");
    expect(polling).toContain("['approved', 'rejected']");
    expect(polling).toContain('state.authRevision !== polling.authRevision');
    expect(polling).toContain('state.tournamentId !== polling.tournamentId');
    expect(polling).toContain('relevantView');
    expect(polling).toContain('stopRegistrationSubmissionPolling();');
    expect(tournaments).toContain('window.clearTimeout');
    expect(tournaments).toContain('abortController?.abort');
    expect(polling).toContain('async function resumeRegistrationSubmission(tournamentId)');
    expect(tournaments).toContain("const locksForm = Boolean(submission) && !['failed', 'expired'].includes(preflightStatus);");
    expect(tournaments).toContain("$('#registration-fields').hidden = locksForm;");
    expect(tournaments).toContain("$('#submit-registration').hidden = locksForm;");
    expect(auth).toContain('if (typeof stopRegistrationSubmissionPolling === \'function\') stopRegistrationSubmissionPolling();');
    expect(auth).toContain('state.registrationSubmission = null;');
    expect(auth).toContain("document.querySelectorAll('.modal-overlay.open').forEach(modal => closeModal(modal.id));");
  });
});
