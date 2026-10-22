import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

class FixtureElement {
  className = '';
  textContent = '';
  type = '';
  value = '';
  attributes = new Map<string, string>();
  children: FixtureElement[] = [];

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  append(...children: FixtureElement[]): void {
    this.children.push(...children);
  }
}

async function readSource(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('Bot Playground regression guards', () => {
  it('preserves option values created by the shared DOM helper', async () => {
    const source = await readSource('js/utils.js');
    const context = {
      document: { createElement: () => new FixtureElement() },
    };
    vm.runInNewContext(`${source}
globalThis.createElement = create;`, context);

    const createElement = context.createElement as (tag: string, options: { value: string; text: string }) => FixtureElement;
    const option = createElement('option', { value: 'persisted-bot-id', text: 'Bot persisted' });

    expect(option.value).toBe('persisted-bot-id');
    expect(option.textContent).toBe('Bot persisted');
  });

  it('allows Playground cards to shrink inside the mobile grid', async () => {
    const css = await readSource('styles/views/playground.css');
    const cardRule = css.match(/\.playground-board-card,\s*\.playground-code-card,\s*\.playground-inspector-card\s*\{([\s\S]*?)\}/)?.[1];

    expect(cardRule).toContain('min-width: 0;');
  });

  it('aligns playground board coordinates to 9-column and 9-row grid tracks', async () => {
    const css = await readSource('styles/views/playground.css');

    // Columns: repeat(9, minmax(0, 1fr)) with 26px offset to align with row side
    expect(css).toMatch(/\.playground-board-wrap\s+\.replay-columns[\s\S]*?grid-template-columns:\s*repeat\(9,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/\.playground-board-wrap\s+\.replay-columns[\s\S]*?margin-left:\s*26px/);

    // Rows: repeat(9, minmax(0, 1fr)) in 26px width track
    expect(css).toMatch(/\.playground-board-wrap\s+\.replay-rows[\s\S]*?grid-template-rows:\s*repeat\(9,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/\.playground-board-wrap\s+\.replay-rows[\s\S]*?width:\s*26px/);

    // Board row 2-column grid: 26px for row coords, minmax(0, 1fr) for board
    expect(css).toMatch(/\.playground-board-wrap\s+\.replay-board-row[\s\S]*?grid-template-columns:\s*26px\s+minmax\(0,\s*1fr\)/);
  });

  it('keeps playground bot source code viewer in readonly mode', async () => {
    const html = await readSource('views/pages/bot-playground.html');
    const css = await readSource('styles/views/playground.css');

    // HTML specifies readonly for playground code textarea and disabled for runtime selector
    expect(html).toMatch(/<textarea\s+id="playground-code"[^>]*readonly/);
    expect(html).toContain('id="playground-code-highlight"');
    expect(html).toMatch(/<select\s+id="playground-runtime-selector"[^>]*disabled/);
    expect(html).toContain('playground-readonly-badge');

    // CSS provides readonly viewer styling
    expect(css).toMatch(/\.playground-code-area\[readonly\][\s\S]*?cursor:\s*default/);
    expect(css).toMatch(/\.playground-editor-wrap[\s\S]*?background:\s*#1e1e1e/);
    expect(css).toMatch(/\.playground-code-highlight[\s\S]*?background:\s*#1e1e1e/);
    expect(css).toMatch(/\.playground-code-area\[readonly\][\s\S]*?color:\s*transparent/);
  });

  it('keeps the selected runtime available to Playground test success and error paths', async () => {
    const source = await readSource('js/playground.js');

    expect(source).toMatch(/const runtimeId = \$\('\#playground-runtime-selector'\)\?\.value \|\| 'cpp';/);
    expect(source).toContain('runtimeId,');
    expect(source).toContain("runtimeId === 'cpp' ? 'C++17' : 'Python 3'");
    expect(source).toContain('syncPlaygroundCodeHighlight');
  });
});
