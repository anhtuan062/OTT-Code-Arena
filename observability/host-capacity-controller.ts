import type { MetricsSnapshot } from './metrics.js';

export type HostCapacityState = 'healthy' | 'constrained' | 'critical' | 'recovery';

export interface HostCapacityThresholds {
  sampleWindowMs: number;
  minSamples: number;
  constrainedCpuPercent: number;
  criticalCpuPercent: number;
  constrainedMemoryPercent: number;
  criticalMemoryPercent: number;
  constrainedEventLoopDelayMs: number;
  criticalEventLoopDelayMs: number;
  constrainedApiP95Ms: number;
  criticalApiP95Ms: number;
  constrainedDockerQueueDepth: number;
  criticalDockerQueueDepth: number;
  constrainedPersistenceP95Ms: number;
  criticalPersistenceP95Ms: number;
  constrainedSustainMs: number;
  criticalSustainMs: number;
  recoverySustainMs: number;
}

export const DEFAULT_HOST_CAPACITY_THRESHOLDS: HostCapacityThresholds = {
  sampleWindowMs: 30_000,
  minSamples: 3,
  constrainedCpuPercent: 85,
  criticalCpuPercent: 95,
  constrainedMemoryPercent: 85,
  criticalMemoryPercent: 95,
  constrainedEventLoopDelayMs: 100,
  criticalEventLoopDelayMs: 500,
  constrainedApiP95Ms: 1_000,
  criticalApiP95Ms: 3_000,
  constrainedDockerQueueDepth: 2,
  criticalDockerQueueDepth: 8,
  // Storage contention is opt-in until an installation supplies a measured
  // service-specific budget; Infinity avoids imposing a hardware assumption.
  constrainedPersistenceP95Ms: Number.POSITIVE_INFINITY,
  criticalPersistenceP95Ms: Number.POSITIVE_INFINITY,
  constrainedSustainMs: 2_000,
  criticalSustainMs: 2_000,
  recoverySustainMs: 5_000,
};

export function hostCapacityThresholdsFromEnv(env: NodeJS.ProcessEnv = process.env): Partial<HostCapacityThresholds> {
  const names: Array<[keyof HostCapacityThresholds, string]> = [
    ['sampleWindowMs', 'SAMPLE_WINDOW_MS'], ['minSamples', 'MIN_SAMPLES'],
    ['constrainedCpuPercent', 'CONSTRAINED_CPU_PERCENT'], ['criticalCpuPercent', 'CRITICAL_CPU_PERCENT'],
    ['constrainedMemoryPercent', 'CONSTRAINED_MEMORY_PERCENT'], ['criticalMemoryPercent', 'CRITICAL_MEMORY_PERCENT'],
    ['constrainedEventLoopDelayMs', 'CONSTRAINED_EVENT_LOOP_MS'], ['criticalEventLoopDelayMs', 'CRITICAL_EVENT_LOOP_MS'],
    ['constrainedApiP95Ms', 'CONSTRAINED_API_P95_MS'], ['criticalApiP95Ms', 'CRITICAL_API_P95_MS'],
    ['constrainedDockerQueueDepth', 'CONSTRAINED_DOCKER_QUEUE'], ['criticalDockerQueueDepth', 'CRITICAL_DOCKER_QUEUE'],
    ['constrainedPersistenceP95Ms', 'CONSTRAINED_PERSISTENCE_P95_MS'], ['criticalPersistenceP95Ms', 'CRITICAL_PERSISTENCE_P95_MS'],
    ['constrainedSustainMs', 'CONSTRAINED_SUSTAIN_MS'], ['criticalSustainMs', 'CRITICAL_SUSTAIN_MS'],
    ['recoverySustainMs', 'RECOVERY_SUSTAIN_MS'],
  ];
  const result: Partial<HostCapacityThresholds> = {};
  for (const [field, suffix] of names) {
    const raw = env[`OTT_CAPACITY_${suffix}`];
    if (raw === undefined || raw.trim() === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) result[field] = value as never;
  }
  return result;
}

export interface HostCapacitySample {
  at: number;
  cpuPercent: number | null;
  memoryPercent: number | null;
  eventLoopDelayMs: number | null;
  apiP95Ms: number | null;
  dockerQueueDepth: number | null;
  persistenceP95Ms?: number | null;
}

export interface HostCapacitySnapshot {
  state: HostCapacityState;
  sampleCount: number;
  latest: HostCapacitySample | null;
  thresholds: HostCapacityThresholds;
}

type StateListener = (state: HostCapacityState) => void;

function finiteOrNull(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

export class HostCapacityController {
  private readonly thresholds: HostCapacityThresholds;
  private readonly samples: HostCapacitySample[] = [];
  private state: HostCapacityState = 'healthy';
  private unhealthySince: number | null = null;
  private criticalSince: number | null = null;
  private recoverySince: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<StateListener>();

  constructor(thresholds: Partial<HostCapacityThresholds> = {}) {
    this.thresholds = { ...DEFAULT_HOST_CAPACITY_THRESHOLDS, ...thresholds };
    if (this.thresholds.minSamples < 1 || this.thresholds.sampleWindowMs <= 0) {
      throw new RangeError('Host capacity sample window and minSamples must be positive');
    }
  }

  get currentState(): HostCapacityState { return this.state; }
  get config(): HostCapacityThresholds { return { ...this.thresholds }; }

  onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  canAdmitNewMatch(activeDispatches: number): boolean {
    if (this.state === 'critical') return false;
    if (this.state === 'constrained' || this.state === 'recovery') return activeDispatches === 0;
    return true;
  }

  record(sample: HostCapacitySample): HostCapacityState {
    const normalized = {
      ...sample,
      cpuPercent: finiteOrNull(sample.cpuPercent),
      memoryPercent: finiteOrNull(sample.memoryPercent),
      eventLoopDelayMs: finiteOrNull(sample.eventLoopDelayMs),
      apiP95Ms: finiteOrNull(sample.apiP95Ms),
      dockerQueueDepth: finiteOrNull(sample.dockerQueueDepth),
      persistenceP95Ms: finiteOrNull(sample.persistenceP95Ms),
    };
    this.samples.push(normalized);
    const cutoff = normalized.at - this.thresholds.sampleWindowMs;
    while (this.samples.length && this.samples[0]!.at < cutoff) this.samples.shift();
    if (this.samples.length < this.thresholds.minSamples) return this.state;

    const latest = normalized;
    const critical = this.isCritical(latest);
    const constrained = critical || this.isConstrained(latest);
    if (constrained) {
      this.recoverySince = null;
      if (this.unhealthySince === null) this.unhealthySince = normalized.at;
      if (critical) {
        if (this.criticalSince === null) this.criticalSince = normalized.at;
      } else {
        this.criticalSince = null;
      }
    } else {
      this.unhealthySince = null;
      this.criticalSince = null;
      if (this.recoverySince === null) this.recoverySince = normalized.at;
    }

    if (this.state === 'healthy' && constrained && normalized.at - (this.unhealthySince ?? normalized.at) >= this.thresholds.constrainedSustainMs) {
      this.transition(critical ? 'critical' : 'constrained');
    } else if (this.state === 'constrained' && critical && normalized.at - (this.criticalSince ?? normalized.at) >= this.thresholds.criticalSustainMs) {
      this.transition('critical');
    } else if (this.state === 'constrained' && !constrained && normalized.at - (this.recoverySince ?? normalized.at) >= this.thresholds.recoverySustainMs) {
      this.transition('recovery');
      this.recoverySince = normalized.at;
    } else if (this.state === 'critical' && !constrained && normalized.at - (this.recoverySince ?? normalized.at) >= this.thresholds.recoverySustainMs) {
      this.transition('recovery');
      this.recoverySince = normalized.at;
    } else if (this.state === 'recovery') {
      if (critical) this.transition('critical');
      else if (constrained) this.transition('constrained');
      else if (normalized.at - (this.recoverySince ?? normalized.at) >= this.thresholds.recoverySustainMs) this.transition('healthy');
    }
    return this.state;
  }

  recordMetrics(snapshot: MetricsSnapshot, at = Date.now()): HostCapacityState {
    return this.record({
      at,
      cpuPercent: snapshot.host.cpu.usagePercent,
      memoryPercent: snapshot.host.memory.usedPercent,
      eventLoopDelayMs: snapshot.eventLoop.delayMs.p95,
      apiP95Ms: snapshot.histograms['api.latency_ms']?.p95 ?? null,
      dockerQueueDepth: snapshot.gauges['docker.limiter.pending'] ?? null,
      persistenceP95Ms: Math.max(
        snapshot.histograms['persistence.write_ms']?.p95 ?? 0,
        snapshot.histograms['persistence.commit_ms']?.p95 ?? 0,
      ) || null,
    });
  }

  start(read: () => MetricsSnapshot, intervalMs = 1_000): void {
    if (this.timer) return;
    const tick = () => { this.recordMetrics(read()); };
    tick();
    this.timer = setInterval(tick, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  snapshot(): HostCapacitySnapshot {
    return { state: this.state, sampleCount: this.samples.length, latest: this.samples.at(-1) ?? null, thresholds: this.config };
  }

  private isCritical(sample: HostCapacitySample): boolean {
    return (sample.cpuPercent !== null && sample.cpuPercent >= this.thresholds.criticalCpuPercent)
      || (sample.memoryPercent !== null && sample.memoryPercent >= this.thresholds.criticalMemoryPercent)
      || (sample.eventLoopDelayMs !== null && sample.eventLoopDelayMs >= this.thresholds.criticalEventLoopDelayMs)
      || (sample.apiP95Ms !== null && sample.apiP95Ms >= this.thresholds.criticalApiP95Ms)
      || (sample.dockerQueueDepth !== null && sample.dockerQueueDepth >= this.thresholds.criticalDockerQueueDepth)
      || (sample.persistenceP95Ms !== null && sample.persistenceP95Ms !== undefined && sample.persistenceP95Ms >= this.thresholds.criticalPersistenceP95Ms);
  }

  private isConstrained(sample: HostCapacitySample): boolean {
    return (sample.cpuPercent !== null && sample.cpuPercent >= this.thresholds.constrainedCpuPercent)
      || (sample.memoryPercent !== null && sample.memoryPercent >= this.thresholds.constrainedMemoryPercent)
      || (sample.eventLoopDelayMs !== null && sample.eventLoopDelayMs >= this.thresholds.constrainedEventLoopDelayMs)
      || (sample.apiP95Ms !== null && sample.apiP95Ms >= this.thresholds.constrainedApiP95Ms)
      || (sample.dockerQueueDepth !== null && sample.dockerQueueDepth >= this.thresholds.constrainedDockerQueueDepth)
      || (sample.persistenceP95Ms !== null && sample.persistenceP95Ms !== undefined && sample.persistenceP95Ms >= this.thresholds.constrainedPersistenceP95Ms);
  }

  private transition(state: HostCapacityState): void {
    if (state === this.state) return;
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
