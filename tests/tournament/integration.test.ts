/**
 * Tournament Manager - Integration Tests with Real Bots
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  TournamentManager,
  createTournamentManager,
} from '@tournament/manager.js';
import { FileTournamentRepository } from '@tournament/persistence.js';
import { clearExecutorCache } from '@bot-executor/index.js';
import type { TournamentBot } from '@tournament/types.js';
import type { MatchResult } from '@match-runner/types.js';

describe('Tournament Manager - Integration', () => {
  let testDir: string;
  let manager: TournamentManager;

  beforeEach(async () => {
    clearExecutorCache();
    testDir = path.join(os.tmpdir(), `ott-integration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(testDir, { recursive: true });
    manager = await createTournamentManager(testDir);
  });

  afterEach(async () => {
    clearExecutorCache();
    manager.close();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  const createRealBot = (id: string): TournamentBot => ({
    botId: id,
    command: 'node',
    args: ['dist/examples/sample-bot/index.js'],
  });

  const createRandomBot = (id: string): TournamentBot => ({
    botId: id,
    command: 'node',
    args: ['dist/examples/random-bot/index.js'],
  });

  it('should run complete tournament with real bots (4 participants)', async () => {
    // Create tournament
    const createResult = await manager.createTournament('integration-1', 'Integration Test');
    expect(createResult.success).toBe(true);

    // Register 4 participants with real bots
    await manager.registerParticipant('integration-1', 'P1', 'Sample Bot 1', createRealBot('sample-1'));
    await manager.registerParticipant('integration-1', 'P2', 'Random Bot 1', createRandomBot('random-1'));
    await manager.registerParticipant('integration-1', 'P3', 'Sample Bot 2', createRealBot('sample-2'));
    await manager.registerParticipant('integration-1', 'P4', 'Random Bot 2', createRandomBot('random-2'));

    // Open registration and generate schedule
    await manager.openRegistration('integration-1');
    const scheduleResult = await manager.generateSchedule('integration-1');
    expect(scheduleResult.success).toBe(true);

    // 4 participants = 3 rounds, 2 matches per round = 6 total matches
    expect(scheduleResult.data?.rounds).toHaveLength(3);
    let totalMatches = 0;
    for (const round of scheduleResult.data!.rounds) {
      totalMatches += round.pairings.filter(p => p.participantB).length;
    }
    expect(totalMatches).toBe(6);

    // Start tournament
    await manager.startTournament('integration-1');

    // Run all matches
    const runResult = await manager.runAllMatches('integration-1');
    expect(runResult.success).toBe(true);
    expect(runResult.data).toHaveLength(6);

    // Verify tournament completed
    const tournament = (await manager.loadTournament('integration-1')).data!;
    expect(tournament.status).toBe('completed');

    // Verify standings
    const standingsResult = await manager.getStandings('integration-1');
    expect(standingsResult.success).toBe(true);
    expect(standingsResult.data).toHaveLength(4);

    // Total points should equal 3 * 6 = 18 (3 points per match * 6 matches)
    const totalPoints = standingsResult.data!.reduce((sum, s) => sum + s.points, 0);
    expect(totalPoints).toBe(18);

    // Verify all match results persisted
    const statsResult = await manager.getStats('integration-1');
    expect(statsResult.success).toBe(true);
    expect(statsResult.data?.completedMatches).toBe(6);
    expect(statsResult.data?.totalMatches).toBe(6);

    // Verify replays exist
    for (const match of runResult.data!) {
      const replayResult = await manager.getReplay('integration-1', match.matchResult.matchId);
      expect(replayResult.success).toBe(true);
      expect(replayResult.data).toBeDefined();
    }
  }, 120000); // 2 minute timeout for full tournament

  it('should run complete tournament with 3 participants (odd count)', async () => {
    const createResult = await manager.createTournament('integration-odd', 'Odd Participants Test');
    expect(createResult.success).toBe(true);

    // Register 3 participants
    await manager.registerParticipant('integration-odd', 'P1', 'Sample Bot 1', createRealBot('sample-1'));
    await manager.registerParticipant('integration-odd', 'P2', 'Random Bot 1', createRandomBot('random-1'));
    await manager.registerParticipant('integration-odd', 'P3', 'Sample Bot 2', createRealBot('sample-2'));

    await manager.openRegistration('integration-odd');
    const scheduleResult = await manager.generateSchedule('integration-odd');
    expect(scheduleResult.success).toBe(true);

    // 3 participants = 3 rounds, 1 match per round = 3 total matches
    expect(scheduleResult.data?.rounds).toHaveLength(3);
    let totalMatches = 0;
    for (const round of scheduleResult.data!.rounds) {
      totalMatches += round.pairings.filter(p => p.participantB).length;
    }
    expect(totalMatches).toBe(3);

    // Check byes - each participant should have exactly 1 bye
    const byeCounts = new Map<string, number>();
    for (const round of scheduleResult.data!.rounds) {
      for (const pairing of round.pairings) {
        if (pairing.participantB === null) {
          byeCounts.set(pairing.participantA, (byeCounts.get(pairing.participantA) || 0) + 1);
        }
      }
    }
    expect(byeCounts.get('P1')).toBe(1);
    expect(byeCounts.get('P2')).toBe(1);
    expect(byeCounts.get('P3')).toBe(1);

    await manager.startTournament('integration-odd');
    const runResult = await manager.runAllMatches('integration-odd');
    expect(runResult.success).toBe(true);
    expect(runResult.data).toHaveLength(3);

    const tournament = (await manager.loadTournament('integration-odd')).data!;
    expect(tournament.status).toBe('completed');
  }, 120000);

  it('should handle tournament with forfeits', async () => {
    // Create a bot that crashes
    const crashingBot: TournamentBot = {
      botId: 'crashing-bot',
      command: 'node',
      args: ['-e', 'process.exit(1)'],
    };

    const createResult = await manager.createTournament('integration-forfeit', 'Forfeit Test');
    expect(createResult.success).toBe(true);

    await manager.registerParticipant('integration-forfeit', 'P1', 'Sample Bot', createRealBot('sample-1'));
    await manager.registerParticipant('integration-forfeit', 'P2', 'Crashing Bot', crashingBot);

    await manager.openRegistration('integration-forfeit');
    await manager.generateSchedule('integration-forfeit');
    await manager.startTournament('integration-forfeit');

    const runResult = await manager.runAllMatches('integration-forfeit');
    expect(runResult.success).toBe(true);
    expect(runResult.data).toHaveLength(1);

    // The crashing bot should forfeit
    const match = runResult.data![0];
    expect(['bot_crash', 'bot_timeout']).toContain(match.matchResult.terminationReason);

    const standingsResult = await manager.getStandings('integration-forfeit');
    expect(standingsResult.success).toBe(true);

    // Winner should have 3 points, loser 0
    const winner = standingsResult.data!.find(s => s.points === 3);
    const loser = standingsResult.data!.find(s => s.points === 0);
    expect(winner).toBeDefined();
    expect(loser).toBeDefined();
  }, 60000);

  it('should be idempotent when processing same results', async () => {
    const createResult = await manager.createTournament('integration-idempotent', 'Idempotent Test');
    expect(createResult.success).toBe(true);

    await manager.registerParticipant('integration-idempotent', 'P1', 'Sample Bot 1', createRealBot('sample-1'));
    await manager.registerParticipant('integration-idempotent', 'P2', 'Random Bot 1', createRandomBot('random-1'));
    await manager.registerParticipant('integration-idempotent', 'P3', 'Sample Bot 2', createRealBot('sample-2'));
    await manager.registerParticipant('integration-idempotent', 'P4', 'Random Bot 2', createRandomBot('random-2'));

    await manager.openRegistration('integration-idempotent');
    await manager.generateSchedule('integration-idempotent');
    await manager.startTournament('integration-idempotent');

    // Run tournament once
    await manager.runAllMatches('integration-idempotent');

    // Resume and recompute standings
    const resumeResult = await manager.resumeTournament('integration-idempotent');
    expect(resumeResult.success).toBe(true);

    const standings1 = (await manager.getStandings('integration-idempotent')).data!;
    const standings2 = (await manager.getStandings('integration-idempotent')).data!;

    // Standings should be identical
    for (let i = 0; i < standings1.length; i++) {
      expect(standings1[i].points).toBe(standings2[i].points);
      expect(standings1[i].wins).toBe(standings2[i].wins);
      expect(standings1[i].losses).toBe(standings2[i].losses);
    }
  }, 120000);
});
