import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTournamentManager } from '../tournament/manager.js';
import { createExecutor, clearExecutorCache } from '../bot-executor/index.js';
import { configuredDockerImage } from '../bot-executor/image-config.js';
import { createExecutionQueue } from '../bot-executor/execution-queue.js';
import * as fs from 'fs/promises';
import { existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { closeSharedDatabase, initializeDatabase, setSharedDatabase } from './db.js';
import { SqlBotRepository, type BotRecord } from './repositories/bot-repository.js';
import { SqlUserRepository } from './repositories/user-repository.js';
import { SqlSessionRepository } from './repositories/session-repository.js';
import { SqlRateLimitRepository } from './repositories/rate-limit-repository.js';
import type { ExecutionPolicy } from '../bot-executor/types.js';
import type { Server } from 'node:http';

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
// Serve static icons if they were separate, but they are embedded in index.html

// Initialize singleton Tournament Manager
let manager: Awaited<ReturnType<typeof createTournamentManager>>;
let executionQueue = createExecutionQueue({ maxConcurrent: 2, maxQueueLength: 50 });
let botRepository: SqlBotRepository;
let userRepository: SqlUserRepository;
let sessionRepository: SqlSessionRepository;
let rateLimitRepository: SqlRateLimitRepository;
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
  closeSharedDatabase();
  try {
    const db = await initializeDatabase({ path: path.join(dir, 'arena.sqlite') });
    setSharedDatabase(db);
    botRepository = new SqlBotRepository(db);
    userRepository = new SqlUserRepository(db);
    sessionRepository = new SqlSessionRepository(db, SESSION_TTL_MS);
    rateLimitRepository = new SqlRateLimitRepository(db);
    sessionRepository.deleteExpired();
    manager = await createTournamentManager(dir, undefined, executionPolicy);
    console.log(`Tournament Manager initialized with ${executionPolicy} policy`);
  } catch (error) {
    closeSharedDatabase();
    executionQueue.cancelAll();
    throw error;
  }
}

export function closeServer(): void {
  executionQueue.cancelAll();
  activeTournamentRuns.clear();
  closeSharedDatabase();
}

// ---------------------------------------------------------
// BOTS API
// ---------------------------------------------------------
function parseCookies(req: express.Request): Record<string, string> {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(v => v.trim().split(/=(.*)/s)).filter(v => v[0]).map(([key, value]) => [key!, decodeURIComponent(value || '')]));
}
declare global { namespace Express { interface Request { auth?: { id: string; username: string; token: string; csrf: string }; } } }
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = parseCookies(req)[SESSION_COOKIE];
  const session = token && sessionRepository.findByToken(token);
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) return res.status(401).json({ error: 'Authentication required' });
  const user = userRepository.findById(session.user_id);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.auth = { id: user.id, username: user.username, token, csrf: session.csrf_token };
  sessionRepository.touch(session.id);
  next();
}
function requireCsrf(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.get('x-csrf-token') !== req.auth?.csrf) return res.status(403).json({ error: 'Invalid CSRF token' });
  next();
}
function apiBot(bot: BotRecord) { return { id: bot.id, name: bot.name, command: bot.command, args: bot.args, registeredAt: bot.registered_at }; }
function routeParam(req: express.Request, name: string): string { const value = req.params[name]; return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
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
    res.status(201).json({ user: { id: user.id, username: user.username }, csrfToken });
  } catch (error: any) { if (error?.code?.startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'Username unavailable' }); res.status(500).json({ error: 'Unable to register' }); }
});
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const normalizedUsername = typeof username === 'string' ? username.toLowerCase() : '';
  const key = `login:${req.ip}:${normalizedUsername.slice(0, 64)}`;
  if (!rateLimitRepository.check(key, 5, 900000).allowed) return res.status(429).json({ error: 'Too many attempts' });
  const user = typeof username === 'string' ? userRepository.findByUsername(username) : null;
  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.password_hash))) { rateLimitRepository.recordAttempt(key, 5, 900000); return res.status(401).json({ error: 'Invalid username or password' }); }
  const token = randomBytes(32).toString('base64url'); const csrfToken = randomBytes(32).toString('base64url'); userRepository.setLastLogin(user.id);
  sessionRepository.create({ userId: user.id, token, csrfToken, userAgent: req.get('user-agent'), ip: req.ip });
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: production, maxAge: SESSION_TTL_MS, path: '/' }); res.json({ user: { id: user.id, username: user.username }, csrfToken });
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: { id: req.auth!.id, username: req.auth!.username }, csrfToken: req.auth!.csrf }));
app.post('/api/auth/logout', requireAuth, requireCsrf, (req, res) => { sessionRepository.deleteByToken(req.auth!.token); res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: production, path: '/' }); res.status(204).end(); });

app.get('/api/bots', requireAuth, (req, res) => {
  res.json(botRepository.listByOwner(req.auth!.id).map(apiBot));
});

app.post('/api/bots', requireAuth, requireCsrf, (req, res) => {
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
app.get('/api/bots/:id', requireAuth, (req, res) => {
  const bot = botRepository.findById(routeParam(req, 'id'));
  if (!bot || bot.owner_id !== req.auth!.id) return res.status(404).json({ error: 'Bot not found' });
  res.json(apiBot(bot));
});
app.put('/api/bots/:id', requireAuth, requireCsrf, (req, res) => {
  const input = validateBotInput(req.body);
  if (!input) return res.status(400).json({ error: 'Invalid bot configuration' });
  const bot = botRepository.update(routeParam(req, 'id'), req.auth!.id, input);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  res.json(apiBot(bot));
});
app.delete('/api/bots/:id', requireAuth, requireCsrf, (req, res) => {
  if (!botRepository.delete(routeParam(req, 'id'), req.auth!.id)) return res.status(404).json({ error: 'Bot not found' });
  res.status(204).end();
});

// ---------------------------------------------------------
// TOURNAMENTS API
// ---------------------------------------------------------
async function ownedTournament(id: string, userId: string) {
  const result = await manager.loadTournament(id);
  return result.success && result.data?.metadata?.ownerId === userId ? result.data : null;
}
app.get('/api/tournaments', requireAuth, async (req, res) => {
  try {
    const tournaments = await manager.listTournaments();
    res.json(tournaments.filter(t => t.metadata?.ownerId === req.auth!.id));
  } catch (error) {
    console.error('Tournament listing failed:', error);
    res.status(500).json({ error: 'Unable to list tournaments' });
  }
});

app.post('/api/tournaments', requireAuth, requireCsrf, async (req, res) => {
  try {
    const { name, format } = req.body;
    if (!name || typeof name !== 'string' || name.length > 100 ||
        (format !== undefined && format !== 'single_round_robin')) {
      return res.status(400).json({ error: 'Invalid tournament name' });
    }

    const id = `t-${randomUUID()}`;
    const result = await manager.createTournament(id, name, format || 'single_round_robin');

    if (!result.success || !result.data) return res.status(400).json({ error: 'Unable to create tournament' });
    const metadataResult = await manager.updateMetadata(result.data.tournamentId, {
      ownerId: req.auth!.id,
      access: 'private',
    });
    if (!metadataResult.success || !metadataResult.data) return res.status(500).json({ error: 'Unable to persist tournament ownership' });
    result.data = metadataResult.data;
    res.status(201).json(result.data);
  } catch (error) {
    console.error('Tournament creation failed:', error);
    res.status(500).json({ error: 'Unable to create tournament' });
  }
});

app.get('/api/tournaments/:id', requireAuth, async (req, res) => {
  try {
    const tournament = await ownedTournament(routeParam(req, 'id'), req.auth!.id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    res.json(tournament);
  } catch (error) {
    console.error('Tournament lookup failed:', error);
    res.status(500).json({ error: 'Unable to load tournament' });
  }
});

app.post('/api/tournaments/:id/register', requireAuth, requireCsrf, async (req, res) => {
  try {
    const { botId, participantName } = req.body;
    if (typeof botId !== 'string' || typeof participantName !== 'string') {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const tournament = await ownedTournament(routeParam(req, 'id'), req.auth!.id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const bot = botRepository.findById(botId);

    if (!bot || bot.owner_id !== req.auth!.id) return res.status(404).json({ error: 'Bot not found' });
    if (!participantName) return res.status(400).json({ error: 'Participant name required' });

    const participantId = `p-${botId}-${Date.now()}`;
    const result = await manager.registerParticipant(routeParam(req, 'id'), participantId, participantName, {
      botId: bot.id,
      command: bot.command,
      args: bot.args
    });

    if (!result.success) return res.status(400).json({ error: String(result.error) });
    res.json(result.data);
  } catch (error) {
    console.error('Tournament registration failed:', error);
    res.status(500).json({ error: 'Unable to register bot' });
  }
});

// Track active tournament runs to prevent duplicate run_all tasks
const activeTournamentRuns = new Set<string>();

app.post('/api/tournaments/:id/action', requireAuth, requireCsrf, async (req, res) => {
  try {
    const { action } = req.body;
    const tournamentId = routeParam(req, 'id');
    if (!await ownedTournament(tournamentId, req.auth!.id)) return res.status(404).json({ error: 'Tournament not found' });
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

        executionQueue.submit(`run_all_${tournamentId}`, async (signal) => {
          try {
            await manager.runAllMatches(tournamentId, signal);
          } finally {
            activeTournamentRuns.delete(tournamentId);
          }
        }).catch(err => {
          if (!(err instanceof Error && err.message.includes('cancelled'))) {
            console.error(`Execution queue error for ${tournamentId}:`, err);
          }
        });

        return res.json({ message: 'Match execution started in background' });
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

app.get('/api/tournaments/:id/standings', requireAuth, async (req, res) => {
  try {
    const tournamentId = routeParam(req, 'id');
    if (!await ownedTournament(tournamentId, req.auth!.id)) return res.status(404).json({ error: 'Tournament not found' });
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
    if (!await ownedTournament(tournamentId, req.auth!.id)) return res.status(404).json({ error: 'Tournament not found' });
    const result = await manager.getStats(tournamentId);
    if (!result.success) return res.status(400).json({ error: String(result.error) });
    res.json(result.data);
  } catch (error) {
    console.error('Tournament statistics lookup failed:', error);
    res.status(500).json({ error: 'Unable to load tournament statistics' });
  }
});

// ---------------------------------------------------------
// REPLAYS API
// ---------------------------------------------------------
app.get('/api/tournaments/:id/replays/:matchId', requireAuth, async (req, res) => {
  try {
    // 5. Validate replay and match IDs against parent tournament
    const tournamentId = routeParam(req, 'id');
    const matchId = routeParam(req, 'matchId');
    const tournament = await ownedTournament(tournamentId, req.auth!.id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const matchExists = tournament.rounds.some(r => r.pairings.some(p => p.matchId === matchId));
    if (!matchExists) {
      return res.status(404).json({ error: 'Match does not belong to this tournament' });
    }

    const result = await manager.getReplay(tournamentId, matchId);
    if (!result.success) return res.status(404).json({ error: 'Replay not found' });
    res.json(result.data);
  } catch (error) {
    console.error('Replay lookup failed:', error);
    res.status(500).json({ error: 'Unable to load replay' });
  }
});

// ---------------------------------------------------------
// QUEUE STATS
// ---------------------------------------------------------
app.get('/api/system/queue', requireAuth, (req, res) => {
  res.json(executionQueue.getStats());
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
