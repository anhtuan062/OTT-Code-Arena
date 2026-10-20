import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import * as path from 'node:path';
import { ExecutionCancelledError } from './types.js';

export interface CompiledArtifactIdentity {
  sourceDigest: string;
  compilerImageDigest: string;
  compilerConfigDigest: string;
  runtimeImageDigest: string;
  strategyWrapperDigest?: string;
  sdkDigest?: string;
  compilationBackend: string;
  executionMode?: 'raw' | 'strategy';
}

export interface CompiledArtifactCacheOptions {
  rootDir: string;
  environment: string;
  storageNamespace: string;
  serverInstanceId: string;
  ownerLeaseDir: string;
  ownerLeaseTtlMs: number;
  maxBytes: number;
  maxEntries: number;
  maxArtifactBytes?: number;
  staleLockTtlMs?: number;
}

export interface CompiledArtifactManifest {
  cacheKey: string;
  identity: CompiledArtifactIdentity;
  runtimeId: 'cpp';
  environment: string;
  storageNamespace: string;
  artifactDigest: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CompiledArtifactHit {
  manifest: CompiledArtifactManifest;
  artifactPath: string;
  entryDir: string;
}

export interface CompiledArtifactBuildHandle {
  hit: CompiledArtifactHit | null;
  release(): Promise<void>;
}

const ARTIFACT_NAME = 'bot';
const MANIFEST_NAME = 'manifest.json';
const LOCK_NAME = 'compile.lock';
const ENTRY_GUARD_NAME = '.entry-guard';
const LEASE_DIR = 'leases';

function canonicalIdentity(identity: CompiledArtifactIdentity): string {
  return JSON.stringify({
    sourceDigest: identity.sourceDigest,
    compilerImageDigest: identity.compilerImageDigest,
    compilerConfigDigest: identity.compilerConfigDigest,
    runtimeImageDigest: identity.runtimeImageDigest,
    strategyWrapperDigest: identity.strategyWrapperDigest ?? '',
    sdkDigest: identity.sdkDigest ?? '',
    compilationBackend: identity.compilationBackend,
    executionMode: identity.executionMode ?? 'raw',
  });
}

export function compiledArtifactCacheKey(identity: CompiledArtifactIdentity): string {
  return createHash('sha256').update(canonicalIdentity(identity)).digest('hex');
}

function safeName(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new ExecutionCancelledError()); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new ExecutionCancelledError()); }, { once: true });
  });
}

export class CompiledArtifactCache {
  private readonly options: CompiledArtifactCacheOptions;

  constructor(options: CompiledArtifactCacheOptions) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(options.serverInstanceId)) throw new Error('Invalid compiled artifact cache server instance id');
    this.options = {
      ...options,
      rootDir: path.resolve(options.rootDir),
      ownerLeaseDir: path.resolve(options.ownerLeaseDir),
      maxBytes: Math.max(1, options.maxBytes),
      maxEntries: Math.max(1, Math.floor(options.maxEntries)),
      maxArtifactBytes: Math.max(1, options.maxArtifactBytes ?? 64 * 1024 * 1024),
      staleLockTtlMs: Math.max(options.ownerLeaseTtlMs * 3, options.staleLockTtlMs ?? options.ownerLeaseTtlMs * 3),
    };
  }

  async lookup(identity: CompiledArtifactIdentity): Promise<CompiledArtifactHit | null> {
    const cacheKey = compiledArtifactCacheKey(identity);
    const entryDir = this.entryDir(cacheKey);
    try {
      const raw = await fs.readFile(path.join(entryDir, MANIFEST_NAME), 'utf8');
      const manifest = JSON.parse(raw) as CompiledArtifactManifest;
      const artifactPath = path.join(entryDir, ARTIFACT_NAME);
      const stat = await fs.stat(artifactPath);
      if (!this.validManifest(manifest, identity, cacheKey, stat.size) || !(await this.validArtifactFile(artifactPath, stat.size))) return null;
      const digest = await this.fileDigest(artifactPath);
      if (digest !== manifest.artifactDigest) return null;
      return { manifest, artifactPath, entryDir };
    } catch {
      return null;
    }
  }

  async acquire(identity: CompiledArtifactIdentity, timeoutMs: number, signal?: AbortSignal): Promise<CompiledArtifactBuildHandle> {
    const cacheKey = compiledArtifactCacheKey(identity);
    const initialHit = await this.leaseExisting(identity);
    if (initialHit) return initialHit;

    await fs.mkdir(this.entryDir(cacheKey), { recursive: true, mode: 0o700 });
    const lockPath = path.join(this.entryDir(cacheKey), LOCK_NAME);
    const deadline = Date.now() + Math.max(1, timeoutMs);
    const token = randomUUID();
    while (true) {
      const hit = await this.leaseExisting(identity);
      if (hit) return hit;
      try {
        await fs.mkdir(lockPath, { recursive: false, mode: 0o700 });
        await this.writeLockMetadata(lockPath, { serverInstanceId: this.options.serverInstanceId, token, createdAt: Date.now() });
        await fs.writeFile(path.join(lockPath, 'heartbeat'), String(Date.now()), { mode: 0o600 });
        let stopped = false;
        let heartbeatInFlight: Promise<void> = Promise.resolve();
        const heartbeat = setInterval(() => {
          if (!stopped) heartbeatInFlight = heartbeatInFlight.then(() => this.refreshLock(lockPath, token));
        }, Math.max(250, Math.floor(this.options.ownerLeaseTtlMs / 3)));
        heartbeat.unref();
        return {
          hit: null,
          release: async () => {
            stopped = true;
            clearInterval(heartbeat);
            await heartbeatInFlight;
            await this.removeOwnedLock(lockPath, token);
          },
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (await this.lockIsStale(lockPath)) {
          await this.reclaimStaleLock(lockPath);
          continue;
        }
        if (Date.now() >= deadline) throw new Error('Timed out waiting for compiled artifact compilation lock');
        await delay(50, signal);
      }
    }
  }

  async publish(identity: CompiledArtifactIdentity, sourcePath: string): Promise<CompiledArtifactHit | null> {
    const cacheKey = compiledArtifactCacheKey(identity);
    const entryDir = this.entryDir(cacheKey);
    const existing = await this.lookup(identity);
    if (existing) return existing;
    await fs.mkdir(entryDir, { recursive: true, mode: 0o700 });
    const guard = await this.acquireEntryGuard(entryDir);
    if (!guard) return null;
    try {
      if (await this.hasActiveLease(entryDir)) return null;
    // A corrupt or incomplete entry is never overwritten in place. Remove
    // only its immutable payload/commit marker; the build lock remains held.
    await fs.rm(path.join(entryDir, ARTIFACT_NAME), { force: true }).catch(() => {});
    await fs.rm(path.join(entryDir, MANIFEST_NAME), { force: true }).catch(() => {});
    const stat = await fs.stat(sourcePath);
    if (!stat.isFile() || !(await this.validArtifactFile(sourcePath, stat.size))) return null;
    const artifactDigest = await this.fileDigest(sourcePath);
    const tempSuffix = `${this.options.serverInstanceId}.${process.pid}.${randomUUID()}`;
    const tempArtifact = path.join(entryDir, `${ARTIFACT_NAME}.${tempSuffix}.tmp`);
    const tempManifest = path.join(entryDir, `${MANIFEST_NAME}.${tempSuffix}.tmp`);
    const manifest: CompiledArtifactManifest = {
      cacheKey, identity, runtimeId: 'cpp', environment: this.options.environment,
      storageNamespace: this.options.storageNamespace, artifactDigest, sizeBytes: stat.size,
      createdAt: new Date().toISOString(),
    };
    try {
      await fs.copyFile(sourcePath, tempArtifact);
      await fs.chmod(tempArtifact, 0o755).catch(() => {});
      await fs.writeFile(tempManifest, JSON.stringify(manifest), { mode: 0o600 });
      await this.renameIfAbsent(tempArtifact, path.join(entryDir, ARTIFACT_NAME));
      await this.renameIfAbsent(tempManifest, path.join(entryDir, MANIFEST_NAME));
      return await this.lookup(identity);
    } finally {
      await fs.rm(tempArtifact, { force: true }).catch(() => {});
      await fs.rm(tempManifest, { force: true }).catch(() => {});
      await this.evict(cacheKey);
      await guard.release();
    }
    } catch (error) {
      await guard.release();
      throw error;
    }
  }

  async materialize(hit: CompiledArtifactHit, outputDir: string): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true, mode: 0o755 });
    const verified = await this.lookup(hit.manifest.identity);
    if (!verified || verified.manifest.artifactDigest !== hit.manifest.artifactDigest) {
      throw new Error('Compiled artifact cache verification failed');
    }
    if (!(await this.validArtifactFile(verified.artifactPath, verified.manifest.sizeBytes))) throw new Error('Compiled artifact cache validation failed');
    await fs.copyFile(verified.artifactPath, path.join(outputDir, ARTIFACT_NAME));
    await fs.chmod(path.join(outputDir, ARTIFACT_NAME), 0o755).catch(() => {});
  }

  async evict(excludeKey?: string): Promise<void> {
    const entries = await fs.readdir(this.options.rootDir, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[]);
    const candidates: Array<{ key: string; dir: string; manifest: CompiledArtifactManifest; bytes: number }> = [];
    let totalBytes = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'locks') continue;
      const hit = await this.readUnchecked(entry.name);
      if (!hit) {
        if (!(await this.isCompileLockActive(path.join(this.options.rootDir, entry.name)))) {
          const guard = await this.acquireEntryGuard(path.join(this.options.rootDir, entry.name));
          if (guard) {
            const entryDir = path.join(this.options.rootDir, entry.name);
            if (!(await this.hasActiveLease(entryDir))) await fs.rm(entryDir, { recursive: true, force: true }).catch(() => {});
            await guard.release();
          }
        }
        continue;
      }
      await this.removeOldTemporaryFiles(hit.entryDir);
      totalBytes += hit.manifest.sizeBytes;
      candidates.push({ key: entry.name, dir: hit.entryDir, manifest: hit.manifest, bytes: hit.manifest.sizeBytes });
    }
    candidates.sort((a, b) => a.manifest.createdAt.localeCompare(b.manifest.createdAt));
    let attemptsWithoutEviction = 0;
    while (totalBytes > this.options.maxBytes || candidates.length > this.options.maxEntries) {
      const candidate = candidates.shift();
      if (!candidate) break;
      if (candidate.key === excludeKey) {
        candidates.push(candidate);
        attemptsWithoutEviction += 1;
        if (attemptsWithoutEviction >= candidates.length) break;
        continue;
      }
      const guard = await this.acquireEntryGuard(candidate.dir);
      if (!guard || await this.hasActiveLease(candidate.dir)) {
        await guard?.release();
        candidates.push(candidate);
        attemptsWithoutEviction += 1;
        if (attemptsWithoutEviction >= candidates.length) break;
        continue;
      }
      await fs.rm(candidate.dir, { recursive: true, force: true }).catch(() => {});
      await guard.release();
      totalBytes -= candidate.bytes;
      attemptsWithoutEviction = 0;
    }
  }

  private entryDir(cacheKey: string): string { return path.join(this.options.rootDir, cacheKey); }

  private async readUnchecked(cacheKey: string): Promise<CompiledArtifactHit | null> {
    try {
      const entryDir = this.entryDir(cacheKey);
      const manifest = JSON.parse(await fs.readFile(path.join(entryDir, MANIFEST_NAME), 'utf8')) as CompiledArtifactManifest;
      const stat = await fs.stat(path.join(entryDir, ARTIFACT_NAME));
      if (manifest.cacheKey !== cacheKey || manifest.environment !== this.options.environment || manifest.storageNamespace !== this.options.storageNamespace || stat.size !== manifest.sizeBytes || !(await this.validArtifactFile(path.join(entryDir, ARTIFACT_NAME), stat.size))) return null;
      return { manifest, artifactPath: path.join(entryDir, ARTIFACT_NAME), entryDir };
    } catch { return null; }
  }

  private validManifest(manifest: CompiledArtifactManifest, identity: CompiledArtifactIdentity, cacheKey: string, size: number): boolean {
    return manifest.cacheKey === cacheKey && manifest.runtimeId === 'cpp'
      && manifest.environment === this.options.environment && manifest.storageNamespace === this.options.storageNamespace
      && manifest.sizeBytes === size && canonicalIdentity(manifest.identity) === canonicalIdentity(identity)
      && size <= (this.options.maxArtifactBytes ?? 64 * 1024 * 1024);
  }

  private async fileDigest(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
    return hash.digest('hex');
  }

  private async validArtifactFile(filePath: string, size: number): Promise<boolean> {
    if (size <= 0 || size > (this.options.maxArtifactBytes ?? 64 * 1024 * 1024)) return false;
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) return false;
      if (process.platform !== 'win32' && (stat.mode & 0o111) === 0) return false;
      const header = Buffer.alloc(20);
      const handle = await fs.open(filePath, 'r');
      try { const result = await handle.read(header, 0, header.length, 0); if (result.bytesRead < 20) return false; }
      finally { await handle.close(); }
      return header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46
        && header[4] === 2 && header[5] === 1 && header.readUInt16LE(18) === 0x3e;
    } catch { return false; }
  }

  private async renameIfAbsent(from: string, to: string): Promise<void> {
    try { await fs.rename(from, to); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' && (error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
      await fs.rm(from, { force: true });
    }
  }

  private async leaseExisting(identity: CompiledArtifactIdentity): Promise<CompiledArtifactBuildHandle | null> {
    const cacheKey = compiledArtifactCacheKey(identity);
    const entryDir = this.entryDir(cacheKey);
    await fs.mkdir(entryDir, { recursive: true, mode: 0o700 });
    const guard = await this.acquireEntryGuard(entryDir);
    if (!guard) return null;
    const hit = await this.lookup(identity);
    if (!hit) { await guard.release(); return null; }
    const leaseDir = path.join(hit.entryDir, LEASE_DIR);
    try {
      await fs.mkdir(leaseDir, { recursive: true, mode: 0o700 });
      const leasePath = path.join(leaseDir, `${safeName(`${this.options.serverInstanceId}:${randomUUID()}`)}.json`);
      await fs.writeFile(leasePath, JSON.stringify({ serverInstanceId: this.options.serverInstanceId, createdAt: Date.now() }), { flag: 'wx', mode: 0o600 });
      return { hit, release: async () => { await fs.rm(leasePath, { force: true }).catch(() => {}); } };
    } finally { await guard.release(); }
  }

  private async hasActiveLease(entryDir: string): Promise<boolean> {
    const leaseDir = path.join(entryDir, LEASE_DIR);
    const leases = await fs.readdir(leaseDir, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[]);
    for (const lease of leases) {
      if (!lease.isFile()) continue;
      try {
        const value = JSON.parse(await fs.readFile(path.join(leaseDir, lease.name), 'utf8')) as { serverInstanceId?: string };
        if (!value.serverInstanceId || !/^[A-Za-z0-9_-]{1,128}$/.test(value.serverInstanceId)) return true;
        const owner = JSON.parse(await fs.readFile(path.join(this.options.ownerLeaseDir, `${value.serverInstanceId}.json`), 'utf8')) as { heartbeatAt?: number };
        if (typeof owner.heartbeatAt === 'number' && Date.now() - owner.heartbeatAt <= this.options.ownerLeaseTtlMs * 2) return true;
        await fs.rm(path.join(leaseDir, lease.name), { force: true }).catch(() => {});
      } catch {
        // An unverifiable lease is conservatively treated as in use. This
        // prevents a custom shared cache root from deleting another process's
        // artifact merely because its owner lease directory is elsewhere.
        return true;
      }
    }
    return false;
  }

  private async lockIsStale(lockPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(lockPath);
      const lock = JSON.parse(await fs.readFile(path.join(lockPath, 'owner.json'), 'utf8')) as { serverInstanceId?: string };
      if (!lock.serverInstanceId || !/^[A-Za-z0-9_-]{1,128}$/.test(lock.serverInstanceId)) return Date.now() - stat.mtimeMs > (this.options.staleLockTtlMs ?? 60_000);
      const owner = JSON.parse(await fs.readFile(path.join(this.options.ownerLeaseDir, `${lock.serverInstanceId}.json`), 'utf8')) as { heartbeatAt?: number };
      const heartbeatPath = path.join(lockPath, 'heartbeat');
      const heartbeatStat = await fs.stat(heartbeatPath).catch(() => stat);
      const heartbeat = Number.parseInt(await fs.readFile(heartbeatPath, 'utf8').catch(() => ''), 10);
      const heartbeatAt = Number.isFinite(heartbeat) ? heartbeat : heartbeatStat.mtimeMs;
      return Date.now() - heartbeatAt > (this.options.staleLockTtlMs ?? 60_000)
        && (typeof owner.heartbeatAt !== 'number' || Date.now() - owner.heartbeatAt > this.options.ownerLeaseTtlMs * 2);
    } catch (error) {
      try { const stat = await fs.stat(lockPath); return Date.now() - stat.mtimeMs > (this.options.staleLockTtlMs ?? 60_000); } catch { return false; }
    }
  }

  private async isCompileLockActive(entryDir: string): Promise<boolean> {
    const lockPath = path.join(entryDir, LOCK_NAME);
    try {
      if (await this.lockIsStale(lockPath)) {
        await this.reclaimStaleLock(lockPath);
        return false;
      }
      return true;
    } catch { return false; }
  }

  private async removeOldTemporaryFiles(entryDir: string): Promise<void> {
    const now = Date.now();
    const entries = await fs.readdir(entryDir, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[]);
    for (const entry of entries) {
      if (!entry.isFile() || (!entry.name.endsWith('.tmp') && !entry.name.includes('.reclaim-'))) continue;
      const file = path.join(entryDir, entry.name);
      const stat = await fs.stat(file).catch(() => null);
      if (stat && now - stat.mtimeMs > (this.options.staleLockTtlMs ?? 60_000)) await fs.rm(file, { force: true }).catch(() => {});
    }
  }

  private async removeOwnedLock(lockPath: string, token: string): Promise<void> {
    try {
      const lock = JSON.parse(await fs.readFile(path.join(lockPath, 'owner.json'), 'utf8')) as { token?: string };
      if (lock.token === token) await fs.rm(lockPath, { recursive: true, force: true });
    } catch { /* another recovery path already removed the lock */ }
  }

  private async writeLockMetadata(lockPath: string, value: Record<string, unknown>): Promise<void> {
    const tmp = path.join(lockPath, `owner.${randomUUID()}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
    await fs.rename(tmp, path.join(lockPath, 'owner.json'));
  }

  private async refreshLock(lockPath: string, token: string): Promise<void> {
    try {
      const value = JSON.parse(await fs.readFile(path.join(lockPath, 'owner.json'), 'utf8')) as { token?: string };
      if (value.token !== token) return;
      await fs.writeFile(path.join(lockPath, 'heartbeat'), String(Date.now()), { mode: 0o600 });
    } catch { /* release/recovery owns the lock now */ }
  }

  private async reclaimStaleLock(lockPath: string): Promise<void> {
    const marker = `${lockPath}.reclaim-${this.options.serverInstanceId}-${process.pid}`;
    try { await fs.rename(lockPath, marker); await fs.rm(marker, { recursive: true, force: true }); } catch { /* another owner won */ }
  }

  private async acquireEntryGuard(entryDir: string): Promise<{ release(): Promise<void> } | null> {
    const guardPath = path.join(entryDir, ENTRY_GUARD_NAME);
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const token = randomUUID();
      const stagingPath = path.join(entryDir, `${ENTRY_GUARD_NAME}.${this.options.serverInstanceId}.${process.pid}.${token}.tmp`);
      try {
        await fs.mkdir(stagingPath, { recursive: false, mode: 0o700 });
        const owner = {
          serverInstanceId: this.options.serverInstanceId,
          pid: process.pid,
          token,
          createdAt: Date.now(),
        };
        await fs.writeFile(path.join(stagingPath, 'owner.json'), JSON.stringify(owner), { mode: 0o600 });
        await fs.writeFile(path.join(stagingPath, 'heartbeat'), String(Date.now()), { mode: 0o600 });
        try {
          await fs.rename(stagingPath, guardPath);
        } catch (error) {
          await fs.rm(stagingPath, { recursive: true, force: true }).catch(() => {});
          if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
          await this.recoverEntryGuard(guardPath);
          await delay(10);
          continue;
        }
        let stopped = false;
        let heartbeatInFlight: Promise<void> = Promise.resolve();
        const heartbeat = setInterval(() => {
          if (!stopped) {
            heartbeatInFlight = heartbeatInFlight
              .then(() => fs.writeFile(path.join(guardPath, 'heartbeat'), String(Date.now()), { mode: 0o600 }))
              .catch(() => {});
          }
        }, Math.max(250, Math.floor(this.options.ownerLeaseTtlMs / 3)));
        heartbeat.unref();
        return {
          release: async () => {
            stopped = true;
            clearInterval(heartbeat);
            await heartbeatInFlight;
            await this.releaseEntryGuard(guardPath, token);
          },
        };
      } catch (error) {
        await fs.rm(stagingPath, { recursive: true, force: true }).catch(() => {});
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await this.recoverEntryGuard(guardPath);
        await delay(10);
      }
    }
    return null;
  }

  private async recoverEntryGuard(guardPath: string): Promise<boolean> {
    const ownerPath = path.join(guardPath, 'owner.json');
    let owner: { serverInstanceId?: string; pid?: number; token?: string };
    try {
      owner = JSON.parse(await fs.readFile(ownerPath, 'utf8')) as typeof owner;
    } catch {
      // A published guard is never removed when its ownership cannot be
      // established. Staging publication prevents normal crashes from
      // producing this state.
      return false;
    }
    if (!owner.serverInstanceId || !/^[A-Za-z0-9_-]{1,128}$/.test(owner.serverInstanceId)
      || !owner.token || typeof owner.pid !== 'number' || !Number.isInteger(owner.pid) || owner.pid <= 0) return false;
    try {
      const released = JSON.parse(await fs.readFile(path.join(guardPath, 'released'), 'utf8')) as { token?: string };
      if (released.token === owner.token) return this.moveAndRemoveGuard(guardPath, 'recover');
    } catch { /* owner is still active or marker is absent */ }
    let processAlive = false;
    try { process.kill(owner.pid, 0); processAlive = true; }
    catch (error) {
      processAlive = (error as NodeJS.ErrnoException).code === 'EPERM';
    }
    if (processAlive) return false;
    return this.moveAndRemoveGuard(guardPath, 'reclaim');
  }

  private async releaseEntryGuard(guardPath: string, token: string): Promise<void> {
    try {
      const owner = JSON.parse(await fs.readFile(path.join(guardPath, 'owner.json'), 'utf8')) as { token?: string };
      if (owner.token !== token) return;
      await fs.writeFile(path.join(guardPath, 'released'), JSON.stringify({ token, releasedAt: Date.now() }), { mode: 0o600 });
      await this.moveAndRemoveGuard(guardPath, 'release');
    } catch { /* another recovery path already owns or removed the guard */ }
  }

  private async moveAndRemoveGuard(guardPath: string, reason: 'release' | 'recover' | 'reclaim'): Promise<boolean> {
    const marker = `${guardPath}.${reason}-${this.options.serverInstanceId}-${process.pid}-${randomUUID()}`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await fs.rename(guardPath, marker);
        await fs.rm(marker, { recursive: true, force: true });
        return true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST' && code !== 'EPERM' && code !== 'EBUSY') return false;
        await delay(10);
      }
    }
    return false;
  }
}
