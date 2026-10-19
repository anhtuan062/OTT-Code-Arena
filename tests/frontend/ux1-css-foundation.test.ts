import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readAssembledFrontendStyles } from './frontend-fixtures';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('UX.1 CSS foundation', () => {
  it('keeps one authoritative token block and preserves legacy aliases', async () => {
    const [css, page] = await Promise.all([source('style.css'), source('index.html')]);

    expect((css.match(/:root\s*\{/g) ?? [])).toHaveLength(1);
    expect(page).not.toMatch(/<style>[\s\S]*:root\s*\{/i);
    for (const token of [
      '--color-page', '--color-surface', '--color-brand', '--color-brand-hover',
      '--color-success', '--color-warning', '--color-error', '--color-info',
      '--color-player-a', '--color-player-b', '--color-goal', '--color-board-highlight',
      '--color-capture-highlight', '--space-1', '--space-7', '--control-height',
      '--input-height', '--transition-fast',
    ]) {
      expect(css).toContain(`${token}:`);
    }
    for (const alias of ['--bg-card', '--accent-blue', '--p1-color', '--p2-color', '--goal-color']) {
      expect(css).toContain(`${alias}:`);
    }
  });

  it('loads the existing stylesheet before the application script and retains compatibility selectors', async () => {
    const [page, styles] = await Promise.all([source('index.html'), readAssembledFrontendStyles()]);
    expect(page.indexOf('<link rel="stylesheet" href="style.css">')).toBeGreaterThanOrEqual(0);
    expect(page.indexOf('<link rel="stylesheet" href="style.css">')).toBeLessThan(page.indexOf('/js/page-loader.js'));
    for (const selector of ['.page', '.nav-link', '.status-badge', '.primary-btn', '.secondary-btn',
      '.card', '.modal-overlay', '.source-editor', '.data-table', '.app-sidebar', '.app-topbar']) {
      expect(styles).toContain(selector);
    }
  });

  it('keeps motion and focus accessibility safeguards in the base stylesheet', async () => {
    const css = await source('style.css');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('body.no-motion');
  });
});
