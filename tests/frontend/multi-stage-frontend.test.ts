import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('Multi-stage frontend foundation', () => {
  it('uses authenticated conditional validators for background detail polling', async () => {
    const [app, api, state] = await Promise.all([source('app.js'), source('js/api.js'), source('js/state.js')]);
    expect(app).toContain("conditional: { key: `tournament:${tournamentId}:progress` }");
    expect(app).toContain("conditional: { key: `tournament:${tournamentId}:stages:compact` }");
    expect(app).toContain("conditional: { key: `tournament:${tournamentId}:detail` }");
    expect(api).toContain("headers['If-None-Match'] = cached.etag");
    expect(api).toContain('response.status === 304 && cached');
    expect(api).toContain('state.authRevision}:${state.user?.id');
    expect(state).toContain('conditionalResponseCache: new Map()');
  });

  it('stops hidden-tab timers, refreshes on visibility return, and slows paused polling only', async () => {
    const tournaments = await source('js/tournaments.js');
    expect(tournaments).toContain('MULTI_STAGE_POLL_RUNNING_INTERVAL_MS = 7000');
    expect(tournaments).toContain('MULTI_STAGE_POLL_PAUSED_INTERVAL_MS = 15000');
    expect(tournaments).toContain("document.addEventListener('visibilitychange'");
    expect(tournaments).toContain('if (document.hidden) return;');
    expect(tournaments).toContain('void refreshTournamentDetail();');
    expect(tournaments).not.toContain('if (document.hidden) { scheduleMultiStagePolling');
  });

  it('keeps legacy rendering and gates the dedicated renderer by multi_stage', async () => {
    const app = await source('app.js');
    expect(app).toContain('await loadMultiStageTournamentDetail(tournamentId, authRevision, viewRevision)');
    expect(app).toContain("if (progress.isLegacy || progress.format !== 'multi_stage') {");
    expect(app).toContain('renderSchedule(tournament, state.viewerParticipantIds)');
    expect(app).toContain("request(`/tournaments/${tournamentId}`)");
  });

  it('uses the persisted tournament format when labeling tournament lists', async () => {
    const [app, tournaments, dashboard] = await Promise.all([source('app.js'), source('js/tournaments.js'), source('js/dashboard.js')]);
    expect(app).toContain("function tournamentFormatLabel(format)");
    expect(app).toContain("return format === 'multi_stage' ? 'Nhiều giai đoạn' : 'Vòng tròn một lượt';");
    expect(tournaments).toContain('tournamentFormatLabel(tournament.format)');
    expect(dashboard).toContain('tournamentFormatLabel(tournament.format)');
  });

  it('creates new tournaments as multi-stage from the organizer UI', async () => {
    const tournaments = await source('js/tournaments.js');
    expect(tournaments).toContain("body: JSON.stringify({ name, format: 'multi_stage' })");
  });

  it('exposes the multi-stage lifecycle actions while a tournament is still draft', async () => {
    const tournaments = await source('js/tournaments.js');
    expect(tournaments).toContain("if (status === 'draft') {");
    expect(tournaments).toContain("actionLabel('open_registration')");
    expect(tournaments).toContain("status === 'registration_closed'");
    expect(tournaments).toContain("actionLabel('generate_schedule')");
  });

  it('uses compact progress and paginated pairings with real stage and region ids', async () => {
    const app = await source('app.js');
    expect(app).toContain("/tournaments/${tournamentId}/progress");
    expect(app).toContain("/tournaments/${tournamentId}/stages?compact=true");
    expect(app).toContain('stageId=${encodeURIComponent(stageId)}&regionId=${encodeURIComponent(regionId)}');
    expect(app).toContain('pageSize=10');
    expect(app).toContain('pageSize=10&excludeByes=true');
    expect(app).toContain('region.regionId');
    expect(app).toContain('renderRegionalStandings(panel, region)');
    expect(app).toContain('regional-standings-table');
    expect(app).toContain('regional-standings-pagination');
    expect(app).toContain('const pageSize = 10;');
    expect(app).not.toContain("region-a");
  });

  it('renders active pairings separately from pending pairings', async () => {
    const tournaments = await source('js/tournaments.js');
    expect(tournaments).toContain('inProgress: Number(progress.inProgress ?? progress.running) || 0');
    expect(tournaments).toContain("['Đang thi đấu', stats.inProgress, 'running']");
    expect(tournaments).toContain('const activePairings = Number(execution.inProgress) || running');
  });

  it('renders dynamic Group Stage groups, standings and paginated group pairings', async () => {
    const app = await source('app.js');
    expect(app).toContain('function renderGroupStage(container, stage)');
    expect(app).toContain('function groupExpectedMatches(participantCount)');
    expect(app).toContain('groupId=${encodeURIComponent(groupId)}');
    expect(app).toContain('groupStandingsConfirmed(group)');
    expect(app).toContain('group-standing-qualified');
    expect(app).toContain("stage.stageType === 'group_stage'");
    expect(app).toContain('state.multiStage.activeStageId = stage.stageId');
    expect(app).toContain('renderMultiStageWorkspace();');
    expect(app).toContain("standing.participantName || 'Bot chưa công bố'");
    expect(app).not.toContain('32 bảng');
  });

  it('keeps Group Stage styles responsive and avoids unconfirmed qualification claims', async () => {
    const [app, css] = await Promise.all([source('app.js'), source('styles/views/tournaments.css')]);
    expect(app).toContain("required >= 2 && group?.status === 'completed'");
    expect(css).toContain('.group-stage-grid');
    expect(css).toContain('.group-standings-table');
    expect(css).toContain('.group-stage-card.is-selected');
    expect(css).toContain('.group-stage-grid { grid-template-columns:1fr; }');
    expect(css).toContain('.group-stage-card');
    expect(css).toContain('.multi-stage-progress-fill');
  });

  it('keeps tournament status badges on one line inside flex headers', async () => {
    const css = await source('styles/views/tournaments.css');
    expect(css).toContain('display: inline-flex;');
    expect(css).toContain('.tournament-detail-redesign .status-badge');
    expect(css).toContain('min-width: max-content;');
    expect(css).toContain('white-space: nowrap;');
  });

  it('renders Knockout from real round and pairing data without inferring unresolved winners', async () => {
    const app = await source('app.js');
    expect(app).toContain('function renderKnockoutStage(container, stage)');
    expect(app).toContain('function loadKnockoutPairings(stageId, page = 1)');
    expect(app).toContain('stageId=${encodeURIComponent(stageId)}&page=${page}&pageSize=100');
    expect(app).toContain('pairing.roundNumber');
    expect(app).toContain("if (roundsFromFinal === 1) return 'Bán kết';");
    expect(app).toContain("if (roundsFromFinal === 2) return 'Tứ kết';");
    expect(app).toContain("pairing?.matchResult?.winner");
    expect(app).toContain('return matchCode ? `Thắng ${matchCode}` : `Thắng ${upstreamPairingId}`;');
    expect(app).toContain("stage.stageType === 'knockout'");
    expect(app).toContain("pairing.matchId && pairing.status === 'in_progress'");
    expect(app).toContain("pairing?.matchResult?.winner");
    expect(app).not.toContain('for (let round = 1; round <= 6');
  });

  it('keeps Knockout bracket accessible on desktop and selectable by round on mobile', async () => {
    const css = await source('styles/views/tournaments.css');
    expect(css).toContain('.knockout-bracket');
    expect(css).toContain('.knockout-match-node');
    expect(css).toContain('.knockout-round { display:flex; min-width:0; }');
    expect(css).toContain('.knockout-match-pending_tiebreaker');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('renders a two-player final with the shared bracket architecture and champion card', async () => {
    const app = await source('app.js');
    expect(app).toContain('function renderKnockoutChampionCard(pairing)');
    expect(app).toContain('rounds.at(-1)[0]');
    expect(app).toContain('knockout-champion-card');
    expect(app).not.toContain('round <= 6');
  });

  it('connects four-player semifinal matches to the final by adjacent round positions', async () => {
    const [app, sourceCode] = await Promise.all([source('app.js'), source('js/tournaments.js')]);
    expect(app).toContain('dataset.parentPairings');
    expect(app).toContain('parentIds.includes(match.dataset.pairingId)');
    expect(app).toContain('function drawKnockoutConnectors(bracket)');
    expect(app).toContain('data-round');
    expect(app).toContain('function knockoutParticipantSeed(pairing, side)');
    expect(sourceCode).toContain("'1st': 'Nhất'");
    expect(sourceCode).toContain('return `${ordinal} ${match[2]}`');
    expect(app).toContain('knockout-player-identity');
    expect(app).toContain("className: 'knockout-match-code'");
    expect(app).toContain('const matchCode = knockoutMatchCode(pairing.pairingId) || pairing.pairingId;');
    expect(app).toContain('knockout-player-score');
  });

  it('keeps eight-player and larger brackets data-driven and horizontally scrollable only when needed', async () => {
    const [app, css] = await Promise.all([source('app.js'), source('styles/views/tournaments.css')]);
    expect(app).toContain('Math.max(...rounds.map');
    expect(app).toContain("document.createElementNS('http://www.w3.org/2000/svg', 'svg')");
    expect(app).toContain("connectors.classList.add('knockout-connectors')");
    expect(app).toContain('function renderKnockoutMatchDetails(container, pairing)');
    expect(app).toContain('knockout-detail-slot');
    expect(css).toContain('grid-auto-flow:column');
    expect(css).toContain('grid-auto-columns:220px');
    expect(css).toContain('overflow-x:auto');
    expect(css).toContain('overflow:visible');
  });

  it('renders pending tiebreakers from progress and gates resolution by organizer role', async () => {
    const [app, css] = await Promise.all([source('app.js'), source('styles/views/tournaments.css')]);
    expect(app).toContain('pendingTiebreaker');
    expect(app).toContain('function renderPendingTiebreakerPanel(container, currentStage)');
    expect(app).toContain('function openTiebreakerResolution(pairing)');
    expect(app).toContain("state.user?.role !== 'organizer'");
    expect(app).toContain('/pairings/${encodeURIComponent(pairing.pairingId)}/resolve-tiebreaker');
    expect(app).toContain("method: 'POST'");
    expect(app).toContain('error.status === 409');
    expect(app).toContain('requestToken');
    expect(app).toContain('await refreshTournamentDetail()');
    expect(app).not.toContain("state.multiStage.activeKnockoutRound = winner");
    expect(css).toContain('.pending-tiebreaker-panel');
    expect(css).toContain('.tiebreaker-resolution-panel');
  });

  it('does not discard a successful tiebreaker when polling rotates requestToken', async () => {
    const app = await source('app.js');
    const resolveSection = app.slice(app.indexOf('async function resolveTiebreaker'), app.indexOf('function pendingTiebreakerStage'));
    expect(resolveSection).toContain('The POST is authoritative');
    expect(resolveSection).not.toContain('token !== state.multiStage.requestToken');
    expect(resolveSection).toContain('closeModal(modal.id);');
    expect(resolveSection).toContain("showToast('");
    expect(resolveSection).toContain("'success'");
  });

  it('loads pending tiebreakers from the stage that actually reports them', async () => {
    const app = await source('app.js');
    expect(app).toContain('function pendingTiebreakerStage(currentStage)');
    expect(app).toContain("stage.progress?.pendingTiebreaker");
    expect(app).toContain('loadPendingTiebreakerPairings(pendingStage?.stageId)');
  });

  it('provides retry for failed knockout pairings and preserves focus during polling renders', async () => {
    const app = await source('app.js');
    expect(app).toContain("pairing.status === 'failed' && state.user?.role === 'organizer'");
    expect(app).toContain('knockout-retry:${stageId}:${page}');
    expect(app).toContain('function captureMultiStageFocus()');
    expect(app).toContain('function restoreMultiStageFocus(focus)');
    expect(app).toContain('renderMultiStageWorkspace({ preserveFocus: isBackgroundRefresh });');
  });

  it('keeps one stable multi-stage workspace across refreshes', async () => {
    const app = await source('app.js');
    expect(app).toContain("className: 'multi-stage-workspace', attrs: { id: 'multi-stage-workspace' }");
    expect(app).not.toContain("create('div', { id: 'multi-stage-workspace'");
  });

  it('renders the organizer run-all action only for running multi-stage tournaments with pending matches', async () => {
    const app = await source('app.js');
    expect(app).toContain('function renderMultiStageActions(tournamentId, authRevision, viewRevision, progress, tournament = null)');
    expect(app).toContain("if (state.user?.role !== 'organizer') return;");
    expect(app).toContain("if (status !== 'running') return;");
    expect(app).toContain("if (pending <= 0) return;");
    expect(app).toContain("appendTournamentAction(actions, tournamentId, authRevision, viewRevision, label, 'run_all', true)");
    expect(app).toContain('renderMultiStageActions(tournamentId, authRevision, viewRevision, progress, tournament);');
  });

  it('keeps the multi-stage run-all action guarded while matches are already running', async () => {
    const app = await source('app.js');
    expect(app).toContain("const running = Number(execution.running) || 0;");
    expect(app).toContain("runButton.disabled = true;");
    expect(app).toContain("runButton.setAttribute('aria-busy', 'true');");
    expect(app).toContain("actionLabel('run_all')");
    expect(app).toContain("method: 'POST', body: action === 'publish' ? undefined : JSON.stringify({ action, ...payload })");
  });

  it('preserves a valid user-selected stage during progress polling', async () => {
    const app = await source('app.js');
    expect(app).toContain('const selectedStageId = multiStage.activeStageId;');
    expect(app).toContain('multiStage.stages.some(stage => stage.stageId === selectedStageId)');
    expect(app).toContain('? selectedStageId');
  });

  it('preserves scroll and multi-stage controls during background refresh', async () => {
    const app = await source('app.js');
    expect(app).toContain('multiStage.loadedViewRevision === viewRevision');
    expect(app).toContain('if (!isBackgroundRefresh) {');
    expect(app).toContain('renderMultiStageLoading();');
    expect(app).toContain('const preservedScroll = isBackgroundRefresh');
    expect(app).toContain('window.scrollTo(preservedScroll.left, preservedScroll.top)');
    expect(app).toContain('multiStage.loadedTournamentId = tournamentId;');
  });

  it('does not rebuild the workspace when polling returns unchanged tournament data', async () => {
    const [app, events] = await Promise.all([source('app.js'), source('js/events.js')]);
    expect(app).toContain('const dataSignature = JSON.stringify({');
    expect(app).toContain('const shouldRenderWorkspace = !isBackgroundRefresh || multiStage.renderSignature !== dataSignature;');
    expect(app).toContain('if (shouldRenderWorkspace) renderMultiStageWorkspace({ preserveFocus: isBackgroundRefresh });');
    expect(app).toContain('if (isBackgroundRefresh) {');
    expect(app).toContain('if (shouldRenderWorkspace && currentLifecyclePhase >= 5) {');
    expect(events).toContain('const multiStagePollingOwnsDetail = state.multiStage?.loadedTournamentId === state.tournamentId');
    expect(events).toContain('&& !multiStagePollingOwnsDetail && !state.detailRefreshInFlight');
  });

  it('keeps scroll reset behavior out of route navigation', async () => {
    const [app, navigation] = await Promise.all([source('app.js'), source('js/navigation.js')]);
    const navigateBody = navigation.slice(navigation.indexOf('function navigate('), navigation.indexOf('function syncLocationRoute'));
    expect(navigateBody).not.toContain('scrollTo(');
    expect(app).toContain("navigate('tournament-detail')");
    expect(app).toContain('await refreshTournamentDetail();');
  });

  it('renders pairing-level series details and one safe action per real game', async () => {
    const [app, css, server] = await Promise.all([
      source('app.js'), source('styles/views/tournaments.css'), source('server/index.ts'),
    ]);
    expect(app).toContain('function knockoutSeriesProgress(pairing)');
    expect(app).toContain('function findKnockoutPairing(tournament, pairingId)');
    expect(app).toContain('const winnerSide = upstream?.matchResult?.winner');
    expect(app).toContain("knockoutParticipantName(finalPairing, 'A', tournament)");
    expect(app).toContain('function renderKnockoutGame(pairing, gameNumber, game, progress)');
    expect(app).toContain('function seriesScoreLabel(progress)');
    expect(app).toContain("game?.replayAvailable !== false");
    expect(app).toContain("status === 'in_progress' && pairing.matchId");
    expect(css).toContain('.knockout-games');
    expect(css).toContain('.knockout-game-unavailable');
    expect(server).toContain('seriesProgress');
    expect(server).toContain('replayAvailable: Boolean(canViewResults && game.replayRef)');
  });

  it('keeps viewed stage separate from tournament stage and expands Group Stage games', async () => {
    const app = await source('app.js');
    expect(app).toContain('Đang xem');
    expect(app).toContain('Giải đang ở:');
    expect(app).toContain('function renderGroupPairings(container, response, group)');
    expect(app).toContain('function groupStandingsRows(group, pairings = [])');
    expect(app).toContain('function formatStandingDifference(standing)');
    expect(app).toContain("'Hiệu số'");
    expect(app).toContain('Chưa có dữ liệu xếp hạng');
    expect(app).toContain('Chưa có kết quả chính thức');
    expect(app).toContain('Planned slot ids are not standings');
    expect(app).toContain('group-pairing-games');
    expect(app).toContain('Chi tiết các ván');
    expect(app).toContain('pairingReplaySeriesContext(pairing, progress)');
    expect(app).toContain('pageSize=10&excludeByes=true');
    expect(app).toContain("filter(pairing => pairing.participantB !== null && pairing.status !== 'bye')");
  });

  it('keeps parent series context and draw counts in game-level replay', async () => {
    const replay = await source('js/replay.js');
    expect(replay).toContain('function replayParentSeries()');
    expect(replay).toContain('state.replayContext?.seriesContext');
    expect(replay).toContain('function replaySeriesDrawCount(series)');
    expect(replay).toContain('Ván ${(Number(state.replayGameIndex) || 0) + 1}');
    expect(replay).toContain('seriesContext = null');
    expect(replay).toContain('participantName');
    expect(replay).toContain('replaySeriesScoreText(series)');
  });

  it('retains cached pairing data while polling and does not overwrite a stage chosen mid-request', async () => {
    const app = await source('app.js');
    expect(app).toContain('if (!isBackgroundRefresh) multiStage.pairingPages.clear();');
    expect(app).toContain('const activeStageIdAtRequest = multiStage.activeStageId;');
    expect(app).toContain('const selectionChangedDuringRequest = selectedStageId !== activeStageIdAtRequest;');
    expect(app).toContain('if (isBackgroundRefresh) {');
    expect(app).toContain('void loadKnockoutPairings(multiStage.activeStageId');
  });

  it('includes request cancellation, polling, pagination and accessible states', async () => {
    const [app, css] = await Promise.all([source('app.js'), source('styles/views/tournaments.css')]);
    expect(app).toContain('new AbortController()');
    expect(app).toContain('stopMultiStagePolling()');
    expect(app).toContain('window.setTimeout');
    expect(app).toContain('role: \'progressbar\'');
    expect(css).toContain('.regional-region-grid');
    expect(css).toContain('@media (max-width: 620px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('renders compact responsive Group Stage pairing cards with BO2 pill, vs separator and expandable games', async () => {
    const [app, css] = await Promise.all([source('app.js'), source('styles/views/tournaments.css')]);
    expect(app).toContain('function groupSeriesProgress(pairing)');
    expect(app).toContain('function groupSeriesSupportingText(pairing, progress)');
    expect(app).toContain('function renderGroupGame(pairing, gameNumber, game, progress)');
    expect(app).toContain('function createChevronIcon()');
    expect(app).toContain('group-pairing-card');
    expect(app).toContain('group-pairing-card-header');
    expect(app).toContain('group-pairing-names');
    expect(app).toContain('group-pairing-vs');
    expect(app).toContain('group-series-pill');
    // expect(app).toContain('group-series-result');
    expect(app).toContain('group-pairing-toggle');
    expect(app).toContain('group-pairing-chevron');
    expect(app).toContain('group-game-row');
    expect(app).toContain('group-game-actions');
    expect(app).toContain('state.multiStage.expandedGroupPairings');

    // CSS rules
    expect(css).toContain('.group-pairing-card');
    expect(css).toContain('.group-pairing-card-header');
    expect(css).toContain('.group-pairing-names');
    expect(css).toContain('.group-series-pill');
    expect(css).toContain('.group-series-score');
    expect(css).toContain('.group-pairing-toggle');
    expect(css).toContain('.group-pairing-chevron');
    expect(css).toContain('.group-pairing-toggle[aria-expanded="true"] .group-pairing-chevron');
    expect(css).toContain('.group-pairing-games[hidden]');
    expect(css).toContain('.group-game-row');
    expect(css).toContain('.group-game-action-btn');

    // Mobile media query responsiveness
    expect(css).toContain('.group-pairing-card-header { flex-direction:column; align-items:stretch;');
    expect(css).toContain('.group-pairing-header-right { width:100%; justify-content:space-between; margin-left:0; }');
  });

  it('correctly formats BO2 series results and supports 1-1 split, 2-0, draws, and in-progress states', async () => {
    const app = await source('app.js');
    expect(app).toContain('const bestOf = 2;');
    expect(app).toContain("const format = 'BO2';");
    expect(app).toContain("${maxWins} thắng · ${minWins} thua${draws ? ` · ${draws} hòa` : ''}");
    expect(app).toContain("${maxWins} thắng${draws ? ` · ${draws} hòa` : ''}");
    expect(app).toContain("${draws} hòa");
  });

  it('keeps outer pairing cards compact and opens the series replay', async () => {
    const app = await source('app.js');
    expect(app).toContain('className: \'group-series-score\'');
    expect(app).toContain("toggle.textContent = 'Xem Replay");
    expect(app).toContain('latestReplayGame(progress)');
    expect(app).toContain('function renderGroupGame(pairing, gameNumber, game, progress)');
  });

  it('toggles the selected Group Stage card closed and cancels its pending load', async () => {
    const app = await source('app.js');
    expect(app).toContain('if (active) {');
    expect(app).toContain('state.multiStage.activeGroupId = null;');
    expect(app).toContain('state.multiStage.pairingController?.abort();');
  });

  it('localizes Group labels without changing persisted group ids', async () => {
    const app = await source('app.js');
    expect(app).toContain('function groupDisplayName(group)');
    expect(app).toContain('raw.match(/^Group\\s+(.+)$/i)');
    expect(app).toContain('return match ? `B\\u1ea3ng ${match[1]}` : raw;');
    expect(app).toContain('text: groupDisplayName(group)');
  });

  it('keeps multi-stage pagination controls compact instead of inheriting full-width buttons', async () => {
    const css = await source('styles/views/tournaments.css');
    expect(css).toContain('.multi-stage-pagination .secondary-btn { width:auto;');
    expect(css).toContain('min-width:52px;');
    expect(css).toContain('min-height:32px;');
    expect(css).toContain('flex:0 0 auto;');
    expect(css).toContain('.multi-stage-pagination .secondary-btn:disabled');
  });

  it('renders classic elimination tournament tree with independent participant cards, scores, and connectors', async () => {
    const [app, css] = await Promise.all([source('app.js'), source('styles/views/tournaments.css')]);
    
    // Independent participant card nodes with name, seed, and score badge
    expect(app).toContain("className: 'knockout-player-identity'");
    expect(app).toContain("className: 'knockout-player-name'");
    expect(app).toContain("className: 'knockout-player-seed'");
    expect(app).toContain("className: 'knockout-player-score'");
    expect(app).toContain("function knockoutParticipantSeed(pairing, side)");
    expect(app).toContain("function knockoutParticipantScore(pairing, side, progress)");

    // Champion card with kicker and bold winner name
    expect(app).toContain("★ Vô địch");
    expect(app).toContain("className: 'knockout-champion-kicker'");
    expect(app).toContain("className: 'knockout-champion-card'");
    expect(app).toContain("if (roundTitle) roundColumn.appendChild");
    expect(app).not.toContain("text: 'Kết quả' }), renderKnockoutChampionCard");

    // Bracket fork lines connecting participant rows to advancing node or Champion
    expect(app).toContain("appendPath(`M ${xA} ${yA} H ${stemX}`);");
    expect(app).toContain("appendPath(`M ${xB} ${yB} H ${stemX}`);");
    expect(app).toContain("appendPath(`M ${stemX} ${yA} V ${yB}`);");

    // CSS styling: transparent match-node container, individual cards for participants
    expect(css).toContain('.knockout-match-node { position:relative; display:flex; flex-direction:column; box-sizing:border-box; width:220px; gap:14px; min-height:0; padding:0; border:none; background:transparent; box-shadow:none; }');
    expect(css).toContain('.knockout-match-code');
    expect(css).toContain('.knockout-player { position:relative; display:flex; align-items:center; justify-content:space-between; gap:12px;');
    expect(css).toContain('.knockout-player.is-winner { background:#edf5ef; border-color:#9dc4a7; color:#12472d; }');
    expect(css).toContain('.knockout-player-score { flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center;');
    expect(css).toContain('.knockout-champion-card { display:flex; flex-direction:column; align-items:center; justify-content:center;');

    // Game-level details separated below bracket in knockout-detail-slot
    expect(app).toContain("renderKnockoutMatchDetails(detailSlot, selectedPairing);");
    expect(app).toContain("className: 'knockout-detail-slot'");
    expect(app).toContain("className: 'group-pairing-card knockout-selected-pairing-card'");
    expect(app).toContain("className: 'group-pairing-names'");
    expect(app).toContain("className: 'group-pairing-vs', text: 'vs'");
    expect(app).toContain("text: 'Chi tiết các ván'");
    expect(app).toContain("className: 'knockout-game-actions'");
    expect(app).toContain("actionButton('Live'");
    expect(app).toContain("actionButton('Replay'");
    expect(css).toContain('.knockout-match-detail-panel { display:grid; gap:12px; padding:16px;');
  });

  it('renders Phase 7 tournament overview and tied third-place podium before the Phase 6 workspace', async () => {
    const [app, css] = await Promise.all([source('app.js'), source('styles/views/tournaments.css')]);
    expect(app).toContain("text: 'Tổng quan giải đấu'");
    expect(app).toContain("className: 'phase7-overview-grid'");
    expect(app).toContain("['Tổng thời gian chạy các trận', formatExecutionDuration(executionPairings)]");
    expect(app).toContain("icon('td-icon-calendar-clock')");
    expect(app).not.toContain("icon('td-icon-chart-no-axes-combined')");
    expect(app).not.toContain("icon('td-icon-award')");
    expect(app).toContain("text: 'Đồng hạng 3'");
    expect(app).toContain('const semifinalLosers = semifinalPairings.flatMap');
    expect(app).toContain('const top3 = semifinalLosers.length === 2 ? semifinalLosers');
    expect(app).toContain('const contextualStages = multiStageContext?.stages');
    expect(app).toContain('renderMultiStageWorkspace({ preserveFocus: true, hideProgressSummary: true });');
    expect(css).toContain('.phase7-overview-grid');
    expect(css).toContain('.phase-official-podium .tournament-panel-head > div { display:flex; align-items:center; gap:8px; }');
    expect(css).toContain('.phase-official-podium .tournament-panel-head svg { width:18px; height:18px; flex:0 0 18px;');
    expect(css).toContain('.phase-podium-tied-names');
  });
});
