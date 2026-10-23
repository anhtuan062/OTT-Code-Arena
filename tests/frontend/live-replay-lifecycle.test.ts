import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('LIVE.1H replay navigation lifecycle', () => {
  it('rehydrates an authenticated browser session before accepting Replay data', async () => {
    const app = await source('app.js');
    expect(app).toContain('async function ensureReplaySession()');
    expect(app).toContain("await ensureReplaySession()");
    expect(app).toContain("request('/auth/me')");
  });

  it('clears stale live/series state and binds Replay to the requested tournament', async () => {
    const app = await source('app.js');
    expect(app).toContain('state.tournamentId = tournamentId');
    expect(app).toContain('state.replaySeries = null');
    expect(app).toContain('renderReplaySeriesControls(null)');
    expect(app).toContain('state.liveMatchContext = null');
  });

  it('does not open a BO3 result modal until the completed game score is authoritative', async () => {
    const app = await source('app.js');
    expect(app).toContain('const confirmedWins = Number(series.winsA ?? 0) + Number(series.winsB ?? 0)');
    expect(app).toContain('if (confirmedWins < gameNumber) {');
    expect(app).toContain('outcome: game.outcome');
  });

  it('hides stale result UI when the next game starts and invalidates old transition callbacks', async () => {
    const app = await source('app.js');
    expect(app).toContain('state.liveTransitionToken += 1');
    expect(app).toContain('if (snapshot.status === \'in_progress\' && state.liveHistoryGame !== null && game > state.liveHistoryGame)');
    expect(app).toContain('transitionToken !== state.liveTransitionToken || state.activeView !== \'replay-view\'');
    expect(app).toContain('hideLiveGameResultModal();');
  });

  it('keeps the completed game outcome while transitioning to the next game', async () => {
    const app = await source('app.js');
    expect(app).toContain('liveCompletedSnapshot');
    expect(app).toContain("completedSnapshot?.winner === 'draw'");
    expect(app).toContain("showLiveGameResultModal({ ...pending, status: 'finished' }, completedGame, state.liveCompletedSnapshot)");
    expect(app).toContain("showLiveGameResultModal({ ...snapshot, status: 'finished' }, previousGame, completedSnapshot)");
    expect(app).toContain("showLiveGameResultModal({ ...snapshot, status: 'finished' }, previousGame, state.liveCompletedSnapshot)");
    expect(app).toContain('}, 1500);');
  });

  it('keeps stream and polling paths from reopening a stale modal directly', async () => {
    const app = await source('app.js');
    const streamSection = app.slice(app.indexOf('function startLiveMatchStream()'), app.indexOf('async function pollLiveMatch()'));
    const pollingSection = app.slice(app.indexOf('async function pollLiveMatch()'), app.indexOf('function normalizeSpectatorLive()'));
    expect(streamSection).not.toContain('showLiveGameResultModal(snapshot)');
    expect(pollingSection).not.toContain('showLiveGameResultModal(snapshot)');
  });

  it('renders queued live moves on the next event-loop turn without an artificial animation delay', async () => {
    const app = await source('app.js');
    const liveFrameSection = app.slice(app.indexOf('function playLiveHistoryFrame()'), app.indexOf('function updateLiveHistory()'));
    expect(liveFrameSection).toContain('setTimeout(playLiveHistoryFrame, 0)');
    expect(liveFrameSection).not.toContain('hasMove ? 900 : 800');
  });

  it('falls back to spectator polling for multi-stage competitors and prevents duplicate timers', async () => {
    const [app, tournaments] = await Promise.all([source('app.js'), source('js/tournaments.js')]);
    expect(tournaments).toContain("state.spectatorMode = progress.status === 'running';");
    expect(app).toContain('if (state.liveMatchPollingTimer) return;');
    expect(app).toContain('context.spectator');
    expect(app).toContain('/spectator/matches/${context.matchId}/live?ts=${Date.now()}');
    expect(app).toContain('const baseDelay = transitioning ? 250 : 250;');
  });

  it('closes the tiebreaker overlay before replay navigation and labels BO2 summaries correctly', async () => {
    const app = await source('app.js');
    expect(app).toContain("closeModal('tiebreaker-resolution-modal');");
    expect(app).toContain('const seriesLabel = series.format?.toUpperCase()');
    expect(app).toContain('renderReplaySummaryV2Base');
    expect(app).toContain('Series ${seriesLabel}');
  });

  it('keeps live series names fixed while current game sides can swap', async () => {
    const [app, spectator] = await Promise.all([source('app.js'), source('server/spectator.ts')]);
    expect(spectator).toContain('winner: pairing.matchResult?.winner ?? null');
    expect(app).toContain('currentParticipants:');
    expect(app).toContain('winner: series.winner ?? null');
    expect(app).toContain('replayParticipantName(currentParticipants, latestMovePlayer)');
    expect(app).toContain('function replayMovePlayer(move)');
    expect(app).toContain("move?.player === 'A' || move?.player === 'B'");
    expect(app).toContain('updateReplaySeriesSideColors(');
    expect(app).toContain('renderReplayPieceCounts(snapshot.state, {');
    expect(app).toContain('A: currentSideAId === fixedAId ? \'A\' : \'B\'');
    expect(app).toContain("currentMove?.classList.toggle('replay-current-move-a', latestMovePlayer === 'A')");
    expect(app).toContain("currentMove?.classList.toggle('replay-current-move-b', latestMovePlayer === 'B')");
    expect(app).toContain('const fixedActivePlayer = activeParticipantId === fixedAId');
    expect(app).toContain('currentParticipants: frame.currentParticipants || latest.currentParticipants');
    expect(app).toContain('currentParticipants: {');
  });
});
