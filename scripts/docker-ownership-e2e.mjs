import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from './docker-ownership-args.mjs';
import { createSourceRevisionQaParticipationRequest } from './docker-ownership-fixture.mjs';
import { isActiveOwnedWarm } from './docker-ownership-barrier.mjs';
import { createExecutionGate, createGatedRevisionExecutor } from './docker-ownership-gate.mjs';
import { readPersistedQaMatch } from './docker-ownership-persistence-reader.mjs';

import { createRevisionDockerExecutor } from '../dist/bot-executor/revision-docker-executor.js';
import { configuredRuntimeImageRegistry } from '../dist/bot-executor/runtime-image-registry.js';
import { getStrategySdkIdentity } from '../dist/bot-executor/strategy-sdk.js';
import { createMatchRunnerExecutor } from '../dist/tournament/executor.js';
import { createTournamentManager } from '../dist/tournament/manager.js';

const harnessPath = fileURLToPath(import.meta.url);

const args = parseCliArgs(process.argv.slice(2));

const timeoutMs = 180_000;
const environment = 'qa';
const source = `#include <vector>
Move chooseMove(const GameState&, const std::vector<Move>& legalMoves) {
  return legalMoves.front();
}
`;
const sourceDigest = createHash('sha256').update(source).digest('hex');

function dockerOutput(dockerArgs, timeout = 5_000) {
  return execFileSync('docker', dockerArgs, { encoding: 'utf8', timeout }).trim();
}

function checkpoint(message) {
  process.stdout.write(`[PARENT] ${new Date().toISOString()} ${message}\n`);
}


function createWarmStartBarrier({ storageNamespace, serverInstanceId, timeout = 90_000 }) {
  const watcher = spawn('docker', [
    'events', '--format', '{{json .}}', '--filter', 'event=start',
    '--filter', `label=ott.owner.environment=${environment}`,
    '--filter', `label=ott.owner.storage-namespace=${storageNamespace}`,
    '--filter', `label=ott.owner.server-instance=${serverInstanceId}`,
    '--filter', 'label=ott.owner.kind=warm',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let buffer = '';
  let settled = false;
  let resolveBarrier;
  let rejectBarrier;
  const promise = new Promise((resolve, reject) => { resolveBarrier = resolve; rejectBarrier = reject; });
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    watcher.kill();
    rejectBarrier(new Error(`Timed out after ${timeout}ms waiting for owned warm-container start event`));
  }, timeout);
  const fail = error => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    rejectBarrier(error);
  };
  const inspectStartedContainer = id => {
    try {
      const labels = JSON.parse(dockerOutput(['inspect', '--format', '{{json .Config.Labels}}', id]));
      const running = dockerOutput(['inspect', '--format', '{{.State.Running}}', id]);
      if (!isActiveOwnedWarm(labels, { environment, storageNamespace, serverInstanceId }) || running !== 'true') {
        fail(new Error(`Warm start event ${id} failed active ownership inspection`));
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolveBarrier({ id, labels });
    } catch (error) { fail(error); }
  };
  watcher.stdout.on('data', chunk => {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim() || settled) continue;
      try {
        const event = JSON.parse(line);
        if (event.status === 'start' && event.id) inspectStartedContainer(event.id);
      } catch (error) { fail(error); }
    }
  });
  watcher.stderr.on('data', chunk => {
    if (!settled && String(chunk).trim()) fail(new Error(`Docker events failed: ${String(chunk).trim()}`));
  });
  watcher.once('error', fail);
  watcher.once('exit', (code, signal) => {
    if (!settled) fail(new Error(`Docker events exited before warm barrier: code=${code} signal=${signal ?? 'none'}`));
  });
  return {
    promise,
    inspectContainer: inspectStartedContainer,
    fail,
    stop: () => {
      clearTimeout(timer);
      if (!watcher.killed) watcher.kill();
    },
  };
}

function required(name) {
  const value = args.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function assertRuntimeConfiguration() {
  const requiredNames = [
    'BOT_TRUSTED_IMAGE_REGISTRIES',
    'BOT_CPP_COMPILER_IMAGE',
    'BOT_CPP_RUNTIME_IMAGE',
    'BOT_PYTHON3_RUNTIME_IMAGE',
  ];
  const missing = requiredNames.filter(name => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing Docker runtime configuration: ${missing.join(', ')}. Load the same environment used by run-local.cmd/scripts/run-public.ps1 before starting the harness.`);
  }
}

async function withTimeout(promise, label, budget = timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${budget}ms`)), budget); }),
    ]);
  } finally { clearTimeout(timer); }
}

function revision(competitorId, botId, revisionId, sdk) {
  return {
    kind: 'source-revision', competitorId, botId, revisionId, runtimeId: 'cpp',
    sourceDigest, executionMode: 'strategy', sdkVersion: sdk.version, sdkDigest: sdk.digest,
  };
}

async function createOwner({ storageDir, workDir, namespace, instanceId, tournamentId, initialize, gateEnabled = false }) {
  const sdk = await getStrategySdkIdentity('cpp');
  const registry = configuredRuntimeImageRegistry('sandbox-required');
  let revisionExecutor = createRevisionDockerExecutor({
    imageRegistry: registry,
    executionPolicy: 'sandbox-required',
    resourceEnvironment: environment,
    storageNamespace: namespace,
    serverInstanceId: instanceId,
    ownerLeaseTtlMs: 2_000,
    workingDirBase: workDir,
    cppCompilationBackend: 'ephemeral-volume',
    defaultCompileTimeoutMs: 60_000,
    defaultPreparationTimeoutMs: 20_000,
    defaultTimeoutMs: 60_000,
  });
  if (!await withTimeout(revisionExecutor.isAvailable(), 'Docker availability')) throw new Error('Docker executor unavailable');

  if (gateEnabled) {
    const gate = createExecutionGate({ timeoutMs: 60_000 });
    revisionExecutor = createGatedRevisionExecutor(revisionExecutor, {
      gate,
      getContainerId: () => {
        const list = dockerOutput([
          'ps', '-q',
          '--filter', `label=ott.owner.environment=${environment}`,
          '--filter', `label=ott.owner.storage-namespace=${namespace}`,
          '--filter', `label=ott.owner.server-instance=${instanceId}`,
          '--filter', 'label=ott.owner.kind=warm',
        ], 5_000);
        return list.split(/\r?\n/)[0]?.trim() ?? '';
      },
      onGateEntered: ({ containerId, scopeId }) => {
        process.stdout.write(`WARM_GATE_ENTERED ${JSON.stringify({ containerId, instanceId, scopeId })}\n`);
      },
      onExecutionResult: result => {
        process.stdout.write(`REVISION_TURN_RESULT ${JSON.stringify({ instanceId, ...result })}\n`);
      },
    });
  }

  const revisions = new Map();
  const resolveRevision = async execution => revisions.get(`${execution.botId}:${execution.revisionId}`) ?? null;
  const matchConfig = {
    protocolVersion: '0.1.0', maxTurns: 200, turnTimeoutMs: 60_000,
    maxStdoutBytes: 1024 * 1024, maxStderrBytes: 10 * 1024 * 1024,
    failurePolicy: 'forfeit', maxRetries: 0, logRequests: false, logResponses: false, logStates: false, bestOf: 1,
  };
  const matchExecutor = await createMatchRunnerExecutor(matchConfig, undefined, revisionExecutor, resolveRevision);
  const manager = await createTournamentManager(
    storageDir, matchExecutor, 'sandbox-required', undefined,
    async execution => Boolean(await resolveRevision(execution)), resolveRevision,
    revisionExecutor, false,
  );

  if (initialize) {
    const created = await manager.createTournament(tournamentId, `QA ownership ${instanceId}`, 'single_round_robin', matchConfig);
    if (!created.success) throw new Error(created.error);
    const opened = await manager.openRegistration(tournamentId);
    if (!opened.success) throw new Error(opened.error);
    for (const suffix of ['a', 'b']) {
      const competitorId = `${instanceId}-competitor-${suffix}`;
      const botId = `${instanceId}-bot-${suffix}`;
      const revisionId = `${instanceId}-revision-${suffix}`;
      const execution = revision(competitorId, botId, revisionId, sdk);
      revisions.set(`${botId}:${revisionId}`, Buffer.from(source));
      const submitted = await manager.submitParticipationRequest(
        tournamentId,
        createSourceRevisionQaParticipationRequest({ botId, competitorId, execution }),
      );
      if (!submitted.success || !submitted.data) throw new Error(submitted.error ?? 'Unable to submit QA source revision');
      const approved = await manager.reviewParticipationRequest(tournamentId, submitted.data.requestId, `${instanceId}-organizer`, 'approve');
      if (!approved.success) throw new Error(approved.error);
    }
    const pinned = await manager.loadTournament(tournamentId);
    const sourceParticipants = pinned.data?.participants.filter(participant => participant.bot.execution?.kind === 'source-revision') ?? [];
    if (sourceParticipants.length !== 2) throw new Error(`QA source revision metadata was not persisted for both participants (${sourceParticipants.length}/2)`);
    process.stdout.write(`QA_SOURCE_PARTICIPANTS ${JSON.stringify(sourceParticipants.map(participant => ({
      botId: participant.bot.botId,
      runtimeId: participant.bot.execution?.kind === 'source-revision' ? participant.bot.execution.runtimeId : null,
      revisionId: participant.bot.execution?.kind === 'source-revision' ? participant.bot.execution.revisionId : null,
    })))}\n`);
    for (const operation of [
      () => manager.closeRegistration(tournamentId),
      () => manager.generateSchedule(tournamentId),
      () => manager.startTournament(tournamentId),
    ]) {
      const result = await operation();
      if (!result.success) throw new Error(result.error);
    }
  } else {
    // Restart must resolve the same pinned source revisions from the QA fixture.
    const loaded = await manager.loadTournament(tournamentId);
    if (!loaded.success || !loaded.data) throw new Error(loaded.error ?? 'QA tournament missing');
    for (const participant of loaded.data.participants) {
      const execution = participant.bot.execution;
      if (!execution || execution.kind !== 'source-revision') throw new Error('QA participant is not source-backed');
      revisions.set(`${execution.botId}:${execution.revisionId}`, Buffer.from(source));
    }
  }

  process.stdout.write(`OWNER_RUNTIME ${JSON.stringify({ instanceId, nodeEnv: process.env.NODE_ENV ?? null, gateEnabled })}\n`);
  process.stdout.write(`OWNER_READY ${instanceId}\n`);
  return { manager, revisionExecutor, matchConfig };
}

async function ownerMode() {
  const owner = await createOwner({
    storageDir: required('--storage-dir'), workDir: required('--work-dir'), namespace: required('--namespace'),
    instanceId: required('--instance'), tournamentId: required('--tournament'), initialize: args.get('--initialize') === 'true',
    gateEnabled: args.get('--gate') === 'true',
  });
  process.stdout.write(`MATCH_STARTING ${required('--instance')}\n`);
  const result = await owner.manager.runNextMatch(required('--tournament'));
  if (!result.success) {
    owner.manager.close();
    throw new Error(result.error ?? 'Owner match failed');
  }
  const matchId = result.data?.matchResult.matchId;
  const persisted = matchId ? await readPersistedQaMatch(required('--storage-dir'), required('--tournament'), matchId) : null;
  process.stdout.write(`PERSISTED_MATCH_RESULT ${JSON.stringify({ matchId: matchId ?? null, ...persisted })}\n`);
  process.stdout.write(`MATCH_RESULT ${JSON.stringify({ success: result.success, error: result.error ?? null, matchId: matchId ?? null })}\n`);
  setInterval(() => {}, 1_000);
}

async function restartMode() {
  const owner = await createOwner({
    storageDir: required('--storage-dir'), workDir: required('--work-dir'), namespace: required('--namespace'),
    instanceId: required('--instance'), tournamentId: required('--tournament'), initialize: false,
    gateEnabled: false,
  });
  const recovered = await owner.manager.recoverInterruptedTournaments();
  const resumed = await owner.manager.resumeTournament(required('--tournament'));
  if (!resumed.success) throw new Error(resumed.error ?? 'resumeTournament failed');
  const result = await owner.manager.runNextMatch(required('--tournament'));
  if (!result.success) throw new Error(result.error ?? 'resumed match failed');
  const after = await owner.manager.loadTournament(required('--tournament'));
  const pairings = after.data?.rounds.flatMap(round => round.pairings) ?? [];
  const completed = pairings.filter(pairing => pairing.status === 'completed').length;
  if (completed !== 1) throw new Error(`Expected exactly one completed pairing after resume, got ${completed}`);
  process.stdout.write(`RECOVERY_RESULT ${JSON.stringify({ recovered, completed })}\n`);
  owner.manager.close();
  process.exit(0);
}

async function orchestrate() {
  assertRuntimeConfiguration();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-ownership-e2e-'));
  const namespaceA = `qa-a-${randomUUID().replaceAll('-', '')}`;
  const namespaceB = `qa-b-${randomUUID().replaceAll('-', '')}`;
  const storageA = path.join(root, 'storage-a');
  const storageB = path.join(root, 'storage-b');
  const workA = path.join(root, 'work-a');
  const workB = path.join(root, 'work-b');
  const tournamentA = `qa-a-${randomUUID().replaceAll('-', '')}`;
  const tournamentB = `qa-b-${randomUUID().replaceAll('-', '')}`;
  const warmProtected = 'ott-warm-79f4b9146b25f7e2fe5ab276';
  let a;
  let b;
  let warmBefore = '';
  let warmBarrier;
  let ownerAGateSeen = false;
  let ownerAKillInitiated = false;
  let ownerATurnResult = null;
  try {
    checkpoint('preflight protected warm container');
    try { warmBefore = dockerOutput(['inspect', '--format', '{{.Id}}|{{.State.Status}}', warmProtected]); } catch { warmBefore = ''; }
    if (!warmBefore) throw new Error(`Protected warm/unknown resource ${warmProtected} is not available`);
    checkpoint(`protected warm snapshot=${warmBefore}`);
    warmBarrier = createWarmStartBarrier({ storageNamespace: namespaceA, serverInstanceId: 'owner-a' });
    checkpoint('warm start barrier armed before owner spawn');
    const common = ['--storage-dir', storageA, '--work-dir', workA, '--namespace', namespaceA, '--tournament', tournamentA, '--instance'];
    const qaEnv = { ...process.env, NODE_ENV: 'qa' };
    a = spawn(process.execPath, [harnessPath, '--owner', '--initialize', 'true', '--gate', 'true', ...common, 'owner-a'], {
      env: qaEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    b = spawn(process.execPath, [harnessPath, '--owner', '--initialize', 'true', '--storage-dir', storageB, '--work-dir', workB, '--namespace', namespaceB, '--tournament', tournamentB, '--instance', 'owner-b'], {
      env: qaEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    checkpoint(`spawned owner A pid=${a.pid}, owner B pid=${b.pid}`);
    for (const child of [a, b]) {
      child.stdout.on('data', chunk => {
        const text = String(chunk);
        process.stdout.write(`[${child === a ? 'A' : 'B'}] ${text}`);
        if (child === a && text.includes('REVISION_TURN_RESULT')) {
          const match = /REVISION_TURN_RESULT\s+(\{.*?\})/.exec(text);
          try { ownerATurnResult = match ? JSON.parse(match[1]) : ownerATurnResult; } catch {}
        }
        if (child === a && text.includes('WARM_GATE_ENTERED')) {
          let payload = null;
          try {
            const match = /WARM_GATE_ENTERED\s+(\{.*?\})/.exec(text);
            payload = match ? JSON.parse(match[1]) : null;
          } catch (error) {
            warmBarrier.fail(new Error(`Unable to parse WARM_GATE_ENTERED: ${error instanceof Error ? error.message : String(error)}`));
            return;
          }
          if (!payload?.containerId) {
            warmBarrier.fail(new Error('WARM_GATE_ENTERED without an active owned warm container id'));
            return;
          }
          ownerAGateSeen = true;
          warmBarrier.inspectContainer(payload.containerId);
          try {
            const list = dockerOutput([
              'ps', '-q',
              '--filter', `label=ott.owner.environment=${environment}`,
              '--filter', `label=ott.owner.storage-namespace=${namespaceA}`,
              '--filter', 'label=ott.owner.server-instance=owner-a',
              '--filter', 'label=ott.owner.kind=warm',
            ]);
            const cid = list.split(/\r?\n/)[0]?.trim();
            if (cid) warmBarrier.inspectContainer(cid);
          } catch {}
        }
        if (child === a && text.includes('MATCH_RESULT') && !ownerAGateSeen) {
          warmBarrier.fail(new Error(`Owner A match completed before WARM_GATE_ENTERED; revision turn=${JSON.stringify(ownerATurnResult)}`));
        }
      });
      child.stderr.on('data', chunk => process.stderr.write(`[${child === a ? 'A' : 'B'}] ${chunk}`));
      child.once('exit', (code, signal) => {
        if (child === a && !ownerAKillInitiated && !ownerAGateSeen) {
          warmBarrier.fail(new Error(`Owner A exited before WARM_GATE_ENTERED: code=${code ?? 'null'} signal=${signal ?? 'none'} revision turn=${JSON.stringify(ownerATurnResult)}`));
        }
      });
    }
    checkpoint('waiting for OWNER_READY from A and B');
    await withTimeout(new Promise((resolve, reject) => {
      let ready = 0;
      const onData = chunk => { ready += String(chunk).includes('OWNER_READY') ? 1 : 0; if (ready >= 2) resolve(); };
      a.stdout.on('data', onData); b.stdout.on('data', onData);
      a.once('exit', code => code && reject(new Error(`Owner A exited before ready: ${code}`)));
      b.once('exit', code => code && reject(new Error(`Owner B exited before ready: ${code}`)));
    }), 'owners startup');
    checkpoint('owners ready; awaiting deterministic warm start event');
    const warm = await warmBarrier.promise;
    checkpoint(`owner A warm container active id=${warm.id}; ownership labels verified`);
    checkpoint(`hard-killing owner A pid=${a.pid} while warm container=${warm.id} is active`);
    ownerAKillInitiated = true;
    if (a.pid) process.kill(a.pid, 'SIGKILL');
    await withTimeout(new Promise((resolve, reject) => {
      a.once('exit', (code, signal) => code === 0 ? reject(new Error('Owner A exited normally; hard-kill was not observed')) : resolve({ code, signal }));
    }), 'owner A hard-kill confirmation', 10_000);
    checkpoint('owner A hard-kill confirmed');
    const orphanState = dockerOutput([
      'inspect', '--format', '{{.State.Running}}|{{json .Config.Labels}}', warm.id,
    ], 10_000);
    const [orphanRunning, orphanLabelsJson] = orphanState.split('|', 2);
    const orphanLabels = JSON.parse(orphanLabelsJson);
    if (orphanRunning !== 'true' || !isActiveOwnedWarm(orphanLabels, {
      environment,
      storageNamespace: namespaceA,
      serverInstanceId: 'owner-a',
    })) {
      throw new Error('Owned warm container was not present and active after Owner A hard-kill');
    }
    checkpoint(`orphan warm container confirmed id=${warm.id}; ownership labels preserved`);
    checkpoint('starting owner A restart');
    const restart = spawn(process.execPath, [harnessPath, '--restart', '--storage-dir', storageA, '--work-dir', workA, '--namespace', namespaceA, '--tournament', tournamentA, '--instance', 'owner-a-restart'], {
      env: qaEnv,
      stdio: 'inherit',
      windowsHide: true,
    });
    const exitCode = await withTimeout(new Promise(resolve => restart.once('exit', resolve)), 'owner A restart');
    if (exitCode !== 0) throw new Error(`Owner A restart exited with ${exitCode}`);
    if (b.exitCode !== null) throw new Error('Owner B exited during Owner A recovery');
    try {
      dockerOutput(['inspect', warm.id], 10_000);
      throw new Error(`Recovered orphan warm container still exists: ${warm.id}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Recovered orphan')) throw error;
    }
    checkpoint('owner A restart, orphan cleanup and resume completed');
    const warmAfter = (() => { try { return dockerOutput(['inspect', '--format', '{{.Id}}|{{.State.Status}}', warmProtected]); } catch { return ''; } })();
    if (warmBefore !== warmAfter) throw new Error('Protected warm container changed');
    process.stdout.write('DOCKER_OWNERSHIP_E2E_PASS\n');
  } finally {
    checkpoint('entering QA cleanup');
    warmBarrier?.stop();
    for (const child of [a, b]) if (child?.pid) { try { process.kill(child.pid, 'SIGKILL'); } catch {} }
    const knownOwners = new Set(['owner-a', 'owner-a-restart', 'owner-b']);
    for (const namespace of [namespaceA, namespaceB]) {
      const filter = ['--filter', `label=ott.owner.environment=${environment}`, '--filter', `label=ott.owner.storage-namespace=${namespace}`];
      for (const kind of ['container', 'volume']) {
        const listArgs = kind === 'container' ? ['ps', '-aq', ...filter] : ['volume', 'ls', '-q', ...filter];
        let resources = '';
        try { resources = dockerOutput(listArgs); } catch {}
        for (const resource of resources.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
          try {
            const inspectArgs = kind === 'container' ? ['inspect', '--format', '{{json .Config.Labels}}', resource] : ['volume', 'inspect', '--format', '{{json .Labels}}', resource];
            const labels = JSON.parse(dockerOutput(inspectArgs));
            if (labels['ott.owner.environment'] !== environment || labels['ott.owner.storage-namespace'] !== namespace ||
                !knownOwners.has(labels['ott.owner.server-instance']) || !labels['ott.owner.revision-scope'] || !labels['ott.owner.kind']) continue;
            dockerOutput(kind === 'container' ? ['rm', '--force', resource] : ['volume', 'rm', '--force', resource], 10_000);
          } catch { /* Preserve any resource whose ownership cannot be verified. */ }
        }
      }
    }
    await fs.rm(root, { recursive: true, force: true });
    checkpoint('QA cleanup finished');
  }
}

try {
  if (args.has('--owner')) await ownerMode();
  else if (args.has('--restart')) await restartMode();
  else await orchestrate();
} catch (error) {
  process.stderr.write(`DOCKER_OWNERSHIP_E2E_FAIL ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
