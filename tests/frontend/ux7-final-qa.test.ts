import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readAssembledFrontendMarkup } from './frontend-fixtures';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('UX.7 final QA regression contracts', () => {
  it('keeps organizer queue visibility and password controls explicit', async () => {
    const [app, page] = await Promise.all([source('app.js'), readAssembledFrontendMarkup()]);
    expect(app).toContain('if (queueCard) queueCard.hidden = competitor');
    expect(app).toContain('function togglePassword');
    expect(page).toContain('id="login-password-toggle"');
    expect(page).toContain('id="register-password-toggle"');
  });

  it('preserves separate editable runtime drafts and immutable retry state', async () => {
    const app = await source('app.js');
    expect(app).toContain('function switchSourceRuntime(runtimeId)');
    expect(app).toContain('state.sourceRuntimeDrafts.set(currentRuntime');
    expect(app).toContain('state.pendingSourceRevision = { revision, source }');
    expect(app).toContain('state.pendingSourceRevision = null');
  });

  it('keeps replay QA state authoritative and bounded', async () => {
    const [app, page] = await Promise.all([source('app.js'), readAssembledFrontendMarkup()]);
    expect(app).toContain("scrubber.value = String(state.replayMoveIndex)");
    expect(app).toContain("cell.classList.add('capture')");
    expect(app).toContain('if (!isReplayShape(replay)) throw new Error');
    expect(page).toContain('id="replay-scrubber"');
    expect(page).toContain('id="r-selected-move"');
  });
});
