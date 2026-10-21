import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

function extractFunction(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`Missing ${declaration}`);
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

async function pollingHarness() {
  const source = await readFile(new URL('../../js/tournaments.js', import.meta.url), 'utf8');
  const listeners = new Map<string, Set<() => void>>();
  let hidden = false;
  let currentView = true;
  const document = {
    get hidden() { return hidden; },
    addEventListener(type: string, listener: () => void) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(listener); },
    removeEventListener(type: string, listener: () => void) { listeners.get(type)?.delete(listener); },
    dispatch(type: string) { listeners.get(type)?.forEach(listener => listener()); },
  };
  const state = { detailStatus: 'running', authRevision: 1, viewRevision: 1, activeView: 'tournament-detail', tournamentId: 'fixture', multiStage: { pollTimer: null as number | null, visibilityHandler: null as (() => void) | null, abortController: null, pairingController: null, requestToken: 0 } };
  const context: Record<string, unknown> = { state, document, window: { setTimeout, clearTimeout }, isCurrentView: () => currentView, globalThis: {} };
  vm.runInNewContext(`const MULTI_STAGE_POLL_RUNNING_INTERVAL_MS = 7000; const MULTI_STAGE_POLL_PAUSED_INTERVAL_MS = 15000;\n${extractFunction(source, 'function scheduleMultiStagePolling')}\nglobalThis.schedule = scheduleMultiStagePolling;`, context);
  return { context, state, document, setHidden: (value: boolean) => { hidden = value; }, setCurrentView: (value: boolean) => { currentView = value; }, schedule: context.globalThis.schedule as (id: string, auth: number, view: number) => void };
}

describe('multi-stage polling deterministic behavior', () => {
  afterEach(() => vi.useRealTimers());

  it('polls running every 7 seconds and does not create duplicate timers', async () => {
    vi.useFakeTimers();
    const harness = await pollingHarness();
    const refresh = vi.fn(() => harness.schedule('fixture', 1, 1));
    harness.context.refreshTournamentDetail = refresh;
    harness.schedule('fixture', 1, 1);
    harness.schedule('fixture', 1, 1);
    await vi.advanceTimersByTimeAsync(6999);
    expect(refresh).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(7000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('polls paused every 15 seconds and switches back to 7 seconds after resume', async () => {
    vi.useFakeTimers();
    const harness = await pollingHarness();
    const refresh = vi.fn(() => {
      if (refresh.mock.calls.length === 1) harness.state.detailStatus = 'running';
      harness.schedule('fixture', 1, 1);
    });
    harness.context.refreshTournamentDetail = refresh;
    harness.state.detailStatus = 'paused';
    harness.schedule('fixture', 1, 1);
    await vi.advanceTimersByTimeAsync(14999);
    expect(refresh).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(7000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('stops hidden polling and refreshes immediately when visibility returns', async () => {
    vi.useFakeTimers();
    const harness = await pollingHarness();
    const refresh = vi.fn(() => harness.schedule('fixture', 1, 1));
    harness.context.refreshTournamentDetail = refresh;
    harness.setHidden(true);
    harness.schedule('fixture', 1, 1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(refresh).toHaveBeenCalledTimes(0);
    harness.setHidden(false);
    harness.document.dispatch('visibilitychange');
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6999);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not refresh a stale view after stage/status changes or view exit', async () => {
    vi.useFakeTimers();
    const harness = await pollingHarness();
    const refresh = vi.fn();
    harness.context.refreshTournamentDetail = refresh;
    harness.schedule('fixture', 1, 1);
    harness.setCurrentView(false);
    await vi.advanceTimersByTimeAsync(7000);
    expect(refresh).not.toHaveBeenCalled();
    harness.setCurrentView(true);
    harness.setHidden(true);
    harness.document.dispatch('visibilitychange');
    expect(refresh).not.toHaveBeenCalled();
  });
});
