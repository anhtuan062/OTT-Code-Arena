export function isActiveOwnedWarm(labels, expected) {
  return Boolean(labels &&
    labels['ott.owner.environment'] === expected.environment &&
    labels['ott.owner.storage-namespace'] === expected.storageNamespace &&
    labels['ott.owner.server-instance'] === expected.serverInstanceId &&
    labels['ott.owner.kind'] === 'warm' &&
    typeof labels['ott.owner.revision-scope'] === 'string' &&
    labels['ott.owner.revision-scope'].length > 0);
}

export {
  createExecutionGate,
  createGatedRevisionExecutor,
  ExecutionGateTimeoutError,
  ExecutionGateAbortedError,
} from './docker-ownership-gate.mjs';
