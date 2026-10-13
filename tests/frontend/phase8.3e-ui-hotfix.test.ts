import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
const source = (file: string) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

describe('Phase 8.3e UI hotfixes', () => {
  it('keeps registration errors visible and guards Ctrl+S', async () => {
    const app = await source('app.js');
    expect(app).toContain("function setRegistrationError(message = '')");
    expect(app).toContain("if (!saveButton.disabled) void submitBot();");
  });
  it('uses one Bot workspace action and localized role copy', async () => {
    const [app, page] = await Promise.all([source('app.js'), source('index.html')]);
    expect(app).toContain("actionButton('Mã nguồn'");
    expect(page).toContain('id="current-user-role"');
    expect(page).not.toContain('cho phép Competitor');
  });
  it('renders revision diagnostics and replay identity details', async () => {
    const [app, page] = await Promise.all([source('app.js'), source('index.html')]);
    expect(app).toContain("className: 'bot-revision-technical'");
    expect(app).toContain('function renderReplayPieceCounts(board)');
    expect(page).toContain('id="r-p1-bot"');
    expect(page).toContain('id="r-p2-pieces"');
  });
  it('provides responsive navigation and lifecycle focus', async () => {
    const [app, page] = await Promise.all([source('app.js'), source('index.html')]);
    expect(page).toContain('class="bottom-nav"');
    expect(page).toContain('data-target="my-tournaments"');
    expect(app).toContain("current.scrollIntoView({ inline: 'center', block: 'nearest' })");
  });
  it('explains why revision-backed Bots cannot be deleted', async () => {
    const [app, page] = await Promise.all([source('app.js'), source('index.html')]);
    expect(app).toContain('immutable source revisions');
    expect(app).toContain('revision is referenced by a tournament');
    expect(page).toContain('id="delete-bot-support"');
  });
});
