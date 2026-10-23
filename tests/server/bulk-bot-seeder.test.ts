import { describe, expect, it, vi } from 'vitest';
import {
  isExplicitQaTournament,
  parseBulkBotRuntime,
  seedBulkBots,
  validateBulkBotCount,
} from '../../server/admin/bulk-bot-seeder.js';
import type { Tournament } from '../../tournament/types.js';

function qaTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    tournamentId: 'qa-seeder-test',
    name: 'QA seeder test',
    format: 'multi_stage',
    status: 'registration_open',
    createdAt: new Date().toISOString(),
    participants: [],
    rounds: [],
    metadata: { ownerId: 'qa-organizer', environment: 'qa' },
    ...overrides,
  } as Tournament;
}

function dependencies(options: { preflightStatus?: 'passed' | 'failed' } = {}) {
  const users = new Map<string, any>();
  const bots = new Map<string, any>();
  const revisions = new Map<string, any>();
  let requestNumber = 0;
  const review = vi.fn(async () => ({ success: true, data: qaTournament() }));
  const submit = vi.fn(async (_id: string, input: any) => ({
    success: true,
    data: { ...input, requestId: `pr-${++requestNumber}`, status: 'pending', requestedAt: new Date().toISOString() },
  }));
  return {
    calls: { review, submit },
    deps: {
      manager: {
        loadTournament: async () => ({ success: true, data: qaTournament() }),
        listParticipationRequests: async () => ({ success: true, data: [] }),
        submitParticipationRequest: submit,
        reviewParticipationRequest: review,
      },
      userRepository: {
        findByUsername: (username: string) => users.get(username) ?? null,
        findById: (id: string) => id === 'qa-organizer' ? { id, username: id, role: 'organizer' } : [...users.values()].find(item => item.id === id) ?? null,
        create: (input: any) => {
          const user = { id: `user-${users.size + 1}`, ...input };
          users.set(input.username, user);
          return user;
        },
      },
      botRepository: {
        listByOwner: (ownerId: string) => [...bots.values()].filter(item => item.owner_id === ownerId),
        create: (input: any) => {
          const bot = { id: `bot-${bots.size + 1}`, owner_id: input.ownerId, name: input.name };
          bots.set(bot.id, bot);
          return bot;
        },
      },
      botRevisionRepository: {
        listForOwner: (botId: string) => [...revisions.values()].filter(item => item.bot_id === botId),
        create: async (input: any) => {
          const revision = {
            revision_id: `revision-${revisions.size + 1}`,
            bot_id: input.botId,
            owner_id: input.ownerId,
            runtime_id: input.runtimeId,
            source_digest: 'a'.repeat(64),
            execution_mode: input.executionMode,
            sdk_version: input.sdkVersion,
            sdk_digest: input.sdkDigest,
            label: input.label,
          };
          revisions.set(revision.revision_id, revision);
          return revision;
        },
      },
      preflightService: {
        start: vi.fn(),
        wait: vi.fn(async () => ({ status: options.preflightStatus ?? 'passed' })),
      },
    },
  };
}

describe('bulk Bot seeder', () => {
  it('validates bounded CLI values and QA markers', () => {
    expect(parseBulkBotRuntime('mixed')).toBe('mixed');
    expect(() => parseBulkBotRuntime('nodejs')).toThrow();
    expect(validateBulkBotCount(4096)).toBe(4096);
    expect(() => validateBulkBotCount(4097)).toThrow();
    expect(isExplicitQaTournament(qaTournament())).toBe(true);
    expect(isExplicitQaTournament(qaTournament({ tournamentId: 'production-arena', metadata: { ownerId: 'qa-organizer' } }))).toBe(false);
  });

  it('dry-run does not create accounts, revisions, requests or approvals', async () => {
    const { deps, calls } = dependencies();
    const result = await seedBulkBots(deps as any, {
      tournamentId: 'qa-seeder-test', count: 3, runtime: 'mixed', dryRun: true, qaConfirmation: 'qa-seeder-test',
    });
    expect(result.planned).toBe(3);
    expect(result.seeded).toBe(0);
    expect(calls.submit).not.toHaveBeenCalled();
    expect(calls.review).not.toHaveBeenCalled();
  });

  it('never approves a request when preflight fails', async () => {
    const { deps, calls } = dependencies({ preflightStatus: 'failed' });
    const result = await seedBulkBots(deps as any, {
      tournamentId: 'qa-seeder-test', count: 1, runtime: 'cpp', qaConfirmation: 'qa-seeder-test',
    });
    expect(result.failed).toBe(1);
    expect(calls.submit).toHaveBeenCalledTimes(1);
    expect(calls.review).not.toHaveBeenCalled();
  });

  it('seeds mixed runtimes and approves only after preflight passes', async () => {
    const { deps, calls } = dependencies();
    const result = await seedBulkBots(deps as any, {
      tournamentId: 'qa-seeder-test', count: 2, runtime: 'mixed', qaConfirmation: 'qa-seeder-test',
    });
    expect(result.seeded).toBe(2);
    expect(result.results.map(item => item.runtime)).toEqual(['cpp', 'python3']);
    expect(calls.review).toHaveBeenCalledTimes(2);
    expect(calls.review.mock.calls.every(call => call[3] === 'approve')).toBe(true);
  });
});
