import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readAssembledFrontendMarkup, readAssembledFrontendStyles } from './frontend-fixtures';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('UX.6 replay and live-match presentation', () => {
  it('exposes a keyboard-operable exact replay position control and responsive hierarchy', async () => {
    const [page, css] = await Promise.all([readAssembledFrontendMarkup(), readAssembledFrontendStyles()]);
    expect(page).toContain('id="replay-content"');
    expect(page).toContain('id="replay-scrubber"');
    expect(page).toContain('type="range"');
    expect(page).toContain('id="r-selected-move"');
    expect(page).toContain('id="r-board"');
    expect(page).toContain('id="replay-timeline"');
    expect(css).toContain('prefers-reduced-motion: reduce');
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

  it('keeps fixed series identities separate from the current game sides for organizer live data', async () => {
    const [app, server] = await Promise.all([source('app.js'), source('server/index.ts')]);
    expect(server).toContain('currentParticipants:');
    expect(server).toContain('competitorA: fixedParticipantA');
    expect(server).toContain('competitorB: fixedParticipantB');
    expect(app).toContain('const currentParticipants = snapshot.currentParticipants || participants;');
    expect(app).toContain('updateReplaySeriesSideColors');
  });

  it('swaps piece-count icon colors with the current game side', async () => {
    const css = await readAssembledFrontendStyles();
    expect(css).toContain('.replay-player-a-label.is-current-side-b .replay-count-icon');
    expect(css).toContain('.replay-player-b-label.is-current-side-a .replay-count-icon');
  });

  it('uses the aggregate series winner when the selected game swaps A/B sides', async () => {
    const replay = await source('js/replay.js');
    expect(replay).toContain('const winner = replay?.series?.winner ?? replay?.winner;');
    expect(replay).toContain("const identity = replay.participantIdentities?.[winner]?.participantName;");
  });

  it('navigates completed series games by durable game replay IDs', async () => {
    const [app, server, spectator, manager] = await Promise.all([
      source('app.js'),
      source('server/index.ts'),
      source('server/spectator.ts'),
      source('tournament/manager.ts'),
    ]);
    expect(app).toContain('availableSeriesReplayIndexes');
    expect(app).toContain('const requestedGameIndex = replay.series?.games?.findIndex(game => game.matchId === matchId');
    expect(app).toContain('const requestedGameNumber = seriesContext?.games?.find(game => game.matchId === matchId)?.gameNumber;');
    expect(app).toContain('Number(game.gameNumber) === Number(requestedGameNumber)');
    expect(app).toContain('availableIndexes.includes(requestedGameIndex)');
    expect(app).toContain('if (!isReplayShape(game?.replay)) return;');
    expect(server).toContain('item.matchResult?.series?.games.some(game => game.matchId === requestedId)');
    expect(spectator).toContain('matchId: game.replay.matchId');
    expect(manager).toContain('const storedGameReplay = game.matchId');
  });

  it('does not dereference missing or corrupt series replay games', async () => {
    const app = await source('app.js');
    expect(app).toContain('button.disabled = !available;');
    expect(app).toContain('Series không có ván nào có dữ liệu xem lại hợp lệ.');
    expect(app).toContain('if (replay.series && !availableSeriesReplayIndexes(replay).length)');
  });
});
