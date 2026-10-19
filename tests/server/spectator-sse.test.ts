import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:http';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { appExport, closeServer, initServer, startServer, getTournamentManager } from '../../server/index.js';
import { createControlledAccount } from '../../server/admin/role-bootstrap.js';
import { createTournament } from '../../tournament/persistence.js';
import type { LiveMatchSnapshot } from '../../match-runner/types.js';

const password = 'correct horse battery staple';

function makeSnapshot(matchId: string, sequence: number, turn: number): LiveMatchSnapshot {
  return {
    matchId,
    gameNumber: 1,
    status: 'in_progress',
    sequence,
    turn,
    currentPlayer: 'A',
    state: {
      boardSize: 9,
      currentPlayer: 'A',
      turn,
      pieces: [],
      status: 'playing',
      winner: null,
      winReason: null,
      lastMove: null,
    },
    latestMove: null,
    updatedAt: new Date(1000 * sequence).toISOString(),
  };
}

describe('Spectator SSE stream routing and concurrency', () => {
  let dir: string;
  let server: http.Server;
  let port: number;
  let viewerCookie: string;
  const tournamentId = 'sse-tournament';
  const match1Id = 'sse-match-1';
  const match2Id = 'sse-match-2';

  async function writeFixture() {
    const tournament = createTournament(tournamentId, 'SSE tournament fixture');
    tournament.status = 'running';
    tournament.startedAt = new Date().toISOString();
    tournament.participants = [
      { participantId: 'P1', name: 'Alpha', bot: { botId: 'bot-1', player: 'A', command: 'mock', args: [] }, registeredAt: new Date().toISOString() },
      { participantId: 'P2', name: 'Beta', bot: { botId: 'bot-2', player: 'B', command: 'mock', args: [] }, registeredAt: new Date().toISOString() },
      { participantId: 'P3', name: 'Gamma', bot: { botId: 'bot-3', player: 'A', command: 'mock', args: [] }, registeredAt: new Date().toISOString() },
      { participantId: 'P4', name: 'Delta', bot: { botId: 'bot-4', player: 'B', command: 'mock', args: [] }, registeredAt: new Date().toISOString() },
    ];
    tournament.rounds = [
      {
        roundNumber: 1,
        pairings: [
          {
            pairingId: 'P1-v-P2-r1',
            roundNumber: 1,
            participantA: 'P1',
            participantB: 'P2',
            status: 'in_progress',
            matchId: match1Id,
            matchResult: null,
            startedAt: new Date().toISOString(),
            completedAt: null,
          },
          {
            pairingId: 'P3-v-P4-r1',
            roundNumber: 1,
            participantA: 'P3',
            participantB: 'P4',
            status: 'in_progress',
            matchId: match2Id,
            matchResult: null,
            startedAt: new Date().toISOString(),
            completedAt: null,
          },
        ],
      },
    ];

    const tournamentDir = path.join(dir, tournamentId);
    await fs.mkdir(tournamentDir, { recursive: true });
    await fs.writeFile(path.join(tournamentDir, 'tournament.json'), JSON.stringify(tournament, null, 2));
  }

  const openSockets = new Set<import('node:net').Socket>();

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-spectator-sse-'));
    const viewerAccount = await createControlledAccount(path.join(dir, 'arena.sqlite'), `viewer${Date.now()}`, password, 'competitor');
    await writeFixture();
    await initServer(dir);

    // Login viewer to get session cookie
    const loginRes = await request(appExport).post('/api/auth/login').send({ username: viewerAccount.username, password });
    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers['set-cookie'];
    viewerCookie = Array.isArray(cookies) ? cookies.join('; ') : cookies || '';

    // Start ephemeral server directly with the initialized appExport
    server = http.createServer(appExport);
    server.on('connection', socket => {
      openSockets.add(socket);
      socket.on('close', () => openSockets.delete(socket));
    });
    await new Promise<void>(resolve => server.listen(0, () => resolve()));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const socket of openSockets) {
      socket.destroy();
    }
    openSockets.clear();
    await new Promise<void>(resolve => server.close(() => resolve()));
    closeServer();
    await fs.rm(dir, { recursive: true, force: true });
  });

  function connectSse(matchId: string) {
    const received: any[] = [];
    let resolveInitial!: () => void;
    const initialPromise = new Promise<void>(r => { resolveInitial = r; });

    const req = http.request({
      hostname: 'localhost',
      port,
      path: `/api/tournaments/${tournamentId}/spectator/matches/${matchId}/live/stream`,
      method: 'GET',
      headers: {
        Cookie: viewerCookie,
      },
    });

    req.on('response', res => {
      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const block of lines) {
          const match = block.match(/^data:\s*(.+)$/m);
          if (match) {
            try {
              const parsed = JSON.parse(match[1]);
              received.push(parsed);
              resolveInitial();
            } catch {}
          }
        }
      });
    });

    req.end();
    return { req, received, initialPromise };
  }

  it('routes live events independently to concurrent SSE streams without cross-talk', async () => {
    const manager = getTournamentManager() as any;

    // Connect SSE client 1 to Match 1
    const stream1 = connectSse(match1Id);
    // Connect SSE client 2 to Match 2
    const stream2 = connectSse(match2Id);

    // Wait for initial connection frames (e.g. status: 'unavailable' or initial state)
    await Promise.all([stream1.initialPromise, stream2.initialPromise]);

    // Clear initial frames to test live event multiplexing
    stream1.received.length = 0;
    stream2.received.length = 0;

    // Publish interleaved snapshots for Match 1 and Match 2
    manager.publishLiveSnapshot(tournamentId, makeSnapshot(match1Id, 1, 1));
    manager.publishLiveSnapshot(tournamentId, makeSnapshot(match2Id, 1, 1));
    manager.publishLiveSnapshot(tournamentId, makeSnapshot(match1Id, 2, 2));
    manager.publishLiveSnapshot(tournamentId, makeSnapshot(match2Id, 2, 2));

    // Allow event queue to drain
    await new Promise(r => setTimeout(r, 100));

    // Verify stream 1 received ONLY match 1 events
    expect(stream1.received.length).toBe(2);
    expect(stream1.received.every(e => e.matchId === match1Id)).toBe(true);
    expect(stream1.received.map(e => e.snapshot.sequence)).toEqual([1, 2]);

    // Verify stream 2 received ONLY match 2 events
    expect(stream2.received.length).toBe(2);
    expect(stream2.received.every(e => e.matchId === match2Id)).toBe(true);
    expect(stream2.received.map(e => e.snapshot.sequence)).toEqual([1, 2]);

    // Close connections
    stream1.req.destroy();
    stream2.req.destroy();

    // Verify subscribers cleanup
    await new Promise(r => setTimeout(r, 50));
    expect(manager.liveSubscribers.get(`${tournamentId}:${match1Id}`)).toBeUndefined();
    expect(manager.liveSubscribers.get(`${tournamentId}:${match2Id}`)).toBeUndefined();
  });

  it('delivers pre-cached initial snapshot immediately upon connecting', async () => {
    const manager = getTournamentManager() as any;

    // Publish a snapshot BEFORE client connects
    manager.publishLiveSnapshot(tournamentId, makeSnapshot(match1Id, 5, 5));

    // Connect SSE client
    const stream = connectSse(match1Id);
    await stream.initialPromise;

    expect(stream.received.length).toBeGreaterThanOrEqual(1);
    expect(stream.received[0].matchId).toBe(match1Id);
    expect(stream.received[0].snapshot.sequence).toBe(5);

    stream.req.destroy();
  });
});
