import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type Listener = (...args: unknown[]) => void;

class FixtureElement {
  listeners = new Map<string, Listener[]>();

  addEventListener(type: string, handler: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) || []), handler]);
  }

  dispatch(type: string): void {
    for (const handler of this.listeners.get(type) || []) handler();
  }
}

async function bindingHelper() {
  const source = await readFile(new URL('../../app.js', import.meta.url), 'utf8');
  const start = source.indexOf('const domBindingRegistry = new WeakMap();');
  const end = source.indexOf('\nfunction bindEvents', start);
  if (start < 0 || end < 0) throw new Error('DOM binding helper not found');
  const elements = new Map<string, FixtureElement>();
  const errors: string[] = [];
  const context = {
    $, console: { error: (message: string) => errors.push(message) },
  } as Record<string, unknown>;
  function $(selector: string): FixtureElement | null { return elements.get(selector) || null; }
  vm.runInNewContext(`${source.slice(start, end)}; globalThis.bindEvent = bindEvent;`, context);
  return { bindEvent: context.bindEvent as (target: string | FixtureElement, type: string, handler: Listener, options?: Record<string, unknown>) => boolean, elements, errors };
}

describe('frontend DOM binding hardening', () => {
  it('skips a missing optional control and still binds unrelated controls', async () => {
    const fixture = await bindingHelper();
    const laterControl = new FixtureElement();
    fixture.elements.set('#later-control', laterControl);
    expect(fixture.bindEvent('#tournament-status-filter', 'change', vi.fn())).toBe(false);
    const handler = vi.fn();
    expect(fixture.bindEvent('#later-control', 'click', handler)).toBe(true);
    laterControl.dispatch('click');
    expect(handler).toHaveBeenCalledOnce();
    expect(fixture.errors).toEqual([]);
  });

  it('diagnoses missing required controls without throwing', async () => {
    const fixture = await bindingHelper();
    expect(fixture.bindEvent('#login-form', 'submit', vi.fn(), { required: true, feature: 'authentication login form' })).toBe(false);
    expect(fixture.errors).toEqual(['[DOM binding] Missing required control for authentication login form: #login-form']);
  });

  it('prevents duplicate handlers and supports replaced dynamic elements', async () => {
    const fixture = await bindingHelper();
    const first = new FixtureElement();
    const second = new FixtureElement();
    const handler = vi.fn();
    fixture.elements.set('#dynamic-control', first);
    fixture.bindEvent('#dynamic-control', 'click', handler);
    fixture.bindEvent('#dynamic-control', 'click', handler);
    first.dispatch('click');
    expect(handler).toHaveBeenCalledOnce();
    fixture.elements.set('#dynamic-control', second);
    fixture.bindEvent('#dynamic-control', 'click', handler);
    second.dispatch('click');
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
