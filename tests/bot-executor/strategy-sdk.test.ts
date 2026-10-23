import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { getStrategySdkIdentity, isTrustedStrategySdkDigest, STRATEGY_SDK_VERSION } from '@bot-executor/strategy-sdk.js';

const originalRoot = process.env.BOT_STRATEGY_SDK_ROOT;

afterEach(() => {
  if (originalRoot === undefined) delete process.env.BOT_STRATEGY_SDK_ROOT;
  else process.env.BOT_STRATEGY_SDK_ROOT = originalRoot;
});

async function fixture(version = '1.0.0', includeVersion = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-sdk-'));
  await fs.mkdir(path.join(root, 'cpp'));
  await fs.mkdir(path.join(root, 'python'));
  if (includeVersion) await fs.writeFile(path.join(root, 'VERSION'), `ott-strategy-sdk@${version}\n`);
  await fs.writeFile(path.join(root, 'cpp', 'ott_strategy_sdk.hpp'), 'cpp-sdk-fixture');
  await fs.writeFile(path.join(root, 'python', 'ott_strategy_sdk.py'), 'python-sdk-fixture');
  await fs.writeFile(path.join(root, 'python', 'runner.py'), 'runner-fixture');
  process.env.BOT_STRATEGY_SDK_ROOT = root;
  return root;
}

describe('Strategy SDK identity', () => {
  it('loads the authoritative VERSION and preserves current identity compatibility', async () => {
    const root = await fixture();
    const identity = await getStrategySdkIdentity('cpp');
    const expected = createHash('sha256').update(Buffer.concat([
      Buffer.from('ott-strategy-sdk@1.0.0\n'),
      Buffer.from('cpp-sdk-fixture'),
    ])).digest('hex');
    expect(identity).toEqual({ version: STRATEGY_SDK_VERSION, digest: expected });
    await fs.rm(root, { recursive: true, force: true });
  });

  it('accepts a trailing newline and uses the same VERSION for Python', async () => {
    const root = await fixture();
    expect((await getStrategySdkIdentity('python3')).version).toBe('1.0.0');
    await fs.rm(root, { recursive: true, force: true });
  });

  it.each([
    ['missing VERSION', undefined, false],
    ['empty VERSION', '', true],
    ['whitespace-only VERSION', '   \n', true],
    ['invalid VERSION', 'not-a-version', true],
    ['mismatched VERSION', 'ott-strategy-sdk@2.0.0', true],
  ])('fails closed for %s', async (_label, content, includeVersion) => {
    const root = await fixture('1.0.0', includeVersion);
    if (content !== undefined) await fs.writeFile(path.join(root, 'VERSION'), content);
    await expect(getStrategySdkIdentity('cpp')).rejects.toThrow(/Strategy SDK VERSION|artifact/);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('fails closed when an SDK artifact cannot be read', async () => {
    const root = await fixture();
    await fs.rm(path.join(root, 'python', 'runner.py'));
    await expect(getStrategySdkIdentity('python3')).rejects.toThrow('artifact is incomplete or unreadable');
    await fs.rm(root, { recursive: true, force: true });
  });

  it('keeps digest deterministic and changes it when an SDK artifact changes', async () => {
    const root = await fixture();
    const first = await getStrategySdkIdentity('python3');
    const second = await getStrategySdkIdentity('python3');
    expect(second).toEqual(first);
    await fs.writeFile(path.join(root, 'python', 'runner.py'), 'runner-fixture-changed');
    expect((await getStrategySdkIdentity('python3')).digest).not.toBe(first.digest);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('recognizes trusted legacy digests for compatible v1.0.0 artifacts', () => {
    expect(isTrustedStrategySdkDigest('cpp', 'df273bb091450d2937cc0ac880c2c27a74c621389d4dd2bb10e8ce6fed772448', 'current-digest')).toBe(true);
    expect(isTrustedStrategySdkDigest('python3', '61ff35c78497710ceaa1affa82af92fe38127eb2e00f075d58fd5c4e7d770dc9', 'current-digest')).toBe(true);
    expect(isTrustedStrategySdkDigest('cpp', '0'.repeat(64), 'current-digest')).toBe(false);
  });
});
