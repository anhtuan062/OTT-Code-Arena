import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExecutionQueue, createExecutionQueue } from '@bot-executor/execution-queue.js';

describe('ExecutionQueue', () => {
  let queue: ExecutionQueue;

  afterEach(async () => {
    if (queue && !queue.isDisposed) {
      await queue.dispose();
    }
  });

  describe('basic operations', () => {
    it('should execute a task immediately when under capacity', async () => {
      queue = createExecutionQueue({ maxConcurrent: 2, maxQueueLength: 10 });
      const result = await queue.submit('t1', async () => 42);
      expect(result).toBe(42);
    });

    it('should execute multiple tasks concurrently up to limit', async () => {
      queue = createExecutionQueue({ maxConcurrent: 2, maxQueueLength: 10 });
      const order: string[] = [];

      const p1 = queue.submit('t1', async () => {
        order.push('t1-start');
        await new Promise(r => setTimeout(r, 50));
        order.push('t1-end');
        return 1;
      });

      const p2 = queue.submit('t2', async () => {
        order.push('t2-start');
        await new Promise(r => setTimeout(r, 50));
        order.push('t2-end');
        return 2;
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(1);
      expect(r2).toBe(2);
      expect(order.indexOf('t1-start')).toBeLessThan(order.indexOf('t1-end'));
      expect(order.indexOf('t2-start')).toBeLessThan(order.indexOf('t2-end'));
    });

    it('should queue tasks when at capacity', async () => {
      queue = createExecutionQueue({ maxConcurrent: 1, maxQueueLength: 10 });
      const results: number[] = [];

      const p1 = queue.submit('t1', async () => {
        await new Promise(r => setTimeout(r, 50));
        results.push(1);
        return 1;
      });

      const p2 = queue.submit('t2', async () => {
        results.push(2);
        return 2;
      });

      await Promise.all([p1, p2]);
      expect(results).toEqual([1, 2]);
    });
  });

  describe('saturation', () => {
    it('should reject when queue is full', async () => {
      queue = createExecutionQueue({ maxConcurrent: 1, maxQueueLength: 1 });

      const blocker = queue.submit('blocker', () => new Promise(r => setTimeout(r, 200)));
      const queued = queue.submit('queued', async () => 'ok');
      queued.catch(() => {});

      await expect(
        queue.submit('overflow', async () => 'fail')
      ).rejects.toThrow('Queue is full');

      queue.cancel('blocker');
      queue.cancel('queued');
      await blocker.catch(() => {});
      await queued.catch(() => {});
    });
  });

  describe('cancellation', () => {
    it('should cancel a queued task', async () => {
      queue = createExecutionQueue({ maxConcurrent: 1, maxQueueLength: 10 });

      const blocker = queue.submit('blocker', () => new Promise(r => setTimeout(r, 200)));
      const cancelled = queue.submit('to-cancel', async () => 'should not run');

      const wasCancelled = queue.cancel('to-cancel');
      expect(wasCancelled).toBe(true);

      await expect(cancelled).rejects.toThrow('cancelled');

      queue.cancel('blocker');
      await blocker.catch(() => {});
    });

    it('should cancel an active task', async () => {
      queue = createExecutionQueue({ maxConcurrent: 1, maxQueueLength: 10 });

      const task = queue.submit('active', () => new Promise(r => setTimeout(r, 500)));
      await new Promise(r => setTimeout(r, 10));

      const wasCancelled = queue.cancel('active');
      expect(wasCancelled).toBe(true);

      await expect(task).rejects.toThrow('cancelled');
    });

    it('should not start cancelled tasks from queue', async () => {
      queue = createExecutionQueue({ maxConcurrent: 1, maxQueueLength: 10 });
      let ran = false;

      const blocker = queue.submit('blocker', () => new Promise(r => setTimeout(r, 100)));
      const task = queue.submit('will-cancel', async () => {
        ran = true;
        return 'ran';
      });
      task.catch(() => {});

      queue.cancel('will-cancel');
      await blocker;
      await task.catch(() => {});

      expect(ran).toBe(false);
    });

    it('should cancel all tasks', async () => {
      queue = createExecutionQueue({ maxConcurrent: 1, maxQueueLength: 10 });
      const tasks = [
        queue.submit('t1', () => new Promise(r => setTimeout(r, 500))),
        queue.submit('t2', async () => 'queued'),
      ];

      queue.cancelAll();

      const results = await Promise.allSettled(tasks);
      for (const r of results) {
        expect(r.status).toBe('rejected');
      }
    });
  });

  describe('slot recovery', () => {
    it('should recover slots after task completion', async () => {
      queue = createExecutionQueue({ maxConcurrent: 1, maxQueueLength: 10 });

      const r1 = await queue.submit('t1', async () => 1);
      expect(r1).toBe(1);
      expect(queue.activeCount).toBe(0);

      const r2 = await queue.submit('t2', async () => 2);
      expect(r2).toBe(2);
    });

    it('should recover slots after task failure', async () => {
      queue = createExecutionQueue({ maxConcurrent: 1, maxQueueLength: 10 });

      await expect(
        queue.submit('fail', async () => { throw new Error('boom'); })
      ).rejects.toThrow('boom');

      expect(queue.activeCount).toBe(0);

      const result = await queue.submit('after-fail', async () => 'ok');
      expect(result).toBe('ok');
    });

    it('should recover slots after task timeout/cancellation', async () => {
      queue = createExecutionQueue({ maxConcurrent: 1, maxQueueLength: 10 });

      const task = queue.submit('timeout', () => new Promise(r => setTimeout(r, 500)));
      await new Promise(r => setTimeout(r, 10));
      queue.cancel('timeout');
      await task.catch(() => {});

      expect(queue.activeCount).toBe(0);
      const result = await queue.submit('after-cancel', async () => 'ok');
      expect(result).toBe('ok');
    });
  });

  describe('simultaneous completion', () => {
    it('should handle all tasks completing at the same time', async () => {
      queue = createExecutionQueue({ maxConcurrent: 4, maxQueueLength: 10 });

      const tasks = Array.from({ length: 4 }, (_, i) =>
        queue.submit(`sim-${i}`, async () => {
          await new Promise(r => setTimeout(r, 10));
          return i;
        })
      );

      const results = await Promise.all(tasks);
      expect(results).toEqual([0, 1, 2, 3]);
      expect(queue.activeCount).toBe(0);
    });
  });

  describe('stats', () => {
    it('should report queue stats', () => {
      queue = createExecutionQueue({ maxConcurrent: 2, maxQueueLength: 8 });
      const stats = queue.getStats();
      expect(stats.maxConcurrent).toBe(2);
      expect(stats.maxQueueLength).toBe(8);
      expect(stats.activeCount).toBe(0);
      expect(stats.queueLength).toBe(0);
    });
  });

  describe('dispose', () => {
    it('should reject submissions after dispose', async () => {
      queue = createExecutionQueue();
      await queue.dispose();
      await expect(
        queue.submit('after-dispose', async () => 'fail')
      ).rejects.toThrow('disposed');
    });
  });
});
