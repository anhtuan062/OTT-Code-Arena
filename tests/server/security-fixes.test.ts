import { describe, expect, it } from 'vitest';
import express from 'express';
import { trustedProxyConfig, useSecureSessionCookie } from '../../server/index.js';
import { getOwnedQaFixture, isQaFixturesEnabled, resetQaFixtures } from '../../server/qa-fixtures.js';
import { projectSpectatorReplay } from '../../server/spectator.js';
import type { MatchReplay } from '../../match-runner/types.js';
import request from 'supertest';

describe('targeted security controls', () => {
  it('does not enable QA fixtures from the listening port', () => {
    const previousPort = process.env.PORT;
    const previousFlag = process.env.ENABLE_QA_FIXTURES;
    const previousQaFlag = process.env.QA_FIXTURES;
    try {
      process.env.PORT = '3001';
      delete process.env.ENABLE_QA_FIXTURES;
      delete process.env.QA_FIXTURES;
      resetQaFixtures();
      expect(isQaFixturesEnabled()).toBe(false);
      expect(getOwnedQaFixture('fixture', 'organizer')).toBeUndefined();
    } finally {
      if (previousPort === undefined) delete process.env.PORT; else process.env.PORT = previousPort;
      if (previousFlag === undefined) delete process.env.ENABLE_QA_FIXTURES; else process.env.ENABLE_QA_FIXTURES = previousFlag;
      if (previousQaFlag === undefined) delete process.env.QA_FIXTURES; else process.env.QA_FIXTURES = previousQaFlag;
    }
  });

  it('uses no proxy trust by default and only trusts explicitly configured addresses', () => {
    expect(trustedProxyConfig({})).toBe(false);
    expect(trustedProxyConfig({ TRUSTED_PROXY_CIDRS: '127.0.0.1,::1' })).toEqual(['127.0.0.1', '::1']);
    expect(() => trustedProxyConfig({ TRUSTED_PROXY_CIDRS: '0.0.0.0/0' })).toThrow('invalid proxy address');
    expect(() => trustedProxyConfig({ TRUSTED_PROXY_CIDRS: 'not-a-proxy' })).toThrow('invalid proxy address');
    expect(useSecureSessionCookie({ secure: false } as never, { NODE_ENV: 'production' })).toBe(false);
    expect(useSecureSessionCookie({ secure: true } as never, { NODE_ENV: 'production' })).toBe(true);
    expect(useSecureSessionCookie({ secure: true } as never, { NODE_ENV: 'development' })).toBe(false);
  });

  it('ignores spoofed X-Forwarded-Proto and honors it only from a trusted proxy', async () => {
    const untrusted = express();
    untrusted.set('trust proxy', trustedProxyConfig({ TRUSTED_PROXY_CIDRS: '10.0.0.1' }));
    untrusted.get('/', (req, res) => res.cookie('session', 'test', { secure: useSecureSessionCookie(req, { NODE_ENV: 'production' }) }).end());
    const spoofed = await request(untrusted).get('/').set('X-Forwarded-Proto', 'https');
    expect(spoofed.headers['set-cookie']?.[0]).not.toContain('Secure');

    const trusted = express();
    trusted.set('trust proxy', trustedProxyConfig({ TRUSTED_PROXY_CIDRS: 'loopback' }));
    trusted.get('/', (req, res) => res.cookie('session', 'test', { secure: useSecureSessionCookie(req, { NODE_ENV: 'production' }) }).end());
    const forwarded = await request(trusted).get('/').set('X-Forwarded-Proto', 'https');
    expect(forwarded.headers['set-cookie']?.[0]).toContain('Secure');
  });

  it('redacts public replay projections without mutating the authoritative replay', () => {
    const replay = {
      matchId: 'match-1', protocolVersion: '1',
      initialState: { turn: 1 }, moves: [], finalState: { turn: 2 }, winner: 'A',
      terminationReason: 'goal_reached',
      participantIdentities: { A: { participantId: 'a', participantName: 'A', botId: 'secret-bot' } },
      metadata: { executionDiagnostics: [{ stage: 'runtime', stderr: 'secret' }], sourceRevisions: [{ revisionId: 'private' }] },
    } as unknown as MatchReplay;
    const before = structuredClone(replay);
    const projection = projectSpectatorReplay(replay);
    expect(projection).not.toHaveProperty('metadata');
    expect(projection.participantIdentities?.A).toEqual({ participantId: 'a', participantName: 'A' });
    expect(replay).toEqual(before);
  });
});
