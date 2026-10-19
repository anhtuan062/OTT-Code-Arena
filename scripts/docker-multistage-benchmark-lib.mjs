export const SMOKE_BOT_COUNTS = Object.freeze([4, 8]);
export const OFFICIAL_BOT_COUNTS = Object.freeze([16, 32]);
export const ALLOWED_BOT_COUNTS = Object.freeze([...SMOKE_BOT_COUNTS, ...OFFICIAL_BOT_COUNTS]);

export function parseBotCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || !ALLOWED_BOT_COUNTS.includes(count)) {
    throw new Error(`--bots must be one of: ${ALLOWED_BOT_COUNTS.join(', ')}`);
  }
  return count;
}

export function parseBenchmarkMode(value, botCount) {
  const mode = value?.trim().toLowerCase() || (SMOKE_BOT_COUNTS.includes(botCount) ? 'smoke' : 'official');
  if (mode !== 'smoke' && mode !== 'official') throw new Error('--mode must be smoke or official');
  const allowed = mode === 'smoke' ? SMOKE_BOT_COUNTS : OFFICIAL_BOT_COUNTS;
  if (!allowed.includes(botCount)) throw new Error(`--mode ${mode} does not support --bots ${botCount}`);
  return mode;
}

export function canCleanupAfterTimeout(workloadSettled) {
  return workloadSettled === true;
}

/**
 * A missing protected resource is an explicit absent baseline, never proof
 * that an existing resource was preserved.
 */
export function verifyProtectedResourceBaseline(before, after) {
  if (before === null && after === null) {
    return { baseline: 'absent', status: 'baseline_absent', verified: false };
  }
  if (before === null || after === null) {
    return { baseline: before === null ? 'absent' : 'present', status: 'changed', verified: false };
  }
  if (before !== after) {
    return { baseline: 'present', status: 'changed', verified: false };
  }
  return { baseline: 'present', status: 'verified', verified: true };
}

export function validateNoBotFailures(executedResults) {
  const botFailureReasons = new Set([
    'bot_timeout', 'bot_crash', 'bot_invalid_json', 'bot_invalid_response', 'bot_illegal_move', 'bot_empty_output',
  ]);
  const failures = executedResults
    .map(result => result.matchResult ?? result)
    .filter(result => botFailureReasons.has(result.terminationReason));
  if (failures.length) {
    throw new Error(`Benchmark contains ${failures.length} Bot crash/forfeit match(es): ${failures.map(result => `${result.matchId}:${result.terminationReason}`).join(', ')}`);
  }
  return true;
}

export function percentile(values, percentileValue) {
  if (!values.length) return null;
  if (percentileValue < 0 || percentileValue > 1) throw new Error('percentile must be between 0 and 1');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * percentileValue) - 1] ?? sorted[0];
}

export function summarizeDurations(values) {
  if (!values.length) return null;
  return {
    count: values.length,
    minMs: Math.min(...values),
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: Math.max(...values),
  };
}

export function summarizeMatchMetrics(metrics, matchId) {
  const rows = metrics.filter(metric => metric.matchId === matchId);
  const sum = field => rows.reduce((total, metric) => total + (Number.isFinite(metric[field]) ? metric[field] : 0), 0);
  const compileMs = sum('compilationMs');
  const runtimeMs = sum('runtimeMs');
  const elapsedMs = sum('elapsedMs');
  return {
    matchId,
    executorCalls: rows.length,
    elapsedMs,
    compilationMs: compileMs,
    runtimeMs,
    dockerCliOverheadMs: Math.max(0, elapsedMs - compileMs - runtimeMs),
    cacheHits: rows.filter(metric => metric.cacheHit).length,
    cacheMisses: rows.filter(metric => metric.cacheHit === false).length,
    runtimes: [...new Set(rows.map(metric => metric.runtimeId).filter(Boolean))],
  };
}

export function parseMemoryBytes(value) {
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)\s*(B|KiB|MiB|GiB|kB|MB|GB)?\s*$/i.exec(String(value));
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] ?? 'B').toLowerCase();
  const factor = unit === 'gib' || unit === 'gb' ? 1024 ** 3
    : unit === 'mib' || unit === 'mb' ? 1024 ** 2
      : unit === 'kib' || unit === 'kb' ? 1024 : 1;
  return Math.round(amount * factor);
}

export function summarizeResourceSamples(samples) {
  if (!samples.length) return { sampleCount: 0, maxCpuPercent: null, maxMemoryBytes: null };
  return {
    sampleCount: samples.length,
    maxCpuPercent: Math.max(...samples.map(sample => sample.cpuPercent).filter(Number.isFinite), 0),
    maxMemoryBytes: Math.max(...samples.map(sample => sample.memoryBytes).filter(Number.isFinite), 0),
  };
}

export function classifyDockerSamplingError(error, context = {}) {
  const text = String(error?.stderr ?? error?.message ?? error ?? '');
  if (/no such container|container\s+[^\r\n]+\s+(?:not found|does not exist)/i.test(text)) return 'container-race';
  if (/EOF/i.test(text) && context.containerId && Array.isArray(context.visibleIds) && !context.visibleIds.includes(context.containerId)) return 'container-race';
  if (/EOF|error response from daemon|docker daemon|cannot connect/i.test(text)) return 'docker-error';
  return 'collector-error';
}

export function parseSamplingOptions(mode = 'on', concurrency = 1) {
  if (!['on', 'off'].includes(mode)) throw new Error('--sampling must be on or off');
  const value = Number(concurrency);
  if (!Number.isInteger(value) || value < 1 || value > 4) throw new Error('--sampler-concurrency must be an integer from 1 to 4');
  return { samplingMode: mode, samplerConcurrency: value };
}

export function summarizeProgress(tournament) {
  const stages = (tournament.stages ?? []).map(stage => {
    const pairings = [
      ...(stage.rounds ?? []).flatMap(round => round.pairings ?? []),
      ...(stage.regions ?? []).flatMap(region => (region.rounds ?? []).flatMap(round => round.pairings ?? [])),
      ...(stage.groups ?? []).flatMap(group => (group.rounds ?? []).flatMap(round => round.pairings ?? [])),
    ];
    return {
      stageId: stage.stageId,
      stageType: stage.stageType,
      status: stage.status,
      total: pairings.length,
      completed: pairings.filter(pairing => pairing.status === 'completed' || pairing.status === 'bye').length,
      inProgress: pairings.filter(pairing => pairing.status === 'in_progress').length,
      pending: pairings.filter(pairing => pairing.status === 'scheduled').length,
      pendingTiebreaker: pairings.filter(pairing => pairing.status === 'pending_tiebreaker' || pairing.tiebreakerStatus === 'pending').length,
    };
  });
  return { tournamentId: tournament.tournamentId, status: tournament.status, stages };
}

export function flattenPairings(tournament) {
  const byId = new Map();
  for (const stage of tournament.stages ?? []) {
    for (const round of stage.rounds ?? []) for (const pairing of round.pairings ?? []) byId.set(pairing.pairingId, pairing);
    for (const region of stage.regions ?? []) for (const round of region.rounds ?? []) {
      for (const pairing of round.pairings ?? []) byId.set(pairing.pairingId, pairing);
    }
    for (const group of stage.groups ?? []) for (const round of group.rounds ?? []) {
      for (const pairing of round.pairings ?? []) byId.set(pairing.pairingId, pairing);
    }
  }
  return [...byId.values()];
}

export function validateBenchmarkOutcome(tournament, expectedBotCount) {
  if (tournament.format !== 'multi_stage') throw new Error('Benchmark result is not multi_stage');
  if (tournament.status !== 'completed') throw new Error(`Tournament is not completed: ${tournament.status}`);
  if (tournament.participants?.length !== expectedBotCount) throw new Error('Participant count changed during benchmark');
  const pairings = flattenPairings(tournament);
  if (new Set(pairings.map(pairing => pairing.pairingId)).size !== pairings.length) throw new Error('Duplicate pairing ID detected');
  const unfinished = pairings.filter(pairing => pairing.status !== 'completed' && pairing.status !== 'bye');
  if (unfinished.length) throw new Error(`Unfinished pairings remain: ${unfinished.length}`);
  for (const stage of tournament.stages ?? []) {
    if (stage.status !== 'completed') throw new Error(`Stage is not completed: ${stage.stageId}`);
  }
  const knockout = [...(tournament.stages ?? [])].reverse().find(stage => stage.stageType === 'knockout');
  const champion = knockout?.advancement?.advancingParticipantIds ?? [];
  if (champion.length !== 1) throw new Error('Champion is not uniquely resolved');
  if (!tournament.participants.some(participant => participant.participantId === champion[0])) throw new Error('Champion is not a participant');
  const standings = tournament.standings ?? [];
  if (new Set(standings.map(standing => standing.participantId)).size !== standings.length || standings.length !== expectedBotCount) {
    throw new Error('Standings are inconsistent with participants');
  }
  return { pairingCount: pairings.length, stageCount: tournament.stages?.length ?? 0, champion: champion[0] };
}
