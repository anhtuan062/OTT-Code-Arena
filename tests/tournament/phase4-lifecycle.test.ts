import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileTournamentRepository } from '@tournament/persistence.js';
import { TournamentManager } from '@tournament/manager.js';
import type { MatchExecutor } from '@tournament/executor.js';

describe('Tournament lifecycle automation', () => {
  const dirs: string[] = [];
  const executor: MatchExecutor = { executeMatch: async () => { throw new Error('not used'); } };

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
  });

  async function fixture() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-phase4-lifecycle-'));
    dirs.push(dir);
    const repository = new FileTournamentRepository({ baseDir: dir });
    const manager = new TournamentManager({ repository, executor, enableMultiStage: true });
    return { repository, manager };
  }

  it('opens at the scheduled boundary, snapshots once, and closes without rejecting pending requests', async () => {
    const { manager, repository } = await fixture();
    const created = await manager.createTournament('scheduled-lifecycle', 'Scheduled', 'single_round_robin');
    expect(created.success).toBe(true);
    const now = Date.now();
    await manager.updateTournamentDetails('scheduled-lifecycle', {
      schedule: {
        visibleAt: new Date(now - 2_000).toISOString(),
        registrationOpensAt: new Date(now - 1_000).toISOString(),
        registrationClosesAt: new Date(now + 500).toISOString(),
      },
    });
    const submitted = await manager.submitParticipationRequest('scheduled-lifecycle', {
      competitorId: 'competitor-1',
      botId: 'bot-1',
      participantName: 'Bot 1',
      botSnapshot: { botId: 'bot-1', player: 'A', command: 'bot', args: [] },
    });
    expect(submitted.success).toBe(true);

    const synced = await manager.syncScheduledLifecycle(new Date(now + 1_000));
    expect(synced).toBe(1);
    const loaded = await manager.loadTournament('scheduled-lifecycle');
    expect(loaded.data?.status).toBe('registration_closed');
    expect(loaded.data?.registrationClosedReason).toBe('scheduled');
    expect(loaded.data?.rulesetSnapshot?.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect((loaded.data?.participationRequests ?? []).every(request => request.status === 'pending')).toBe(true);
    const snapshotHash = loaded.data?.rulesetSnapshot?.snapshotHash;
    await manager.syncScheduledLifecycle(new Date(now + 10_000));
    expect((await manager.loadTournament('scheduled-lifecycle')).data?.rulesetSnapshot?.snapshotHash).toBe(snapshotHash);
    repository.close();
  });

  it('keeps manual close semantics and serializes a boundary race', async () => {
    const { manager, repository } = await fixture();
    await manager.createTournament('manual-close', 'Manual', 'single_round_robin');
    await manager.updateTournamentDetails('manual-close', {
      schedule: { registrationClosesAt: new Date(Date.now() + 60_000).toISOString() },
    });
    await manager.openRegistration('manual-close');
    const first = await manager.submitParticipationRequest('manual-close', {
      competitorId: 'competitor-1',
      botId: 'bot-1',
      participantName: 'Bot 1',
      botSnapshot: { botId: 'bot-1', player: 'A', command: 'bot', args: [] },
    });
    expect(first.success).toBe(true);
    const manual = await manager.closeRegistration('manual-close');
    expect(manual.success).toBe(false);
    expect(manual.error).toContain('pending');

    await manager.syncScheduledLifecycle(new Date(Date.now() + 120_000));
    const results = await Promise.all([
      manager.syncScheduledLifecycle(new Date(Date.now() + 120_000)),
      manager.submitParticipationRequest('manual-close', {
        competitorId: 'competitor-2',
        botId: 'bot-2',
        participantName: 'Bot 2',
        botSnapshot: { botId: 'bot-2', player: 'A', command: 'bot', args: [] },
      }),
    ]);
    expect(results[1].success).toBe(false);
    const closed = await manager.loadTournament('manual-close');
    expect(closed.data?.status).toBe('registration_closed');
    expect(closed.data?.registrationClosedReason).toBe('scheduled');
    expect(closed.data?.participationRequests).toHaveLength(1);
    repository.close();
  });
});
