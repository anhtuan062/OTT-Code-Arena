import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  appExport,
  getTournamentManager,
  initServer,
  isServerShuttingDown,
  shutdownServer,
} from '../../server/index.js';

describe('coordinated graceful shutdown', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-shutdown-'));
    process.env.NODE_ENV = 'test';
    process.env.EXECUTION_POLICY = 'development';
    await initServer(dir);
  });

  afterEach(async () => {
    // The shutdown path is deliberately idempotent; this also ensures that
    // each test releases its isolated SQLite handle before removing its dir.
    await shutdownServer(1_000);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('closes an idle server and is safe when called repeatedly', async () => {
    const first = shutdownServer(1_000);
    const second = shutdownServer(1_000);

    expect(first).toBe(second);
    expect(isServerShuttingDown()).toBe(true);
    await expect(first).resolves.toEqual({ closed: true, timedOut: false });
  });

  it('rejects new mutation admission while shutdown is draining', async () => {
    const shuttingDown = shutdownServer(1_000);
    const response = await request(appExport)
      .post('/api/auth/login')
      .send({ username: 'not-admitted', password: 'not-admitted' });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Server is shutting down');
    await expect(shuttingDown).resolves.toEqual({ closed: true, timedOut: false });
  });

  it('does not publish closed when manager cleanup fails and allows one retry', async () => {
    const manager = getTournamentManager();
    const closeSpy = vi.spyOn(manager, 'close')
      .mockRejectedValueOnce(new Error('simulated manager close failure'));

    await expect(shutdownServer(1_000)).rejects.toThrow('simulated manager close failure');
    expect(closeSpy).toHaveBeenCalledTimes(1);

    closeSpy.mockRestore();
    const retrySpy = vi.spyOn(manager, 'close');
    await expect(shutdownServer(1_000)).resolves.toEqual({ closed: true, timedOut: false });
    expect(retrySpy).toHaveBeenCalledTimes(1);
    retrySpy.mockRestore();
  });
});
