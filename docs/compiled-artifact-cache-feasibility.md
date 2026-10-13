# C++ source-revision artifact cache: feasibility only

Phase 8.5F does **not** implement or enable this cache. The current executor
compiles every C++ invocation in an isolated Docker compiler container and
removes its job-scoped output directory after the runtime container exits.

## Identity and invalidation

A future cache key must include a canonical, versioned encoding of:

- SHA-256 of the exact immutable source bytes and execution mode (`raw` or
  `strategy`);
- pinned Strategy SDK version and digest, or an explicit `no-sdk` marker;
- immutable compiler image digest and exact compiler arguments/flags;
- target OS/architecture, binary format, and runtime ABI, including the pinned
  runtime image digest when compatibility depends on its libraries;
- a compiler-policy version covering mounts, output path and wrapper format.

The key should be scoped to the owning Competitor as well as content-addressed.
That prevents cross-account cache-hit timing from revealing whether another
account submitted identical private source. No revision identity, digest or
provenance field should be rewritten when an artifact is reused.

## Trust boundary

Only the server may publish cache entries. Compiler output must originate from
the same Docker-only, no-network, non-root, read-only-root, resource-limited
build path as an uncached job. On Windows, the cache root needs restrictive
server-account ACLs; a checksum beside a writable binary alone does not prove
authenticity. Store a server-authenticated manifest (for example an HMAC whose
key is outside the cache root), containing the key and artifact SHA-256. Verify
both before each Docker runtime mount. A failed check is a cache miss followed
by a fresh Docker compilation, never host execution.

Compile into a private staging directory. After validating exit code, ELF
architecture, runtime compatibility and artifact digest, atomically publish
the manifest and binary under the content key. Never let a failed, cancelled or
timed-out compile publish an entry. The runtime mount stays read-only and the
binary is never invoked on the host.

## Concurrency, lifetime and recovery

Use a per-key build lock with bounded waiting; readers see either a complete
verified entry or a miss. Coordinate eviction with in-use leases so a binary
cannot disappear during a match. Bound both total bytes and entry age, with
least-recently-used or age-based eviction under the same server-owned lock.
Startup recovery removes only verified cache-owned incomplete staging entries.
An image, SDK, wrapper, flags, architecture or runtime ABI change generates a
new key; old entries become eligible for eviction rather than being reused.

## Required gate before implementation

Use isolated Docker-backed tests for cache hit/miss identity, cross-user
isolation, concurrent builds, cancellation, corrupt/tampered manifests,
partial writes, eviction during use and restart recovery. Verify that cached
and uncached binaries return the same engine-legal result for approved fixtures
and that no source or binary executes on the host. Benchmark hit rates and
resource use before introducing persistent storage or changing tournament
execution policy.
