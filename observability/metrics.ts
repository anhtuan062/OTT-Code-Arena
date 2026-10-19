import * as os from 'node:os';
import { monitorEventLoopDelay, performance, type IntervalHistogram } from 'node:perf_hooks';

const DEFAULT_SAMPLE_LIMIT = 256;

class BoundedSeries {
  private readonly values: number[] = [];
  private nextIndex = 0;

  constructor(private readonly limit: number) {}

  add(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    if (this.values.length < this.limit) {
      this.values.push(value);
      return;
    }
    this.values[this.nextIndex] = value;
    this.nextIndex = (this.nextIndex + 1) % this.limit;
  }

  summary() {
    if (this.values.length === 0) return { count: 0, min: null, max: null, average: null, p50: null, p95: null, p99: null };
    const sorted = [...this.values].sort((a, b) => a - b);
    const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? null;
    const total = this.values.reduce((sum, value) => sum + value, 0);
    return {
      count: this.values.length,
      min: sorted[0] ?? null,
      max: sorted[sorted.length - 1] ?? null,
      average: total / this.values.length,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
    };
  }
}

export interface MetricsSnapshot {
  generatedAt: string;
  uptimeMs: number;
  process: {
    pid: number;
    memory: NodeJS.MemoryUsage;
  };
  host: {
    cpu: { cores: number; loadAverage: number[] | null; usagePercent: number | null };
    memory: { totalBytes: number; freeBytes: number; usedPercent: number | null };
  };
  eventLoop: { delayMs: { min: number | null; max: number | null; mean: number | null; p95: number | null } };
  counters: Record<string, number>;
  gauges: Record<string, number>;
  statuses: Record<string, string>;
  rates: { apiErrorRate: number | null };
  histograms: Record<string, ReturnType<BoundedSeries['summary']>>;
}

export class MetricsRegistry {
  private readonly startedAt = performance.now();
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly statuses = new Map<string, string>();
  private readonly histograms = new Map<string, BoundedSeries>();
  private eventLoopMonitor: IntervalHistogram | null = null;
  private hostCpuTimer: NodeJS.Timeout | null = null;
  private hostCpuUsagePercent: number | null = null;
  private previousCpuSample: { idle: number; total: number } | null = null;

  constructor(private readonly sampleLimit = DEFAULT_SAMPLE_LIMIT) {}

  start(): void {
    if (this.eventLoopMonitor) return;
    this.eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
    this.eventLoopMonitor.enable();
    this.sampleHostCpu();
    this.hostCpuTimer = setInterval(() => this.sampleHostCpu(), 5000);
    this.hostCpuTimer.unref();
  }

  stop(): void {
    this.eventLoopMonitor?.disable();
    this.eventLoopMonitor = null;
    if (this.hostCpuTimer) clearInterval(this.hostCpuTimer);
    this.hostCpuTimer = null;
  }

  increment(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  setGauge(name: string, value: number): void {
    if (Number.isFinite(value)) this.gauges.set(name, value);
  }

  setStatus(name: string, value: string): void {
    if (value.length <= 64) this.statuses.set(name, value);
  }

  observe(name: string, value: number): void {
    let series = this.histograms.get(name);
    if (!series) {
      series = new BoundedSeries(this.sampleLimit);
      this.histograms.set(name, series);
    }
    series.add(value);
  }

  private sampleHostCpu(): void {
    try {
      const totals = os.cpus().reduce((sample, cpu) => {
        const times = cpu.times;
        sample.idle += times.idle;
        sample.total += times.user + times.nice + times.sys + times.irq + times.idle;
        return sample;
      }, { idle: 0, total: 0 });
      if (this.previousCpuSample && totals.total > this.previousCpuSample.total) {
        const totalDelta = totals.total - this.previousCpuSample.total;
        const idleDelta = totals.idle - this.previousCpuSample.idle;
        this.hostCpuUsagePercent = Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100));
      }
      this.previousCpuSample = totals;
    } catch {
      this.hostCpuUsagePercent = null;
    }
  }

  snapshot(): MetricsSnapshot {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const loadAverage = os.loadavg();
    const eventLoop = this.eventLoopMonitor;
    const eventLoopValue = (value: number) => value === 0 || !Number.isFinite(value) ? null : value / 1e6;
    const histograms: Record<string, ReturnType<BoundedSeries['summary']>> = {};
    for (const [name, series] of this.histograms) histograms[name] = series.summary();

    return {
      generatedAt: new Date().toISOString(),
      uptimeMs: Math.round(performance.now() - this.startedAt),
      process: { pid: process.pid, memory: process.memoryUsage() },
      host: {
        cpu: {
          cores: os.availableParallelism(),
          loadAverage: loadAverage.some(value => value > 0) ? loadAverage : null,
          usagePercent: this.hostCpuUsagePercent,
        },
        memory: {
          totalBytes: totalMemory,
          freeBytes: freeMemory,
          usedPercent: totalMemory > 0 ? ((totalMemory - freeMemory) / totalMemory) * 100 : null,
        },
      },
      eventLoop: {
        delayMs: {
          min: eventLoopValue(eventLoop?.min ?? 0),
          max: eventLoopValue(eventLoop?.max ?? 0),
          mean: eventLoopValue(eventLoop?.mean ?? 0),
          p95: eventLoopValue(eventLoop?.percentile(95) ?? 0),
        },
      },
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      statuses: Object.fromEntries(this.statuses),
      rates: {
        apiErrorRate: (this.counters.get('api.requests') ?? 0) > 0
          ? (this.counters.get('api.errors') ?? 0) / (this.counters.get('api.requests') ?? 1)
          : null,
      },
      histograms,
    };
  }
}

export const applicationMetrics = new MetricsRegistry();
