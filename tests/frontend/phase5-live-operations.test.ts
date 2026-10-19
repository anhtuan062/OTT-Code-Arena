import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readAssembledFrontendStyles } from './frontend-fixtures';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('Phase 5 Tournament Live Operations Workspace', () => {
  it('excludes byes from the Phase 5 execution metrics', async () => {
    const tournaments = await source('js/tournaments.js');
    expect(tournaments).toContain('function getPhase5ExecutionSummary(tournament, progress)');
    expect(tournaments).toContain('function getAllTournamentPairings(tournament)');

    const phase5Source = tournaments.slice(
      tournaments.indexOf('function getAllTournamentPairings'),
      tournaments.indexOf('function renderPhase5Running')
    );
    const extractFn = new Function(
      'multiStagePairingStats',
      `${phase5Source}; return { getPhase5ExecutionSummary, getAllTournamentPairings };`
    );
    const { getPhase5ExecutionSummary, getAllTournamentPairings } = extractFn(progress => ({
      total: Number(progress.total) || 0,
      completed: Number(progress.completed) || 0,
      inProgress: Number(progress.inProgress ?? progress.running) || 0,
      pending: Number(progress.pending) || 0,
      failed: Number(progress.failed) || 0,
      pendingTiebreaker: Number(progress.pendingTiebreaker) || 0,
    }));

    // Mock 31-bot tournament with 4 groups (A: 7 bots + 7 byes, B-D: 8 bots) + 7 knockout matches
    const mockTournament = {
      stages: [
        {
          stageId: 's-groups',
          stageType: 'group_stage',
          groups: [
            {
              groupId: 'Group-A',
              name: 'Bảng A',
              rounds: Array.from({ length: 7 }, (_, r) => ({
                roundNumber: r + 1,
                pairings: [
                  ...Array.from({ length: 3 }, (_, p) => ({ pairingId: `ga-${r}-${p}`, participantA: `pa-${p * 2}`, participantB: `pa-${p * 2 + 1}`, status: 'scheduled' })),
                  { pairingId: `ga-${r}-bye`, participantA: `pa-${r}`, participantB: null, status: 'completed' },
                ],
              })),
            },
            ...['B', 'C', 'D'].map(gName => ({
              groupId: `Group-${gName}`,
              name: `Bảng ${gName}`,
              rounds: Array.from({ length: 7 }, (_, r) => ({
                roundNumber: r + 1,
                pairings: Array.from({ length: 4 }, (_, p) => ({ pairingId: `g${gName.toLowerCase()}-${r}-${p}`, participantA: 'p1', participantB: 'p2', status: 'scheduled' })),
              })),
            })),
          ],
        },
        {
          stageId: 's-ko',
          stageType: 'knockout',
          rounds: [
            { roundNumber: 1, pairings: Array.from({ length: 4 }, (_, i) => ({ pairingId: `ko-qf-${i}`, participantA: '1st-Group-A', participantB: '2nd-Group-B', status: 'scheduled' })) },
            { roundNumber: 2, pairings: Array.from({ length: 2 }, (_, i) => ({ pairingId: `ko-sf-${i}`, participantA: 'Semi-1-winner', participantB: 'Semi-2-winner', status: 'scheduled' })) },
            { roundNumber: 3, pairings: [{ pairingId: 'ko-fin', participantA: 'Final-1', participantB: 'Final-2', status: 'scheduled' }] },
          ],
        },
      ],
    };

    const summary = getPhase5ExecutionSummary(mockTournament, null);
    expect(summary.total).toBe(112); // 21 playable group pairings x 4 groups + 7 knockout pairings
    expect(summary.completed).toBe(0);
    expect(summary.running).toBe(0);
    expect(summary.waiting).toBe(112);
    expect(summary.byes).toBe(7);

    const staleProgressSummary = getPhase5ExecutionSummary(mockTournament, {
      progress: { total: 119, completed: 7, inProgress: 0, pending: 112, failed: 0, pendingTiebreaker: 0 },
    });
    expect(staleProgressSummary).toMatchObject({ total: 112, completed: 0, waiting: 112, byes: 7 });

    mockTournament.stages[0].rounds = mockTournament.stages[0].groups.flatMap(group => group.rounds);
    expect(getAllTournamentPairings(mockTournament)).toHaveLength(119);
    expect(getPhase5ExecutionSummary(mockTournament, null)).toMatchObject({ total: 112, completed: 0, waiting: 112, byes: 7 });
  });

  it('renders a single authoritative execution overview card and eliminates in-card duplicate action', async () => {
    const [app, tournaments, css] = await Promise.all([
      source('app.js'),
      source('js/tournaments.js'),
      readAssembledFrontendStyles(),
    ]);

    // Single progress overview card
    expect(tournaments).toContain("className: 'tournament-panel phase-card phase-live-progress phase5-execution-overview'");
    expect(tournaments).toContain("className: 'phase5-progress-subtitle', text: 'Theo pairing của giai đoạn hiện tại'");
    expect(tournaments).toContain('Tiến độ thi đấu');
    expect(tournaments).toContain('Tổng cặp đấu');
    expect(tournaments).toContain('Hoàn thành');
    expect(tournaments).toContain('Đang chạy');
    expect(tournaments).toContain('Chờ xử lý');
    expect(tournaments).not.toContain('Tiến độ chỉ tính các cặp có đủ hai Bot.');

    // No run button inside overview card
    const phase5Section = tournaments.slice(tournaments.indexOf('function renderPhase5Running'), tournaments.indexOf('function renderPhase6Results'));
    expect(phase5Section).not.toContain("actionButton('Chạy tất cả trận đấu'");
    expect(phase5Section).not.toContain("actionButton(actionLabel('run_all')");

    // CSS tokens for overview card
    expect(css).toContain('.phase5-execution-overview');
    expect(css).toContain('.phase5-progress-head');
    expect(css).toContain('.phase5-stats-grid');
    expect(css).toContain('.phase5-progress-note');
    expect(css).toContain('.phase-stat-box.is-completed');
    expect(css).toContain('.phase-stat-box.is-running');
  });

  it('suppresses duplicate progress summary from multi-stage workspace during Phase 5', async () => {
    const tournaments = await source('js/tournaments.js');
    expect(tournaments).toContain("const isPhase5Workspace = workspace.closest('.phase-layout-running') !== null;");
    expect(tournaments).toContain('!options.hideProgressSummary && !isPhase5Workspace && !isPhase7Workspace && getTournamentLifecyclePhase(state.currentTournament) !== 5');
    expect(tournaments).toContain('renderMultiStageWorkspace({ preserveFocus: true, hideProgressSummary: true })');
  });

  it('supports Active Match Spotlight for both idle state and running pairings', async () => {
    const [tournaments, css] = await Promise.all([
      source('js/tournaments.js'),
      readAssembledFrontendStyles(),
    ]);

    // Active spotlight structure
    expect(tournaments).toContain('phase5-active-spotlight');
    expect(tournaments).toContain('live-pulse-dot');
    expect(tournaments).toContain('Chưa có trận đang thi đấu');
    expect(tournaments).toContain('Scheduler sẵn sàng điều phối lượt trận tiếp theo.');
    expect(tournaments).toContain('trận đấu đang được xử lý trong Docker Sandbox');
    expect(tournaments).toContain('phase5-active-matches-list');
    expect(tournaments).toContain('phase5-active-match-card');
    expect(tournaments).toContain("const format = isRegionalPairing ? 'BO3'");
    expect(tournaments).toContain("actionButton('Xem trực tiếp'");

    // CSS styles for pulse and idle spotlight
    expect(css).toContain('.phase5-active-spotlight');
    expect(css).toContain('.phase5-active-spotlight.is-idle');
    expect(css).toContain('.live-pulse-dot.is-idle');
    expect(css).toContain('.phase5-active-matches-list');
    expect(css).toContain('.phase5-active-match-card');
    expect(css).toContain('.phase5-active-badge');
  });

  it('provides single contextual action button in header and accurate scheduler status', async () => {
    const tournaments = await source('js/tournaments.js');

    // Header actions
    expect(tournaments).toContain("if (status !== 'running') return;");
    expect(tournaments).toContain('const activePairings = Number(execution.inProgress) || running;');
    expect(tournaments).toContain("'Đang chạy trận đấu'");
    expect(tournaments).toContain("'Chạy lại giải đấu'");
    expect(tournaments).toContain("actionLabel('run_all')");
    expect(tournaments).toContain('runButton.disabled = true;');
    expect(tournaments).toContain("runButton.setAttribute('aria-busy', 'true');");

    // Execution status text in status row
    expect(tournaments).toContain("'Giải đang diễn ra · Scheduler sẵn sàng'");
  });

  it('renders dedicated stage workspaces: Regional Preliminaries, Group Stage, and Knockout', async () => {
    const [tournaments, css] = await Promise.all([
      source('js/tournaments.js'),
      readAssembledFrontendStyles(),
    ]);

    // Stage navigation header
    expect(tournaments).toContain("className: 'phase5-stage-nav-title', text: 'Theo dõi giai đoạn'");
    expect(css).toContain('.phase5-stage-nav-wrap');
    expect(css).toContain('.phase5-stage-nav-title');

    // Regional Preliminary Workspace keeps only region selection and selected details.
    expect(tournaments).not.toContain("className: 'regional-overview-grid'");
    expect(tournaments).not.toContain("'Cặp đấu đã hoàn thành'");
    expect(tournaments).not.toContain("'Suất đi tiếp đã xác định'");
    expect(tournaments).not.toContain('Các khu vực thi đấu');
    expect(tournaments).not.toContain('regional-unselected-prompt');
    expect(tournaments).not.toContain('Chọn khu vực để xem danh sách Bot, các cặp đấu và kết quả.');
    expect(tournaments).toContain('Xem lịch và kết quả khu vực →');
    expect(tournaments).toContain('Bảng xếp hạng');
    expect(tournaments).toContain('regional-standings-table');
    expect(tournaments).toContain('participantResults');
    expect(tournaments).toContain("resultStatus === 'in_progress'");
    expect(css).toContain('.regional-overview-grid');
    expect(css).toContain('.regional-stat-box');
    expect(css).toContain('.regional-detail-card');
    expect(css).toContain('.regional-unselected-prompt');

    // Group Stage: Action link
    expect(tournaments).toContain("className: 'group-stage-action-link', text: 'Xem bảng đấu →'");
    expect(css).toContain('.group-stage-action-link');

    // Knockout Stage: Separate sibling cards & truncation prevention
    expect(tournaments).toContain('knockout-bracket-card');
    expect(tournaments).toContain('knockout-detail-card');
    expect(tournaments).toContain('const displayName = name;');
    expect(tournaments).toContain('return `${ordinal} ${match[2]}`;');
    expect(tournaments).toContain('knockout-detail-empty-state');
    expect(tournaments).toContain('Chọn một cặp đấu trên sơ đồ để xem từng ván, trạng thái Live và Replay.');
    expect(css).toContain('.knockout-bracket-card');
    expect(css).toContain('.knockout-detail-card');
    expect(css).toContain('.knockout-detail-empty-state');
  });

  it('hides stepper in Phase 5 to eliminate visual clutter and restore hierarchy', async () => {
    const [tournaments, css] = await Promise.all([
      source('js/tournaments.js'),
      readAssembledFrontendStyles(),
    ]);

    expect(tournaments).toContain("detail.classList.toggle('is-phase-5', phase === 5);");
    expect(css).toContain('.tournament-detail-redesign.is-phase-5 #td-stepper');
    expect(css).toContain('display: none !important;');
  });
});
