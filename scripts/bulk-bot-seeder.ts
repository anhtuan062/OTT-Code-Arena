import { parseBulkBotRuntime, validateBulkBotCount } from '../server/admin/bulk-bot-seeder.js';

interface CliOptions {
  tournament: string;
  count: number;
  runtime: 'cpp' | 'python3' | 'mixed';
  dryRun: boolean;
}

function usage(): string {
  return [
    'Usage:',
    '  node dist/scripts/bulk-bot-seeder.js --tournament <id> --count <n> --runtime <cpp|python3|mixed> [--dry-run]',
    '',
    'The Backend must already be running in the same production container.',
    'Required environment:',
    '  OTT_INTERNAL_ADMIN_URL=http://127.0.0.1:3000/internal/admin/bulk-bot-seed',
    '  OTT_INTERNAL_ADMIN_TOKEN=<same secret configured on the Backend>',
    '  OTT_BULK_BOT_SEED_CONFIRM=<same tournament id>',
    '  NODE_ENV=production EXECUTION_POLICY=sandbox-required',
    '  ENABLE_SOURCE_REVISION_EXECUTION=true',
  ].join('\n');
}

function parseArgs(argv: string[]): CliOptions {
  let tournament = '';
  let count: number | undefined;
  let runtime: 'cpp' | 'python3' | 'mixed' | undefined;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    const [key, inlineValue] = argument.split('=', 2);
    const value = inlineValue ?? argv[++index];
    if (!value) throw new Error(`Missing value for ${key}`);
    if (key === '--tournament') tournament = value;
    else if (key === '--count') count = Number(value);
    else if (key === '--runtime') runtime = parseBulkBotRuntime(value);
    else if (key === '--help' || key === '-h') throw new Error(usage());
    else throw new Error(`Unknown option ${key}`);
  }
  if (!tournament) throw new Error(`--tournament is required\n\n${usage()}`);
  if (count === undefined) throw new Error(`--count is required\n\n${usage()}`);
  validateBulkBotCount(count);
  if (!runtime) throw new Error(`--runtime is required\n\n${usage()}`);
  if (process.env.NODE_ENV?.trim().toLowerCase() !== 'production') throw new Error('NODE_ENV=production is required');
  if (process.env.EXECUTION_POLICY?.trim().toLowerCase() !== 'sandbox-required') throw new Error('EXECUTION_POLICY=sandbox-required is required');
  if (process.env.ENABLE_SOURCE_REVISION_EXECUTION?.trim().toLowerCase() !== 'true') throw new Error('ENABLE_SOURCE_REVISION_EXECUTION=true is required');
  if (!process.env.OTT_INTERNAL_ADMIN_TOKEN?.trim()) throw new Error('OTT_INTERNAL_ADMIN_TOKEN must be explicitly set');
  if (process.env.OTT_BULK_BOT_SEED_CONFIRM !== tournament) throw new Error('OTT_BULK_BOT_SEED_CONFIRM must exactly match --tournament');
  return { tournament, count, runtime, dryRun };
}

function resolveInternalAdminEndpoint(): string {
  const raw = process.env.OTT_INTERNAL_ADMIN_URL?.trim()
    || `http://127.0.0.1:${process.env.PORT?.trim() || '3000'}/internal/admin/bulk-bot-seed`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('OTT_INTERNAL_ADMIN_URL must be a valid URL');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1'].includes(hostname)
    || url.username || url.password || url.pathname !== '/internal/admin/bulk-bot-seed'
    || url.search || url.hash) {
    throw new Error('OTT_INTERNAL_ADMIN_URL must target the loopback internal admin endpoint over HTTP');
  }
  return url.toString();
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const endpoint = resolveInternalAdminEndpoint();
  const timeoutMs = Math.max(10_000, Number(process.env.OTT_BULK_BOT_SEED_REQUEST_TIMEOUT_MS ?? 15 * 60_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ott-internal-token': process.env.OTT_INTERNAL_ADMIN_TOKEN!.trim(),
      },
      body: JSON.stringify({
        tournamentId: options.tournament,
        count: options.count,
        runtime: options.runtime,
        dryRun: options.dryRun,
        qaConfirmation: process.env.OTT_BULK_BOT_SEED_CONFIRM,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({ error: `Backend returned HTTP ${response.status}` }));
    if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : `Backend returned HTTP ${response.status}`);
    console.log(JSON.stringify(payload, null, 2));
    if (payload.failed > 0) process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

run().catch(error => {
  console.error(error instanceof Error && error.name === 'AbortError' ? 'Bulk Bot seed request timed out' : error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
