import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { RevisionDockerExecutor } from '../../bot-executor/revision-docker-executor.js';
import { DockerExecutor } from '../../bot-executor/docker-executor.js';
import type { BotExecutionResult, BotRequestMessage } from '../../bot-executor/types.js';
import { ExecutionCancelledError } from '../../bot-executor/types.js';
import { appExport, closeServer, initServer } from '../../server/index.js';
import { createControlledAccount } from '../../server/admin/role-bootstrap.js';

const { createLogicalSnapshot } = createRequire(import.meta.url)('../../scripts/phase8.5c-logical-snapshot.cjs');
const success = (input: BotRequestMessage): BotExecutionResult => ({
  success: true, response: { move: input.legal_moves[0]! }, exitCode: 0,
  timedOut: false, stdout: 'fixture output', stderr: '', durationMs: 1,
});
const timeout = (): BotExecutionResult => ({
  success: false, error: { code: 'TIMEOUT', message: 'Bot timed out after 2000ms', stage: 'timeout' },
  exitCode: null, timedOut: true, stdout: '', stderr: '', durationMs: 2000,
});

describe('Practice HTTP contract (controlled executor; no Docker)', () => {
  let root: string;
  let dir: string;
  let execute: ReturnType<typeof vi.spyOn>;
  let release: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-practice-api-'));
    dir = path.join(root, 'data');
    const image = `ghcr.io/ott/test@sha256:${'a'.repeat(64)}`;
    vi.stubEnv('EXECUTION_POLICY', 'sandbox-required');
    vi.stubEnv('ENABLE_SOURCE_REVISION_EXECUTION', 'true');
    for (const name of ['BOT_DOCKER_IMAGE', 'BOT_CPP_COMPILER_IMAGE', 'BOT_CPP_RUNTIME_IMAGE', 'BOT_PYTHON3_RUNTIME_IMAGE']) vi.stubEnv(name, image);
    vi.stubEnv('BOT_TRUSTED_IMAGE_REGISTRIES', 'ghcr.io');
    vi.spyOn(RevisionDockerExecutor.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(DockerExecutor.prototype, 'isAvailable').mockResolvedValue(true);
    execute = vi.spyOn(RevisionDockerExecutor.prototype, 'executeRevision')
      .mockImplementation(async (_context, _revision, input) => success(input));
    release = vi.spyOn(RevisionDockerExecutor.prototype, 'releaseRevisionScope').mockResolvedValue(true);
    await initServer(dir);
  });

  afterEach(async () => {
    closeServer();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(root, { recursive: true, force: true });
  });

  async function competitor(runtimeId = 'cpp') {
    const agent = request.agent(appExport);
    const auth = await agent.post('/api/auth/register').send({
      username: `practice${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      password: randomUUID() + 'Aa9!',
    });
    expect(auth.status).toBe(201);
    const csrf = auth.body.csrfToken;
    const bot = await agent.post('/api/bots').set('x-csrf-token', csrf).send({ name: 'Practice fixture', command: 'node', args: [] });
    expect(bot.status).toBe(201);
    const source = await fs.readFile(path.join(process.cwd(), 'bot-sdk/templates', runtimeId === 'cpp' ? 'cpp17.cpp' : 'python3.py'), 'utf8');
    const revision = await agent.post(`/api/bots/${bot.body.id}/revisions`).set('x-csrf-token', csrf)
      .send({ runtimeId, executionMode: 'strategy', source });
    expect(revision.status).toBe(201);
    const url = `/api/bots/${bot.body.id}/revisions/${revision.body.revisionId}/test`;
    const cookie = (auth.headers['set-cookie'] ?? []).join('; ');
    return { agent, csrf, cookie, url, botId: bot.body.id as string, revision: revision.body };
  }

  function practice(user: Awaited<ReturnType<typeof competitor>>, scenarioId = 'initial') {
    return user.agent.post(user.url).set('x-csrf-token', user.csrf).send({ scenarioId });
  }

  function practiceHttp(user: Awaited<ReturnType<typeof competitor>>, url = user.url, scenarioId = 'initial') {
    return request(appExport).post(url).set('Cookie', user.cookie).set('x-csrf-token', user.csrf).send({ scenarioId });
  }

  async function additionalRevision(user: Awaited<ReturnType<typeof competitor>>) {
    const source = await fs.readFile(path.join(process.cwd(), 'bot-sdk/templates/cpp17.cpp'), 'utf8');
    const revision = await user.agent.post(`/api/bots/${user.botId}/revisions`).set('x-csrf-token', user.csrf)
      .send({ runtimeId: 'cpp', executionMode: 'strategy', source });
    expect(revision.status).toBe(201);
    return { agent: user.agent, csrf: user.csrf, cookie: user.cookie, url: `/api/bots/${user.botId}/revisions/${revision.body.revisionId}/test` };
  }

  function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
    return { promise, resolve, reject };
  }

  it.each(['cpp', 'python3'])('accepts first engine-legal Strategy moves in all %s scenarios', async runtime => {
    const user = await competitor(runtime);
    for (const scenarioId of ['initial', 'capture', 'near-goal']) {
      const response = await practice(user, scenarioId);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ valid: true, accepted: true, scenarioId, runtimeId: runtime, executionMode: 'strategy' });
      expect(response.body.legalMoves).toContainEqual(expect.objectContaining({
        pieceId: response.body.move.piece_id, from: response.body.move.from, to: response.body.move.to,
      }));
      if (scenarioId === 'capture') {
        expect(response.body.legalMoves.some((move: { captures: string | null }) => move.captures !== null)).toBe(true);
        expect(response.body.capture).toBeNull();
      }
    }
  });

  it('reuses one revision scope for a fixed-opponent match and releases it afterwards', async () => {
    const user = await competitor('cpp');
    const response = await user.agent
      .post(`/api/bots/${user.botId}/revisions/${user.revision.revisionId}/test-match`)
      .set('x-csrf-token', user.csrf).send({});
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ mode: 'fixed-opponent', status: 'completed' });
    expect(execute.mock.calls.length).toBeGreaterThan(1);
    const scopes = execute.mock.calls.map(call => call[0]?.revisionScopeId);
    expect(scopes.every(scope => typeof scope === 'string' && scope === scopes[0])).toBe(true);
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(scopes[0]);
  });

  it('releases a fixed-opponent lock when execution is cancelled', async () => {
    const user = await competitor('cpp');
    execute.mockRejectedValueOnce(new ExecutionCancelledError());
    const url = `/api/bots/${user.botId}/revisions/${user.revision.revisionId}/test-match`;
    expect((await user.agent.post(url).set('x-csrf-token', user.csrf).send({})).status).toBe(503);
    expect(release).toHaveBeenCalledOnce();
    execute.mockImplementation(async (_context: unknown, _revision: unknown, input: BotRequestMessage) => success(input));
    expect((await user.agent.post(url).set('x-csrf-token', user.csrf).send({})).status).toBe(200);
  });

  it('rejects the 21st chargeable request per Competitor, isolates users, and resets after 15 minutes', async () => {
    const user = await competitor();
    const other = await competitor('python3');
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    for (let index = 1; index <= 20; index++) expect((await practice(user)).status, `request ${index}`).toBe(200);
    expect((await practice(user)).status).toBe(429);
    expect(execute).toHaveBeenCalledTimes(20);
    expect((await practice(other)).status).toBe(200);
    clock.mockReturnValue(now + 15 * 60 * 1000);
    expect((await practice(user)).status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(22);
  });

  it('charges failures and returns the TIMEOUT 422 envelope without accepting a move', async () => {
    const user = await competitor();
    execute.mockResolvedValue(timeout());
    for (let index = 1; index <= 20; index++) {
      const response = await practice(user);
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        valid: false, status: 'failed', code: 'TIMEOUT', scenarioId: 'initial',
        diagnostic: { stage: 'timeout', runtimeId: 'cpp', executionMode: 'strategy', engineAcceptedMove: false },
      });
      expect(response.body.error).toEqual(expect.any(String));
    }
    expect((await practice(user)).status).toBe(429);
    expect(execute).toHaveBeenCalledTimes(20);
  });

  it('exposes bounded timing metadata without inventing separate Docker startup or Bot timings', async () => {
    const user = await competitor();
    execute.mockResolvedValue({ ...timeout(), timings: {
      imageReadinessMs: 2, compilationContainerMs: 30_001, runtimeContainerMs: null,
      runtimeStartupMs: null, botExecutionMs: null, cleanupMs: 12,
      cleanupSucceeded: true, totalMs: 30_015, compileBudgetMs: 30_000,
      runtimeBudgetMs: 2_000, timeoutPhase: 'compilation',
    } });
    const response = await practice(user);
    expect(response.status).toBe(422);
    expect(response.body.timings).toMatchObject({
      compilationContainerMs: 30_001, runtimeContainerMs: null,
      runtimeStartupMs: null, botExecutionMs: null, cleanupSucceeded: true,
      compileBudgetMs: 30_000, runtimeBudgetMs: 2_000, timeoutPhase: 'compilation',
      practiceRequestMs: expect.any(Number),
    });
    expect(response.body.timings.practiceRequestMs).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ['compilation', 'COMPILATION_TIMEOUT', 'compilation_timeout', 'Biên dịch C++ quá thời gian cho phép.'],
    ['runtime', 'RUNTIME_TIMEOUT', 'runtime_timeout', 'Bot thực thi quá thời gian cho phép.'],
  ] as const)('labels %s timeout without exposing another user’s diagnostic', async (phase, code, stage, message) => {
    const owner = await competitor();
    const other = await competitor();
    execute.mockResolvedValue({
      ...timeout(),
      error: { code, message: 'executor internal timeout', stage },
      timings: {
        imageReadinessMs: 0,
        compilationContainerMs: 30_001,
        runtimeContainerMs: phase === 'runtime' ? 2_001 : null,
        runtimeStartupMs: null, botExecutionMs: null, cleanupMs: 1,
        cleanupSucceeded: true, totalMs: 30_010,
        compileBudgetMs: 30_000, runtimeBudgetMs: 2_000, timeoutPhase: phase,
      },
    });
    const response = await practice(owner);
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      valid: false, status: 'failed', code, error: message,
      diagnostic: { stage, engineAcceptedMove: false, outputProduced: false },
      timings: { timeoutPhase: phase },
    });
    expect(response.body).not.toHaveProperty('move');
    expect((await request(appExport).post(owner.url).send({ scenarioId: 'initial' })).status).toBe(401);
    expect((await other.agent.post(owner.url).set('x-csrf-token', other.csrf).send({ scenarioId: 'initial' })).status).toBe(404);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('bounds global concurrency, charges capacity/duplicate rejections and releases slots after timeout', async () => {
    const a = await competitor();
    const b = await competitor();
    const c = await competitor();
    const finish: Array<(result: BotExecutionResult) => void> = [];
    execute.mockImplementation(() => new Promise(resolve => finish.push(resolve)));
    const first = practice(a).then(response => response);
    await vi.waitFor(() => expect(finish).toHaveLength(1));
    expect((await practice(a)).status).toBe(409);
    const second = practice(b).then(response => response);
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    expect((await practice(c)).status).toBe(429);
    expect(execute).toHaveBeenCalledTimes(2);
    finish[0]!(timeout()); finish[1]!(timeout());
    expect((await first).status).toBe(422);
    expect((await second).status).toBe(422);
    execute.mockImplementation(async (_context: unknown, _revision: unknown, input: BotRequestMessage) => success(input));
    // c's rejected capacity request already consumed one quota entry.
    for (let index = 0; index < 19; index++) expect((await practice(c)).status).toBe(200);
    expect((await practice(c)).status).toBe(429);
    // a has one timeout and one duplicate rejection: eighteen entries remain.
    for (let index = 0; index < 18; index++) expect((await practice(a)).status).toBe(200);
    expect((await practice(a)).status).toBe(429);
  });

  it('enforces per-user admission across two revisions with deterministic overlap and cleanup', async () => {
    const user = await competitor();
    const secondRevision = await additionalRevision(user);
    const other = await competitor('python3');
    const third = await competitor();
    const firstStarted = deferred<void>();
    const secondStarted = deferred<void>();
    const thirdStarted = deferred<void>();
    const finishers: Array<(result: BotExecutionResult) => void> = [];
    const inputs: BotRequestMessage[] = [];
    let invocation = 0;
    execute.mockImplementation(async (_context: unknown, _revision: unknown, input: BotRequestMessage) => {
      invocation += 1;
      if (invocation === 1) firstStarted.resolve();
      if (invocation === 2) secondStarted.resolve();
      if (invocation === 3) thirdStarted.resolve();
      inputs.push(input);
      return new Promise(resolve => finishers.push(resolve));
    });

    const first = practiceHttp(user);
    void first.then(() => undefined, () => undefined);
    await firstStarted.promise;
    const secondRequest = practiceHttp(user, secondRevision.url);
    expect((await secondRequest).status).toBe(429);

    const otherRun = practiceHttp(other);
    void otherRun.then(() => undefined, () => undefined);
    await secondStarted.promise;
    expect((await practiceHttp(third)).status).toBe(429);

    finishers[0]!(timeout());
    expect((await first).status).toBe(422);

    const resumed = practiceHttp(user, secondRevision.url);
    void resumed.then(() => undefined, () => undefined);
    await thirdStarted.promise;
    expect((await practiceHttp(third)).status).toBe(429);
    finishers[2]!(success(inputs[2]!));
    expect((await resumed).status).toBe(200);

    finishers[1]!(success(inputs[1]!));
    expect((await otherRun).status).toBe(200);

    const disconnectStarted = deferred<void>();
    execute.mockImplementationOnce(async () => {
      disconnectStarted.resolve();
      return new Promise(resolve => finishers.push(resolve));
    });
    const disconnected = practiceHttp(user);
    disconnected.end(() => undefined);
    await disconnectStarted.promise;
    disconnected.abort();
    finishers[3]!(timeout());
    await new Promise<void>(resolve => setImmediate(resolve));

    execute.mockImplementation(async (_context: unknown, _revision: unknown, input: BotRequestMessage) => success(input));
    expect((await practice(third)).status).toBe(200);
  }, 15000);

  it('does not charge requests rejected before authorization, CSRF or scenario validation', async () => {
    const user = await competitor();
    for (let index = 0; index < 21; index++) {
      expect((await request(appExport).post(user.url).send({ scenarioId: 'initial' })).status).toBe(401);
      expect((await user.agent.post(user.url).send({ scenarioId: 'initial' })).status).toBe(403);
      expect((await practice(user, 'forged')).status).toBe(400);
    }
    expect(execute).not.toHaveBeenCalled();
    for (let index = 0; index < 20; index++) expect((await practice(user)).status).toBe(200);
    expect((await practice(user)).status).toBe(429);
  });

  it('leaves revisions and official tournament/replay artifacts unchanged on success and timeout', async () => {
    const user = await competitor();
    const snapshot = (name: string) => createLogicalSnapshot({
      repoRoot: process.cwd(), databasePath: path.join(dir, 'arena.sqlite'),
      dataPath: dir, backupPath: path.join(root, `${name}.sqlite`),
    });
    const before = await snapshot('before');
    expect((await practice(user, 'capture')).status).toBe(200);
    execute.mockResolvedValue(timeout());
    expect((await practice(user)).status).toBe(422);
    const after = await snapshot('after');
    expect(after.sha256).toBe(before.sha256);
    expect((await fs.readdir(dir)).some(name => name.startsWith('t-'))).toBe(false);
  });

  it('keeps the practiced Strategy revision pinned after organizer approval and a later Bot selection', async () => {
    const user = await competitor('cpp');
    for (const scenarioId of ['initial', 'capture', 'near-goal']) {
      expect((await practice(user, scenarioId)).body).toMatchObject({ valid: true, accepted: true });
    }
    const selected = await user.agent.post(`/api/bots/${user.botId}/revisions/${user.revision.revisionId}/select`)
      .set('x-csrf-token', user.csrf).send({});
    expect(selected.status).toBe(200);
    const organizerPassword = `${randomUUID()}Aa9!`;
    const account = await createControlledAccount(path.join(dir, 'arena.sqlite'), `org${randomUUID().replaceAll('-', '').slice(0, 12)}`, organizerPassword, 'organizer');
    const organizer = request.agent(appExport);
    const login = await organizer.post('/api/auth/login').send({ username: account.username, password: organizerPassword });
    expect(login.status).toBe(200);
    const organizerCsrf = login.body.csrfToken;
    const tournament = await organizer.post('/api/tournaments').set('x-csrf-token', organizerCsrf)
      .send({ name: 'Strategy journey', visibility: 'public' });
    expect(tournament.status).toBe(201);
    const tournamentId = tournament.body.tournamentId;
    expect((await organizer.post(`/api/tournaments/${tournamentId}/action`).set('x-csrf-token', organizerCsrf)
      .send({ action: 'open_registration' })).status).toBe(200);
    expect((await user.agent.get('/api/tournaments/discoverable')).body.map((item: { tournamentId: string }) => item.tournamentId)).toContain(tournamentId);
    const participation = await user.agent.post(`/api/tournaments/${tournamentId}/participation-requests`)
      .set('x-csrf-token', user.csrf).send({ botId: user.botId, revisionId: user.revision.revisionId, participantName: 'Practice competitor' });
    expect(participation.status).toBe(201);
    expect(participation.body.status).toBe('pending');
    const approved = await organizer.post(`/api/tournaments/${tournamentId}/requests/${participation.body.requestId}/approve`)
      .set('x-csrf-token', organizerCsrf).send({});
    expect(approved.status).toBe(200);
    const pinned = approved.body.participants[0].bot.execution;
    expect(pinned).toMatchObject({ revisionId: user.revision.revisionId, executionMode: 'strategy', sdkDigest: user.revision.sdkDigest });

    const laterSource = await fs.readFile(path.join(process.cwd(), 'bot-sdk/templates/python3.py'), 'utf8');
    const later = await user.agent.post(`/api/bots/${user.botId}/revisions`).set('x-csrf-token', user.csrf)
      .send({ runtimeId: 'python3', executionMode: 'strategy', source: laterSource });
    expect(later.status).toBe(201);
    expect((await user.agent.post(`/api/bots/${user.botId}/revisions/${later.body.revisionId}/select`)
      .set('x-csrf-token', user.csrf).send({})).status).toBe(200);
    expect((await organizer.get(`/api/tournaments/${tournamentId}`)).body.participants[0].bot.execution).toMatchObject(pinned);
    expect((await user.agent.get(`/api/tournaments/${tournamentId}/participation-requests/mine`)).body[0]).toMatchObject({
      revisionId: user.revision.revisionId, status: 'approved',
    });
  });

  it('accepts custom board pieces in single-turn revision test', async () => {
    const user = await competitor('cpp');
    const response = await user.agent.post(user.url).set('x-csrf-token', user.csrf).send({
      customPieces: [
        { player: 'A', type: 'dam', row: 4, col: 4 },
        { player: 'B', type: 'keo', row: 4, col: 5 },
      ],
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ valid: true, accepted: true, scenarioId: 'custom' });
    expect(response.body.state.pieces).toHaveLength(2);
  });

  it('supports testing draft code on custom board pieces without saving revision', async () => {
    const user = await competitor('cpp');
    const source = await fs.readFile(path.join(process.cwd(), 'bot-sdk/templates/cpp17.cpp'), 'utf8');
    const response = await user.agent.post('/api/bots/draft/test').set('x-csrf-token', user.csrf).send({
      source,
      runtimeId: 'cpp',
      executionMode: 'strategy',
      customPieces: [
        { player: 'A', type: 'dam', row: 3, col: 3 },
        { player: 'B', type: 'la', row: 5, col: 5 },
      ],
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ valid: true, accepted: true, scenarioId: 'custom' });
  });

  it('rejects custom board test when Player A does not have exactly 1 piece', async () => {
    const user = await competitor('cpp');
    const response = await user.agent.post(user.url).set('x-csrf-token', user.csrf).send({
      customPieces: [
        { player: 'A', type: 'dam', row: 4, col: 4 },
        { player: 'A', type: 'la', row: 2, col: 2 },
      ],
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('đúng 1 quân của Bot A');
  });
});

