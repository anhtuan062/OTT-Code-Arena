import { describe, expect, it } from 'vitest';
import { FairMatchDispatcher } from '../../tournament/fair-match-dispatcher.js';

describe('FairMatchDispatcher', () => {
  it('round-robins active runs and prevents starvation of a short run', async () => {
    const dispatcher = new FairMatchDispatcher<string>(2);
    const order: string[] = [];
    const run = (key: string, count: number) => dispatcher.submit(key, async () => {
      order.push(key);
      await new Promise(resolve => setTimeout(resolve, 2));
      return { done: order.filter(value => value === key).length >= count, result: `${key}-${order.filter(value => value === key).length}` };
    });

    const [large, short, medium] = await Promise.all([
      run('large', 6),
      run('short', 1),
      run('medium', 2),
    ]);

    expect(large.failures).toEqual([]);
    expect(short.results).toHaveLength(1);
    expect(medium.results).toHaveLength(2);
    expect(order.indexOf('short')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('short')).toBeLessThan(order.filter(value => value === 'large').length);
    expect(order.indexOf('medium')).toBeLessThan(order.filter(value => value === 'large').length);
  });

  it('deduplicates concurrent submissions for the same tournament key', async () => {
    const dispatcher = new FairMatchDispatcher<string>(2);
    let calls = 0;
    const quantum = async () => {
      calls += 1;
      return { done: true, result: 'completed' };
    };
    const first = dispatcher.submit('same-tournament', quantum);
    const second = dispatcher.submit('same-tournament', quantum);
    expect(await first).toEqual(await second);
    expect(calls).toBe(1);
  });
});
