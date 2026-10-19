import { describe, expect, it } from 'vitest';
import { isActiveOwnedWarm } from '../../scripts/docker-ownership-barrier.mjs';

describe('Docker ownership warm barrier', () => {
  const expected = { environment: 'qa', storageNamespace: 'qa-a', serverInstanceId: 'owner-a' };

  it('accepts only a running warm resource with complete matching ownership', () => {
    expect(isActiveOwnedWarm({
      'ott.owner.environment': 'qa', 'ott.owner.storage-namespace': 'qa-a',
      'ott.owner.server-instance': 'owner-a', 'ott.owner.kind': 'warm',
      'ott.owner.revision-scope': 'match-a',
    }, expected)).toBe(true);
  });

  it('rejects a completed/unknown checkpoint instead of treating it as active', () => {
    expect(isActiveOwnedWarm({
      'ott.owner.environment': 'qa', 'ott.owner.storage-namespace': 'qa-a',
      'ott.owner.server-instance': 'owner-a', 'ott.owner.kind': 'runtime',
    }, expected)).toBe(false);
    expect(isActiveOwnedWarm(undefined, expected)).toBe(false);
  });
});
