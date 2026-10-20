import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildStaticReplayPreview } from '../../scripts/build-static-replay-preview.mjs';

const roots: string[] = [];

function replay() {
  const state = (row = 0, col = 0) => ({ boardSize: 9, currentPlayer: 'A', turn: 1, pieces: [{ id: 'p-1', type: 'dam', player: 'A', row, col }] });
  const game = (matchId: string, participantA: string, participantB: string, winnerParticipantId: string) => ({
    gameNumber: Number(matchId.slice(-1)), matchId, participantA, participantB, winner: 'A', winnerParticipantId,
    replay: {
      matchId, protocolVersion: '0.1.0', initialState: state(), moves: [{ turn: 1, player: 'A', pieceId: 'p-1', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }],
      finalState: state(0, 1), winner: 'A', terminationReason: 'goal_reached',
      participantIdentities: { A: { participantId: participantA, participantName: participantA === 'p-a' ? 'Alice' : 'Bob' }, B: { participantId: participantB, participantName: participantB === 'p-a' ? 'Alice' : 'Bob' } },
    },
  });
  return {
    matchId: 'match-1',
    protocolVersion: '0.1.0',
    initialState: state(),
    moves: [{ turn: 1, player: 'A', pieceId: 'p-1', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }],
    finalState: { ...state(0, 1), winner: 'A' },
    winner: 'A',
    terminationReason: 'goal_reached',
    participantIdentities: { A: { participantId: 'p-a', participantName: 'Alice' }, B: { participantId: 'p-b', participantName: 'Bob' } },
    series: { format: 'bo3', bestOf: 3, winsA: 2, winsB: 1, winner: 'A', participantIdentities: { A: { participantId: 'p-a', participantName: 'Alice' }, B: { participantId: 'p-b', participantName: 'Bob' } }, games: [game('game-1', 'p-a', 'p-b', 'p-a'), game('game-2', 'p-b', 'p-a', 'p-b'), game('game-3', 'p-a', 'p-b', 'p-a')] },
  };
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-static-replay-'));
  roots.push(root);
  const exportDir = path.join(root, 'export');
  const outputDir = path.join(root, 'site');
  const tournamentId = 'published-qa';
  const value = Buffer.from(JSON.stringify(replay()));
  const hash = crypto.createHash('sha256').update(value).digest('hex');
  const entry = { matchId: 'match-1', replayHash: hash, sha256: hash, path: `tournaments/${tournamentId}/matches/match-1-${hash}.json` };
  await fs.mkdir(path.join(exportDir, 'tournaments', tournamentId, 'matches'), { recursive: true });
  await fs.writeFile(path.join(exportDir, entry.path), value);
  await fs.writeFile(path.join(exportDir, 'tournaments', tournamentId, 'index.json'), JSON.stringify({ schemaVersion: 1, status: 'published', tournamentId, entries: [entry] }));
  return { root, exportDir, outputDir, tournamentId, hash };
}

function serve(root: string) {
  const server = http.createServer(async (request, response) => {
    const relative = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`)) { response.writeHead(400); response.end(); return; }
    try {
      let body;
      try { body = await fs.readFile(file); }
      catch (error) { if (path.extname(file) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; body = await fs.readFile(`${file}.html`); }
      response.writeHead(200); response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  return new Promise<{ server: http.Server; url: string }>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/` }));
  });
}

afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

describe('static replay preview packaging', () => {
  it('builds an isolated Cloudflare-compatible site from a published sanitized export', async () => {
    const data = await fixture();
    const output = await buildStaticReplayPreview({ exportDir: data.exportDir, outputDir: data.outputDir, baseUrl: './' });
    const preview = await serve(output);
    try {
      const index = await (await fetch(`${preview.url}?tournamentId=${data.tournamentId}&matchId=match-1`)).text();
      expect(index).toContain('./static-preview-loader.js');
      expect(index).toContain('./static-preview-bootstrap.js');
      expect(index).toContain('<link rel="icon" href="data:,">');
      expect(await (await fetch(`${preview.url}tournaments/${data.tournamentId}/index.json`)).json()).toMatchObject({ status: 'published', tournamentId: data.tournamentId });
      expect(await (await fetch(`${preview.url}tournaments/${data.tournamentId}/matches/match-1-${data.hash}.json`)).text()).toContain('Alice');
      const bootstrap = await (await fetch(`${preview.url}static-preview-bootstrap.js`)).text();
      expect(bootstrap).toContain('OTT_PUBLIC_REPLAY_STATIC_ONLY = true');
      expect(bootstrap).not.toContain('state.user =');
      expect(await (await fetch(`${preview.url}views/pages/replay`)).status).toBe(200);
      const replayPage = await (await fetch(`${preview.url}views/pages/replay`)).text();
      expect(replayPage).toContain('id="btn-replay-play"');
      expect(replayPage).toContain('id="btn-replay-prev"');
      expect(replayPage).toContain('id="btn-replay-next"');
      const headers = await fs.readFile(path.join(output, '_headers'), 'utf8');
      expect(headers.split('\n').some(line => (line.match(/\*/g) || []).length > 1)).toBe(false);
      expect(headers).toContain('/tournaments/:tournament/index.json\n  Cache-Control: public, max-age=60, must-revalidate');
      expect(headers).toContain('/tournaments/:tournament/matches/:replay.json\n  Cache-Control: public, max-age=31536000, immutable');
      const [navigation, events, replaySource] = await Promise.all([
        fs.readFile(new URL('../../js/navigation.js', import.meta.url), 'utf8'),
        fs.readFile(new URL('../../js/events.js', import.meta.url), 'utf8'),
        fs.readFile(new URL('../../js/replay.js', import.meta.url), 'utf8'),
      ]);
      expect(navigation).toContain("staticReplayOnly && view === 'replay-view'");
      expect(events).toContain("window.OTT_PUBLIC_REPLAY_STATIC_ONLY === true");
      expect(replaySource).toContain("(!state.user && !staticReplayOnly)");
    } finally { await new Promise<void>(resolve => preview.server.close(() => resolve())); }
  });

  it('rejects revoked exports and hash-corrupt fixtures before packaging', async () => {
    const data = await fixture();
    const manifestPath = path.join(data.exportDir, 'tournaments', data.tournamentId, 'index.json');
    await fs.writeFile(manifestPath, JSON.stringify({ schemaVersion: 1, status: 'revoked', tournamentId: data.tournamentId, entries: [] }));
    await expect(buildStaticReplayPreview({ exportDir: data.exportDir, outputDir: data.outputDir })).rejects.toThrow(/published/);
  });
});
