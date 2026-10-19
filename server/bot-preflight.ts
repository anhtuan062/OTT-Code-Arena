import { randomUUID } from 'node:crypto';
import { sourceRevisionTurnTimeoutMs, type SourceRevisionExecution } from '../match-runner/types.js';
import type { SourceRevisionExecutor } from '../bot-executor/types.js';
import { BotProtocol, PROTOCOL_VERSION } from '../bot-protocol/index.js';
import { createPracticeScenario, matchesPracticeSelectedMove } from '../practice/scenarios.js';
import { posToAlgebraic } from '../engine/index.js';
import { ExecutionQueue } from '../bot-executor/execution-queue.js';
import { SqlBotPreflightRepository, type BotPreflightKey, type BotPreflightRecord } from './repositories/bot-preflight-repository.js';

export const BOT_PREFLIGHT_CHECKER_VERSION = 'ott-preflight-v1';
const PREFLIGHT_TTL_MS = 24 * 60 * 60 * 1000;
const PREFLIGHT_ORPHANED_CODE = 'PREFLIGHT_ORPHANED';
const PREFLIGHT_SOURCE_UNAVAILABLE_CODE = 'SOURCE_UNAVAILABLE';
const PREFLIGHT_QUEUE_MAX = 8;
const PREFLIGHT_MAX_IN_FLIGHT = 1 + PREFLIGHT_QUEUE_MAX;
const PREFLIGHT_MAX_TRANSIENT_ATTEMPTS = 3;
const PREFLIGHT_RETRY_DELAYS_MS = [250, 1000, 3000] as const;

export class BotPreflightService {
  private readonly queue = new ExecutionQueue({ maxConcurrent: 1, maxQueueLength: PREFLIGHT_QUEUE_MAX, metricsName: 'preflight' });
  private readonly jobs = new Map<string, Promise<void>>();
  private readonly executions = new Map<string, SourceRevisionExecution>();
  private drainTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly repository: SqlBotPreflightRepository, private readonly executor?: SourceRevisionExecutor, private readonly resolveSource?: (execution: SourceRevisionExecution) => Promise<Buffer | null>) {}

  key(execution: SourceRevisionExecution): BotPreflightKey {
    return {
      revisionId: execution.revisionId, sourceDigest: execution.sourceDigest, runtimeId: execution.runtimeId,
      executionMode: execution.executionMode ?? 'raw', sdkVersion: execution.sdkVersion, sdkDigest: execution.sdkDigest,
      protocolVersion: PROTOCOL_VERSION, checkerVersion: BOT_PREFLIGHT_CHECKER_VERSION,
      environmentKey: this.executor?.getValidationIdentity?.() ?? 'executor-unavailable',
    };
  }

  get(execution: SourceRevisionExecution): BotPreflightRecord | null {
    const key = this.key(execution);
    const record = this.repository.find(key);
    if (record?.status === 'passed' && record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) return this.repository.expire(key);
    return record;
  }

  start(execution: SourceRevisionExecution, retry = false): BotPreflightRecord {
    const key = this.key(execution);
    this.executions.set(this.keyFingerprint(key), execution);
    const existing = this.get(execution);
    if (existing?.status === 'passed' || (existing?.status === 'failed' && !retry)) return existing;
    if (existing?.status === 'pending') {
      if (existing.nextAttemptAt && Date.parse(existing.nextAttemptAt) > Date.now()) {
        this.scheduleDrain(Math.max(25, Date.parse(existing.nextAttemptAt) - Date.now()));
        return existing;
      }
      this.enqueue(existing.validationId, execution, key);
      return existing;
    }
    const pending = this.repository.start(key);
    this.enqueue(pending.validationId, execution, key);
    return pending;
  }

  async wait(execution: SourceRevisionExecution): Promise<BotPreflightRecord | null> {
    let record = this.get(execution);
    while (record?.status === 'pending') {
      this.start(execution);
      const job = this.jobs.get(record.validationId);
      if (job) await job;
      else await new Promise(resolve => setTimeout(resolve, 25));
      record = this.get(execution);
    }
    return record;
  }

  close(): void {
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = undefined;
    this.queue.cancelAll();
  }

  /**
   * Reattach persisted pending records to the in-memory queue after a process
   * restart. The execution snapshot is supplied by tournament persistence so
   * the revision digest/runtime/SDK metadata remains immutable and the current
   * executor identity is part of the lookup key.
   */
  async recoverPending(executions: SourceRevisionExecution[]): Promise<{ requeued: number; failed: number; expired: number }> {
    const candidates = new Map<string, SourceRevisionExecution>();
    for (const execution of executions) candidates.set(this.keyFingerprint(this.key(execution)), execution);

    let requeued = 0;
    let failed = 0;
    let expired = 0;
    for (const record of this.repository.listPending()) {
      const execution = candidates.get(this.keyFingerprint(record));
      if (!execution) {
        this.repository.finish(record, 'expired', PREFLIGHT_ORPHANED_CODE, {
          stage: 'recovery',
          code: PREFLIGHT_ORPHANED_CODE,
          message: 'Pending validation no longer belongs to an active persisted Bot revision.',
        }, PREFLIGHT_TTL_MS);
        expired += 1;
        continue;
      }

      // Resolve once before enqueueing so deleted/tampered source revisions do
      // not remain pending forever after a restart.
      let source: Buffer | null = null;
      try { source = this.resolveSource ? await this.resolveSource(execution) : null; } catch { source = null; }
      if (!source) {
        this.repository.finish(record, 'failed', PREFLIGHT_SOURCE_UNAVAILABLE_CODE, {
          stage: 'source_integrity',
          code: PREFLIGHT_SOURCE_UNAVAILABLE_CODE,
          message: 'Source revision is unavailable or failed integrity validation during recovery.',
        }, PREFLIGHT_TTL_MS);
        failed += 1;
        continue;
      }

      this.executions.set(this.keyFingerprint(record), execution);
      if (this.enqueue(record.validationId, execution, record)) requeued += 1;
    }
    this.scheduleDrain();
    return { requeued, failed, expired };
  }

  private enqueue(jobKey: string, execution: SourceRevisionExecution, key: BotPreflightKey): boolean {
    if (this.jobs.has(jobKey)) return false;
    if (this.jobs.size >= PREFLIGHT_MAX_IN_FLIGHT) {
      this.scheduleDrain(25);
      return false;
    }
    const job = this.queue.submit(jobKey, signal => this.run(execution, key, signal)).catch(error => {
      const message = error instanceof Error ? error.message : '';
      if (/queue is full/i.test(message)) {
        // Queue saturation is transport backpressure, not a Bot validation
        // failure. The durable pending row remains eligible for draining.
        this.scheduleDrain(25);
      }
    }).finally(() => {
      this.jobs.delete(jobKey);
      this.scheduleDrain();
    });
    this.jobs.set(jobKey, job);
    return true;
  }

  private scheduleDrain(delayMs = 0): void {
    if (this.drainTimer) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = undefined;
      this.drainPending();
    }, delayMs);
  }

  private drainPending(): void {
    for (const record of this.repository.listPending()) {
      if (this.jobs.size >= PREFLIGHT_MAX_IN_FLIGHT) break;
      if (record.nextAttemptAt && Date.parse(record.nextAttemptAt) > Date.now()) {
        this.scheduleDrain(Math.max(25, Date.parse(record.nextAttemptAt) - Date.now()));
        continue;
      }
      const execution = this.executions.get(this.keyFingerprint(record));
      if (execution) this.enqueue(record.validationId, execution, record);
    }
  }

  private keyFingerprint(key: BotPreflightKey): string {
    return [key.revisionId, key.sourceDigest, key.runtimeId, key.executionMode, key.sdkVersion ?? '', key.sdkDigest ?? '', key.protocolVersion, key.checkerVersion, key.environmentKey].join('\u001f');
  }

  private async run(execution: SourceRevisionExecution, key: BotPreflightKey, signal: AbortSignal): Promise<void> {
    if (!this.executor || !this.resolveSource) {
      this.repository.finish(key, 'failed', 'EXECUTOR_UNAVAILABLE', { stage: 'sandbox', message: 'Sandbox execution is not configured.' }, PREFLIGHT_TTL_MS);
      return;
    }
    try {
      const source = await this.resolveSource(execution);
      if (!source) throw new PreflightFailure('SOURCE_UNAVAILABLE', 'Source revision is unavailable or failed integrity validation.', 'source_integrity');
      const scenario = createPracticeScenario('initial');
      if (!scenario) throw new PreflightFailure('INVALID_SCENARIO', 'No valid smoke-test game state is available.', 'checker');
      const executionId = `preflight-${randomUUID()}`;
      const request = BotProtocol.createRequest(executionId, scenario.state, scenario.legalMoves);
      const result = await this.executor.executeRevision(
        { executionId, matchId: `preflight-${execution.revisionId}`, turn: scenario.state.turn, player: scenario.expectedPlayer, timeoutMs: sourceRevisionTurnTimeoutMs(), signal },
        { execution, source }, request,
      );
      if (!result.success) {
        const diagnostic = { stage: result.error?.stage ?? 'runtime_startup', code: result.error?.code ?? 'EXECUTOR_ERROR', message: result.error?.message ?? 'Bot smoke test failed', stderr: sanitize(result.stderr), stdout: sanitize(result.stdout), exitCode: result.exitCode };
        if (this.shouldRetry(result.error?.code, result.error?.stage, key)) return;
        this.repository.finish(key, 'failed', result.error?.code ?? 'EXECUTOR_ERROR', diagnostic, PREFLIGHT_TTL_MS);
        return;
      }
      const move = result.response?.move;
      const legal = move && matchesPracticeSelectedMove(move, scenario.legalMoves.map(item => ({ pieceId: item.pieceId, from: posToAlgebraic(item.from), to: posToAlgebraic(item.to), captures: item.captures })));
      if (!legal) {
        this.repository.finish(key, 'failed', 'INVALID_MOVE', { stage: 'move_validation', code: 'INVALID_MOVE', message: 'Bot did not return a legal move for the smoke-test state.' }, PREFLIGHT_TTL_MS);
        return;
      }
      this.repository.finish(key, 'passed', null, { stage: 'completed', message: 'Compile, startup, protocol and one legal move passed.', durationMs: result.durationMs, provenance: result.provenance ?? null }, PREFLIGHT_TTL_MS);
    } catch (error) {
      const failure = error instanceof PreflightFailure ? error : new PreflightFailure('PREFLIGHT_ERROR', error instanceof Error ? error.message : 'Preflight failed', 'checker');
      if (this.shouldRetry(failure.code, failure.stage, key)) return;
      this.repository.finish(key, 'failed', failure.code, { stage: failure.stage, message: sanitize(failure.message) }, PREFLIGHT_TTL_MS);
    } finally {
      await this.executor.releaseRevisionScope?.(`preflight-${execution.revisionId}`).catch(() => false);
    }
  }

  private shouldRetry(code: string | undefined, stage: string | undefined, key: BotPreflightKey): boolean {
    if (!isTransientInfrastructureFailure(code, stage)) return false;
    const current = this.repository.find(key);
    if (!current || current.attemptCount >= PREFLIGHT_MAX_TRANSIENT_ATTEMPTS - 1) return false;
    const delay = PREFLIGHT_RETRY_DELAYS_MS[current.attemptCount] ?? PREFLIGHT_RETRY_DELAYS_MS.at(-1)!;
    const nextAttemptAt = new Date(Date.now() + delay).toISOString();
    this.repository.scheduleRetry(key, code ?? 'EXECUTOR_ERROR', {
      stage: stage ?? 'sandbox', code: code ?? 'EXECUTOR_ERROR',
      message: 'Sandbox infrastructure was temporarily unavailable; validation will retry automatically.', retryAt: nextAttemptAt,
    }, nextAttemptAt);
    this.scheduleDrain(delay);
    return true;
  }
}

class PreflightFailure extends Error { constructor(readonly code: string, message: string, readonly stage: string) { super(message); } }
function sanitize(value: string): string { return value.replaceAll(/([A-Za-z]:)?[\\/]app[\\/][^\s]*/g, '[sandbox-path]').slice(0, 1200); }

function isTransientInfrastructureFailure(code?: string, stage?: string): boolean {
  return code === 'EXECUTOR_UNAVAILABLE' || code === 'EXECUTOR_ERROR' || code === 'DOCKER_INFRASTRUCTURE'
    || stage === 'docker_startup' || stage === 'docker_infrastructure' || stage === 'sandbox';
}
