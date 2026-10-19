import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { initializeDatabase, type DatabaseWrapper } from '../../server/db.js';
import { SqlBotPreflightRepository } from '../../server/repositories/bot-preflight-repository.js';
import { BotPreflightService } from '../../server/bot-preflight.js';
import { createPracticeScenario } from '../../practice/scenarios.js';
import { posToAlgebraic } from '../../engine/index.js';
import type { SourceRevisionExecution } from '../../match-runner/types.js';
import type { BotExecutionResult, BotErrorCode, BotFailureStage, SourceRevisionExecutor } from '../../bot-executor/types.js';

const execution = (revisionId = 'rev-1', sourceDigest = 'digest-1'): SourceRevisionExecution => ({
  kind: 'source-revision', competitorId: 'user-1', botId: 'bot-1', revisionId, sourceDigest,
  runtimeId: 'cpp', executionMode: 'raw',
});

function successResult(): BotExecutionResult {
  const scenario = createPracticeScenario('initial')!;
  const move = scenario.legalMoves[0]!;
  return { success: true, response: { move: { piece_id: move.pieceId, from: posToAlgebraic(move.from), to: posToAlgebraic(move.to) } }, exitCode: 0, timedOut: false, stdout: '', stderr: '', durationMs: 5 };
}

function failedResult(code: BotErrorCode, stage: BotFailureStage): BotExecutionResult {
  return { success: false, error: { code, message: code, stage }, exitCode: 1, timedOut: code.includes('TIMEOUT'), stdout: '{bad', stderr: 'diagnostic', durationMs: 10 };
}

class FakeExecutor implements SourceRevisionExecutor {
  calls = 0;
  timeoutMs: number | undefined;
  constructor(private readonly result: BotExecutionResult | (() => BotExecutionResult), private readonly identity = 'env-a', private readonly delayMs = 0) {}
  getValidationIdentity(): string { return this.identity; }
  async executeRevision(context: { timeoutMs?: number }): Promise<BotExecutionResult> {
    this.calls += 1;
    this.timeoutMs = context.timeoutMs;
    if (this.delayMs) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    return typeof this.result === 'function' ? this.result() : this.result;
  }
}

describe('Bot revision preflight validation', () => {
  let dir: string;
  let db: DatabaseWrapper;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-preflight-'));
    db = await initializeDatabase({ path: path.join(dir, 'arena.sqlite') });
    db.prepare('INSERT INTO users (id, username, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?)').run('user-1', 'user', 'hash', new Date().toISOString(), 'competitor');
    db.prepare('INSERT INTO bots (id, owner_id, name, command, args, registered_at) VALUES (?, ?, ?, ?, ?, ?)').run('bot-1', 'user-1', 'Bot', '', '[]', new Date().toISOString());
    db.prepare(`INSERT INTO bot_revisions (revision_id, bot_id, owner_id, source_digest, storage_ref, runtime_id, created_at, source_size, execution_mode, sdk_version, sdk_digest)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('rev-1', 'bot-1', 'user-1', 'digest-1', 'bot-revisions/bot-1/rev-1.cpp', 'cpp', new Date().toISOString(), 1, 'raw', null, null);
  });

  afterEach(() => { db.close(); return fs.rm(dir, { recursive: true, force: true }); });

  async function run(result: BotExecutionResult, exec = execution(), identity = 'env-a') {
    const executor = new FakeExecutor(result, identity);
    const service = new BotPreflightService(new SqlBotPreflightRepository(db), executor, async () => Buffer.from('source'));
    const started = service.start(exec);
    const finished = await service.wait(exec);
    return { executor, started, finished, service };
  }

  it('passes compile/runtime/protocol/legal-move smoke test and reuses cached result', async () => {
    const { executor, finished, service } = await run(successResult());
    expect(finished?.status).toBe('passed');
    expect(executor.timeoutMs).toBe(5000);
    const cached = service.start(execution());
    expect(cached.status).toBe('passed');
    expect(executor.calls).toBe(1);
    service.close();
  });

  it.each([
    ['C++ compile error', failedResult('PROCESS_CRASHED', 'compilation')],
    ['Python syntax error', failedResult('PROCESS_CRASHED', 'runtime_startup')],
    ['malformed protocol output', failedResult('INVALID_JSON', 'protocol_parsing')],
    ['startup/runtime timeout', failedResult('RUNTIME_TIMEOUT', 'runtime_timeout')],
  ])('records %s as failed with diagnostics', async (_label, result) => {
    const { finished, service } = await run(result);
    expect(finished).toMatchObject({ status: 'failed', errorCode: result.error?.code, diagnostic: { stage: result.error?.stage } });
    service.close();
  });

  it('rejects a protocol-valid but illegal move', async () => {
    const invalid = successResult();
    invalid.response!.move.from = 'a1'; invalid.response!.move.to = 'a1';
    const { finished, service } = await run(invalid);
    expect(finished).toMatchObject({ status: 'failed', errorCode: 'INVALID_MOVE' });
    service.close();
  });

  it('does not reuse a changed revision digest or validation environment', async () => {
    const first = await run(successResult());
    const second = await run(successResult(), execution('rev-1', 'digest-2'));
    const third = await run(successResult(), execution('rev-1', 'digest-1'), 'env-b');
    expect(first.executor.calls).toBe(1);
    expect(second.started.status).toBe('pending');
    expect(third.started.status).toBe('pending');
    first.service.close(); second.service.close(); third.service.close();
  });

  it('reuses a persisted passed result after the service is recreated with the same environment identity', async () => {
    const firstExecutor = new FakeExecutor(successResult(), 'stable-environment');
    const firstService = new BotPreflightService(new SqlBotPreflightRepository(db), firstExecutor, async () => Buffer.from('source'));
    firstService.start(execution());
    await firstService.wait(execution());
    expect(firstService.get(execution())?.status).toBe('passed');
    firstService.close();

    const secondExecutor = new FakeExecutor(successResult(), 'stable-environment');
    const secondService = new BotPreflightService(new SqlBotPreflightRepository(db), secondExecutor, async () => Buffer.from('source'));
    const cached = secondService.start(execution());
    expect(cached.status).toBe('passed');
    expect(secondExecutor.calls).toBe(0);
    secondService.close();
  });

  it('deduplicates concurrent validation requests and expires stale cache', async () => {
    const executor = new FakeExecutor(successResult());
    const repository = new SqlBotPreflightRepository(db);
    const service = new BotPreflightService(repository, executor, async () => Buffer.from('source'));
    const first = service.start(execution());
    const second = service.start(execution());
    await service.wait(execution());
    expect(first.validationId).toBe(second.validationId);
    expect(executor.calls).toBe(1);
    db.prepare("UPDATE bot_preflight_validations SET expires_at = ? WHERE validation_id = ?").run(new Date(Date.now() - 1).toISOString(), first.validationId);
    expect(service.get(execution())?.status).toBe('expired');
    service.close();
  });

  it('recovers a persisted pending validation after service restart', async () => {
    const repository = new SqlBotPreflightRepository(db);
    const first = new BotPreflightService(repository, new FakeExecutor(successResult(), 'stable-environment'), async () => Buffer.from('source'));
    const pending = repository.start(first.key(execution()));
    const secondExecutor = new FakeExecutor(successResult(), 'stable-environment');
    const second = new BotPreflightService(repository, secondExecutor, async () => Buffer.from('source'));

    await expect(second.recoverPending([execution()])).resolves.toMatchObject({ requeued: 1, failed: 0, expired: 0 });
    await second.wait(execution());
    expect(second.get(execution())).toMatchObject({ validationId: pending.validationId, status: 'passed' });
    expect(secondExecutor.calls).toBe(1);
    first.close(); second.close();
  });

  it('fails a recovered pending validation when the immutable source is no longer available', async () => {
    const repository = new SqlBotPreflightRepository(db);
    const executor = new FakeExecutor(successResult(), 'stable-environment');
    const service = new BotPreflightService(repository, executor, async () => null);
    repository.start(service.key(execution()));

    await expect(service.recoverPending([execution()])).resolves.toMatchObject({ requeued: 0, failed: 1, expired: 0 });
    expect(service.get(execution())).toMatchObject({ status: 'failed', errorCode: 'SOURCE_UNAVAILABLE', diagnostic: { stage: 'source_integrity' } });
    expect(executor.calls).toBe(0);
    service.close();
  });

  it('expires pending records with no active persisted execution and deduplicates recovery', async () => {
    const repository = new SqlBotPreflightRepository(db);
    const executor = new FakeExecutor(successResult(), 'stable-environment');
    const service = new BotPreflightService(repository, executor, async () => Buffer.from('source'));
    const key = service.key(execution());
    repository.start({ ...key, environmentKey: 'stale-environment' });

    await expect(service.recoverPending([])).resolves.toMatchObject({ requeued: 0, failed: 0, expired: 1 });
    expect(repository.find({ ...key, environmentKey: 'stale-environment' })).toMatchObject({ status: 'expired', errorCode: 'PREFLIGHT_ORPHANED' });

    const pending = repository.start(key);
    await expect(Promise.all([service.recoverPending([execution()]), service.recoverPending([execution()])])).resolves.toEqual([
      { requeued: 1, failed: 0, expired: 0 },
      { requeued: 0, failed: 0, expired: 0 },
    ]);
    await service.wait(execution());
    expect(service.get(execution())).toMatchObject({ validationId: pending.validationId, status: 'passed' });
    expect(executor.calls).toBe(1);
    service.close();
  });

  it('drains 202 durable pending validations without queue-full failures or duplicates', async () => {
    const executions: SourceRevisionExecution[] = [];
    for (let index = 0; index < 202; index += 1) {
      const botId = `bulk-bot-${index}`;
      const revisionId = `bulk-rev-${index}`;
      const digest = `bulk-digest-${index}`;
      db.prepare('INSERT INTO bots (id, owner_id, name, command, args, registered_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(botId, 'user-1', `Bulk ${index}`, '', '[]', new Date().toISOString());
      db.prepare(`INSERT INTO bot_revisions (revision_id, bot_id, owner_id, source_digest, storage_ref, runtime_id, created_at, source_size, execution_mode, sdk_version, sdk_digest)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(revisionId, botId, 'user-1', digest, `bulk/${revisionId}.cpp`, 'cpp', new Date().toISOString(), 1, 'raw', null, null);
      executions.push(execution(revisionId, digest));
    }
    const executor = new FakeExecutor(successResult(), 'bulk-environment', 2);
    const service = new BotPreflightService(new SqlBotPreflightRepository(db), executor, async () => Buffer.from('source'));
    executions.forEach(item => service.start(item));

    await vi.waitFor(() => {
      const rows = db.prepare("SELECT status, error_code FROM bot_preflight_validations WHERE environment_key = 'bulk-environment'").all() as Array<{ status: string; error_code: string | null }>;
      expect(rows).toHaveLength(202);
      expect(rows.every(row => row.status === 'passed')).toBe(true);
    }, { timeout: 10_000, interval: 25 });

    const count = db.prepare("SELECT COUNT(*) AS count FROM bot_preflight_validations WHERE environment_key = 'bulk-environment'").get() as { count: number };
    expect(count.count).toBe(202);
    expect(executor.calls).toBe(202);
    service.close();
  });

  it('retries transient sandbox failures with bounded durable backoff', async () => {
    let attempts = 0;
    const executor = new FakeExecutor(() => {
      attempts += 1;
      if (attempts < 3) return failedResult('EXECUTOR_ERROR', 'docker_infrastructure');
      return successResult();
    }, 'retry-environment');
    const service = new BotPreflightService(new SqlBotPreflightRepository(db), executor, async () => Buffer.from('source'));
    service.start(execution('rev-1', 'retry-digest'));
    const finished = await service.wait(execution('rev-1', 'retry-digest'));
    expect(finished?.status).toBe('passed');
    expect(attempts).toBe(3);
    expect(finished?.attemptCount).toBe(2);
    expect(finished?.errorCode).toBeNull();
    service.close();
  });
});
