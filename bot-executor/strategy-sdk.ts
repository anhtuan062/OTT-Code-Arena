import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { SourceRuntimeId } from '@match-runner/types.js';

export const STRATEGY_SDK_VERSION = '1.0.0';
export type StrategyExecutionMode = 'raw' | 'strategy';

const SDK_VERSION_PREFIX = 'ott-strategy-sdk@';
const SDK_VERSION_PATTERN = /^([0-9]+\.[0-9]+\.[0-9]+)$/;

export function wrapCppStrategySource(source: string): string {
  return '#include "ott_strategy_sdk.hpp"\n' + source + '\nint main() { return ott::run(chooseMove); }\n';
}

/** Fingerprint of the generated translation-unit wrapper, not of user source. */
export const CPP_STRATEGY_WRAPPER_DIGEST = createHash('sha256')
  .update('#include "ott_strategy_sdk.hpp"\n<SOURCE>\nint main() { return ott::run(chooseMove); }\n')
  .digest('hex');

function sdkRoot(): string {
  const configured = process.env.BOT_STRATEGY_SDK_ROOT?.trim();
  if (configured) return path.resolve(configured);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, '../bot-sdk'), path.resolve(here, '../../bot-sdk')];
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0]!;
}

function filesFor(runtimeId: SourceRuntimeId): string[] {
  const root = sdkRoot();
  return runtimeId === 'cpp'
    ? [path.join(root, 'VERSION'), path.join(root, 'cpp', 'ott_strategy_sdk.hpp')]
    : [path.join(root, 'VERSION'), path.join(root, 'python', 'ott_strategy_sdk.py'), path.join(root, 'python', 'runner.py')];
}

function parseSdkVersion(content: Buffer): string {
  const descriptor = content.toString('utf8').trim();
  if (!descriptor.startsWith(SDK_VERSION_PREFIX)) {
    throw new Error('Strategy SDK VERSION must use the ott-strategy-sdk@X.Y.Z format');
  }
  const version = descriptor.slice(SDK_VERSION_PREFIX.length);
  if (!SDK_VERSION_PATTERN.test(version)) {
    throw new Error('Strategy SDK VERSION contains an invalid version');
  }
  if (version !== STRATEGY_SDK_VERSION) {
    throw new Error('Strategy SDK VERSION disagrees with the compatibility version constant');
  }
  return version;
}

export async function getStrategySdkIdentity(runtimeId: SourceRuntimeId): Promise<{ version: string; digest: string }> {
  let contents: Buffer[];
  try {
    contents = await Promise.all(filesFor(runtimeId).map(file => readFile(file)));
  } catch {
    throw new Error('Strategy SDK artifact is incomplete or unreadable');
  }
  const version = parseSdkVersion(contents[0]!);
  const digest = createHash('sha256').update(Buffer.concat(contents)).digest('hex');
  return { version, digest };
}

const TRUSTED_LEGACY_SDK_DIGESTS: Record<SourceRuntimeId, string[]> = {
  cpp: [
    'df273bb091450d2937cc0ac880c2c27a74c621389d4dd2bb10e8ce6fed772448',
    '2c0f3b77071d633b7b3e9a8d1531e6d5733dc4e055b9696cd07cc3379a77fc00',
  ],
  python3: [
    '61ff35c78497710ceaa1affa82af92fe38127eb2e00f075d58fd5c4e7d770dc9',
  ],
};

export function isTrustedStrategySdkDigest(runtimeId: SourceRuntimeId, digest: string, currentDigest: string): boolean {
  if (digest === currentDigest) return true;
  return (TRUSTED_LEGACY_SDK_DIGESTS[runtimeId] || []).includes(digest);
}

export async function materializeStrategySdk(runtimeId: SourceRuntimeId, targetRoot: string): Promise<void> {
  const root = sdkRoot();
  // The SDK is bind-mounted read-only into the non-root runtime container.
  // Keep files immutable while allowing UID 65532 to traverse/read them.
  await mkdir(targetRoot, { recursive: true, mode: 0o755 });
  await writeFile(path.join(targetRoot, 'VERSION'), await readFile(path.join(root, 'VERSION')), { mode: 0o444 });
  if (runtimeId === 'cpp') {
    await writeFile(path.join(targetRoot, 'ott_strategy_sdk.hpp'), await readFile(path.join(root, 'cpp', 'ott_strategy_sdk.hpp')), { mode: 0o444 });
    return;
  }
  await writeFile(path.join(targetRoot, 'ott_strategy_sdk.py'), await readFile(path.join(root, 'python', 'ott_strategy_sdk.py')), { mode: 0o444 });
  await writeFile(path.join(targetRoot, 'runner.py'), await readFile(path.join(root, 'python', 'runner.py')), { mode: 0o444 });
}

export function strategySdkRoot(): string { return sdkRoot(); }
