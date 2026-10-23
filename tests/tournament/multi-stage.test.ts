/**
 * Tournament Multi-Stage Model & Compatibility - Test Suite (Phase 2A)
 *
 * Verifies:
 * - Multi-stage model creation from auto-format plan.
 * - Single source of truth: `stages` is root data source for modern tournaments; `rounds` for legacy.
 * - Serialization roundtrip & file persistence compatibility.
 * - Legacy tournament loading & backward compatibility (BO1 and BO3).
 * - Deferred slot resolution: dependent slots are resolved strictly upon match commit.
 * - Group stage completion & Top 2 advancement to Knockout bracket.
 * - Bye handling in preliminary and group stages.
 * - Deterministic stage structure.
 * - Production limit (64 bots) safety.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'node:os';
import {
  createMultiStageTournament,
  isMultiStageTournament,
  getTournamentStages,
  getAllTournamentPairings,
  findPairingInTournament,
  canPairingExecute,
  getExecutablePairings,
  getCurrentStage,
  activateNextStage,
  isTournamentComplete,
  normalizeToMultiStageView,
  commitMatchResultAndResolveSlots,
  validateMultiStageTournament,
  FileTournamentRepository,
  Tournament,
  TournamentParticipant,
  TournamentMatchRecord,
  MAX_PARTICIPANTS,
} from '@tournament/index.js';

describe('Tournament Multi-Stage Model & Compatibility (Phase 2A)', () => {
  let tempDir: string;
  let repo: FileTournamentRepository;

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

  const createMockMatchRecord = (
    pairingId: string,
    participantA: string,
    participantB: string,
    winner: 'A' | 'B' = 'A'
  ): TournamentMatchRecord => ({
    matchId: `match-${pairingId}`,
    pairingId,
    participantA,
    participantB,
    winner,
    terminationReason: 'goal_reached',
    turnCount: 20,
    durationMs: 1500,
    replayRef: `replay-${pairingId}`,
    completedAt: new Date().toISOString(),
  });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-multi-stage-test-'));
    repo = new FileTournamentRepository({ baseDir: tempDir });
  });

  afterEach(async () => {
    if (repo?.close) repo.close();
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('Multi-Stage Creation & Single Source of Truth', () => {
    it('creates multi-stage tournament using stages as root data source (rounds is empty)', () => {
      const participants = createParticipants(8);
      const tournament = createMultiStageTournament({
        tournamentId: 't-ms-8',
        name: 'Multi-Stage 8 Bots',
        participants,
      });

      expect(isMultiStageTournament(tournament)).toBe(true);
      expect(tournament.format).toBe('multi_stage');
      // rounds is empty: stages is the single source of truth!
      expect(tournament.rounds).toEqual([]);
      expect(tournament.stages).toBeDefined();
      expect(tournament.stages).toHaveLength(2); // Group Stage + Knockout Stage

      const val = validateMultiStageTournament(tournament);
      expect(val.valid, val.errors.join('; ')).toBe(true);
    });

    it('creates preliminary stage when bot count > 200', () => {
      const participants = createParticipants(201);
      const tournament = createMultiStageTournament({
        tournamentId: 't-ms-201',
        name: 'Multi-Stage 201 Bots',
        participants,
      });

      expect(tournament.stages).toHaveLength(3); // Preliminary + Group Stage + Knockout
      expect(tournament.stages![0]?.stageType).toBe('preliminary');
      expect(tournament.stages![0]?.status).toBe('in_progress');
      expect(tournament.stages![1]?.stageType).toBe('group_stage');
      expect(tournament.stages![1]?.status).toBe('pending');
      expect(tournament.stages![2]?.stageType).toBe('knockout');
      expect(tournament.stages![2]?.status).toBe('pending');
    });
  });

  describe('Legacy Compatibility & Backward Loading', () => {
    it('correctly loads and accesses legacy single_round_robin BO1 tournament without stages', async () => {
      // Simulate historical legacy tournament saved without stages
      const legacyTournament: Tournament = {
        tournamentId: 't-legacy-bo1',
        name: 'Legacy BO1 Tournament',
        format: 'single_round_robin',
        status: 'running',
        participants: createParticipants(4),
        matchConfig: {
          protocolVersion: '0.1.0',
          maxTurns: 200,
          turnTimeoutMs: 2000,
          maxStdoutBytes: 1048576,
          maxStderrBytes: 10485760,
          failurePolicy: 'forfeit',
          maxRetries: 0,
          logRequests: true,
          logResponses: true,
          logStates: false,
          bestOf: 1,
        },
        scoringConfig: { winPoints: 3, drawPoints: 1, lossPoints: 0 },
        rounds: [
          {
            roundNumber: 1,
            pairings: [
              {
                pairingId: 'p-1',
                roundNumber: 1,
                participantA: 'bot-01',
                participantB: 'bot-04',
                status: 'scheduled',
                matchId: null,
                matchResult: null,
                startedAt: null,
                completedAt: null,
              },
              {
                pairingId: 'p-2',
                roundNumber: 1,
                participantA: 'bot-02',
                participantB: 'bot-03',
                status: 'scheduled',
                matchId: null,
                matchResult: null,
                startedAt: null,
                completedAt: null,
              },
            ],
          },
        ],
        standings: [],
        createdAt: new Date().toISOString(),
        registrationOpenedAt: null,
        registrationClosedAt: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
      };

      await repo.save(legacyTournament);
      const loaded = await repo.load('t-legacy-bo1');
      expect(loaded).toBeDefined();

      // Invariants for legacy
      expect(isMultiStageTournament(loaded!)).toBe(false);
      expect(loaded!.stages).toBeUndefined();
      expect(loaded!.rounds).toHaveLength(1);

      // Accessors work seamlessly with legacy
      const allPairings = getAllTournamentPairings(loaded!);
      expect(allPairings).toHaveLength(2);
      expect(allPairings.map(p => p.pairingId)).toEqual(['p-1', 'p-2']);

      const found = findPairingInTournament(loaded!, 'p-1');
      expect(found).toBeDefined();
      expect(found?.pairing.participantA).toBe('bot-01');

      // Normalization creates unified read-only view without mutating original
      const view = normalizeToMultiStageView(loaded!);
      expect(view.isLegacy).toBe(true);
      expect(view.stages).toHaveLength(1);
      expect(view.stages[0]?.stageType).toBe('group_stage');
      expect(view.allPairings).toHaveLength(2);
    });

    it('correctly loads and accesses legacy BO3 series tournament', async () => {
      const legacyBO3: Tournament = {
        tournamentId: 't-legacy-bo3',
        name: 'Legacy BO3 Tournament',
        format: 'single_round_robin',
        status: 'completed',
        participants: createParticipants(2),
        matchConfig: {
          protocolVersion: '0.1.0',
          maxTurns: 200,
          turnTimeoutMs: 2000,
          maxStdoutBytes: 1048576,
          maxStderrBytes: 10485760,
          failurePolicy: 'forfeit',
          maxRetries: 0,
          logRequests: true,
          logResponses: true,
          logStates: false,
          bestOf: 3,
        },
        scoringConfig: { winPoints: 3, drawPoints: 1, lossPoints: 0 },
        rounds: [
          {
            roundNumber: 1,
            pairings: [
              {
                pairingId: 'p-bo3',
                roundNumber: 1,
                participantA: 'bot-01',
                participantB: 'bot-02',
                status: 'completed',
                matchId: 'm-series-1',
                matchResult: {
                  matchId: 'm-series-1',
                  pairingId: 'p-bo3',
                  participantA: 'bot-01',
                  participantB: 'bot-02',
                  winner: 'A',
                  terminationReason: 'goal_reached',
                  turnCount: 40,
                  durationMs: 3000,
                  replayRef: 'r-series-1',
                  completedAt: new Date().toISOString(),
                  series: {
                    format: 'bo3',
                    bestOf: 3,
                    seed: 'seed-123',
                    winsA: 2,
                    winsB: 0,
                    winner: 'A',
                    games: [],
                  },
                },
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                seriesProgress: {
                  format: 'bo3',
                  bestOf: 3,
                  seed: 'seed-123',
                  nextGame: 3,
                  winsA: 2,
                  winsB: 0,
                  games: [],
                },
              },
            ],
          },
        ],
        standings: [],
        createdAt: new Date().toISOString(),
        registrationOpenedAt: null,
        registrationClosedAt: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      await repo.save(legacyBO3);
      const loaded = await repo.load('t-legacy-bo3');

      expect(isMultiStageTournament(loaded!)).toBe(false);
      expect(isTournamentComplete(loaded!)).toBe(true);
      const found = findPairingInTournament(loaded!, 'p-bo3');
      expect(found?.pairing.matchResult?.series?.format).toBe('bo3');
      expect(found?.pairing.seriesProgress?.winsA).toBe(2);
    });
  });

  describe('Serialization & Persistence Roundtrip for Modern Multi-Stage', () => {
    it('persists and restores multi-stage tournament preserving all stages, groups, rounds and slots', async () => {
      const participants = createParticipants(16);
      const original = createMultiStageTournament({
        tournamentId: 't-ms-16',
        name: 'Multi-Stage 16 Bots',
        participants,
      });

      await repo.save(original);
      const loaded = await repo.load('t-ms-16');

      expect(loaded).toBeDefined();
      expect(isMultiStageTournament(loaded!)).toBe(true);
      expect(loaded!.tournamentId).toBe(original.tournamentId);
      expect(loaded!.stages).toHaveLength(original.stages!.length);

      // Verify JSON serialization round-trip equivalence
      expect(JSON.parse(JSON.stringify(original))).toEqual(JSON.parse(JSON.stringify(loaded)));
    });
  });

  describe('Deferred Slot Resolution & Commit Logic', () => {
    it('updates group standings after each completed match before the group finishes', () => {
      const tournament = createMultiStageTournament({
        tournamentId: 't-ms-live-standings',
        name: 'Live Standings Test',
        participants: createParticipants(8),
      });
      const groupStage = tournament.stages!.find(s => s.stageType === 'group_stage')!;
      const group = groupStage.groups![0]!;
      const pairing = group.rounds[0]!.pairings[0]!;

      expect(group.status).toBe('in_progress');
      expect(group.standings).toHaveLength(0);

      commitMatchResultAndResolveSlots(
        tournament,
        pairing.pairingId,
        createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB!, 'A'),
      );

      expect(group.status).toBe('in_progress');
      expect(group.standings).toHaveLength(group.participantIds.length);
      expect(group.standings[0]).toMatchObject({ participantId: pairing.participantA, matchesPlayed: 1, wins: 1, points: 3 });
      expect(group.standings.find(standing => standing.participantId === pairing.participantB)).toMatchObject({ matchesPlayed: 1, losses: 1, points: 0 });
    });

    it('guarantees dependent slots remain unresolved until prerequisite matches are committed', () => {
      const participants = createParticipants(8);
      const tournament = createMultiStageTournament({
        tournamentId: 't-ms-8-flow',
        name: 'Flow Test',
        participants,
      });

      // Initially in Group Stage:
      // Group Stage has 2 groups (A and B), each with 4 bots -> 6 matches per group = 12 matches.
      // Knockout Stage has 4 bots (Semifinals: 2 matches, Final: 1 match).
      const knockoutStage = tournament.stages!.find(s => s.stageType === 'knockout')!;
      expect(knockoutStage.status).toBe('pending');

      const koRound1 = knockoutStage.rounds![0]!;
      for (const pairing of koRound1.pairings) {
        // Crucial invariant: slots are UNRESOLVED before match commit
        expect(pairing.slotA?.participantId).toBeNull();
        expect(pairing.slotB?.participantId).toBeNull();
        expect(canPairingExecute(pairing)).toBe(false);
      }

      // Executable pairings initially are ONLY from Group Stage
      const initialExecutable = getExecutablePairings(tournament);
      expect(initialExecutable).toHaveLength(12);
      expect(initialExecutable.every(p => p.stageId === 'stage-group')).toBe(true);

      // Execute and commit matches in Group A and Group B
      const groupStage = tournament.stages!.find(s => s.stageType === 'group_stage')!;
      for (const group of groupStage.groups!) {
        for (const round of group.rounds) {
          for (const pairing of round.pairings) {
            if (pairing.status === 'scheduled') {
              const mockRecord = createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB!, 'A');
              commitMatchResultAndResolveSlots(tournament, pairing.pairingId, mockRecord);
            }
          }
        }
      }

      // Now all group matches are done -> Group stage is completed!
      tournament.stageGating = 'manual';
      expect(groupStage.status).toBe('completed');
      expect(knockoutStage.status).toBe('pending');
      expect(activateNextStage(tournament).activated).toBe(true);

      // Crucial invariant: Knockout Round 1 slots are NOW RESOLVED!
      for (const pairing of koRound1.pairings) {
        expect(pairing.slotA?.participantId).not.toBeNull();
        expect(pairing.slotB?.participantId).not.toBeNull();
        expect(canPairingExecute(pairing)).toBe(true);
      }

      // Now Semifinal pairings are executable!
      const semiExecutable = getExecutablePairings(tournament);
      expect(semiExecutable).toHaveLength(2); // 2 Semifinal matches

      // Final match slots remain UNRESOLVED until Semifinals are committed!
      const finalPairing = knockoutStage.rounds![1]!.pairings[0]!;
      expect(finalPairing.slotA?.participantId).toBeNull();
      expect(finalPairing.slotB?.participantId).toBeNull();
      expect(canPairingExecute(finalPairing)).toBe(false);

      // Commit Semifinal 1
      const sf1 = semiExecutable[0]!;
      const sf1Record = createMockMatchRecord(sf1.pairingId, sf1.participantA, sf1.participantB!, 'A');
      commitMatchResultAndResolveSlots(tournament, sf1.pairingId, sf1.record ?? sf1Record);

      // Final slotA is now resolved, but slotB is still unresolved!
      expect(finalPairing.slotA?.participantId).toBe(sf1.participantA);
      expect(finalPairing.slotB?.participantId).toBeNull();
      expect(canPairingExecute(finalPairing)).toBe(false);

      // Commit Semifinal 2
      const sf2 = semiExecutable[1]!;
      const sf2Record = createMockMatchRecord(sf2.pairingId, sf2.participantA, sf2.participantB!, 'A');
      commitMatchResultAndResolveSlots(tournament, sf2.pairingId, sf2.record ?? sf2Record);

      // Final is now completely resolved and executable!
      expect(finalPairing.slotB?.participantId).toBe(sf2.participantA);
      expect(canPairingExecute(finalPairing)).toBe(true);

      // Commit Final
      const finalRecord = createMockMatchRecord(finalPairing.pairingId, finalPairing.participantA, finalPairing.participantB!, 'A');
      commitMatchResultAndResolveSlots(tournament, finalPairing.pairingId, finalRecord);

      // Entire tournament is completed!
      expect(isTournamentComplete(tournament)).toBe(true);
      expect(tournament.status).toBe('completed');
    });
  });

  describe('Preliminary & Regional Bye Resolution', () => {
    it('handles byes in regional qualifiers without requiring match execution', () => {
      const participants = createParticipants(201); // 201 bots -> 4 regions: 51, 50, 50, 50
      const tournament = createMultiStageTournament({
        tournamentId: 't-prelim-bye',
        name: 'Prelim Bye Test',
        participants,
      });

      const prelimStage = tournament.stages![0]!;
      expect(prelimStage.stageType).toBe('preliminary');
      expect(prelimStage.regions).toHaveLength(4);

      const allPrelimPairings = getAllTournamentPairings(tournament).filter(p => p.stageId === 'stage-preliminary');
      const byePairings = allPrelimPairings.filter(p => p.participantB === null);

      expect(byePairings.length).toBeGreaterThan(0);
      for (const byePairing of byePairings) {
        expect(byePairing.status).toBe('completed');
        expect(byePairing.slotA?.sourceType).toBe('bye');
        expect(byePairing.participantA).toMatch(/^bot-/);
        // Bye pairing cannot be executed as a Docker match
        expect(canPairingExecute(byePairing)).toBe(false);
      }
    });

    it('advances regional qualifiers to group stage upon completing all regional matches', () => {
      const participants = createParticipants(256); // 256 bots -> 4 regions of 64 bots, 32 qualifiers each -> 128 into group stage
      const tournament = createMultiStageTournament({
        tournamentId: 't-regional-advancement',
        name: 'Regional Advancement Test',
        participants,
      });

      const prelimStage = tournament.stages![0]!;
      const groupStage = tournament.stages![1]!;
      const knockoutStage = tournament.stages![2]!;

      expect(prelimStage.status).toBe('in_progress');
      expect(groupStage.status).toBe('pending');
      expect(knockoutStage.status).toBe('pending');

      // Group stage pairings are not executable initially
      const groupPairings = (groupStage.groups || []).flatMap(g => g.rounds.flatMap(r => r.pairings));
      expect(groupPairings.every(p => !canPairingExecute(p))).toBe(true);

      // Play through all matches in Region 1
      const region1 = prelimStage.regions![0]!;
      for (const round of region1.rounds) {
        for (const pairing of round.pairings) {
          if (pairing.participantB !== null) {
            commitMatchResultAndResolveSlots(
              tournament,
              pairing.pairingId,
              createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB, 'A')
            );
          }
        }
      }

      expect(region1.status).toBe('completed');
      expect(region1.advancingParticipantIds).toHaveLength(32);
      // Group stage still pending because other 3 regions are not complete
      expect(groupStage.status).toBe('pending');

      // Complete remaining 3 regions
      for (let r = 1; r < 4; r++) {
        const region = prelimStage.regions![r]!;
        for (const round of region.rounds) {
          for (const pairing of round.pairings) {
            if (pairing.participantB !== null) {
              commitMatchResultAndResolveSlots(
                tournament,
                pairing.pairingId,
                createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB, 'A')
              );
            }
          }
        }
        expect(region.status).toBe('completed');
        expect(region.advancingParticipantIds).toHaveLength(32);
      }

      // Now all 4 regions are complete: preliminary stage completes and group stage unlocks!
      tournament.stageGating = 'manual';
      expect(prelimStage.status).toBe('completed');
      expect(prelimStage.advancement.isComplete).toBe(true);
      expect(prelimStage.advancement.advancingParticipantIds).toHaveLength(128);
      expect(groupStage.status).toBe('pending');
      expect(getExecutablePairings(tournament)).toHaveLength(0);
      expect(activateNextStage(tournament).activated).toBe(true);

      // Group stage pairings are now executable with real bot IDs
      const executableGroupPairings = getExecutablePairings(tournament);
      expect(executableGroupPairings.length).toBeGreaterThan(0);
      expect(executableGroupPairings.every(p => p.stageId === 'stage-group')).toBe(true);
      expect(executableGroupPairings[0]!.participantA).toMatch(/^bot-/);
      expect(executableGroupPairings[0]!.participantB).toMatch(/^bot-/);
    });

    it('handles asynchronous regional completions and crash/recovery persistence mid-way', async () => {
      // 201 bots: each region pairs every available Bot; only an odd field gets one bye.
      const participants = createParticipants(201);
      const tournament = createMultiStageTournament({
        tournamentId: 't-async-regions',
        name: 'Asynchronous Regions Test',
        participants,
      });

      const prelimStage = tournament.stages![0]!;
      const groupStage = tournament.stages![1]!;

      // 1. Complete Region 2 first
      const region2 = prelimStage.regions![1]!;
      for (const round of region2.rounds) {
        for (const pairing of round.pairings) {
          if (pairing.participantB !== null) {
            commitMatchResultAndResolveSlots(
              tournament,
              pairing.pairingId,
              createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB, 'A')
            );
          }
        }
      }
      expect(region2.status).toBe('completed');
      expect(region2.advancingParticipantIds).toHaveLength(25);
      expect(prelimStage.status).toBe('in_progress');
      expect(groupStage.status).toBe('pending');

      // 2. Simulate crash / recovery: persist tournament mid-way and reload
      await repo.save(tournament);
      const recovered = await repo.load('t-async-regions');
      expect(recovered).toBeDefined();

      const recPrelim = recovered!.stages![0]!;
      const recGroup = recovered!.stages![1]!;
      expect(recPrelim.regions![1]!.status).toBe('completed');
      expect(recPrelim.regions![1]!.advancingParticipantIds).toHaveLength(25);
      expect(recGroup.status).toBe('pending');

      // 3. Complete Region 4 next on the recovered tournament
      const region4 = recPrelim.regions![3]!;
      for (const round of region4.rounds) {
        for (const pairing of round.pairings) {
          if (pairing.participantB !== null) {
            commitMatchResultAndResolveSlots(
              recovered!,
              pairing.pairingId,
              createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB, 'B')
            );
          }
        }
      }
      expect(region4.status).toBe('completed');
      expect(recGroup.status).toBe('pending');

      // 4. Complete Region 1 next (with byes)
      const region1 = recPrelim.regions![0]!;
      for (const round of region1.rounds) {
        for (const pairing of round.pairings) {
          if (pairing.participantB !== null) {
            commitMatchResultAndResolveSlots(
              recovered!,
              pairing.pairingId,
              createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB, 'A')
            );
          }
        }
      }
      expect(region1.status).toBe('completed');
      expect(recGroup.status).toBe('pending');

      // 5. Complete Region 3 last -> triggers group stage unlock!
      const region3 = recPrelim.regions![2]!;
      for (const round of region3.rounds) {
        for (const pairing of round.pairings) {
          if (pairing.participantB !== null) {
            commitMatchResultAndResolveSlots(
              recovered!,
              pairing.pairingId,
              createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB, 'A')
            );
          }
        }
      }
      expect(region3.status).toBe('completed');
      recovered!.stageGating = 'manual';
      expect(recPrelim.status).toBe('completed');
      expect(recPrelim.advancement.isComplete).toBe(true);
      expect(recPrelim.advancement.advancingParticipantIds).toHaveLength(101);
      expect(recGroup.status).toBe('pending');
      expect(getExecutablePairings(recovered!)).toHaveLength(0);
      expect(activateNextStage(recovered!).activated).toBe(true);

      // Verify the dynamically sized groups have received their participants and matches can execute
      const executableGroup = getExecutablePairings(recovered!);
      expect(executableGroup.length).toBeGreaterThan(0);
      expect(executableGroup.every(p => p.stageId === 'stage-group')).toBe(true);

      // Verify idempotency: committing or checking again does not corrupt state
      const reValidated = validateMultiStageTournament(recovered!);
      expect(reValidated.valid).toBe(true);
    });

    it('correctly handles non-power-of-2 multi-round elimination where bye bots carry over into round 2', () => {
      // 260 bots: 4 regions of 65 bots each
      // In 65 bots: every round halves the field, with one top-seed bye while the field is odd.
      const participants = createParticipants(260);
      const tournament = createMultiStageTournament({
        tournamentId: 't-multi-round-bye',
        name: 'Multi-Round Bye Test',
        participants,
      });

      const prelimStage = tournament.stages![0]!;
      const region1 = prelimStage.regions![0]!;
      expect(region1.rounds).toHaveLength(2);

      // Round 1 has 32 matches and 1 bye, producing 33 survivors.
      const r1 = region1.rounds[0]!;
      expect(r1.pairings.filter(p => p.participantB !== null)).toHaveLength(32);
      expect(r1.pairings.filter(p => p.participantB === null)).toHaveLength(1);

      // Round 2 has 16 matches and 1 bye.
      const r2 = region1.rounds[1]!;
      expect(r2.pairings.filter(p => p.participantB !== null)).toHaveLength(16);
      expect(r2.pairings.filter(p => p.participantB === null)).toHaveLength(1);

      // Verify that bye recipients from Round 1 have their participantId concrete in Round 2
      const byeBotsInR2 = r2.pairings.filter(
        p => p.slotA?.sourceType === 'direct' || p.slotB?.sourceType === 'direct'
      );
      expect(byeBotsInR2.length).toBeGreaterThan(0);

      for (const p of byeBotsInR2) {
        if (p.slotA?.sourceType === 'direct') {
          expect(p.slotA.participantId).toMatch(/^bot-/);
          expect(p.participantA).toMatch(/^bot-/);
        }
        if (p.slotB?.sourceType === 'direct') {
          expect(p.slotB.participantId).toMatch(/^bot-/);
          expect(p.participantB).toMatch(/^bot-/);
        }
      }

      // Execute all Round 1 matches; the next knockout round opens only after
      // every non-bye match has produced a winner.
      for (const r1Match of r1.pairings) {
        if (r1Match.participantB === null) continue;
        commitMatchResultAndResolveSlots(
          tournament,
          r1Match.pairingId,
          createMockMatchRecord(r1Match.pairingId, r1Match.participantA, r1Match.participantB, 'A')
        );
      }

      // Now all Round 2 matches in Region 1 are executable!
      for (const r2Match of r2.pairings) {
        if (r2Match.participantB === null) {
          expect(r2Match.status).toBe('completed');
        } else {
          expect(canPairingExecute(r2Match)).toBe(true);
        }
      }
    });
  });

  describe('Deterministic Stage Structure', () => {
    it('produces 100% byte-for-byte identical structures across multiple creations', () => {
      const participants = createParticipants(32);

      const run1 = createMultiStageTournament({
        tournamentId: 't-det-1',
        name: 'Deterministic Run',
        participants,
      });
      const run2 = createMultiStageTournament({
        tournamentId: 't-det-1',
        name: 'Deterministic Run',
        participants,
      });

      // Override dynamic timestamps for comparison
      run1.createdAt = '2026-01-01T00:00:00.000Z';
      run2.createdAt = '2026-01-01T00:00:00.000Z';

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });
  });

  describe('Small Bot Count Handling', () => {
    it('handles N = 2 bots directly in Knockout Stage without Group Stage', () => {
      const participants = createParticipants(2);
      const tournament = createMultiStageTournament({
        tournamentId: 't-small-2',
        name: '2 Bots Test',
        participants,
      });

      expect(tournament.stages).toHaveLength(1);
      expect(tournament.stages![0]?.stageType).toBe('knockout');
      expect(tournament.stages![0]?.rounds![0]?.pairings).toHaveLength(1);

      const pairing = tournament.stages![0]!.rounds![0]!.pairings[0]!;
      expect(pairing.participantA).toBe('bot-01');
      expect(pairing.participantB).toBe('bot-02');
      expect(canPairingExecute(pairing)).toBe(true);
    });

    it('handles N = 3 bots directly in Knockout Stage with 1 bye and 1 semifinal', () => {
      const participants = createParticipants(3);
      const tournament = createMultiStageTournament({
        tournamentId: 't-small-3',
        name: '3 Bots Test',
        participants,
      });

      expect(tournament.stages).toHaveLength(1);
      const koStage = tournament.stages![0]!;
      expect(koStage.rounds).toHaveLength(2); // Semifinals and Final

      const sfRounds = koStage.rounds![0]!;
      const byePairing = sfRounds.pairings.find(p => p.participantB === null)!;
      const matchPairing = sfRounds.pairings.find(p => p.participantB !== null)!;

      expect(byePairing.participantA).toBe('bot-01');
      expect(matchPairing.participantA).toBe('bot-02');
      expect(matchPairing.participantB).toBe('bot-03');
      expect(canPairingExecute(matchPairing)).toBe(true);
    });
  });

  describe('Production Limit Safety', () => {
    it('preserves MAX_PARTICIPANTS = 64 constant for production API', () => {
      expect(MAX_PARTICIPANTS).toBe(64);
    });
  });
});

