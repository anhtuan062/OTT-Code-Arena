import { describe, expect, it } from 'vitest';
import { sourceRevisionTurnTimeoutMs } from '../../match-runner/types.js';

describe('source revision timeout policy', () => {
  it('uses the enforced five-second minimum for the default match policy', () => {
    expect(sourceRevisionTurnTimeoutMs(2000)).toBe(5000);
  });

  it('preserves a tournament policy that is already longer than the minimum', () => {
    expect(sourceRevisionTurnTimeoutMs(7000)).toBe(7000);
  });
});
