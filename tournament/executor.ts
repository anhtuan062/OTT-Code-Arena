/**
 * Tournament Manager - Match Executor Interface
 *
 * Abstraction for running matches, allowing testable implementation
 * and integration with the actual Match Runner.
 */

import type {
  BotDefinition,
  MatchConfig,
  MatchResult,
  MatchReplay,
  MatchRunnerCallbacks,
} from '@match-runner/types.js';
import type { BotExecutor } from '@bot-executor/types.js';

export interface MatchExecutor {
  /**
   * Execute a match between two bots
   * @param matchId Unique match identifier
   * @param playerA Bot definition for player A
   * @param playerB Bot definition for player B
   * @param config Match configuration
   * @param callbacks Optional callbacks for progress tracking
   * @returns Promise resolving to match result
   */
  executeMatch(
    matchId: string,
    playerA: BotDefinition,
    playerB: BotDefinition,
    config: MatchConfig,
    callbacks?: MatchRunnerCallbacks,
    signal?: AbortSignal
  ): Promise<MatchResult>;

  /**
   * Check if executor is available
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Result of match execution for tournament recording
 */
export interface ExecutedMatchResult {
  matchResult: MatchResult;
  replay: MatchReplay;
}

/**
 * Configuration for tournament match execution
 */
export interface TournamentMatchExecutorConfig {
  defaultMatchConfig: MatchConfig;
  maxConcurrentMatches: number;
  botExecutor?: BotExecutor;
}

/**
 * Mock match executor for testing
 * Allows deterministic match results without spawning processes
 */
export class MockMatchExecutor implements MatchExecutor {
  private results: Map<string, MatchResult> = new Map();
  private replays: Map<string, MatchReplay> = new Map();
  private callLog: Array<{ matchId: string; playerA: string; playerB: string }> = [];

  constructor() {}

  /**
   * Pre-configure a match result for testing
   */
  setMatchResult(matchId: string, result: MatchResult, replay: MatchReplay): void {
    this.results.set(matchId, result);
    this.replays.set(matchId, replay);
  }

  /**
   * Get the call log for verification
   */
  getCallLog(): Array<{ matchId: string; playerA: string; playerB: string }> {
    return [...this.callLog];
  }

  async executeMatch(
    matchId: string,
    playerA: BotDefinition,
    playerB: BotDefinition,
    config: MatchConfig
  ): Promise<MatchResult> {
    this.callLog.push({ matchId, playerA: playerA.botId, playerB: playerB.botId });

    const result = this.results.get(matchId);
    if (!result) {
      // Default: player A wins by goal_reached
      throw new Error(`No mock result configured for match ${matchId}`);
    }

    return result;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  clear(): void {
    this.results.clear();
    this.replays.clear();
    this.callLog = [];
  }
}

/**
 * Match Runner adapter - uses the actual MatchRunner from match-runner package
 */
export class MatchRunnerExecutor implements MatchExecutor {
  private config: MatchConfig;
  private botExecutor?: BotExecutor;

  constructor(defaultConfig: MatchConfig, botExecutor?: BotExecutor) {
    this.config = defaultConfig;
    this.botExecutor = botExecutor;
  }

  async executeMatch(
    matchId: string,
    playerA: BotDefinition,
    playerB: BotDefinition,
    config?: MatchConfig,
    callbacks?: MatchRunnerCallbacks,
    signal?: AbortSignal
  ): Promise<MatchResult> {
    // Lazy import to avoid circular dependencies
    const { createMatchRunner } = await import('@match-runner/index.js');

    const mergedConfig = { ...this.config, ...config, matchId };
    const runner = createMatchRunner(mergedConfig, playerA, playerB, callbacks, this.botExecutor);
    return runner.run(signal);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/**
 * Create a MatchRunnerExecutor with default config and optional BotExecutor
 */
export async function createMatchRunnerExecutor(
  defaultConfig: Partial<MatchConfig> = {},
  botExecutor?: BotExecutor
): Promise<MatchRunnerExecutor> {
  const { DEFAULT_MATCH_CONFIG } = await import('@match-runner/types.js');
  const config = { ...DEFAULT_MATCH_CONFIG, ...defaultConfig };
  return new MatchRunnerExecutor(config, botExecutor);
}