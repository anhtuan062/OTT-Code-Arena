import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Tournament, TournamentBot, SourceRevisionExecution } from '../../tournament/types.js';
import type { TournamentManager } from '../../tournament/manager.js';
import type { UserRepository, User } from '../repositories/user-repository.js';
import type { BotRepository, BotRecord } from '../repositories/bot-repository.js';
import type { SqlBotRevisionRepository } from '../repositories/bot-revision-repository.js';
import type { BotPreflightService } from '../bot-preflight.js';
import { getStrategySdkIdentity } from '../../bot-executor/strategy-sdk.js';

export type BulkBotRuntime = 'cpp' | 'python3' | 'mixed';

export interface BulkBotSeederOptions {
  tournamentId: string;
  count: number;
  runtime: BulkBotRuntime;
  dryRun?: boolean;
  qaConfirmation: string;
  now?: Date;
}

export interface BulkBotSeederDependencies {
  manager: Pick<TournamentManager, 'loadTournament' | 'listParticipationRequests' | 'submitParticipationRequest' | 'reviewParticipationRequest'>;
  userRepository: Pick<UserRepository, 'findByUsername' | 'findById' | 'create'>;
  botRepository: Pick<BotRepository, 'listByOwner' | 'create'>;
  botRevisionRepository: Pick<SqlBotRevisionRepository, 'listForOwner' | 'create'>;
  preflightService: Pick<BotPreflightService, 'start' | 'wait'>;
}

export interface BulkBotSeedResult {
  index: number;
  runtime: 'cpp' | 'python3';
  participantName: string;
  status: 'seeded' | 'skipped' | 'failed' | 'planned';
  reason?: string;
  userId?: string;
  botId?: string;
  revisionId?: string;
  requestId?: string;
}

export interface BulkBotSeedSummary {
  tournamentId: string;
  requested: number;
  seeded: number;
  skipped: number;
  failed: number;
  planned: number;
  results: BulkBotSeedResult[];
}

const MAX_BULK_COUNT = 4096;

export function parseBulkBotRuntime(value: unknown): BulkBotRuntime {
  if (value === 'cpp' || value === 'python3' || value === 'mixed') return value;
  throw new Error('runtime must be cpp, python3, or mixed');
}

export function validateBulkBotCount(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_BULK_COUNT) {
    throw new Error(`count must be an integer between 1 and ${MAX_BULK_COUNT}`);
  }
  return value;
}

export function isExplicitQaTournament(tournament: Tournament): boolean {
  return tournament.tournamentId.startsWith('qa-')
    || tournament.metadata?.qa === true
    || tournament.metadata?.environment === 'qa';
}

export function participantNameFor(index: number): string {
  return `QA-${String(index).padStart(4, '0')}`;
}

function identityPrefix(tournamentId: string): string {
  return tournamentId.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 32).toLowerCase();
}

function runtimeFor(index: number, requested: BulkBotRuntime): 'cpp' | 'python3' {
  if (requested === 'cpp' || requested === 'python3') return requested;
  return index % 2 === 1 ? 'cpp' : 'python3';
}

function sourceFor(runtime: 'cpp' | 'python3'): string {
  return runtime === 'cpp'
    ? 'Move chooseMove(const GameState&, const std::vector<Move>& legalMoves) { return legalMoves.front(); }'
    : 'def choose_move(state, legal_moves):\n    return legal_moves[0]\n';
}

function botNameFor(prefix: string, index: number): string {
  return `qa-seed-${prefix}-${String(index).padStart(4, '0')}`;
}

function revisionLabelFor(tournamentId: string, index: number): string {
  return `bulk-seed:${tournamentId}:${String(index).padStart(4, '0')}`;
}

function existingEntry(tournament: Tournament, participantName: string, competitorId: string): boolean {
  return tournament.participants.some(participant => participant.name.trim().toLocaleLowerCase() === participantName.toLocaleLowerCase()
    || (participant.bot.execution?.kind === 'source-revision' && participant.bot.execution.competitorId === competitorId))
    || (tournament.participationRequests ?? []).some(request =>
      (request.status === 'pending' || request.status === 'approved')
      && (request.participantName.trim().toLocaleLowerCase() === participantName.toLocaleLowerCase() || request.competitorId === competitorId));
}

function ensureCompetitor(user: User | null, username: string): User {
  if (!user) throw new Error(`Unable to create competitor ${username}`);
  if (user.role !== 'competitor') throw new Error(`Existing QA seed account ${username} is not a competitor`);
  return user;
}

export async function seedBulkBots(
  dependencies: BulkBotSeederDependencies,
  options: BulkBotSeederOptions,
): Promise<BulkBotSeedSummary> {
  validateBulkBotCount(options.count);
  parseBulkBotRuntime(options.runtime);
  if (!options.qaConfirmation || options.qaConfirmation !== options.tournamentId) {
    throw new Error('QA confirmation must exactly match --tournament');
  }

  const loaded = await dependencies.manager.loadTournament(options.tournamentId);
  if (!loaded.success || !loaded.data) throw new Error(loaded.error ?? 'Tournament not found');
  const tournament = loaded.data;
  if (!isExplicitQaTournament(tournament)) throw new Error('Tournament is not explicitly marked as QA');
  const ownerId = tournament.metadata?.ownerId;
  if (typeof ownerId !== 'string' || !ownerId) throw new Error('QA tournament has no organizer owner');
  const owner = dependencies.userRepository.findById(ownerId);
  if (!owner || owner.role !== 'organizer') throw new Error('QA tournament owner is not an organizer');
  if (tournament.status === 'cancelled' || tournament.status === 'completed') {
    throw new Error(`Cannot seed a ${tournament.status} tournament`);
  }

  const prefix = identityPrefix(options.tournamentId);
  const summary: BulkBotSeedSummary = {
    tournamentId: options.tournamentId,
    requested: options.count,
    seeded: 0,
    skipped: 0,
    failed: 0,
    planned: 0,
    results: [],
  };

  for (let index = 1; index <= options.count; index += 1) {
    const runtime = runtimeFor(index, options.runtime);
    const participantName = participantNameFor(index);
    const username = `qa-seed-${prefix}-${String(index).padStart(4, '0')}`;
    const botName = botNameFor(prefix, index);
    const label = revisionLabelFor(options.tournamentId, index);
    const result: BulkBotSeedResult = { index, runtime, participantName, status: 'planned' };

    try {
      const existingUser = dependencies.userRepository.findByUsername(username);
      const existingRequest = existingUser
        ? (tournament.participationRequests ?? []).find(request =>
          request.competitorId === existingUser.id
          && request.participantName.trim().toLocaleLowerCase() === participantName.toLocaleLowerCase()
          && (request.status === 'pending' || request.status === 'approved'))
        : undefined;
      if (existingRequest?.status === 'approved') {
        result.status = 'skipped';
        result.reason = 'already approved';
        summary.skipped += 1;
        summary.results.push(result);
        continue;
      }
      if (existingRequest?.status === 'pending' && !options.dryRun) {
        const execution = existingRequest.botSnapshot.execution;
        if (!execution || execution.kind !== 'source-revision') throw new Error('Existing pending request has no source revision execution');
        result.userId = existingUser!.id;
        result.botId = existingRequest.botId;
        result.revisionId = existingRequest.revisionId;
        dependencies.preflightService.start(execution, true);
        const preflight = await dependencies.preflightService.wait(execution);
        if (!preflight || preflight.status !== 'passed') throw new Error(`preflight ${preflight?.status ?? 'unavailable'}${preflight?.errorCode ? `: ${preflight.errorCode}` : ''}`);
        const approved = await dependencies.manager.reviewParticipationRequest(options.tournamentId, existingRequest.requestId, ownerId, 'approve');
        if (!approved.success) throw new Error(approved.error ?? 'Unable to approve existing participation request');
        result.status = 'seeded';
        result.requestId = existingRequest.requestId;
        result.reason = 'resumed existing pending request';
        summary.seeded += 1;
        summary.results.push(result);
        continue;
      }
      if (existingUser && existingEntry(tournament, participantName, existingUser.id)) {
        result.status = 'skipped';
        result.reason = 'already registered or pending';
        summary.skipped += 1;
        summary.results.push(result);
        continue;
      }
      if (options.dryRun) {
        result.reason = existingUser ? 'would reuse existing competitor' : 'would create competitor, Bot and revision';
        summary.planned += 1;
        summary.results.push(result);
        continue;
      }

      const user = ensureCompetitor(existingUser ?? dependencies.userRepository.create({
        username,
        passwordHash: bcrypt.hashSync(randomUUID(), 10),
        role: 'competitor',
      }), username);
      result.userId = user.id;
      if (existingEntry(tournament, participantName, user.id)) {
        result.status = 'skipped';
        result.reason = 'already registered or pending';
        summary.skipped += 1;
        summary.results.push(result);
        continue;
      }

      const bot = dependencies.botRepository.listByOwner(user.id).find(item => item.name === botName)
        ?? dependencies.botRepository.create({ name: botName, command: '', args: [], ownerId: user.id });
      result.botId = bot.id;
      const sdk = await getStrategySdkIdentity(runtime);
      const revision = dependencies.botRevisionRepository.listForOwner(bot.id, user.id).find(item => item.label === label)
        ?? await dependencies.botRevisionRepository.create({
          botId: bot.id,
          ownerId: user.id,
          source: sourceFor(runtime),
          runtimeId: runtime,
          label,
          executionMode: 'strategy',
          sdkVersion: sdk.version,
          sdkDigest: sdk.digest,
        });
      if (revision.runtime_id !== runtime || revision.execution_mode !== 'strategy') {
        throw new Error('Existing seed revision has incompatible runtime or execution mode');
      }
      result.revisionId = revision.revision_id;
      const execution: SourceRevisionExecution = {
        kind: 'source-revision',
        competitorId: user.id,
        botId: bot.id,
        revisionId: revision.revision_id,
        runtimeId: revision.runtime_id,
        sourceDigest: revision.source_digest,
        executionMode: revision.execution_mode,
        sdkVersion: revision.sdk_version ?? undefined,
        sdkDigest: revision.sdk_digest ?? undefined,
      };
      const botSnapshot: TournamentBot = { botId: bot.id, command: '', args: [], execution };
      const submitted = await dependencies.manager.submitParticipationRequest(options.tournamentId, {
        competitorId: user.id,
        botId: bot.id,
        participantName,
        botSnapshot,
        revisionId: revision.revision_id,
        runtimeId: revision.runtime_id,
        sourceDigest: revision.source_digest,
        executionMode: revision.execution_mode,
        sdkVersion: revision.sdk_version ?? undefined,
        sdkDigest: revision.sdk_digest ?? undefined,
      });
      if (!submitted.success || !submitted.data) throw new Error(submitted.error ?? 'Unable to submit participation request');
      result.requestId = submitted.data.requestId;
      dependencies.preflightService.start(execution);
      const preflight = await dependencies.preflightService.wait(execution);
      if (!preflight || preflight.status !== 'passed') {
        throw new Error(`preflight ${preflight?.status ?? 'unavailable'}${preflight?.errorCode ? `: ${preflight.errorCode}` : ''}`);
      }
      const approved = await dependencies.manager.reviewParticipationRequest(options.tournamentId, submitted.data.requestId, ownerId, 'approve');
      if (!approved.success) throw new Error(approved.error ?? 'Unable to approve participation request');
      result.status = 'seeded';
      summary.seeded += 1;
    } catch (error) {
      result.status = 'failed';
      result.reason = error instanceof Error ? error.message : String(error);
      summary.failed += 1;
    }
    summary.results.push(result);
  }
  return summary;
}

export const BULK_BOT_SEED_LIMIT = MAX_BULK_COUNT;
