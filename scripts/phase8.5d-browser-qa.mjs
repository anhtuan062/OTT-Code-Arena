// Isolated visual fixture: real frontend renderer, engine-generated board/move,
// and temporary headless Chrome profile. No production account or data access.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPracticeScenario, serializePracticeLegalMoves } from '../dist/practice/scenarios.js';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const evidence = await mkdtemp(path.join(tmpdir(), 'ott-phase8.5d-browser-'));
const profile = path.join(evidence, 'chrome-profile');
const browser = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
let socket;
let nextId = 0;
const pending = new Map();

async function waitUntil(callback, limitMs = 12000) {
  const until = Date.now() + limitMs;
  while (Date.now() < until) {
    if (browser.exitCode !== null) throw new Error(`Chrome exited: ${browser.exitCode}`);
    try {
      const value = await callback();
      if (value) return value;
    } catch { /* The isolated browser may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Headless Chrome did not become ready');
}

function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 12000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

try {
  const port = await waitUntil(async () => {
    const content = await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8');
    return Number(content.split(/\r?\n/)[0]) || null;
  });
  const targets = await waitUntil(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const list = await response.json();
    return list.find(target => target.type === 'page') ? list : null;
  });
  const target = targets.find(item => item.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const task = pending.get(message.id);
    clearTimeout(task.timer);
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Page.navigate', { url: pathToFileURL(path.resolve('index.html')).href });
  await waitUntil(async () => {
    const result = await command('Runtime.evaluate', { expression: 'typeof renderPracticeBoard === "function" && !!document.querySelector("#practice-modal")', returnByValue: true });
    return result.result?.value === true;
  });

  for (const [scenarioId, width, height] of [['near-goal', 375, 812], ['capture', 1440, 900]]) {
    const scenario = createPracticeScenario(scenarioId);
    const candidate = serializePracticeLegalMoves(scenario.legalMoves).find(move => scenarioId !== 'capture' || move.captures);
    if (!candidate) throw new Error(`Missing legal fixture move for ${scenarioId}`);
    const fixture = {
      state: scenario.state,
      move: { piece_id: candidate.pieceId, from: candidate.from, to: candidate.to },
      capture: candidate.captures,
      runtimeId: scenarioId === 'capture' ? 'cpp' : 'python3',
      executionMode: 'strategy', sdkVersion: '1.0.0',
    };
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 641 });
    const expression = `(() => {
      const data = ${JSON.stringify(fixture)};
      document.querySelector('#auth-screen').classList.remove('active');
      document.querySelector('#app-nav').hidden = false;
      document.querySelector('#app-topbar').hidden = false;
      document.querySelector('#bots').classList.add('active');
      document.querySelector('#practice-modal').classList.add('open');
      document.querySelector('#practice-modal').setAttribute('aria-hidden', 'false');
      document.querySelector('#practice-scenario').value = ${JSON.stringify(scenarioId)};
      document.querySelector('#practice-status').textContent = 'Đã chấp nhận nước đi · Người chơi ' + data.state.currentPlayer;
      document.querySelector('#practice-output').hidden = false;
      renderPracticeBoard(data.state, data.move, data.capture);
      renderPracticeResult(data);
      if (innerWidth < 641) {
        const dialog = document.querySelector('.practice-dialog');
        dialog.scrollTop = dialog.scrollHeight;
      }
      return {
        cells: document.querySelectorAll('#practice-board .replay-cell').length,
        first: document.querySelector('#practice-board .replay-cell')?.getAttribute('aria-label'),
        last: document.querySelector('#practice-board .replay-cell:last-child')?.getAttribute('aria-label'),
        overflow: document.documentElement.scrollWidth > innerWidth,
        board: document.querySelector('#practice-board').getBoundingClientRect().toJSON(),
        modal: document.querySelector('.practice-dialog').getBoundingClientRect().toJSON(),
        runButton: document.querySelector('#practice-run').getBoundingClientRect().toJSON(),
        captureLegend: Boolean(document.querySelector('.practice-legend')),
        captureLegendMark: Boolean(document.querySelector('.practice-legend .practice-legend-mark.capture')),
        captureCells: document.querySelectorAll('#practice-board .practice-capture').length,
      };
    })()`;
    const response = await command('Runtime.evaluate', { expression, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    const metrics = response.result.value;
    if (metrics.cells !== 81 || !metrics.captureLegend || !metrics.captureLegendMark
      || (scenarioId === 'capture' && metrics.captureCells < 1)
      || metrics.overflow || Math.abs(metrics.board.width - metrics.board.height) > 2
      || metrics.runButton.bottom > height || metrics.runButton.left < 0 || metrics.runButton.right > width) {
      throw new Error(`Invalid browser layout: ${JSON.stringify(metrics)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 350));
    const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(evidence, `practice-${scenarioId}-${width}.png`);
    await writeFile(file, Buffer.from(image.data, 'base64'));
    if (width < 641) {
      const scroll = await command('Runtime.evaluate', {
        expression: `(() => { const modal = document.querySelector('.practice-dialog'); modal.scrollTop = modal.scrollHeight; return { lastResultBottom: document.querySelector('#practice-result-details dd:last-child').getBoundingClientRect().bottom, footerTop: document.querySelector('.practice-dialog .practice-actions').getBoundingClientRect().top }; })()`,
        returnByValue: true,
      });
      if (scroll.result.value.lastResultBottom > scroll.result.value.footerTop) {
        throw new Error(`Practice result remains under the sticky mobile controls: ${JSON.stringify(scroll.result.value)}`);
      }
    }
    console.log(JSON.stringify({ file, ...metrics }));
  }
  console.log(`PASS: isolated browser QA evidence at ${evidence}`);
} finally {
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('Browser closed')); }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}
