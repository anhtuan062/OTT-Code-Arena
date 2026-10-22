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
});
