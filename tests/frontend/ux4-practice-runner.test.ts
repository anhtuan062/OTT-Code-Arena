import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('UX.4 Practice Runner', () => {
  it('keeps all scenario IDs and provides responsive result structure', async () => {
    const page = await source('index.html');
    for (const scenario of ['initial', 'capture', 'near-goal']) expect(page).toContain(`value="${scenario}"`);
    expect(page).toContain('id="practice-revision-meta"');
    expect(page).toContain('id="practice-scenario-help"');
    expect(page).toContain('grid-template-areas: \'board result\'');
    expect(page).toContain('grid-template-areas: \'result\' \'board\'');
    expect(page).toContain('practice-legend');
  });

  it('maps actual Practice error codes without inventing execution progress', async () => {
    const app = await source('app.js');
    for (const code of ['EXECUTOR_UNAVAILABLE', 'COMPILATION_TIMEOUT', 'RUNTIME_TIMEOUT', 'PROCESS_CRASHED',
      'INVALID_JSON', 'EMPTY_OUTPUT', 'INVALID_MOVE', 'RESOURCE_LIMIT_EXCEEDED']) {
      expect(app).toContain(code);
    }
    expect(app).toContain("'Đang chạy thử Bot trong môi trường cô lập…'");
    expect(app).not.toContain('setInterval(testBotRevision');
    expect(app).not.toContain('Math.round');
  });

  it('preserves revision/scenario identity and server-validated success semantics', async () => {
    const app = await source('app.js');
    expect(app).toContain('result.valid === true && result.accepted !== false');
    expect(app).toContain("['Revision', revision?.revisionId");
    expect(app).toContain("['Tình huống', scenario.label]");
    expect(app).toContain('result.capture');
    expect(app).toContain('renderPracticeBoard(result.state, result.move, result.capture)');
  });

  it('clears stale results on scenario changes and invalidates pending responses', async () => {
    const app = await source('app.js');
    expect(app).toContain("on('#practice-scenario', 'change'");
    expect(app).toContain('state.practiceRequestToken += 1;');
    expect(app).toContain('clearPracticeResult();');
    expect(app).toContain('token !== state.practiceRequestToken');
    expect(app).toContain('state.practiceRevision?.revisionId !== revision.revisionId');
  });

  it('retains modal accessibility and retry-safe controls', async () => {
    const [app, page] = await Promise.all([source('app.js'), source('index.html')]);
    expect(page).toContain('role="dialog"');
    expect(page).toContain('aria-modal="true"');
    expect(page).toContain('id="practice-error-details"');
    expect(app).toContain("if (id === 'practice-modal')");
    expect(app).toContain('runButton.disabled = true');
    expect(app).toContain("runButton.textContent = 'Đang chạy…'");
  });
});
