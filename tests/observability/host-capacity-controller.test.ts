import { describe, expect, it, vi } from 'vitest';
import { HostCapacityController } from '../../observability/host-capacity-controller.js';
import { FairMatchDispatcher } from '../../tournament/fair-match-dispatcher.js';

function sample(at: number, cpu = 10) {
  return { at, cpuPercent: cpu, memoryPercent: 10, eventLoopDelayMs: 5, apiP95Ms: 10, dockerQueueDepth: 0 };
}

describe('HostCapacityController', () => {
  it('uses sustained thresholds and hysteresis for constrained/critical/recovery', () => {
    const controller = new HostCapacityController({
      minSamples: 1, constrainedSustainMs: 100, criticalSustainMs: 100,
      recoverySustainMs: 100, constrainedCpuPercent: 50, criticalCpuPercent: 90,
    });
    expect(controller.record(sample(0, 60))).toBe('healthy');
    expect(controller.record(sample(100, 60))).toBe('constrained');
    expect(controller.record(sample(150, 95))).toBe('constrained');
    expect(controller.record(sample(251, 95))).toBe('critical');
    expect(controller.record(sample(352))).toBe('critical');
    expect(controller.record(sample(453))).toBe('recovery');
    expect(controller.record(sample(554))).toBe('healthy');
  });

  it('does not admit new dispatches in critical mode and resumes after recovery', async () => {
    const controller = new HostCapacityController({ minSamples: 1, recoverySustainMs: 0, constrainedSustainMs: 0, criticalSustainMs: 0 });
    const dispatcher = new FairMatchDispatcher<string>(2);
    dispatcher.setAdmissionController(active => controller.canAdmitNewMatch(active));
    controller.record(sample(0, 95));
    const quantum = vi.fn(async () => ({ done: true, result: 'committed' }));
    const promise = dispatcher.submit('tournament-1', quantum);
    await Promise.resolve();
    expect(quantum).not.toHaveBeenCalled();
    controller.record(sample(1));
    controller.record(sample(2));
    dispatcher.wake();
    await expect(promise).resolves.toMatchObject({ results: ['committed'], failures: [] });
    expect(quantum).toHaveBeenCalledTimes(1);
  });

  it('uses configured persistence latency as a storage-pressure signal', () => {
    const controller = new HostCapacityController({
      minSamples: 1,
      constrainedSustainMs: 0,
      criticalSustainMs: 0,
      constrainedPersistenceP95Ms: 100,
      criticalPersistenceP95Ms: 300,
    });
    expect(controller.record({ at: 0, cpuPercent: 10, memoryPercent: 10, eventLoopDelayMs: 5, apiP95Ms: 10, dockerQueueDepth: 0, persistenceP95Ms: 150 })).toBe('constrained');
    expect(controller.record({ at: 1, cpuPercent: 10, memoryPercent: 10, eventLoopDelayMs: 5, apiP95Ms: 10, dockerQueueDepth: 0, persistenceP95Ms: 350 })).toBe('critical');
  });
});
