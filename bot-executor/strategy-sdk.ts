import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { SourceRuntimeId } from '@match-runner/types.js';

export const STRATEGY_SDK_VERSION = '1.0.0';
export type StrategyExecutionMode = 'raw' | 'strategy';

export function wrapCppStrategySource(source: string): string {
  return '#include "ott_strategy_sdk.hpp"\n' + source + '\nint main() { return ott::run(chooseMove); }\n';
}

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

export async function getStrategySdkIdentity(runtimeId: SourceRuntimeId): Promise<{ version: string; digest: string }> {
  const contents = await Promise.all(filesFor(runtimeId).map(file => readFile(file)));
  const digest = createHash('sha256').update(Buffer.concat(contents)).digest('hex');
  return { version: STRATEGY_SDK_VERSION, digest };
}

export async function materializeStrategySdk(runtimeId: SourceRuntimeId, targetRoot: string): Promise<void> {
  const root = sdkRoot();
  await mkdir(targetRoot, { recursive: true, mode: 0o700 });
  await writeFile(path.join(targetRoot, 'VERSION'), await readFile(path.join(root, 'VERSION')), { mode: 0o400 });
  if (runtimeId === 'cpp') {
    await writeFile(path.join(targetRoot, 'ott_strategy_sdk.hpp'), await readFile(path.join(root, 'cpp', 'ott_strategy_sdk.hpp')), { mode: 0o400 });
    return;
  }
  await writeFile(path.join(targetRoot, 'ott_strategy_sdk.py'), await readFile(path.join(root, 'python', 'ott_strategy_sdk.py')), { mode: 0o400 });
  await writeFile(path.join(targetRoot, 'runner.py'), await readFile(path.join(root, 'python', 'runner.py')), { mode: 0o400 });
}

export function strategySdkRoot(): string { return sdkRoot(); }
