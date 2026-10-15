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
});
