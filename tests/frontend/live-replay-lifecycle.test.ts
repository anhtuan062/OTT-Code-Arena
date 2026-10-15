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

  it('keeps stream and polling paths from reopening a stale modal directly', async () => {
    const app = await source('app.js');
    const streamSection = app.slice(app.indexOf('function startLiveMatchStream()'), app.indexOf('async function pollLiveMatch()'));
    const pollingSection = app.slice(app.indexOf('async function pollLiveMatch()'), app.indexOf('function normalizeSpectatorLive()'));
    expect(streamSection).not.toContain('showLiveGameResultModal(snapshot)');
    expect(pollingSection).not.toContain('showLiveGameResultModal(snapshot)');
  });
});
