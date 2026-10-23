import { describe, expect, it } from 'vitest';
import { readAssembledFrontendMarkup, readAssembledFrontendScript } from './frontend-fixtures';

describe('UX.5 tournament discovery, management, and registration', () => {
  it('uses the supported role projections and distinguishes search/filter empty states', async () => {
    const app = await readAssembledFrontendScript();
    const page = await readAssembledFrontendMarkup();
    expect(app).toContain("request('/tournaments/discoverable')");
    expect(app).toContain("request('/my/tournaments')");
    expect(app).toContain('merged.set(tournament.tournamentId');
    expect(app).toContain('state.tournaments = Array.isArray(response) ? response : []');
    expect(app).toContain('state.tournamentStatusFilter === \'all\'');
    expect(app).toContain('Không tìm thấy giải đấu phù hợp');
    expect(app).toContain('Chưa có yêu cầu tham gia');
    expect(page).toContain('id="tournament-status-filter"');
    expect(page).toContain('id="tournaments-list"');
  });

  it('routes tournament cards through the public detail screen', async () => {
    const app = await readAssembledFrontendScript();
    expect(app).toContain('function renderDiscoverableTournamentCards');
    expect(app).toContain('const pageSize = 8');
    expect(app).toContain('function renderTournamentPagination(totalPages)');
    expect(app).toContain('function tournamentParticipationBadge(tournament)');
    expect(app).toContain("joined: 'Đã tham gia'");
    expect(app).toContain("state.tournamentRegistrationContext = { name: tournament.name, status: tournament.status }");
    expect(app).toContain("actionButton('Xem chi tiết'");
    expect(app).not.toContain('const requestButton = actionButton');
    expect(app).toContain("Mở chi tiết để xem thông tin và gửi Bot đăng ký.");
    expect(app).not.toContain('innerHTML =');
  });

  it('shows tournament, immutable revision, runtime/mode, and returned registration identity', async () => {
    const [app, page] = await Promise.all([readAssembledFrontendScript(), readAssembledFrontendMarkup()]);
    expect(page).toContain('id="registration-tournament-context"');
    expect(page).toContain('id="registration-revision-summary"');
    expect(app).toContain('Revision bất biến');
    expect(app).toContain("revision.executionMode === 'strategy'");
    expect(app).toContain('state.registrationSubmission = { ...result, tournamentId };');
    expect(app).toContain('registration-form-error');
  });

  it('keeps organizer moderation and lifecycle actions on existing guarded routes', async () => {
    const app = await readAssembledFrontendScript();
    expect(app).toContain('/requests/${participation.requestId}/approve');
    expect(app).toContain('/requests/${participation.requestId}/reject');
    expect(app).toContain("action === 'publish' ? `/tournaments/${tournamentId}/publish` : `/tournaments/${tournamentId}/action`");
    expect(app).toContain('pendingCount');
    expect(app).toContain('await refreshTournamentDetail()');
  });

  it('renders authoritative schedule statuses, conditional replay, and standings columns safely', async () => {
    const app = await readAssembledFrontendScript();
    const page = await readAssembledFrontendMarkup();
    expect(app).toContain('statusBadge(pairing.status)');
    expect(app).toContain('if (pairing.matchId)');
    expect(app).toContain('textCell(standing.matchesPlayed)');
    expect(page).toContain('id="td-standings"');
    expect(app).toContain("className: 'schedule-mobile-list'");
  });
});
