import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

function extractFunction(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${declaration}`);
}

function response(status: number, body: unknown, etag?: string) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => name.toLowerCase() === 'etag' ? etag ?? null : null },
    json: async () => body,
  };
}

async function requestHarness() {
  const source = await readFile(new URL('../../js/api.js', import.meta.url), 'utf8');
  const state = { authRevision: 1, user: { id: 'owner-1', role: 'organizer' }, csrfToken: null, conditionalResponseCache: new Map() };
  const calls: Array<{ init: RequestInit; path: string }> = [];
  const queue: Array<ReturnType<typeof response>> = [];
  const fetchMock = vi.fn(async (input: string, init: RequestInit) => { calls.push({ path: input, init }); return queue.shift()!; });
  const context: Record<string, unknown> = {
    state,
    fetch: fetchMock,
    localizeErrorMessage: (message: string) => message,
    showAuthScreen: vi.fn(),
    globalThis: {},
  };
  const requestSource = source.slice(0, source.indexOf('\n\nasync function api'));
  vm.runInNewContext(`const API_URL = '';\n${requestSource}\nglobalThis.request = request;`, context);
  return { state, calls, queue, request: context.globalThis.request as (path: string, options?: Record<string, unknown>) => Promise<unknown> };
}

describe('authenticated conditional request cache', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reuses a validated 200 body for 304 and replaces it after a new version', async () => {
    const harness = await requestHarness();
    harness.queue.push(response(200, { status: 'running', revision: 1 }, '"v1"'));
    await expect(harness.request('/tournaments/t1/progress', { conditional: { key: 'tournament:t1:progress' } })).resolves.toEqual({ status: 'running', revision: 1 });
    harness.queue.push(response(304, null));
    await expect(harness.request('/tournaments/t1/progress', { conditional: { key: 'tournament:t1:progress' } })).resolves.toEqual({ status: 'running', revision: 1 });
    expect((harness.calls[1].init.headers as Record<string, string>)['If-None-Match']).toBe('"v1"');
    harness.queue.push(response(200, { status: 'paused', revision: 2 }, '"v2"'));
    await expect(harness.request('/tournaments/t1/progress', { conditional: { key: 'tournament:t1:progress' } })).resolves.toEqual({ status: 'paused', revision: 2 });
    expect(harness.state.conditionalResponseCache.size).toBe(1);
  });

  it('isolates cache entries across logout/login and role changes', async () => {
    const harness = await requestHarness();
    const options = { conditional: { key: 'tournament:t1:detail' } };
    harness.queue.push(response(200, { ownerOnly: true }, '"owner"'));
    await harness.request('/tournaments/t1', options);
    harness.state.user = null;
    harness.state.authRevision = 2;
    harness.queue.push(response(200, { public: true }, '"public"'));
    await harness.request('/tournaments/t1', options);
    expect((harness.calls[1].init.headers as Record<string, string>)['If-None-Match']).toBeUndefined();
    harness.state.user = { id: 'competitor-1', role: 'competitor' };
    harness.state.authRevision = 3;
    harness.queue.push(response(200, { competitor: true }, '"competitor"'));
    await harness.request('/tournaments/t1', options);
    expect((harness.calls[2].init.headers as Record<string, string>)['If-None-Match']).toBeUndefined();
    expect(harness.state.conditionalResponseCache.size).toBe(3);
  });

  it('never accepts a 304 without an authorization-scoped cached body and stays bounded', async () => {
    const harness = await requestHarness();
    harness.state.authRevision = 99;
    harness.queue.push(response(304, null));
    await expect(harness.request('/tournaments/t1/progress', { conditional: { key: 'tournament:t1:progress' } })).rejects.toThrow();
    for (let index = 0; index < 20; index += 1) {
      harness.queue.push(response(200, { index }, `"${index}"`));
      await harness.request(`/tournaments/t${index}`, { conditional: { key: `tournament:t${index}` } });
    }
    expect(harness.state.conditionalResponseCache.size).toBe(16);
  });
});
