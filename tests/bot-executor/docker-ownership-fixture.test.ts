import { describe, expect, it } from 'vitest';
import { createSourceRevisionQaBot, createSourceRevisionQaParticipationRequest } from '../../scripts/docker-ownership-fixture.mjs';

describe('Docker ownership E2E Bot fixture contract', () => {
  it('provides the legacy Bot fields required before source execution dispatch', () => {
    const bot = createSourceRevisionQaBot({
      botId: 'qa-bot-a',
      competitorId: 'qa-competitor-a',
      execution: {
        kind: 'source-revision', competitorId: 'qa-competitor-a', botId: 'qa-bot-a',
        revisionId: 'qa-revision-a', runtimeId: 'cpp', sourceDigest: 'a'.repeat(64),
        executionMode: 'strategy', sdkVersion: '1.0.0', sdkDigest: 'b'.repeat(64),
      },
    });
    expect(bot).toMatchObject({ botId: 'qa-bot-a', command: 'source-revision', args: [] });
    expect(bot.execution).toMatchObject({ kind: 'source-revision', botId: 'qa-bot-a', competitorId: 'qa-competitor-a' });
  });

  it('fails before resource creation when the source execution identity is incomplete', () => {
    expect(() => createSourceRevisionQaBot({ botId: 'qa-bot-a', competitorId: 'qa-competitor-a', execution: undefined as never })).toThrow(/Invalid source-revision QA Bot fixture/);
  });

  it('creates a participation request that retains the complete pinned source-revision contract', () => {
    const execution = {
      kind: 'source-revision', competitorId: 'qa-competitor-a', botId: 'qa-bot-a', revisionId: 'rev-a', runtimeId: 'cpp',
      sourceDigest: 'a'.repeat(64), executionMode: 'strategy', sdkVersion: '1.0.0', sdkDigest: 'b'.repeat(64),
    };
    const request = createSourceRevisionQaParticipationRequest({ botId: 'qa-bot-a', competitorId: 'qa-competitor-a', execution });
    expect(request).toMatchObject({
      botId: 'qa-bot-a', competitorId: 'qa-competitor-a', revisionId: 'rev-a', runtimeId: 'cpp',
      sourceDigest: execution.sourceDigest, executionMode: 'strategy', sdkVersion: '1.0.0', sdkDigest: execution.sdkDigest,
      botSnapshot: { execution },
    });
  });
});
