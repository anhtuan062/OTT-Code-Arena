import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readAssembledFrontendMarkup } from './frontend-fixtures';
const source = (file: string) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

describe('UX.2 role-aware navigation and dashboard', () => {
  it('defines role-specific navigation without unsupported destinations', async () => {
    const page = await readAssembledFrontendMarkup();
    expect(page).toContain('data-role="competitor" data-target="bots"');
    expect(page).not.toContain('tournament-scope-tab');
    expect(page).not.toContain('id="tournament-tab-discoverable"');
    expect(page).not.toContain('id="tournament-tab-mine"');
    expect(page).toContain('data-role="organizer"');
    expect(page).toContain('data-scope="managed"');
    expect(page).not.toContain('data-target="results"');
  });
  it('guards navigation history and dirty workspace exits', async () => {
    const app = await source('app.js');
    expect(app).toContain("document.querySelectorAll('.role-nav')");
    expect(app).toContain('link.dataset.scope === state.tournamentScope');
    expect(app).toContain("on(window, 'popstate'");
    expect(app).toContain('canLeaveBotWorkspace()');
  });
  it('limits the browser unsaved-changes warning to the Bot workspace', async () => {
    const app = await source('app.js');
    expect(app).toContain("if (state.activeView !== 'bot-workspace' || !hasUnsavedBotWorkspaceChanges()) return;");
  });
  it('uses role-specific dashboard API data and safe DOM rendering', async () => {
    const app = await source('app.js');
    expect(app).toContain("competitor ? '/tournaments/discoverable' : '/tournaments'");
    expect(app).toContain("competitor ? request('/bots') : Promise.resolve([])");
    expect(app).toContain("tournament.status === 'registration_open'");
    expect(app).not.toContain('dashboardCopy.innerHTML');
  });
  it('retains mobile navigation and dirty-draft protections', async () => {
    const [page, app] = await Promise.all([readAssembledFrontendMarkup(), source('app.js')]);
    expect(page).toContain('id="mobile-menu-toggle"');
    expect(page).toContain('id="sidebar-backdrop"');
    expect(app).toContain('function toggleMobileNavigation()');
    expect(app).toContain('function closeMobileNavigation()');
      expect(app).toContain('if (view !== state.activeView && !isPracticeReplay && !canLeaveBotWorkspace()) return false;');
  });
  it('updates the visible shell breadcrumb when opening tournament details', async () => {
    const [page, app] = await Promise.all([readAssembledFrontendMarkup(), source('app.js')]);
    expect(page).toContain('id="topbar-breadcrumb"');
    expect(page).toContain('class="topbar-breadcrumb-current" aria-current="page"');
    expect(app).toContain("const topbarBreadcrumb = $('#topbar-breadcrumb');");
    expect(app).toContain("const sectionTitle = state.user?.role === 'organizer' ? 'Quản lý' : 'Giải đấu';");
    expect(app).toContain("className: 'topbar-breadcrumb-link'");
    expect(app).toContain('updateTopbarTournamentBreadcrumb(name);');
    expect(app).toContain("'tournament-detail': state.currentTournament?.name");
    expect(app).toContain("if (state.tournamentDetailSource === 'dashboard') return 'Tổng quan';");
    expect(app).toContain("const botWorkspaceParent = view === 'bot-workspace' ? getBotWorkspaceParent() : null;");
    expect(app).toContain("['bot-workspace', 'tournament-detail', 'replay-view'].includes(view)");
    expect(app).toContain("feature: 'topbar breadcrumb navigation'");
  });
});
