import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readAssembledFrontendMarkup, readAssembledFrontendStyles } from './frontend-fixtures';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('Phase 4 Tournament Schedule Preview Workspace', () => {
  it('implements dedicated Tournament Schedule Preview Workspace structure in Phase 4', async () => {
    const [app, tournaments, markup] = await Promise.all([
      source('app.js'),
      source('js/tournaments.js'),
      readAssembledFrontendMarkup(),
    ]);

    // Header enhancements
    expect(markup).toContain('id="td-breadcrumb-root"');
    expect(markup).toContain('id="td-phase-label"');

    // Breadcrumb and phase label updates
    expect(tournaments).toContain("breadcrumbRoot.textContent = 'Quản lý giải đấu'");
    expect(tournaments).toContain("breadcrumbName.textContent = 'Lập lịch thi đấu'");
    expect(tournaments).toContain("phaseLabel.textContent = 'Giai đoạn 4/7'");

    // Workspace container and class
    expect(tournaments).toContain('phase4-schedule-workspace');
    expect(tournaments).toContain('phase-layout-schedule-preview');

    // 1. Summary Grid (3 Metric Cards)
    expect(tournaments).toContain('phase4-summary-grid');
    expect(tournaments).toContain('phase4-stat-card');
    expect(tournaments).toContain('phase4-stat-number');
    expect(tournaments).toContain('Bot tham gia');
    expect(tournaments).toContain('Bảng đấu');
    expect(tournaments).toContain('Cặp đấu dự kiến');
    expect(tournaments).not.toContain('phase4-stat-sub');

    // 2. Group Overview
    expect(tournaments).toContain('phase4-groups-section');
    expect(tournaments).toContain('Phân bảng thi đấu');
    expect(tournaments).toContain('Chọn bảng để xem lịch');
    expect(tournaments).toContain('phase4-groups-grid');
    expect(tournaments).toContain('phase4-group-card');
    expect(tournaments).toContain('phase4-group-title');
    expect(tournaments).toContain('phase4-group-bots');
    expect(tournaments).toContain('phase4-group-desc');

    // 3. Schedule Explorer
    expect(tournaments).toContain('phase4-schedule-explorer');
    expect(tournaments).toContain('phase4-explorer-head');
    expect(tournaments).toContain('phase4-explorer-title');
    expect(tournaments).toContain('phase4-explorer-note');
    expect(tournaments).toContain('Xem trước cặp đấu, không chỉnh sửa lịch nếu hệ thống không hỗ trợ');
    expect(tournaments).toContain('phase4-format-badge');
    expect(tournaments).toContain('phase4-explorer-toolbar');
    expect(tournaments).toContain('phase4-search-box');
    expect(tournaments).toContain('id: \'phase4-search-input\'');
    expect(tournaments).toContain('id: \'phase4-round-filter\'');
    expect(tournaments).toContain('phase4-rounds-list');
    expect(tournaments).toContain('phase4-round-group');
    expect(tournaments).toContain('phase4-round-header');
    expect(tournaments).toContain('phase4-pairing-row');
    expect(tournaments).toContain('phase4-pairing-players');
    expect(tournaments).toContain('phase4-pairing-status');
    expect(tournaments).toContain('phase4PageSize = 10');
    expect(tournaments).toContain('phase4-pagination');
    expect(tournaments).toContain('Trang ${phase4Page}/${totalPages}');

    // Bundled app includes the workspace implementation
    expect(app).toContain('phase4-schedule-workspace');
    expect(app).toContain('phase4-summary-grid');
    expect(app).toContain('phase4-group-card');
    expect(app).toContain('phase4-schedule-explorer');
    expect(app).toContain('phase4-pairing-row');
  });

  it('correctly calculates metrics and byes for 31-bot tournament (t-274b17b5...) without marking byes as completed matches', async () => {
    const tournaments = await source('js/tournaments.js');

    // Metric extraction function
    expect(tournaments).toContain('function getSchedulePreviewData(tournament)');
    expect(tournaments).toContain('const isBye = p.participantB === null;');
    expect(tournaments).toContain('byePairings++;');
    expect(tournaments).toContain('scheduledPairings++;');

    // Extract function to verify execution on mock data
    const extractFn = new Function(
      `${tournaments}; return { getSchedulePreviewData, resolveParticipantName };`
    );
    const { getSchedulePreviewData } = extractFn();

    // Mock 31-bot tournament structure matching the real system
    const mock31Tournament = {
      tournamentId: 't-274b17b5-a3cd-4c16-a5c0-e30e86911109',
      format: 'multi_stage',
      status: 'registration_closed',
      participants: Array.from({ length: 31 }, (_, i) => ({
        participantId: `p-${i + 1}`,
        name: `Bot ${i + 1}`,
      })),
      stages: [
        {
          stageId: 's-groups',
          stageType: 'group_stage',
          groups: [
            // Group A: 7 bots -> 7 rounds x 4 pairings = 28 pairings (7 byes, status 'completed' in backend)
            {
              groupId: 'Group-A',
              name: 'Bảng A',
              participantIds: Array.from({ length: 7 }, (_, i) => `p-${i + 1}`),
              rounds: Array.from({ length: 7 }, (_, r) => ({
                roundNumber: r + 1,
                pairings: [
                  { pairingId: `p-A-${r}-1`, participantA: `p-${(r % 7) + 1}`, participantB: `p-${((r + 1) % 7) + 1}`, status: 'scheduled' },
                  { pairingId: `p-A-${r}-2`, participantA: `p-${((r + 2) % 7) + 1}`, participantB: `p-${((r + 3) % 7) + 1}`, status: 'scheduled' },
                  { pairingId: `p-A-${r}-3`, participantA: `p-${((r + 4) % 7) + 1}`, participantB: `p-${((r + 5) % 7) + 1}`, status: 'scheduled' },
                  { pairingId: `p-A-${r}-4`, participantA: `p-${((r + 6) % 7) + 1}`, participantB: null, status: 'completed' }, // BYE!
                ],
              })),
            },
            // Group B: 8 bots -> 7 rounds x 4 pairings = 28 pairings (0 byes)
            {
              groupId: 'Group-B',
              name: 'Bảng B',
              participantIds: Array.from({ length: 8 }, (_, i) => `p-${i + 8}`),
              rounds: Array.from({ length: 7 }, (_, r) => ({
                roundNumber: r + 1,
                pairings: Array.from({ length: 4 }, (_, p) => ({
                  pairingId: `p-B-${r}-${p}`,
                  participantA: `p-${i(r, p, 1)}`,
                  participantB: `p-${i(r, p, 2)}`,
                  status: 'scheduled',
                })),
              })),
            },
            // Group C: 8 bots -> 28 pairings
            {
              groupId: 'Group-C',
              name: 'Bảng C',
              participantIds: Array.from({ length: 8 }, (_, i) => `p-${i + 16}`),
              rounds: Array.from({ length: 7 }, (_, r) => ({
                roundNumber: r + 1,
                pairings: Array.from({ length: 4 }, (_, p) => ({
                  pairingId: `p-C-${r}-${p}`,
                  participantA: 'p-c-1',
                  participantB: 'p-c-2',
                  status: 'scheduled',
                })),
              })),
            },
            // Group D: 8 bots -> 28 pairings
            {
              groupId: 'Group-D',
              name: 'Bảng D',
              participantIds: Array.from({ length: 8 }, (_, i) => `p-${i + 24}`),
              rounds: Array.from({ length: 7 }, (_, r) => ({
                roundNumber: r + 1,
                pairings: Array.from({ length: 4 }, (_, p) => ({
                  pairingId: `p-D-${r}-${p}`,
                  participantA: 'p-d-1',
                  participantB: 'p-d-2',
                  status: 'scheduled',
                })),
              })),
            },
          ],
        },
        // Knockout: 7 pairings (4 QF + 2 SF + 1 Final)
        {
          stageId: 's-ko',
          stageType: 'knockout',
          rounds: [
            { roundNumber: 1, pairings: Array.from({ length: 4 }, (_, i) => ({ pairingId: `ko-qf-${i}`, participantA: `1st-Group-A`, participantB: `2nd-Group-B`, status: 'scheduled' })) },
            { roundNumber: 2, pairings: Array.from({ length: 2 }, (_, i) => ({ pairingId: `ko-sf-${i}`, participantA: 'Semi-1-winner', participantB: 'Semi-2-winner', status: 'scheduled' })) },
            { roundNumber: 3, pairings: [{ pairingId: 'ko-fin', participantA: 'Final-1', participantB: 'Final-2', status: 'scheduled' }] },
          ],
        },
      ],
    };

    function i(r: number, p: number, side: number) {
      return 8 + ((r * 4 + p * 2 + side) % 8);
    }

    const data = getSchedulePreviewData(mock31Tournament);
    expect(data.participantCount).toBe(31);
    expect(data.groupCount).toBe(4);
    expect(data.totalPairings).toBe(112); // Chỉ tính cặp có đủ hai Bot
    expect(data.byePairings).toBe(7); // 7 byes in Group A
    expect(data.scheduledPairings).toBe(112);
  });

  it('accurately resolves participant display names and avoids exposing raw UUIDs', async () => {
    const tournaments = await source('js/tournaments.js');
    expect(tournaments).toContain('function resolveParticipantName(tournament, participantId, slot = null)');

    const extractFn = new Function(
      `${tournaments}; return { resolveParticipantName };`
    );
    const { resolveParticipantName } = extractFn();

    const mockTournament = {
      participants: [
        { participantId: 'p-1', name: 'Alpha Bot' },
        { participantId: 'p-2', name: 'Beta Bot', bot: { name: 'Beta Bot Pro' } },
        { participantId: 'p-pr-54e68e4c-1234', name: 'Gamma Bot' },
      ],
    };

    // Known participants return their human name
    expect(resolveParticipantName(mockTournament, 'p-1')).toBe('Alpha Bot');
    expect(resolveParticipantName(mockTournament, 'p-2')).toBe('Beta Bot');
    expect(resolveParticipantName(mockTournament, 'p-pr-54e68e4c-1234')).toBe('Gamma Bot');

    // Bye participant returns 'Miễn đấu'
    expect(resolveParticipantName(mockTournament, null)).toBe('Miễn đấu');
    expect(resolveParticipantName(mockTournament, 'null')).toBe('Miễn đấu');

    // Bracket tokens resolve to Vietnamese descriptions
    expect(resolveParticipantName(mockTournament, '1st-Group-A')).toBe('Hạng 1 Bảng A');
    expect(resolveParticipantName(mockTournament, '2nd-Group-B')).toBe('Hạng 2 Bảng B');
    expect(resolveParticipantName(mockTournament, 'Semi-1-winner')).toBe('Chờ người thắng vòng trước');
    expect(resolveParticipantName(mockTournament, 'Region-1-Q2')).toBe('Khu vực 1 (Hạng 2)');

    // Fallback for unknown UUIDs shows short readable fallback rather than full ugly UUID
    expect(resolveParticipantName(mockTournament, 'p-pr-9876543210abcdef')).toBe('Bot (p-pr-987…)');
  });

  it('renders badges distinguishing byes (Miễn đấu) from scheduled and completed pairings', async () => {
    const tournaments = await source('js/tournaments.js');
    const css = await readAssembledFrontendStyles();

    expect(tournaments).toContain("statusWrap.appendChild(create('span', { className: 'status-badge status-bye', text: 'Miễn đấu' }));");
    expect(tournaments).toContain("statusWrap.appendChild(create('span', { className: 'status-badge status-pending', text: 'Chờ thi đấu' }));");
    expect(tournaments).toContain("create('span', { className: 'phase4-bye-text', text: '(Miễn đấu)' })");

    // CSS status badge styling
    expect(css).toContain('.status-badge.status-bye');
    expect(css).toContain('.phase4-bye-text');
    expect(css).toContain('.status-badge.status-pending');
  });

  it('suppresses #multi-stage-workspace and #td-next-step in Phase 4 and keeps a single CTA in header', async () => {
    const tournaments = await source('js/tournaments.js');

    // Suppression in refreshTournamentDetail
    expect(tournaments).toContain('const currentLifecyclePhase = getTournamentLifecyclePhase(tournament);');
    expect(tournaments).toContain("if (tournament.status === 'draft' || tournament.status === 'registration_open' || isRosterFinalPhase(tournament))");
    expect(tournaments).toContain('else if (currentLifecyclePhase < 5)');
    expect(tournaments).toContain('if (workspace) { workspace.hidden = true; clear(workspace); }');

    // Suppression in renderTournamentGuidance
    expect(tournaments).toContain('if (getTournamentLifecyclePhase(tournament) <= 4)');
    expect(tournaments).toContain('guidance.hidden = true;');
    expect(tournaments).toContain('guidance.replaceChildren();');

    // Single primary action button in header #td-actions for Phase 4
    expect(tournaments).toContain("scheduledPairings > 0 ? actionLabel('start') : actionLabel('generate_schedule')");
    expect(tournaments).toContain("scheduledPairings > 0 ? 'start' : 'generate_schedule'");
  });

  it('supports interactive filtering by Bot name and round dropdown filter', async () => {
    const tournaments = await source('js/tournaments.js');

    // Search and Round Filter controls
    expect(tournaments).toContain("id: 'phase4-search-input'");
    expect(tournaments).toContain("id: 'phase4-round-filter'");
    expect(tournaments).toContain('searchInput.addEventListener(\'input\'');
    expect(tournaments).toContain('roundSelect.addEventListener(\'change\'');
    expect(tournaments).toContain('renderFilteredRounds()');
    expect(tournaments).toContain('state.phase4SearchQuery');
    expect(tournaments).toContain('state.phase4SelectedRound');
    expect(tournaments).toContain('phase4-empty-search');
  });

  it('validates Phase 4 CSS design tokens and responsive layout', async () => {
    const css = await readAssembledFrontendStyles();

    // Summary cards
    expect(css).toContain('.phase4-schedule-workspace');
    expect(css).toContain('.phase4-summary-grid');
    expect(css).toContain('.phase4-stat-card');
    expect(css).toContain('.phase4-stat-number');
    expect(css).toContain('.phase4-stat-label');

    // Group cards
    expect(css).toContain('.phase4-groups-grid');
    expect(css).toContain('.phase4-group-card');
    expect(css).toContain('.phase4-group-card.is-selected');
    expect(css).toContain('.phase4-group-title');
    expect(css).toContain('.phase4-group-bots');

    // Schedule explorer
    expect(css).toContain('.phase4-schedule-explorer');
    expect(css).toContain('.phase4-explorer-head');
    expect(css).toContain('.phase4-explorer-toolbar');
    expect(css).toContain('.phase4-search-box');
    expect(css).toContain('.phase4-search-input');
    expect(css).toContain('.phase4-round-select');
    expect(css).toContain('.phase4-pagination');
    expect(css).toContain('.phase4-pairing-row');
    expect(css).toContain('.phase4-player-name');
    expect(css).toContain('.phase4-pairing-status');

    // Brand color palette
    expect(css).toContain('#176b50');
    expect(css).toContain('#edf5ef');
    expect(css).toContain('#e4f1eb');
  });
});

