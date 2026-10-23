import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appExport, closeServer, initServer } from '../../server/index.js';

describe('internal bulk Bot seeder endpoint boundary', () => {
  let dataDir: string;
  const originalToken = process.env.OTT_INTERNAL_ADMIN_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-bulk-endpoint-'));
    process.env.NODE_ENV = 'test';
    process.env.OTT_INTERNAL_ADMIN_TOKEN = 'release-gate-secret';
    await initServer(dataDir);
  });

  afterEach(async () => {
    await closeServer();
    await fs.rm(dataDir, { recursive: true, force: true });
    if (originalToken === undefined) delete process.env.OTT_INTERNAL_ADMIN_TOKEN;
    else process.env.OTT_INTERNAL_ADMIN_TOKEN = originalToken;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('hides the endpoint from a public Host even when a fake loopback forwarding header is supplied', async () => {
    const response = await request(appExport)
      .post('/internal/admin/bulk-bot-seed')
      .set('Host', 'arena.example.test')
      .set('X-Forwarded-For', '127.0.0.1')
      .set('X-Ott-Internal-Token', 'release-gate-secret')
      .send({ tournamentId: 'qa-gate', count: 4, runtime: 'mixed', qaConfirmation: 'qa-gate' });

    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain('release-gate-secret');
  });

  it('does not trust X-Forwarded-For and rejects a missing or invalid token', async () => {
    const spoofedAddress = await request(appExport)
      .post('/internal/admin/bulk-bot-seed')
      .set('Host', '127.0.0.1')
      .set('X-Forwarded-For', '203.0.113.10')
      .set('X-Ott-Internal-Token', 'release-gate-secret')
      .send({ tournamentId: 'qa-gate', count: 4, runtime: 'mixed', qaConfirmation: 'qa-gate' });
    expect(spoofedAddress.status).toBe(503);

    const missingToken = await request(appExport)
      .post('/internal/admin/bulk-bot-seed')
      .set('Host', '127.0.0.1')
      .send({ tournamentId: 'qa-gate', count: 4, runtime: 'mixed', qaConfirmation: 'qa-gate' });
    expect(missingToken.status).toBe(401);

    const invalidToken = await request(appExport)
      .post('/internal/admin/bulk-bot-seed')
      .set('Host', '127.0.0.1')
      .set('X-Ott-Internal-Token', 'wrong-secret')
      .send({ tournamentId: 'qa-gate', count: 4, runtime: 'mixed', qaConfirmation: 'qa-gate' });
    expect(invalidToken.status).toBe(401);
    expect(JSON.stringify(invalidToken.body)).not.toContain('release-gate-secret');
  });
});
