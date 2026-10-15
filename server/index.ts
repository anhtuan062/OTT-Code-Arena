import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTournamentManager } from '../tournament/manager.js';
import { createExecutor, clearExecutorCache, configuredRuntimeImageRegistry, createRevisionDockerExecutor, resolveCppCompilationBackend } from '../bot-executor/index.js';
import { configuredDockerImage } from '../bot-executor/image-config.js';
import { createExecutionQueue } from '../bot-executor/execution-queue.js';
import * as fs from 'fs/promises';
import { existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { closeSharedDatabase, initializeDatabase, setSharedDatabase } from './db.js';
import { SqlBotRepository, type BotRecord } from './repositories/bot-repository.js';
import { SqlBotRevisionRepository, SUPPORTED_SOURCE_RUNTIMES, MAX_SOURCE_BYTES, isSupportedSourceRuntime } from './repositories/bot-revision-repository.js';
import { isUserRole, SqlUserRepository, type UserRole } from './repositories/user-repository.js';
import { SqlSessionRepository } from './repositories/session-repository.js';
import { SqlRateLimitRepository } from './repositories/rate-limit-repository.js';
import { projectSpectatorLive, projectSpectatorReplay } from './spectator.js';
import type { ExecutionPolicy } from '../bot-executor/types.js';
import type { SourceRevisionExecutor } from '../bot-executor/types.js';
import { ExecutionCancelledError } from '../bot-executor/types.js';
import { getStrategySdkIdentity } from '../bot-executor/strategy-sdk.js';
import type { Tournament, TournamentBot, ParticipationRequest, SourceRevisionExecution } from '../tournament/types.js';
import type { Server } from 'node:http';
import { BotProtocol } from '../bot-protocol/index.js';
import { chooseSystemOpponentMove, createEngine, posToAlgebraic } from '../engine/index.js';
import { createPracticeScenario, serializePracticeLegalMoves } from '../practice/scenarios.js';
import { getSeriesSides } from '../tournament/series.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRootCandidates = [
  path.resolve(__dirname, '..'),
  path.resolve(__dirname, '..', '..'),
];
const projectRoot = projectRootCandidates.find(root => existsSync(path.join(root, 'index.html')))
  ?? projectRootCandidates[0]!;

const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGIN || false,
  credentials: true,
}));

// 1. Strict payload limits and JSON parsing error handling
app.use(express.json({ limit: '100kb' }));
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload' });
  }
  next(err);
});

// 2. Serve static files explicitly to prevent repository exposure
app.get('/', (req, res) => res.sendFile(path.join(projectRoot, 'index.html')));
app.get('/app.js', (req, res) => res.sendFile(path.join(projectRoot, 'app.js')));
app.get('/style.css', (req, res) => res.sendFile(path.join(projectRoot, 'style.css')));
app.get('/styles/views/replay.css', (req, res) => res.sendFile(path.join(projectRoot, 'styles/views/replay.css')));
app.get('/styles/views/live.css', (req, res) => res.sendFile(path.join(projectRoot, 'styles/views/live.css')));
app.get('/styles/components/editor.css', (req, res) => res.sendFile(path.join(projectRoot, 'styles/components/editor.css')));
app.get('/styles/layout.css', (req, res) => res.sendFile(path.join(projectRoot, 'styles/layout.css')));
app.get('/styles/views/auth.css', (req, res) => res.sendFile(path.join(projectRoot, 'styles/views/auth.css')));
// Serve static icons if they were separate, but they are embedded in index.html

// Initialize singleton Tournament Manager
let manager!: Awaited<ReturnType<typeof createTournamentManager>>;
let executionQueue = createExecutionQueue({ maxConcurrent: 2, maxQueueLength: 50 });
let botRepository: SqlBotRepository;
let botRevisionRepository: SqlBotRevisionRepository;
let userRepository: SqlUserRepository;
let sessionRepository: SqlSessionRepository;
let rateLimitRepository: SqlRateLimitRepository;
let sourceRevisionExecutor: SourceRevisionExecutor | undefined;
const activePracticeExecutions = new Set<string>();
const practiceAttempts = new Map<string, number[]>();
const SESSION_COOKIE = 'ott_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const production = process.env.NODE_ENV?.trim().toLowerCase() === 'production';

export function resolveExecutionPolicy(env: NodeJS.ProcessEnv = process.env): ExecutionPolicy {
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
  const configuredPolicy = env.EXECUTION_POLICY?.trim().toLowerCase();

  if (nodeEnv && !['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error(`Invalid NODE_ENV "${env.NODE_ENV}"`);
  }
  if (configuredPolicy && !['development', 'sandbox-required'].includes(configuredPolicy)) {
    throw new Error(`Invalid EXECUTION_POLICY "${env.EXECUTION_POLICY}"`);
  }
  if (!nodeEnv && !configuredPolicy) {
    throw new Error('NODE_ENV or EXECUTION_POLICY must be explicitly configured');
  }
  if (nodeEnv === 'production' && configuredPolicy !== 'sandbox-required') {
    throw new Error('Production requires EXECUTION_POLICY=sandbox-required');
  }

  return configuredPolicy === 'sandbox-required' || nodeEnv === 'production'
    ? 'sandbox-required'
    : 'development';
}

export async function initServer(storageDir?: string) {
  const executionPolicy = resolveExecutionPolicy();
  // Fail configuration before opening persistence or accepting a listener.
  if (executionPolicy === 'sandbox-required') configuredDockerImage(undefined, executionPolicy);
  const dir = storageDir || process.env.TOURNAMENT_DATA_DIR || path.join(projectRoot, 'data/tournaments');
  await fs.mkdir(dir, { recursive: true });
  executionQueue = createExecutionQueue({ maxConcurrent: 2, maxQueueLength: 50 });
  activeTournamentRuns.clear();
  tournamentRunOwners.clear();
  sourceRevisionExecutor = undefined;
  const sourceExecutionRequested = process.env.ENABLE_SOURCE_REVISION_EXECUTION?.trim().toLowerCase() === 'true';
  if (sourceExecutionRequested) {
    if (executionPolicy !== 'sandbox-required') {
      throw new Error('Source-revision execution requires EXECUTION_POLICY=sandbox-required');
    }
    const runtimeImages = configuredRuntimeImageRegistry(executionPolicy);
    const cppCompilationBackend = resolveCppCompilationBackend(process.env.BOT_CPP_COMPILATION_BACKEND);
    const candidate = createRevisionDockerExecutor({
      imageRegistry: runtimeImages,
      executionPolicy,
      workingDirBase: process.env.BOT_EXECUTION_WORKDIR ?? path.join(dir, '.source-execution'),
      defaultTimeoutMs: 2000,
      // Strategy C++ revisions are compiled with a static toolchain inside
      // Docker. Cold image/filesystem startup can exceed 30s even when the
      // bot itself is fast. Keep the per-turn runtime budget at 2s, but give
      // the one-time match-scoped compilation enough time to finish.
      defaultCompileTimeoutMs: Math.max(30_000, Number(process.env.BOT_CPP_COMPILE_TIMEOUT_MS ?? 120_000)),
      defaultPreparationTimeoutMs: 10000,
      cppCompilationBackend,
    });
    if (!(await candidate.isAvailable())) {
      throw new Error('Source-revision execution requested but configured Docker runtime images are unavailable');
    }
    sourceRevisionExecutor = candidate;
  }
  manager?.close();
  closeSharedDatabase();
  try {
    // Acquire tournament storage ownership before opening any writable
    // database in the shared data directory.
    const resolveSourceRevision = async (execution: SourceRevisionExecution): Promise<Buffer | null> => {
      const revision = botRevisionRepository?.findOwned(execution.botId, execution.revisionId, execution.competitorId);
      if (!revision || revision.runtime_id !== execution.runtimeId || revision.source_digest !== execution.sourceDigest) return null;
      if ((execution.executionMode ?? 'raw') !== revision.execution_mode) return null;
      if (revision.execution_mode === 'strategy' && (execution.sdkVersion !== revision.sdk_version || execution.sdkDigest !== revision.sdk_digest)) return null;
      try {
        const source = await botRevisionRepository!.readSource(revision);
        return Buffer.from(source, 'utf8');
      } catch { return null; }
    };
    manager = await createTournamentManager(
      dir,
      undefined,
      executionPolicy,
      undefined,
      async (execution: SourceRevisionExecution) => (await resolveSourceRevision(execution)) !== null,
      resolveSourceRevision,
      sourceRevisionExecutor,
    );
    const db = await initializeDatabase({ path: path.join(dir, 'arena.sqlite') });
    setSharedDatabase(db);
    botRepository = new SqlBotRepository(db);
    botRevisionRepository = new SqlBotRevisionRepository(db, dir);
    userRepository = new SqlUserRepository(db);
    sessionRepository = new SqlSessionRepository(db, SESSION_TTL_MS);
    rateLimitRepository = new SqlRateLimitRepository(db);
    sessionRepository.deleteExpired();
    const recoveredTournaments = process.env.NODE_ENV !== 'test'
      ? await manager.recoverInterruptedTournaments()
      : 0;
    if (recoveredTournaments > 0) console.log(`Recovered ${recoveredTournaments} interrupted tournament(s)`);
    console.log(`Tournament Manager initialized with ${executionPolicy} policy`);
  } catch (error) {
    manager?.close();
    closeSharedDatabase();
    executionQueue.cancelAll();
    throw error;
  }
}

export function closeServer(): void {
  executionQueue.cancelAll();
  activeTournamentRuns.clear();
  tournamentRunOwners.clear();
  manager?.close();
  closeSharedDatabase();
}

// ---------------------------------------------------------
// BOTS API
// ---------------------------------------------------------
function parseCookies(req: express.Request): Record<string, string> {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(v => v.trim().split(/=(.*)/s)).filter(v => v[0]).map(([key, value]) => [key!, decodeURIComponent(value || '')]));
}
declare global { namespace Express { interface Request { auth?: { id: string; username: string; role: UserRole; token: string; csrf: string }; } } }
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = parseCookies(req)[SESSION_COOKIE];
  const session = token && sessionRepository.findByToken(token);
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) return res.status(401).json({ error: 'Authentication required' });
  let user;
  try {
    user = userRepository.findById(session.user_id);
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  if (!isUserRole(user.role)) return res.status(401).json({ error: 'Authentication required' });
  req.auth = { id: user.id, username: user.username, role: user.role, token, csrf: session.csrf_token };
  sessionRepository.touch(session.id);
  next();
}
export function requireRole(...roles: UserRole[]): express.RequestHandler {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
    if (!isUserRole(req.auth.role) || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
function requireCsrf(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.get('x-csrf-token') !== req.auth?.csrf) return res.status(403).json({ error: 'Invalid CSRF token' });
  next();
}
function apiBot(bot: BotRecord) {
  const revisionId = bot.current_revision_id;
  const revision = revisionId && bot.owner_id
    ? botRevisionRepository.findOwned(bot.id, revisionId, bot.owner_id)
    : null;
  return {
    id: bot.id, name: bot.name, command: bot.command, args: bot.args,
    registeredAt: bot.registered_at, currentRevisionId: bot.current_revision_id,
    selectedRevision: revision ? {
      revisionId: revision.revision_id, runtimeId: revision.runtime_id,
      executionMode: revision.execution_mode, label: revision.label,
    } : null,
  };
}
function routeParam(req: express.Request, name: string): string { const value = req.params[name]; return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }

function allowPracticeAttempt(userId: string): boolean {
  const now = Date.now();
  const recent = (practiceAttempts.get(userId) ?? []).filter(timestamp => now - timestamp < 15 * 60 * 1000);
  if (recent.length >= 20) {
    practiceAttempts.set(userId, recent);
    return false;
  }
  recent.push(now);
  practiceAttempts.set(userId, recent);
  return true;
}

function localizePracticeError(code: string, compilerDiagnostic: string, runtimeDiagnostic: string, exitCode: number | null): string {
  if (['EXECUTOR_ERROR', 'EXECUTOR_UNAVAILABLE', 'SANDBOX_REQUIRED'].includes(code)) return 'Không thể kết nối môi trường Docker sandbox.';
  if (code === 'COMPILATION_TIMEOUT') return 'Biên dịch C++ quá thời gian cho phép.';
  if (code === 'RUNTIME_TIMEOUT') return 'Bot thực thi quá thời gian cho phép.';
  if (code === 'TIMEOUT') return 'Bot chạy quá thời gian cho phép.';
  if (code === 'RESOURCE_LIMIT_EXCEEDED') return 'Bot vượt quá giới hạn tài nguyên.';
  if (code === 'INVALID_JSON' || code === 'INVALID_RESPONSE') return 'Bot trả về dữ liệu không đúng giao thức.';
  if (code === 'EMPTY_OUTPUT' || code === 'MISSING_MOVE') return 'Bot không trả về nước đi.';
  if (code === 'PROCESS_CRASHED') {
    if (compilerDiagnostic) return `C++ không biên dịch được: ${compilerDiagnostic}`;
    if (runtimeDiagnostic) return `Bot chạy lỗi trong Docker: ${runtimeDiagnostic}`;
    return `Bot đã kết thúc trong Docker với mã ${exitCode ?? 'không xác định'}.`;
  }
  return 'Bot không trả về nước đi hợp lệ trong lần chạy thử.';
}
const ALLOWED_COMMANDS = new Set(['node', 'python', 'python3']);

function validateBotInput(body: unknown): { name: string; command: string; args: string[] } | null {
  if (!body || typeof body !== 'object') return null;
  const input = body as { name?: unknown; command?: unknown; args?: unknown };
  if (typeof input.name !== 'string' || typeof input.command !== 'string' || !Array.isArray(input.args)) return null;
  const name = input.name.trim();
  const args = input.args;
  if (!name || name.length > 50 || !ALLOWED_COMMANDS.has(input.command) ||
      args.length > 32 || !args.every((arg): arg is string => typeof arg === 'string' && arg.length <= 256)) {
    return null;
  }
  for (const arg of args) {
    if (arg.startsWith('-') && arg !== '--fast') return null;
    if (arg.includes('..') || path.isAbsolute(arg)) return null;
  }
  return { name, command: input.command, args };
}

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body || {};
  const key = `register:${req.ip}`;
  if (!rateLimitRepository.check(key, 10, 900000).allowed) return res.status(429).json({ error: 'Too many attempts' });
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,32}$/.test(username) || typeof password !== 'string' || password.length < 12 || password.length > 128) { rateLimitRepository.recordAttempt(key, 10, 900000); return res.status(400).json({ error: 'Invalid registration details' }); }
  try {
    const user = userRepository.create({ username, passwordHash: await bcrypt.hash(password, 12) });
    const token = randomBytes(32).toString('base64url'); const csrfToken = randomBytes(32).toString('base64url');
    sessionRepository.create({ userId: user.id, token, csrfToken, userAgent: req.get('user-agent'), ip: req.ip });
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: production, maxAge: SESSION_TTL_MS, path: '/' });
    res.status(201).json({ user: { id: user.id, username: user.username, role: user.role }, csrfToken });
  } catch (error: any) { if (error?.code?.startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'Username unavailable' }); res.status(500).json({ error: 'Unable to register' }); }
});
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const normalizedUsername = typeof username === 'string' ? username.toLowerCase() : '';
  const key = `login:${req.ip}:${normalizedUsername.slice(0, 64)}`;
  if (!rateLimitRepository.check(key, 5, 900000).allowed) return res.status(429).json({ error: 'Too many attempts' });
  const user = typeof username === 'string' ? userRepository.findByUsername(username) : null;
  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.password_hash))) { rateLimitRepository.recordAttempt(key, 5, 900000); return res.status(401).json({ error: 'Tài khoản hoặc mật khẩu không đúng' }); }
  const token = randomBytes(32).toString('base64url'); const csrfToken = randomBytes(32).toString('base64url'); userRepository.setLastLogin(user.id);
  sessionRepository.create({ userId: user.id, token, csrfToken, userAgent: req.get('user-agent'), ip: req.ip });
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: production, maxAge: SESSION_TTL_MS, path: '/' }); res.json({ user: { id: user.id, username: user.username, role: user.role }, csrfToken });
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: { id: req.auth!.id, username: req.auth!.username, role: req.auth!.role }, csrfToken: req.auth!.csrf }));
app.post('/api/auth/logout', requireAuth, requireCsrf, (req, res) => { sessionRepository.deleteByToken(req.auth!.token); res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: production, path: '/' }); res.status(204).end(); });

app.get('/api/bots', requireAuth, requireRole('competitor'), (req, res) => {
  res.json(botRepository.listByOwner(req.auth!.id).map(apiBot));
});

app.post('/api/bots', requireAuth, requireRole('competitor'), requireCsrf, (req, res) => {
  const input = validateBotInput(req.body);
  if (!input) {
    const body = req.body as { command?: unknown; args?: unknown } | undefined;
    if (typeof body?.command === 'string' && !ALLOWED_COMMANDS.has(body.command)) {
      return res.status(400).json({ error: 'Only node/python commands are allowed' });
    }
    if (Array.isArray(body?.args) && body.args.some((arg): boolean => typeof arg === 'string' && arg.startsWith('-'))) {
      return res.status(400).json({ error: 'Command flags are not allowed for security reasons' });
    }
    if (Array.isArray(body?.args) && body.args.some((arg): boolean => typeof arg === 'string' && (arg.includes('..') || path.isAbsolute(arg)))) {
      return res.status(400).json({ error: 'Path traversal or absolute paths are not allowed' });
    }
    return res.status(400).json({ error: 'Invalid bot configuration' });
  }

  if (!ALLOWED_COMMANDS.has(input.command)) {
    return res.status(400).json({ error: 'Only node/python commands are allowed' });
  }

  try {
    const bot = botRepository.create({ name: input.name, command: input.command, args: input.args, ownerId: req.auth!.id });
    res.status(201).json(apiBot(bot));
  } catch { res.status(500).json({ error: 'Unable to register bot' }); }
});
app.get('/api/bots/:id', requireAuth, requireRole('competitor'), (req, res) => {
  const bot = botRepository.findById(routeParam(req, 'id'));
  if (!bot || bot.owner_id !== req.auth!.id) return res.status(404).json({ error: 'Bot not found' });
  res.json(apiBot(bot));
});
app.put('/api/bots/:id', requireAuth, requireRole('competitor'), requireCsrf, (req, res) => {
  const input = validateBotInput(req.body);
  if (!input) return res.status(400).json({ error: 'Invalid bot configuration' });
  const bot = botRepository.update(routeParam(req, 'id'), req.auth!.id, input);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  res.json(apiBot(bot));
});
app.delete('/api/bots/:id', requireAuth, requireRole('competitor'), requireCsrf, async (req, res) => {
  const botId = routeParam(req, 'id');
  const existingBot = botRepository.findById(botId);
  if (!existingBot || existingBot.owner_id !== req.auth!.id) return res.status(404).json({ error: 'Bot not found' });
  const tournaments = await manager.listTournaments();
  const referenced = tournaments.some(tournament =>
    tournament.participants.some(participant => participant.bot.botId === botId)
    || (tournament.participationRequests ?? []).some(request => request.botId === botId && ['pending', 'approved'].includes(request.status))
  );
  if (referenced) return res.status(409).json({ error: 'Bot cannot be deleted while its revision is referenced by a tournament' });
  if (!botRepository.delete(botId, req.auth!.id)) return res.status(404).json({ error: 'Bot not found' });
  res.status(204).end();
});

// Source revisions are persisted separately from legacy command-based Bot records.
// This phase stores and validates source only; no route executes it.
function apiRevision(revision: ReturnType<SqlBotRevisionRepository['listForOwner']>[number]) {
  return {
    revisionId: revision.revision_id,
    botId: revision.bot_id,
    runtimeId: revision.runtime_id,
    sourceDigest: revision.source_digest,
    createdAt: revision.created_at,
    sourceSize: revision.source_size,
    label: revision.label,
    selected: revision.selected,
    executionMode: revision.execution_mode,
    sdkVersion: revision.sdk_version,
    sdkDigest: revision.sdk_digest,
  };
}

app.post('/api/bots/:id/revisions', requireAuth, requireRole('competitor'), requireCsrf, async (req, res) => {
  const body = req.body as { source?: unknown; runtimeId?: unknown; label?: unknown; executionMode?: unknown } | undefined;
  if (typeof body?.source !== 'string' || body.source.length === 0) return res.status(400).json({ error: 'Source is required' });
  if (body.source.length > MAX_SOURCE_BYTES * 2) return res.status(413).json({ error: 'Source exceeds the maximum size' });
  if (!isSupportedSourceRuntime(body.runtimeId)) return res.status(400).json({ error: `Unsupported source runtime. Use ${SUPPORTED_SOURCE_RUNTIMES.join(' or ')}` });
  if (body.executionMode !== undefined && body.executionMode !== 'raw' && body.executionMode !== 'strategy') return res.status(400).json({ error: 'Unsupported execution mode' });
  if (body.label !== undefined && typeof body.label !== 'string') return res.status(400).json({ error: 'Invalid revision label' });
  try {
    const executionMode = (body.executionMode as 'raw' | 'strategy' | undefined) ?? 'raw';
    const sdk = executionMode === 'strategy' ? await getStrategySdkIdentity(body.runtimeId) : undefined;
    const revision = await botRevisionRepository.create({ botId: routeParam(req, 'id'), ownerId: req.auth!.id, source: body.source, runtimeId: body.runtimeId, label: body.label as string | undefined, executionMode, sdkVersion: sdk?.version, sdkDigest: sdk?.digest });
    res.status(201).json(apiRevision(revision));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save source revision';
    if (message === 'Bot not found') return res.status(404).json({ error: message });
    if (message.includes('maximum size')) return res.status(413).json({ error: message });
    if (message.includes('Unsupported') || message.includes('required') || message.includes('label') || message.includes('UTF-8') || message.includes('strategy SDK')) return res.status(400).json({ error: message });
    res.status(500).json({ error: 'Unable to save source revision' });
  }
});

app.get('/api/bots/:id/revisions', requireAuth, requireRole('competitor'), (req, res) => {
  const bot = botRepository.findById(routeParam(req, 'id'));
  if (!bot || bot.owner_id !== req.auth!.id) return res.status(404).json({ error: 'Bot not found' });
  res.json(botRevisionRepository.listForOwner(bot.id, req.auth!.id).map(apiRevision));
});

app.get('/api/bots/:id/revisions/:revisionId', requireAuth, requireRole('competitor'), async (req, res) => {
  const revision = botRevisionRepository.findOwned(routeParam(req, 'id'), routeParam(req, 'revisionId'), req.auth!.id);
  if (!revision) return res.status(404).json({ error: 'Source revision not found' });
  try {
    res.json({ ...apiRevision(revision), source: await botRevisionRepository.readSource(revision) });
  } catch {
    res.status(500).json({ error: 'Source revision integrity check failed' });
  }
});

app.post('/api/bots/:id/revisions/:revisionId/select', requireAuth, requireRole('competitor'), requireCsrf, (req, res) => {
  const revision = botRevisionRepository.select(routeParam(req, 'id'), routeParam(req, 'revisionId'), req.auth!.id);
  if (!revision) return res.status(404).json({ error: 'Source revision not found' });
  res.json(apiRevision(revision));
});

app.delete('/api/bots/:id/revisions/:revisionId', requireAuth, requireRole('competitor'), requireCsrf, async (req, res) => {
  const botId = routeParam(req, 'id');
  const revisionId = routeParam(req, 'revisionId');
  const bot = botRepository.findById(botId);
  if (!bot || bot.owner_id !== req.auth!.id) return res.status(404).json({ error: 'Bot not found' });
  const tournaments = await manager.listTournaments();
  if (tournaments.some(tournament => JSON.stringify(tournament).includes(revisionId))) {
    return res.status(409).json({ error: 'Cannot delete a revision referenced by a tournament' });
  }
  if (bot.current_revision_id === revisionId) {
    const fallback = botRevisionRepository.listForOwner(botId, req.auth!.id).find(revision => revision.revision_id !== revisionId);
    if (!fallback) return res.status(409).json({ error: 'Cannot delete the only revision' });
    if (!botRevisionRepository.select(botId, fallback.revision_id, req.auth!.id)) return res.status(409).json({ error: 'Unable to select a replacement revision' });
  }
  if (!await botRevisionRepository.delete(botId, revisionId, req.auth!.id)) return res.status(404).json({ error: 'Source revision not found' });
  res.status(204).end();
});

// Execute one deterministic opening position through the configured source
// sandbox. This does not create a match or mutate tournament state.
app.post('/api/bots/:id/revisions/:revisionId/test', requireAuth, requireRole('competitor'), requireCsrf, async (req, res) => {
  const practiceStarted = performance.now();
  if (!sourceRevisionExecutor) return res.status(503).json({ error: 'Source revision testing requires sandbox execution to be enabled' });
  const revision = botRevisionRepository.findOwned(routeParam(req, 'id'), routeParam(req, 'revisionId'), req.auth!.id);
  if (!revision) return res.status(404).json({ error: 'Source revision not found' });
  if (!isSupportedSourceRuntime(revision.runtime_id)) return res.status(400).json({ error: 'Only C++17 and Python 3 revisions can be tested' });
  const scenarioId = typeof req.body?.scenarioId === 'string' ? req.body.scenarioId : 'initial';
  const scenario = createPracticeScenario(scenarioId);
  if (!scenario) return res.status(400).json({ error: 'Invalid practice scenario' });
  if (!allowPracticeAttempt(req.auth!.id)) return res.status(429).json({ error: 'Practice rate limit exceeded' });
  if (activePracticeExecutions.size >= 2) return res.status(429).json({ error: 'Practice execution capacity is busy' });
  const practiceKey = `${req.auth!.id}:${revision.revision_id}`;
  if (activePracticeExecutions.has(practiceKey)) return res.status(409).json({ error: 'This revision is already being tested' });
  activePracticeExecutions.add(practiceKey);
  try {
    const source = Buffer.from(await botRevisionRepository.readSource(revision), 'utf8');
    const executionId = `revision-practice-${randomUUID()}`;
    const request = BotProtocol.createRequest(executionId, scenario.state, scenario.legalMoves);
    const result = await sourceRevisionExecutor.executeRevision(
      { executionId, matchId: `practice-${scenario.id}`, turn: scenario.state.turn, player: scenario.expectedPlayer },
      { execution: { kind: 'source-revision', competitorId: req.auth!.id, botId: revision.bot_id, revisionId: revision.revision_id, runtimeId: revision.runtime_id, sourceDigest: revision.source_digest, executionMode: revision.execution_mode, sdkVersion: revision.sdk_version ?? undefined, sdkDigest: revision.sdk_digest ?? undefined }, source },
      request,
    );
    const timings = { ...result.timings, practiceRequestMs: Math.round(performance.now() - practiceStarted) };
    const safeProvenance = result.provenance ? {
      compilationBackend: result.provenance.compilationBackend,
      sourceDigest: result.provenance.sourceDigest,
      sdkVersion: result.provenance.sdkVersion,
      sdkDigest: result.provenance.sdkDigest,
      compilerImageDigest: result.provenance.compilerImageDigest,
      compilerConfigDigest: result.provenance.compilerConfigDigest,
      artifactDigest: result.provenance.artifactDigest,
    } : undefined;
    if (!result.success) {
      const code = result.error?.code || 'INVALID_BOT';
      const infrastructure = ['EXECUTOR_ERROR', 'EXECUTOR_UNAVAILABLE', 'SANDBOX_REQUIRED'].includes(code);
      const compilerDiagnostic = result.error?.message === 'C++ compilation failed'
        ? result.stderr.trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' ').replaceAll('/app/source/main.cpp', 'main.cpp').slice(0, 600)
        : '';
      const runtimeDiagnostic = code === 'PROCESS_CRASHED' && result.error?.message.startsWith('Bot container exited with code ')
        ? result.stderr.trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' ')
          .replaceAll('/app/source/main.cpp', 'main.cpp')
          .replaceAll('/app/bin/bot', 'bot')
          .slice(0, 600)
        : '';
      const errorMessage = infrastructure
        ? 'Không thể kết nối môi trường Docker sandbox.'
        : code === 'PROCESS_CRASHED'
          ? compilerDiagnostic
            ? `C++ không biên dịch được: ${compilerDiagnostic}`
            : runtimeDiagnostic
              ? `Bot chạy lỗi trong Docker: ${runtimeDiagnostic}`
            : result.error?.message.startsWith('Bot container exited with code ')
              ? `Bot đã kết thúc trong môi trường Docker với mã ${result.exitCode ?? 'không xác định'}.`
              : 'Mã nguồn không biên dịch được hoặc Bot đã kết thúc với lỗi.'
          : code === 'EMPTY_OUTPUT'
            ? 'Bot không trả về nước đi.'
            : code === 'INVALID_JSON' || code === 'INVALID_RESPONSE'
              ? 'Bot trả về dữ liệu không đúng giao thức.'
              : 'Bot không trả về nước đi hợp lệ trong lần chạy thử.';
      return res.status(infrastructure ? 503 : 422).json({
        valid: false,
        status: 'failed',
        scenarioId: scenario.id,
        code,
        timings,
        error: localizePracticeError(code, compilerDiagnostic, runtimeDiagnostic, result.exitCode),
        diagnostic: {
          player: scenario.expectedPlayer,
          runtimeId: revision.runtime_id,
          executionMode: revision.execution_mode,
          sdkVersion: revision.sdk_version,
          sdkDigest: revision.sdk_digest,
          stage: result.error?.stage ?? 'runtime_startup',
          exitCode: result.exitCode,
          outputProduced: result.stdout.length > 0 || result.stderr.length > 0,
          engineAcceptedMove: false,
          ...safeProvenance,
        },
      });
    }
    const selectedMove = result.response?.move;
    const legalMove = selectedMove && scenario.legalMoves.find(move =>
      move.pieceId === selectedMove.piece_id
      && posToAlgebraic(move.from) === selectedMove.from
      && posToAlgebraic(move.to) === selectedMove.to
    );
    if (!legalMove) {
      return res.status(422).json({
        valid: false,
        status: 'failed',
        scenarioId: scenario.id,
        code: 'INVALID_MOVE',
        timings,
        error: 'Bot đã chọn một nước đi không có trong danh sách hợp lệ.',
        diagnostic: {
          player: scenario.expectedPlayer,
          runtimeId: revision.runtime_id,
          executionMode: revision.execution_mode,
          sdkVersion: revision.sdk_version,
          sdkDigest: revision.sdk_digest,
          stage: 'move_validation',
          exitCode: result.exitCode,
          outputProduced: result.stdout.length > 0 || result.stderr.length > 0,
          engineAcceptedMove: false,
        },
      });
    }
    return res.json({
      valid: true,
      status: 'completed',
      timings,
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      state: scenario.state,
      legalMoves: serializePracticeLegalMoves(scenario.legalMoves),
      move: selectedMove,
      capture: legalMove.captures,
      accepted: true,
      runtimeId: revision.runtime_id,
      executionMode: revision.execution_mode,
      sdkVersion: revision.sdk_version,
      sdkDigest: revision.sdk_digest,
      provenance: safeProvenance,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Source revision test failed';
    return res.status(503).json({ error: message.includes('Docker') || message.includes('sandbox') ? message : 'Không thể chạy thử revision.' });
  } finally {
    activePracticeExecutions.delete(practiceKey);
  }
});

// Run an ephemeral practice match: the submitted revision plays as A against
// the deterministic built-in system opponent as B. Nothing is persisted.
const fixedPracticeMatchHandler = async (req: express.Request, res: express.Response, draft: { revision: any; source: Buffer } | null = null) => {
  const started = performance.now();
  if (!sourceRevisionExecutor) return res.status(503).json({ error: 'Source revision testing requires sandbox execution to be enabled' });
  const revision = draft?.revision || botRevisionRepository.findOwned(routeParam(req, 'id'), routeParam(req, 'revisionId'), req.auth!.id);
  if (!revision) return res.status(404).json({ error: 'Source revision not found' });
  if (!isSupportedSourceRuntime(revision.runtime_id)) return res.status(400).json({ error: 'Only C++17 and Python 3 revisions can be tested' });
  if (!allowPracticeAttempt(req.auth!.id)) return res.status(429).json({ error: 'Practice rate limit exceeded' });
  if (activePracticeExecutions.size >= 2) return res.status(429).json({ error: 'Practice execution capacity is busy' });
  const practiceKey = `${req.auth!.id}:${revision.revision_id}:match`;
  if (activePracticeExecutions.has(practiceKey)) return res.status(409).json({ error: 'This revision is already being tested' });
  activePracticeExecutions.add(practiceKey);
  const revisionScopeId = `practice-match-${randomUUID()}`;
  const controller = new AbortController();
  const abortOnDisconnect = () => { if (!res.writableEnded) controller.abort(); };
  req.once('aborted', abortOnDisconnect);
  res.once('close', abortOnDisconnect);
  const matchDeadline = setTimeout(() => controller.abort(), 120_000);
  try {
    const source = draft?.source || Buffer.from(await botRevisionRepository.readSource(revision), 'utf8');
    const engine = createEngine();
    const states = [engine.getState()];
    const moves: Array<{ player: 'A' | 'B'; turn: number; pieceId: string; from: string; to: string; captures: string | null }> = [];
    let executionCount = 0;
    while (!engine.isFinished() && executionCount < 200) {
      if (controller.signal.aborted) throw new ExecutionCancelledError('Practice match cancelled');
      const state = engine.getState();
      const legalMoves = engine.getLegalMoves();
      if (!legalMoves.length) break;
      let selected = state.currentPlayer === 'A'
        ? null
        : chooseSystemOpponentMove(state, legalMoves);
      if (state.currentPlayer === 'A') {
        const executionId = `revision-practice-match-${randomUUID()}`;
        const result = await sourceRevisionExecutor.executeRevision(
          { executionId, matchId: 'practice-fixed-opponent', turn: state.turn, player: 'A', revisionScopeId, signal: controller.signal },
          { execution: { kind: 'source-revision', competitorId: req.auth!.id, botId: revision.bot_id, revisionId: revision.revision_id, runtimeId: revision.runtime_id, sourceDigest: revision.source_digest, executionMode: revision.execution_mode, sdkVersion: revision.sdk_version ?? undefined, sdkDigest: revision.sdk_digest ?? undefined }, source },
          BotProtocol.createRequest(executionId, state, legalMoves),
        );
        if (!result.success || !result.response?.move) {
          return res.status(422).json({ mode: 'fixed-opponent', status: 'failed', opponentName: 'Bot hệ thống', code: result.error?.code || 'INVALID_BOT', error: result.error?.message || 'Bot không trả về nước đi hợp lệ.', diagnostic: { stage: result.error?.stage || 'runtime_startup', runtimeId: revision.runtime_id, executionMode: revision.execution_mode } });
        }
        const candidate = result.response.move;
        selected = legalMoves.find(move => move.pieceId === candidate.piece_id && posToAlgebraic(move.from) === candidate.from && posToAlgebraic(move.to) === candidate.to) || null;
        if (!selected) return res.status(422).json({ mode: 'fixed-opponent', status: 'failed', opponentName: 'Bot hệ thống', code: 'INVALID_MOVE', error: 'Bot đã chọn một nước đi không hợp lệ.', diagnostic: { stage: 'move_validation', runtimeId: revision.runtime_id, executionMode: revision.execution_mode } });
      }
      if (!selected) return res.status(422).json({ mode: 'fixed-opponent', status: 'failed', opponentName: 'Bot hệ thống', code: 'INVALID_MOVE', error: 'Không xác định được nước đi chạy thử.', diagnostic: { stage: 'move_validation' } });
      const applied = engine.makeMove(selected.pieceId, selected.to.row, selected.to.col);
      if (!applied.success) return res.status(422).json({ mode: 'fixed-opponent', status: 'failed', opponentName: 'Bot hệ thống', code: 'INVALID_MOVE', error: 'Không thể áp dụng nước đi của Bot.', diagnostic: { stage: 'move_validation' } });
      moves.push({ player: state.currentPlayer, turn: state.turn, pieceId: selected.pieceId, from: posToAlgebraic(selected.from), to: posToAlgebraic(selected.to), captures: selected.captures });
      states.push(engine.getState());
      executionCount += 1;
    }
    const finalState = engine.getState();
    return res.json({ mode: 'fixed-opponent', status: 'completed', opponentName: 'Bot hệ thống', opponentId: 'system-fixed-opponent', winner: finalState.winner || 'draw', terminationReason: finalState.winReason || (executionCount >= 200 ? 'max_turns' : 'no_legal_moves'), moves, initialState: states[0], states, finalState, state: finalState, runtimeId: revision.runtime_id, executionMode: revision.execution_mode, sdkVersion: revision.sdk_version, timings: { practiceRequestMs: Math.round(performance.now() - started) } });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : 'Không thể chạy trận thử với Bot hệ thống.' });
  } finally {
    clearTimeout(matchDeadline);
    req.off('aborted', abortOnDisconnect);
    res.off('close', abortOnDisconnect);
    await sourceRevisionExecutor.releaseRevisionScope?.(revisionScopeId).catch(() => false);
    activePracticeExecutions.delete(practiceKey);
  }
};

app.post('/api/bots/:id/revisions/:revisionId/test-match', requireAuth, requireRole('competitor'), requireCsrf, (req, res) => fixedPracticeMatchHandler(req, res));

app.post('/api/bots/draft/test-match', requireAuth, requireRole('competitor'), requireCsrf, (req, res) => {
  const source = typeof req.body?.source === 'string' ? req.body.source : '';
  const runtimeId = typeof req.body?.runtimeId === 'string' ? req.body.runtimeId : '';
  if (!source.trim()) return res.status(400).json({ error: 'Mã nguồn không được để trống.' });
  if (!isSupportedSourceRuntime(runtimeId)) return res.status(400).json({ error: 'Only C++17 and Python 3 revisions can be tested' });
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) return res.status(400).json({ error: 'Mã nguồn không được vượt quá 64 KiB.' });
  const revisionId = `draft-${randomUUID()}`;
  return fixedPracticeMatchHandler(req, res, {
    revision: { bot_id: 'draft-bot', revision_id: revisionId, runtime_id: runtimeId, source_digest: 'draft', execution_mode: req.body?.executionMode === 'raw' ? 'raw' : 'strategy', sdk_version: req.body?.sdkVersion || null, sdk_digest: null },
    source: Buffer.from(source, 'utf8'),
  });
});

// ---------------------------------------------------------
// TOURNAMENTS API
// ---------------------------------------------------------
async function ownedTournament(id: string, userId: string) {
  const result = await manager.loadTournament(id);
  return result.success && result.data?.metadata?.ownerId === userId ? result.data : null;
}

function safeParticipationRequest(request: ParticipationRequest, includeCompetitorId = false) {
  return {
    requestId: request.requestId,
    ...(includeCompetitorId ? { competitorId: request.competitorId } : {}),
    botId: request.botId,
    ...(request.revisionId ? { revisionId: request.revisionId, runtimeId: request.runtimeId, sourceDigest: request.sourceDigest, executionMode: request.executionMode, sdkVersion: request.sdkVersion, sdkDigest: request.sdkDigest } : {}),
    participantName: request.participantName,
    status: request.status,
    requestedAt: request.requestedAt,
    reviewedAt: request.reviewedAt,
    reviewedBy: request.reviewedBy,
    rejectionReason: request.rejectionReason,
  };
}

function organizerParticipationRequest(request: ParticipationRequest) {
  const safe = safeParticipationRequest(request, true) as Record<string, unknown>;
  const bot = botRepository.findById(request.botId);
  return bot ? { ...safe, botName: bot.name } : safe;
}

function discoverableTournament(tournament: Awaited<ReturnType<typeof manager.loadTournament>>['data'] | null) {
  if (!tournament) return null;
  // Registration-open tournaments must have an owner. Older test/legacy
  // records without ownership metadata are orphaned and must not appear as
  // joinable tournaments to every authenticated user.
  if (tournament.status === 'registration_open') {
    const ownerId = tournament.metadata?.ownerId;
    if (typeof ownerId !== 'string' || userRepository.findById(ownerId)?.role !== 'organizer') return null;
  }
  return {
    tournamentId: tournament.tournamentId,
    name: tournament.name,
    format: tournament.format,
    status: tournament.status,
    registrationOpenedAt: tournament.registrationOpenedAt,
    participantCount: tournament.participants.length,
    resultsPublishedAt: tournament.status === 'completed' && tournament.resultsPublishedAt ? tournament.resultsPublishedAt : null,
  };
}

function isPublishedTournament(tournament: Tournament): boolean {
  return tournament.status === 'completed' && Boolean(tournament.resultsPublishedAt);
}

function safePublishedTournament(tournament: Tournament) {
  return {
    tournamentId: tournament.tournamentId,
    name: tournament.name,
    format: tournament.format,
    status: tournament.status,
    participants: tournament.participants.map(participant => ({
      participantId: participant.participantId,
      name: participant.name,
    })),
    rounds: tournament.rounds,
    standings: tournament.standings,
    createdAt: tournament.createdAt,
    registrationOpenedAt: tournament.registrationOpenedAt,
    registrationClosedAt: tournament.registrationClosedAt,
    startedAt: tournament.startedAt,
    completedAt: tournament.completedAt,
    resultsPublishedAt: tournament.resultsPublishedAt ?? null,
  };
}

function safeSpectatorTournament(tournament: Tournament, viewerId?: string) {
  const viewerBotIds = new Set((tournament.participationRequests ?? [])
    .filter(request => request.competitorId === viewerId && request.status === 'approved')
    .map(request => request.botId));
  const viewerParticipantIds = viewerId
    ? tournament.participants.filter(participant => viewerBotIds.has(participant.bot.botId)).map(participant => participant.participantId)
    : [];
  const participantName = (participantId: string | null) => participantId
    ? tournament.participants.find(item => item.participantId === participantId)?.name ?? participantId
    : 'Miễn đấu';
  return {
    tournamentId: tournament.tournamentId,
    name: tournament.name,
    format: tournament.format,
    status: tournament.status,
    spectatorAccess: tournament.status === 'running',
    viewerParticipantIds,
    participantCount: tournament.participants.length,
    participants: tournament.participants.map(participant => ({ participantId: participant.participantId, name: participant.name })),
    rounds: tournament.rounds.map(round => ({
      roundNumber: round.roundNumber,
      pairings: round.pairings.map(pairing => ({
        pairingId: pairing.pairingId,
        roundNumber: pairing.roundNumber,
        participantA: pairing.participantA,
        participantB: pairing.participantB,
        status: pairing.status,
        matchId: pairing.matchId,
        startedAt: pairing.startedAt,
        completedAt: pairing.completedAt,
        seriesProgress: pairing.seriesProgress ? {
          format: pairing.seriesProgress.format,
          bestOf: pairing.seriesProgress.bestOf,
          nextGame: pairing.seriesProgress.nextGame,
          winsA: pairing.seriesProgress.winsA,
          winsB: pairing.seriesProgress.winsB,
          games: pairing.seriesProgress.games.map(game => ({ gameNumber: game.gameNumber, winner: game.winner, winnerParticipantId: game.winnerParticipantId })),
        } : null,
        matchResult: pairing.matchResult && isPublishedTournament(tournament) ? {
          winner: pairing.matchResult.winner,
          terminationReason: pairing.matchResult.terminationReason,
          completedAt: pairing.matchResult.completedAt,
          series: pairing.matchResult.series ? {
            winsA: pairing.matchResult.series.winsA,
            winsB: pairing.matchResult.series.winsB,
            winner: pairing.matchResult.series.winner,
            games: pairing.matchResult.series.games.map(game => ({ gameNumber: game.gameNumber, winner: game.winner, winnerParticipantId: game.winnerParticipantId })),
          } : undefined,
        } : null,
        participantNames: { A: participantName(pairing.participantA), B: participantName(pairing.participantB) },
      })),
    })),
    standings: tournament.standings.map(standing => ({ ...standing })),
    createdAt: tournament.createdAt,
    startedAt: tournament.startedAt,
    completedAt: tournament.completedAt,
    resultsPublishedAt: tournament.resultsPublishedAt ?? null,
  };
}

async function canViewTournamentResults(req: express.Request, tournament: Tournament): Promise<boolean> {
  if (req.auth?.role === 'organizer') return tournament.metadata?.ownerId === req.auth.id;
  return Boolean(req.auth && isPublishedTournament(tournament));
}

app.get('/api/tournaments/discoverable', requireAuth, async (req, res) => {
  try {
    const tournaments = await manager.listTournaments();
    const visible = tournaments
      .map(tournament => ({ source: tournament, projection: discoverableTournament(tournament) }))
      .filter((entry): entry is { source: Tournament; projection: NonNullable<ReturnType<typeof discoverableTournament>> } => {
        return entry.projection !== null;
      });
    const projections = await Promise.all(visible.map(async ({ source, projection }) => {
      const requests = req.auth!.role === 'competitor'
        ? await manager.listMyParticipationRequests(source.tournamentId, req.auth!.id)
        : { success: true, data: [] as ParticipationRequest[] };
      const mine = requests.success && requests.data?.length ? requests.data[requests.data.length - 1] : null;
      return { ...projection, myRequestStatus: mine?.status ?? null };
    }));
    res.json(projections);
  } catch (error) {
    console.error('Discoverable tournament listing failed:', error);
    res.status(500).json({ error: 'Unable to list discoverable tournaments' });
  }
});

app.post('/api/tournaments/:id/participation-requests', requireAuth, requireRole('competitor'), requireCsrf, async (req, res) => {
  try {
    const tournamentId = routeParam(req, 'id');
    const tournamentResult = await manager.loadTournament(tournamentId);
    const tournament = tournamentResult.success ? tournamentResult.data : null;
    if (!discoverableTournament(tournament)) return res.status(404).json({ error: 'Tournament not found' });
    const { botId, revisionId, participantName } = req.body ?? {};
    if (typeof botId !== 'string' || typeof revisionId !== 'string' || typeof participantName !== 'string' || !participantName.trim() || participantName.length > 100) {
      return res.status(400).json({ error: 'Invalid participation request' });
    }
    const bot = botRepository.findById(botId);
    if (!bot || bot.owner_id !== req.auth!.id) return res.status(404).json({ error: 'Bot not found' });
    const revision = botRevisionRepository.findOwned(botId, revisionId, req.auth!.id);
    if (!revision) return res.status(404).json({ error: 'Source revision not found' });
    if (!isSupportedSourceRuntime(revision.runtime_id)) return res.status(409).json({ error: 'This source revision is not supported for new participation requests' });
    try { await botRevisionRepository.readSource(revision); } catch { return res.status(409).json({ error: 'Source revision failed integrity validation' }); }
    const execution: SourceRevisionExecution = {
      kind: 'source-revision',
      competitorId: req.auth!.id,
      botId,
      revisionId,
      runtimeId: revision.runtime_id,
      sourceDigest: revision.source_digest,
      executionMode: revision.execution_mode,
      sdkVersion: revision.sdk_version ?? undefined,
      sdkDigest: revision.sdk_digest ?? undefined,
    };
    const botSnapshot: TournamentBot = {
      botId: bot.id,
      command: '',
      args: [],
      execution,
    };
    const result = await manager.submitParticipationRequest(tournamentId, {
      competitorId: req.auth!.id,
      botId: bot.id,
      participantName: participantName.trim(),
      botSnapshot,
      revisionId,
      runtimeId: revision.runtime_id,
      sourceDigest: revision.source_digest,
      executionMode: revision.execution_mode,
      sdkVersion: revision.sdk_version ?? undefined,
      sdkDigest: revision.sdk_digest ?? undefined,
    });
    if (!result.success || !result.data) return res.status(409).json({ error: String(result.error) });
    res.status(201).json(safeParticipationRequest(result.data));
  } catch (error) {
    console.error('Participation request failed:', error);
    res.status(500).json({ error: 'Unable to submit participation request' });
  }
});

app.get('/api/tournaments/:id/participation-requests/mine', requireAuth, requireRole('competitor'), async (req, res) => {
  try {
    const tournamentId = routeParam(req, 'id');
    const tournamentResult = await manager.loadTournament(tournamentId);
    if (!tournamentResult.success || !tournamentResult.data) return res.status(404).json({ error: 'Tournament not found' });
    const result = await manager.listMyParticipationRequests(tournamentId, req.auth!.id);
    if (!result.success) return res.status(404).json({ error: 'Tournament not found' });
    // A competitor may continue tracking their own request after registration
    // closes, but private tournaments and unrelated IDs must not become a
    // discovery oracle.
    res.json(result.data?.map(request => safeParticipationRequest(request, false)) ?? []);
  } catch (error) {
    console.error('Participation request lookup failed:', error);
    res.status(500).json({ error: 'Unable to load participation requests' });
  }
});

app.get('/api/my/tournaments', requireAuth, requireRole('competitor'), async (req, res) => {
  try {
    const tournaments = await manager.listTournaments();
    const mine = tournaments.flatMap(tournament => {
      const requests = (tournament.participationRequests ?? [])
        .filter(request => request.competitorId === req.auth!.id)
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
      const latest = requests.at(-1);
      if (!latest) return [];
      const participant = tournament.participants.find(item => item.bot.botId === latest.botId);
      const publicResults = isPublishedTournament(tournament);
      return [{
        tournamentId: tournament.tournamentId,
        name: tournament.name,
        status: tournament.status,
        registrationOpen: tournament.status === 'registration_open',
        participantCount: tournament.participants.length,
        request: safeParticipationRequest(latest),
        participantId: participant?.participantId ?? null,
        resultsPublished: publicResults,
        resultsPublishedAt: publicResults ? tournament.resultsPublishedAt ?? null : null,
      }];
    });
    res.json(mine);
  } catch (error) {
    console.error('Competitor tournament projection failed:', error);
    res.status(500).json({ error: 'Unable to load your tournaments' });
  }
});

app.get('/api/my/bot-stats', requireAuth, requireRole('competitor'), async (req, res) => {
  try {
    const ownedBots = botRepository.listByOwner(req.auth!.id);
    const stats = new Map(ownedBots.map(bot => [bot.id, {
      botId: bot.id,
      botName: bot.name,
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
    }]));
    const tournaments = await manager.listTournaments();
    for (const tournament of tournaments) {
      for (const participant of tournament.participants) {
        const botStats = stats.get(participant.bot.botId);
        if (!botStats) continue;
        const standing = tournament.standings.find(item => item.participantId === participant.participantId);
        if (!standing) continue;
        botStats.matches += Number(standing.matchesPlayed) || 0;
        botStats.wins += Number(standing.wins) || 0;
        botStats.draws += Number(standing.draws) || 0;
        botStats.losses += Number(standing.losses) || 0;
      }
    }
    const values = [...stats.values()];
    res.json({
      totalMatches: values.reduce((sum, item) => sum + item.matches, 0),
      wins: values.reduce((sum, item) => sum + item.wins, 0),
      draws: values.reduce((sum, item) => sum + item.draws, 0),
      losses: values.reduce((sum, item) => sum + item.losses, 0),
      bots: values,
    });
  } catch (error) {
    console.error('Competitor bot statistics lookup failed:', error);
    res.status(500).json({ error: 'Unable to load Bot statistics' });
  }
});

app.get('/api/tournaments', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const tournaments = await manager.listTournaments();
    res.json(tournaments.filter(t => t.metadata?.ownerId === req.auth!.id));
  } catch (error) {
    console.error('Tournament listing failed:', error);
    res.status(500).json({ error: 'Unable to list tournaments' });
  }
});

app.post('/api/tournaments', requireAuth, requireRole('organizer'), requireCsrf, async (req, res) => {
  try {
    const { name, format } = req.body;
    if (!name || typeof name !== 'string' || name.length > 100 ||
        (format !== undefined && format !== 'single_round_robin')) {
      return res.status(400).json({ error: 'Invalid tournament name' });
    }

    const id = `t-${randomUUID()}`;
    const result = await manager.createTournament(id, name, format || 'single_round_robin', { bestOf: 3 });

    if (!result.success || !result.data) return res.status(400).json({ error: 'Unable to create tournament' });
    const metadataResult = await manager.updateMetadata(result.data.tournamentId, {
      ownerId: req.auth!.id,
    });
    if (!metadataResult.success || !metadataResult.data) return res.status(500).json({ error: 'Unable to persist tournament ownership' });
    result.data = metadataResult.data;
    res.status(201).json(result.data);
  } catch (error) {
    console.error('Tournament creation failed:', error);
    res.status(500).json({ error: 'Unable to create tournament' });
  }
});

app.post('/api/tournaments/:id/publish', requireAuth, requireRole('organizer'), requireCsrf, async (req, res) => {
  try {
    const tournamentId = routeParam(req, 'id');
    if (!await ownedTournament(tournamentId, req.auth!.id)) return res.status(404).json({ error: 'Tournament not found' });
    const result = await manager.publishResults(tournamentId);
    if (!result.success || !result.data) return res.status(409).json({ error: String(result.error) });
    res.json({ resultsPublishedAt: result.data.resultsPublishedAt });
  } catch (error) {
    console.error('Tournament publication failed:', error);
    res.status(500).json({ error: 'Unable to publish tournament results' });
  }
});

app.patch('/api/tournaments/:id', requireAuth, requireRole('organizer'), requireCsrf, async (req, res) => {
  try {
    const tournamentId = routeParam(req, 'id');
    if (!await ownedTournament(tournamentId, req.auth!.id)) return res.status(404).json({ error: 'Tournament not found' });
    const { name } = req.body;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ error: 'Invalid tournament details' });
    }
    const result = await manager.updateTournamentDetails(tournamentId, name.trim());
    if (!result.success || !result.data) return res.status(409).json({ error: String(result.error) });
    res.json(result.data);
  } catch (error) {
    console.error('Tournament update failed:', error);
    res.status(500).json({ error: 'Unable to update tournament' });
  }
});

app.delete('/api/tournaments/:id', requireAuth, requireRole('organizer'), requireCsrf, async (req, res) => {
  try {
    const tournamentId = routeParam(req, 'id');
    if (!await ownedTournament(tournamentId, req.auth!.id)) return res.status(404).json({ error: 'Tournament not found' });
    const result = await manager.deleteTournament(tournamentId);
    if (!result.success) return res.status(409).json({ error: String(result.error) });
    res.status(204).send();
  } catch (error) {
    console.error('Tournament deletion failed:', error);
    res.status(500).json({ error: 'Unable to delete tournament' });
  }
});

app.get('/api/tournaments/:id/requests', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const tournamentId = routeParam(req, 'id');
    if (!await ownedTournament(tournamentId, req.auth!.id)) return res.status(404).json({ error: 'Tournament not found' });
    const result = await manager.listParticipationRequests(tournamentId);
    if (!result.success) return res.status(404).json({ error: 'Tournament not found' });
    res.json(result.data?.map(organizerParticipationRequest) ?? []);
  } catch (error) {
    console.error('Participation request administration failed:', error);
    res.status(500).json({ error: 'Unable to load participation requests' });
  }
});

app.post('/api/tournaments/:id/requests/:requestId/approve', requireAuth, requireRole('organizer'), requireCsrf, async (req, res) => {
  try {
    const tournamentId = routeParam(req, 'id');
    if (!await ownedTournament(tournamentId, req.auth!.id)) return res.status(404).json({ error: 'Tournament not found' });
    const result = await manager.reviewParticipationRequest(tournamentId, routeParam(req, 'requestId'), req.auth!.id, 'approve');
    if (!result.success) return res.status(409).json({ error: String(result.error) });
    res.json(result.data);
  } catch (error) {
    console.error('Participation request approval failed:', error);
    res.status(500).json({ error: 'Unable to approve participation request' });
  }
});

app.post('/api/tournaments/:id/requests/:requestId/reject', requireAuth, requireRole('organizer'), requireCsrf, async (req, res) => {
  try {
    const tournamentId = routeParam(req, 'id');
    if (!await ownedTournament(tournamentId, req.auth!.id)) return res.status(404).json({ error: 'Tournament not found' });
    const reason = req.body?.reason;
    if (reason !== undefined && (typeof reason !== 'string' || reason.trim().length > 500)) return res.status(400).json({ error: 'Invalid rejection reason' });
    const result = await manager.reviewParticipationRequest(tournamentId, routeParam(req, 'requestId'), req.auth!.id, 'reject', reason);
    if (!result.success) return res.status(409).json({ error: String(result.error) });
    res.json(result.data);
  } catch (error) {
    console.error('Participation request rejection failed:', error);
    res.status(500).json({ error: 'Unable to reject participation request' });
  }
});

app.get('/api/tournaments/:id', requireAuth, async (req, res) => {
  try {
    const tournament = await ownedTournament(routeParam(req, 'id'), req.auth!.id);
    if (req.auth!.role === 'organizer') {
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
      return res.json(tournament);
    }
    const result = await manager.loadTournament(routeParam(req, 'id'));
    if (!result.success || !result.data) return res.status(404).json({ error: 'Tournament not found' });
    if (result.data.status === 'draft') return res.status(403).json({ error: 'Tournament not accessible' });
    return res.json(safeSpectatorTournament(result.data, req.auth!.id));
  } catch (error) {
    console.error('Tournament lookup failed:', error);
    res.status(500).json({ error: 'Unable to load tournament' });
  }
});

app.post('/api/tournaments/:id/register', requireAuth, requireRole('organizer'), requireCsrf, async (req, res) => {
  try {
    const tournament = await ownedTournament(routeParam(req, 'id'), req.auth!.id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    return res.status(409).json({ error: 'Direct tournament registration is unavailable until participation requests are enabled' });
  } catch (error) {
    console.error('Tournament registration failed:', error);
    res.status(500).json({ error: 'Unable to evaluate tournament registration' });
  }
});

// Track active tournament runs to prevent duplicate run_all tasks
const activeTournamentRuns = new Set<string>();
const tournamentRunOwners = new Map<string, string>();

function queueStatsForOrganizer(ownerId: string) {
  const ownedTaskIds: string[] = [];
  for (const [taskId, taskOwnerId] of tournamentRunOwners) {
    const status = executionQueue.getStatus(taskId);
    if (status === 'queued' || status === 'active') {
      if (taskOwnerId === ownerId) ownedTaskIds.push(taskId);
    } else {
      tournamentRunOwners.delete(taskId);
    }
  }
  return executionQueue.getStatsFor(ownedTaskIds);
}

app.post('/api/tournaments/:id/action', requireAuth, requireRole('organizer'), requireCsrf, async (req, res) => {
  try {
    const { action, pairingId } = req.body;
    const tournamentId = routeParam(req, 'id');
    const tournament = await ownedTournament(tournamentId, req.auth!.id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    let result;

    switch (action) {
      case 'open_registration':
        result = await manager.openRegistration(tournamentId);
        break;
      case 'close_registration':
        result = await manager.closeRegistration(tournamentId);
        break;
      case 'generate_schedule':
        result = await manager.generateSchedule(tournamentId);
        break;
      case 'start':
        result = await manager.startTournament(tournamentId);
        break;
      case 'run_all':
        // 4. Prevent duplicate run_all tasks
        if (activeTournamentRuns.has(tournamentId)) {
          return res.status(409).json({ error: 'Tournament is already running' });
        }
        activeTournamentRuns.add(tournamentId);
        const taskId = `run_all_${tournamentId}`;
        tournamentRunOwners.set(taskId, req.auth!.id);

        executionQueue.submit(taskId, async (signal) => {
          try {
            const executionResult = await manager.runAllMatches(tournamentId, signal);
            if (!executionResult.success) {
              if (signal.aborted || executionResult.error === 'Tournament execution cancelled') {
                return;
              }
              throw new Error(executionResult.error ?? 'Tournament execution failed');
            }
          } finally {
            activeTournamentRuns.delete(tournamentId);
            tournamentRunOwners.delete(taskId);
          }
        }).catch(err => {
          tournamentRunOwners.delete(taskId);
          activeTournamentRuns.delete(tournamentId);
          if (!(err instanceof Error && err.message.includes('cancelled'))) {
            console.error(`Execution queue error for ${tournamentId}:`, err);
          }
        });

        return res.json({ message: 'Match execution started in background' });
      case 'retry_match':
      case 'retry_pairing':
      case 'run_pairing':
        if (typeof pairingId !== 'string' || !pairingId.trim()) return res.status(400).json({ error: 'Pairing ID is required' });
        {
          const requestedPairing = tournament.rounds.flatMap(round => round.pairings).find(pairing => pairing.pairingId === pairingId.trim());
          if (!requestedPairing) return res.status(404).json({ error: 'Pairing not found' });
          if (requestedPairing.status !== 'failed') return res.status(409).json({ error: `Pairing cannot be retried (current: ${requestedPairing.status})` });
        }
        if (activeTournamentRuns.has(tournamentId)) return res.status(409).json({ error: 'Tournament is already running' });
        activeTournamentRuns.add(tournamentId);
        const pairingTaskId = `run_pairing_${tournamentId}_${pairingId}`;
        tournamentRunOwners.set(pairingTaskId, req.auth!.id);
        executionQueue.submit(pairingTaskId, async () => {
          try {
            const executionResult = await manager.retryPairingById(tournamentId, pairingId.trim());
            if (!executionResult.success) throw new Error(executionResult.error ?? 'Pairing retry failed');
          } finally {
            activeTournamentRuns.delete(tournamentId);
            tournamentRunOwners.delete(pairingTaskId);
          }
        }).catch(err => {
          tournamentRunOwners.delete(pairingTaskId);
          activeTournamentRuns.delete(tournamentId);
          console.error(`Pairing retry queue error for ${tournamentId}/${pairingId}:`, err);
        });
        return res.json({ message: 'Match retry started in background' });
      case 'cancel':
        executionQueue.cancel(`run_all_${tournamentId}`);
        activeTournamentRuns.delete(tournamentId);
        result = await manager.cancelTournament(tournamentId);
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    if (!result.success) return res.status(400).json({ error: String(result.error) });
    res.json(result.data);
  } catch (error) {
    console.error('Tournament action failed:', error);
    res.status(500).json({ error: 'Unable to perform tournament action' });
  }
});

// Dedicated retry endpoint. This keeps match retry independent from the
// tournament lifecycle action dispatcher and avoids stale clients sending an
// unsupported action name.
app.post('/api/tournaments/:id/pairings/:pairingId/retry', requireAuth, requireRole('organizer'), requireCsrf, async (req, res) => {
  try {
    const tournamentId = routeParam(req, 'id');
    const pairingId = routeParam(req, 'pairingId');
    const tournament = await ownedTournament(tournamentId, req.auth!.id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const pairing = tournament?.rounds.flatMap(round => round.pairings).find(item => item.pairingId === pairingId);
    if (!pairing) return res.status(404).json({ error: 'Pairing not found' });
    if (pairing.status !== 'failed') return res.status(409).json({ error: `Pairing cannot be retried (current: ${pairing.status})` });
    const taskId = `retry_pairing_${tournamentId}_${pairingId}`;
    const existingTask = executionQueue.getStatus(taskId);
    if (existingTask === 'queued' || existingTask === 'active') {
      return res.json({ message: 'Match retry is already queued' });
    }
    if (activeTournamentRuns.has(tournamentId)) return res.status(409).json({ error: 'Tournament is already running' });
    const prepared = await manager.preparePairingRetry(tournamentId, pairingId);
    if (!prepared.success) return res.status(409).json({ error: prepared.error ?? 'Pairing cannot be retried' });
    activeTournamentRuns.add(tournamentId);
    tournamentRunOwners.set(taskId, req.auth!.id);
    executionQueue.submit(taskId, async () => {
      try {
        const result = await manager.runPairingById(tournamentId, pairingId);
        if (!result.success) throw new Error(result.error ?? 'Pairing retry failed');
      } finally {
        activeTournamentRuns.delete(tournamentId);
        tournamentRunOwners.delete(taskId);
      }
    }).catch(error => {
      activeTournamentRuns.delete(tournamentId);
      tournamentRunOwners.delete(taskId);
      console.error(`Dedicated pairing retry failed for ${tournamentId}/${pairingId}:`, error);
    });
    return res.json({ message: 'Match retry started in background' });
  } catch (error) {
    console.error('Dedicated pairing retry request failed:', error);
    return res.status(500).json({ error: 'Unable to retry match' });
  }
});

app.get('/api/tournaments/:id/standings', requireAuth, async (req, res) => {
  try {
    const tournamentId = routeParam(req, 'id');
    const tournamentResult = await manager.loadTournament(tournamentId);
    if (!tournamentResult.success || !tournamentResult.data || !await canViewTournamentResults(req, tournamentResult.data)) return res.status(req.auth!.role === 'competitor' ? 403 : 404).json({ error: req.auth!.role === 'competitor' ? 'Tournament results are not published' : 'Tournament not found' });
    const result = await manager.getStandings(tournamentId);
    if (!result.success) return res.status(400).json({ error: String(result.error) });
    res.json(result.data);
  } catch (error) {
    console.error('Tournament standings lookup failed:', error);
    res.status(500).json({ error: 'Unable to load standings' });
  }
});

app.get('/api/tournaments/:id/stats', requireAuth, async (req, res) => {
  try {
    const tournamentId = routeParam(req, 'id');
    const tournamentResult = await manager.loadTournament(tournamentId);
    if (!tournamentResult.success || !tournamentResult.data || !await canViewTournamentResults(req, tournamentResult.data)) return res.status(req.auth!.role === 'competitor' ? 403 : 404).json({ error: req.auth!.role === 'competitor' ? 'Tournament results are not published' : 'Tournament not found' });
    const result = await manager.getStats(tournamentId);
    if (!result.success) return res.status(400).json({ error: String(result.error) });
    res.json(result.data);
  } catch (error) {
    console.error('Tournament statistics lookup failed:', error);
    res.status(500).json({ error: 'Unable to load tournament statistics' });
  }
});

// Ephemeral, organizer-only live match projection. Official replay data is
// still loaded through the integrity-checked replay endpoint below.
app.get('/api/tournaments/:id/matches/:matchId/live', requireAuth, requireRole('organizer'), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const tournamentId = routeParam(req, 'id');
    const matchId = routeParam(req, 'matchId');
    const tournament = await ownedTournament(tournamentId, req.auth!.id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const resolved = resolveLivePairing(tournament, matchId);
    if (!resolved) return res.status(404).json({ error: 'Match does not belong to this tournament' });
    const { pairing, matchId: liveMatchId } = resolved;
    const snapshot = manager.getLiveMatchSnapshot(tournamentId, liveMatchId);
    if (!snapshot) return res.json({ matchId, tournamentId, status: 'unavailable' });
    const participantA = tournament.participants.find(item => item.participantId === pairing.participantA);
    const participantB = pairing.participantB ? tournament.participants.find(item => item.participantId === pairing.participantB) : undefined;
    const progress = pairing.seriesProgress;
    const seriesComplete = Boolean(progress && (
      progress.games.length >= progress.bestOf || progress.winsA >= 2 || progress.winsB >= 2
    ));
    const completedWinner = pairing.matchResult?.winner;
    const currentGame = progress
      ? (snapshot.gameNumber ?? (pairing.status === 'in_progress'
        ? Math.min(progress.games.length + 1, progress.bestOf)
        : Math.max(progress.games.length, 1))) as 1 | 2 | 3
      : 1;
    const currentSides = progress && participantA && participantB
      ? getSeriesSides(progress.seed, currentGame, participantA.participantId, participantB.participantId)
      : { playerA: pairing.participantA, playerB: pairing.participantB };
    const sideParticipantA = tournament.participants.find(item => item.participantId === currentSides.playerA);
    const sideParticipantB = currentSides.playerB
      ? tournament.participants.find(item => item.participantId === currentSides.playerB)
      : undefined;
    const liveParticipant = (participant: typeof sideParticipantA) => {
      if (!participant) return null;
      const botRecord = botRepository.findById(participant.bot.botId);
      return {
        participantId: participant.participantId,
        participantName: participant.name,
        botId: participant.bot.botId,
        ...(botRecord?.name ? { botName: botRecord.name } : {}),
        ...(participant.bot.execution?.kind === 'source-revision' ? {
          runtimeId: participant.bot.execution.runtimeId,
          revisionId: participant.bot.execution.revisionId,
        } : {}),
      };
    };
    const series = progress ? {
      format: progress.format,
      bestOf: progress.bestOf,
      // A completed game can briefly remain the latest snapshot while the
      // next BO3 game is starting. Durable pairing state identifies the
      // actual current game during that transition.
      currentGame,
      nextGame: Math.min(progress.games.length + 1, progress.bestOf),
      winsA: progress.winsA,
      winsB: progress.winsB,
      gamesPlayed: progress.games.length,
      active: pairing.status === 'in_progress' && !seriesComplete,
    } : {
      format: 'bo1' as const,
      bestOf: 1,
      currentGame: 1,
      winsA: completedWinner === 'A' ? 1 : 0,
      winsB: completedWinner === 'B' ? 1 : 0,
      gamesPlayed: snapshot.status === 'finished' ? 1 : 0,
      active: false,
      nextGame: 1,
    };
    return res.json({
      ...snapshot,
      matchId: liveMatchId,
      tournamentId,
      history: manager.getLiveMatchHistory(tournamentId, liveMatchId),
      series,
      participants: {
        A: liveParticipant(sideParticipantA),
        B: liveParticipant(sideParticipantB),
      },
    });
  } catch (error) {
    console.error('Live match lookup failed:', error);
    return res.status(500).json({ error: 'Unable to load live match' });
  }
});

// ---------------------------------------------------------
// REPLAYS API
// ---------------------------------------------------------
app.get('/api/tournaments/:id/results/:matchId', requireAuth, async (req, res) => {
  try {
    const tournamentId = routeParam(req, 'id');
    const tournamentResult = await manager.loadTournament(tournamentId);
    if (!tournamentResult.success || !tournamentResult.data || !await canViewTournamentResults(req, tournamentResult.data)) return res.status(404).json({ error: 'Tournament not found' });
    const matchId = routeParam(req, 'matchId');
    const resolved = resolveLivePairing(tournamentResult.data, matchId);
    if (!resolved) {
      return res.status(404).json({ error: 'Match does not belong to this tournament' });
    }
    const result = await manager.getMatchResult(tournamentId, resolved.matchId);
    if (!result.success || !result.data) return res.status(404).json({ error: 'Match result not found' });
    if (req.auth!.role === 'organizer') {
      res.json(result.data);
    } else {
      const { executionDiagnostics: _diagnostics, ...publicResult } = result.data;
      res.json(publicResult);
    }
  } catch (error) {
    console.error('Match result lookup failed:', error);
    res.status(500).json({ error: 'Unable to load match result' });
  }
});

function spectatorRateLimit(req: express.Request, res: express.Response, tournamentId: string, matchId: string): boolean {
  const configured = Number(process.env.SPECTATOR_MAX_REQUESTS_PER_WINDOW ?? 900);
  const maxRequests = Number.isFinite(configured) && configured > 0 ? Math.max(60, Math.floor(configured)) : 900;
  const result = rateLimitRepository.recordAttempt(`spectator:${req.auth!.id}:${req.ip}:${tournamentId}:${matchId}`, maxRequests, 10_000);
  if (result.allowed) return true;
  const retryAfter = result.lockedUntil ? Math.max(1, Math.ceil((new Date(result.lockedUntil).getTime() - Date.now()) / 1000)) : 10;
  res.set('Retry-After', String(retryAfter));
  res.status(429).json({ error: 'Spectator polling rate limit exceeded', retryAfterMs: retryAfter * 1000 });
  return false;
}

function findPairing(tournament: Tournament, matchId: string) {
  return tournament.rounds.flatMap(round => round.pairings).find(pairing => pairing.matchId === matchId) ?? null;
}

function stablePairingMatchId(tournamentId: string, pairingId: string): string {
  const candidate = `${tournamentId}-${pairingId}`;
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(candidate)
    ? candidate
    : `m-${createHash('sha256').update(candidate).digest('hex')}`;
}

function resolveLivePairing(tournament: Tournament, requestedId: string) {
  const pairing = tournament.rounds.flatMap(round => round.pairings).find(item =>
    item.matchId === requestedId || item.pairingId === requestedId
      || stablePairingMatchId(tournament.tournamentId, item.pairingId) === requestedId,
  ) ?? null;
  return pairing ? { pairing, matchId: pairing.matchId ?? stablePairingMatchId(tournament.tournamentId, pairing.pairingId) } : null;
}

async function authorizedSpectatorTournament(req: express.Request, tournamentId: string) {
  const result = await manager.loadTournament(tournamentId);
  if (!result.success || !result.data) return null;
  return result.data;
}

app.get('/api/tournaments/:id/spectator/matches/:matchId/live', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store, private');
  try {
    const tournamentId = routeParam(req, 'id');
    const matchId = routeParam(req, 'matchId');
    if (!spectatorRateLimit(req, res, tournamentId, matchId)) return;
    const tournament = await authorizedSpectatorTournament(req, tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    if (tournament.status !== 'running') return res.json({ tournamentId, matchId, status: 'unavailable', reason: 'tournament_not_running' });
    const resolved = resolveLivePairing(tournament, matchId);
    if (!resolved) return res.status(404).json({ error: 'Tournament not found' });
    const { pairing, matchId: liveMatchId } = resolved;
    const snapshot = manager.getLiveMatchSnapshot(tournamentId, liveMatchId);
    const history = manager.getLiveMatchHistory(tournamentId, liveMatchId);
    const replay = await manager.getReplay(tournamentId, liveMatchId);
    const replayAvailable = replay.success;
    res.json(projectSpectatorLive({
      tournament, pairing, snapshot, history, replayAvailable,
    }));
  } catch (error) {
    console.error('Spectator live lookup failed:', error);
    res.status(500).json({ error: 'Unable to load spectator data' });
  }
});

// One server-timed live stream per match. All spectators receive the same
// ordered snapshots instead of independently advancing local polling queues.
app.get('/api/tournaments/:id/spectator/matches/:matchId/live/stream', requireAuth, async (req, res) => {
  const tournamentId = routeParam(req, 'id');
  const matchId = routeParam(req, 'matchId');
  if (!spectatorRateLimit(req, res, tournamentId, matchId)) return;
  const tournament = await authorizedSpectatorTournament(req, tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  if (tournament.status !== 'running') {
    return res.status(200).json({ tournamentId, matchId, status: 'unavailable', reason: 'tournament_not_running' });
  }
  const initialResolved = resolveLivePairing(tournament, matchId);
  if (!initialResolved) return res.status(404).json({ error: 'Tournament not found' });
  const liveMatchId = initialResolved.matchId;

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, private',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const write = (payload: unknown) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const emitSnapshot = async (snapshot: NonNullable<ReturnType<typeof manager.getLiveMatchSnapshot>>) => {
    const current = await authorizedSpectatorTournament(req, tournamentId);
    const resolved = current ? resolveLivePairing(current, liveMatchId) : null;
    const pairing = resolved?.pairing ?? null;
    if (!current || !pairing) return;
    const replay = await manager.getReplay(tournamentId, liveMatchId);
    write(projectSpectatorLive({
      tournament: current,
      pairing,
      snapshot,
      history: manager.getLiveMatchHistory(tournamentId, liveMatchId),
      replayAvailable: replay.success,
    }));
  };
  let emitChain = Promise.resolve();
  const enqueueSnapshot = (snapshot: NonNullable<ReturnType<typeof manager.getLiveMatchSnapshot>>) => {
    emitChain = emitChain.then(() => emitSnapshot(snapshot)).catch(() => undefined);
  };
  const unsubscribe = manager.subscribeLiveMatch(tournamentId, liveMatchId, enqueueSnapshot);
  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    res.write(': heartbeat\n\n');
  }, 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
  const snapshot = manager.getLiveMatchSnapshot(tournamentId, liveMatchId);
  if (snapshot) {
    enqueueSnapshot(snapshot);
    await emitChain;
  }
  else write({ tournamentId, matchId, status: 'unavailable' });
});

app.get('/api/tournaments/:id/spectator/matches/:matchId/replay', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store, private');
  try {
    const tournamentId = routeParam(req, 'id');
    const matchId = routeParam(req, 'matchId');
    const tournament = await authorizedSpectatorTournament(req, tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const resolved = resolveLivePairing(tournament, matchId);
    const pairing = resolved?.pairing ?? null;
    if (!pairing || pairing.status !== 'completed') return res.status(404).json({ error: 'Replay not found' });
    const isOwner = tournament.metadata?.ownerId === req.auth!.id;
    if (!isOwner && (!tournament.resultsPublishedAt || tournament.status !== 'completed')) {
      return res.status(404).json({ error: 'Replay not found' });
    }
    const result = await manager.getReplay(tournamentId, resolved!.matchId);
    if (!result.success || !result.data) return res.status(404).json({ error: 'Replay not found' });
    res.json(projectSpectatorReplay(result.data));
  } catch (error) {
    console.error('Spectator replay lookup failed:', error);
    res.status(404).json({ error: 'Replay not found' });
  }
});

app.get('/api/tournaments/:id/replays/:matchId', requireAuth, async (req, res) => {
  try {
    // 5. Validate replay and match IDs against parent tournament
    const tournamentId = routeParam(req, 'id');
    const matchId = routeParam(req, 'matchId');
    const tournamentResult = await manager.loadTournament(tournamentId);
    if (!tournamentResult.success || !tournamentResult.data || !await canViewTournamentResults(req, tournamentResult.data)) {
      return res.status(req.auth!.role === 'competitor' ? 403 : 404).json({ error: req.auth!.role === 'competitor' ? 'Tournament results are not published' : 'Tournament not found' });
    }
    const tournament = tournamentResult.data;

    const resolved = resolveLivePairing(tournament, matchId);
    if (!resolved) {
      return res.status(404).json({ error: 'Match does not belong to this tournament' });
    }

    const result = await manager.getReplay(tournamentId, resolved.matchId);
    if (!result.success) return res.status(404).json({ error: 'Replay not found' });
    const replay = result.data;
    if (replay && req.auth?.role !== 'organizer' && replay.metadata?.executionDiagnostics) {
      replay.metadata = { ...replay.metadata, executionDiagnostics: undefined };
    }
    if (replay && req.auth?.role === 'organizer' && tournament.metadata?.ownerId === req.auth.id && replay.participantIdentities) {
      const participantIdentities = Object.fromEntries(
        Object.entries(replay.participantIdentities).map(([side, identity]) => {
          if (!identity?.botId) return [side, identity];
          const bot = botRepository.findById(identity.botId);
          return [side, bot ? { ...identity, botName: bot.name } : identity];
        }),
      );
      res.json({ ...replay, participantIdentities });
      return;
    }
    res.json(replay);
  } catch (error) {
    console.error('Replay lookup failed:', error);
    res.status(500).json({ error: 'Unable to load replay' });
  }
});

// ---------------------------------------------------------
// QUEUE STATS
// ---------------------------------------------------------
app.get('/api/system/queue', requireAuth, requireRole('organizer'), async (req, res) => {
  const taskId = typeof req.query.id === 'string' ? req.query.id : undefined;
  if (taskId && !taskId.startsWith('run_all_')) {
    return res.status(400).json({ error: 'A tournament queue task id is required' });
  }
  if (taskId) {
    const tournamentId = taskId.slice('run_all_'.length);
    if (!tournamentId || !await ownedTournament(tournamentId, req.auth!.id)) {
      return res.status(404).json({ error: 'Tournament queue task not found' });
    }
  }
  const stats = queueStatsForOrganizer(req.auth!.id);
  res.json({
    ...stats,
    taskId: taskId ?? null,
    status: taskId ? executionQueue.getStatus(taskId) : null,
  });
});

// Error handling fallback
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const status = err.status || 500;
  if (status !== 404 && status !== 413 && status !== 400) {
    console.error('API Error:', err);
  }
  const message = status === 400 ? 'Invalid request' : status === 413 ? 'Request entity too large' : 'Internal Server Error';
  res.status(status).json({ error: message });
});

export const appExport = app; // Exported for testing

const PORT = process.env.PORT || 3000;

export function isDirectExecution(moduleUrl: string, argv1 = process.argv[1]): boolean {
  if (!argv1) return false;
  try {
    const modulePath = path.resolve(fileURLToPath(moduleUrl));
    const invokedPath = path.resolve(argv1);
    return process.platform === 'win32'
      ? modulePath.toLowerCase() === invokedPath.toLowerCase()
      : modulePath === invokedPath;
  } catch {
    return false;
  }
}

export async function startServer(port: string | number = PORT): Promise<Server> {
  await initServer();
  return await new Promise<Server>((resolve, reject) => {
    const server = app.listen(port);
    const onError = (error: Error) => {
      server.close();
      closeServer();
      reject(error);
    };
    server.once('error', onError);
    server.once('listening', () => {
      server.off('error', onError);
      console.log(`Server listening on http://localhost:${port}`);
      // Disposable Windows E2E runs need to prove that their child process,
      // rather than a stale listener, owns the endpoint. This is deliberately
      // a log-only handshake gated to test mode; it is not a production API.
      if (process.env.NODE_ENV?.trim().toLowerCase() === 'test' && process.env.E2E_SERVER_ID) {
        console.log(JSON.stringify({
          type: 'e2e-server-ready',
          id: process.env.E2E_SERVER_ID,
          pid: process.pid,
          port: Number(port),
          dataDir: path.resolve(process.env.TOURNAMENT_DATA_DIR ?? path.join(projectRoot, 'data/tournaments')),
        }));
      }
      resolve(server);
    });
  });
}

// Only start server if run directly (not imported for tests)
if (isDirectExecution(import.meta.url)) {
  startServer().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to start server: ${message}`);
    process.exit(1);
  });
}
