import { describe, expect, it, vi } from 'vitest';
import {
  createExecutionGate,
  createGatedRevisionExecutor,
  isSuccessfulDockerTurn,
  ExecutionGateTimeoutError,
  ExecutionGateAbortedError,
} from '../../scripts/docker-ownership-gate.mjs';

describe('QA Execution Gate for Docker ownership', () => {
  it('holds execution until released', async () => {
    const gate = createExecutionGate({ timeoutMs: 5_000 });
    let unblocked = false;

    expect(gate.isHolding()).toBe(false);
    const holdPromise = gate.enter({ scopeId: 'test-scope' }).then(() => {
      unblocked = true;
    });

    expect(gate.isHolding()).toBe(true);
    expect(gate.getHeldContext()).toEqual({ scopeId: 'test-scope' });
    expect(unblocked).toBe(false);

    gate.release();
    await holdPromise;

    expect(unblocked).toBe(true);
    expect(gate.isHolding()).toBe(false);
  });

  it('rejects with ExecutionGateTimeoutError when timeout expires before release', async () => {
    const gate = createExecutionGate({ timeoutMs: 30 });
    expect(gate.isHolding()).toBe(false);

    await expect(gate.enter({ scopeId: 'timeout-scope' })).rejects.toThrow(ExecutionGateTimeoutError);
    expect(gate.isHolding()).toBe(false);
    expect(gate.isSettled()).toBe(true);
  });

  it('resolves immediately when release is signaled before enter (early release race)', async () => {
    const gate = createExecutionGate({ timeoutMs: 1_000 });
    gate.release();

    let completed = false;
    await gate.enter({ scopeId: 'early-release-scope' });
    completed = true;

    expect(completed).toBe(true);
    expect(gate.isHolding()).toBe(false);
  });

  it('rejects immediately when aborted while holding (SIGKILL simulation)', async () => {
    const gate = createExecutionGate({ timeoutMs: 5_000 });
    const holdPromise = gate.enter({ scopeId: 'abort-scope' });

    expect(gate.isHolding()).toBe(true);
    gate.abort('Simulated process SIGKILL');

    await expect(holdPromise).rejects.toThrow(ExecutionGateAbortedError);
    expect(gate.isHolding()).toBe(false);
  });

  it('rejects immediately when aborted before enter (early abort race)', async () => {
    const gate = createExecutionGate({ timeoutMs: 1_000 });
    gate.abort('Simulated startup failure');

    await expect(gate.enter({ scopeId: 'early-abort-scope' })).rejects.toThrow(ExecutionGateAbortedError);
    expect(gate.isHolding()).toBe(false);
  });

  it('rejects concurrent duplicate enter attempts while a hold is active', async () => {
    const gate = createExecutionGate({ timeoutMs: 5_000 });
    const firstHold = gate.enter({ scopeId: 'first' });

    await expect(gate.enter({ scopeId: 'second' })).rejects.toThrow('ExecutionGate already has an active hold');

    gate.release();
    await firstHold;
  });

  it('handles multiple releases and stop idempotently without throwing', () => {
    const gate = createExecutionGate({ timeoutMs: 5_000 });
    expect(() => {
      gate.release();
      gate.release();
      gate.abort('already settled');
      gate.stop();
    }).not.toThrow();
  });

  it('wraps RevisionExecutor and intercepts execution after successful match-scoped turn', async () => {
    const gate = createExecutionGate({ timeoutMs: 5_000 });
    const onGateEntered = vi.fn();
    const mockExecutor = {
      async executeRevision(context: any, revision: any, request: any) {
        return {
          success: true,
          exitCode: 0,
          response: { move: { piece_id: 'P1', from: 'A1', to: 'A2' } },
          stdout: JSON.stringify({ move: { piece_id: 'P1', from: 'A1', to: 'A2' } }),
          stderr: '',
          error: null,
          details: null,
          durationMs: 10,
          memoryBytes: 1024,
        };
      },
      async isAvailable() { return true; },
      async releaseRevisionScope() { return true; },
    };

    const gatedExecutor = createGatedRevisionExecutor(mockExecutor, {
      gate,
      getContainerId: async () => 'mock-warm-container-123',
      onGateEntered,
    });

    const context = { executionId: 'exec-1', revisionScopeId: 'match-scope-456' };
    const revision = {
      execution: { botId: 'bot-1', competitorId: 'comp-1', revisionId: 'rev-1', runtimeId: 'cpp' },
      source: Buffer.from(''),
    };
    const request = { protocol_version: '0.1.0', match_id: 'm1', turn: 1, player: 'A', board_size: 4, pieces: [] };

    let turnFinished = false;
    const executePromise = gatedExecutor.executeRevision(context, revision, request).then((res: any) => {
      turnFinished = true;
      return res;
    });

    // Wait microtask tick
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(gate.isHolding()).toBe(true);
    expect(turnFinished).toBe(false);
    expect(onGateEntered).toHaveBeenCalledWith({
      containerId: 'mock-warm-container-123',
      scopeId: 'match-scope-456',
      botId: 'bot-1',
    });

    gate.release();
    const result = await executePromise;

    expect(turnFinished).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('does not trigger gate for compilation/runtime failures or a forfeit response', async () => {
    const gate = createExecutionGate({ timeoutMs: 5_000 });
    const onGateEntered = vi.fn();
    const onExecutionResult = vi.fn();
    const mockExecutor = {
      async executeRevision() {
        return { success: false, exitCode: 0, stdout: '', stderr: 'invalid response', error: { code: 'INVALID_RESPONSE' }, durationMs: 5 };
      },
    };

    const gatedExecutor = createGatedRevisionExecutor(mockExecutor, {
      gate,
      onGateEntered,
      onExecutionResult,
    });

    const context = { executionId: 'exec-2', revisionScopeId: 'match-scope-fail' };
    const revision = {
      execution: { botId: 'bot-2', competitorId: 'comp-2', revisionId: 'rev-2', runtimeId: 'cpp' },
      source: Buffer.from(''),
    };

    const result = await gatedExecutor.executeRevision(context, revision, {});
    expect(result.exitCode).toBe(0);
    expect(gate.isHolding()).toBe(false);
    expect(onGateEntered).not.toHaveBeenCalled();
    expect(onExecutionResult).toHaveBeenCalledWith(expect.objectContaining({
      success: false, exitCode: 0, errorCode: 'INVALID_RESPONSE', scopeId: 'match-scope-fail',
    }));
  });

  it('accepts only the real BotExecutionResult contract for a successful Docker turn', () => {
    expect(isSuccessfulDockerTurn({ success: true, exitCode: 0, response: { move: { piece_id: 'p', from: 'a1', to: 'a2' } } })).toBe(true);
    expect(isSuccessfulDockerTurn({ success: true, exitCode: null, response: { move: { piece_id: 'p' } } })).toBe(false);
    expect(isSuccessfulDockerTurn({ success: false, exitCode: 0, response: { move: { piece_id: 'p' } } })).toBe(false);
    expect(isSuccessfulDockerTurn({ success: true, exitCode: 1, response: { move: { piece_id: 'p' } } })).toBe(false);
    expect(isSuccessfulDockerTurn({ success: false, exitCode: 1, error: { code: 'PROCESS_CRASHED', stage: 'compilation' } })).toBe(false);
  });
});

