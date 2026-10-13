import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('UX.6 replay and live-match presentation', () => {
  it('exposes a keyboard-operable exact replay position control and responsive hierarchy', async () => {
    const page = await source('index.html');
    expect(page).toContain('id="replay-content"');
    expect(page).toContain('id="replay-scrubber"');
    expect(page).toContain('type="range"');
    expect(page).toContain('id="r-selected-move"');
    expect(page).toContain('id="r-board"');
    expect(page).toContain('id="replay-timeline"');
    expect(page).toContain('prefers-reduced-motion: reduce');
  });

  it('keeps initial/final boundaries and scrubber state synchronized with the board', async () => {
    const app = await source('app.js');
    expect(app).toContain('state.replayMoveIndex = -1');
    expect(app).toContain('Math.max(-1, Math.min(index, state.replay.moves.length - 1))');
    expect(app).toContain("scrubber.value = String(state.replayMoveIndex)");
    expect(app).toContain("goToReplayTurn(Number(event.target.value))");
    expect(app).toContain("goToReplayTurn(-1)");
    expect(app).toContain('state.replay.moves.length - 1');
  });

  it('preserves playback cleanup, speed changes, and stale-match isolation', async () => {
    const app = await source('app.js');
    expect(app).toContain('clearTimeout(state.replayTimer)');
    expect(app).toContain('state.replayPlaybackToken = (state.replayPlaybackToken || 0) + 1');
    expect(app).toContain('const replayRevision = ++state.replayRevision');
    expect(app).toContain('state.replayContext?.matchId === matchId');
    expect(app).toContain('state.replaySpeed = Number(event.target.value)');
    expect(app).toContain("if (state.replayTimer) return stopReplayPlayback()");
  });

  it('uses authoritative board data for coordinates, capture highlights, and result reasons', async () => {
    const app = await source('app.js');
    expect(app).toContain("const columns = 'abcdefghi'");
    expect(app).toContain('buildStateAt(state.replayMoveIndex - 1)');
    expect(app).toContain('lastMove.captures');
    expect(app).toContain("cell.classList.add('capture')");
    expect(app).toContain('formatReplayReason(replay.terminationReason)');
    expect(app).toContain('participantIdentities');
  });

  it('keeps unavailable/integrity-invalid replay states out of the board and documents live support boundaries', async () => {
    const app = await source('app.js');
    const server = await source('server/index.ts');
    expect(app).toContain('if (!isReplayShape(replay)) throw new Error');
    expect(app).toContain("$('#replay-error-message').textContent");
    expect(app).toContain("$('#replay-content').hidden = true");
    expect(server).toContain("/tournaments/:id/matches/:matchId/live");
    expect(server).toContain("requireRole('organizer')");
    expect(app).not.toContain('WebSocket');
    expect(app).not.toContain('EventSource');
  });
});
