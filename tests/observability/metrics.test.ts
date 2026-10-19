import { describe, expect, it } from 'vitest';
import { MetricsRegistry } from '../../observability/metrics.js';

describe('MetricsRegistry', () => {
  it('keeps bounded percentile samples and exposes host/process snapshots', () => {
    const metrics = new MetricsRegistry(3);
    metrics.observe('latency_ms', 10);
    metrics.observe('latency_ms', 20);
    metrics.observe('latency_ms', 30);
    metrics.observe('latency_ms', 40);
    metrics.increment('requests');
    metrics.setGauge('queue.depth', 2);
    metrics.setStatus('host.capacity.state', 'critical');

    const snapshot = metrics.snapshot();

    expect(snapshot.histograms.latency_ms).toMatchObject({ count: 3, p50: 30, p95: 40, p99: 40 });
    expect(snapshot.counters.requests).toBe(1);
    expect(snapshot.gauges['queue.depth']).toBe(2);
    expect(snapshot.statuses['host.capacity.state']).toBe('critical');
    expect(snapshot.process.pid).toBe(process.pid);
    expect(snapshot.process.memory.heapUsed).toBeGreaterThan(0);
    expect(snapshot.host.memory.totalBytes).toBeGreaterThan(0);
    expect(snapshot.eventLoop.delayMs).toEqual({ min: null, max: null, mean: null, p95: null });
  });
});
