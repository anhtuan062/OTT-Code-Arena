export interface FairMatchQuantum<T> {
  done: boolean;
  result?: T;
  error?: string;
  deferred?: boolean;
  retryAfterMs?: number;
}

export interface FairMatchDispatchResult<T> {
  results: T[];
  failures: string[];
  cancelled: boolean;
}

interface DispatchRun<T> {
  key: string;
  signal?: AbortSignal;
  quantum: (signal?: AbortSignal) => Promise<FairMatchQuantum<T>>;
  results: T[];
  failures: string[];
  resolve: (result: FairMatchDispatchResult<T>) => void;
}

/**
 * Process-local fair arbiter. A quantum is one pairing (including its complete
 * BO2/BO3 series), so tournament state remains authoritative and atomic while
 * active run_all streams take turns at pairing boundaries.
 */
export class FairMatchDispatcher<T> {
  private readonly maxConcurrent: number;
  private readonly pending: DispatchRun<T>[] = [];
  private readonly activeKeys = new Set<string>();
  private readonly active = new Set<DispatchRun<T>>();
  private readonly existing = new Map<string, Promise<FairMatchDispatchResult<T>>>();
  private pumping = false;
  private admission: ((activeDispatches: number) => boolean) | undefined;
  private dispatchStopped = false;

  constructor(maxConcurrent = 2) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 2) {
      throw new RangeError('Fair match dispatcher concurrency must be between 1 and 2');
    }
    this.maxConcurrent = maxConcurrent;
  }

  setAdmissionController(admission: ((activeDispatches: number) => boolean) | undefined): void {
    this.admission = admission;
    void this.pump();
  }

  wake(): void { void this.pump(); }

  /** Stop new quanta while allowing the currently executing quantum to finish. */
  stopDispatching(): void {
    this.dispatchStopped = true;
    for (const run of [...this.pending]) this.finish(run, true);
    this.pending.length = 0;
  }

  submit(
    key: string,
    quantum: (signal?: AbortSignal) => Promise<FairMatchQuantum<T>>,
    signal?: AbortSignal,
  ): Promise<FairMatchDispatchResult<T>> {
    if (this.dispatchStopped) {
      return Promise.resolve({ results: [], failures: [], cancelled: true });
    }
    const current = this.existing.get(key);
    if (current) return current;

    let resolve!: (result: FairMatchDispatchResult<T>) => void;
    const promise = new Promise<FairMatchDispatchResult<T>>(done => { resolve = done; });
    const run: DispatchRun<T> = { key, quantum, signal, results: [], failures: [], resolve };
    this.existing.set(key, promise);
    this.pending.push(run);
    void this.pump();
    return promise;
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (!this.dispatchStopped && this.active.size < this.maxConcurrent && this.pending.length > 0) {
        if (this.admission && !this.admission(this.active.size)) break;
        const run = this.pending.shift()!;
        if (this.activeKeys.has(run.key)) continue;
        this.activeKeys.add(run.key);
        this.active.add(run);
        void this.executeQuantum(run);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async executeQuantum(run: DispatchRun<T>): Promise<void> {
    let quantum: FairMatchQuantum<T>;
    try {
      if (run.signal?.aborted) {
        this.finish(run, true);
        return;
      }
      quantum = await run.quantum(run.signal);
    } catch (error) {
      run.failures.push(error instanceof Error ? error.message : String(error));
      quantum = { done: true };
    }

    if (quantum.result !== undefined) run.results.push(quantum.result);
    if (quantum.error) run.failures.push(quantum.error);
    if (quantum.done || run.signal?.aborted || this.dispatchStopped) {
      this.finish(run, Boolean(run.signal?.aborted));
      return;
    }

    this.active.delete(run);
    this.activeKeys.delete(run.key);
    if (quantum.deferred) {
      const retryAfterMs = Math.max(0, Math.min(30_000, quantum.retryAfterMs ?? 250));
      await new Promise<void>(resolve => setTimeout(resolve, retryAfterMs));
    }
    this.pending.push(run);
    await this.pump();
  }

  private finish(run: DispatchRun<T>, cancelled: boolean): void {
    this.active.delete(run);
    this.activeKeys.delete(run.key);
    this.existing.delete(run.key);
    run.resolve({ results: run.results, failures: run.failures, cancelled });
    void this.pump();
  }
}
