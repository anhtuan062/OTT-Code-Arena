import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createControlledAccount } from '../dist/server/admin/role-bootstrap.js';
import { FileTournamentRepository, createTournament } from '../dist/tournament/persistence.js';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const password = 'M7 Browser QA Password!';
const root = await mkdtemp(path.join(tmpdir(), 'ott-m7-browser-'));
const dataDir = path.join(root, 'tournaments');
const dbPath = path.join(dataDir, 'arena.sqlite');
const profile = path.join(root, 'chrome-profile');
const organizerUsername = 'm7browserowner';
const competitorUsername = 'm7browseruser';
const port = 3471;

await createControlledAccount(dbPath, organizerUsername, password, 'organizer');
await createControlledAccount(dbPath, competitorUsername, password, 'competitor');
const repository = new FileTournamentRepository({ baseDir: dataDir });
await repository.initialize();
const tournament = createTournament('m7-browser-running', 'M7 Browser Running', 'single_round_robin');
tournament.metadata = { ownerId: (await import('../dist/server/repositories/user-repository.js')).SqlUserRepository ? undefined : undefined };
// Ownership is resolved through the organizer account created above. The API
// list remains empty if this fixture cannot resolve an owner, which is safe.
const userDb = await import('../dist/server/db.js');
const db = await userDb.initializeDatabase({ path: dbPath });
const { SqlUserRepository } = await import('../dist/server/repositories/user-repository.js');
const owner = new SqlUserRepository(db).findByUsername(organizerUsername);
db.close();
tournament.metadata = { ownerId: owner.id };
tournament.status = 'running';
tournament.startedAt = new Date().toISOString();
tournament.rounds = [{ roundNumber: 1, pairings: [
  { pairingId: 'm7-p1-v-m7-p2-r1', roundNumber: 1, participantA: 'm7-p1', participantB: 'm7-p2', status: 'completed', matchId: 'm7-match-1', matchResult: { winner: 'A' }, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
  { pairingId: 'm7-p3-v-m7-p4-r1', roundNumber: 1, participantA: 'm7-p3', participantB: 'm7-p4', status: 'scheduled', matchId: 'm7-match-2', matchResult: null, startedAt: null, completedAt: null },
] }];
await repository.save(tournament);
repository.close();

const server = spawn(process.execPath, ['dist/server/index.js'], {
  cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'test', EXECUTION_POLICY: 'development', ENABLE_QA_FIXTURES: 'false', PORT: String(port), TOURNAMENT_DATA_DIR: dataDir },
});
let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

let socket;
let browserProcess;
let nextId = 0;
const pending = new Map();
const command = (method, params = {}) => {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(100);
  }
  throw new Error('Timed out waiting for browser condition');
}
async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Browser evaluation failed');
  return response.result?.value;
}

try {
  await waitFor(async () => {
    if (server.exitCode !== null) throw new Error(`QA server exited ${server.exitCode}: ${serverOutput.slice(-1000)}`);
    return serverOutput.includes(`Server listening on http://localhost:${port}`);
  });
  browserProcess = spawn(chromePath, ['--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--disable-extensions', '--disable-dev-shm-usage', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let browserError = '';
  browserProcess.stderr.on('data', chunk => { browserError += chunk.toString(); });
  const devtoolsPort = await waitFor(async () => {
    if (browserProcess.exitCode !== null) throw new Error(`Chrome exited ${browserProcess.exitCode}: ${browserError.slice(-1000)}`);
    try {
      const fs = await import('node:fs/promises');
      const content = await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8');
      return Number(content.split(/\r?\n/)[0]) || null;
    } catch { return null; }
  });
  const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`)).json()).find(item => item.type === 'page'));
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const task = pending.get(message.id); clearTimeout(task.timer); pending.delete(message.id);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  await command('Page.enable'); await command('Runtime.enable');
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    window.__m7FetchLog = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const path = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const started = performance.now();
      try { const response = await originalFetch(...args); window.__m7FetchLog.push({ path, status: response.status, at: performance.now(), duration: performance.now() - started }); return response; }
      catch (error) { window.__m7FetchLog.push({ path, status: 0, at: performance.now(), error: String(error) }); throw error; }
    };
  })();` });
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await waitFor(async () => await evaluate('Boolean(document.querySelector("#login-form"))'));

  await evaluate(`(async () => {
    document.querySelector('#login-username').value = ${JSON.stringify(organizerUsername)};
    document.querySelector('#login-password').value = ${JSON.stringify(password)};
    document.querySelector('#login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await waitFor(async () => await evaluate('Boolean(window.state?.user?.role === "organizer")'));
  await evaluate(`location.hash = '#operations'`);
  await waitFor(async () => await evaluate('document.querySelector("#operations")?.classList.contains("active")'));
  await waitFor(async () => await evaluate('document.querySelector("#ops-capacity-state")?.textContent !== "Unavailable"'));
  const organizerView = await evaluate(`({
    role: state.user.role,
    capacity: document.querySelector('#ops-capacity-state')?.textContent,
    cpu: document.querySelector('#ops-cpu')?.textContent,
    preflightUnavailable: document.querySelector('#ops-preflight-wait')?.textContent === '—',
    tournamentVisible: document.querySelector('#ops-tournaments')?.textContent.includes('M7 Browser Running'),
    overflow: document.documentElement.scrollWidth > innerWidth,
  })`);
  if (organizerView.role !== 'organizer' || !organizerView.capacity || organizerView.cpu === '—' || !organizerView.preflightUnavailable || !organizerView.tournamentVisible || organizerView.overflow) throw new Error(`Organizer dashboard invalid: ${JSON.stringify(organizerView)}`);

  await sleep(5600);
  const firstPoll = await evaluate(`window.__m7FetchLog.filter(item => item.path.includes('/api/system/metrics')).length`);
  if (firstPoll < 2) throw new Error(`Expected 5-second metrics polling, got ${firstPoll}`);
  await sleep(9500);
  const tournamentPoll = await evaluate(`window.__m7FetchLog.filter(item => item.path.includes('/api/tournaments')).length`);
  if (tournamentPoll < 2) throw new Error(`Expected 15-second tournament polling, got ${tournamentPoll}`);

  await evaluate(`location.hash = '#dashboard'`); await sleep(7000);
  const afterLeave = await evaluate(`window.__m7FetchLog.filter(item => item.path.includes('/api/system/metrics')).length`);
  if (afterLeave !== firstPoll + 1) throw new Error(`Metrics polling did not stop after leaving view: ${firstPoll} -> ${afterLeave}`);
  await evaluate(`location.hash = '#operations'`); await waitFor(async () => await evaluate('document.querySelector("#operations")?.classList.contains("active")'));
  await evaluate(`location.hash = '#dashboard'; location.hash = '#operations'`); await sleep(5600);
  const repeatedMetrics = await evaluate(`window.__m7FetchLog.filter(item => item.path.includes('/api/system/metrics')).length`);
  if (repeatedMetrics - afterLeave > 2) throw new Error(`Repeated navigation created duplicate polling: ${repeatedMetrics - afterLeave} requests`);

  await evaluate(`document.querySelector('#logout-button').click()`); await waitFor(async () => await evaluate('!state.user'));
  const beforeLogoutWait = await evaluate(`window.__m7FetchLog.filter(item => item.path.includes('/api/system/metrics')).length`); await sleep(6000);
  const afterLogoutWait = await evaluate(`window.__m7FetchLog.filter(item => item.path.includes('/api/system/metrics')).length`);
  if (beforeLogoutWait !== afterLogoutWait) throw new Error(`Polling continued after logout: ${beforeLogoutWait} -> ${afterLogoutWait}`);
  const unauthStatus = await evaluate(`fetch('/api/system/metrics').then(response => response.status)`);
  if (unauthStatus !== 401) throw new Error(`Unauthenticated metrics status was ${unauthStatus}`);

  await evaluate(`document.querySelector('#show-login').click(); document.querySelector('#login-username').value = ${JSON.stringify(competitorUsername)}; document.querySelector('#login-password').value = ${JSON.stringify(password)}; document.querySelector('#login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
  await waitFor(async () => await evaluate('Boolean(state.user?.role === "competitor")'));
  await evaluate(`location.hash = '#operations'`); await sleep(1000);
  const competitorView = await evaluate(`({ role: state.user?.role, active: state.activeView, metrics200: window.__m7FetchLog.some(item => item.path.includes('/api/system/metrics') && item.status === 200) })`);
  if (competitorView.role !== 'competitor' || competitorView.active === 'operations' || competitorView.metrics200) throw new Error(`Competitor accessed operations: ${JSON.stringify(competitorView)}`);

  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await evaluate(`location.hash = '#auth-screen'`);
  const mobile = await evaluate(`({ overflow: document.documentElement.scrollWidth > innerWidth, width: innerWidth })`);
  if (mobile.overflow || mobile.width !== 375) throw new Error(`Mobile shell overflow: ${JSON.stringify(mobile)}`);
  await command('Emulation.clearDeviceMetricsOverride');
  console.log(JSON.stringify({ organizerView, firstMetricsPolls: firstPoll, tournamentPolls: tournamentPoll, afterLeaveMetrics: afterLeave, repeatedMetrics, unauthStatus, competitorView, mobile }));
  console.log('PASS: isolated M7 browser E2E');
} finally {
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('Browser closed')); }
  try { if (socket?.readyState === 1) { socket.send(JSON.stringify({ id: ++nextId, method: 'Browser.close' })); await sleep(200); } } catch {}
  socket?.close();
  if (browserProcess?.exitCode === null) browserProcess.kill();
  server.kill();
  await rm(root, { recursive: true, force: true });
}
