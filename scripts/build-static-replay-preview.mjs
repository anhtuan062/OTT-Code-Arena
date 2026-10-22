import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const safeHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return args;
}

function publicBaseUrl(value) {
  const candidate = String(value || './').trim();
  if (!candidate || candidate.includes('\\') || candidate.startsWith('//')) throw new Error('OTT_PUBLIC_REPLAY_BASE_URL is invalid');
  const parsed = new URL(candidate, 'https://static-replay.invalid/');
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash || parsed.search) {
    throw new Error('OTT_PUBLIC_REPLAY_BASE_URL must be an http(s) URL without credentials/query/hash');
  }
  if (candidate.startsWith('/') && !candidate.startsWith('./')) return `${candidate.replace(/\/+$/, '')}/`;
  if (candidate === '.' || candidate === './') return './';
  if (!candidate.endsWith('/')) return `${candidate}/`;
  return candidate;
}

async function writeAtomic(file, contents) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  try {
    await fs.writeFile(temp, contents, { flag: 'wx' });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

async function copyTree(source, destination) {
  await fs.cp(source, destination, { recursive: true, force: true, verbatimSymlinks: true });
}

async function readPublishedExports(exportRoot, selectedTournamentId) {
  const tournamentRoot = path.join(exportRoot, 'tournaments');
  const names = selectedTournamentId ? [selectedTournamentId] : await fs.readdir(tournamentRoot);
  const copied = [];
  for (const tournamentId of names) {
    if (!safeId(tournamentId)) throw new Error(`Unsafe tournament id: ${tournamentId}`);
    const tournamentDir = path.join(tournamentRoot, tournamentId);
    const manifestPath = path.join(tournamentDir, 'index.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.tournamentId !== tournamentId || manifest.status !== 'published') {
      throw new Error(`Tournament ${tournamentId} is not a published replay export`);
    }
    if (!Array.isArray(manifest.entries)) throw new Error(`Manifest for ${tournamentId} has no entries`);
    for (const entry of manifest.entries) {
      if (!safeId(entry?.matchId) || !safeHash(entry?.replayHash) || entry.sha256 !== entry.replayHash) throw new Error(`Invalid entry in ${tournamentId}`);
      const expected = `tournaments/${tournamentId}/matches/${entry.matchId}-${entry.replayHash}.json`;
      if (entry.path !== expected) throw new Error(`Unsafe replay path in ${tournamentId}`);
      const replayPath = path.join(exportRoot, entry.path);
      const bytes = await fs.readFile(replayPath);
      const digest = crypto.createHash('sha256').update(bytes).digest('hex');
      if (digest !== entry.replayHash) throw new Error(`Replay hash mismatch for ${entry.matchId}`);
      const replay = JSON.parse(bytes.toString('utf8'));
      const serialized = JSON.stringify(replay);
      if (/(executionProvenance|executionDiagnostics|sourceCode|credentials|password|secret|token|filesystemPath)/i.test(serialized)) {
        throw new Error(`Sensitive public replay field in ${entry.matchId}`);
      }
      copied.push({ entry, manifestPath, replayPath });
    }
    copied.push({ manifest, manifestPath });
  }
  return copied;
}

const staticLoader = `
async function loadPageFragments() {
  const placeholders = [...document.querySelectorAll('[data-page-fragment]')];
  await Promise.all(placeholders.map(async placeholder => {
    const source = placeholder.dataset.pageFragment;
    const cleanSource = source.replace(/^\\/+/, '').replace(/\\.html$/, '');
    const response = await fetch(new URL(cleanSource, document.baseURI), { headers: { Accept: 'text/html' } });
    if (!response.ok) throw new Error('Fragment load failed: ' + response.status);
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const root = parsed.body.firstElementChild;
    if (!root || root.id !== placeholder.dataset.pageRoot) throw new Error('Invalid page fragment');
    placeholder.replaceWith(root);
  }));
}
function startApplication() {
  const script = document.createElement('script');
  script.src = './app.js?static-replay-preview-1';
  script.onload = () => window.dispatchEvent(new Event('ott-static-app-ready'));
  document.body.append(script);
}
loadPageFragments().then(startApplication).catch(error => {
  const message = document.createElement('main');
  message.className = 'page-load-error';
  message.setAttribute('role', 'alert');
  message.textContent = 'Không thể tải giao diện xem replay công khai.';
  document.body.append(message);
  console.error('[OTT static replay] Page loading failed', error);
});
`;

function bootstrapSource(baseUrl) {
  return `
window.OTT_PUBLIC_REPLAY_BASE_URL = ${JSON.stringify(baseUrl)};
window.OTT_PUBLIC_REPLAY_STATIC_ONLY = true;
const ottStaticFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
  if (url.pathname === '/api/auth/me' || url.pathname === '/auth/me') {
    return Promise.resolve(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
  }
  return ottStaticFetch(input, init);
};
window.addEventListener('ott-static-app-ready', async () => {
  const params = new URLSearchParams(window.location.search);
  const tournamentId = params.get('tournamentId');
  const matchId = params.get('matchId');
  const gameId = params.get('gameId');
  const fail = message => {
    const target = document.querySelector('#replay-error-message');
    if (target) target.textContent = message;
    const panel = document.querySelector('#replay-error');
    if (panel) panel.hidden = false;
  };
  if (!tournamentId || !matchId) { fail('Thiếu tournamentId hoặc matchId.'); return; }
  try {
    await playReplay(tournamentId, matchId, gameId ? { matchId: gameId } : null);
  } catch (error) { fail(error?.message || 'Không thể tải replay công khai.'); }
});
`;
}

export async function buildStaticReplayPreview({ exportDir, outputDir = path.join(projectRoot, 'static-replay-preview'), baseUrl = process.env.OTT_PUBLIC_REPLAY_BASE_URL || './', tournamentId } = {}) {
  if (!exportDir) throw new Error('exportDir is required; live tournament storage is never an input');
  const source = path.resolve(exportDir);
  const output = path.resolve(outputDir);
  const base = publicBaseUrl(baseUrl);
  await fs.access(path.join(source, 'tournaments'));
  await readPublishedExports(source, tournamentId);
  await fs.mkdir(output, { recursive: true });

  await writeAtomic(path.join(output, 'index.html'), (await fs.readFile(path.join(projectRoot, 'index.html'), 'utf8'))
    .replace('<head>', '<head><link rel="icon" href="data:,">')
    .replace('<script src="/js/page-loader.js?v=fragment-loader-4"></script>', '<script src="./static-preview-loader.js"></script><script src="./static-preview-bootstrap.js"></script>'));
  await writeAtomic(path.join(output, 'static-preview-loader.js'), staticLoader);
  await writeAtomic(path.join(output, 'static-preview-bootstrap.js'), bootstrapSource(base));
  await writeAtomic(path.join(output, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/tournaments/:tournament/index.json\n  Cache-Control: public, max-age=60, must-revalidate\n/tournaments/:tournament/matches/:replay.json\n  Cache-Control: public, max-age=31536000, immutable\n`);
  for (const file of ['app.js', 'style.css']) await fs.copyFile(path.join(projectRoot, file), path.join(output, file));
  for (const directory of ['styles', 'views']) await copyTree(path.join(projectRoot, directory), path.join(output, directory));
  const publicTournaments = path.join(output, 'tournaments');
  await fs.mkdir(publicTournaments, { recursive: true });
  const tournaments = tournamentId ? [tournamentId] : await fs.readdir(path.join(source, 'tournaments'));
  for (const id of tournaments) {
    const sourceDir = path.join(source, 'tournaments', id);
    const destinationDir = path.join(publicTournaments, id);
    await fs.mkdir(path.join(destinationDir, 'matches'), { recursive: true });
    await fs.copyFile(path.join(sourceDir, 'index.json'), path.join(destinationDir, 'index.json'));
    const manifest = JSON.parse(await fs.readFile(path.join(sourceDir, 'index.json'), 'utf8'));
    for (const entry of manifest.entries) await fs.copyFile(path.join(source, entry.path), path.join(output, entry.path));
  }
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  buildStaticReplayPreview({ exportDir: args['export-dir'], outputDir: args['output-dir'], baseUrl: args['base-url'], tournamentId: args['tournament-id'] })
    .then(output => console.log(`Built static replay preview at ${output}`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
