import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readAssembledFrontendMarkup } from './frontend-fixtures';
const source = (file: string) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

describe('UX.3 Bot management and strategy workspace', () => {
  it('renders actionable Bot cards without exposing internal IDs as primary content', async () => {
    const app = await source('app.js');
    expect(app).toContain("actionButton('Mã nguồn'");
    expect(app).toContain("selectedRevision?.runtimeId === 'cpp'");
    expect(app).toContain("selectedRevision?.executionMode === 'strategy'");
    expect(app).not.toContain("create('span', { className: 'bot-card-id'");
  });
  it('keeps workspace save feedback and source preservation explicit', async () => {
    const app = await source('app.js');
    expect(app).toContain('function setWorkspaceStatus(text)');
    expect(app).toContain("if (!bot || state.botWorkspaceReadOnly) return;");
    expect(app).toContain('state.sourceDirty');
    expect(app).toContain('state.pendingSourceRevision');
  });
  it('standardizes Strategy SDK and keeps revision provenance read-only', async () => {
    const [app, page] = await Promise.all([source('app.js'), readAssembledFrontendMarkup()]);
    expect(app).toContain("mode.textContent = sdkVersion ? `Strategy SDK ${sdkVersion}` : 'Strategy SDK'");
    expect(app).toContain('String(revision.sourceDigest).slice(0, 12)');
    expect(page).toContain('id="bot-source-mode"');
    expect(page).toContain('id="bot-source-editor"');
    expect(page).toContain('id="practice-run"');
  });
  it('preserves Practice and navigation entry points', async () => {
    const [app, page] = await Promise.all([source('app.js'), readAssembledFrontendMarkup()]);
    expect(app).toContain('function openPracticeRunner(revision)');
    expect(app).toContain('function testBotRevision()');
    expect(app).toContain("navigate('bots')");
    expect(page).toContain('class="bot-revision-list"');
  });
  it('keeps revision action buttons on a single row without wrapping', async () => {
    const css = await source('styles/components/app-shell.css');
    expect(css).toMatch(/\.bot-workspace-page\s+\.bot-revision-actions[\s\S]*?flex-wrap:\s*nowrap/);
    expect(css).toMatch(/\.bot-workspace-page\s+\.bot-revision-actions\s+\.bot-action[\s\S]*?white-space:\s*nowrap/);
  });
  it('constrains selected revision cards inside the revision list when the workspace shrinks', async () => {
    const css = await source('styles/components/app-shell.css');
    expect(css).toMatch(/\.bot-revision-list\s*\{[\s\S]*?min-width:\s*0/);
    expect(css).toMatch(/\.bot-revision-item\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?box-sizing:\s*border-box/);
    expect(css).toMatch(/\.bot-revision-meta\s*\{[\s\S]*?min-width:\s*0/);
  });
});
