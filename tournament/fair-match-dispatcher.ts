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
  activeQuanta: number;
  queuedQuanta: number;
  done: boolean;
  resolved: boolean;
}

/**
 * Process-local fair arbiter. A quantum is one pairing (including its complete
 * BO2/BO3 series), so tournament state remains authoritative and atomic while
 * active run_all streams take turns at pairing boundaries.
 */
export class FairMatchDispatcher<T> {
  private readonly maxConcurrent: number;
  private readonly maxConcurrentPerRun: number;
  private readonly pending: DispatchRun<T>[] = [];
  private activeQuanta = 0;
  private readonly existing = new Map<string, Promise<FairMatchDispatchResult<T>>>();
  private pumping = false;
  private admission: ((activeDispatches: number) => boolean) | undefined;
  private dispatchStopped = false;

  constructor(maxConcurrent = 2, maxConcurrentPerRun = 1) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 2) {
      throw new RangeError('Fair match dispatcher concurrency must be between 1 and 2');
    }
    if (!Number.isInteger(maxConcurrentPerRun) || maxConcurrentPerRun < 1 || maxConcurrentPerRun > maxConcurrent) {
      throw new RangeError('Fair match dispatcher per-run concurrency must be between 1 and global concurrency');
    }
    this.maxConcurrent = maxConcurrent;
    this.maxConcurrentPerRun = maxConcurrentPerRun;
  }

  setAdmissionController(admission: ((activeDispatches: number) => boolean) | undefined): void {
    this.admission = admission;
    void this.pump();
  }

  wake(): void { void this.pump(); }

  /** Stop new quanta while allowing the currently executing quantum to finish. */
  stopDispatching(): void {
    this.dispatchStopped = true;
    for (const run of [...this.pending]) {
      run.done = true;
      run.queuedQuanta = 0;
      this.finish(run, true);
    }
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
    const run: DispatchRun<T> = {
      key,
      quantum,
      signal,
      results: [],
      failures: [],
      resolve,
      activeQuanta: 0,
      queuedQuanta: 1,
      done: false,
      resolved: false,
    };
    this.existing.set(key, promise);
    this.pending.push(run);
    void this.pump();
    return promise;
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (!this.dispatchStopped && this.activeQuanta < this.maxConcurrent && this.pending.length > 0) {
        const run = this.pending.shift()!;
        run.queuedQuanta = Math.max(0, run.queuedQuanta - 1);
        if (run.done || run.signal?.aborted) {
          run.done = true;
          this.finish(run, Boolean(run.signal?.aborted));
          continue;
        }
        if (this.admission && !this.admission(this.activeQuanta)) {
          run.queuedQuanta += 1;
          this.pending.unshift(run);
          break;
        }
        run.activeQuanta += 1;
        this.activeQuanta += 1;
        void this.executeQuantum(run);

        // Fill the remaining global slots from the same run when it is the
        // only runnable tournament. Requeueing here, rather than waiting for
        // completion, is what makes two pairings within one tournament able
        // to execute concurrently while preserving FIFO fairness between
        // different tournament runs.
        if (!run.done && run.activeQuanta + run.queuedQuanta < this.maxConcurrentPerRun) {
          run.queuedQuanta += 1;
          this.pending.push(run);
        }
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
    run.activeQuanta = Math.max(0, run.activeQuanta - 1);
    this.activeQuanta = Math.max(0, this.activeQuanta - 1);
    if (quantum.done || run.signal?.aborted || this.dispatchStopped) run.done = true;
    if (!run.done && quantum.deferred) {
      const retryAfterMs = Math.max(0, Math.min(30_000, quantum.retryAfterMs ?? 250));
      await new Promise<void>(resolve => setTimeout(resolve, retryAfterMs));
    }
    if (!run.done && run.activeQuanta + run.queuedQuanta < this.maxConcurrentPerRun) {
      run.queuedQuanta += 1;
      this.pending.push(run);
    }
    this.finish(run, Boolean(run.signal?.aborted));
    await this.pump();
  }

  private finish(run: DispatchRun<T>, cancelled: boolean): void {
    if (!run.done && !cancelled) return;
    if (run.activeQuanta > 0 || run.queuedQuanta > 0) return;
    if (run.resolved) return;
    run.resolved = true;
    this.existing.delete(run.key);
    run.resolve({ results: run.results, failures: run.failures, cancelled });
    void this.pump();
  }
}
