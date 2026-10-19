/**
 * Read-only tournament format preflight.
 *
 * This module deliberately does not create tournaments, mutate repositories,
 * schedule matches, or change feature-flag behaviour. It is a small contract
 * for callers that need to explain whether a requested format is safe to
 * prepare before invoking TournamentManager.
 */

import {
  getMaxParticipants,
  MIN_PARTICIPANTS,
  TournamentFormat,
} from './types.js';
import {
  calculateTournamentFormat,
  isPowerOfTwo,
  validateTournamentPlan,
} from './auto-format.js';

export type TournamentPreflightStatus = 'ready' | 'blocked';

export interface TournamentPreflightInput {
  format: TournamentFormat;
  participantCount: number;
  /** Multi-stage remains opt-in; callers must explicitly pass true. */
  multiStageEnabled?: boolean;
}

export interface TournamentPreflightSummary {
  participantCount: number;
  hasRegionalQualifiers: boolean;
  regionCount: number;
  botsEnteringGroupStage: number;
  groupCount: number;
  knockoutBracketSize: number;
  estimatedMatchCount: number;
}

export interface TournamentPreflightResult {
  status: TournamentPreflightStatus;
  reasons: string[];
  warnings: string[];
  summary: TournamentPreflightSummary | null;
}

function blocked(
  reasons: string[],
  warnings: string[] = []
): TournamentPreflightResult {
  return { status: 'blocked', reasons, warnings, summary: null };
}

/**
 * Validate a format request and return a compact, deterministic summary.
 * No tournament or match state is created by this function.
 */
export function preflightTournamentFormat(
  input: TournamentPreflightInput
): TournamentPreflightResult {
  const { format, participantCount, multiStageEnabled = false } = input;
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!Number.isInteger(participantCount)) {
    reasons.push('Participant count must be an integer.');
  } else if (participantCount < MIN_PARTICIPANTS[format]) {
    reasons.push(`Participant count must be at least ${MIN_PARTICIPANTS[format]}.`);
  }

  const maxParticipants = getMaxParticipants(format);
  if (Number.isInteger(participantCount) && participantCount > maxParticipants) {
    reasons.push(
      `${format} supports at most ${maxParticipants} participants.`
    );
  }

  if (format === 'multi_stage' && !multiStageEnabled) {
    reasons.push('Multi-stage tournaments require the explicit feature flag.');
  }

  if (reasons.length > 0) return blocked(reasons);

  try {
    const plan = calculateTournamentFormat(participantCount);
    const validation = validateTournamentPlan(plan);
    if (!validation.valid) return blocked(validation.errors);

    const regionalPlan = plan.regionalPlan;
    const groupStage = plan.groupStage;
    const knockout = plan.knockoutBracket;

    if (format === 'multi_stage' && participantCount > 200 && !regionalPlan) {
      reasons.push('More than 200 participants require regional qualifiers.');
    }
    if (regionalPlan && !isPowerOfTwo(regionalPlan.regionCount)) {
      reasons.push('Regional count must be a power of two.');
    }
    if (!isPowerOfTwo(knockout.bracketSize) && knockout.bracketSize > 1) {
      warnings.push('Knockout bracket is not a power of two and may require a bye.');
    }

    if (reasons.length > 0) return blocked(reasons, warnings);

    return {
      status: 'ready',
      reasons: [],
      warnings,
      summary: {
        participantCount,
        hasRegionalQualifiers: Boolean(regionalPlan),
        regionCount: regionalPlan?.regionCount ?? 0,
        botsEnteringGroupStage: plan.botsEnteringGroupStage,
        groupCount: groupStage?.groupCount ?? 0,
        knockoutBracketSize: knockout.bracketSize,
        estimatedMatchCount: plan.totalDockerMatches,
      },
    };
  } catch (error) {
    return blocked([
      error instanceof Error ? error.message : 'Unable to calculate tournament format.',
    ]);
  }
}
