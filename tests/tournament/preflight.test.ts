import { describe, expect, it } from 'vitest';
import { preflightTournamentFormat } from '../../tournament/preflight.js';

describe('tournament format preflight', () => {
  it('keeps legacy format ready within the legacy limit', () => {
    const result = preflightTournamentFormat({
      format: 'single_round_robin',
      participantCount: 8,
    });

    expect(result.status).toBe('ready');
    expect(result.summary?.hasRegionalQualifiers).toBe(false);
  });

  it('does not enable multi-stage implicitly', () => {
    const result = preflightTournamentFormat({
      format: 'multi_stage',
      participantCount: 256,
    });

    expect(result.status).toBe('blocked');
    expect(result.reasons).toContain('Multi-stage tournaments require the explicit feature flag.');
  });

  it('summarizes the 1024-bot regional format without expanding pairings', () => {
    const result = preflightTournamentFormat({
      format: 'multi_stage',
      participantCount: 1024,
      multiStageEnabled: true,
    });

    expect(result.status).toBe('ready');
    expect(result.summary).toEqual(expect.objectContaining({
      participantCount: 1024,
      hasRegionalQualifiers: true,
      regionCount: 4,
      botsEnteringGroupStage: 128,
      groupCount: 32,
      knockoutBracketSize: 64,
    }));
    expect(JSON.stringify(result)).not.toContain('pairings');
  });

  it('blocks a request above the multi-stage capacity', () => {
    const result = preflightTournamentFormat({
      format: 'multi_stage',
      participantCount: 4097,
      multiStageEnabled: true,
    });

    expect(result.status).toBe('blocked');
    expect(result.reasons[0]).toContain('at most 4096');
  });

  it('blocks invalid participant counts before planning', () => {
    const result = preflightTournamentFormat({
      format: 'single_round_robin',
      participantCount: 1,
    });

    expect(result.status).toBe('blocked');
    expect(result.summary).toBeNull();
  });
});
