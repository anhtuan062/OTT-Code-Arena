import { applicationMetrics } from '../observability/metrics.js';

export interface ProjectionCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  maxBytes?: number;
  namespace?: string;
  now?: () => number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  generation: number;
  bytes: number;
  lastAccess: number;
}

/** Bounded process-local cache for immutable public projections only. */
export class ProjectionCache<T = unknown> {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly namespace: string;
  private readonly now: () => number;
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly flights = new Map<string, { generation: number; promise: Promise<T> }>();
  private readonly generations = new Map<string, number>();
  private bytes = 0;

  constructor(options: ProjectionCacheOptions = {}) {
    this.ttlMs = Number.isFinite(options.ttlMs) ? Math.max(1, options.ttlMs!) : 2_000;
    this.maxEntries = Number.isFinite(options.maxEntries) ? Math.max(1, Math.floor(options.maxEntries!)) : 256;
    this.maxBytes = Number.isFinite(options.maxBytes) ? Math.max(1_024, Math.floor(options.maxBytes!)) : 8 * 1024 * 1024;
    this.namespace = options.namespace ?? 'projection';
    this.now = options.now ?? Date.now;
  }

  async getOrLoad(key: string, loader: () => Promise<T> | T): Promise<T> {
    const now = this.now();
    const generation = this.generations.get(key) ?? 0;
    const entry = this.entries.get(key);
    if (entry && entry.generation === generation && entry.expiresAt > now) {
      entry.lastAccess = now;
      applicationMetrics.increment(`cache.${this.namespace}.hits`);
      return entry.value;
    }
    if (entry) this.remove(key, entry);
    const currentFlight = this.flights.get(key);
    if (currentFlight && currentFlight.generation === generation) {
      applicationMetrics.increment(`cache.${this.namespace}.singleflight`);
      return currentFlight.promise;
    }

    applicationMetrics.increment(`cache.${this.namespace}.misses`);
    applicationMetrics.increment(`cache.${this.namespace}.source_reads`);
    const loadGeneration = generation;
    let flight!: Promise<T>;
    flight = Promise.resolve().then(loader).then(value => {
      if ((this.generations.get(key) ?? 0) === loadGeneration) this.set(key, value, loadGeneration);
      return value;
    }).finally(() => {
      if (this.flights.get(key)?.promise === flight) this.flights.delete(key);
    });
    this.flights.set(key, { generation: loadGeneration, promise: flight });
    return flight;
  }

  invalidate(prefix = ''): void {
    for (const [key, entry] of [...this.entries]) {
      if (key.startsWith(prefix)) this.remove(key, entry);
    }
    for (const key of [...this.generations.keys()]) {
      if (key.startsWith(prefix)) this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
    }
    for (const key of this.flights.keys()) {
      if (key.startsWith(prefix)) this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
    }
  }

  clear(): void {
    this.entries.clear();
    this.flights.clear();
    this.generations.clear();
    this.bytes = 0;
  }

  stats(): { entries: number; bytes: number; inFlight: number } {
    return { entries: this.entries.size, bytes: this.bytes, inFlight: this.flights.size };
  }

  private set(key: string, value: T, generation: number): void {
    const serialized = JSON.stringify(value);
    const bytes = serialized ? serialized.length * 2 : 0;
    if (bytes > this.maxBytes) return;
    const previous = this.entries.get(key);
    if (previous) this.remove(key, previous);
    const now = this.now();
    this.entries.set(key, { value, generation, expiresAt: now + this.ttlMs, bytes, lastAccess: now });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = [...this.entries.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess)[0];
      if (!oldest) break;
      this.remove(oldest[0], oldest[1]);
      applicationMetrics.increment(`cache.${this.namespace}.evictions`);
    }
  }

  private remove(key: string, entry: CacheEntry<T>): void {
    if (this.entries.get(key) !== entry) return;
    this.entries.delete(key);
    this.bytes = Math.max(0, this.bytes - entry.bytes);
  }
}
