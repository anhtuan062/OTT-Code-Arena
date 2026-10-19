import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readAssembledFrontendStyles(): string {
  const cssDir = resolve(process.cwd(), 'styles');
  const files = [
    'tokens.css',
    'base.css',
    'layout.css',
    'components.css',
    'views/dashboard.css',
    'views/tournaments.css',
    'views/matches.css',
    'views/bots.css',
    'views/community.css',
    'views/analytics.css',
    'views/system-logs.css',
  ];
  return files
    .map(file => {
      try {
        return readFileSync(resolve(cssDir, file), 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');
}

describe('Phase 6: Tournament Results Review Workspace', () => {
  let tournamentsJs: string;
  let appJs: string;
  let css: string;

  beforeEach(() => {
    tournamentsJs = readFileSync(resolve(process.cwd(), 'js/tournaments.js'), 'utf8');
    appJs = readFileSync(resolve(process.cwd(), 'app.js'), 'utf8');
    css = readAssembledFrontendStyles();
  });

  it('correctly determines champion from Knockout final match, NOT from group standings points', () => {
    const extractFn = new Function(
      'state = { multiStage: {} }',
      `${tournamentsJs}; return { getPhase6KnockoutFinal, getPhase6Readiness };`
    );
    const { getPhase6KnockoutFinal, getPhase6Readiness } = extractFn();

    // Mock multi-stage tournament where Bot 8 has 9 points in standings,
    // but Bot 1 defeated Bot 2 in the Knockout BO3 Final.
    const mockTournament = {
      tournamentId: 't-multistage-1',
      format: 'multi_stage',
      status: 'completed',
      participants: [
        { participantId: 'p-bot-1', name: 'Bot 1 - Alpha' },
        { participantId: 'p-bot-2', name: 'Bot 2 - Beta' },
        { participantId: 'p-bot-8', name: 'Bot 8 - Gamma' },
      ],
      standings: [
        { participantId: 'p-bot-8', participantName: 'Bot 8 - Gamma', points: 9, wins: 2, draws: 3, losses: 0, matchesPlayed: 5 },
        { participantId: 'p-bot-1', participantName: 'Bot 1 - Alpha', points: 6, wins: 2, draws: 0, losses: 1, matchesPlayed: 3 },
        { participantId: 'p-bot-2', participantName: 'Bot 2 - Beta', points: 6, wins: 2, draws: 0, losses: 1, matchesPlayed: 3 },
      ],
      stages: [
        {
          stageId: 's-groups',
          stageType: 'group_stage',
          status: 'completed',
        },
        {
          stageId: 's-knockout',
          stageType: 'knockout',
          status: 'completed',
          rounds: [
            {
              roundNumber: 1,
              name: 'Chung kết',
              pairings: [
                {
                  pairingId: 'pairing-final',
                  roundNumber: 1,
                  participantA: 'p-bot-1',
                  participantB: 'p-bot-2',
                  participantNames: { A: 'Bot 1 - Alpha', B: 'Bot 2 - Beta' },
                  status: 'completed',
                  matchId: 'match-final-bo3',
                  matchResult: {
                    winner: 'A',
                    series: {
                      format: 'bo3',
                      winsA: 2,
                      winsB: 1,
                      winner: 'A',
                      games: [
                        { gameNumber: 1, winner: 'A', matchId: 'm-g1' },
                        { gameNumber: 2, winner: 'B', matchId: 'm-g2' },
                        { gameNumber: 3, winner: 'A', matchId: 'm-g3' },
                      ],
                    },
                  },
                  seriesProgress: {
                    format: 'bo3',
                    bestOf: 3,
                    winsA: 2,
                    winsB: 1,
                    winner: 'A',
                    games: [
                      { gameNumber: 1, winner: 'A', matchId: 'm-g1' },
                      { gameNumber: 2, winner: 'B', matchId: 'm-g2' },
                      { gameNumber: 3, winner: 'A', matchId: 'm-g3' },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const knockoutFinal = getPhase6KnockoutFinal(mockTournament, null);
    expect(knockoutFinal).not.toBeNull();
    expect(knockoutFinal.isConfirmed).toBe(true);
    // Crucial: Champion is Bot 1 (the final match winner), NOT Bot 8 (group point leader)
    expect(knockoutFinal.championId).toBe('p-bot-1');
    expect(knockoutFinal.championName).toBe('Bot 1 - Alpha');
    expect(knockoutFinal.runnerUpId).toBe('p-bot-2');
    expect(knockoutFinal.runnerUpName).toBe('Bot 2 - Beta');
    expect(knockoutFinal.playerA.wins).toBe(2);
    expect(knockoutFinal.playerB.wins).toBe(1);

    const readiness = getPhase6Readiness(mockTournament, null, knockoutFinal);
    expect(readiness.finalAndChampionConfirmed).toBe(true);
    expect(readiness.noErrorsOrTiebreakers).toBe(true);
  });

  it('keeps champion unconfirmed when Knockout final match is still pending or has no winner', () => {
    const extractFn = new Function(
      'state = { multiStage: {} }',
      `${tournamentsJs}; return { getPhase6KnockoutFinal, getPhase6Readiness };`
    );
    const { getPhase6KnockoutFinal, getPhase6Readiness } = extractFn();

    const mockTournament = {
      tournamentId: 't-multistage-pending',
      format: 'multi_stage',
      status: 'running',
      stages: [
        {
          stageId: 's-knockout',
          stageType: 'knockout',
          status: 'in_progress',
          rounds: [
            {
              roundNumber: 1,
              pairings: [
                {
                  pairingId: 'pairing-final-pending',
                  participantA: 'p-bot-1',
                  participantB: 'p-bot-2',
                  status: 'in_progress',
                  matchResult: null,
                },
              ],
            },
          ],
        },
      ],
    };

    const knockoutFinal = getPhase6KnockoutFinal(mockTournament, null);
    expect(knockoutFinal.isConfirmed).toBe(false);
    expect(knockoutFinal.championId).toBeNull();
    expect(knockoutFinal.championName).toBeNull();

    const readiness = getPhase6Readiness(mockTournament, null, knockoutFinal);
    expect(readiness.finalAndChampionConfirmed).toBe(false);
    expect(readiness.isReadyToPublish).toBe(false);
  });

  it('evaluates publication readiness accurately according to backend rules', () => {
    const extractFn = new Function(
      `${tournamentsJs}; return { getPhase6Readiness };`
    );
    const { getPhase6Readiness } = extractFn();

    // 1. All complete, 0 errors, champion confirmed => Ready
    const mockReady = {
      format: 'multi_stage',
      status: 'completed',
      stages: [
        {
          stageId: 's-ko',
          rounds: [{ pairings: [{ participantA: 'p1', participantB: 'p2', status: 'completed' }] }],
        },
      ],
    };
    const readyState = getPhase6Readiness(mockReady, null, { isConfirmed: true, championName: 'Bot 1' });
    expect(readyState.allPairingsCompleted).toBe(true);
    expect(readyState.noErrorsOrTiebreakers).toBe(true);
    expect(readyState.finalAndChampionConfirmed).toBe(true);
    expect(readyState.isReadyToPublish).toBe(true);

    // 2. Contains failed pairing => Not ready
    const mockFailed = {
      format: 'multi_stage',
      status: 'completed',
      stages: [
        {
          stageId: 's-ko',
          rounds: [
            {
              pairings: [
                { participantA: 'p1', participantB: 'p2', status: 'completed' },
                { participantA: 'p3', participantB: 'p4', status: 'failed' },
              ],
            },
          ],
        },
      ],
    };
    const failedState = getPhase6Readiness(mockFailed, null, { isConfirmed: true, championName: 'Bot 1' });
    expect(failedState.noErrorsOrTiebreakers).toBe(false);
    expect(failedState.failedMatches).toBe(1);
    expect(failedState.isReadyToPublish).toBe(false);
  });

  it('renders required Phase 6 UI components in markup and bundle', () => {
    // Structural presence in bundled app.js
    expect(appJs).toContain('phase-layout-results-review');
    expect(appJs).toContain('phase6-final-match-card');
    expect(appJs).toContain('Công bố kết quả');

    // Stage-specific results and replay actions.
    expect(appJs).toContain('phase6-results-board');
    expect(appJs).toContain('phase6-stage-tabs');
    expect(appJs).toContain('phase6-results-tabs');
    expect(appJs).toContain("role: 'tablist'");
    expect(appJs).toContain("'aria-selected': index === 0 ? 'true' : 'false'");
    expect(appJs).toContain('phase6-results-tab-panel');
    expect(appJs).toContain('phase6-stage-standings-table');
    expect(appJs).toContain('phase6-result-match-row');
    expect(appJs).toContain('renderPhase6ReplayAction');
    expect(appJs).toContain('phase6SelectedKnockoutPairingId');
    expect(appJs).toContain('phase6-knockout-detail-card');
    expect(appJs).toContain('Thông tin trận đấu');
    expect(appJs).toContain("tabindex: '0'");
    expect(appJs).toContain('pairing.replayAvailable === false');
    expect(appJs).toContain('Vòng loại khu vực');
    expect(appJs).toContain('Vòng bảng');
    expect(appJs).toContain('Vòng loại trực tiếp');

  });

  it('provides complete CSS rules for Phase 6 results review workspace', () => {
    expect(css).toContain('.phase6-final-match-card');
    expect(css).toContain('.phase6-final-match-grid');
    expect(css).toContain('.phase6-finalist-card');
    expect(css).toContain('.phase6-winner-badge');
    expect(css).toContain('.phase6-final-score-display');
    expect(css).toContain('.phase6-results-board');
    expect(css).toContain('.phase6-stage-tabs');
    expect(css).toContain('.phase6-results-tabs');
    expect(css).toContain('.phase6-results-tab.is-active');
    expect(css).toContain('.phase6-stage-result-card');
    expect(css).toContain('.phase6-result-match-row');
    expect(css).toContain('.phase6-stage-standings-scroll');

    // Hides multi-stage workspace and stepper in Phase 6
    expect(css).toMatch(/\.tournament-detail-redesign\.is-phase-6\s+#multi-stage-workspace/);
  });

  it('supports organizer publication CTA in header for completed tournaments in multi-stage actions', () => {
    const fnSection = tournamentsJs.slice(
      tournamentsJs.indexOf('function renderMultiStageActions'),
      tournamentsJs.indexOf('function renderMultiStageProgressSummary')
    );
    expect(fnSection).toContain("if (status === 'completed')");
    expect(fnSection).toContain("'Công bố kết quả'");
    expect(fnSection).toContain("'publish'");
  });
});
