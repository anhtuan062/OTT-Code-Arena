import type { Tournament, TournamentPairing } from '../tournament/types.js';
import type { LiveMatchSnapshot, MatchReplay, ReplayParticipantIdentity } from '../match-runner/types.js';
import type { TournamentMatchRecord } from '../tournament/types.js';
import { getSeriesSides } from '../tournament/series.js';

const MAX_HISTORY_FRAMES = 120;
const PUBLIC_TERMINATIONS = new Set([
  'all_pieces_captured', 'goal_reached', 'turn_limit', 'repetition',
  'insufficient_material', 'bot_timeout', 'bot_compilation_failed', 'bot_crash', 'bot_invalid_json',
  'bot_invalid_response', 'bot_empty_output', 'bot_illegal_move', 'engine_error', 'unknown',
]);

export type SpectatorGrant = 'authenticated';

export interface SpectatorAuthorization {
  allowed: boolean;
  grant: SpectatorGrant | null;
}

export interface SpectatorLiveOptions {
  tournament: Tournament;
  pairing: TournamentPairing;
  snapshot: LiveMatchSnapshot | null;
  history: LiveMatchSnapshot[];
  replayAvailable: boolean;
}

export function spectatorAuthorization(tournament: Tournament): SpectatorAuthorization {
  return tournament.status === 'running'
    ? { allowed: true, grant: 'authenticated' }
    : { allowed: false, grant: null };
}

function participantName(tournament: Tournament, participantId: string | null | undefined): { participantId: string; name: string } | null {
  if (!participantId) return null;
  const participant = tournament.participants.find(item => item.participantId === participantId);
  return participant ? { participantId: participant.participantId, name: participant.name } : null;
}

function safeTermination(value: unknown): string | null {
  return typeof value === 'string' && PUBLIC_TERMINATIONS.has(value) ? value : null;
}

function safeMove(move: LiveMatchSnapshot['latestMove']) {
  if (!move) return null;
  const player = move.player ?? null;
  return {
    pieceId: move.pieceId,
    player,
    from: move.from,
    to: move.to,
    captures: move.captures ?? null,
    ...(move.conversionTo ? { conversionTo: { ...move.conversionTo } } : {}),
  };
}

function safeFrame(
  tournament: Tournament,
  pairing: TournamentPairing,
  snapshot: LiveMatchSnapshot,
  score: { A: number; B: number },
  currentSides: { playerA: string; playerB: string | null },
) {
  return {
    gameNumber: snapshot.gameNumber ?? 1,
    sequence: snapshot.sequence,
    turn: snapshot.turn,
    observedAt: snapshot.updatedAt,
    currentPlayer: snapshot.currentPlayer,
    board: snapshot.state,
    latestMove: safeMove(snapshot.latestMove),
    status: snapshot.status,
    sideA: participantName(tournament, currentSides.playerA),
    sideB: participantName(tournament, currentSides.playerB),
    score,
    outcome: snapshot.status === 'finished' ? {
      winner: snapshot.state.winner ?? null,
      terminationReason: safeTermination(snapshot.state.winReason),
    } : null,
  };
}

export function projectSpectatorLive(options: SpectatorLiveOptions) {
  const { tournament, pairing, snapshot, replayAvailable } = options;
  const progress = pairing.seriesProgress;
  const bestOf = progress?.bestOf ?? 1;
  const seriesComplete = Boolean(progress && (
    progress.games.length >= progress.bestOf || progress.winsA >= 2 || progress.winsB >= 2
  ));
  const format = progress?.format ?? 'bo1';
  const gameNumber = (snapshot?.gameNumber ?? progress?.nextGame ?? 1) as 1 | 2 | 3;
  const score = progress ? { A: progress.winsA, B: progress.winsB } : {
    A: pairing.matchResult?.winner === 'A' ? 1 : 0,
    B: pairing.matchResult?.winner === 'B' ? 1 : 0,
  };
  const sides = progress && pairing.participantB
    ? getSeriesSides(progress.seed, gameNumber, pairing.participantA, pairing.participantB)
    : { playerA: pairing.participantA, playerB: pairing.participantB };
  const historyForGame = options.history
    .filter(frame => (frame.gameNumber ?? 1) === gameNumber)
    .sort((a, b) => a.sequence - b.sequence)
    .slice(-MAX_HISTORY_FRAMES);
  const history = historyForGame.map(frame => safeFrame(tournament, pairing, frame, score, sides));
  const current = snapshot ? safeFrame(tournament, pairing, snapshot, score, sides) : null;
  const historyTruncated = historyForGame.length > 0 && historyForGame[0]!.sequence > 1;
  const status = snapshot?.status === 'in_progress'
    ? 'in_progress'
    : snapshot?.status === 'finished' && pairing.status === 'in_progress' && !seriesComplete
      ? 'between_games'
      : snapshot?.status === 'finished' || pairing.status === 'completed'
        ? 'completed'
        : snapshot?.status ?? pairing.status;
  return {
    tournamentId: tournament.tournamentId,
    matchId: pairing.matchId,
    pairingId: pairing.pairingId,
    status,
    series: {
      format,
      bestOf,
      currentGameNumber: gameNumber,
      competitorX: participantName(tournament, pairing.participantA),
      competitorY: participantName(tournament, pairing.participantB),
      winner: pairing.matchResult?.winner ?? null,
      scoreByCompetitor: {
        [pairing.participantA]: score.A,
        ...(pairing.participantB ? { [pairing.participantB]: score.B } : {}),
      },
      score,
    },
    game: current,
    snapshot: current ? { gameNumber, sequence: current.sequence, observedAt: current.observedAt } : null,
    history,
    historyTruncated,
    replayAvailable,
    nextPollMs: status === 'between_games' ? 500 : status === 'in_progress' ? 1500 : 3000,
    authorization: 'authenticated',
  };
}

function safeIdentity(identity: ReplayParticipantIdentity | undefined) {
  return identity ? { participantId: identity.participantId, participantName: identity.participantName } : undefined;
}

export function projectSpectatorReplay(replay: MatchReplay): MatchReplay {
  const base = {
    matchId: replay.matchId,
    protocolVersion: replay.protocolVersion,
    ...(replay.ruleModifiers ? { ruleModifiers: replay.ruleModifiers } : {}),
    initialState: replay.initialState,
    moves: replay.moves.map(move => ({ ...move })),
    finalState: replay.finalState,
    winner: replay.winner,
    terminationReason: safeTermination(replay.terminationReason),
    participantIdentities: {
      A: safeIdentity(replay.participantIdentities?.A),
      B: safeIdentity(replay.participantIdentities?.B),
    },
  } as MatchReplay;
  if (!replay.series) return base;
  const seriesFormat: 'bo2' | 'bo3' = replay.series.format ?? (replay.series.bestOf === 2 ? 'bo2' : 'bo3');
  const seriesBestOf: 2 | 3 = replay.series.bestOf ?? (seriesFormat === 'bo2' ? 2 : 3);
  base.series = {
    format: seriesFormat,
    bestOf: seriesBestOf,
    winsA: replay.series.winsA, winsB: replay.series.winsB, winner: replay.series.winner,
    games: replay.series.games.map(game => ({
      gameNumber: game.gameNumber,
      matchId: game.replay.matchId,
      participantA: game.participantA,
      participantB: game.participantB,
      winner: game.winner,
      winnerParticipantId: game.winnerParticipantId,
      replay: projectSpectatorReplay(game.replay),
    })),
  } as unknown as NonNullable<MatchReplay['series']>;
  return base;
}

/** Public match results omit executor provenance and diagnostics by value. */
export function projectPublicMatchResult(result: TournamentMatchRecord): TournamentMatchRecord {
  const { executionProvenance: _provenance, executionDiagnostics: _diagnostics, ...publicResult } = result;
  return publicResult;
}
