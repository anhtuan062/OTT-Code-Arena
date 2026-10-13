import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  createRevisionDockerExecutor,
  createRuntimeImageRegistry,
  getStrategySdkIdentity,
} from '../dist/bot-executor/index.js';
import { BotProtocol } from '../dist/bot-protocol/index.js';
import { createPracticeScenario, matchesPracticeSelectedMove, serializePracticeLegalMoves } from '../dist/practice/scenarios.js';

const [evidence, dockerContext, compilerImage, runtimeImage, trustedCsv] = process.argv.slice(2);
if (!evidence || !dockerContext || !compilerImage || !runtimeImage || !trustedCsv) {
  throw new Error('Usage: node phase8.5h-e2e.mjs <evidence> <context> <compiler> <runtime> <trusted>');
}

const strategySources = [
  'using namespace ott; Move chooseMove(const GameState&, const std::vector<Move>& moves) { return moves.front(); }',
  'using namespace ott; Move chooseMove(const GameState&, const std::vector<Move>& moves) { return moves.back(); }',
];

function docker(args, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker.exe', ['--context', dockerContext, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = ''; let stderr = ''; let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => { proc.kill(); finish(new Error(`Docker command timed out: ${args[0]}`)); }, timeoutMs);
    proc.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    proc.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    proc.once('error', finish);
    proc.once('close', code => code === 0 ? finish(null, stdout.trim()) : finish(new Error((stderr || `Docker exited ${code}`).slice(0, 500))));
  });
}

async function ownedVolumes() {
  const output = await docker(['volume', 'ls', '--filter', 'label=ott.source.workspace', '--format', '{{.Name}}']);
  return new Set(output ? output.split(/\r?\n/).filter(Boolean) : []);
}

function revision(source, sdk, suffix) {
  return {
    execution: {
      kind: 'source-revision', competitorId: `e2e-user-${suffix}`, botId: `e2e-bot-${suffix}`,
      revisionId: `e2e-revision-${suffix}`, runtimeId: 'cpp',
      sourceDigest: createHash('sha256').update(source).digest('hex'),
      executionMode: 'strategy', sdkVersion: sdk.version, sdkDigest: sdk.digest,
    },
    source: Buffer.from(source),
  };
}

async function runScenario(executor, sdk, scenarioId, suffix, source = strategySources[0]) {
  const scenario = createPracticeScenario(scenarioId);
  if (!scenario) throw new Error(`Missing engine scenario ${scenarioId}`);
  const request = BotProtocol.createRequest(`phase8.5h-${suffix}`, scenario.state, scenario.legalMoves);
  const result = await executor.executeRevision(
    { executionId: `h-${suffix}-${randomUUID().slice(0, 8)}`, matchId: `h-${suffix}`, turn: 1, player: scenario.expectedPlayer },
    revision(source, sdk, suffix), request,
  );
  const legal = serializePracticeLegalMoves(scenario.legalMoves);
  if (!result.success || !matchesPracticeSelectedMove(result.response?.move, legal)) {
    throw new Error(`${scenarioId}/${suffix} failed: ${result.error?.code ?? 'illegal move'} (${result.error?.stage ?? 'unknown stage'})`);
  }
  if (result.provenance?.compilationBackend !== 'ephemeral-volume' || !/^[a-f0-9]{64}$/.test(result.provenance.artifactDigest ?? '')) {
    throw new Error(`${scenarioId}/${suffix} lacks volume/artifact provenance`);
  }
  if (!result.timings?.cleanupSucceeded || result.timings.workspacePreparationMs === null || result.timings.compilationContainerMs === null || result.timings.runtimeContainerMs === null) {
    throw new Error(`${scenarioId}/${suffix} lacks complete timing/cleanup evidence`);
  }
  return {
    scenarioId, suffix, move: result.response.move, timings: result.timings,
    provenance: result.provenance,
  };
}

await fs.mkdir(evidence, { recursive: true });
const before = await ownedVolumes();
const registry = createRuntimeImageRegistry({
  trustedRegistries: trustedCsv.split(',').map(value => value.trim()),
  cppCompilerImage: compilerImage,
  cppRuntimeImage: runtimeImage,
  python3RuntimeImage: 'docker.io/library/python@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258',
}, 'sandbox-required');
const sdk = await getStrategySdkIdentity('cpp');
const executor = createRevisionDockerExecutor({
  imageRegistry: registry,
  executionPolicy: 'sandbox-required',
  workingDirBase: path.join(evidence, 'work'),
  cppCompilationBackend: 'ephemeral-volume',
  defaultPreparationTimeoutMs: 10_000,
  defaultCompileTimeoutMs: 30_000,
  defaultTimeoutMs: 2_000,
});

const manifest = {
  phase: '8.5H', dockerContext, compilerImage, runtimeImage,
  sdkVersion: sdk.version, sdkDigest: sdk.digest,
  backend: 'ephemeral-volume', preparationBudgetMs: 10_000,
  compilationBudgetMs: 30_000, runtimeBudgetMs: 2_000,
  productionConfigurationChanged: false,
};
await fs.writeFile(path.join(evidence, 'manifest.json'), JSON.stringify(manifest, null, 2));

let status = 'failed';
try {
  if (!(await executor.isAvailable())) throw new Error('Pinned Docker runtime images are unavailable');
  const samples = [];
  for (const scenarioId of ['initial', 'capture', 'near-goal']) {
    const sample = await runScenario(executor, sdk, scenarioId, `serial-${scenarioId}`);
    samples.push(sample);
    await fs.appendFile(path.join(evidence, 'samples.jsonl'), `${JSON.stringify(sample)}\n`);
  }
  const concurrent = await Promise.all([
    runScenario(executor, sdk, 'initial', 'concurrent-a', strategySources[0]),
    runScenario(executor, sdk, 'initial', 'concurrent-b', strategySources[1]),
  ]);
  await fs.writeFile(path.join(evidence, 'concurrency.json'), JSON.stringify(concurrent, null, 2));
  if (concurrent[0].provenance.artifactDigest === concurrent[1].provenance.artifactDigest) {
    throw new Error('Distinct concurrent source fixtures unexpectedly produced the same artifact digest');
  }

  const badSource = 'using namespace ott; Move chooseMove( {';
  const bad = await executor.executeRevision(
    { executionId: `h-invalid-${randomUUID().slice(0, 8)}`, matchId: 'h-invalid', turn: 1, player: 'A' },
    revision(badSource, sdk, 'invalid'),
    BotProtocol.createRequest('h-invalid', createPracticeScenario('initial').state, createPracticeScenario('initial').legalMoves),
  );
  if (bad.success || bad.error?.code !== 'PROCESS_CRASHED' || bad.error?.stage !== 'compilation' || !bad.timings?.cleanupSucceeded) {
    throw new Error('Invalid C++ fixture did not fail as a cleaned compiler failure');
  }
  const after = await ownedVolumes();
  const leaked = [...after].filter(name => !before.has(name));
  if (leaked.length) throw new Error(`Owned volume cleanup failed (${leaked.length} leaked)`);
  status = 'passed';
  await fs.writeFile(path.join(evidence, 'summary.json'), JSON.stringify({ status, serialRuns: samples.length, concurrentRuns: concurrent.length, invalidCompileCleanup: true, leakedVolumes: [] }, null, 2));
  console.log('PASS: ephemeral-volume C++ Strategy scenarios, concurrency, provenance and cleanup verified.');
} catch (error) {
  const after = await ownedVolumes().catch(() => new Set());
  const leaked = [...after].filter(name => !before.has(name));
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ status, message: String(error?.message ?? error).slice(0, 800), leakedVolumeNames: leaked }, null, 2));
  throw error;
}
