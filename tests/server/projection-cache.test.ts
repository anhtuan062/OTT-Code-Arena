import { describe, expect, it, vi } from 'vitest';
import { ProjectionCache } from '../../server/projection-cache.js';
import request from 'supertest';
import { appExport } from '../../server/index.js';

describe('ProjectionCache', () => {
  it('deduplicates concurrent misses and bounds entries', async () => {
    const cache = new ProjectionCache({ ttlMs: 10_000, maxEntries: 2, maxBytes: 10_000 });
    let loads = 0;
    const loader = vi.fn(async () => { loads++; await Promise.resolve(); return { value: loads }; });
    const values = await Promise.all([
      cache.getOrLoad('a', loader), cache.getOrLoad('a', loader), cache.getOrLoad('a', loader),
    ]);
    expect(values).toEqual([{ value: 1 }, { value: 1 }, { value: 1 }]);
    expect(loader).toHaveBeenCalledTimes(1);
    await cache.getOrLoad('b', async () => ({ value: 2 }));
    await cache.getOrLoad('c', async () => ({ value: 3 }));
    expect(cache.stats().entries).toBe(2);
  });

  it('does not publish an invalidated in-flight projection', async () => {
    const cache = new ProjectionCache({ ttlMs: 10_000 });
    let release!: () => void;
    const first = cache.getOrLoad('tournament:t1:public:progress', () => new Promise(resolve => { release = () => resolve('old'); }));
    cache.invalidate('tournament:t1:');
    const second = cache.getOrLoad('tournament:t1:public:progress', async () => 'new');
    expect(await second).toBe('new');
    release();
    expect(await first).toBe('old');
    expect(await cache.getOrLoad('tournament:t1:public:progress', async () => 'unexpected')).toBe('new');
  });

  it('keeps the metrics endpoint authentication protected', async () => {
    const response = await request(appExport).get('/api/system/metrics');
    expect(response.status).toBe(401);
  });
});
