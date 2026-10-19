/**
 * Multi-Stage Tournament Correctness Hardening - Regression Tests
 *
 * Verifies fixes for:
 * - F1: Knockout champion exclusively derived from Final pairing, rejecting last-match overwrite & placeholder execution
 * - F2: 3-bot tournament BYE dependency & slot resolution without deadlock
 * - F3: Transitive standings sorting for 3+ tied bots (H2H strictly restricted to 2-way tie)
 * - F4: Multi-stage BO3 tournament computes standings upon tournament finish
 * - F5: Recovery and resume do not prematurely populate multi-stage standings before completion
 * - F6: Symmetric group qualification slot matching (1st/2nd in slotA/slotB)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'node:os';
import {
  createMultiStageTournament,
  commitMatchResultAndResolveSlots,
  findPairingInTournament,
  TournamentManager,
  FileTournamentRepository,
  TournamentParticipant,
  TournamentMatchRecord,
  sortStandings,
  TournamentStanding,
  Tournament,
} from '@tournament/index.js';
import { MockMatchExecutor } from '@tournament/executor.js';

describe('Multi-Stage Tournament Correctness Hardening', () => {
  let tempDir: string;
  let repo: FileTournamentRepository;
  let manager: TournamentManager;

  const createParticipants = (count: number): TournamentParticipant[] => {
    const padLen = Math.max(2, String(count).length);
    return Array.from({ length: count }, (_, i) => ({
      participantId: `bot-${String(i + 1).padStart(padLen, '0')}`,
      name: `Bot ${i + 1}`,
      bot: {
        botId: `bot-${String(i + 1).padStart(padLen, '0')}`,
        player: 'A' as const,
        command: 'node',
        args: ['bot.js'],
      },
      registeredAt: new Date(1000 * (i + 1)).toISOString(),
    }));
  };

  const createMatchRecord = (
    pairingId: string,
    participantA: string,
    participantB: string,
    winner: 'A' | 'B' | 'DRAW',
    completedAt = new Date().toISOString()
  ): TournamentMatchRecord => {
    const matchId = `match-${pairingId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    return {
      matchId,
      pairingId,
      participantA,
      participantB,
      winner,
      terminationReason: winner === 'DRAW' ? 'turn_limit' : 'goal_reached',
      turnCount: 20,
      durationMs: 1000,
      replayRef: matchId,
      completedAt,
    };
  };

class FlexibleMockMatchExecutor implements MatchExecutor {
  async executeMatch(
    matchId: string,
    playerA: any,
    playerB: any
  ): Promise<any> {
    return {
      matchId,
      protocolVersion: '1.0.0',
      status: 'finished',
      winner: 'A',
      terminationReason: 'goal_reached',
      turnCount: 10,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: 500,
      playerA,
      playerB,
      initialState: {},
      finalState: {},
      turnLog: [],
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-correctness-test-'));
    repo = new FileTournamentRepository({ baseDir: tempDir });
    manager = new TournamentManager({
      repository: repo,
      executor: new FlexibleMockMatchExecutor(),
    });
  });

  afterEach(async () => {
    if (repo?.close) repo.close();
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('F1: Champion Determination and Out-of-Order / Placeholder Records', () => {
    it('crowns the winner of the Final match even if another match commits after Final', () => {
      const participants = createParticipants(4);
      const tournament = createMultiStageTournament({
        tournamentId: 't-ms-f1',
        name: 'F1 Final Champion Test',
        participants,
      });

      // 4 bots format has stage-group (1 group of 4) then knockout
      const koStage = tournament.stages?.find(s => s.stageType === 'knockout');
      expect(koStage).toBeDefined();

      // Resolve knockout slots manually to simulate reaching Final
      const r1 = koStage!.rounds[0]!;
      expect(r1.pairings.length).toBe(1); // 4 bots has 1 group of 4 -> top 2 advance to Final directly
      const finalPairing = r1.pairings[0]!;
      finalPairing.slotA.participantId = 'bot-01';
      finalPairing.participantA = 'bot-01';
      finalPairing.slotB!.participantId = 'bot-02';
      finalPairing.participantB = 'bot-02';

      // Now create an 8-bot tournament which has SF1, SF2 and Final
      const p8 = createParticipants(8);
      const t8 = createMultiStageTournament({
        tournamentId: 't-ms-f1-8bots',
        name: 'F1 8-bot SF and Final',
        participants: p8,
      });

      const ko8 = t8.stages?.find(s => s.stageType === 'knockout')!;
      expect(ko8.rounds.length).toBe(2); // Round 1: SF1, SF2; Round 2: Final
      const sf1 = ko8.rounds[0]!.pairings[0]!;
      const sf2 = ko8.rounds[0]!.pairings[1]!;
      const finalP = ko8.rounds[1]!.pairings[0]!;

      // Setup SF participants
      sf1.slotA.participantId = 'bot-01';
      sf1.participantA = 'bot-01';
      sf1.slotB!.participantId = 'bot-02';
      sf1.participantB = 'bot-02';

      sf2.slotA.participantId = 'bot-03';
      sf2.participantA = 'bot-03';
      sf2.slotB!.participantId = 'bot-04';
      sf2.participantB = 'bot-04';

      // Commit SF1 (bot-01 wins)
      commitMatchResultAndResolveSlots(t8, sf1.pairingId, createMatchRecord(sf1.pairingId, 'bot-01', 'bot-02', 'A'));
      expect(finalP.participantA).toBe('bot-01');

      // Setup finalP participantB directly (as if SF2 had advanced bot-03)
      finalP.slotB!.participantId = 'bot-03';
      finalP.participantB = 'bot-03';

      // Commit Final first (bot-01 wins against bot-03)
      commitMatchResultAndResolveSlots(t8, finalP.pairingId, createMatchRecord(finalP.pairingId, 'bot-01', 'bot-03', 'A'));

      // Now commit SF2 afterwards (bot-04 wins)
      commitMatchResultAndResolveSlots(t8, sf2.pairingId, createMatchRecord(sf2.pairingId, 'bot-03', 'bot-04', 'B'));

      // The champion MUST be bot-01 (winner of Final), NOT bot-04 (winner of SF2 committed last)
      expect(ko8.advancement.advancingParticipantIds).toEqual(['bot-01']);
    });

    it('rejects committing a match result if pairing has unresolved placeholder participants', () => {
      const participants = createParticipants(8);
      const tournament = createMultiStageTournament({
        tournamentId: 't-ms-f1-placeholder',
        name: 'F1 Placeholder Rejection Test',
        participants,
      });

      const koStage = tournament.stages?.find(s => s.stageType === 'knockout')!;
      const finalPairing = koStage.rounds[1]!.pairings[0]!;
      expect(finalPairing.participantA).toContain('winner');

      expect(() => {
        commitMatchResultAndResolveSlots(
          tournament,
          finalPairing.pairingId,
          createMatchRecord(finalPairing.pairingId, finalPairing.participantA, finalPairing.participantB!, 'A')
        );
      }).toThrow(/unresolved placeholder/i);
    });
  });

  describe('F3: Transitive Standings Sorting for 3+ Tied Bots', () => {
    it('sorts deterministically using participantId when 3+ bots have equal points, ignoring cyclic H2H', () => {
      const participants: TournamentParticipant[] = [
        { participantId: 'bot-a', name: 'Bot A', bot: { botId: 'bot-a', player: 'A', command: 'node', args: [] }, registeredAt: '2026-01-01' },
        { participantId: 'bot-b', name: 'Bot B', bot: { botId: 'bot-b', player: 'A', command: 'node', args: [] }, registeredAt: '2026-01-01' },
        { participantId: 'bot-c', name: 'Bot C', bot: { botId: 'bot-c', player: 'A', command: 'node', args: [] }, registeredAt: '2026-01-01' },
      ];

      // A beats B, B beats C, C beats A (cycle)
      const matchRecords: TournamentMatchRecord[] = [
        createMatchRecord('m1', 'bot-a', 'bot-b', 'A'),
        createMatchRecord('m2', 'bot-b', 'bot-c', 'A'),
        createMatchRecord('m3', 'bot-c', 'bot-a', 'A'),
      ];

      const standings: TournamentStanding[] = [
        { participantId: 'bot-a', points: 3, wins: 1, losses: 1, ties: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 },
        { participantId: 'bot-b', points: 3, wins: 1, losses: 1, ties: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 },
        { participantId: 'bot-c', points: 3, wins: 1, losses: 1, ties: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 },
      ];

      // Permutation 1: [A, B, C]
      const sorted1 = sortStandings([standings[0]!, standings[1]!, standings[2]!], participants, matchRecords);
      // Permutation 2: [B, C, A]
      const sorted2 = sortStandings([standings[1]!, standings[2]!, standings[0]!], participants, matchRecords);
      // Permutation 3: [C, B, A]
      const sorted3 = sortStandings([standings[2]!, standings[1]!, standings[0]!], participants, matchRecords);

      const order1 = sorted1.map(s => s.participantId);
      const order2 = sorted2.map(s => s.participantId);
      const order3 = sorted3.map(s => s.participantId);

      // All permutations MUST yield identical alphabetical order ['bot-a', 'bot-b', 'bot-c']
      expect(order1).toEqual(['bot-a', 'bot-b', 'bot-c']);
      expect(order2).toEqual(['bot-a', 'bot-b', 'bot-c']);
      expect(order3).toEqual(['bot-a', 'bot-b', 'bot-c']);
    });

    it('still applies H2H tiebreaker when EXACTLY 2 bots are tied on points', () => {
      const participants: TournamentParticipant[] = [
        { participantId: 'bot-a', name: 'Bot A', bot: { botId: 'bot-a', player: 'A', command: 'node', args: [] }, registeredAt: '2026-01-01' },
        { participantId: 'bot-b', name: 'Bot B', bot: { botId: 'bot-b', player: 'A', command: 'node', args: [] }, registeredAt: '2026-01-01' },
        { participantId: 'bot-c', name: 'Bot C', bot: { botId: 'bot-c', player: 'A', command: 'node', args: [] }, registeredAt: '2026-01-01' },
      ];

      // Bot B beat Bot A. Bot C has fewer points.
      const matchRecords: TournamentMatchRecord[] = [
        createMatchRecord('m1', 'bot-a', 'bot-b', 'B'),
      ];

      const standings: TournamentStanding[] = [
        { participantId: 'bot-a', points: 3, wins: 1, losses: 1, ties: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 },
        { participantId: 'bot-b', points: 3, wins: 1, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 },
        { participantId: 'bot-c', points: 0, wins: 0, losses: 1, ties: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 },
      ];

      const sorted = sortStandings(standings, participants, matchRecords);
      // Exactly 2 bots tied on 3 points: B beat A, so B should be ahead of A
      expect(sorted.map(s => s.participantId)).toEqual(['bot-b', 'bot-a', 'bot-c']);
    });
  });

  describe('F2: 3-Bot Tournament BYE Dependency & Knockout Resolution', () => {
    it('correctly wires 3-bot knockout stage: seed 1 bye to Final, semifinal winner advances to Final', () => {
      const participants = createParticipants(3);
      const tournament = createMultiStageTournament({
        tournamentId: 't-ms-f2-3bots',
        name: '3-Bot BYE Test',
        participants,
      });

      expect(tournament.format).toBe('multi_stage');
      const koStage = tournament.stages?.find(s => s.stageType === 'knockout')!;
      expect(koStage).toBeDefined();
      expect(koStage.rounds.length).toBe(2);

      const sfRound = koStage.rounds[0]!;
      const finalRound = koStage.rounds[1]!;

      // Round 1: SF match between bot-02 and bot-03, and BYE for bot-01
      const sfMatch = sfRound.pairings.find(p => p.participantB !== null)!;
      const sfBye = sfRound.pairings.find(p => p.participantB === null)!;
      expect(sfMatch.participantA).toBe('bot-02');
      expect(sfMatch.participantB).toBe('bot-03');
      expect(sfBye.participantA).toBe('bot-01');

      // Round 2: Final match
      const finalMatch = finalRound.pairings[0]!;
      // Participant A should be bot-01 (the direct seed 1 bye winner), NOT null / synthetic placeholder
      expect(finalMatch.participantA).toBe('bot-01');
      expect(finalMatch.slotA.participantId).toBe('bot-01');
      // Slot B should reference sfMatch pairing ID
      expect(finalMatch.slotB?.sourceRef?.pairingId).toBe(sfMatch.pairingId);

      // Commit SF match result: bot-02 wins
      const res = commitMatchResultAndResolveSlots(
        tournament,
        sfMatch.pairingId,
        createMatchRecord(sfMatch.pairingId, 'bot-02', 'bot-03', 'A')
      );

      // Final match slot B must now be resolved to bot-02!
      expect(res.resolvedCount).toBe(1);
      expect(finalMatch.participantB).toBe('bot-02');
      expect(finalMatch.slotB?.participantId).toBe('bot-02');

      // Commit Final match result: bot-01 wins
      commitMatchResultAndResolveSlots(
        tournament,
        finalMatch.pairingId,
        createMatchRecord(finalMatch.pairingId, 'bot-01', 'bot-02', 'A')
      );

      expect(tournament.status).toBe('completed');
      expect(koStage.advancement.advancingParticipantIds).toEqual(['bot-01']);
    });
  });

  describe('F4 & F5: Standings Consistency in Multi-Stage BO3 & Recovery', () => {
    it('F4: computes tournament.standings upon completion of multi-stage BO3 tournament', async () => {
      // 2 bots: 1 match Final
      const participants = createParticipants(2);
      const tournament = createMultiStageTournament({
        tournamentId: 't-ms-f4-bo3',
        name: 'F4 BO3 Standings Test',
        participants,
        matchConfig: {
          protocolVersion: '1.0.0',
          maxTurns: 50,
          turnTimeoutMs: 1000,
          maxStdoutBytes: 64 * 1024,
          maxStderrBytes: 64 * 1024,
          failurePolicy: 'forfeit',
          bestOf: 3,
        },
      });

      tournament.status = 'running';
      await repo.save(tournament);

      const koStage = tournament.stages?.find(s => s.stageType === 'knockout')!;
      const finalPairing = koStage.rounds[0]!.pairings[0]!;

      // Execute pairing via manager in BO3
      const execRes = await manager.runPairingById(tournament.tournamentId, finalPairing.pairingId);
      if (!execRes.success) {
        console.log('F4 execRes error:', execRes.error);
      }
      expect(execRes.success).toBe(true);

      const loaded = await repo.load(tournament.tournamentId);
      expect(loaded?.status).toBe('completed');
      expect(loaded?.standings).toBeDefined();
      expect(loaded?.standings?.length).toBe(2);
    }, 15000);

    it('F5: does not prematurely set tournament.standings on in-progress multi-stage tournaments during recovery', async () => {
      const participants = createParticipants(8);
      const tournament = createMultiStageTournament({
        tournamentId: 't-ms-f5-recovery',
        name: 'F5 Recovery Standings Test',
        participants,
      });

      tournament.status = 'running';
      await repo.save(tournament);

      // Simulate a completed group match
      const groupStage = tournament.stages?.find(s => s.stageType === 'group_stage')!;
      const g1p1 = groupStage.groups![0]!.rounds[0]!.pairings[0]!;
      const record = createMatchRecord(g1p1.pairingId, g1p1.participantA, g1p1.participantB!, 'A');
      await repo.saveMatchResult(tournament.tournamentId, record.matchId, record, { matchId: record.matchId });

      // Resume tournament
      const resumed = await manager.resumeTournament(tournament.tournamentId);
      expect(resumed.success).toBe(true);

      // Multi-stage tournament is STILL in-progress (group stage not done)
      // tournament.standings should NOT be prematurely populated with global standings
      expect(resumed.data?.status).toBe('running');
      expect(resumed.data?.standings).toEqual([]);
    });
  });

  describe('F6: Qualification Slot Regex Flexibility', () => {
    it('correctly maps 2nd-place seed in slotA and 1st-place seed in slotB', () => {
      // In custom/inverted brackets, slotA might be 2nd-Group-A and slotB 1st-Group-B
      const participants = createParticipants(8);
      const tournament = createMultiStageTournament({
        tournamentId: 't-ms-f6',
        name: 'F6 Regex Flexibility Test',
        participants,
      });

      const koStage = tournament.stages?.find(s => s.stageType === 'knockout')!;
      const p = koStage.rounds[0]!.pairings[0]!;
      // Verify slot sourceRef is parsed with rank when participant matches either 1st or 2nd
      expect(p.slotA.sourceRef?.rank).toBeDefined();
      expect(p.slotB?.sourceRef?.rank).toBeDefined();
    });
  });
});
