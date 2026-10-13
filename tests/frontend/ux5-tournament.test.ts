import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('UX.5 tournament discovery, management, and registration', () => {
  it('uses the supported role projections and distinguishes search/filter empty states', async () => {
    const app = await source('app.js');
    const page = await source('index.html');
    expect(app).toContain("state.tournamentScope === 'mine' ? '/my/tournaments' : '/tournaments/discoverable'");
    expect(app).toContain('state.tournamentStatusFilter === \'all\'');
    expect(app).toContain('Không tìm thấy giải đấu phù hợp');
    expect(app).toContain('Chưa có yêu cầu tham gia');
    expect(page).toContain('id="tournament-status-filter"');
    expect(page).toContain('id="tournaments-list"');
  });

  it('keeps cards role-aware and uses one actionable registration path', async () => {
    const app = await source('app.js');
    expect(app).toContain('function renderDiscoverableTournamentCards');
    expect(app).toContain("state.tournamentRegistrationContext = { name: tournament.name, status: tournament.status }");
    expect(app).toContain("actionButton('Xem chi tiết'");
    expect(app).toContain('const requestButton = actionButton');
    expect(app).toContain('tournament.myRequestStatus === \'pending\'');
    expect(app).not.toContain('innerHTML =');
  });

  it('shows tournament, immutable revision, runtime/mode, and returned registration identity', async () => {
    const [app, page] = await Promise.all([source('app.js'), source('index.html')]);
    expect(page).toContain('id="registration-tournament-context"');
    expect(page).toContain('id="registration-revision-summary"');
    expect(app).toContain('Revision bất biến');
    expect(app).toContain("revision.executionMode === 'strategy'");
    expect(app).toContain('result?.revisionId || revisionId');
    expect(app).toContain('registration-form-error');
  });

  it('keeps organizer moderation and lifecycle actions on existing guarded routes', async () => {
    const app = await source('app.js');
    expect(app).toContain('/requests/${participation.requestId}/approve');
    expect(app).toContain('/requests/${participation.requestId}/reject');
    expect(app).toContain("action === 'publish' ? `/tournaments/${tournamentId}/publish` : `/tournaments/${tournamentId}/action`");
    expect(app).toContain('pendingCount');
    expect(app).toContain('await refreshTournamentDetail()');
  });

  it('renders authoritative schedule statuses, conditional replay, and standings columns safely', async () => {
    const app = await source('app.js');
    const page = await source('index.html');
    expect(app).toContain('statusBadge(pairing.status)');
    expect(app).toContain('if (pairing.matchId)');
    expect(app).toContain('textCell(standing.matchesPlayed)');
    expect(page).toContain('id="td-standings"');
    expect(app).toContain("className: 'schedule-mobile-list'");
  });
});
