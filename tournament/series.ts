import { createHash } from 'node:crypto';
import type { Player } from '@match-runner/types.js';
import type { TournamentSeriesGameRecord, TournamentSeriesRecord } from './types.js';

export interface SeriesSides {
  playerA: string;
  playerB: string;
}

export function getSeriesSides(seed: string, gameNumber: 1 | 2 | 3, participantA: string, participantB: string): SeriesSides {
  if (gameNumber === 1) return { playerA: participantA, playerB: participantB };
  if (gameNumber === 2) return { playerA: participantB, playerB: participantA };
  const digest = createHash('sha256').update(`${seed}:game:${gameNumber}`).digest();
  return digest[0]! % 2 === 0
    ? { playerA: participantA, playerB: participantB }
    : { playerA: participantB, playerB: participantA };
}

export function winnerParticipantId(game: Pick<TournamentSeriesGameRecord, 'winner' | 'participantA' | 'participantB'>): string | null {
  if (game.winner === 'draw' || game.winner === null) return null;
  return game.winner === 'A' ? game.participantA : game.participantB;
}

export function seriesWinner(games: TournamentSeriesGameRecord[], participantA: string, participantB: string): TournamentSeriesRecord['winner'] {
  const winsA = games.filter(game => game.winnerParticipantId === participantA).length;
  const winsB = games.filter(game => game.winnerParticipantId === participantB).length;
  return winsA === winsB ? 'draw' : winsA > winsB ? 'A' : 'B';
}

export function seriesScore(games: TournamentSeriesGameRecord[], participantA: string, participantB: string): { winsA: number; winsB: number } {
  return {
    winsA: games.filter(game => game.winnerParticipantId === participantA).length,
    winsB: games.filter(game => game.winnerParticipantId === participantB).length,
  };
}

export function shouldPlayNextGame(games: TournamentSeriesGameRecord[]): boolean {
  if (games.length >= 3) return false;
  // The first two games establish the series result. A third game is only
  // needed when those two games are still tied (including 0-0 or 1-1).
  if (games.length < 2) return true;
  const score = games.reduce((result, game) => {
    if (game.winnerParticipantId === game.participantA) result.a += 1;
    if (game.winnerParticipantId === game.participantB) result.b += 1;
    return result;
  }, { a: 0, b: 0 });
  return score.a === score.b;
}

export function gameWinnerForParticipants(winner: Player | 'draw' | null, playerA: string, playerB: string): string | null {
  if (winner === 'draw' || winner === null) return null;
  return winner === 'A' ? playerA : playerB;
}
