import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileTournamentRepository, createTournament } from '@tournament/persistence.js';
import { TournamentManager } from '@tournament/manager.js';
import type { MatchExecutor } from '@tournament/executor.js';

describe('Tournament settings Phase 2', () => {
  const dirs: string[] = [];
  const executor: MatchExecutor = { executeMatch: async () => { throw new Error('not used'); } };

  afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });

  async function fixture() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-phase2-settings-'));
    dirs.push(dir);
    const repository = new FileTournamentRepository({ baseDir: dir });
    const manager = new TournamentManager({ repository, executor, enableMultiStage: true });
    return { dir, repository, manager };
  }

  it('normalizes legacy tournament.json in memory without rewriting it', async () => {
    const { dir, repository } = await fixture();
    const legacy = createTournament('legacy-settings', 'Legacy', 'single_round_robin', { bestOf: 3, maxTurns: 77 }, { winPoints: 9 });
    const raw = { ...legacy } as Record<string, unknown>;
    delete raw.schedule; delete raw.rulesConfig; delete raw.botLimits; delete raw.rulesetSnapshot;
    const file = path.join(dir, legacy.tournamentId, 'tournament.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(raw), 'utf8');
    const before = await fs.readFile(file, 'utf8');
    const loaded = await repository.load(legacy.tournamentId);
    expect(loaded?.matchConfig.bestOf).toBe(3);
    expect(loaded?.matchConfig.maxTurns).toBe(77);
    expect(loaded?.scoringConfig.winPoints).toBe(9);
    expect(loaded?.schedule.registrationClosesAt).toBe(loaded?.registrationClosedAt);
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    repository.close();
  });

  it('creates an immutable rules snapshot and serializes concurrent updates', async () => {
    const { manager, repository } = await fixture();
    const created = await manager.createTournament('settings-lock', 'Settings', 'single_round_robin', { bestOf: 2 });
    expect(created.success).toBe(true);
    const concurrent = await Promise.all([
      manager.updateTournamentDetails('settings-lock', { description: 'A' }),
      manager.updateTournamentDetails('settings-lock', { contactInfo: 'B' }),
    ]);
    expect(concurrent.every(result => result.success)).toBe(true);
    const opened = await manager.openRegistration('settings-lock');
    expect(opened.data?.rulesetSnapshot?.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(opened.data?.rulesetSnapshot?.matchConfig.bestOf).toBe(2);
    const locked = await manager.updateTournamentDetails('settings-lock', { matchConfig: { bestOf: 3 } });
    expect(locked.success).toBe(false);
    expect(locked.error).toContain('locked');
    repository.close();
  });

  it('defaults current-created tournaments to multi_stage BO3 without changing legacy fixtures', async () => {
    const { manager, repository } = await fixture();
    const modern = await manager.createTournament('modern-bo3', 'Modern');
    expect(modern.success).toBe(true);
    expect(modern.data?.format).toBe('multi_stage');
    expect(modern.data?.configurationVersion).toBe(2);
    expect(modern.data?.matchConfig.bestOf).toBe(3);
    expect(modern.data?.matchConfig.turnTimeoutMs).toBe(5000);
    expect(modern.data?.scoringConfig).toMatchObject({ winPoints: 3, drawPoints: 1, lossPoints: 0 });

    const configuredA = await manager.updateTournamentDetails('modern-bo3', {
      matchConfig: { maxTurns: 80, turnTimeoutMs: 5000 },
    });
    expect(configuredA.success).toBe(true);
    const botLimitsLocked = await manager.updateTournamentDetails('modern-bo3', { botLimits: { memoryLimitMb: 128 } });
    expect(botLimitsLocked.success).toBe(false);
    expect(botLimitsLocked.error).toContain('managed');
    const openedA = await manager.openRegistration('modern-bo3');
    expect(openedA.data?.rulesetSnapshot?.matchConfig.maxTurns).toBe(80);
    expect(openedA.data?.rulesetSnapshot?.matchConfig.turnTimeoutMs).toBe(5000);
    expect(openedA.data?.rulesetSnapshot?.botLimits.memoryLimitMb).toBe(256);
    expect(openedA.data?.rulesetSnapshot?.botLimits.maxBotsPerCompetitor).toBe(1);
    const scoringLocked = await manager.updateTournamentDetails('modern-bo3', { scoringConfig: { winPoints: 5 } });
    expect(scoringLocked.success).toBe(false);

    const modernB = await manager.createTournament('modern-bo3-b', 'Modern B');
    await manager.updateTournamentDetails('modern-bo3-b', { matchConfig: { maxTurns: 160 } });
    const openedB = await manager.openRegistration('modern-bo3-b');
    expect(openedB.data?.rulesetSnapshot?.matchConfig.maxTurns).toBe(160);
    expect(openedB.data?.rulesetSnapshot?.matchConfig.maxTurns).not.toBe(openedA.data?.rulesetSnapshot?.matchConfig.maxTurns);

    const legacy = createTournament('legacy-bo1', 'Legacy', 'single_round_robin');
    expect(legacy.format).toBe('single_round_robin');
    expect(legacy.configurationVersion).toBeUndefined();
    expect(legacy.matchConfig.bestOf).toBe(1);
    repository.close();
  });

  it('validates Conversion, freezes it in the opening snapshot, and defaults legacy data to Standard', async () => {
    const { manager, repository } = await fixture();
    const updated = await manager.updateTournamentDetails('conversion-settings', {
      name: 'Conversion settings',
      rulesConfig: { ruleModifiers: { conversion: true } },
    });
    expect(updated.success).toBe(false);

    const created = await manager.createTournament('conversion-settings', 'Conversion settings');
    expect(created.success).toBe(true);
    const configured = await manager.updateTournamentDetails('conversion-settings', { rulesConfig: { ruleModifiers: { conversion: true } } });
    expect(configured.success).toBe(true);
    const opened = await manager.openRegistration('conversion-settings');
    expect(opened.data?.rulesetSnapshot?.ruleModifiers).toEqual({ conversion: true });
    const locked = await manager.updateTournamentDetails('conversion-settings', { rulesConfig: { ruleModifiers: { conversion: false } } });
    expect(locked.success).toBe(false);
    const legacy = createTournament('conversion-legacy', 'Legacy');
    expect(legacy.rulesConfig.ruleModifiers?.conversion).toBe(false);
    repository.close();
  });
});
