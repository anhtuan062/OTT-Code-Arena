import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

describe('Dynamic Navigation Breadcrumb Trail', () => {
  it('implements state.navigationTrail stack and trail slicing on navigation', async () => {
    const nav = await source('js/navigation.js');
    expect(nav).toContain('state.navigationTrail');
    expect(nav).toContain('options.fromNav === true');
    expect(nav).toContain('state.navigationTrail.findIndex');
    expect(nav).toContain('state.navigationTrail.slice(0, existingIndex + 1)');
  });

  it('renders all preceding tabs in navigation trail as clickable breadcrumb links', async () => {
    const nav = await source('js/navigation.js');
    expect(nav).toContain('Array.isArray(state.navigationTrail) && state.navigationTrail.length > 1');
    expect(nav).toContain('href: `#${entry.target || entry.view}`');
    expect(nav).toContain("'aria-label': `Về ${entry.title}`");
  });

  it('passes fromNav flag when clicking top-level nav links to reset root trail', async () => {
    const events = await source('js/events.js');
    expect(events).toContain("navigate(link.dataset.target, { fromNav: true })");
    expect(events).toContain("{ fromNav: true }");
  });
});
