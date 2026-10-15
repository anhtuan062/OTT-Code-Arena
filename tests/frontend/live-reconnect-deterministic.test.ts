import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

function extractFunction(app: string, name: string): string {
  const start = app.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const bodyStart = app.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = bodyStart; i < app.length; i += 1) {
    const char = app[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`Unbalanced function ${name}`);
}

function makeSnapshot(gameNumber: number, sequence: number, status = 'in_progress') {
  return {
    matchId: 'deterministic-match', gameNumber, sequence, turn: sequence, status,
    state: { lastMove: null }, latestMove: null,
    series: { currentGame: gameNumber, bestOf: 3, winsA: 0, winsB: 0, active: true },
    history: [],
  };
}

describe('deterministic Live SSE reconnect and polling lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('rejects delayed and out-of-order snapshots without rewinding game or sequence', async () => {
    const app = await source('app.js');
    const updateSource = extractFunction(app, 'updateLiveHistory');
    const state = {
      liveHistoryGame: 2, liveLastSequence: 10, liveStreamMode: true,
      liveHistoryQueue: [], liveHistoryTimer: null, liveTransitionTimer: null,
      livePendingSnapshot: null, liveHistory: [], liveHistoryIndex: 10,
      liveLatestSnapshot: makeSnapshot(2, 10), activeView: 'replay-view',
    };
    let renders = 0;
    const update = new Function(
      'state', '$', 'hideLiveGameResultModal', 'renderLiveMatchSnapshot', 'playLiveHistoryFrame',
      `return (${updateSource});`,
    )(state, () => null, () => undefined, () => { renders += 1; }, () => undefined) as (snapshot: unknown) => void;

    update(makeSnapshot(2, 9));
    update(makeSnapshot(1, 99));

    expect(state.liveHistoryGame).toBe(2);
    expect(state.liveLastSequence).toBe(10);
    expect(renders).toBe(0);
  });

  it('accepts a same-sequence lifecycle update but ignores an exact duplicate', async () => {
    const app = await source('app.js');
    const updateSource = extractFunction(app, 'updateLiveHistory');
    const state = {
      liveHistoryGame: 1, liveLastSequence: 8, liveStreamMode: true,
      liveHistoryQueue: [], liveHistoryTimer: null, liveTransitionTimer: null,
      livePendingSnapshot: null, liveHistory: [], liveHistoryIndex: 8,
      liveLatestSnapshot: makeSnapshot(1, 8), activeView: 'replay-view',
      liveAcceptedSnapshot: { ...makeSnapshot(1, 8), status: 'in_progress' },
    };
    let renders = 0;
    const update = new Function(
      'state', '$', 'hideLiveGameResultModal', 'renderLiveMatchSnapshot', 'playLiveHistoryFrame',
      `return (${updateSource});`,
    )(state, () => null, () => undefined, () => { renders += 1; }, () => undefined) as (snapshot: unknown) => void;

    update({ ...makeSnapshot(1, 8), status: 'finished', series: { ...makeSnapshot(1, 8).series, winsA: 1 } });
    update({ ...makeSnapshot(1, 8), status: 'finished', series: { ...makeSnapshot(1, 8).series, winsA: 1 } });

    expect(renders).toBe(1);
    expect(state.liveLastSequence).toBe(8);
    expect(state.liveAcceptedSnapshot?.status).toBe('finished');
  });

  it('accepts same-order board data changes even when lifecycle and score are unchanged', async () => {
    const app = await source('app.js');
    const updateSource = extractFunction(app, 'updateLiveHistory');
    const state = {
      liveHistoryGame: 1, liveLastSequence: 8, liveStreamMode: true,
      liveHistoryQueue: [], liveHistoryTimer: null, liveTransitionTimer: null,
      livePendingSnapshot: null, liveHistory: [], liveHistoryIndex: 8,
      liveLatestSnapshot: makeSnapshot(1, 8), activeView: 'replay-view',
      liveAcceptedSnapshot: makeSnapshot(1, 8),
    };
    let renders = 0;
    const update = new Function(
      'state', '$', 'hideLiveGameResultModal', 'renderLiveMatchSnapshot', 'playLiveHistoryFrame',
      `return (${updateSource});`,
    )(state, () => null, () => undefined, () => { renders += 1; }, () => undefined) as (snapshot: unknown) => void;

    update({ ...makeSnapshot(1, 8), state: { lastMove: { turn: 8, pieceId: 'A-1' } } });

    expect(renders).toBe(1);
    expect(state.liveAcceptedSnapshot?.state?.lastMove?.pieceId).toBe('A-1');
  });

  it('accepts a higher game with a reset sequence but never duplicates transition timers', async () => {
    vi.useFakeTimers();
    const app = await source('app.js');
    const updateSource = extractFunction(app, 'updateLiveHistory');
    const state = {
      liveHistoryGame: 1, liveLastSequence: 20, liveStreamMode: false,
      liveHistoryQueue: [], liveHistoryTimer: null, liveTransitionTimer: null,
      livePendingSnapshot: null, liveHistory: [], liveHistoryIndex: 20,
      liveLatestSnapshot: makeSnapshot(1, 20), activeView: 'replay-view',
    };
    let renders = 0;
    const update = new Function(
      'state', '$', 'hideLiveGameResultModal', 'renderLiveMatchSnapshot', 'playLiveHistoryFrame',
      `return (${updateSource});`,
    )(state, () => null, () => undefined, () => { renders += 1; }, () => undefined) as (snapshot: unknown) => void;

    update({ ...makeSnapshot(2, 1), status: 'in_progress' });
    update({ ...makeSnapshot(2, 1), status: 'in_progress' });

    expect(state.liveHistoryGame).toBe(2);
    expect(state.livePendingSnapshot?.gameNumber).toBe(2);
    expect(state.liveTransitionTimer).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);
    expect(renders).toBe(0);
  });

  it('closes a failed EventSource, schedules polling, then accepts a reconnect stream', async () => {
    const app = await source('app.js');
    const streamSource = extractFunction(app, 'startLiveMatchStream');
    const state = {
      liveMatchContext: { tournamentId: 't1', matchId: 'm1' },
      liveStreamSource: null as any, liveStreamMode: false,
      livePollBackoffMs: 0, activeView: 'replay-view', liveLatestSnapshot: null,
    };
    const scheduled: string[] = [];
    let sequence = 0;
    class MockEventSource {
      static instances: MockEventSource[] = [];
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      closed = false;
      constructor(public url: string) { MockEventSource.instances.push(this); }
      close() { this.closed = true; }
      emit(snapshot: unknown) { this.onmessage?.({ data: JSON.stringify(snapshot) } as MessageEvent); }
      fail() { this.onerror?.(); }
    }
    const update = (snapshot: any) => { sequence = snapshot.sequence; };
    vi.stubGlobal('window', { EventSource: MockEventSource });
    const start = new Function(
      'state', 'normalizeSpectatorLive', 'updateLiveHistory', 'scheduleLiveMatchPoll', '$',
      `return (${streamSource});`,
    )(state, (raw: any) => raw, update, () => scheduled.push('poll'), () => ({ hidden: false })) as () => boolean;

    expect(start()).toBe(true);
    const first = MockEventSource.instances[0];
    first.emit({ ...makeSnapshot(1, 1) });
    expect(sequence).toBe(1);
    first.fail();
    expect(first.closed).toBe(true);
    expect(scheduled).toEqual(['poll']);

    expect(start()).toBe(true);
    const second = MockEventSource.instances[1];
    second.emit({ ...makeSnapshot(1, 2) });
    expect(sequence).toBe(2);
    expect(state.liveStreamSource).toBe(second);
  });

  it('uses polling fallback for a live snapshot and backs off after a polling error', async () => {
    vi.useFakeTimers();
    const app = await source('app.js');
    const pollSource = `async ${extractFunction(app, 'pollLiveMatch')}`;
    const state = {
      liveMatchContext: { tournamentId: 't1', matchId: 'm1', spectator: true },
      liveStreamSource: null, liveStreamMode: false, livePollBackoffMs: 0,
      activeView: 'replay-view', liveLatestSnapshot: null,
    };
    const scheduled: number[] = [];
    const seen: any[] = [];
    let response: any = makeSnapshot(1, 4);
    const api = vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    });
    const poll = new Function(
      'state', 'api', 'normalizeSpectatorLive', 'updateLiveHistory', 'scheduleLiveMatchPoll', '$',
      `return (${pollSource});`,
    )(state, api, (raw: any) => raw, (snapshot: any) => seen.push(snapshot), () => scheduled.push(state.livePollBackoffMs), () => ({ hidden: false })) as () => Promise<void>;

    await poll();
    expect(seen).toHaveLength(1);
    expect(seen[0].sequence).toBe(4);
    expect(scheduled).toEqual([0]);

    response = Object.assign(new Error('rate limited'), { status: 429 });
    await poll();
    expect(state.livePollBackoffMs).toBe(3000);
    expect(scheduled).toEqual([0, 3000]);
  });
});
