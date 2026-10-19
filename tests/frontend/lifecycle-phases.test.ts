import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readAssembledFrontendMarkup, readAssembledFrontendStyles } from './frontend-fixtures';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('Tournament Lifecycle 7-Phase Distinct UI/UX Architecture', () => {
  it('defines getTournamentLifecyclePhase mapping the 7 conceptual phases to real state machine', async () => {
    const app = await source('app.js');
    expect(app).toContain('function getTournamentLifecyclePhase(tournament)');
    expect(app).toContain("if (status === 'draft') return 1;");
    expect(app).toContain("if (status === 'registration_open') return 2;");
    expect(app).toContain("if (status === 'registration_closed')");
    expect(app).toContain('return hasRounds ? 4 : 3;');
    expect(app).toContain("if (status === 'running') return 5;");
    expect(app).toContain("if (status === 'completed')");
    expect(app).toContain('return tournament.resultsPublishedAt ? 7 : 6;');
  });

  it('keeps the tournament header consistent: name above status and phase label', async () => {
    const [markup, app, css] = await Promise.all([
      readAssembledFrontendMarkup(),
      source('app.js'),
      readAssembledFrontendStyles(),
    ]);
    expect(markup).toContain('class="tournament-status-row"');
    expect(markup).toContain('id="td-phase-label"');
    expect(app).toContain("phaseLabel.textContent = `Giai đoạn ${currentIndex + 1}/7`");
    expect(css).toContain('.tournament-detail-title {');
    expect(css).toContain('display: block;');
    expect(css).toContain('.tournament-status-row {');
  });

  it('declares the dynamic #td-lifecycle-body container in the markup', async () => {
    const markup = await readAssembledFrontendMarkup();
    expect(markup).toContain('id="td-lifecycle-body"');
    expect(markup).toContain('class="tournament-lifecycle-body"');
    expect(markup).toContain('id="td-lifecycle"');
    expect(markup).toContain('id="td-next-step"');
  });

  it('implements distinct renderers for all 7 lifecycle phases', async () => {
    const app = await source('app.js');
    expect(app).toContain('function renderPhase1Creation(container, tournament)');
    expect(app).toContain('function renderPhase2Registration(container, tournament)');
    expect(app).toContain('function renderPhase3RosterFinal(container, tournament)');
    expect(app).toContain('function renderPhase4Scheduling(container, tournament)');
    expect(app).toContain('function renderPhase5Running(container, tournament, multiStageContext)');
    expect(app).toContain('function renderPhase6Results(container, tournament)');
    expect(app).toContain('function renderPhase7History(container, tournament, multiStageContext)');
  });

  it('renders Phase 1 (Draft / Tournament Creation) with configuration summary', async () => {
    const [app, css] = await Promise.all([source('app.js'), readAssembledFrontendStyles()]);
    expect(app).toContain('phase-layout-draft');
    expect(app).toContain('phase-config-summary');
    expect(app).not.toContain('phase-readiness-checklist');
    expect(app).toContain('actionLabel(\'open_registration\')');
    expect(css).toContain('.phase-cards-grid');
    expect(css).toContain('.phase-info-list');
    expect(css).toContain('.phase-checklist');
    expect(css).toContain('.phase-setup-form .dialog-input');
    expect(css).toContain('white-space: nowrap;');
    expect(css).toContain('width: auto !important;');
  });

  it('renders Phase 2 (Registration Open) with approved roster, requests inbox, and competitor CTA', async () => {
    const [app, css] = await Promise.all([source('app.js'), readAssembledFrontendStyles()]);
    expect(app).toContain('phase-layout-registration');
    expect(app).toContain('phase-approved-roster');
    expect(app).toContain('phase-requests-inbox');
    expect(app).toContain('renderPhase2Requests');
    expect(app).toContain('actionLabel(\'close_registration\')');
    expect(css).toContain('.phase-registration-columns');
    expect(css).toContain('.phase-cta-card');
    expect(css).toContain('.req-approve-btn');
    expect(css).toContain('.req-reject-btn');
  });

  it('renders Phase 3 (Roster Final / Registration Closed) with locked roster checklist and scheduling CTA', async () => {
    const [app, css] = await Promise.all([source('app.js'), readAssembledFrontendStyles()]);
    expect(app).toContain('phase-layout-roster-final');
    expect(app).toContain('phase-eligibility-check');
    expect(app).toContain('phase-official-roster');
    expect(app).toContain('actionLabel(\'generate_schedule\')');
    expect(css).toContain('.phase-roster-table');
    expect(css).toContain('.phase-pill.is-locked');
  });

  it('renders a searchable paginated roster in Phase 3 without a readiness conclusion', async () => {
    const [app, css] = await Promise.all([source('app.js'), readAssembledFrontendStyles()]);
    expect(app).toContain('function getPhase3RosterRows(tournament)');
    expect(app).toContain('const pageSize = 10;');
    expect(app).toContain("type: 'search'");
    expect(app).toContain("runtimeFilter = 'all'");
    expect(app).not.toContain('phase3-readiness-summary');
    expect(app).toContain('phase3-official-roster');
    expect(app).toContain('function isRosterFinalPhase(tournament)');
    expect(app).toContain("if (tournament.status === 'draft' || tournament.status === 'registration_open' || isRosterFinalPhase(tournament))");
    expect(app).toContain('if (!isRegOpen && !rosterFinalPhase)');
    expect(css).toContain('.phase3-roster-search');
    expect(css).toContain('.phase3-pagination');
  });

  it('renders Phase 4 (Scheduling Preview) with round pairings preview and start CTA', async () => {
    const [app, css] = await Promise.all([source('app.js'), readAssembledFrontendStyles()]);
    expect(app).toContain('phase-layout-schedule-preview');
    expect(app).toContain('phase-schedule-banner');
    expect(app).toContain('phase-schedule-structure');
    expect(app).toContain("const searchSvg = icon('icon-search');");
    expect(app).toContain('const upstreamPairingId = slot?.sourceRef?.pairingId || participantId.replace(/-winner$/i, \'\');');
    expect(app).toContain('return upstreamMatchCode ? `Thắng ${upstreamMatchCode}` : `Thắng ${upstreamPairingId}`;');
    expect(app).toContain('function pairingMatchCode(tournament, pairingId)');
    expect(app).toContain("if (roundsFromFinal === 1) return `BK${matchNumber}`;");
    expect(app).toContain("if (roundsFromFinal === 2) return `TK${matchNumber}`;");
    expect(app).toContain("const rankLabel = { 1: 'Nhất', 2: 'Nhì', 3: 'Ba', 4: 'Tư' }[Number(match[1])] || `Hạng ${match[1]}`;");
    expect(app).toContain("className: 'phase4-pairing-code'");
    expect(app).toContain('actionLabel(\'start\')');
    expect(css).toContain('.phase-schedule-banner');
    expect(css).toContain('.phase-rounds-preview');
    expect(css).toContain('.phase-preview-pairing');
    expect(css).toContain('.phase4-pairing-code');
  });

  it('hides bye pairings from the Phase 4 schedule preview', async () => {
    const app = await source('app.js');
    expect(app).toContain('(r.pairings || []).filter(p => p.participantB !== null)');
    expect(app).toContain('const gDescText = `${gPairings.length} cặp đấu`;');
    expect(app).not.toContain("data-group-id': 'preliminary'");
  });

  it('renders Phase 5 (Running) with live progress bar, active match spotlight, and stage workspace', async () => {
    const [app, css] = await Promise.all([source('app.js'), readAssembledFrontendStyles()]);
    expect(app).toContain('phase-layout-running');
    expect(app).toContain('phase-live-progress');
    expect(app).toContain('phase-active-spotlight');
    expect(app).toContain('live-pulse-dot');
    expect(app).toContain('multi-stage-workspace');
    expect(css).toContain('.phase-live-stats-grid');
    expect(css).toContain('.phase-stat-box');
    expect(css).toContain('.live-pulse-dot');
  });

  it('renders Phase 6 (Results Review) with unpublished review banner, champion preview, and publish CTA', async () => {
    const [app, css] = await Promise.all([source('app.js'), readAssembledFrontendStyles()]);
    expect(app).toContain('phase-layout-results-review');
    expect(app).toContain('phase-review-banner');
    expect(app).toContain('phase-champion-preview');
    expect(app).toContain('phase-final-standings');
    expect(app).toContain('Công bố kết quả');
    expect(css).toContain('.phase-review-banner');
    expect(css).toContain('.phase-champion-preview');
  });

  it('renders Phase 7 (History / Archive) with official podium, replay archive, and bracket', async () => {
    const [app, css] = await Promise.all([source('app.js'), readAssembledFrontendStyles()]);
    expect(app).toContain('phase-layout-completed-archive');
    expect(app).toContain('phase-official-podium');
    expect(app).toContain('phase-podium-grid');
    expect(app).toContain('step-gold');
    expect(app).toContain('step-silver');
    expect(app).toContain('step-bronze');
    expect(app).toContain('phase-replay-archive');
    expect(app).toContain('archive-match-names');
    expect(css).toContain('.phase-podium-grid');
    expect(css).toContain('.phase-podium-step');
    expect(css).toContain('.phase-archive-row');
  });

  it('renders Knockout bracket and match details as two completely separate sibling section cards', async () => {
    const [app, css] = await Promise.all([source('app.js'), readAssembledFrontendStyles()]);
    
    // Bracket card is a tournament-panel section
    expect(app).toContain("className: 'tournament-panel knockout-view knockout-bracket-card'");
    // Detail card is a completely separate sibling tournament-panel section
    expect(app).toContain("className: 'tournament-panel knockout-detail-card'");
    // Both are appended to container as siblings
    expect(app).toContain('container.appendChild(bracketSection);');
    expect(app).toContain('container.appendChild(detailSection);');
    // Sibling CSS rules exist
    expect(css).toContain('.knockout-bracket-card');
    expect(css).toContain('.knockout-detail-card');
    expect(css).toContain('.knockout-detail-heading');
  });

  it('enforces responsive stacking and light green visual language across screen sizes', async () => {
    const css = await readAssembledFrontendStyles();
    expect(css).toContain('@media (max-width: 800px)');
    expect(css).toContain('.phase-registration-columns');
    expect(css).toContain('.phase-cards-grid');
    expect(css).toContain('@media (max-width: 620px)');
    expect(css).toContain('.phase-cta-card');
    expect(css).toContain('.phase-schedule-banner');
    expect(css).toContain('.phase-review-banner');
    expect(css).toContain('.phase-live-action-row');
  });
});

