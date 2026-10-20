import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const childSource = String.raw`
import * as readline from 'node:readline';
import { FileTournamentRepository } from './dist/tournament/persistence.js';
import { StorageOwnership } from './dist/tournament/ownership.js';
import { TournamentManager } from './dist/tournament/manager.js';
import { startServer, shutdownServer, getTournamentManager } from './dist/server/index.js';
import { createControlledAccount } from './dist/server/admin/role-bootstrap.js';

const mode = process.env.QA_MODE;
const dir = process.env.QA_DIR;
if (!dir) throw new Error('QA_DIR is required');

const send = (event, value = {}) => process.stdout.write(JSON.stringify({ event, ...value }) + '\n');
const rl = readline.createInterface({ input: process.stdin });
let cleanup;

const waitForCommand = command => new Promise(resolve => {
  const onLine = line => {
    try { const message = JSON.parse(line); if (message.command === command) { rl.off('line', onLine); resolve(message); } } catch {}
  };
  rl.on('line', onLine);
});

if (mode === 'server' || mode === 'timeout') {
  process.env.NODE_ENV = 'test';
  process.env.EXECUTION_POLICY = 'development';
  process.env.TOURNAMENT_DATA_DIR = dir;
  const server = await startServer(0);
  const port = server.address()?.port;
  send('ready', { port });
  if (mode === 'server') cleanup = async () => {
    const result = await shutdownServer(Number(process.env.QA_TIMEOUT ?? 1000));
    send('shutdown-result', result);
  };
  else {
    const manager = getTournamentManager();
    let closeCalls = 0;
    const originalManagerClose = manager.close.bind(manager);
    manager.close = async () => { closeCalls += 1; return originalManagerClose(); };
    let releaseResolver;
    const releaseGate = new Promise(resolve => { releaseResolver = resolve; });
    let executeCalls = 0;
    const executor = {
      async executeMatch(matchId, playerA, playerB) {
        executeCalls += 1;
        send('execution-entered', { matchId });
        await releaseGate;
        return {
          matchId, protocolVersion: '0.1.0', status: 'finished', winner: 'A', terminationReason: 'goal_reached',
          turnCount: 1, startTime: new Date().toISOString(), endTime: new Date().toISOString(), durationMs: 1,
          playerA: { ...playerA, player: 'A' }, playerB: { ...playerB, player: 'B' },
          finalState: { turn: 1, currentPlayer: 'A', status: 'finished', winner: 'A', winReason: 'goal_reached', pieces: [], lastMove: null, positionHistory: [] },
          initialState: { turn: 1, currentPlayer: 'A', status: 'in_progress', winner: null, winReason: null, pieces: [], lastMove: null, positionHistory: [] },
          turnLog: [],
        };
      },
      async isAvailable() { return true; },
    };
    manager.executor = executor;
    const username = 'qaorg' + process.pid;
    const password = 'correct horse battery staple';
    const account = await createControlledAccount(dir + '/arena.sqlite', username, password, 'organizer');
    const loginResponse = await fetch('http://127.0.0.1:' + port + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: account.username, password }) });
    const login = await loginResponse.json();
    const cookie = loginResponse.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
    const csrf = login.csrfToken;
    const api = async (url, body) => fetch('http://127.0.0.1:' + port + url, { method: 'POST', headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf }, body: JSON.stringify(body) });
    const created = await api('/api/tournaments', { name: 'Timeout BO3', format: 'single_round_robin' });
    const tournament = await created.json();
    const bot = id => ({ botId: id, command: 'node', args: [] });
    await manager.registerParticipant(tournament.tournamentId, 'A', 'A', bot('a'));
    await manager.registerParticipant(tournament.tournamentId, 'B', 'B', bot('b'));
    const actionUrl = '/api/tournaments/' + tournament.tournamentId + '/action';
    await api(actionUrl, { action: 'open_registration' });
    await api(actionUrl, { action: 'close_registration' });
    await api(actionUrl, { action: 'generate_schedule' });
    await api(actionUrl, { action: 'start' });
    await api(actionUrl, { action: 'run_all' });
    cleanup = async () => {
      const result = await shutdownServer(Number(process.env.QA_TIMEOUT ?? 50));
      send('shutdown-result', result);
      const probe = new (await import('./dist/tournament/ownership.js')).StorageOwnership(dir);
      let ownershipHeld = false;
      try { await probe.acquire(); probe.release(); } catch { ownershipHeld = true; }
      send('timeout-observed', { ownershipHeld, executeCalls });
      await waitForCommand('release');
      releaseResolver();
      const finalized = await shutdownServer(5_000);
      send('finalized', { ...finalized, closeCalls });
      const repository = new (await import('./dist/tournament/persistence.js')).FileTournamentRepository({ baseDir: dir });
      await repository.initialize();
      const recoveryExecutor = { calls: 0, async executeMatch() { this.calls += 1; throw new Error('completed pairing replayed'); }, async isAvailable() { return true; } };
      const recoveryManager = new (await import('./dist/tournament/manager.js')).TournamentManager({ repository, executor: recoveryExecutor });
      const recovery = await recoveryManager.runAllMatches(tournament.tournamentId);
      await recoveryManager.close();
      send('recovery-check', { success: recovery.success, calls: recoveryExecutor.calls });
    };
  }
} else if (mode === 'ownership') {
  const owner = new StorageOwnership(dir);
  await owner.acquire();
  send('ready');
  cleanup = async () => { owner.release(); send('released'); };
} else if (mode === 'bo3') {
  const repository = new FileTournamentRepository({ baseDir: dir });
  await repository.initialize();
  let releaseExecution;
  let entered = false;
  let releaseResolver;
  const releaseGate = new Promise(resolve => { releaseResolver = resolve; });
  const executor = {
    async executeMatch(matchId, playerA, playerB) {
      entered = true;
      send('execution-entered', { matchId });
      await releaseGate;
      return {
        matchId, protocolVersion: '0.1.0', status: 'finished', winner: 'A', terminationReason: 'goal_reached',
        turnCount: 1, startTime: new Date().toISOString(), endTime: new Date().toISOString(), durationMs: 1,
        playerA: { ...playerA, player: 'A' }, playerB: { ...playerB, player: 'B' },
        finalState: { turn: 1, currentPlayer: 'A', status: 'finished', winner: 'A', winReason: 'goal_reached', pieces: [], lastMove: null, positionHistory: [] },
        initialState: { turn: 1, currentPlayer: 'A', status: 'in_progress', winner: null, winReason: null, pieces: [], lastMove: null, positionHistory: [] },
        turnLog: [],
      };
    },
    async isAvailable() { return true; },
  };
  const manager = new TournamentManager({ repository, executor, defaultMatchConfig: { bestOf: 3 } });
  const created = await manager.createTournament('child-bo3', 'Child BO3');
  if (!created.success) throw new Error(created.error);
  const bot = id => ({ botId: id, command: 'node', args: [] });
  await manager.registerParticipant('child-bo3', 'A', 'A', bot('a'));
  await manager.registerParticipant('child-bo3', 'B', 'B', bot('b'));
  await manager.openRegistration('child-bo3');
  await manager.generateSchedule('child-bo3');
  await manager.startTournament('child-bo3');
  const tournament = await repository.load('child-bo3');
  const pairing = tournament?.rounds[0]?.pairings[0];
  if (!pairing) throw new Error('No pairing generated');
  const run = manager.runPairingById('child-bo3', pairing.pairingId);
  while (!entered) await new Promise(resolve => setTimeout(resolve, 5));
  send('ready');
  cleanup = async () => {
    const closing = manager.close();
    await new Promise(resolve => setTimeout(resolve, 25));
    send('close-pending');
    releaseResolver();
    await closing;
    const result = await run;
    send('closed', { success: result.success });
  };
} else throw new Error('Unknown QA_MODE');

await waitForCommand('shutdown');
await cleanup();
rl.close();
process.exitCode = 0;
`;

function startChild(mode: string, dir: string, timeout = 1000): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, ['--input-type=module', '-e', childSource], {
    cwd: path.resolve('.'),
    env: { ...process.env, QA_MODE: mode, QA_DIR: dir, QA_TIMEOUT: String(timeout), TOURNAMENT_DATA_DIR: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

async function nextEvent(child: ChildProcessWithoutNullStreams, event: string, timeout = 10_000): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    let text = '';
    let errorText = '';
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}: ${text} ${errorText}`)), timeout);
    const onData = (chunk: Buffer) => {
      text += chunk.toString();
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue;
        try {
          const message = JSON.parse(line) as Record<string, unknown>;
          if (message.event === event) { clearTimeout(timer); child.stdout.off('data', onData); resolve(message); return; }
        } catch {}
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', chunk => { errorText += chunk.toString(); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => { if (code !== null && event !== 'exit') { clearTimeout(timer); reject(new Error(`child exited ${code}/${signal}: ${text} ${errorText}`)); } });
  });
}

async function finish(child: ChildProcessWithoutNullStreams): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  child.stdin.write(JSON.stringify({ command: 'shutdown' }) + '\n');
  return await new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
}

describe('isolated child-process graceful shutdown', () => {
  let dir: string | undefined;
  const children: ChildProcessWithoutNullStreams[] = [];

  afterEach(async () => {
    for (const child of children) {
      if (child.exitCode === null) child.kill();
    }
    await Promise.all(children.map(child => child.exitCode !== null ? Promise.resolve() : new Promise<void>(resolve => child.once('exit', () => resolve()))));
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    children.length = 0;
  });

  it('shuts down an idle isolated server cleanly and deduplicates repeated requests', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-child-idle-'));
    const child = startChild('server', dir); children.push(child);
    const ready = await nextEvent(child, 'ready');
    expect(Number(ready.port)).toBeGreaterThan(0);
    child.stdin.write(JSON.stringify({ command: 'shutdown' }) + '\n');
    child.stdin.write(JSON.stringify({ command: 'shutdown' }) + '\n');
    expect(await nextEvent(child, 'shutdown-result')).toMatchObject({ closed: true, timedOut: false });
    await expect(finish(child)).resolves.toMatchObject({ code: 0 });
  }, 20_000);

  it('waits for an active mocked BO3 execution before closing storage', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-child-bo3-'));
    const child = startChild('bo3', dir); children.push(child);
    await nextEvent(child, 'execution-entered');
    await nextEvent(child, 'ready');
    child.stdin.write(JSON.stringify({ command: 'shutdown' }) + '\n');
    await expect(nextEvent(child, 'close-pending')).resolves.toBeTruthy();
    await expect(nextEvent(child, 'closed')).resolves.toMatchObject({ success: true });
    await expect(new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))).resolves.toMatchObject({ code: 0 });
  }, 20_000);

  it('times out with storage held, then finalizes once after the BO3 barrier is released', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-child-timeout-'));
    const child = startChild('timeout', dir, 50); children.push(child);
    await nextEvent(child, 'execution-entered');
    child.stdin.write(JSON.stringify({ command: 'shutdown' }) + '\n');
    await expect(nextEvent(child, 'shutdown-result')).resolves.toMatchObject({ closed: false, timedOut: true });
    await expect(nextEvent(child, 'timeout-observed')).resolves.toMatchObject({ ownershipHeld: true, executeCalls: 1 });
    child.stdin.write(JSON.stringify({ command: 'release' }) + '\n');
    await expect(nextEvent(child, 'finalized')).resolves.toMatchObject({ closed: true, timedOut: false, closeCalls: 1 });
    await expect(nextEvent(child, 'recovery-check')).resolves.toMatchObject({ success: true, calls: 0 });
    await expect(new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))).resolves.toMatchObject({ code: 0 });

    const fresh = startChild('ownership', dir); children.push(fresh);
    await nextEvent(fresh, 'ready');
    await expect(finish(fresh)).resolves.toMatchObject({ code: 0 });
  }, 30_000);

  it('releases ownership so a new isolated process can acquire the directory', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-child-owner-'));
    const first = startChild('ownership', dir); children.push(first);
    await nextEvent(first, 'ready');
    const blocked = startChild('ownership', dir); children.push(blocked);
    await expect(nextEvent(blocked, 'ready', 1_000)).rejects.toThrow();
    if (blocked.exitCode === null) blocked.kill();
    await new Promise(resolve => first.stdin.write(JSON.stringify({ command: 'shutdown' }) + '\n', resolve));
    await new Promise(resolve => first.once('exit', resolve));
    const second = startChild('ownership', dir); children.push(second);
    await nextEvent(second, 'ready');
    await expect(finish(second)).resolves.toMatchObject({ code: 0 });
  }, 20_000);

  it.skipIf(process.platform === 'win32')('documents that Windows child.kill(SIGTERM) is not treated as graceful IPC', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-child-signal-'));
    const child = startChild('server', dir); children.push(child);
    await nextEvent(child, 'ready');
    if (process.platform === 'win32') {
      expect(child.kill('SIGTERM')).toBe(true);
      const exited = await Promise.race([
        new Promise<boolean>(resolve => child.once('exit', () => resolve(true))),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 500)),
      ]);
      // Node's Windows implementation may terminate rather than deliver a
      // catchable signal; either outcome is recorded, but never treated as the
      // programmatic graceful-shutdown path.
      expect(typeof exited).toBe('boolean');
      if (!exited && child.exitCode === null) child.kill();
    } else {
      child.stdin.write(JSON.stringify({ command: 'shutdown' }) + '\n');
      await nextEvent(child, 'shutdown-result');
      await finish(child);
    }
  }, 20_000);
});
