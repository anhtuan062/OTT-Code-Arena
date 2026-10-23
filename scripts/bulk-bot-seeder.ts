import { initServer, closeServer, getBulkBotSeederDependencies } from '../server/index.js';
import { parseBulkBotRuntime, seedBulkBots, validateBulkBotCount } from '../server/admin/bulk-bot-seeder.js';

interface CliOptions {
  tournament?: string;
  count?: number;
  runtime?: 'cpp' | 'python3' | 'mixed';
  dryRun: boolean;
}

function usage(): string {
  return [
    'Usage:',
    '  npx tsx scripts/bulk-bot-seeder.ts --tournament <id> --count <n> --runtime <cpp|python3|mixed> [--dry-run]',
    '',
    'Required safety environment:',
    '  TOURNAMENT_DATA_DIR=/srv/ott-code-arena/data',
    '  NODE_ENV=production EXECUTION_POLICY=sandbox-required',
    '  ENABLE_SOURCE_REVISION_EXECUTION=true',
    '  OTT_BULK_BOT_SEED_CONFIRM=<same tournament id>',
  ].join('\n');
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    const [key, inlineValue] = argument.split('=', 2);
    const value = inlineValue ?? argv[++index];
    if (!value) throw new Error(`Missing value for ${key}`);
    if (key === '--tournament') options.tournament = value;
    else if (key === '--count') options.count = Number(value);
    else if (key === '--runtime') options.runtime = parseBulkBotRuntime(value);
    else if (key === '--help' || key === '-h') throw new Error(usage());
    else throw new Error(`Unknown option ${key}`);
  }
  if (!options.tournament) throw new Error(`--tournament is required\n\n${usage()}`);
  if (options.count === undefined) throw new Error(`--count is required\n\n${usage()}`);
  validateBulkBotCount(options.count);
  if (!options.runtime) throw new Error(`--runtime is required\n\n${usage()}`);
  if (!process.env.TOURNAMENT_DATA_DIR?.trim()) throw new Error('TOURNAMENT_DATA_DIR must be explicitly set');
  if (process.env.NODE_ENV?.trim().toLowerCase() !== 'production') throw new Error('NODE_ENV=production is required');
  if (process.env.EXECUTION_POLICY?.trim().toLowerCase() !== 'sandbox-required') throw new Error('EXECUTION_POLICY=sandbox-required is required');
  if (process.env.ENABLE_SOURCE_REVISION_EXECUTION?.trim().toLowerCase() !== 'true') throw new Error('ENABLE_SOURCE_REVISION_EXECUTION=true is required');
  if (process.env.OTT_BULK_BOT_SEED_CONFIRM !== options.tournament) throw new Error('OTT_BULK_BOT_SEED_CONFIRM must exactly match --tournament');
  return options;
}

const options = parseArgs(process.argv.slice(2));
try {
  await initServer(process.env.TOURNAMENT_DATA_DIR);
  const summary = await seedBulkBots(getBulkBotSeederDependencies(), {
    tournamentId: options.tournament!,
    count: options.count!,
    runtime: options.runtime!,
    dryRun: options.dryRun,
    qaConfirmation: process.env.OTT_BULK_BOT_SEED_CONFIRM!,
  });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await closeServer().catch(error => console.error('Unable to close server cleanly:', error));
}
