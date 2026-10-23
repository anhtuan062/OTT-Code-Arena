import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { GameState } from '../engine/types.js';
import type { MatchReplay, ReplayParticipantIdentity } from '../match-runner/types.js';
import { FileTournamentRepository } from '../tournament/persistence.js';
import { getAllTournamentPairings } from '../tournament/multi-stage.js';
import type { Tournament, TournamentPairing } from '../tournament/types.js';
import { projectSpectatorReplay } from './spectator.js';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;

export interface PublicReplayExportActor { id: string; role: 'organizer' | 'competitor'; }
export interface PublicReplayExportEntry { matchId: string; replayHash: string; path: string; sha256: string; }
export interface PublicReplayManifest {
  schemaVersion: 1;
  status: 'published' | 'revoked';
  tournamentId: string;
  publishedAt: string | null;
  revokedAt?: string;
  entries: PublicReplayExportEntry[];
}

export class PublicReplayExportError extends Error {
  constructor(readonly code: 'unauthorized' | 'unpublished' | 'invalid' | 'integrity' | 'conflict' | 'failed', message: string) {
    super(message);
    this.name = 'PublicReplayExportError';
  }
}

interface StagedFile { staged: string; target: string; bytes: Buffer; }

/** Publishes only completed, committed, explicitly published and sanitized replays. */
export class PublicReplayExporter {
  private readonly outputDir: string;
  private readonly exportLocks = new Map<string, Promise<void>>();

  constructor(private readonly repository: FileTournamentRepository, outputDir: string) {
    this.outputDir = path.resolve(outputDir);
  }

  async exportTournament(tournamentId: string, actor: PublicReplayExportActor): Promise<PublicReplayManifest> {
    this.assertId(tournamentId, 'tournament');
    this.assertOrganizer(actor);
    return this.withExportLock(tournamentId, async () => {
      const tournament = await this.loadOwnedTournament(tournamentId, actor.id);
      if (tournament.status !== 'completed' || !tournament.resultsPublishedAt) {
        throw new PublicReplayExportError('unpublished', 'Tournament results are not published');
      }
      const records = await this.readIntegrity(() => this.repository.listMatchResults(tournamentId));
      const pairings = tournament.stages ? getAllTournamentPairings(tournament) : tournament.rounds.flatMap(round => round.pairings);
      const pairingById = new Map(pairings.map(pairing => [pairing.pairingId, pairing]));
      const entries: PublicReplayExportEntry[] = [];
      const stagedFiles: StagedFile[] = [];

      for (const record of records) {
        this.assertId(record.matchId, 'match');
        const pairing = pairingById.get(record.pairingId);
        this.assertOfficialPairing(record.matchId, record.pairingId, pairing, record);
        const committed = await this.readIntegrity(() => this.repository.loadCommittedMatchWithHashes(tournamentId, record.matchId));
        if (!committed || !HASH.test(committed.replayHash)) {
          throw new PublicReplayExportError('integrity', `Committed replay hash is invalid for ${record.matchId}`);
        }
        if (committed.result.matchId !== record.matchId || committed.result.pairingId !== record.pairingId || committed.replay.matchId !== record.matchId) {
          throw new PublicReplayExportError('integrity', `Committed replay identity mismatch for ${record.matchId}`);
        }
        const projected = projectSpectatorReplay(committed.replay);
        const publicReplay = this.toAllowlistedReplay(projected, tournament, pairing!);
        const bytes = Buffer.from(JSON.stringify(publicReplay), 'utf8');
        const publicHash = createHash('sha256').update(bytes).digest('hex');
        entries.push({ matchId: record.matchId, replayHash: publicHash, path: `tournaments/${tournamentId}/matches/${record.matchId}-${publicHash}.json`, sha256: publicHash });
        stagedFiles.push({ staged: '', target: path.join(this.outputDir, entries.at(-1)!.path), bytes });
      }

      entries.sort((a, b) => a.matchId.localeCompare(b.matchId));
      return this.publish(tournamentId, {
        schemaVersion: 1, status: 'published', tournamentId, publishedAt: tournament.resultsPublishedAt, entries,
      }, stagedFiles);
    });
  }

  /** Writes a tombstone index; static consumers must honor status=revoked. */
  async revokeTournament(tournamentId: string, actor: PublicReplayExportActor): Promise<PublicReplayManifest> {
    this.assertId(tournamentId, 'tournament');
    this.assertOrganizer(actor);
    return this.withExportLock(tournamentId, async () => {
      await this.loadOwnedTournament(tournamentId, actor.id);
      return this.publish(tournamentId, { schemaVersion: 1, status: 'revoked', tournamentId, publishedAt: null, revokedAt: new Date().toISOString(), entries: [] }, []);
    });
  }

  private async loadOwnedTournament(tournamentId: string, ownerId: string): Promise<Tournament> {
    const tournament = await this.repository.load(tournamentId);
    if (!tournament || tournament.metadata?.ownerId !== ownerId) throw new PublicReplayExportError('unauthorized', 'Organizer does not own this tournament');
    return tournament;
  }

  private assertOfficialPairing(matchId: string, pairingId: string, pairing: TournamentPairing | undefined, record: { matchId: string; pairingId: string; replayRef: string }): void {
    if (!pairing || pairing.status !== 'completed' || pairing.matchId !== matchId || !pairing.matchResult || pairing.matchResult.matchId !== matchId || pairing.matchResult.pairingId !== pairingId || pairing.matchResult.replayRef !== matchId || record.replayRef !== matchId) {
      throw new PublicReplayExportError('integrity', `Replay is not an officially committed tournament pairing: ${matchId}`);
    }
  }

  private toAllowlistedReplay(projected: MatchReplay, tournament: Tournament, pairing: TournamentPairing): MatchReplay {
    const participantById = new Map(tournament.participants.map(participant => [participant.participantId, participant]));
    const identity = (participantId: string | null | undefined): ReplayParticipantIdentity | undefined => {
      if (!participantId) return undefined;
      const participant = participantById.get(participantId);
      if (!participant) throw new PublicReplayExportError('integrity', `Unknown replay participant ${participantId}`);
      return { participantId, participantName: participant.name };
    };
    const state = (value: GameState): GameState => ({ boardSize: value.boardSize, currentPlayer: value.currentPlayer, turn: value.turn, pieces: value.pieces.map(piece => ({ id: piece.id, type: piece.type, player: piece.player, row: piece.row, col: piece.col })), status: value.status, winner: value.winner, winReason: value.winReason, lastMove: value.lastMove ? { pieceId: value.lastMove.pieceId, from: { ...value.lastMove.from }, to: { ...value.lastMove.to }, captures: value.lastMove.captures, player: value.lastMove.player, turn: value.lastMove.turn } : null });
    const base = (replay: MatchReplay, participantA: string | null, participantB: string | null): MatchReplay => ({
      matchId: replay.matchId, protocolVersion: replay.protocolVersion, initialState: state(replay.initialState),
      moves: replay.moves.map(move => ({ turn: move.turn, player: move.player, pieceId: move.pieceId, from: { ...move.from }, to: { ...move.to }, captures: move.captures, timestamp: move.timestamp })),
      finalState: state(replay.finalState), winner: replay.winner, terminationReason: replay.terminationReason,
      ...(replay.ruleModifiers ? { ruleModifiers: { ...replay.ruleModifiers } } : {}),
      participantIdentities: { A: identity(participantA), B: identity(participantB) },
    });
    const result = base(projected, pairing.participantA, pairing.participantB);
    if (!projected.series || !pairing.matchResult?.series) return result;
    result.series = { format: projected.series.format, bestOf: projected.series.bestOf, seed: pairing.matchResult.series.seed, winsA: projected.series.winsA, winsB: projected.series.winsB, winner: projected.series.winner, games: projected.series.games.map(game => ({ gameNumber: game.gameNumber, matchId: game.replay.matchId, participantA: game.participantA, participantB: game.participantB, winner: game.winner, winnerParticipantId: game.winnerParticipantId, replay: base(game.replay, game.participantA, game.participantB) })) };
    return result;
  }

  private async publish(tournamentId: string, manifest: PublicReplayManifest, files: StagedFile[]): Promise<PublicReplayManifest> {
    const stageDir = path.join(this.outputDir, '.staging', `${tournamentId}-${randomUUID()}`);
    try {
      await this.ensureSafeDirectory(this.outputDir);
      await this.ensureSafeParent(stageDir);
      await fs.mkdir(stageDir, { recursive: true });
      for (let i = 0; i < files.length; i++) { files[i]!.staged = path.join(stageDir, `${i}.json`); await fs.writeFile(files[i]!.staged, files[i]!.bytes, { flag: 'wx' }); }
      await this.publishImmutableFiles(files);
      const manifestTarget = path.join(this.outputDir, 'tournaments', tournamentId, 'index.json');
      await this.publishManifestAtomically(manifestTarget, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
      return manifest;
    } catch (error) {
      if (error instanceof PublicReplayExportError) throw error;
      throw new PublicReplayExportError('failed', 'Public replay export failed');
    } finally { await fs.rm(stageDir, { recursive: true, force: true }).catch(() => undefined); }
  }

  private async publishImmutableFiles(files: StagedFile[]): Promise<void> {
    for (const file of files) {
      await this.ensureSafeParent(file.target);
      await this.assertNotSymlinkIfPresent(file.target);
      try {
        const existing = await fs.readFile(file.target);
        if (!existing.equals(file.bytes)) throw new PublicReplayExportError('conflict', `Immutable export conflict at ${path.basename(file.target)}`);
        await fs.rm(file.staged, { force: true });
      } catch (error) {
        if (error instanceof PublicReplayExportError) throw error;
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await fs.rename(file.staged, file.target);
      }
    }
  }

  private async publishManifestAtomically(target: string, bytes: Buffer): Promise<void> {
    await this.ensureSafeParent(target);
    await this.assertNotSymlinkIfPresent(target);
    const temp = `${target}.${randomUUID()}.tmp`;
    const backup = `${target}.${randomUUID()}.bak`;
    await fs.writeFile(temp, bytes, { flag: 'wx' });
    try {
      try { await fs.rename(temp, target); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EPERM' && code !== 'EEXIST') throw error;
        try { await fs.rename(target, backup); } catch (renameError) { if ((renameError as NodeJS.ErrnoException).code !== 'ENOENT') throw renameError; }
        try { await fs.rename(temp, target); } catch (replaceError) { await fs.rename(backup, target).catch(() => undefined); throw replaceError; }
        await fs.rm(backup, { force: true });
      }
    } finally { await fs.rm(temp, { force: true }).catch(() => undefined); await fs.rm(backup, { force: true }).catch(() => undefined); }
  }

  private async withExportLock<T>(tournamentId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.exportLocks.get(tournamentId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    this.exportLocks.set(tournamentId, current);
    await previous;
    try { return await operation(); } finally { release(); if (this.exportLocks.get(tournamentId) === current) this.exportLocks.delete(tournamentId); }
  }

  private async ensureSafeDirectory(directory: string): Promise<void> { await fs.mkdir(directory, { recursive: true }); await this.assertNotSymlink(directory); }

  private async ensureSafeParent(target: string): Promise<void> {
    const relative = path.relative(this.outputDir, path.dirname(path.resolve(target)));
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new PublicReplayExportError('invalid', 'Export path escapes output directory');
    let current = this.outputDir;
    await this.ensureSafeDirectory(current);
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      try { await this.assertNotSymlink(current); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await fs.mkdir(current); await this.assertNotSymlink(current); }
    }
  }

  private async assertNotSymlink(file: string): Promise<void> { const stat = await fs.lstat(file); if (stat.isSymbolicLink()) throw new PublicReplayExportError('integrity', `Symlink export path rejected: ${path.basename(file)}`); }
  private async assertNotSymlinkIfPresent(file: string): Promise<void> {
    try { await this.assertNotSymlink(file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }

  private async readIntegrity<T>(read: () => Promise<T>): Promise<T> {
    try { return await read(); }
    catch (error) {
      if (error instanceof PublicReplayExportError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (/Incomplete persisted match|Uncommitted persisted match|Inconsistent persisted match|Unexpected token|JSON/i.test(message)) throw new PublicReplayExportError('integrity', 'Committed replay integrity validation failed');
      throw error;
    }
  }

  private assertOrganizer(actor: PublicReplayExportActor): void { if (!actor || actor.role !== 'organizer' || !SAFE_ID.test(actor.id)) throw new PublicReplayExportError('unauthorized', 'Organizer authorization is required'); }
  private assertId(value: string, label: string): void { if (!SAFE_ID.test(value)) throw new PublicReplayExportError('invalid', `Invalid ${label} identifier`); }
}
