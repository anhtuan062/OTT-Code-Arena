import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
  buildCppRuntimeDockerArgs,
  buildStrategyCppCompileDockerArgs,
  parseRevisionBotResult,
} from '../dist/bot-executor/revision-docker-executor.js';
import { createRuntimeImageRegistry } from '../dist/bot-executor/runtime-image-registry.js';
import { getStrategySdkIdentity, materializeStrategySdk, wrapCppStrategySource } from '../dist/bot-executor/strategy-sdk.js';
import { createPracticeScenario, matchesPracticeSelectedMove, serializePracticeLegalMoves } from '../dist/practice/scenarios.js';
import { BotProtocol } from '../dist/bot-protocol/index.js';

const PYTHON_IMAGE = 'docker.io/library/python@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258';
const FIXTURE_SOURCE = 'Move chooseMove(const GameState&, const std::vector<Move>& legalMoves) { return legalMoves.front(); }';
const FIXTURE_WRAPPER = wrapCppStrategySource(FIXTURE_SOURCE);
const OUTPUT_LIMIT = 64 * 1024;

export const CANDIDATES = Object.freeze([
  { id: 'baseline', description: 'Production: -O2 -static, 1 CPU, 256 MB', optimization: '-O2', staticLink: true, cpu: 1, memory: '256m', tradeoff: 'Current Docker isolation and pinned runtime compatibility.' },
  { id: 'o1', description: 'Only optimization level changed', optimization: '-O1', staticLink: true, cpu: 1, memory: '256m', tradeoff: 'Same sandbox and ABI; compiled Bot may run slower.' },
  { id: 'o0', description: 'Only optimization level changed', optimization: '-O0', staticLink: true, cpu: 1, memory: '256m', tradeoff: 'Same sandbox and ABI; larger/slower binaries may exceed the unchanged runtime budget.' },
  { id: 'dynamic', description: 'Only static linking removed; requires dependency closure', optimization: '-O2', staticLink: false, cpu: 1, memory: '256m', tradeoff: 'Same sandbox; pinned runtime libraries and loader must be verified for every artifact.' },
  { id: 'compiler-resources', description: 'Only compiler CPU/memory raised; runtime unchanged', optimization: '-O2', staticLink: true, cpu: 2, memory: '512m', tradeoff: 'Same sandbox flags but higher compiler host capacity consumption; runtime remains 1 CPU/256 MB.' },
]);

export const RESOURCE_VALIDATION_CANDIDATES = Object.freeze([
  CANDIDATES.find(candidate => candidate.id === 'baseline'),
  CANDIDATES.find(candidate => candidate.id === 'compiler-resources'),
]);

export function candidatesForMode(mode) {
  if (mode === 'resource-validation') return [...RESOURCE_VALIDATION_CANDIDATES];
  if (mode === 'full') return [...CANDIDATES];
  throw new Error(`Unsupported benchmark mode: ${mode}`);
}

export function balancedCandidateSchedule(candidates, measuredRuns) {
  const schedule = [];
  for (let run = 1; run <= measuredRuns; run += 1) {
    const ordered = run % 2 === 1 ? candidates : [...candidates].reverse();
    for (const candidate of ordered) schedule.push({ candidate, run });
  }
  return schedule;
}

function setFlagValue(args, flag, value) {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) throw new Error(`Missing production Docker flag ${flag}`);
  args[index + 1] = String(value);
}

export function candidateCompileArgs(productionArgs, candidate) {
  const args = [...productionArgs];
  const optimizationIndex = args.indexOf('-O2');
  if (optimizationIndex < 0 || !args.includes('-static')) throw new Error('Production C++ flags changed; review benchmark variants first');
  args[optimizationIndex] = candidate.optimization;
  if (!candidate.staticLink) args.splice(args.indexOf('-static'), 1);
  setFlagValue(args, '--cpus', candidate.cpu);
  setFlagValue(args, '--memory', candidate.memory);
  return args;
}

export function statistics(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    minMs: sorted[0],
    medianMs: sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2),
    maxMs: sorted.at(-1),
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}

export function elfArchitecture(bytes) {
  if (bytes.length < 20 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) return null;
  if (bytes[4] !== 2 || bytes[5] !== 1) return null; // 64-bit little-endian ELF.
  const machine = bytes[18] | (bytes[19] << 8);
  if (machine === 62) return 'amd64';
  if (machine === 183) return 'arm64';
  return `unsupported-${machine}`;
}

function normalizedArch(value) {
  if (value === 'x86_64') return 'amd64';
  if (value === 'aarch64') return 'arm64';
  return value;
}

export function assertSandboxArgs(args, kind) {
  const hasPair = (flag, value) => args.indexOf(flag) >= 0 && args[args.indexOf(flag) + 1] === value;
  if (args[0] !== 'run' || !args.includes('--rm') || !args.includes('--pull=never') ||
      !hasPair('--network', 'none') || !args.includes('--read-only') ||
      !hasPair('--security-opt', 'no-new-privileges:true') || !hasPair('--cap-drop', 'ALL') ||
      !hasPair('--user', '65532:65532') || !args.includes('--memory') ||
      !args.includes('--cpus') || !args.includes('--pids-limit')) {
    throw new Error(`Production ${kind} Docker sandbox invariant changed`);
  }
  const mounts = args.filter((arg, index) => index > 0 && args[index - 1] === '-v');
  if (kind === 'compiler' && (!mounts.some(value => value.endsWith(':/app/source:ro')) ||
      !mounts.some(value => value.endsWith(':/app/sdk:ro')) ||
      !mounts.some(value => value.endsWith(':/app/output:rw')))) {
    throw new Error('Compiler mount isolation changed');
  }
  if (kind === 'runtime' && !mounts.some(value => value.endsWith(':/app/bin:ro'))) {
    throw new Error('Runtime binary mount isolation changed');
  }
}

function runProcess(binary, args, { input, timeoutMs = 20_000 } = {}) {
  return new Promise(resolve => {
    const started = performance.now();
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let outputExceeded = false;
    let settled = false;
    const finish = code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, outputExceeded, elapsedMs: Math.round(performance.now() - started) });
    };
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const collect = (current, chunk) => {
      const next = current + Buffer.from(chunk).toString('utf8');
      if (next.length > OUTPUT_LIMIT) { outputExceeded = true; child.kill(); }
      return next.slice(0, OUTPUT_LIMIT);
    };
    child.stdout.on('data', chunk => { stdout = collect(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = collect(stderr, chunk); });
    child.stdin.on('error', () => {}); // Docker may reject a request before stdin is delivered.
    child.once('error', error => { stderr = `Docker invocation failed: ${error.code || 'unknown'}`; finish(-1); });
    child.once('close', finish);
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function docker(context, args, options) {
  return runProcess('docker.exe', ['--context', context, ...args], options);
}

async function stopOwnedContainer(context, name, marker) {
  const inspect = await docker(context, ['inspect', '--format', '{{index .Config.Labels "ott.phase8.5f.run"}}', name], { timeoutMs: 5_000 });
  if (inspect.code !== 0) {
    if (/No such (object|container)/i.test(inspect.stderr)) return { found: false, stopped: false, verifiedAbsent: true };
    throw new Error(`Cannot verify ownership of benchmark container ${name}`);
  }
  if (inspect.stdout.trim() !== marker) throw new Error(`Container ${name} exists but is not owned by this benchmark run`);
  const kill = await docker(context, ['kill', name], { timeoutMs: 8_000 });
  const remove = await docker(context, ['rm', '--force', name], { timeoutMs: 8_000 });
  const verify = await docker(context, ['inspect', name], { timeoutMs: 5_000 });
  const verifiedAbsent = verify.code !== 0 && /No such (object|container)/i.test(verify.stderr);
  return { found: true, stopped: kill.code === 0 || remove.code === 0, verifiedAbsent };
}

async function runOwnedContainer(context, args, name, marker, input, timeoutMs) {
  const command = [...args];
  if (command[0] !== 'run' || !command.includes('--rm')) throw new Error('Benchmark must use the production isolated docker run command');
  command.splice(1, 0, '--label', `ott.phase8.5f.run=${marker}`);
  // The process timer includes Docker CLI, container creation and workload,
  // exactly like RevisionDockerExecutor.runContainer. It is not compiler-only.
  const result = await docker(context, command, { input, timeoutMs });
  if (result.timedOut || result.code !== 0 || result.outputExceeded) {
    try { result.cleanup = await stopOwnedContainer(context, name, marker); }
    catch (error) { result.cleanupError = error.message; }
  }
  return result;
}

async function requireDocker(context, args, label) {
  const result = await docker(context, args, { timeoutMs: 20_000 });
  if (result.code !== 0 || result.timedOut || result.outputExceeded) throw new Error(`${label} unavailable or failed`);
  return result.stdout.trim();
}

function safeSample(sample) {
  // No source, stdout/stderr, host mount path, credentials or environment dump.
  return {
    candidate: sample.candidate, run: sample.run, warmup: sample.warmup,
    workspaceId: sample.workspaceId ?? null,
    compileContainerName: sample.compileContainerName ?? null,
    sourceDigest: sample.sourceDigest ?? null,
    compileElapsedMs: sample.compileElapsedMs ?? null,
    totalWallMs: sample.totalWallMs ?? null,
    artifactCheckMs: sample.artifactCheckMs ?? null,
    workspaceCleanupMs: sample.workspaceCleanupMs ?? null,
    runtimeElapsedMs: sample.runtimeElapsedMs ?? null,
    containerStartupMs: null,
    compilerOnlyMs: null,
    dockerCleanupMs: null,
    compileExitCode: sample.compileExitCode ?? null,
    runtimeExitCode: sample.runtimeExitCode ?? null,
    compileTimedOut: !!sample.compileTimedOut,
    runtimeTimedOut: !!sample.runtimeTimedOut,
    artifactValid: !!sample.artifactValid,
    artifactSha256: sample.artifactSha256 ?? null,
    dependencyClosure: sample.dependencyClosure ?? null,
    legalMoveAccepted: !!sample.legalMoveAccepted,
    status: sample.status,
    cleanupVerified: sample.cleanupVerified !== false,
  };
}

async function runSample({ evidence, context, config, candidate, run, warmup, marker, request, legalMoves, expectedArch, strategySource = FIXTURE_SOURCE }) {
  const sample = { candidate: candidate.id, run, warmup, status: 'setup-failed' };
  const sampleStarted = performance.now();
  const id = randomUUID().replaceAll('-', '');
  sample.workspaceId = id;
  sample.sourceDigest = createHash('sha256').update(strategySource).digest('hex');
  const base = path.join(evidence, 'work', id);
  const sourceDir = path.join(base, 'source');
  const sdkDir = path.join(base, 'sdk');
  const outputDir = path.join(base, 'output');
  const ownedNames = [];
  try {
    await fs.mkdir(sourceDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
    await materializeStrategySdk('cpp', sdkDir);
    const wrappedSource = strategySource === FIXTURE_SOURCE ? FIXTURE_WRAPPER : wrapCppStrategySource(strategySource);
    await fs.writeFile(path.join(sourceDir, 'strategy.cpp'), wrappedSource, { mode: 0o600 });
    const compileName = `ott-source-${id}-compile`;
    sample.compileContainerName = compileName;
    ownedNames.push(compileName);
    const productionArgs = buildStrategyCppCompileDockerArgs(config, id, sourceDir, sdkDir, outputDir);
    const compileArgs = candidateCompileArgs(productionArgs, candidate);
    assertSandboxArgs(compileArgs, 'compiler');
    const compiled = await runOwnedContainer(context, compileArgs, compileName, marker, undefined, 30_000);
    sample.compileElapsedMs = compiled.elapsedMs;
    sample.compileExitCode = compiled.code;
    sample.compileTimedOut = compiled.timedOut;
    sample.cleanupVerified = !compiled.cleanupError && (!compiled.timedOut || compiled.cleanup?.verifiedAbsent === true);
    if (compiled.timedOut) { sample.status = 'compile-timeout'; return sample; }
    if (compiled.outputExceeded) { sample.status = 'compile-output-limit'; return sample; }
    if (compiled.code !== 0) { sample.status = 'compile-nonzero'; return sample; }

    const checkStarted = performance.now();
    const artifact = await fs.readFile(path.join(outputDir, 'bot'));
    sample.artifactCheckMs = Math.round(performance.now() - checkStarted);
    sample.artifactSha256 = createHash('sha256').update(artifact).digest('hex');
    sample.artifactValid = elfArchitecture(artifact) === expectedArch;
    if (!sample.artifactValid) { sample.status = 'wrong-architecture-or-artifact'; return sample; }

    const runtimeArgs = buildCppRuntimeDockerArgs(config, `${id}-runtime`, outputDir);
    assertSandboxArgs(runtimeArgs, 'runtime');
    if (!candidate.staticLink) {
      const dependencyName = `ott-source-${id}-dependencies`;
      ownedNames.push(dependencyName);
      const dependencyArgs = [...runtimeArgs];
      const nameIndex = dependencyArgs.indexOf('--name');
      dependencyArgs[nameIndex + 1] = dependencyName;
      dependencyArgs.splice(-1, 1, 'ldd', '/app/bin/bot');
      const checked = await runOwnedContainer(context, dependencyArgs, dependencyName, marker, undefined, 10_000);
      sample.dependencyClosure = checked.code === 0 && !checked.timedOut && !checked.stdout.includes('not found');
      if (!sample.dependencyClosure) { sample.status = 'dependency-closure-failed'; return sample; }
    }

    const runtimeName = `ott-source-${id}-runtime`;
    ownedNames.push(runtimeName);
    const executed = await runOwnedContainer(context, runtimeArgs, runtimeName, marker, JSON.stringify(request), 2_000);
    sample.runtimeElapsedMs = executed.elapsedMs;
    sample.runtimeExitCode = executed.code;
    sample.runtimeTimedOut = executed.timedOut;
    sample.cleanupVerified &&= !executed.cleanupError && (!executed.timedOut || executed.cleanup?.verifiedAbsent === true);
    if (executed.timedOut) { sample.status = 'runtime-timeout'; return sample; }
    if (executed.code !== 0 || executed.outputExceeded) { sample.status = 'runtime-nonzero'; return sample; }
    const parsed = parseRevisionBotResult(executed.stdout, executed.stderr, executed.code);
    sample.legalMoveAccepted = parsed.success && matchesPracticeSelectedMove(parsed.response?.move, legalMoves);
    sample.status = sample.legalMoveAccepted ? 'passed' : 'invalid-move-or-protocol';
    return sample;
  } catch (error) {
    sample.status = `benchmark-error:${error.code || 'unknown'}`;
    return sample;
  } finally {
    const workRoot = path.resolve(evidence, 'work') + path.sep;
    if (!path.resolve(base).startsWith(workRoot)) throw new Error('Refusing to remove a path outside the current benchmark work directory');
    const cleanupStarted = performance.now();
    for (const name of ownedNames) {
      try {
        const cleanup = await stopOwnedContainer(context, name, marker);
        if (!cleanup.verifiedAbsent) sample.cleanupVerified = false;
      }
      catch { sample.cleanupVerified = false; }
    }
    // Keep the isolated fixture workspace when ownership/cleanup is uncertain.
    if (sample.cleanupVerified !== false) {
      try { await fs.rm(base, { recursive: true, force: true }); }
      catch { sample.cleanupVerified = false; }
    }
    sample.workspaceCleanupMs = Math.round(performance.now() - cleanupStarted);
    sample.totalWallMs = Math.round(performance.now() - sampleStarted);
  }
}

export function summarizeCandidate(samples, candidate) {
  const measured = samples.filter(sample => !sample.warmup && sample.candidate === candidate.id);
  const completedCompilations = measured.filter(sample => !sample.compileTimedOut && sample.compileExitCode === 0);
  return {
    candidate: candidate.id,
    description: candidate.description,
    tradeoff: candidate.tradeoff,
    flags: ['-std=c++17', candidate.optimization, '-pipe', '-s', ...(candidate.staticLink ? ['-static'] : [])],
    compilerResources: { cpus: candidate.cpu, memory: candidate.memory, pids: 64 },
    measuredRuns: measured.length,
    totalWall: statistics(measured.map(sample => sample.totalWallMs).filter(Number.isFinite)),
    observedCompileWall: statistics(measured.map(sample => sample.compileElapsedMs).filter(Number.isFinite)),
    successfulCompileWall: statistics(completedCompilations.map(sample => sample.compileElapsedMs).filter(Number.isFinite)),
    // Backward-compatible name; unlike Phase 8.5F it excludes timeout-censored observations.
    compileWall: statistics(completedCompilations.map(sample => sample.compileElapsedMs).filter(Number.isFinite)),
    runtimeWall: statistics(measured.map(sample => sample.runtimeElapsedMs).filter(Number.isFinite)),
    compileTimeouts: measured.filter(sample => sample.compileTimedOut).length,
    compileNonzero: measured.filter(sample => sample.status === 'compile-nonzero').length,
    runtimeTimeouts: measured.filter(sample => sample.runtimeTimedOut).length,
    runtimeNonzero: measured.filter(sample => sample.status === 'runtime-nonzero').length,
    cleanupFailures: measured.filter(sample => !sample.cleanupVerified).length,
    passed: measured.filter(sample => sample.status === 'passed').length,
    uniqueArtifactDigests: [...new Set(measured.map(sample => sample.artifactSha256).filter(Boolean))],
    failures: measured.filter(sample => sample.status !== 'passed').map(sample => ({ run: sample.run, status: sample.status })),
    recommendation: 'Benchmark evidence only; production flags and limits unchanged.',
  };
}

export function analyzeConcurrentSamples(samples, totalWallMs) {
  const workspaceIds = samples.map(sample => sample.workspaceId).filter(Boolean);
  const containerNames = samples.map(sample => sample.compileContainerName).filter(Boolean);
  const completed = samples.length === 2;
  const isolated = new Set(workspaceIds).size === 2 && new Set(containerNames).size === 2;
  const passed = samples.filter(sample => sample.status === 'passed').length;
  const successfulArtifacts = samples.filter(sample => sample.status === 'passed').map(sample => sample.artifactSha256).filter(Boolean);
  return {
    requestedConcurrency: 2,
    completedRequests: samples.length,
    passedRequests: passed,
    failedRequests: samples.length - passed,
    totalWallMs,
    isolatedWorkspaces: isolated,
    uniqueContainerNames: new Set(containerNames).size === containerNames.length,
    distinctSourceIdentities: new Set(samples.map(sample => sample.sourceDigest).filter(Boolean)).size === 2,
    // Two distinct successful artifacts are required before isolation can be
    // verified. A timeout produces no artifact, so report unknown rather than
    // a misleading positive result.
    distinctSuccessfulArtifacts: successfulArtifacts.length === 2
      ? new Set(successfulArtifacts).size === 2
      : null,
    cleanupVerified: samples.every(sample => sample.cleanupVerified),
    status: completed && isolated && samples.every(sample => sample.cleanupVerified) && passed === 2 ? 'passed' : 'complete-with-failures',
    requests: samples,
  };
}

async function main() {
  const [evidenceArg, context, compilerImage, runtimeImage, trustedCsv, runsArg, modeArg = 'full'] = process.argv.slice(2);
  if (!evidenceArg || !context || !compilerImage || !runtimeImage || !trustedCsv) throw new Error('Missing benchmark arguments');
  const measuredRuns = Number(runsArg);
  if (!Number.isInteger(measuredRuns) || measuredRuns < 5) throw new Error('At least five measured runs are required');
  if (modeArg === 'resource-validation' && (measuredRuns < 15 || measuredRuns > 20)) {
    throw new Error('Resource validation requires 15 to 20 measured runs per configuration');
  }
  const activeCandidates = candidatesForMode(modeArg);
  const evidence = path.resolve(evidenceArg);
  const temporaryRoot = path.resolve(os.tmpdir());
  if (!evidence.toLowerCase().startsWith((temporaryRoot + path.sep).toLowerCase())) throw new Error('Evidence must be inside OS temp');
  const registry = createRuntimeImageRegistry({
    trustedRegistries: trustedCsv.split(',').map(value => value.trim()),
    cppCompilerImage: compilerImage, cppRuntimeImage: runtimeImage, python3RuntimeImage: PYTHON_IMAGE,
  }, 'sandbox-required');
  const config = { imageRegistry: registry, executionPolicy: 'sandbox-required' };
  const marker = randomUUID().replaceAll('-', '');
  const samples = [];
  const summaryPath = path.join(evidence, 'summary.json');
  try {
    const version = await requireDocker(context, ['version', '--format', '{{.Server.Version}}'], 'Docker daemon');
    const [dockerOs, dockerArch, dockerVersion] = (await requireDocker(context, ['info', '--format', '{{.OSType}}|{{.Architecture}}|{{.ServerVersion}}'], 'Docker info')).split('|');
    if (dockerOs !== 'linux') throw new Error('A Linux Docker engine is required');
    const [compilerOs, compilerArch] = (await requireDocker(context, ['image', 'inspect', '--format', '{{.Os}}|{{.Architecture}}', compilerImage], 'pinned compiler image')).split('|');
    const [runtimeOs, runtimeArch] = (await requireDocker(context, ['image', 'inspect', '--format', '{{.Os}}|{{.Architecture}}', runtimeImage], 'pinned runtime image')).split('|');
    if (compilerOs !== 'linux' || runtimeOs !== 'linux' || normalizedArch(compilerArch) !== normalizedArch(runtimeArch) || normalizedArch(dockerArch) !== normalizedArch(runtimeArch)) {
      throw new Error('Compiler, runtime and Docker engine architecture/OS differ');
    }
    const sdk = await getStrategySdkIdentity('cpp');
    const scenario = createPracticeScenario('initial');
    if (!scenario) throw new Error('Approved engine fixture is unavailable');
    const request = BotProtocol.createRequest('phase8.5f-benchmark', scenario.state, scenario.legalMoves);
    const legalMoves = serializePracticeLegalMoves(scenario.legalMoves);
    const manifest = {
      phase: modeArg === 'resource-validation' ? '8.5F.1' : '8.5F', benchmarkMode: modeArg,
      sdkVersion: sdk.version, sdkDigest: sdk.digest,
      strategySourceDigest: createHash('sha256').update(FIXTURE_SOURCE).digest('hex'),
      compilerImage, runtimeImage, dockerContext: context,
      dockerServerVersion: dockerVersion || version, dockerArchitecture: normalizedArch(dockerArch),
      hostPlatform: process.platform, hostArchitecture: process.arch,
      hostCpuCount: os.cpus().length, hostTotalMemoryGiB: Math.round(os.totalmem() / (1024 ** 3)),
      compileBudgetMs: 30_000, runtimeBudgetMs: 2_000,
      warmupRunsPerCandidate: 1, measuredRunsPerCandidate: measuredRuns,
      coldStartMeasured: false,
      p95Definition: 'Nearest-rank p95. Timeout observations are reported separately and excluded from successful compilation-time statistics.',
      timingLimitations: 'Compile wall includes Docker CLI/container startup and g++; runtime wall includes Docker startup and Bot. Docker startup, compiler-only and Docker cleanup are not separately measured. Workspace cleanup is separate.',
      productionCompilerArgvTemplate: buildStrategyCppCompileDockerArgs(config, 'benchmark-template', '<isolated-source>', '<isolated-sdk>', '<isolated-output>'),
      productionRuntimeArgvTemplate: buildCppRuntimeDockerArgs(config, 'benchmark-template', '<isolated-output>'),
      candidates: activeCandidates.map(candidate => ({
        ...candidate,
        compilerArgvTemplate: candidateCompileArgs(
          buildStrategyCppCompileDockerArgs(config, 'benchmark-template', '<isolated-source>', '<isolated-sdk>', '<isolated-output>'),
          candidate,
        ),
      })),
    };
    await fs.writeFile(path.join(evidence, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const recordSample = async (candidate, run, warmup) => {
      const sample = safeSample(await runSample({
        evidence, context, config, candidate, run, warmup, marker,
        request, legalMoves, expectedArch: normalizedArch(runtimeArch),
      }));
      samples.push(sample);
      await fs.appendFile(path.join(evidence, 'samples.jsonl'), JSON.stringify(sample) + '\n');
      console.log(`${candidate.id} ${warmup ? 'warm-up' : `run ${run}`}: ${sample.status}, compile=${sample.compileElapsedMs ?? 'n/a'}ms`);
      return sample;
    };

    if (modeArg === 'resource-validation') {
      for (const candidate of activeCandidates) await recordSample(candidate, 0, true);
      for (const scheduled of balancedCandidateSchedule(activeCandidates, measuredRuns)) {
        await recordSample(scheduled.candidate, scheduled.run, false);
      }
    } else {
      // Preserve the original Phase 8.5F candidate ordering and dynamic-link
      // compatibility probe for existing operator workflows.
      for (const candidate of activeCandidates) {
        for (let run = 0; run <= measuredRuns; run += 1) {
          const sample = await recordSample(candidate, run, run === 0);
          if (candidate.id === 'dynamic' && run === 0 && sample.status === 'dependency-closure-failed') {
            console.log('Dynamic candidate unsupported by pinned runtime dependency check; measured runs skipped with explicit reason.');
            break;
          }
        }
      }
    }

    let concurrency = null;
    if (modeArg === 'resource-validation') {
      const concurrentSources = [
        FIXTURE_SOURCE,
        'static volatile int phase85f1Marker = 2; Move chooseMove(const GameState&, const std::vector<Move>& legalMoves) { (void)phase85f1Marker; return legalMoves.front(); }',
      ];
      const concurrencyStarted = performance.now();
      const concurrentSamples = await Promise.all(concurrentSources.map((strategySource, index) => runSample({
        evidence, context, config,
        candidate: activeCandidates.find(candidate => candidate.id === 'compiler-resources'),
        run: index + 1, warmup: false, marker, request, legalMoves,
        expectedArch: normalizedArch(runtimeArch), strategySource,
      })));
      concurrency = analyzeConcurrentSamples(concurrentSamples.map(safeSample), Math.round(performance.now() - concurrencyStarted));
      await fs.writeFile(path.join(evidence, 'concurrency.json'), JSON.stringify(concurrency, null, 2));
      console.log(`concurrency 2: ${concurrency.status}, passed=${concurrency.passedRequests}/2, cleanup=${concurrency.cleanupVerified}`);
    }

    const summaries = activeCandidates.map(candidate => summarizeCandidate(samples, candidate));
    const complete = summaries.every(item => item.measuredRuns === measuredRuns || (item.candidate === 'dynamic' && samples.some(sample => sample.candidate === 'dynamic' && sample.status === 'dependency-closure-failed')));
    const anyFailures = summaries.some(item => item.failures.length > 0 || item.cleanupFailures > 0) || (concurrency && concurrency.status !== 'passed');
    const finalStatus = !complete ? 'incomplete' : anyFailures ? 'complete-with-failures' : 'complete';
    await fs.writeFile(summaryPath, JSON.stringify({ status: finalStatus, manifest, configurations: summaries, concurrency }, null, 2));
    const csv = ['candidate,run,warmup,status,totalWallMs,compileElapsedMs,runtimeElapsedMs,workspaceCleanupMs,compileTimedOut,runtimeTimedOut,artifactValid,legalMoveAccepted,workspaceId,compileContainerName,sourceDigest',
      ...samples.map(s => [s.candidate, s.run, s.warmup, s.status, s.totalWallMs ?? '', s.compileElapsedMs ?? '', s.runtimeElapsedMs ?? '', s.workspaceCleanupMs ?? '', s.compileTimedOut, s.runtimeTimedOut, s.artifactValid, s.legalMoveAccepted, s.workspaceId ?? '', s.compileContainerName ?? '', s.sourceDigest ?? ''].join(','))];
    await fs.writeFile(path.join(evidence, 'samples.csv'), csv.join('\n') + '\n');
    const markdown = [
      `# Phase ${modeArg === 'resource-validation' ? '8.5F.1 compiler-resource validation' : '8.5F C++ Strategy benchmark'}`, '',
      `SDK ${sdk.version} / ${sdk.digest}; compiler ${compilerImage}; runtime ${runtimeImage}.`,
      `Result: **${finalStatus.toUpperCase()}**. Wall time includes Docker startup. Warm-up rows are excluded. Timeout samples are censored and retained in samples.jsonl/CSV but excluded from successful compilation statistics.`, '',
      '| Candidate | Measured | Successful compile median | Min | Max | p95 | Censored timeouts | Other failures | Cleanup failures | Passed |',
      '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
      ...summaries.map(s => `| ${s.candidate} | ${s.measuredRuns} | ${s.successfulCompileWall?.medianMs ?? 'n/a'} | ${s.successfulCompileWall?.minMs ?? 'n/a'} | ${s.successfulCompileWall?.maxMs ?? 'n/a'} | ${s.successfulCompileWall?.p95Ms ?? 'n/a'} | ${s.compileTimeouts} | ${s.failures.length - s.compileTimeouts} | ${s.cleanupFailures} | ${s.passed} |`),
      ...(concurrency ? ['', `Concurrency (exactly 2): ${concurrency.status}; ${concurrency.passedRequests}/2 passed; isolated workspaces=${concurrency.isolatedWorkspaces}; cleanup=${concurrency.cleanupVerified}.`] : []),
      '', 'No production compiler configuration or timeout is changed by this benchmark.',
    ];
    await fs.writeFile(path.join(evidence, 'summary.md'), markdown.join('\n') + '\n');
    if (!complete) throw new Error('Benchmark did not record every scheduled measured sample');
    if (finalStatus === 'complete-with-failures') console.log('BENCHMARK COMPLETE WITH FAILURES; evidence is complete and production remains unchanged.');
  } catch (error) {
    await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ status: 'failed', message: String(error.message).slice(0, 300) }, null, 2));
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`BENCHMARK FAILED: ${String(error.message).slice(0, 300)}`); process.exitCode = 1; });
}
