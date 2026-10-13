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
import { assertSandboxArgs, elfArchitecture } from './phase8.5f-benchmark.mjs';

const PYTHON_IMAGE = 'docker.io/library/python@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258';
const FIXTURE_SOURCE = 'Move chooseMove(const GameState&, const std::vector<Move>& legalMoves) { return legalMoves.front(); }';
const OUTPUT_LIMIT = 64 * 1024;

export const DIAGNOSTIC_VARIANTS = Object.freeze([
  { id: 'minimal-container', description: 'Pinned compiler image, production sandbox, no mounts, fixed /usr/bin/true command', compiles: false, workspace: 'none' },
  { id: 'bind-mounted-noop', description: 'Production source/SDK/output bind mounts with fixed /usr/bin/true command', compiles: false, workspace: 'windows-bind' },
  { id: 'bind-mounted-compile', description: 'Exact production C++ compile command over isolated Windows bind mounts', compiles: true, workspace: 'windows-bind' },
  { id: 'linux-volume-compile', description: 'Same bytes and compile command over isolated Docker named volumes', compiles: true, workspace: 'linux-volume' },
]);

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseStateTiming(state, hostInvocationMs) {
  const started = Date.parse(state?.StartedAt || '');
  const finished = Date.parse(state?.FinishedAt || '');
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) {
    return { containerProcessMs: null, combinedNonProcessOverheadMs: null, timingComplete: false };
  }
  const containerProcessMs = finished - started;
  return {
    containerProcessMs,
    combinedNonProcessOverheadMs: Number.isFinite(hostInvocationMs) ? Math.max(0, hostInvocationMs - containerProcessMs) : null,
    timingComplete: true,
  };
}

function parseKeyValues(text) {
  const entries = String(text || '').trim().split(/\r?\n/).map(line => line.trim().split(/\s+/)).filter(parts => parts.length === 2);
  if (!entries.length) return null;
  const result = {};
  for (const [key, value] of entries) {
    const number = finiteNumber(value);
    if (number !== null) result[key] = number;
  }
  return Object.keys(result).length ? result : null;
}

export function parseCpuStat(text) {
  const raw = parseKeyValues(text);
  if (!raw || raw.usage_usec === undefined) return null;
  return {
    usageUsec: raw.usage_usec,
    nrPeriods: raw.nr_periods ?? null,
    nrThrottled: raw.nr_throttled ?? null,
    throttledUsec: raw.throttled_usec ?? null,
  };
}

export function parseMemoryEvents(text) {
  const raw = parseKeyValues(text);
  if (!raw) return null;
  return {
    low: raw.low ?? null,
    high: raw.high ?? null,
    max: raw.max ?? null,
    oom: raw.oom ?? null,
    oomKill: raw.oom_kill ?? null,
  };
}

function parseByteSize(value) {
  const match = String(value || '').trim().match(/^([0-9.]+)\s*([KMGT]?i?B|B)$/i);
  if (!match) return null;
  const number = Number(match[1]);
  const unit = match[2].toUpperCase();
  const factors = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4 };
  return Math.round(number * factors[unit]);
}

function normalizedArch(value) {
  if (value === 'x86_64') return 'amd64';
  if (value === 'aarch64') return 'arm64';
  return value;
}

export function parseDockerStats(text) {
  const [cpuText, memoryText, blockText] = String(text || '').trim().split('|');
  if (!cpuText || !memoryText || !blockText) return null;
  const cpuPercent = Number(cpuText.replace('%', '').trim());
  const [memory, memoryLimit] = memoryText.split('/').map(value => parseByteSize(value));
  const [blockRead, blockWrite] = blockText.split('/').map(value => parseByteSize(value));
  if (!Number.isFinite(cpuPercent)) return null;
  return {
    cpuPercent,
    memoryBytes: memory,
    memoryLimitBytes: memoryLimit,
    blockReadBytes: blockRead,
    blockWriteBytes: blockWrite,
  };
}

export function statistics(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    minMs: sorted[0],
    medianMs: sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2),
    maxMs: sorted.at(-1),
    p95Ms: sorted.length >= 5 ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null,
  };
}

export function variantSchedule(variants, measuredRuns) {
  const schedule = [];
  for (let run = 1; run <= measuredRuns; run += 1) {
    const offset = (run - 1) % variants.length;
    const ordered = [...variants.slice(offset), ...variants.slice(0, offset)];
    for (const variant of ordered) schedule.push({ variant, run });
  }
  return schedule;
}

export function summarizeDiagnosticSamples(samples, variant) {
  const measured = samples.filter(sample => !sample.warmup && sample.variant === variant.id);
  const completed = measured.filter(sample => !sample.timedOut && sample.status === 'passed');
  return {
    variant: variant.id,
    description: variant.description,
    measuredRuns: measured.length,
    completed: completed.length,
    timeouts: measured.filter(sample => sample.timedOut).length,
    failures: measured.filter(sample => sample.status !== 'passed').map(sample => ({ run: sample.run, status: sample.status })),
    cleanupFailures: measured.filter(sample => !sample.cleanupVerified).length,
    observedHostWall: statistics(measured.map(sample => sample.hostInvocationMs)),
    completedHostWall: statistics(completed.map(sample => sample.hostInvocationMs)),
    completedContainerProcess: statistics(completed.map(sample => sample.containerProcessMs)),
    completedCombinedNonProcessOverhead: statistics(completed.map(sample => sample.combinedNonProcessOverheadMs)),
    maxSampledCpuPercent: measured.reduce((max, sample) => Math.max(max, sample.resources?.maxSampledCpuPercent ?? 0), 0) || null,
    maxSampledMemoryBytes: measured.reduce((max, sample) => Math.max(max, sample.resources?.maxSampledMemoryBytes ?? 0), 0) || null,
    oomKilled: measured.filter(sample => sample.oomKilled).length,
    artifactDigests: [...new Set(completed.map(sample => sample.artifactSha256).filter(Boolean))],
  };
}

export function analyzeConcurrentDiagnostics(samples, totalWallMs) {
  const workspaceIds = samples.map(sample => sample.workspaceId).filter(Boolean);
  const containerNames = samples.map(sample => sample.containerName).filter(Boolean);
  const artifacts = samples.filter(sample => sample.status === 'passed').map(sample => sample.artifactSha256).filter(Boolean);
  const isolatedWorkspaces = workspaceIds.length === 2 && new Set(workspaceIds).size === 2 && new Set(containerNames).size === 2;
  const artifactIsolation = artifacts.length === 2 && new Set(artifacts).size === 2 ? 'verified' : 'unverified';
  const cleanupVerified = samples.length === 2 && samples.every(sample => sample.cleanupVerified);
  const passed = samples.filter(sample => sample.status === 'passed').length;
  return {
    requestedConcurrency: 2,
    completedRequests: samples.length,
    passedRequests: passed,
    failedRequests: samples.length - passed,
    totalWallMs,
    isolatedWorkspaces,
    uniqueContainerNames: new Set(containerNames).size === containerNames.length,
    artifactIsolation,
    cleanupVerified,
    status: samples.length === 2 && passed === 2 && isolatedWorkspaces && artifactIsolation === 'verified' && cleanupVerified ? 'passed' : 'complete-with-failures',
    requests: samples,
  };
}

function runProcess(binary, args, { input, timeoutMs = 20_000 } = {}) {
  return new Promise(resolve => {
    const started = performance.now();
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const collect = (current, chunk) => (current + Buffer.from(chunk).toString('utf8')).slice(0, OUTPUT_LIMIT);
    const finish = code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, elapsedMs: Math.round(performance.now() - started) });
    };
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.on('data', chunk => { stdout = collect(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = collect(stderr, chunk); });
    child.stdin.on('error', () => {});
    child.once('error', error => { stderr = `Docker invocation failed: ${error.code || 'unknown'}`; finish(-1); });
    child.once('close', finish);
    child.stdin.end(input);
  });
}

async function docker(context, args, options) {
  return runProcess('docker.exe', ['--context', context, ...args], options);
}

async function requireDocker(context, args, label) {
  const result = await docker(context, args, { timeoutMs: 20_000 });
  if (result.code !== 0 || result.timedOut) throw new Error(`${label} unavailable or failed`);
  return result.stdout.trim();
}

function commandWithLabel(args, marker) {
  const command = args.filter(arg => arg !== '--rm');
  if (command[0] !== 'run') throw new Error('Diagnostic command must use docker run');
  command.splice(1, 0, '--label', `ott.phase8.5g.run=${marker}`);
  return command;
}

async function inspectOwned(context, name, marker) {
  const result = await docker(context, ['inspect', name], { timeoutMs: 5_000 });
  if (result.code !== 0) {
    if (/No such (object|container)/i.test(result.stderr)) return null;
    throw new Error(`Cannot inspect diagnostic container ${name}`);
  }
  const details = JSON.parse(result.stdout)[0];
  if (details?.Config?.Labels?.['ott.phase8.5g.run'] !== marker) throw new Error(`Refusing to manage unowned container ${name}`);
  return details;
}

async function removeOwnedContainer(context, name, marker) {
  const existing = await inspectOwned(context, name, marker);
  if (existing) await docker(context, ['rm', '--force', name], { timeoutMs: 10_000 });
  return (await inspectOwned(context, name, marker)) === null;
}

async function collectResourceSample(context, name) {
  const [stats, cpu, memory] = await Promise.all([
    docker(context, ['stats', '--no-stream', '--format', '{{.CPUPerc}}|{{.MemUsage}}|{{.BlockIO}}', name], { timeoutMs: 5_000 }),
    docker(context, ['exec', name, 'cat', '/sys/fs/cgroup/cpu.stat'], { timeoutMs: 5_000 }),
    docker(context, ['exec', name, 'cat', '/sys/fs/cgroup/memory.events'], { timeoutMs: 5_000 }),
  ]);
  return {
    dockerStats: stats.code === 0 ? parseDockerStats(stats.stdout) : null,
    cpuStat: cpu.code === 0 ? parseCpuStat(cpu.stdout) : null,
    memoryEvents: memory.code === 0 ? parseMemoryEvents(memory.stdout) : null,
  };
}

function summarizeResources(samples) {
  const stats = samples.map(sample => sample.dockerStats).filter(Boolean);
  const cpu = samples.map(sample => sample.cpuStat).filter(Boolean).at(-1) ?? null;
  const memory = samples.map(sample => sample.memoryEvents).filter(Boolean).at(-1) ?? null;
  return {
    sampleCount: samples.length,
    maxSampledCpuPercent: stats.length ? Math.max(...stats.map(item => item.cpuPercent)) : null,
    maxSampledMemoryBytes: stats.some(item => Number.isFinite(item.memoryBytes)) ? Math.max(...stats.map(item => item.memoryBytes ?? 0)) : null,
    lastSampledBlockReadBytes: stats.at(-1)?.blockReadBytes ?? null,
    lastSampledBlockWriteBytes: stats.at(-1)?.blockWriteBytes ?? null,
    finalObservedCpuStat: cpu,
    finalObservedMemoryEvents: memory,
    limitation: 'docker stats and cgroup values are periodic samples, not guaranteed peaks; exec-based sampling may add small diagnostic overhead.',
  };
}

async function runTrackedContainer({ context, args, name, marker, timeoutMs, input }) {
  const command = commandWithLabel(args, marker);
  const started = performance.now();
  const child = spawn('docker.exe', ['--context', context, ...command], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let closed = false;
  const collect = (current, chunk) => (current + Buffer.from(chunk).toString('utf8')).slice(0, OUTPUT_LIMIT);
  child.stdout.on('data', chunk => { stdout = collect(stdout, chunk); });
  child.stderr.on('data', chunk => { stderr = collect(stderr, chunk); });
  child.stdin.on('error', () => {});
  child.stdin.end(input);

  const closePromise = new Promise(resolve => {
    child.once('error', error => { stderr = `Docker invocation failed: ${error.code || 'unknown'}`; resolve(-1); });
    child.once('close', code => resolve(code));
  });
  const timer = setTimeout(() => {
    timedOut = true;
    void docker(context, ['kill', name], { timeoutMs: 8_000 });
    setTimeout(() => { if (!closed) child.kill(); }, 5_000);
  }, timeoutMs);
  const resourceSamples = [];
  const monitor = (async () => {
    while (!closed) {
      await new Promise(resolve => setTimeout(resolve, 2_000));
      if (closed) break;
      try {
        const sample = await collectResourceSample(context, name);
        if (sample.dockerStats || sample.cpuStat || sample.memoryEvents) resourceSamples.push(sample);
      } catch { /* Unavailable sampling is recorded by an empty sample set. */ }
    }
  })();

  const dockerExitCode = await closePromise;
  closed = true;
  clearTimeout(timer);
  const hostInvocationMs = Math.round(performance.now() - started);
  await monitor;
  let details = null;
  try { details = await inspectOwned(context, name, marker); } catch { details = null; }
  const state = details?.State ?? null;
  const timing = parseStateTiming(state, hostInvocationMs);
  const cleanupStarted = performance.now();
  let cleanupVerified = false;
  try { cleanupVerified = await removeOwnedContainer(context, name, marker); } catch { cleanupVerified = false; }
  return {
    dockerExitCode,
    containerExitCode: state?.ExitCode ?? null,
    stateErrorPresent: Boolean(state?.Error),
    oomKilled: Boolean(state?.OOMKilled),
    terminationSignal: timedOut && state?.ExitCode === 137 ? 'SIGKILL' : null,
    timedOut,
    hostInvocationMs,
    ...timing,
    cleanupMs: Math.round(performance.now() - cleanupStarted),
    cleanupVerified,
    resources: summarizeResources(resourceSamples),
    stdout,
    stderr,
  };
}

function replaceContainerCommand(args, image, command) {
  const imageIndex = args.indexOf(image);
  if (imageIndex < 0) throw new Error('Pinned compiler image missing from production command');
  return [...args.slice(0, imageIndex + 1), ...command];
}

function removeMounts(args) {
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '-v') { index += 1; continue; }
    result.push(args[index]);
  }
  return result;
}

function replaceMountValues(args, mounts) {
  const result = [...args];
  let mountIndex = 0;
  for (let index = 0; index < result.length; index += 1) {
    if (result[index] === '-v') result[index + 1] = mounts[mountIndex++];
  }
  if (mountIndex !== mounts.length) throw new Error('Unexpected production mount count');
  return result;
}

function fixedUtilityArgs({ image, name, marker, user = '0', mounts, command }) {
  return [
    'run', '--rm', '--pull=never', '--name', name, '--label', `ott.phase8.5g.run=${marker}`,
    '--network', 'none', '--memory', '256m', '--cpus', '1', '--pids-limit', '64',
    '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=10m',
    '--security-opt', 'no-new-privileges:true', '--cap-drop', 'ALL', '--user', user,
    ...mounts.flatMap(value => ['-v', value]), image, ...command,
  ];
}

async function createOwnedVolume(context, name, marker) {
  const result = await docker(context, ['volume', 'create', '--label', `ott.phase8.5g.run=${marker}`, name], { timeoutMs: 10_000 });
  if (result.code !== 0) throw new Error(`Cannot create diagnostic volume ${name}`);
}

async function removeOwnedVolume(context, name, marker) {
  const inspect = await docker(context, ['volume', 'inspect', name], { timeoutMs: 5_000 });
  if (inspect.code !== 0 && /no such volume/i.test(inspect.stderr)) return true;
  if (inspect.code !== 0) throw new Error(`Cannot inspect diagnostic volume ${name}`);
  const details = JSON.parse(inspect.stdout)[0];
  if (details?.Labels?.['ott.phase8.5g.run'] !== marker) throw new Error(`Refusing to remove unowned volume ${name}`);
  await docker(context, ['volume', 'rm', '--force', name], { timeoutMs: 10_000 });
  const verify = await docker(context, ['volume', 'inspect', name], { timeoutMs: 5_000 });
  return verify.code !== 0 && /no such volume/i.test(verify.stderr);
}

async function prepareVolumeWorkspace({ context, compilerImage, sourceDir, sdkDir, outputDir, id, marker }) {
  const started = performance.now();
  const volumes = {
    source: `ott85g-${id}-source`, sdk: `ott85g-${id}-sdk`, output: `ott85g-${id}-output`,
  };
  const created = [];
  try {
    for (const name of Object.values(volumes)) {
      await createOwnedVolume(context, name, marker);
      created.push(name);
    }
    const runUtility = async (suffix, mounts, command, user = '0') => {
      const name = `ott85g-${id}-${suffix}`;
      const result = await docker(context, fixedUtilityArgs({ image: compilerImage, name, marker, user, mounts, command }), { timeoutMs: 20_000 });
      if (result.code !== 0 || result.timedOut) {
        try { await removeOwnedContainer(context, name, marker); } catch { /* Preserve the original staging failure. */ }
        throw new Error(`Volume staging step ${suffix} failed`);
      }
      return result;
    };
    await runUtility('stage-source', [`${sourceDir}:/staging:ro`, `${volumes.source}:/workspace:rw`], ['cp', '-R', '/staging/.', '/workspace/']);
    await runUtility('stage-sdk', [`${sdkDir}:/staging:ro`, `${volumes.sdk}:/workspace:rw`], ['cp', '-R', '/staging/.', '/workspace/']);
    await runUtility('permissions-source', [`${volumes.source}:/workspace:rw`], ['chmod', '-R', 'a+rX,go-w', '/workspace/']);
    await runUtility('permissions-sdk', [`${volumes.sdk}:/workspace:rw`], ['chmod', '-R', 'a+rX,go-w', '/workspace/']);
    await runUtility('permissions-output', [`${volumes.output}:/workspace:rw`], ['chmod', '0777', '/workspace/']);

    const sourceHash = await runUtility('hash-source', [`${volumes.source}:/workspace:ro`], ['sha256sum', '/workspace/strategy.cpp'], '65532:65532');
    const sdkHash = await runUtility('hash-sdk', [`${volumes.sdk}:/workspace:ro`], ['sha256sum', '/workspace/ott_strategy_sdk.hpp'], '65532:65532');
    const expectedSourceHash = createHash('sha256').update(await fs.readFile(path.join(sourceDir, 'strategy.cpp'))).digest('hex');
    const expectedSdkHash = createHash('sha256').update(await fs.readFile(path.join(sdkDir, 'ott_strategy_sdk.hpp'))).digest('hex');
    if (!sourceHash.stdout.startsWith(expectedSourceHash) || !sdkHash.stdout.startsWith(expectedSdkHash)) throw new Error('Linux-volume staged bytes do not match the isolated bind fixture');
    return { volumes, preparationMs: Math.round(performance.now() - started), contentVerified: true };
  } catch (error) {
    for (const name of created) {
      try { await removeOwnedVolume(context, name, marker); } catch { /* Best effort; ownership remains labelled. */ }
    }
    throw error;
  }
}

async function extractVolumeArtifact({ context, compilerImage, outputVolume, outputDir, id, marker }) {
  const args = fixedUtilityArgs({
    image: compilerImage, name: `ott85g-${id}-extract`, marker, user: '65532:65532',
    mounts: [`${outputVolume}:/workspace:ro`, `${outputDir}:/export:rw`],
    command: ['cp', '/workspace/bot', '/export/bot'],
  });
  const result = await docker(context, args, { timeoutMs: 20_000 });
  if (result.code !== 0 || result.timedOut) {
    try { await removeOwnedContainer(context, `ott85g-${id}-extract`, marker); } catch { /* Preserve extraction error. */ }
    throw new Error('Cannot extract volume artifact into isolated evidence workspace');
  }
}

function safeExecution(result) {
  return {
    dockerExitCode: result.dockerExitCode,
    containerExitCode: result.containerExitCode,
    stateErrorPresent: result.stateErrorPresent,
    oomKilled: result.oomKilled,
    terminationSignal: result.terminationSignal,
    timedOut: result.timedOut,
    hostInvocationMs: result.hostInvocationMs,
    containerProcessMs: result.containerProcessMs,
    combinedNonProcessOverheadMs: result.combinedNonProcessOverheadMs,
    timingComplete: result.timingComplete,
    cleanupMs: result.cleanupMs,
    cleanupVerified: result.cleanupVerified,
    resources: result.resources,
  };
}

async function runDiagnosticSample({ evidence, context, config, compilerImage, variant, run, warmup, marker, request, legalMoves, expectedArch, strategySource = FIXTURE_SOURCE }) {
  const id = randomUUID().replaceAll('-', '');
  const base = path.join(evidence, 'work', id);
  const sourceDir = path.join(base, 'source');
  const sdkDir = path.join(base, 'sdk');
  const outputDir = path.join(base, 'output');
  const sample = {
    variant: variant.id, run, warmup, workspaceId: id,
    sourceDigest: createHash('sha256').update(strategySource).digest('hex'),
    status: 'setup-failed', cleanupVerified: true,
  };
  let volumeWorkspace = null;
  try {
    await fs.mkdir(sourceDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
    await materializeStrategySdk('cpp', sdkDir);
    await fs.writeFile(path.join(sourceDir, 'strategy.cpp'), wrapCppStrategySource(strategySource), { mode: 0o600 });
    const productionArgs = buildStrategyCppCompileDockerArgs(config, id, sourceDir, sdkDir, outputDir);
    assertSandboxArgs(productionArgs, 'compiler');
    let args = productionArgs;
    if (variant.id === 'minimal-container') {
      args = replaceContainerCommand(removeMounts(productionArgs), compilerImage, ['/usr/bin/true']);
    } else if (variant.id === 'bind-mounted-noop') {
      args = replaceContainerCommand(productionArgs, compilerImage, ['/usr/bin/true']);
    } else if (variant.id === 'linux-volume-compile') {
      volumeWorkspace = await prepareVolumeWorkspace({ context, compilerImage, sourceDir, sdkDir, outputDir, id, marker });
      sample.workspacePreparationMs = volumeWorkspace.preparationMs;
      sample.volumeContentVerified = volumeWorkspace.contentVerified;
      args = replaceMountValues(productionArgs, [
        `${volumeWorkspace.volumes.source}:/app/source:ro`,
        `${volumeWorkspace.volumes.sdk}:/app/sdk:ro`,
        `${volumeWorkspace.volumes.output}:/app/output:rw`,
      ]);
      assertSandboxArgs(args, 'compiler');
    }
    const name = `ott-source-${id}-compile`;
    sample.containerName = name;
    const result = await runTrackedContainer({ context, args, name, marker, timeoutMs: variant.compiles ? 30_000 : 10_000 });
    Object.assign(sample, safeExecution(result));
    if (result.timedOut) { sample.status = 'timeout'; return sample; }
    if (result.containerExitCode !== 0 || result.dockerExitCode !== 0) { sample.status = 'nonzero'; return sample; }
    if (!variant.compiles) { sample.status = 'passed'; return sample; }

    if (volumeWorkspace) {
      await extractVolumeArtifact({ context, compilerImage, outputVolume: volumeWorkspace.volumes.output, outputDir, id, marker });
    }
    const artifact = await fs.readFile(path.join(outputDir, 'bot'));
    sample.artifactSha256 = createHash('sha256').update(artifact).digest('hex');
    sample.artifactValid = elfArchitecture(artifact) === expectedArch;
    if (!sample.artifactValid) { sample.status = 'invalid-artifact'; return sample; }

    const runtimeArgs = buildCppRuntimeDockerArgs(config, `${id}-runtime`, outputDir);
    assertSandboxArgs(runtimeArgs, 'runtime');
    const runtimeName = `ott-source-${id}-runtime`;
    const runtime = await runTrackedContainer({ context, args: runtimeArgs, name: runtimeName, marker, timeoutMs: 2_000, input: JSON.stringify(request) });
    sample.runtime = safeExecution(runtime);
    sample.cleanupVerified &&= runtime.cleanupVerified;
    if (runtime.timedOut || runtime.containerExitCode !== 0 || runtime.dockerExitCode !== 0) { sample.status = 'runtime-failed'; return sample; }
    const parsed = parseRevisionBotResult(runtime.stdout, runtime.stderr, runtime.containerExitCode);
    sample.legalMoveAccepted = parsed.success && matchesPracticeSelectedMove(parsed.response?.move, legalMoves);
    sample.status = sample.legalMoveAccepted ? 'passed' : 'invalid-move-or-protocol';
    return sample;
  } catch (error) {
    sample.status = `diagnostic-error:${error.code || 'unknown'}`;
    sample.safeError = String(error.message).slice(0, 160);
    return sample;
  } finally {
    if (volumeWorkspace) {
      for (const name of Object.values(volumeWorkspace.volumes)) {
        try { sample.cleanupVerified &&= await removeOwnedVolume(context, name, marker); }
        catch { sample.cleanupVerified = false; }
      }
    }
    const workRoot = path.resolve(evidence, 'work') + path.sep;
    if (!path.resolve(base).startsWith(workRoot)) throw new Error('Refusing to remove a path outside the diagnostic work directory');
    if (sample.cleanupVerified) {
      try { await fs.rm(base, { recursive: true, force: true }); }
      catch { sample.cleanupVerified = false; }
    }
  }
}

function safeSample(sample) {
  const { safeError, ...rest } = sample;
  return { ...rest, ...(safeError ? { safeError } : {}) };
}

async function main() {
  const [evidenceArg, context, compilerImage, runtimeImage, trustedCsv, runsArg] = process.argv.slice(2);
  const measuredRuns = Number(runsArg);
  if (!evidenceArg || !context || !compilerImage || !runtimeImage || !trustedCsv || !Number.isInteger(measuredRuns) || measuredRuns < 2 || measuredRuns > 5) {
    throw new Error('Expected evidence, Docker/image configuration and 2-5 measured runs');
  }
  const evidence = path.resolve(evidenceArg);
  const tempRoot = path.resolve(os.tmpdir()) + path.sep;
  if (!evidence.toLowerCase().startsWith(tempRoot.toLowerCase())) throw new Error('Evidence must be inside OS temp');
  const registry = createRuntimeImageRegistry({
    trustedRegistries: trustedCsv.split(',').map(value => value.trim()),
    cppCompilerImage: compilerImage, cppRuntimeImage: runtimeImage, python3RuntimeImage: PYTHON_IMAGE,
  }, 'sandbox-required');
  const config = { imageRegistry: registry, executionPolicy: 'sandbox-required' };
  const marker = randomUUID().replaceAll('-', '');
  const samples = [];
  try {
    const version = await requireDocker(context, ['version', '--format', '{{.Server.Version}}'], 'Docker daemon');
    const [dockerOs, dockerArch] = (await requireDocker(context, ['info', '--format', '{{.OSType}}|{{.Architecture}}'], 'Docker info')).split('|');
    if (dockerOs !== 'linux') throw new Error('A Linux Docker engine is required');
    const [compilerOs, compilerArch] = (await requireDocker(context, ['image', 'inspect', '--format', '{{.Os}}|{{.Architecture}}', compilerImage], 'compiler image')).split('|');
    const [runtimeOs, runtimeArch] = (await requireDocker(context, ['image', 'inspect', '--format', '{{.Os}}|{{.Architecture}}', runtimeImage], 'runtime image')).split('|');
    if (compilerOs !== 'linux' || runtimeOs !== 'linux' || normalizedArch(compilerArch) !== normalizedArch(runtimeArch) || normalizedArch(dockerArch) !== normalizedArch(runtimeArch)) throw new Error('Docker/compiler/runtime architecture mismatch');
    const sdk = await getStrategySdkIdentity('cpp');
    const scenario = createPracticeScenario('initial');
    if (!scenario) throw new Error('Approved engine fixture unavailable');
    const request = BotProtocol.createRequest('phase8.5g-diagnostic', scenario.state, scenario.legalMoves);
    const legalMoves = serializePracticeLegalMoves(scenario.legalMoves);
    const manifest = {
      phase: '8.5G', dockerContext: context, dockerServerVersion: version, dockerOs, dockerArchitecture: dockerArch,
      compilerImage, runtimeImage, sdkVersion: sdk.version, sdkDigest: sdk.digest,
      fixtureSourceDigest: createHash('sha256').update(FIXTURE_SOURCE).digest('hex'),
      hostPlatform: process.platform, hostArchitecture: process.arch, hostCpuCount: os.cpus().length,
      hostTotalMemoryGiB: Math.round(os.totalmem() / (1024 ** 3)),
      compileBudgetMs: 30_000, runtimeBudgetMs: 2_000, measuredRunsPerVariant: measuredRuns,
      variants: DIAGNOSTIC_VARIANTS,
      timingDefinition: 'Host invocation measures docker CLI run until process exit. Container process uses Docker State StartedAt/FinishedAt. Their difference is combined non-process overhead, not pure startup.',
      monitoringLimitation: 'Resource values are periodic docker stats/cgroup observations and may perturb the workload slightly; no unobserved peak is inferred.',
      productionCompilerArgvTemplate: buildStrategyCppCompileDockerArgs(config, 'diagnostic-template', '<source>', '<sdk>', '<output>'),
    };
    await fs.writeFile(path.join(evidence, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const record = async (variant, run, warmup) => {
      const sample = safeSample(await runDiagnosticSample({
        evidence, context, config, compilerImage, variant, run, warmup, marker,
        request, legalMoves, expectedArch: normalizedArch(runtimeArch),
      }));
      samples.push(sample);
      await fs.appendFile(path.join(evidence, 'samples.jsonl'), JSON.stringify(sample) + '\n');
      console.log(`${variant.id} ${warmup ? 'warm-up' : `run ${run}`}: ${sample.status}; host=${sample.hostInvocationMs ?? 'n/a'}ms container=${sample.containerProcessMs ?? 'n/a'}ms`);
    };
    for (const variant of DIAGNOSTIC_VARIANTS) await record(variant, 0, true);
    for (const item of variantSchedule(DIAGNOSTIC_VARIANTS, measuredRuns)) await record(item.variant, item.run, false);

    const concurrentSources = [
      FIXTURE_SOURCE,
      'static volatile int phase85gMarker = 2; Move chooseMove(const GameState&, const std::vector<Move>& legalMoves) { (void)phase85gMarker; return legalMoves.front(); }',
    ];
    const concurrentVariant = DIAGNOSTIC_VARIANTS.find(item => item.id === 'bind-mounted-compile');
    const concurrentStarted = performance.now();
    const concurrentSamples = await Promise.all(concurrentSources.map((strategySource, index) => runDiagnosticSample({
      evidence, context, config, compilerImage, variant: concurrentVariant, run: index + 1, warmup: false, marker,
      request, legalMoves, expectedArch: normalizedArch(runtimeArch), strategySource,
    })));
    const concurrency = analyzeConcurrentDiagnostics(concurrentSamples.map(safeSample), Math.round(performance.now() - concurrentStarted));
    await fs.writeFile(path.join(evidence, 'concurrency.json'), JSON.stringify(concurrency, null, 2));

    const summaries = DIAGNOSTIC_VARIANTS.map(variant => summarizeDiagnosticSamples(samples, variant));
    const complete = summaries.every(summary => summary.measuredRuns === measuredRuns);
    const status = complete ? (summaries.some(summary => summary.failures.length || summary.cleanupFailures) || concurrency.status !== 'passed' ? 'complete-with-failures' : 'complete') : 'incomplete';
    await fs.writeFile(path.join(evidence, 'summary.json'), JSON.stringify({ status, manifest, configurations: summaries, concurrency }, null, 2));
    const markdown = [
      '# Phase 8.5G Docker C++ compilation diagnostics', '',
      `Status: **${status.toUpperCase()}**. Docker ${version}; SDK ${sdk.version} / ${sdk.digest}.`, '',
      '| Variant | Runs | Completed | Timeouts | Host median | Container median | Combined non-process median | Cleanup failures |',
      '|---|---:|---:|---:|---:|---:|---:|---:|',
      ...summaries.map(summary => `| ${summary.variant} | ${summary.measuredRuns} | ${summary.completed} | ${summary.timeouts} | ${summary.completedHostWall?.medianMs ?? 'n/a'} | ${summary.completedContainerProcess?.medianMs ?? 'n/a'} | ${summary.completedCombinedNonProcessOverhead?.medianMs ?? 'n/a'} | ${summary.cleanupFailures} |`),
      '', `Concurrency: ${concurrency.status}; ${concurrency.passedRequests}/2 passed; artifact isolation ${concurrency.artifactIsolation}; cleanup ${concurrency.cleanupVerified}.`,
      '', 'No production compiler, runtime, timeout, image or sandbox configuration was changed.',
    ];
    await fs.writeFile(path.join(evidence, 'summary.md'), markdown.join('\n') + '\n');
    if (!complete) throw new Error('Not every scheduled diagnostic sample was recorded');
  } catch (error) {
    await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ status: 'failed', message: String(error.message).slice(0, 300) }, null, 2));
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`DIAGNOSTICS FAILED: ${String(error.message).slice(0, 300)}`); process.exitCode = 1; });
}
