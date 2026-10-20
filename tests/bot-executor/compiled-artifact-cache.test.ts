import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { CompiledArtifactCache, compiledArtifactCacheKey, type CompiledArtifactIdentity } from '@bot-executor/compiled-artifact-cache.js';

const identity = (sourceDigest: string, compilerConfigDigest = 'config-a'): CompiledArtifactIdentity => ({
  sourceDigest, compilerImageDigest: 'compiler-digest', compilerConfigDigest, runtimeImageDigest: 'runtime-digest',
  sdkDigest: 'sdk-digest', compilationBackend: 'bind', executionMode: 'raw',
});

function elfFixture(content: string): Buffer {
  const value = Buffer.alloc(32 + Buffer.byteLength(content));
  value.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0);
  value.writeUInt16LE(0x3e, 18);
  value.write(content, 32);
  return value;
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-compiled-cache-'));
  const ownerLeaseDir = path.join(root, 'owners');
  await fs.mkdir(ownerLeaseDir, { recursive: true });
  await fs.writeFile(path.join(ownerLeaseDir, 'server-a.json'), JSON.stringify({ heartbeatAt: Date.now() }));
  const options = { rootDir: path.join(root, 'cache'), environment: 'qa', storageNamespace: 'cache-test', serverInstanceId: 'server-a', ownerLeaseDir, ownerLeaseTtlMs: 10_000, maxBytes: 1024 * 1024, maxEntries: 8 };
  return { root, ownerLeaseDir, cache: new CompiledArtifactCache(options), options };
}

describe('immutable compiled artifact cache', () => {
  it('publishes atomically, verifies content and materializes read-only runtime input', async () => {
    const { root, cache } = await fixture();
    try {
      const source = path.join(root, 'bot');
      await fs.writeFile(source, elfFixture('compiled-binary'));
      const buildIdentity = identity('source-a');
      const published = await cache.publish(buildIdentity, source);
      expect(published?.manifest.cacheKey).toBe(compiledArtifactCacheKey(buildIdentity));
      const output = path.join(root, 'output');
      await cache.materialize(published!, output);
      const materialized = await fs.readFile(path.join(output, 'bot'));
      expect(materialized.subarray(32).toString()).toBe('compiled-binary');

      await fs.writeFile(published!.artifactPath, 'corrupt');
      await expect(cache.lookup(buildIdentity)).resolves.toBeNull();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('single-flights compilation across cache instances and reuses the published artifact', async () => {
    const { root, options, cache } = await fixture();
    const second = new CompiledArtifactCache({ ...options, serverInstanceId: 'server-b' });
    await fs.writeFile(path.join(options.ownerLeaseDir, 'server-b.json'), JSON.stringify({ heartbeatAt: Date.now() }));
    try {
      const buildIdentity = identity('source-b');
      const first = await cache.acquire(buildIdentity, 2_000);
      expect(first.hit).toBeNull();
      const waiting = second.acquire(buildIdentity, 2_000);
      let resolved = false;
      void waiting.then(() => { resolved = true; });
      await new Promise(resolve => setTimeout(resolve, 75));
      expect(resolved).toBe(false);
      const source = path.join(root, 'bot-b');
      await fs.writeFile(source, elfFixture('compiled-binary-b'));
      await cache.publish(buildIdentity, source);
      await first.release();
      const acquired = await waiting;
      expect(acquired.hit?.manifest.identity.sourceDigest).toBe('source-b');
      await acquired.release();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('coordinates a bounded multi-executor burst without duplicate builders', async () => {
    const { root, options, cache } = await fixture();
    const peerIds = Array.from({ length: 7 }, (_, index) => `peer-${index}`);
    const peers = peerIds.map(serverInstanceId => new CompiledArtifactCache({ ...options, serverInstanceId }));
    for (const serverInstanceId of peerIds) await fs.writeFile(path.join(options.ownerLeaseDir, `${serverInstanceId}.json`), JSON.stringify({ heartbeatAt: Date.now() }));
    try {
      const buildIdentity = identity('burst');
      const first = await cache.acquire(buildIdentity, 2_000);
      expect(first.hit).toBeNull();
      const waiting = peers.map(peer => peer.acquire(buildIdentity, 2_000));
      const source = path.join(root, 'burst-bot');
      await fs.writeFile(source, elfFixture('burst'));
      await cache.publish(buildIdentity, source);
      const handles = await Promise.all(waiting);
      expect(handles.every(handle => handle.hit !== null)).toBe(true);
      await first.release();
      await Promise.all(handles.map(handle => handle.release()));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('does not evict an artifact with a live owner lease', async () => {
    const { root, cache, options } = await fixture();
    try {
      const firstIdentity = identity('source-c');
      const firstSource = path.join(root, 'bot-c');
      await fs.writeFile(firstSource, elfFixture('first'));
      await cache.publish(firstIdentity, firstSource);
      const held = await cache.acquire(firstIdentity, 1_000);
      const secondIdentity = identity('source-d');
      const secondSource = path.join(root, 'bot-d');
      await fs.writeFile(secondSource, elfFixture('second'));
      const constrained = new CompiledArtifactCache({ ...options, maxEntries: 1 });
      await constrained.publish(secondIdentity, secondSource);
      expect(await constrained.lookup(firstIdentity)).not.toBeNull();
      await held.release();
      await constrained.evict();
      expect(await constrained.lookup(firstIdentity)).toBeNull();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('does not reclaim a partially initialized lock before the stale-lock grace period', async () => {
    const { root, cache, options } = await fixture();
    try {
      const buildIdentity = identity('partial-lock');
      const entry = path.join(options.rootDir, compiledArtifactCacheKey(buildIdentity));
      await fs.mkdir(path.join(entry, 'compile.lock'), { recursive: true });
      await expect(cache.acquire(buildIdentity, 100)).rejects.toThrow('Timed out waiting for compiled artifact compilation lock');
      await expect(fs.stat(path.join(entry, 'compile.lock'))).resolves.toBeTruthy();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('recovers a published entry guard only after the recorded owner is dead', async () => {
    const { root, cache, options } = await fixture();
    try {
      const entry = path.join(options.rootDir, compiledArtifactCacheKey(identity('guard-crash')));
      const guardPath = path.join(entry, '.entry-guard');
      await fs.mkdir(guardPath, { recursive: true });
      await fs.writeFile(path.join(guardPath, 'owner.json'), JSON.stringify({ serverInstanceId: 'server-a', pid: 999999, token: 'crashed-owner' }));
      await fs.writeFile(path.join(guardPath, 'heartbeat'), String(Date.now() - 60_000));
      const acquired = await (cache as any).acquireEntryGuard(entry);
      expect(acquired).not.toBeNull();
      await acquired.release();
      await expect(fs.stat(guardPath)).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('does not reclaim a delayed-heartbeat guard while its owner process is alive', async () => {
    const { root, cache, options } = await fixture();
    try {
      const entry = path.join(options.rootDir, compiledArtifactCacheKey(identity('guard-live')));
      const guardPath = path.join(entry, '.entry-guard');
      await fs.mkdir(guardPath, { recursive: true });
      await fs.writeFile(path.join(guardPath, 'owner.json'), JSON.stringify({ serverInstanceId: 'server-a', pid: process.pid, token: 'live-owner' }));
      await fs.writeFile(path.join(guardPath, 'heartbeat'), String(Date.now() - 60_000));
      await expect((cache as any).recoverEntryGuard(guardPath)).resolves.toBe(false);
      await expect(fs.stat(guardPath)).resolves.toBeTruthy();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('cleans lock heartbeat timers when a build handle is released', async () => {
    const { root, cache, options } = await fixture();
    try {
      const handle = await cache.acquire(identity('timer-cleanup'), 1_000);
      await handle.release();
      await new Promise(resolve => setTimeout(resolve, 300));
      const entry = path.join(options.rootDir, compiledArtifactCacheKey(identity('timer-cleanup')));
      await expect(fs.stat(path.join(entry, 'compile.lock'))).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed for non-ELF artifacts and separates runtime image identities', async () => {
    const { root, cache } = await fixture();
    try {
      const buildIdentity = identity('invalid');
      const source = path.join(root, 'invalid-bot');
      await fs.writeFile(source, 'not-an-elf');
      await expect(cache.publish(buildIdentity, source)).resolves.toBeNull();
      const runtimeChanged = { ...buildIdentity, runtimeImageDigest: 'different-runtime' };
      expect(compiledArtifactCacheKey(runtimeChanged)).not.toBe(compiledArtifactCacheKey(buildIdentity));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
