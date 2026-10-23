import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('Tournament status filters', () => {
  it('hides organizer-only statuses from competitor filters and resets invalid selection', async () => {
    const tournaments = await source('js/tournaments.js');

    expect(tournaments).toContain("new Set(['all', 'registration_open', 'registration_closed', 'running', 'completed'])");
    expect(tournaments).toContain("option.hidden = Boolean(allowed && !allowed.has(option.value))");
    expect(tournaments).toContain("filter.value = 'all'");
    expect(tournaments).toContain("state.tournamentStatusFilter = 'all'");
    expect(tournaments).toContain("state.dashboardTournamentStatus = 'all'");
  });

  it('synchronizes both tournament list and dashboard filters', async () => {
    const [tournaments, dashboard] = await Promise.all([
      source('js/tournaments.js'),
      source('js/dashboard.js'),
    ]);

    expect(tournaments).toContain("'#tournament-status-filter', '#dashboard-tournament-status'");
    expect(tournaments).toContain('syncTournamentStatusFilters();');
    expect(dashboard).toContain('syncTournamentStatusFilters();');
  });

  it('resets the competitor status filter before loading public discovery', async () => {
    const bots = await source('js/bots.js');

    expect(bots).toContain("state.tournamentStatusFilter = 'all';");
    expect(bots).toContain("statusFilter.value = 'all';");
    expect(bots).toContain("tournament.status === 'draft' || tournament.status === 'registration_open'");
  });

  it('keeps visible drafts in the competitor dashboard without counting them as open registration', async () => {
    const dashboard = await source('js/dashboard.js');

    expect(dashboard).toContain("['draft', 'registration_open', 'running'].includes(tournament.status)");
    expect(dashboard).toContain("const openCount = tournaments.filter(tournament => tournament.status === 'registration_open').length;");
    expect(dashboard).toContain("'registration_not_open'");
  });
});
