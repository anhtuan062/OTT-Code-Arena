import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(path.join(tmpdir(), 'ott-m7-cdp-diag-'));
const browser = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run',
  '--disable-background-networking', '--disable-dev-shm-usage', '--remote-debugging-port=0',
  '--enable-logging=stderr', '--v=1',
  `--user-data-dir=${profile}`, 'data:text/html,<title>M7 CDP diagnostic</title><main id="probe">CDP OK</main>',
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let stderr = '';
browser.stderr.on('data', chunk => { stderr += chunk.toString(); });
let socket;
let browserSocket;
let nextId = 0;
const pending = new Map();
let pageFrameCount = 0;
const pageFrameSamples = [];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(callback, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null) throw new Error(`Chrome exited ${browser.exitCode}: ${stderr.slice(-1000)}`);
    const result = await callback();
    if (result) return result;
    await sleep(100);
  }
  throw new Error('diagnostic timeout');
}
function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
function browserCommand(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: browser ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    browserSocket.send(JSON.stringify({ id, method, params }));
  });
}
function browserSessionCommand(method, params, sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: browser session ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    browserSocket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

try {
  const devtoolsPort = await waitFor(async () => {
    try { return Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]) || null; } catch { return null; }
  });
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const targets = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`)).json();
  const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
  console.log(JSON.stringify({ chromePath, browser: version.Browser, protocolVersion: version['Protocol-Version'], devtoolsPort, targetCount: targets.length, target: target ? { type: target.type, url: target.url, title: target.title } : null }));
  if (!target) throw new Error('No page WebSocket target');

  browserSocket = new WebSocket(version.webSocketDebuggerUrl);
  browserSocket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const task = pending.get(message.id); clearTimeout(task.timer); pending.delete(message.id);
    message.error ? task.reject(new Error(`${message.error.code}: ${message.error.message}`)) : task.resolve(message.result);
  });
  await new Promise((resolve, reject) => { browserSocket.addEventListener('open', resolve, { once: true }); browserSocket.addEventListener('error', reject, { once: true }); });
  console.log('browser websocket: open');
  console.log('Browser.getVersion:', JSON.stringify(await browserCommand('Browser.getVersion')));
  const browserTargets = await browserCommand('Target.getTargets');
  console.log('Target.getTargets:', JSON.stringify(browserTargets));
  const attached = await browserCommand('Target.attachToTarget', { targetId: browserTargets.targetInfos.find(item => item.type === 'page').targetId, flatten: true });
  console.log('Target.attachToTarget:', JSON.stringify(attached));
  console.log('Target.attachToTarget: session established');

  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    pageFrameCount += 1;
    if (pageFrameSamples.length < 5) pageFrameSamples.push({ type: typeof event.data, id: message.id ?? null, method: message.method ?? null, hasResult: Boolean(message.result), hasError: Boolean(message.error) });
    if (!message.id || !pending.has(message.id)) return;
    const task = pending.get(message.id); clearTimeout(task.timer); pending.delete(message.id);
    message.error ? task.reject(new Error(`${message.error.code}: ${message.error.message}`)) : task.resolve(message.result);
  });
  socket.addEventListener('error', () => {});
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  console.log('websocket: open');
  for (const [method, params] of [
    ['Page.enable', {}],
    ['Runtime.enable', {}],
    ['Runtime.evaluate', { expression: '({ title: document.title, text: document.querySelector("#probe")?.textContent, width: innerWidth })', returnByValue: true }],
    ['Page.captureScreenshot', { format: 'png', fromSurface: true }],
  ]) {
    try {
      const result = await command(method, params);
      console.log(`${method}:`, method === 'Runtime.evaluate' ? JSON.stringify(result.result?.value) : method === 'Page.captureScreenshot' ? JSON.stringify({ format: 'png', base64Bytes: result.data?.length ?? 0 }) : 'OK');
    } catch (error) { console.log(`${method} ERROR:`, error.message); }
  }
  console.log('FAIL: minimal Chrome/CDP diagnostic');
} finally {
  console.log('page frames:', JSON.stringify({ count: pageFrameCount, samples: pageFrameSamples }));
  console.log('chrome state:', JSON.stringify({ exitCode: browser.exitCode, signalCode: browser.signalCode, stderrTail: stderr.slice(-1200) }));
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('diagnostic cleanup')); }
  try { if (socket?.readyState === 1) socket.send(JSON.stringify({ id: ++nextId, method: 'Browser.close' })); } catch {}
  socket?.close();
  browserSocket?.close();
  if (browser.exitCode === null) browser.kill();
  await rm(profile, { recursive: true, force: true });
}
