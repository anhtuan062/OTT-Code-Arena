import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { appExport, closeServer, getTournamentManager, initServer } from '../../server/index.js';
import { createControlledAccount } from '../../server/admin/role-bootstrap.js';
import { applicationMetrics } from '../../observability/metrics.js';
import type { LiveMatchSnapshot } from '../../match-runner/types.js';

type LoadResult = { status: number; latencyMs: number; error?: string };

const password = 'correct horse battery staple';
const levels = [8, 32, 64, 128, 256, 512];

function quantile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
}

function snapshot(matchId: string, sequence: number): LiveMatchSnapshot {
  return {
    matchId, gameNumber: 1, status: 'in_progress', sequence, turn: sequence,
    currentPlayer: 'A',
    state: { boardSize: 9, currentPlayer: 'A', turn: sequence, pieces: [], status: 'playing', winner: null, winReason: null, lastMove: null },
    latestMove: null, updatedAt: new Date().toISOString(),
  };
}

describe('M6 progressive single-laptop API load', () => {
  let dir: string;
  let server: http.Server;
  let loadHttpAgent: http.Agent;
  let port: number;
  let organizer: request.SuperAgentTest;
  let competitor: request.SuperAgentTest;
  let organizerCsrf: string;
  let competitorCsrf: string;
  let organizerCookie: string;
  let competitorCookie: string;
  let submitBotId: string;
  let submitRevisionId: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-m6-qa-'));
    const dbPath = path.join(dir, 'arena.sqlite');
    const owner = await createControlledAccount(dbPath, `m6owner${Date.now()}`, password, 'organizer');
    const user = await createControlledAccount(dbPath, `m6user${Date.now()}`, password, 'competitor');
    await initServer(dir);

    organizer = request.agent(appExport);
    competitor = request.agent(appExport);
    const ownerLogin = await organizer.post('/api/auth/login').send({ username: owner.username, password });
    const userLogin = await competitor.post('/api/auth/login').send({ username: user.username, password });
    organizerCsrf = ownerLogin.body.csrfToken;
    competitorCsrf = userLogin.body.csrfToken;
    organizerCookie = (ownerLogin.headers['set-cookie'] ?? []).join('; ');
    competitorCookie = (userLogin.headers['set-cookie'] ?? []).join('; ');

    const bot = await competitor.post('/api/bots').set('x-csrf-token', competitorCsrf).send({ name: 'M6 bot', command: 'node', args: [] });
    const revision = await competitor.post(`/api/bots/${bot.body.id}/revisions`).set('x-csrf-token', competitorCsrf)
      .send({ runtimeId: 'cpp', executionMode: 'raw', source: 'int main() { return 0; }' });
    submitBotId = bot.body.id;
    submitRevisionId = revision.body.revisionId;

    const manager = getTournamentManager();
    await manager.createTournament('m6-public', 'M6 public', 'single_round_robin');
    await manager.createTournament('m6-submit', 'M6 submit', 'single_round_robin');
    await manager.createTournament('m6-live', 'M6 live', 'single_round_robin');
    await manager.openRegistration('m6-submit');
    const repository = (manager as any).repository;
    const publicTournament = (await manager.loadTournament('m6-public')).data!;
    publicTournament.status = 'completed';
    publicTournament.resultsPublishedAt = new Date().toISOString();
    await repository.save(publicTournament);
    const submitTournament = (await manager.loadTournament('m6-submit')).data!;
    submitTournament.metadata = { ...(submitTournament.metadata ?? {}), ownerId: owner.id };
    await repository.save(submitTournament);
    const liveTournament = (await manager.loadTournament('m6-live')).data!;
    liveTournament.status = 'running';
    liveTournament.startedAt = new Date().toISOString();
    liveTournament.participants = [
      { participantId: 'm6-p1', name: 'Alpha', bot: { botId: 'm6-b1', player: 'A', command: 'mock', args: [] }, registeredAt: new Date().toISOString() },
      { participantId: 'm6-p2', name: 'Beta', bot: { botId: 'm6-b2', player: 'B', command: 'mock', args: [] }, registeredAt: new Date().toISOString() },
    ];
    liveTournament.rounds = [{ roundNumber: 1, pairings: [{ pairingId: 'm6-p1-v-m6-p2-r1', roundNumber: 1, participantA: 'm6-p1', participantB: 'm6-p2', status: 'in_progress', matchId: 'm6-live-match', matchResult: null, startedAt: new Date().toISOString(), completedAt: null }] }];
    await repository.save(liveTournament);
    (manager as any).publishLiveSnapshot('m6-live', snapshot('m6-live-match', 1));

    server = http.createServer(appExport);
    loadHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 128, maxFreeSockets: 16 });
    await new Promise<void>(resolve => server.listen({ port: 0, host: '127.0.0.1', backlog: 2048 }, () => resolve()));
    port = (server.address() as { port: number }).port;
  });

  afterEach(async () => {
    loadHttpAgent.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    closeServer();
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function requestPath(agent: request.SuperAgentTest, method: 'get' | 'post', route: string, body?: unknown): Promise<LoadResult> {
    const started = performance.now();
    if (method === 'get') {
      return await new Promise<LoadResult>(resolve => {
        const req = http.request({
          hostname: '127.0.0.1', port, path: route, method: 'GET',
          agent: loadHttpAgent,
          headers: { Cookie: agent === organizer ? organizerCookie : competitorCookie },
        }, response => {
          response.resume();
          response.once('end', () => resolve({ status: response.statusCode ?? 599, latencyMs: performance.now() - started }));
        });
        req.setTimeout(10_000, () => req.destroy(new Error('load request timeout')));
        req.once('error', error => resolve({ status: 599, latencyMs: performance.now() - started, error: error.message.slice(0, 120) }));
        req.end();
      });
    }
    try {
      const response = method === 'get' ? await agent.get(route) : await agent.post(route).set('x-csrf-token', competitorCsrf).send(body);
      return { status: response.status, latencyMs: performance.now() - started };
    } catch (error) {
      return { status: 599, latencyMs: performance.now() - started, error: error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120) };
    }
  }

  async function openSse(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/api/tournaments/m6-live/spectator/matches/m6-live-match/live/stream', headers: { Cookie: competitorCookie } });
      req.once('error', reject);
      req.once('response', response => {
        response.once('data', () => { req.destroy(); resolve(); });
        response.once('error', reject);
      });
      req.end();
    }).catch(() => undefined);
  }

  it('stops at the first unsafe level and verifies integrity after progressive mixed reads', async () => {
    const duplicateRequests = await Promise.all(Array.from({ length: 8 }, () => competitor
      .post('/api/tournaments/m6-submit/participation-requests')
      .set('x-csrf-token', competitorCsrf)
      .send({ botId: submitBotId, revisionId: submitRevisionId, participantName: 'M6 participant' })));
    console.log(`M6 duplicate submission statuses: ${duplicateRequests.map(response => `${response.status}:${response.body?.error ?? ''}`).join('|')}`);
    expect(duplicateRequests.filter(response => response.status === 201)).toHaveLength(1);
    expect(duplicateRequests.every(response => [201, 409].includes(response.status))).toBe(true);

    const baselineMemory = process.memoryUsage().rss;
    const verified: Array<{ level: number; batchMs: number; throughputRps: number; p50: number; p95: number; p99: number; errors: number; statusCounts: Record<string, number>; updateOk: boolean; cacheHits: number; cacheMisses: number; sourceReads: number; sessionTouchUpdates: number; sessionTouchSkips: number; eventLoopP95: number | null; rssDeltaMB: number; persistenceReadP95: number | null; persistenceWriteP95: number | null; persistenceCommitP95: number | null; capacity: string | undefined }> = [];
    let stopReason: string | null = null;
    for (const level of levels) {
      const before = applicationMetrics.snapshot();
      const requests: Promise<LoadResult>[] = [];
      for (let i = 0; i < level; i++) {
        const lane = i % 9;
        if (lane === 0) requests.push(requestPath(organizer, 'get', '/api/tournaments'));
        else if (lane === 1) requests.push(requestPath(competitor, 'get', '/api/tournaments/m6-public'));
        else if (lane === 2) requests.push(requestPath(competitor, 'get', '/api/tournaments/m6-public/progress'));
        else if (lane === 3) requests.push(requestPath(competitor, 'get', '/api/tournaments/m6-public/stages?compact=true'));
        else if (lane === 4) requests.push(requestPath(competitor, 'get', '/api/tournaments/m6-public/standings'));
        else if (lane === 5) requests.push(requestPath(competitor, 'get', '/api/tournaments/m6-public/stats'));
        else if (lane === 6) requests.push(requestPath(competitor, 'get', '/api/tournaments/m6-live/spectator/matches/m6-live-match/live'));
        else if (lane === 7) requests.push(requestPath(organizer, 'get', '/api/system/metrics'));
        else requests.push(requestPath(competitor, 'get', '/api/tournaments/m6-submit/participation-requests/mine'));
      }
      const update = getTournamentManager().updateMetadata('m6-public', { m6LoadEpoch: Date.now() }).then(() => true).catch(() => false);
      const batchStarted = performance.now();
      const [results, updateOk] = await Promise.all([
        Promise.all(requests), update,
        Promise.all(Array.from({ length: Math.min(8, level) }, () => openSse())),
      ]).then(([requestResults, updateResult]) => [requestResults, updateResult] as const);
      const batchMs = performance.now() - batchStarted;
      const after = applicationMetrics.snapshot();
      const latencies = results.map(result => result.latencyMs);
      const errors = results.filter(result => result.status < 200 || result.status >= 400).length;
      const statusCounts = results.reduce<Record<string, number>>((counts, result) => {
        counts[String(result.status)] = (counts[String(result.status)] ?? 0) + 1;
        return counts;
      }, {});
      const transportErrors = results.filter(result => result.error).reduce<Record<string, number>>((counts, result) => {
        const key = result.error!.split(':')[0] ?? 'unknown';
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {});
      const cacheDelta = (name: string) => (after.counters[name] ?? 0) - (before.counters[name] ?? 0);
      const row = {
        level, batchMs, throughputRps: level / (batchMs / 1_000), p50: quantile(latencies, .5), p95: quantile(latencies, .95), p99: quantile(latencies, .99), errors, statusCounts, transportErrors, updateOk,
        cacheHits: cacheDelta('cache.projection.hits'), cacheMisses: cacheDelta('cache.projection.misses'), sourceReads: cacheDelta('cache.projection.source_reads'),
        sessionTouchUpdates: cacheDelta('session.touch_updates'), sessionTouchSkips: cacheDelta('session.touch_skips'),
        eventLoopP95: after.eventLoop.delayMs.p95, rssDeltaMB: (process.memoryUsage().rss - baselineMemory) / (1024 * 1024),
        persistenceReadP95: after.histograms['persistence.read_ms']?.p95 ?? null,
        persistenceWriteP95: after.histograms['persistence.write_ms']?.p95 ?? null,
        persistenceCommitP95: after.histograms['persistence.commit_ms']?.p95 ?? null,
        capacity: after.statuses['host.capacity.state'],
      };
      verified.push(row);
      if (errors / level > .02) stopReason = `error-rate ${(errors / level * 100).toFixed(1)}% exceeded 2%`;
      else if (row.p95 >= 2_000) stopReason = `p95 ${row.p95.toFixed(1)}ms exceeded 2000ms`;
      else if (!updateOk) stopReason = 'synthetic state update failed';
      else if ((after.statuses['host.capacity.state'] ?? 'healthy') === 'critical') stopReason = 'M4 capacity entered critical';
      else if (row.rssDeltaMB >= 256) stopReason = 'RSS grew by at least 256MB';
      console.log(`M6 level ${level}: ${JSON.stringify(row)}${stopReason ? ` STOP=${stopReason}` : ''}`);
      if (stopReason) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    const persisted = await (getTournamentManager() as any).repository.load('m6-submit');
    expect(persisted.participationRequests.filter((item: any) => item.competitorId).length).toBe(1);
    expect(verified.length).toBeGreaterThan(0);
    console.log(`M6 load results: ${JSON.stringify(verified)}`);
    console.log(`M6 stop reason: ${stopReason ?? 'all configured levels remained healthy'}`);
  });
});
