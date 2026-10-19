import { describe, expect, it } from 'vitest';
import { DockerExecutionLimiter } from '../../bot-executor/docker-execution-limiter.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('DockerExecutionLimiter', () => {
  it('admits FIFO across independent tournament and practice executions', async () => {
    const limiter = new DockerExecutionLimiter(1);
    const first = deferred();
    const order: string[] = [];

    const running = limiter.run(async () => {
      order.push('tournament-a');
      await first.promise;
    });
    const queuedTournament = limiter.run(async () => { order.push('tournament-b'); });
    const queuedPractice = limiter.run(async () => { order.push('practice'); });

    await Promise.resolve();
    expect(order).toEqual(['tournament-a']);
    expect(limiter.active).toBe(1);
    first.resolve();
    await Promise.all([running, queuedTournament, queuedPractice]);
    expect(order).toEqual(['tournament-a', 'tournament-b', 'practice']);
    expect(limiter.active).toBe(0);
  });

  it('cancels a queued request without disturbing FIFO or starving later work', async () => {
    const limiter = new DockerExecutionLimiter(1);
    const first = deferred();
    const controller = new AbortController();
    const held = limiter.run(() => first.promise);
    const cancelled = limiter.run(() => Promise.resolve('cancelled'), controller.signal);
    const next = limiter.run(() => Promise.resolve('next'));

    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    first.resolve();
    await expect(held).resolves.toBeUndefined();
    await expect(next).resolves.toBe('next');
    expect(limiter.active).toBe(0);
  });

  it('releases permits after errors and timeout-shaped failures', async () => {
    const limiter = new DockerExecutionLimiter(1);
    await expect(limiter.run(async () => { throw new Error('docker failed'); })).rejects.toThrow('docker failed');
    await expect(limiter.run(async () => { throw new Error('timed out'); })).rejects.toThrow('timed out');
    await expect(limiter.run(() => 'recovered')).resolves.toBe('recovered');
    expect(limiter.active).toBe(0);
  });

  it('allows cleanup to acquire after an execution settles', async () => {
    const limiter = new DockerExecutionLimiter(1);
    const cleanup = deferred();
    const execution = limiter.run(async () => undefined);
    await execution;
    await limiter.run(async () => cleanup.resolve());
    await cleanup.promise;
    expect(limiter.active).toBe(0);
  });

  it('never exceeds the explicit active Docker resource budget', async () => {
    const limiter = new DockerExecutionLimiter(2);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    let active = 0;
    let maximum = 0;
    const executions = gates.map((gate, index) => limiter.run(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await gate.promise;
      active--;
      return index;
    }));

    await Promise.resolve();
    await Promise.resolve();
    expect(maximum).toBe(2);
    expect(limiter.active).toBe(2);
    gates[0]!.resolve();
    gates[1]!.resolve();
    await Promise.resolve();
    await Promise.resolve();
    gates[2]!.resolve();
    gates[3]!.resolve();
    await expect(Promise.all(executions)).resolves.toEqual([0, 1, 2, 3]);
    expect(maximum).toBe(2);
    expect(active).toBe(0);
    expect(limiter.active).toBe(0);
  });

  it('reports queued wait separately so an operation timeout starts after admission', async () => {
    const events: Array<{ phase: 'admitted' | 'released'; waitMs: number; executionMs: number }> = [];
    const limiter = new DockerExecutionLimiter(1, {
      onAdmitted: event => events.push({ phase: 'admitted', waitMs: event.waitMs, executionMs: 0 }),
      onReleased: event => events.push({ phase: 'released', waitMs: event.waitMs, executionMs: event.executionMs }),
    });
    const held = await limiter.acquire(undefined, 'held');
    const operation = limiter.run(async () => {
      const deadline = Date.now() + 50;
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(Date.now()).toBeLessThan(deadline);
    }, undefined, 'queued-operation');

    await new Promise(resolve => setTimeout(resolve, 25));
    held();
    await operation;
    const release = events.find(event => event.phase === 'released' && event.waitMs > 0 && event.executionMs > 0);
    expect(release?.waitMs).toBeGreaterThan(0);
    expect(release?.executionMs).toBeGreaterThan(0);
    expect(limiter.active).toBe(0);
  });
});

