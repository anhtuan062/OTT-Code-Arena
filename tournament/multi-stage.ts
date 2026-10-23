/**
 * Tournament Multi-Stage Model & Compatibility Engine (Phase 2A)
 *
 * Implements the multi-stage tournament architecture for OTT Code Arena:
 * - Preliminary, Group Stage, and Knockout models.
 * - Single source of truth: new tournaments use `stages` as root data source.
 *   Legacy tournaments continue using `rounds`.
 * - Slot-based dependency model: slots dependent on previous match results
 *   are only resolved once the prerequisite match result is committed.
 * - Full backward compatibility with BO1 and BO3 legacy tournaments.
 * - Unified accessors and normalization helpers.
 */

import {
  Tournament,
  TournamentStage,
  TournamentGroup,
  TournamentRegion,
  TournamentRound,
  TournamentPairing,
  PairingSlot,
  TournamentMatchRecord,
  TournamentParticipant,
  TournamentMatchConfig,
  TournamentScoringConfig,
  TournamentStanding,
  StageType,
  StageStatus,
  TournamentMultiStageView,
  DEFAULT_TOURNAMENT_MATCH_CONFIG,
  DEFAULT_SCORING_CONFIG,
  DEFAULT_TOURNAMENT_SCHEDULE,
  DEFAULT_TOURNAMENT_RULES,
  DEFAULT_TOURNAMENT_BOT_LIMITS,
} from './types.js';
import {
  calculateTournamentFormat,
  AutoFormatOptions,
  TournamentPlan,
} from './auto-format.js';
import { generateRoundRobinSchedule } from './scheduling.js';
import { computeStandings } from './scoring.js';

export interface CreateMultiStageTournamentParams {
  tournamentId: string;
  name: string;
  participants: TournamentParticipant[];
  matchConfig?: TournamentMatchConfig;
  scoringConfig?: TournamentScoringConfig;
  options?: AutoFormatOptions;
  metadata?: Record<string, unknown>;
}

/**
 * Check if a string is a slot placeholder rather than a concrete bot ID.
 */
export function isSlotPlaceholder(identifier: string | null | undefined): boolean {
  if (!identifier) return false;
  return (
    (identifier.startsWith('P') && identifier.includes('-winner')) ||
    (identifier.startsWith('R') && identifier.includes('-winner')) ||
    (identifier.startsWith('KO-') && identifier.includes('-winner')) ||
    identifier.startsWith('1st-') ||
    identifier.startsWith('2nd-') ||
    identifier.startsWith('Slot-') ||
    identifier.startsWith('Seed-') ||
    identifier.startsWith('Region-') ||
    identifier.startsWith('winner(')
  );
}

/**
 * Check if a tournament is a modern multi-stage tournament.
 */
export function isMultiStageTournament(tournament: Tournament): boolean {
  return tournament.format === 'multi_stage' || (Array.isArray(tournament.stages) && tournament.stages.length > 0);
}

/**
 * Get all stages of a tournament.
 * If legacy tournament, returns a normalized synthetic stage wrapping `tournament.rounds`.
 */
export function getTournamentStages(tournament: Tournament): TournamentStage[] {
  if (isMultiStageTournament(tournament)) {
    return tournament.stages || [];
  }

  // Legacy single_round_robin wrapped in a synthetic stage
  return [
    {
      stageId: 'stage-legacy-round-robin',
      stageType: 'group_stage',
      name: 'Single Round Robin',
      order: 1,
      status: tournament.status === 'completed' ? 'completed' : 'in_progress',
      rounds: tournament.rounds,
      advancement: {
        ruleType: 'group_top_n',
        advancingCount: Math.min(2, tournament.participants.length),
        advancingParticipantIds: (tournament.standings || []).slice(0, 2).map(s => s.participantId),
        isComplete: tournament.status === 'completed',
      },
    },
  ];
}

/**
 * Retrieve all pairings across all stages, regions, and groups in deterministic execution order.
 * If legacy, retrieves pairings from `tournament.rounds`.
 */
export function getAllTournamentPairings(tournament: Tournament): TournamentPairing[] {
  if (!isMultiStageTournament(tournament)) {
    return (tournament.rounds || []).flatMap(r => r.pairings);
  }

  const allPairings: TournamentPairing[] = [];
  const sortedStages = [...(tournament.stages || [])].sort((a, b) => a.order - b.order);

  for (const stage of sortedStages) {
    if (stage.rounds) {
      for (const round of stage.rounds) {
        allPairings.push(...round.pairings);
      }
    }
    if (stage.regions) {
      const sortedRegions = [...stage.regions].sort((a, b) => a.regionIndex - b.regionIndex);
      for (const region of sortedRegions) {
        for (const round of region.rounds) {
          allPairings.push(...round.pairings);
        }
      }
    }
    if (stage.groups) {
      const sortedGroups = [...stage.groups].sort((a, b) => a.groupIndex - b.groupIndex);
      for (const group of sortedGroups) {
        for (const round of group.rounds) {
          allPairings.push(...round.pairings);
        }
      }
    }
  }

  return allPairings;
}

/**
 * Find a specific pairing in a tournament.
 */
export function findPairingInTournament(
  tournament: Tournament,
  pairingId: string
): {
  stage?: TournamentStage;
  region?: TournamentRegion;
  group?: TournamentGroup;
  round?: TournamentRound;
  pairing: TournamentPairing;
} | null {
  if (!isMultiStageTournament(tournament)) {
    for (const round of tournament.rounds || []) {
      const found = round.pairings.find(p => p.pairingId === pairingId);
      if (found) {
        return { round, pairing: found };
      }
    }
    return null;
  }

  for (const stage of tournament.stages || []) {
    if (stage.rounds) {
      for (const round of stage.rounds) {
        const found = round.pairings.find(p => p.pairingId === pairingId);
        if (found) {
          return { stage, round, pairing: found };
        }
      }
    }
    if (stage.regions) {
      for (const region of stage.regions) {
        for (const round of region.rounds) {
          const found = round.pairings.find(p => p.pairingId === pairingId);
          if (found) {
            return { stage, region, round, pairing: found };
          }
        }
      }
    }
    if (stage.groups) {
      for (const group of stage.groups) {
        for (const round of group.rounds) {
          const found = round.pairings.find(p => p.pairingId === pairingId);
          if (found) {
            return { stage, group, round, pairing: found };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Determine if a pairing is ready to execute.
 * A pairing can execute ONLY when:
 * 1. Its status is 'scheduled'.
 * 2. participantA is a real resolved participant (not null, not empty, not a placeholder).
 * 3. participantB is either null (bye) OR a real resolved participant.
 * 4. Any slot descriptors have resolved participantId !== null.
 */
export function canPairingExecute(pairing: TournamentPairing): boolean {
  if (pairing.status !== 'scheduled') {
    return false;
  }

  // Bye pairing does not execute Docker matches
  if (pairing.participantB === null && (!pairing.slotB || pairing.slotB.sourceType === 'bye')) {
    return false;
  }

  // Check participantA
  if (!pairing.participantA || isSlotPlaceholder(pairing.participantA)) {
    return false;
  }
  if (pairing.slotA && pairing.slotA.participantId === null) {
    return false;
  }

  // Check participantB
  if (!pairing.participantB || isSlotPlaceholder(pairing.participantB)) {
    return false;
  }
  if (pairing.slotB && pairing.slotB.participantId === null) {
    return false;
  }

  return true;
}

/**
 * Get the current active stage of the tournament.
 */
export function getCurrentStage(tournament: Tournament): TournamentStage | null {
  const stages = getTournamentStages(tournament);
  const inProgress = stages.find(s => s.status === 'in_progress');
  if (inProgress) return inProgress;

  const pending = stages.find(s => s.status === 'pending');
  if (pending) return pending;

  return stages[stages.length - 1] ?? null;
}

/**
 * Retrieve all currently executable pairings in the tournament.
 */
export function getExecutablePairings(tournament: Tournament): TournamentPairing[] {
  const currentStage = getCurrentStage(tournament);
  if (!currentStage || currentStage.status === 'completed') {
    return [];
  }

  const pairings: TournamentPairing[] = [];
  if (currentStage.rounds) {
    for (const round of currentStage.rounds) {
      for (const pairing of round.pairings) {
        if (canPairingExecute(pairing)) {
          pairings.push(pairing);
        }
      }
    }
  }
  if (currentStage.regions) {
    for (const region of currentStage.regions) {
      if (region.status !== 'completed') {
        for (const round of region.rounds) {
          for (const pairing of round.pairings) {
            if (canPairingExecute(pairing)) {
              pairings.push(pairing);
            }
          }
        }
      }
    }
  }
  if (currentStage.groups) {
    for (const group of currentStage.groups) {
      if (group.status !== 'completed') {
        for (const round of group.rounds) {
          for (const pairing of round.pairings) {
            if (canPairingExecute(pairing)) {
              pairings.push(pairing);
            }
          }
        }
      }
    }
  }

  return pairings;
}

/**
 * Check if the entire tournament is completed.
 */
export function isTournamentComplete(tournament: Tournament): boolean {
  if (tournament.status === 'completed') return true;

  if (!isMultiStageTournament(tournament)) {
    return (
      (tournament.rounds || []).length > 0 &&
      tournament.rounds.every(round =>
        round.pairings.every(p => p.participantB === null || p.status === 'completed')
      )
    );
  }

  return (tournament.stages || []).every(stage => stage.status === 'completed');
}

/**
 * Normalize any tournament (legacy or modern) to a unified multi-stage view.
 * Read-only: does NOT mutate the input tournament.
 */
export function normalizeToMultiStageView(tournament: Tournament): TournamentMultiStageView {
  const isLegacy = !isMultiStageTournament(tournament);
  const stages = getTournamentStages(tournament);
  const allPairings = getAllTournamentPairings(tournament);
  const currentStage = getCurrentStage(tournament);
  const isComplete = isTournamentComplete(tournament);

  return {
    tournamentId: tournament.tournamentId,
    isLegacy,
    stages,
    allPairings,
    currentStage,
    isComplete,
  };
}

/**
 * Build a modern multi-stage tournament structure from an Auto-Format TournamentPlan.
 */
export function createMultiStageTournament(params: CreateMultiStageTournamentParams): Tournament {
  const {
    tournamentId,
    name,
    participants,
    matchConfig = DEFAULT_TOURNAMENT_MATCH_CONFIG,
    scoringConfig = DEFAULT_SCORING_CONFIG,
    options = {},
    metadata = {},
  } = params;

  if (participants.length < 2) {
    throw new Error(`At least 2 participants required for tournament, got ${participants.length}`);
  }

  // Calculate the deterministic structural plan
  const plan: TournamentPlan = calculateTournamentFormat(participants, options);
  const stages: TournamentStage[] = [];
  let stageOrder = 1;

  // 1. Preliminary Stage (if needed)
  if (plan.hasPreliminary) {
    if (plan.regionalPlan) {
      // Modern Regional Qualifiers structure
      const regions: TournamentRegion[] = [];

      for (const rp of plan.regionalPlan.regions) {
        const regionRounds: TournamentRound[] = [];

        for (const pr of rp.rounds) {
          const pairings: TournamentPairing[] = [];

          for (let pIdx = 0; pIdx < pr.pairings.length; pIdx++) {
            const pairingPlan = pr.pairings[pIdx]!;
            const pairingId = pairingPlan.pairingId;

            let slotA: PairingSlot;
            let slotB: PairingSlot | null = null;

            if (pr.roundIndex === 1) {
              slotA = {
                slotId: pairingPlan.participantA,
                sourceType: pairingPlan.isBye ? 'bye' : 'direct',
                participantId: pairingPlan.participantA,
                placeholder: pairingPlan.participantA,
              };
              if (!pairingPlan.isBye && pairingPlan.participantB) {
                slotB = {
                  slotId: pairingPlan.participantB,
                  sourceType: 'direct',
                  participantId: pairingPlan.participantB,
                  placeholder: pairingPlan.participantB,
                };
              }
            } else {
              const isABye = !pairingPlan.participantA.includes('-winner');
              slotA = {
                slotId: pairingPlan.participantA,
                sourceType: isABye ? 'direct' : 'preliminary_winner',
                participantId: isABye ? pairingPlan.participantA : null,
                placeholder: pairingPlan.participantA,
                sourceRef: isABye
                  ? undefined
                  : {
                      stageId: 'stage-preliminary',
                      regionId: rp.regionId,
                      pairingId: pairingPlan.participantA.replace('-winner', ''),
                    },
              };
              if (pairingPlan.participantB) {
                const isBBye = !pairingPlan.participantB.includes('-winner');
                slotB = {
                  slotId: pairingPlan.participantB,
                  sourceType: isBBye ? 'direct' : 'preliminary_winner',
                  participantId: isBBye ? pairingPlan.participantB : null,
                  placeholder: pairingPlan.participantB,
                  sourceRef: isBBye
                    ? undefined
                    : {
                        stageId: 'stage-preliminary',
                        regionId: rp.regionId,
                        pairingId: pairingPlan.participantB.replace('-winner', ''),
                      },
                };
              }
            }

            const pairing: TournamentPairing = {
              pairingId,
              roundNumber: pr.roundIndex,
              participantA: slotA.participantId ?? slotA.placeholder,
              participantB: slotB ? (slotB.participantId ?? slotB.placeholder) : null,
              status: pairingPlan.isBye ? 'completed' : 'scheduled',
              matchId: null,
              matchResult: null,
              startedAt: null,
              completedAt: pairingPlan.isBye ? new Date().toISOString() : null,
              slotA,
              slotB,
              stageId: 'stage-preliminary',
              regionId: rp.regionId,
            };

            pairings.push(pairing);
          }

          regionRounds.push({
            roundNumber: pr.roundIndex,
            pairings,
          });
        }

        regions.push({
          regionId: rp.regionId,
          name: rp.name,
          regionIndex: rp.regionIndex,
          participantIds: rp.participants,
          rounds: regionRounds,
          advancingParticipantIds: [],
          qualifierLimit: rp.qualifierLimit,
          qualifierCount: rp.qualifierCount,
          status: 'in_progress',
        });
      }

      stages.push({
        stageId: 'stage-preliminary',
        stageType: 'preliminary',
        name: 'Regional Qualifiers Stage',
        order: stageOrder++,
        status: 'in_progress',
        regions,
        advancement: {
          ruleType: 'regional_qualifier',
          advancingCount: plan.botsEnteringGroupStage,
          advancingParticipantIds: [],
          isComplete: false,
        },
      });
    } else if (plan.preliminaryRounds.length > 0) {
      // Single-stream preliminary rounds (legacy)
      const prelimRounds: TournamentRound[] = [];

      for (const pr of plan.preliminaryRounds) {
        const pairings: TournamentPairing[] = [];

        for (let pIdx = 0; pIdx < pr.pairings.length; pIdx++) {
          const pairingPlan = pr.pairings[pIdx]!;
          const pairingId = pairingPlan.pairingId;

          let slotA: PairingSlot;
          let slotB: PairingSlot | null = null;

          if (pr.roundIndex === 1) {
            slotA = {
              slotId: pairingPlan.participantA,
              sourceType: pairingPlan.isBye ? 'bye' : 'direct',
              participantId: pairingPlan.participantA,
              placeholder: pairingPlan.participantA,
            };
            if (!pairingPlan.isBye && pairingPlan.participantB) {
              slotB = {
                slotId: pairingPlan.participantB,
                sourceType: 'direct',
                participantId: pairingPlan.participantB,
                placeholder: pairingPlan.participantB,
              };
            }
          } else {
            const isABye = !pairingPlan.participantA.includes('-winner');
            slotA = {
              slotId: pairingPlan.participantA,
              sourceType: isABye ? 'direct' : 'preliminary_winner',
              participantId: isABye ? pairingPlan.participantA : null,
              placeholder: pairingPlan.participantA,
              sourceRef: isABye
                ? undefined
                : {
                    stageId: 'stage-preliminary',
                    pairingId: pairingPlan.participantA.replace('-winner', ''),
                  },
            };
            if (pairingPlan.participantB) {
              const isBBye = !pairingPlan.participantB.includes('-winner');
              slotB = {
                slotId: pairingPlan.participantB,
                sourceType: isBBye ? 'direct' : 'preliminary_winner',
                participantId: isBBye ? pairingPlan.participantB : null,
                placeholder: pairingPlan.participantB,
                sourceRef: isBBye
                  ? undefined
                  : {
                      stageId: 'stage-preliminary',
                      pairingId: pairingPlan.participantB.replace('-winner', ''),
                    },
              };
            }
          }

          const pairing: TournamentPairing = {
            pairingId,
            roundNumber: pr.roundIndex,
            participantA: slotA.participantId ?? slotA.placeholder,
            participantB: slotB ? (slotB.participantId ?? slotB.placeholder) : null,
            status: pairingPlan.isBye ? 'completed' : 'scheduled',
            matchId: null,
            matchResult: null,
            startedAt: null,
            completedAt: pairingPlan.isBye ? new Date().toISOString() : null,
            slotA,
            slotB,
            stageId: 'stage-preliminary',
          };

          pairings.push(pairing);
        }

        prelimRounds.push({
          roundNumber: pr.roundIndex,
          pairings,
        });
      }

      stages.push({
        stageId: 'stage-preliminary',
        stageType: 'preliminary',
        name: 'Preliminary Stage',
        order: stageOrder++,
        status: 'in_progress',
        rounds: prelimRounds,
        advancement: {
          ruleType: 'preliminary_elimination',
          advancingCount: plan.botsEnteringGroupStage,
          advancingParticipantIds: [],
          isComplete: false,
        },
      });
    }
  }

  // 2. Group Stage (if >= 4 bots)
  if (plan.groupStage) {
    const groupStageStatus: StageStatus = plan.hasPreliminary ? 'pending' : 'in_progress';
    const groups: TournamentGroup[] = [];

    for (const groupPlan of plan.groupStage.groups) {
      // Setup round-robin rounds for the group
      const groupRounds: TournamentRound[] = [];

      if (groupPlan.rounds) {
        for (const r of groupPlan.rounds) {
          const groupPairings: TournamentPairing[] = [];

          for (const p of r.pairings) {
            const pairingId = `${groupPlan.groupId}-${p.pairingId}`;
            const isBye = p.participantB === null;

            const isDirectA = !plan.hasPreliminary;
            const isDirectB = !plan.hasPreliminary && !isBye;

            const matchRegionalA = p.participantA.match(/^Region-(\d+)-Q(\d+)$/);
            const slotA: PairingSlot = {
              slotId: p.participantA,
              sourceType: matchRegionalA
                ? 'regional_qualifier'
                : isDirectA
                ? 'direct'
                : 'preliminary_winner',
              participantId: isDirectA ? p.participantA : null,
              placeholder: p.participantA,
              sourceRef: matchRegionalA
                ? {
                    stageId: 'stage-preliminary',
                    regionId: `region-${matchRegionalA[1]}`,
                    rank: parseInt(matchRegionalA[2]!, 10),
                  }
                : isDirectA
                ? undefined
                : {
                    stageId: 'stage-preliminary',
                    pairingId: p.participantA.replace('-winner', ''),
                  },
            };

            let slotB: PairingSlot | null = null;
            if (!isBye && p.participantB) {
              const matchRegionalB = p.participantB.match(/^Region-(\d+)-Q(\d+)$/);
              slotB = {
                slotId: p.participantB,
                sourceType: matchRegionalB
                  ? 'regional_qualifier'
                  : isDirectB
                  ? 'direct'
                  : 'preliminary_winner',
                participantId: isDirectB ? p.participantB : null,
                placeholder: p.participantB,
                sourceRef: matchRegionalB
                  ? {
                      stageId: 'stage-preliminary',
                      regionId: `region-${matchRegionalB[1]}`,
                      rank: parseInt(matchRegionalB[2]!, 10),
                    }
                  : isDirectB
                  ? undefined
                  : {
                      stageId: 'stage-preliminary',
                      pairingId: p.participantB.replace('-winner', ''),
                    },
              };
            }

            const pairing: TournamentPairing = {
              pairingId,
              roundNumber: r.roundNumber,
              participantA: slotA.participantId ?? slotA.placeholder,
              participantB: slotB ? (slotB.participantId ?? slotB.placeholder) : null,
              status: isBye ? 'completed' : 'scheduled',
              matchId: null,
              matchResult: null,
              startedAt: null,
              completedAt: isBye ? new Date().toISOString() : null,
              slotA,
              slotB,
              stageId: 'stage-group',
              groupId: groupPlan.groupId,
            };

            groupPairings.push(pairing);
          }

          groupRounds.push({
            roundNumber: r.roundNumber,
            pairings: groupPairings,
          });
        }
      }

      groups.push({
        groupId: groupPlan.groupId,
        name: `Group ${groupPlan.groupId.replace('Group-', '')}`,
        groupIndex: groupPlan.groupIndex,
        participantIds: groupPlan.participants,
        rounds: groupRounds,
        standings: [],
        status: groupStageStatus,
      });
    }

    stages.push({
      stageId: 'stage-group',
      stageType: 'group_stage',
      name: 'Group Stage',
      order: stageOrder++,
      status: groupStageStatus,
      groups,
      advancement: {
        ruleType: 'group_top_n',
        qualifiersPerGroup: 2,
        advancingCount: plan.groupStage.advancingCount,
        advancingParticipantIds: [],
        isComplete: false,
      },
    });
  }

  // 3. Knockout Stage
  const knockoutRounds: TournamentRound[] = [];
  const bracket = plan.knockoutBracket;

  for (let rIdx = 0; rIdx < bracket.rounds.length; rIdx++) {
    const roundPlan = bracket.rounds[rIdx]!;
    const pairings: TournamentPairing[] = [];

    for (const p of roundPlan.pairings) {
      let slotA: PairingSlot;
      let slotB: PairingSlot | null = null;

      if (roundPlan.roundIndex === 1 && plan.groupStage !== null) {
        // Round 1: depends on Group Stage Top 2
        const matchA = p.participantA.match(/^(1st|2nd)-(Group-[A-Za-z0-9]+)$/);
        const rankA = matchA ? (matchA[1] === '1st' ? 1 : 2) : 1;
        const matchB = p.participantB ? p.participantB.match(/^(1st|2nd)-(Group-[A-Za-z0-9]+)$/) : null;
        const rankB = matchB ? (matchB[1] === '1st' ? 1 : 2) : 2;

        slotA = {
          slotId: p.participantA,
          sourceType: 'group_rank',
          participantId: null,
          placeholder: p.participantA,
          sourceRef: matchA
            ? { stageId: 'stage-group', groupId: matchA[2]!, rank: rankA }
            : undefined,
        };

        if (p.participantB) {
          slotB = {
            slotId: p.participantB,
            sourceType: 'group_rank',
            participantId: null,
            placeholder: p.participantB,
            sourceRef: matchB
              ? { stageId: 'stage-group', groupId: matchB[2]!, rank: rankB }
              : undefined,
          };
        }
      } else {
        // Knockout matches without group stage, or Round 2+
        const prevRoundNumber = roundPlan.roundIndex - 1;
        const defaultSourcePairingAId = `KO-r${prevRoundNumber}-m${2 * p.matchIndex - 1}`;
        const defaultSourcePairingBId = `KO-r${prevRoundNumber}-m${2 * p.matchIndex}`;

        const resolveSlot = (participantStr: string, defaultSourceId: string): PairingSlot => {
          const isDirect = participants.some(bot => bot.participantId === participantStr);
          if (isDirect) {
            return {
              slotId: participantStr,
              sourceType: 'direct',
              participantId: participantStr,
              placeholder: participantStr,
            };
          }

          let sourcePairingId = defaultSourceId;
          if (participantStr.endsWith('-winner')) {
            sourcePairingId = participantStr.slice(0, -7);
          } else {
            const funcMatch = participantStr.match(/^winner\((.+)\)$/);
            if (funcMatch) {
              sourcePairingId = funcMatch[1]!;
            }
          }

          return {
            slotId: `${sourcePairingId}-winner`,
            sourceType: 'knockout_winner',
            participantId: null,
            placeholder: `${sourcePairingId}-winner`,
            sourceRef: { stageId: 'stage-knockout', pairingId: sourcePairingId },
          };
        };

        slotA = resolveSlot(p.participantA, defaultSourcePairingAId);
        if (p.participantB) {
          slotB = resolveSlot(p.participantB, defaultSourcePairingBId);
        }
      }

      const pairing: TournamentPairing = {
        pairingId: p.pairingId,
        roundNumber: roundPlan.roundIndex,
        participantA: slotA.participantId ?? slotA.placeholder,
        participantB: slotB ? (slotB.participantId ?? slotB.placeholder) : null,
        status: p.isBye ? 'completed' : 'scheduled',
        matchId: null,
        matchResult: null,
        startedAt: null,
        completedAt: p.isBye ? new Date().toISOString() : null,
        slotA,
        slotB,
        stageId: 'stage-knockout',
      };

      pairings.push(pairing);
    }

    knockoutRounds.push({
      roundNumber: roundPlan.roundIndex,
      pairings,
    });
  }

  const knockoutStatus: StageStatus = stages.length === 0 ? 'in_progress' : 'pending';
  stages.push({
    stageId: 'stage-knockout',
    stageType: 'knockout',
    name: 'Knockout Stage',
    order: stageOrder++,
    status: knockoutStatus,
    rounds: knockoutRounds,
    advancement: {
      ruleType: 'knockout_champion',
      advancingCount: 1,
      advancingParticipantIds: [],
      isComplete: false,
    },
  });

  return {
    tournamentId,
    name,
    format: 'multi_stage',
    status: 'draft',
    participants,
    matchConfig,
    scoringConfig,
    schedule: { ...DEFAULT_TOURNAMENT_SCHEDULE },
    rulesConfig: { ...DEFAULT_TOURNAMENT_RULES },
    botLimits: { ...DEFAULT_TOURNAMENT_BOT_LIMITS },
    rulesetSnapshot: null,
    // rounds is empty on multi-stage: stages is the single source of truth!
    rounds: [],
    standings: [],
    createdAt: new Date().toISOString(),
    registrationOpenedAt: null,
    registrationClosedAt: null,
    startedAt: null,
    completedAt: null,
    stages,
    metadata,
  };
}

/**
 * Commit a match result and resolve dependent slots across downstream stages and groups.
 * Ensures slots dependent on previous match results are ONLY resolved once the result is committed.
 */
export function commitMatchResultAndResolveSlots(
  tournament: Tournament,
  pairingId: string,
  matchResult: TournamentMatchRecord
): {
  resolvedCount: number;
  newlyExecutablePairings: string[];
} {
  const found = findPairingInTournament(tournament, pairingId);
  if (!found) {
    throw new Error(`Pairing ${pairingId} not found in tournament`);
  }

  const { stage, group, pairing } = found;

  // Check for idempotent re-commit or conflicting result
  if (pairing.status === 'completed' && pairing.matchResult) {
    if (
      pairing.matchResult.matchId === matchResult.matchId &&
      pairing.matchResult.winner === matchResult.winner
    ) {
      return { resolvedCount: 0, newlyExecutablePairings: [] };
    }
    throw new Error(
      `Pairing ${pairingId} is already completed with conflicting result (existing winner: ${pairing.matchResult.winner}, incoming: ${matchResult.winner})`
    );
  }

  // Reject inconsistent out-of-order records where pairing participants are unresolved placeholders
  if (
    isSlotPlaceholder(pairing.participantA) ||
    (pairing.participantB !== null && isSlotPlaceholder(pairing.participantB)) ||
    (pairing.slotA && pairing.slotA.participantId === null) ||
    (pairing.slotB && pairing.participantB !== null && pairing.slotB.participantId === null)
  ) {
    throw new Error(
      `Cannot commit result for pairing ${pairingId}: pairing has unresolved placeholder participants (${pairing.participantA} vs ${pairing.participantB})`
    );
  }

  // 1. Commit the match result onto the pairing
  pairing.status = 'completed';
  pairing.matchResult = matchResult;
  pairing.completedAt = matchResult.completedAt || new Date().toISOString();

  // Determine winner ID
  let winnerBotId: string | null = null;
  if (matchResult.winner === 'A') {
    winnerBotId = pairing.participantA;
  } else if (matchResult.winner === 'B') {
    winnerBotId = pairing.participantB!;
  }

  const isEliminationStage = stage?.stageType === 'preliminary' || stage?.stageType === 'knockout';
  if (isEliminationStage && (!winnerBotId || isSlotPlaceholder(winnerBotId))) {
    throw new Error(`Cannot resolve advancing slot: elimination match ${pairingId} has no decisive winner`);
  }

  let resolvedCount = 0;
  const newlyExecutablePairings: string[] = [];

  // 2. Resolve slots that directly depend on this pairingId
  if (winnerBotId) {
    const allPairings = getAllTournamentPairings(tournament);

    for (const targetPairing of allPairings) {
      let pairingUpdated = false;

      // Check slotA
      if (
        targetPairing.slotA &&
        targetPairing.slotA.participantId === null &&
        targetPairing.slotA.sourceRef?.pairingId === pairingId
      ) {
        targetPairing.slotA.participantId = winnerBotId;
        targetPairing.participantA = winnerBotId;
        resolvedCount++;
        pairingUpdated = true;
      }

      // Check slotB
      if (
        targetPairing.slotB &&
        targetPairing.slotB.participantId === null &&
        targetPairing.slotB.sourceRef?.pairingId === pairingId
      ) {
        targetPairing.slotB.participantId = winnerBotId;
        targetPairing.participantB = winnerBotId;
        resolvedCount++;
        pairingUpdated = true;
      }

      if (pairingUpdated && canPairingExecute(targetPairing)) {
        newlyExecutablePairings.push(targetPairing.pairingId);
      }
    }
  }

  // 3. Stage & Group Progress Evaluation
  if (stage && isMultiStageTournament(tournament)) {
    // A. Preliminary stage completion check
    if (stage.stageType === 'preliminary') {
      if (stage.regions) {
        // 1. Check if the specific region has completed
        if (found.region && found.region.status !== 'completed') {
          const allRegionPairings = found.region.rounds.flatMap(r => r.pairings);
          const isRegionDone = allRegionPairings.every(p => p.status === 'completed' || p.participantB === null);

          if (isRegionDone) {
            found.region.status = 'completed';
            const lastRound = found.region.rounds[found.region.rounds.length - 1]!;
            const qualifiers: string[] = [];
            for (const p of lastRound.pairings) {
              if (p.participantB === null) {
                qualifiers.push(p.participantA);
              } else if (p.matchResult?.winner === 'A') {
                qualifiers.push(p.participantA);
              } else if (p.matchResult?.winner === 'B') {
                qualifiers.push(p.participantB!);
              }
            }
            found.region.advancingParticipantIds = qualifiers;
          }
        }

        // 2. Check if ALL regions in the preliminary stage are completed
        const isAllRegionsComplete = stage.regions.every(r => r.status === 'completed');
        if (isAllRegionsComplete && stage.status !== 'completed') {
          stage.status = 'completed';
          stage.advancement.isComplete = true;
          stage.advancement.advancingParticipantIds = stage.regions.flatMap(r => r.advancingParticipantIds);

          // Transition Group Stage to 'in_progress' and resolve slots
          const groupStage = tournament.stages!.find(s => s.stageType === 'group_stage');
          if (groupStage) {
            groupStage.status = 'in_progress';
            const groupPairings = (groupStage.groups || []).flatMap(g => g.rounds.flatMap(r => r.pairings));

            for (const reg of stage.regions) {
              for (let q = 1; q <= reg.qualifierCount; q++) {
                const qualifierBotId = reg.advancingParticipantIds[q - 1];
                if (!qualifierBotId) continue;

                for (const gp of groupPairings) {
                  if (
                    gp.slotA &&
                    gp.slotA.sourceRef?.stageId === 'stage-preliminary' &&
                    gp.slotA.sourceRef?.regionId === reg.regionId &&
                    gp.slotA.sourceRef?.rank === q
                  ) {
                    gp.slotA.participantId = qualifierBotId;
                    gp.participantA = qualifierBotId;
                    resolvedCount++;
                    if (canPairingExecute(gp) && !newlyExecutablePairings.includes(gp.pairingId)) {
                      newlyExecutablePairings.push(gp.pairingId);
                    }
                  }

                  if (
                    gp.slotB &&
                    gp.slotB.sourceRef?.stageId === 'stage-preliminary' &&
                    gp.slotB.sourceRef?.regionId === reg.regionId &&
                    gp.slotB.sourceRef?.rank === q
                  ) {
                    gp.slotB.participantId = qualifierBotId;
                    gp.participantB = qualifierBotId;
                    resolvedCount++;
                    if (canPairingExecute(gp) && !newlyExecutablePairings.includes(gp.pairingId)) {
                      newlyExecutablePairings.push(gp.pairingId);
                    }
                  }
                }
              }
            }

            for (const g of groupStage.groups || []) {
              g.status = 'in_progress';
              const groupBots = new Set<string>();
              for (const r of g.rounds) {
                for (const p of r.pairings) {
                  if (p.participantA && !isSlotPlaceholder(p.participantA)) groupBots.add(p.participantA);
                  if (p.participantB && !isSlotPlaceholder(p.participantB)) groupBots.add(p.participantB);
                }
              }
              if (groupBots.size > 0) {
                g.participantIds = Array.from(groupBots);
              }
            }
          }
        }
      } else {
        // Single-stream preliminary stage completion check
        const allPrelimPairings = (stage.rounds || []).flatMap(r => r.pairings);
        const isPrelimComplete = allPrelimPairings.every(p => p.status === 'completed' || p.participantB === null);

        if (isPrelimComplete && stage.status !== 'completed') {
          stage.status = 'completed';
          stage.advancement.isComplete = true;

          // Collect all advancing participants from the final preliminary round
          const lastRound = stage.rounds![stage.rounds!.length - 1]!;
          const advancing: string[] = [];
          for (const p of lastRound.pairings) {
            if (p.participantB === null) {
              advancing.push(p.participantA); // Bye advances
            } else if (p.matchResult?.winner === 'A') {
              advancing.push(p.participantA);
            } else if (p.matchResult?.winner === 'B') {
              advancing.push(p.participantB!);
            }
          }
          stage.advancement.advancingParticipantIds = advancing;

          // Transition Group Stage to 'in_progress'
          const groupStage = tournament.stages!.find(s => s.stageType === 'group_stage');
          if (groupStage) {
            groupStage.status = 'in_progress';
            for (const g of groupStage.groups || []) {
              g.status = 'in_progress';
            }
          }
        }
      }
    }

    // B. Group Stage progress evaluation
    if (stage.stageType === 'group_stage' && group) {
      const allGroupPairings = group.rounds.flatMap(r => r.pairings);
      const isGroupMatchesDone = allGroupPairings.every(p => p.status === 'completed' || p.participantB === null);

      // Keep the standings authoritative while the group is still running.
      // The same scoring function and persisted match results are used for
      // both interim and final standings; incomplete pairings simply do not
      // contribute a result yet. This lets the progress API expose live
      // standings without changing qualification or scoring rules.
      const groupMatches: TournamentMatchRecord[] = allGroupPairings
        .map(p => p.matchResult)
        .filter((m): m is TournamentMatchRecord => m !== null);

      const groupParticipants: TournamentParticipant[] = group.participantIds.map(id => {
        const foundParticipant = tournament.participants.find(p => p.participantId === id);
        if (foundParticipant) return foundParticipant;
        return {
          participantId: id,
          name: id,
          bot: { botId: id, player: 'A', command: 'node', args: [] },
          registeredAt: new Date(0).toISOString(),
        };
      });

      group.standings = computeStandings(groupParticipants, groupMatches, tournament.scoringConfig);

      if (isGroupMatchesDone) {
        group.status = 'completed';

        // Check if ALL groups in the group stage are completed
        const isAllGroupsDone = stage.groups!.every(g => g.status === 'completed');
        if (isAllGroupsDone && stage.status !== 'completed') {
          stage.status = 'completed';
          stage.advancement.isComplete = true;
          stage.advancement.advancingParticipantIds = [];

          // Resolve Knockout Round 1 slots for each group
          const knockoutStage = tournament.stages!.find(s => s.stageType === 'knockout');
          if (knockoutStage) {
            knockoutStage.status = 'in_progress';
            const knockoutPairings = (knockoutStage.rounds || []).flatMap(r => r.pairings);

            for (const g of stage.groups!) {
              const top1 = g.standings[0]?.participantId;
              const top2 = g.standings[1]?.participantId;

              if (top1) {
                stage.advancement.advancingParticipantIds.push(top1);
                // Resolve 1st-Group-X
                for (const kp of knockoutPairings) {
                  if (
                    kp.slotA &&
                    kp.slotA.sourceRef?.groupId === g.groupId &&
                    kp.slotA.sourceRef?.rank === 1
                  ) {
                    kp.slotA.participantId = top1;
                    kp.participantA = top1;
                    resolvedCount++;
                    if (canPairingExecute(kp)) newlyExecutablePairings.push(kp.pairingId);
                  }
                  if (
                    kp.slotB &&
                    kp.slotB.sourceRef?.groupId === g.groupId &&
                    kp.slotB.sourceRef?.rank === 1
                  ) {
                    kp.slotB.participantId = top1;
                    kp.participantB = top1;
                    resolvedCount++;
                    if (canPairingExecute(kp)) newlyExecutablePairings.push(kp.pairingId);
                  }
                }
              }

              if (top2) {
                stage.advancement.advancingParticipantIds.push(top2);
                // Resolve 2nd-Group-X
                for (const kp of knockoutPairings) {
                  if (
                    kp.slotA &&
                    kp.slotA.sourceRef?.groupId === g.groupId &&
                    kp.slotA.sourceRef?.rank === 2
                  ) {
                    kp.slotA.participantId = top2;
                    kp.participantA = top2;
                    resolvedCount++;
                    if (canPairingExecute(kp)) newlyExecutablePairings.push(kp.pairingId);
                  }
                  if (
                    kp.slotB &&
                    kp.slotB.sourceRef?.groupId === g.groupId &&
                    kp.slotB.sourceRef?.rank === 2
                  ) {
                    kp.slotB.participantId = top2;
                    kp.participantB = top2;
                    resolvedCount++;
                    if (canPairingExecute(kp)) newlyExecutablePairings.push(kp.pairingId);
                  }
                }
              }
            }
          }
        }
      }
    }

    // C. Knockout stage completion check
    if (stage.stageType === 'knockout') {
      const allKnockoutPairings = (stage.rounds || []).flatMap(r => r.pairings);
      const isKnockoutDone = allKnockoutPairings.every(p => p.status === 'completed' || p.participantB === null);

      if (isKnockoutDone && stage.status !== 'completed') {
        const finalRound = (stage.rounds || [])[stage.rounds!.length - 1];
        const finalPairing = finalRound?.pairings?.[0];
        let championId: string | null = null;
        if (finalPairing?.matchResult?.winner === 'A') {
          championId = finalPairing.participantA;
        } else if (finalPairing?.matchResult?.winner === 'B') {
          championId = finalPairing.participantB;
        }

        if (championId && !isSlotPlaceholder(championId)) {
          stage.status = 'completed';
          stage.advancement.isComplete = true;
          stage.advancement.advancingParticipantIds = [championId];
          tournament.status = 'completed';
          tournament.completedAt = new Date().toISOString();
        }
      }
    }
  }

  return {
    resolvedCount,
    newlyExecutablePairings,
  };
}

/**
 * Validate multi-stage tournament invariants.
 */
export function validateMultiStageTournament(tournament: Tournament): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!isMultiStageTournament(tournament)) {
    // Legacy tournament validation
    if (!Array.isArray(tournament.rounds)) {
      errors.push('Legacy tournament must have rounds array');
    }
    return { valid: errors.length === 0, errors };
  }

  const stages = tournament.stages!;
  if (stages.length === 0) {
    errors.push('Multi-stage tournament must have at least one stage');
  }

  // Verify stages order is 1-indexed and strictly monotonic
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;
    if (stage.order !== i + 1) {
      errors.push(`Stage ${stage.stageId} has order ${stage.order}, expected ${i + 1}`);
    }
    if (stage.regions) {
      for (const reg of stage.regions) {
        if (!reg.regionId) errors.push(`Region in stage ${stage.stageId} missing regionId`);
        if (!reg.participantIds || reg.participantIds.length === 0) {
          errors.push(`Region ${reg.regionId} has empty participants`);
        }
      }
    }
  }

  // Verify slots consistency
  const allPairings = getAllTournamentPairings(tournament);
  for (const pairing of allPairings) {
    if (pairing.slotA) {
      if (pairing.slotA.participantId !== null) {
        if (pairing.participantA !== pairing.slotA.participantId) {
          errors.push(
            `Pairing ${pairing.pairingId} participantA (${pairing.participantA}) != slotA.participantId (${pairing.slotA.participantId})`
          );
        }
      } else {
        if (!isSlotPlaceholder(pairing.participantA)) {
          errors.push(
            `Pairing ${pairing.pairingId} has unresolved slotA but participantA is concrete (${pairing.participantA})`
          );
        }
      }
    }

    if (pairing.slotB) {
      if (pairing.slotB.participantId !== null) {
        if (pairing.participantB !== pairing.slotB.participantId) {
          errors.push(
            `Pairing ${pairing.pairingId} participantB (${pairing.participantB}) != slotB.participantId (${pairing.slotB.participantId})`
          );
        }
      } else {
        if (pairing.participantB !== null && !isSlotPlaceholder(pairing.participantB)) {
          errors.push(
            `Pairing ${pairing.pairingId} has unresolved slotB but participantB is concrete (${pairing.participantB})`
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

