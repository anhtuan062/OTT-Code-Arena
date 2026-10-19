import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readAssembledFrontendMarkup } from './frontend-fixtures';

const read = (name: string) => readFile(resolve(process.cwd(), name), 'utf8');

describe('SPA rendering and request foundations', () => {
  it('renders API data through safe DOM APIs and authorized requests', async () => {
    const app = await read('app.js');
    expect(app).not.toMatch(/\.(?:innerHTML|outerHTML|insertAdjacentHTML)\s*[=(]/);
    expect(app).toContain('textContent');
    expect(app).toContain("credentials: 'same-origin'");
    expect(app).toContain("headers['x-csrf-token']");
  });

  it('keeps authentication views exclusive and keyboard reachable', async () => {
    const [app, page] = await Promise.all([read('app.js'), readAssembledFrontendMarkup()]);
    expect(app).toContain('function setAuthMode');
    expect(app).toContain('loginForm.hidden = !loginMode');
    expect(app).toContain('registerForm.hidden = loginMode');
    expect(app).toContain('function togglePassword');
    expect(page).toContain('id="login-password-toggle"');
    expect(page).toContain('id="register-password-toggle"');
    expect(page).toContain('id="login-form-message"');
  });

  it('keeps shared notifications dismissible with extended error visibility', async () => {
    const [app, css] = await Promise.all([read('app.js'), read('style.css')]);
    expect(app).toContain("type === 'error' ? 8000 : 3000");
    expect(app).toContain("actionButton('Đóng'");
    expect(css).toContain('.toast-close');
    expect(css).toContain('.toast-error { background: var(--error-color); }');
  });

  it('guards async updates and responsive navigation by current view/session', async () => {
    const [app, page] = await Promise.all([read('app.js'), readAssembledFrontendMarkup()]);
    expect(app).toContain('authRevision');
    expect(app).toContain('viewRevision');
    expect(app).toContain('isCurrentView');
    expect(app).toContain('function toggleMobileNavigation');
    expect(app).toContain("state.tournamentScope = button.dataset.target === 'my-tournaments' ? 'mine' : 'discoverable'");
    expect(page).toContain('id="sidebar-backdrop"');
    expect(page).toContain('id="tournament-tab-mine"');
  });

  it('keeps dashboard queue data organizer-only and role-specific', async () => {
    const [app, page] = await Promise.all([read('app.js'), readAssembledFrontendMarkup()]);
    expect(app).toContain('if (queueCard) queueCard.hidden = competitor');
    expect(app).toContain("competitor ? '/tournaments/discoverable' : '/tournaments'");
    expect(app).toContain("id: 'dashboard-username'");
    expect(page).toContain('id="dash-queue-card"');
    expect(page).toContain('data-role="competitor"');
  });

  it('keeps Bot editing safe, bounded, searchable, and revision-aware', async () => {
    const [app, page] = await Promise.all([read('app.js'), readAssembledFrontendMarkup()]);
    expect(app).toContain('function renderBotList');
    expect(app).toContain('function botSourceInput');
    expect(app).toContain("new TextEncoder().encode(source).byteLength > 64 * 1024");
    expect(app).toContain('state.botWorkspaceReadOnly');
    expect(app).toContain('function updateEditorMetrics');
    expect(page).toContain('id="bot-source-lines"');
    expect(page).toContain('id="bot-source-runtime"');
    expect(page).toContain('id="bot-sdk-reference"');
  });

  it('keeps tournament actions and detail rendering guarded', async () => {
    const [app, page] = await Promise.all([read('app.js'), readAssembledFrontendMarkup()]);
    expect(app).toContain("/tournaments/${tournamentId}/action");
    expect(app).toContain("isCurrentView('tournament-detail'");
    expect(app).toContain('function renderTournamentLifecycle');
    expect(app).toContain("action === 'publish'");
    expect(page).toContain('id="tournament-action-modal"');
    expect(page).toContain('id="td-lifecycle"');
    expect(page).toContain('id="td-requests"');
  });

  it('keeps replay stepping, playback cleanup, and participant projections safe', async () => {
    const [app, page] = await Promise.all([read('app.js'), readAssembledFrontendMarkup()]);
    expect(app).toContain('function buildStateAt');
    expect(app).toContain('clearTimeout(state.replayTimer)');
    expect(app).toContain('state.replayPlaybackToken');
    expect(app).toContain('function applyReplayParticipantIdentities(replay)');
    expect(app).toContain('identity.participantName || fallback');
    expect(app).toContain('identity.botName');
    expect(app).not.toContain('innerHTML = participation');
    expect(page).toContain('id="replay-scrubber"');
    expect(page).toContain('id="r-turn-display"');
    expect(page).toContain('id="r-selected-move"');
  });

  it('keeps runtime drafts and immutable revision retry state explicit', async () => {
    const app = await read('app.js');
    expect(app).toContain('const STRATEGY_TEMPLATES = {');
    expect(app).toContain('state.sourceRuntimeDrafts.set(currentRuntime');
    expect(app).toContain('state.pendingSourceRevision = { revision, source }');
    expect(app).toContain('if (state.sourceDirty && !(await saveBotSource()))');
    expect(app).toContain('return result === true');
  });

  it('keeps registration, cancellation, and authorized POST mutation flows actionable', async () => {
    const [app, page] = await Promise.all([read('app.js'), readAssembledFrontendMarkup()]);
    expect(app).toContain('showRegistrationErrorState');
    expect(app).toContain('body: JSON.stringify({ participantName, botId, revisionId })');
    expect(app).toContain("await api(endpoint, { method: 'POST'");
    expect(app).not.toContain('window.location = endpoint');
    expect(page).toContain('id="registration-bots-error"');
    expect(page).toContain('id="confirm-tournament-action"');
  });
});
