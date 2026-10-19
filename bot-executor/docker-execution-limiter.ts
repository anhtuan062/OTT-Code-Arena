import { applicationMetrics } from '../observability/metrics.js';

/**
 * Process-wide admission control for Docker-backed executions.
 *
 * A permit represents one active Docker execution process (docker run/exec),
 * rather than one tournament match.  Cleanup commands intentionally acquire
 * their own permit, so an execution cannot deadlock while releasing resources.
 */

export const DEFAULT_DOCKER_EXECUTION_CONCURRENCY = 1;

export type DockerPermit = () => void;

export interface DockerExecutionLimiterEvent {
  label: string;
  waitMs: number;
  executionMs: number;
  active: number;
}

export interface DockerExecutionLimiterOptions {
  onAdmitted?: (event: Pick<DockerExecutionLimiterEvent, 'label' | 'waitMs' | 'active'>) => void;
  onReleased?: (event: DockerExecutionLimiterEvent) => void;
}

interface Waiter {
  settled: boolean;
  signal?: AbortSignal;
  resolve: (release: DockerPermit) => void;
  reject: (error: Error) => void;
  label: string;
  queuedAt: number;
  onAbort?: () => void;
}

function abortError(): Error {
  const error = new Error('Docker execution admission was cancelled');
  error.name = 'AbortError';
  return error;
}

function configuredConcurrency(): number {
  const raw = process.env.OTT_DOCKER_EXECUTION_CONCURRENCY?.trim();
  if (!raw) return DEFAULT_DOCKER_EXECUTION_CONCURRENCY;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_DOCKER_EXECUTION_CONCURRENCY;
}

export class DockerExecutionLimiter {
  private readonly limit: number;
  private readonly options: DockerExecutionLimiterOptions;
  private activeCount = 0;
  private readonly waiters: Waiter[] = [];

  constructor(maxConcurrent = DEFAULT_DOCKER_EXECUTION_CONCURRENCY, options: DockerExecutionLimiterOptions = {}) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error('Docker execution concurrency must be a positive integer');
    }
    this.limit = maxConcurrent;
    this.options = options;
    this.publishMetrics();
  }

  get maxConcurrent(): number { return this.limit; }
  get active(): number { return this.activeCount; }
  get pending(): number { return this.waiters.filter(waiter => !waiter.settled).length; }

  acquire(signal?: AbortSignal, label = 'docker-execution'): Promise<DockerPermit> {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise<DockerPermit>((resolve, reject) => {
      const waiter: Waiter = { settled: false, signal, resolve, reject, label, queuedAt: Date.now() };
      waiter.onAbort = () => {
        if (waiter.settled) return;
        waiter.settled = true;
        this.remove(waiter);
        this.publishMetrics();
        reject(abortError());
        this.drain();
      };
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
      this.waiters.push(waiter);
      this.publishMetrics();
      this.drain();
    });
  }

  async run<T>(operation: () => Promise<T> | T, signal?: AbortSignal, label = 'docker-execution'): Promise<T> {
    const release = await this.acquire(signal, label);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private remove(waiter: Waiter): void {
    const index = this.waiters.indexOf(waiter);
    if (index >= 0) this.waiters.splice(index, 1);
  }

  private drain(): void {
    while (this.activeCount < this.limit) {
      const waiter = this.waiters.shift();
      if (!waiter) return;
      if (waiter.settled || waiter.signal?.aborted) {
        if (!waiter.settled) {
          waiter.settled = true;
          waiter.signal?.removeEventListener('abort', waiter.onAbort!);
          waiter.reject(abortError());
        }
        continue;
      }
      waiter.settled = true;
      waiter.signal?.removeEventListener('abort', waiter.onAbort!);
      this.activeCount++;
      const admittedAt = Date.now();
      applicationMetrics.observe('docker.limiter.wait_ms', admittedAt - waiter.queuedAt);
      applicationMetrics.setGauge('docker.limiter.active', this.activeCount);
      applicationMetrics.setGauge('docker.limiter.pending', this.pending);
      this.options.onAdmitted?.({ label: waiter.label, waitMs: admittedAt - waiter.queuedAt, active: this.activeCount });
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        this.activeCount--;
        applicationMetrics.observe('docker.limiter.execution_ms', Date.now() - admittedAt);
        applicationMetrics.setGauge('docker.limiter.active', this.activeCount);
        applicationMetrics.setGauge('docker.limiter.pending', this.pending);
        this.options.onReleased?.({
          label: waiter.label,
          waitMs: admittedAt - waiter.queuedAt,
          executionMs: Date.now() - admittedAt,
          active: this.activeCount,
        });
        this.drain();
      };
      waiter.resolve(release);
      this.publishMetrics();
    }
  }

  private publishMetrics(): void {
    applicationMetrics.setGauge('docker.limiter.active', this.activeCount);
    applicationMetrics.setGauge('docker.limiter.pending', this.pending);
  }
}

export const globalDockerExecutionLimiter = new DockerExecutionLimiter(configuredConcurrency());

