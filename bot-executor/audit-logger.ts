export type AuditEventType =
  | 'execution_requested'
  | 'execution_started'
  | 'execution_completed'
  | 'execution_timed_out'
  | 'execution_cancelled'
  | 'resource_limit_exceeded'
  | 'sandbox_startup_failure'
  | 'cleanup_failure';

export interface AuditEvent {
  timestamp: string;
  event: AuditEventType;
  executionId: string;
  matchId?: string;
  tournamentId?: string;
  executor?: string;
  player?: 'A' | 'B';
  durationMs?: number;
  exitCode?: number | null;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLoggerConfig {
  enabled: boolean;
  logFunction?: (event: AuditEvent) => void;
  blockExecutionOnFailure: boolean;
  maxEvents: number;
}

const DEFAULT_CONFIG: AuditLoggerConfig = {
  enabled: true,
  blockExecutionOnFailure: false,
  maxEvents: 1000,
};

export class ExecutionAuditLogger {
  private config: AuditLoggerConfig;
  private events: AuditEvent[] = [];

  constructor(config: Partial<AuditLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  log(event: AuditEvent): void {
    if (!this.config.enabled) return;

    try {
      this.events.push(event);
      if (this.events.length > this.config.maxEvents) {
        this.events.splice(0, this.events.length - this.config.maxEvents);
      }
      if (this.config.logFunction) {
        this.config.logFunction(event);
      }
    } catch (error) {
      if (this.config.blockExecutionOnFailure) {
        throw new Error(`Audit logging failure blocks execution: ${error}`);
      }
    }
  }

  executionRequested(params: {
    executionId: string;
    matchId?: string;
    tournamentId?: string;
    executor?: string;
    player?: 'A' | 'B';
  }): void {
    this.log({
      timestamp: new Date().toISOString(),
      event: 'execution_requested',
      ...params,
    });
  }

  executionStarted(params: {
    executionId: string;
    matchId?: string;
    executor?: string;
    player?: 'A' | 'B';
  }): void {
    this.log({
      timestamp: new Date().toISOString(),
      event: 'execution_started',
      ...params,
    });
  }

  executionCompleted(params: {
    executionId: string;
    matchId?: string;
    durationMs?: number;
    exitCode?: number | null;
  }): void {
    this.log({
      timestamp: new Date().toISOString(),
      event: 'execution_completed',
      ...params,
    });
  }

  executionTimedOut(params: {
    executionId: string;
    matchId?: string;
    durationMs?: number;
  }): void {
    this.log({
      timestamp: new Date().toISOString(),
      event: 'execution_timed_out',
      ...params,
    });
  }

  executionCancelled(params: {
    executionId: string;
    matchId?: string;
  }): void {
    this.log({
      timestamp: new Date().toISOString(),
      event: 'execution_cancelled',
      ...params,
    });
  }

  resourceLimitExceeded(params: {
    executionId: string;
    matchId?: string;
    errorMessage?: string;
  }): void {
    this.log({
      timestamp: new Date().toISOString(),
      event: 'resource_limit_exceeded',
      ...params,
    });
  }

  sandboxStartupFailure(params: {
    executionId: string;
    errorCode?: string;
    errorMessage?: string;
  }): void {
    this.log({
      timestamp: new Date().toISOString(),
      event: 'sandbox_startup_failure',
      ...params,
    });
  }

  cleanupFailure(params: {
    executionId: string;
    errorMessage?: string;
  }): void {
    this.log({
      timestamp: new Date().toISOString(),
      event: 'cleanup_failure',
      ...params,
    });
  }

  getEvents(): AuditEvent[] {
    return [...this.events];
  }

  getEventsByType(type: AuditEventType): AuditEvent[] {
    return this.events.filter(e => e.event === type);
  }

  getEventsByExecution(executionId: string): AuditEvent[] {
    return this.events.filter(e => e.executionId === executionId);
  }

  clear(): void {
    this.events = [];
  }
}

export function createAuditLogger(config?: Partial<AuditLoggerConfig>): ExecutionAuditLogger {
  return new ExecutionAuditLogger(config);
}
