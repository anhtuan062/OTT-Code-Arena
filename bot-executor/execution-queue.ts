import { EventEmitter } from 'events';

export interface ExecutionQueueConfig {
  maxConcurrent: number;
  maxQueueLength: number;
}

export type QueueTaskStatus = 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';

export interface QueueTask<T = unknown> {
  id: string;
  status: QueueTaskStatus;
  execute: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  enqueuedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  controller: AbortController;
  settled: boolean;
}

export class ExecutionQueue extends EventEmitter {
  private config: ExecutionQueueConfig;
  private queue: QueueTask[] = [];
  private active: Map<string, QueueTask> = new Map();
  private cancelled: Set<string> = new Set();
  private recentStatuses = new Map<string, QueueTaskStatus>();
  private _disposed = false;

  constructor(config: Partial<ExecutionQueueConfig> = {}) {
    super();
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 4,
      maxQueueLength: config.maxQueueLength ?? 64,
    };
  }

  get activeCount(): number {
    return this.active.size;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  async submit<T>(id: string, execute: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this._disposed) {
      throw new Error('Queue is disposed');
    }

    if (this.cancelled.has(id)) {
      throw new Error(`Task ${id} was cancelled before submission`);
    }

    if (this.queue.length >= this.config.maxQueueLength && this.active.size >= this.config.maxConcurrent) {
      throw new Error(`Queue is full (max ${this.config.maxQueueLength} queued, ${this.config.maxConcurrent} active)`);
    }

    return new Promise<T>((resolve, reject) => {
      const task: QueueTask<T> = {
        id,
        status: 'queued',
        execute: execute as (signal: AbortSignal) => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        enqueuedAt: Date.now(),
        startedAt: null,
        completedAt: null,
        controller: new AbortController(),
        settled: false,
      } as unknown as QueueTask<T>;

      if (this.active.size < this.config.maxConcurrent) {
        this.startTask(task as unknown as QueueTask);
      } else {
        this.queue.push(task as unknown as QueueTask);
        this.emit('queued', { id, queueLength: this.queue.length });
      }
    });
  }

  cancel(id: string): boolean {
    this.cancelled.add(id);

    const queueIndex = this.queue.findIndex(t => t.id === id);
    if (queueIndex !== -1) {
      const task = this.queue[queueIndex]!;
      this.queue.splice(queueIndex, 1);
      task.status = 'cancelled';
      task.completedAt = Date.now();
      this.rememberStatus(task.id, task.status);
      task.settled = true;
      task.reject(new Error(`Task ${id} cancelled while queued`));
      this.emit('cancelled', { id, wasActive: false });
      return true;
    }

    const activeTask = this.active.get(id);
    if (activeTask) {
      activeTask.status = 'cancelled';
      this.rememberStatus(activeTask.id, activeTask.status);
      activeTask.controller.abort();
      if (!activeTask.settled) {
        activeTask.settled = true;
        activeTask.completedAt = Date.now();
        activeTask.reject(new Error(`Task ${id} cancelled during execution`));
      }
      this.emit('cancelled', { id, wasActive: true });
      return true;
    }

    return false;
  }

  cancelAll(): void {
    for (const task of [...this.queue]) {
      this.cancel(task.id);
    }
    for (const [id] of this.active) {
      this.cancel(id);
    }
  }

  async dispose(): Promise<void> {
    this._disposed = true;
    this.cancelAll();
    this.queue = [];
  }

  getStats(): {
    activeCount: number;
    queueLength: number;
    maxConcurrent: number;
    maxQueueLength: number;
  } {
    return {
      activeCount: this.active.size,
      queueLength: this.queue.length,
      maxConcurrent: this.config.maxConcurrent,
      maxQueueLength: this.config.maxQueueLength,
    };
  }

  /**
   * Return queue occupancy for a caller-owned subset of task IDs.
   * Capacity limits remain queue-wide, while workload counts are scoped.
   */
  getStatsFor(taskIds: Iterable<string>): {
    activeCount: number;
    queueLength: number;
    maxConcurrent: number;
    maxQueueLength: number;
  } {
    const ownedIds = new Set(taskIds);
    let activeCount = 0;
    let queueLength = 0;
    for (const id of ownedIds) {
      if (this.active.has(id)) activeCount += 1;
      else if (this.queue.some(task => task.id === id)) queueLength += 1;
    }
    return {
      activeCount,
      queueLength,
      maxConcurrent: this.config.maxConcurrent,
      maxQueueLength: this.config.maxQueueLength,
    };
  }

  getStatus(id: string): QueueTaskStatus | null {
    const active = this.active.get(id);
    if (active) return active.status;
    const queued = this.queue.find(task => task.id === id);
    if (queued) return queued.status;
    return this.recentStatuses.get(id) ?? null;
  }

  private rememberStatus(id: string, status: QueueTaskStatus): void {
    this.recentStatuses.delete(id);
    this.recentStatuses.set(id, status);
    while (this.recentStatuses.size > 100) {
      const oldest = this.recentStatuses.keys().next().value as string | undefined;
      if (!oldest) break;
      this.recentStatuses.delete(oldest);
    }
  }

  private startTask(task: QueueTask): void {
    task.status = 'active';
    task.startedAt = Date.now();
    this.active.set(task.id, task);
    this.emit('started', { id: task.id });

    const wasCancelled = () => this.cancelled.has(task.id);

    task.execute(task.controller.signal)
      .then((result) => {
        if (wasCancelled()) {
          task.status = 'cancelled';
          task.completedAt = Date.now();
          this.rememberStatus(task.id, task.status);
          if (!task.settled) {
            task.settled = true;
            task.reject(new Error(`Task ${task.id} cancelled during execution`));
          }
        } else {
          task.status = 'completed';
          task.completedAt = Date.now();
          this.rememberStatus(task.id, task.status);
          if (!task.settled) {
            task.settled = true;
            task.resolve(result);
          }
          this.emit('completed', { id: task.id });
        }
      })
      .catch((error) => {
        task.status = wasCancelled() ? 'cancelled' : 'failed';
        task.completedAt = Date.now();
        this.rememberStatus(task.id, task.status);
        if (!task.settled) {
          task.settled = true;
          task.reject(error);
        }
        this.emit('failed', { id: task.id, error });
      })
      .finally(() => {
        this.active.delete(task.id);
        this.drainQueue();
      });
  }

  private drainQueue(): void {
    while (this.queue.length > 0 && this.active.size < this.config.maxConcurrent) {
      const next = this.queue.shift();
      if (!next) break;

      if (this.cancelled.has(next.id)) {
        next.status = 'cancelled';
        next.completedAt = Date.now();
        this.rememberStatus(next.id, next.status);
        next.settled = true;
        next.reject(new Error(`Task ${next.id} cancelled while queued`));
        this.emit('cancelled', { id: next.id, wasActive: false });
        continue;
      }

      this.startTask(next);
    }
  }
}

export function createExecutionQueue(config?: Partial<ExecutionQueueConfig>): ExecutionQueue {
  return new ExecutionQueue(config);
}
