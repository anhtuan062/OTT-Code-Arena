export class ExecutionGateTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`ExecutionGate timed out after ${timeoutMs}ms waiting for release or external termination`);
    this.name = 'ExecutionGateTimeoutError';
  }
}

export class ExecutionGateAbortedError extends Error {
  constructor(reason) {
    super(`ExecutionGate aborted: ${reason}`);
    this.name = 'ExecutionGateAbortedError';
  }
}

export function isSuccessfulDockerTurn(result) {
  return result?.success === true
    && result.exitCode === 0
    && Boolean(result.response?.move);
}

export function createExecutionGate({ timeoutMs = 60_000, onGateEntered } = {}) {
  let settled = false;
  let holding = false;
  let heldContext = null;
  let resolveGate = null;
  let rejectGate = null;
  let timer = null;
  let releasedEarly = false;
  let earlyAbortReason = null;

  const promise = new Promise((resolve, reject) => {
    resolveGate = resolve;
    rejectGate = reject;
  });

  return {
    async enter(context = {}) {
      if (settled) return;
      if (earlyAbortReason !== null) {
        settled = true;
        const error = earlyAbortReason instanceof Error ? earlyAbortReason : new ExecutionGateAbortedError(earlyAbortReason);
        rejectGate(error);
        return promise;
      }
      if (releasedEarly) {
        settled = true;
        resolveGate();
        return promise;
      }
      if (holding) {
        throw new Error('ExecutionGate already has an active hold');
      }

      holding = true;
      heldContext = context;

      if (typeof onGateEntered === 'function') {
        try {
          onGateEntered(context);
        } catch {
          // Fixture callbacks must not crash the hold path
        }
      }

      timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          holding = false;
          rejectGate(new ExecutionGateTimeoutError(timeoutMs));
        }
      }, timeoutMs);

      return promise;
    },

    release() {
      if (settled) return;
      if (!holding) {
        releasedEarly = true;
        return;
      }
      settled = true;
      holding = false;
      if (timer) clearTimeout(timer);
      resolveGate();
    },

    abort(reason = 'aborted') {
      if (settled) return;
      if (!holding) {
        earlyAbortReason = reason;
        return;
      }
      settled = true;
      holding = false;
      if (timer) clearTimeout(timer);
      const error = reason instanceof Error ? reason : new ExecutionGateAbortedError(reason);
      rejectGate(error);
    },

    isHolding() {
      return holding;
    },

    isSettled() {
      return settled;
    },

    getHeldContext() {
      return heldContext;
    },

    stop() {
      if (timer) clearTimeout(timer);
      settled = true;
      holding = false;
    },
  };
}

export function createGatedRevisionExecutor(baseExecutor, { gate, getContainerId, onGateEntered, onExecutionResult }) {
  let gateTriggered = false;

  return new Proxy(baseExecutor, {
    get(target, prop, receiver) {
      if (prop === 'executeRevision') {
        return async (context, revision, request) => {
          const result = await target.executeRevision(context, revision, request);
          const turn = {
            success: result.success === true,
            exitCode: result.exitCode,
            errorCode: result.error?.code ?? null,
            errorStage: result.error?.stage ?? null,
            hasMove: Boolean(result.response?.move),
            stderrBytes: Buffer.byteLength(result.stderr ?? ''),
            stderrPreview: (result.stderr ?? '').slice(0, 1_000),
            compilationMs: result.timings?.compilationContainerMs ?? null,
            runtimeMs: result.timings?.runtimeContainerMs ?? null,
            scopeId: context.revisionScopeId ?? null,
            botId: revision.execution.botId,
          };
          onExecutionResult?.(turn);
          if (!gateTriggered && context.revisionScopeId && isSuccessfulDockerTurn(result)) {
            gateTriggered = true;
            let containerId = '';
            if (typeof getContainerId === 'function') {
              try {
                containerId = await getContainerId();
              } catch {}
            }
            const eventPayload = {
              containerId,
              scopeId: context.revisionScopeId,
              botId: revision.execution.botId,
            };
            onGateEntered?.(eventPayload);
            await gate.enter(eventPayload);
          }
          return result;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

