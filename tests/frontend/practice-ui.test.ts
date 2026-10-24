import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createPracticeScenario, serializePracticeLegalMoves } from '../../practice/scenarios.js';

class TestElement {
  children: TestElement[] = [];
  attributes: Record<string, string> = {};
  classes = new Set<string>();
  classList = {
    add: (...values: string[]) => values.forEach(value => this.classes.add(value)),
    remove: (...values: string[]) => values.forEach(value => this.classes.delete(value)),
    toggle: (value: string, force?: boolean) => {
      if (force ?? !this.classes.has(value)) this.classes.add(value);
      else this.classes.delete(value);
    },
  };
  style: Record<string, string> = {};
  textContent = '';
  hidden = true;
  isConnected = true;
  onFocus?: () => void;

  constructor(public tag: string, options: { className?: string; text?: string; attrs?: Record<string, string> } = {}) {
    if (options.className) options.className.split(' ').forEach(name => this.classes.add(name));
    this.textContent = options.text ?? '';
    this.attributes = options.attrs ?? {};
  }

  appendChild(child: TestElement) { this.children.push(child); return child; }
  append(...children: TestElement[]) { children.forEach(child => this.appendChild(child)); }
  prepend(...children: TestElement[]) { this.children.unshift(...children); }
  querySelector(selector: string) { return selector === 'svg' ? this.children.find(child => child.tag === 'svg') ?? null : null; }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  removeAttribute(name: string) { delete this.attributes[name]; }
  focus() { this.onFocus?.(); }
}

async function actualFunctions(names: string[], context: Record<string, unknown>) {
  const source = await readFile(resolve(process.cwd(), 'app.js'), 'utf8');
  const sections = names.map(name => {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`Missing ${name}`);
    const declarationStart = source.slice(start - 6, start) === 'async ' ? start - 6 : start;
    const next = /\n(?:async )?function /g;
    next.lastIndex = start + 9;
    const nextDeclaration = next.exec(source);
    return source.slice(declarationStart, nextDeclaration ? nextDeclaration.index : undefined);
  });
  return runInNewContext(`${sections.join('\n')}\n({${names.join(',')}})`, context) as Record<string, (...args: any[]) => any>;
}

describe('Practice view runtime behavior', () => {
  it('shows distinct Vietnamese compilation and runtime timeout messages without duplicate prefixes', async () => {
    const { formatPracticeError } = await actualFunctions(['formatPracticeError'], {});
    expect(formatPracticeError({ code: 'COMPILATION_TIMEOUT', stage: 'compilation_timeout', message: 'Biên dịch C++ quá thời gian cho phép.' }))
      .toBe('Biên dịch C++ quá thời gian cho phép.');
    expect(formatPracticeError({ code: 'RUNTIME_TIMEOUT', stage: 'runtime_timeout', message: 'Bot thực thi quá thời gian cho phép.' }))
      .toBe('Bot thực thi quá thời gian cho phép.');
  });

  async function boardHarness() {
    const nodes: Record<string, TestElement> = {
      '#practice-board': new TestElement('div'),
      '#practice-board-frame': new TestElement('div'),
      '#practice-columns': new TestElement('div'),
      '#practice-rows': new TestElement('div'),
      '#practice-result': new TestElement('section'),
      '#practice-result-details': new TestElement('dl'),
    };
    const functions = await actualFunctions(['boardCoordinate', 'renderPracticeBoard', 'renderPracticeResult'], {
      $: (selector: string) => nodes[selector],
      clear: (node: TestElement) => { node.children = []; },
      create: (tag: string, options: ConstructorParameters<typeof TestElement>[1]) => new TestElement(tag, options),
      icon: (id: string) => new TestElement('svg', { attrs: { symbol: id } }),
      PIECE_LABELS: { dam: 'Búa', la: 'Bao', keo: 'Kéo' },
      PIECE_TYPES: { dam: 'icon-piece-dam', la: 'icon-piece-la', keo: 'icon-piece-keo' },
    });
    return { nodes, ...functions };
  }

  it('renders 81 squares and labels a1/i9 with the engine orientation and existing SVG symbols', async () => {
    const view = await boardHarness();
    const scenario = createPracticeScenario('initial')!;
    view.renderPracticeBoard(scenario.state);
    const cells = view.nodes['#practice-board'].children;
    expect(cells).toHaveLength(81);
    expect(view.nodes['#practice-columns'].children.map(node => node.textContent).join('')).toBe('abcdefghi');
    expect(view.nodes['#practice-rows'].children.map(node => node.textContent).join('')).toBe('123456789');
    expect(cells[0].attributes['aria-label']).toContain('a1, Mục tiêu của người chơi B');
    expect(cells[80].attributes['aria-label']).toContain('i9, Mục tiêu của người chơi A');
    expect(cells[0].classes.has('goal')).toBe(true);
    expect(cells[80].classes.has('goal')).toBe(true);
    expect(cells.flatMap(cell => cell.children).some(child => child.classes.has('replay-player-a'))).toBe(true);
    expect(cells.flatMap(cell => cell.children).some(child => child.classes.has('replay-player-b'))).toBe(true);
    expect(cells.flatMap(cell => cell.children).flatMap(piece => piece.children).some(svg => svg.attributes.symbol?.startsWith('icon-piece-'))).toBe(true);
  });

  it('marks the selected piece and only an engine-reported capture', async () => {
    const view = await boardHarness();
    const scenario = createPracticeScenario('capture')!;
    const legal = serializePracticeLegalMoves(scenario.legalMoves);
    const capture = legal.find(move => move.captures)!;
    expect(capture).toBeDefined();
    view.renderPracticeBoard(scenario.state, { piece_id: capture.pieceId, from: capture.from, to: capture.to }, capture.captures);
    const cells = view.nodes['#practice-board'].children;
    const from = cells.find(cell => cell.attributes['aria-label']?.startsWith(`${capture.from},`))!;
    const to = cells.find(cell => cell.attributes['aria-label']?.startsWith(`${capture.to},`))!;
    expect(from.classes.has('move-from')).toBe(true);
    expect(from.children.some(child => child.classes.has('practice-selected-piece'))).toBe(true);
    expect(to.classes.has('move-to')).toBe(true);
    expect(to.classes.has('practice-capture')).toBe(true);
    expect(to.children.some(child => child.classes.has('practice-capture-mark'))).toBe(true);
    expect(to.attributes['aria-label']).toContain('quân bị ăn');

    const quiet = legal.find(move => !move.captures)!;
    view.renderPracticeBoard(scenario.state, { piece_id: quiet.pieceId, from: quiet.from, to: quiet.to }, quiet.captures);
    expect(view.nodes['#practice-board'].children.some(cell => cell.classes.has('practice-capture'))).toBe(false);
    expect(view.nodes['#practice-board'].children.some(cell => cell.children.some(child => child.classes.has('practice-capture-mark')))).toBe(false);
  });

  it('uses actual response fields and text nodes for result details', async () => {
    const view = await boardHarness();
    const scenario = createPracticeScenario('capture')!;
    const move = serializePracticeLegalMoves(scenario.legalMoves).find(candidate => candidate.captures)!;
    view.renderPracticeResult({
      state: scenario.state, move: { piece_id: move.pieceId, from: move.from, to: move.to },
      capture: move.captures, runtimeId: 'cpp', executionMode: 'strategy', sdkVersion: '1.0.0',
    });
    const details = view.nodes['#practice-result-details'].children;
    expect(details.map(node => node.textContent)).toEqual(expect.arrayContaining(['Người chơi', 'A', 'Từ', move.from, 'Đến', move.to, 'Ngôn ngữ', 'C++17', 'SDK chiến thuật', '1.0.0']));
    expect(details.find(node => node.textContent === 'Kết quả ăn quân')?.tag).toBe('dt');
    expect(view.nodes['#practice-result'].hidden).toBe(false);
  });

  it('renders single-turn validation without board, replay or system-opponent details', async () => {
    const nodes: Record<string, TestElement> = {
      '#practice-output': new TestElement('section'),
      '#practice-result': new TestElement('section'),
      '#practice-result-title': new TestElement('h5'),
      '#practice-result-move': new TestElement('p'),
      '#practice-result-details': new TestElement('dl'),
      '#practice-board-frame': new TestElement('section'),
      '#practice-replay-toolbar': new TestElement('div'),
    };
    const history = new TestElement('section');
    const { renderPracticeValidationResult } = await actualFunctions(['renderPracticeValidationResult'], {
      $: (selector: string) => nodes[selector],
      clear: (node: TestElement) => { node.children = []; },
      document: { querySelector: (selector: string) => selector === '#practice-result .practice-move-history' ? history : null },
    });

    renderPracticeValidationResult({ valid: true, accepted: true, move: { piece_id: 'A-keo-3', from: 'e3', to: 'd4' } });

    expect(nodes['#practice-result-title'].textContent).toBe('Biên dịch thành công · Nước đi hợp lệ');
    expect(nodes['#practice-result-move'].textContent).toBe('e3 → d4');
    expect(nodes['#practice-result-move'].style.display).toBe('block');
    expect(nodes['#practice-output'].classes.has('practice-output--validation')).toBe(true);
    expect(nodes['#practice-board-frame'].hidden).toBe(true);
    expect(nodes['#practice-replay-toolbar'].hidden).toBe(true);
    expect(history.hidden).toBe(true);
    expect(nodes['#practice-result-details'].children).toHaveLength(0);
  });

  it('preserves separate unsaved drafts across C++17 and Python 3 switches', async () => {
    const editor = { value: 'custom C++ strategy' };
    const runtimeSelect = { value: 'python3' };
    const state = { sourceRuntime: 'cpp', sourceRuntimeDrafts: new Map(), sourceDirty: true, sourceExecutionMode: 'strategy', botWorkspaceReadOnly: false };
    const functions = await actualFunctions(['switchSourceRuntime'], {
      $: (selector: string) => selector === '#bot-source-runtime' ? runtimeSelect : editor,
      state, TextEncoder,
      STRATEGY_TEMPLATES: { cpp: 'cpp starter', python3: 'python starter' },
      updateSourceRuntimeMeta: () => {}, renderSourceReference: () => {}, renderSourceFileInfo: () => {},
      setSourceDirty: (dirty: boolean) => { state.sourceDirty = dirty; },
    });
    functions.switchSourceRuntime('python3');
    expect(editor.value).toBe('python starter');
    editor.value = 'custom Python strategy';
    functions.switchSourceRuntime('cpp');
    expect(editor.value).toBe('custom C++ strategy');
    functions.switchSourceRuntime('python3');
    expect(editor.value).toBe('custom Python strategy');
    state.botWorkspaceReadOnly = true;
    functions.switchSourceRuntime('cpp');
    expect(runtimeSelect.value).toBe('python3');
  });

  it('shows owned selected revision metadata and keeps legacy Bot actions', async () => {
    const nodes: Record<string, TestElement> = Object.fromEntries(
      ['#bots-list', '#bots-toolbar', '#open-bot-modal', '#bots-count'].map(id => [id, new TestElement('div')]),
    );
    const bots = [
      { id: 'bot-1', name: '<script>Safe Bot</script>', currentRevisionId: 'rev-cpp-12345678', selectedRevision: { runtimeId: 'cpp', executionMode: 'strategy', label: 'Bản chính' }, registeredAt: new Date().toISOString() },
      { id: 'bot-2', name: 'Legacy Bot', currentRevisionId: null, command: 'node', args: ['bot.js'], registeredAt: new Date().toISOString() },
    ];
    const functions = await actualFunctions(['renderBotList'], {
      $: (selector: string) => nodes[selector],
      state: { bots, botSearch: '', sourceWorkspaceBot: null },
      clear: (node: TestElement) => { node.children = []; },
      create: (tag: string, options: ConstructorParameters<typeof TestElement>[1]) => new TestElement(tag, options),
      icon: (id: string) => new TestElement('svg', { attrs: { symbol: id } }),
      actionButton: (label: string) => new TestElement('button', { text: label }),
      renderBotEmpty: () => { throw new Error('Unexpected empty state'); },
    });
    functions.renderBotList();
    const text = (node: TestElement): string => [node.textContent, ...node.children.map(text)].join(' ');
    expect(nodes['#bots-list'].children).toHaveLength(2);
    expect(text(nodes['#bots-list'].children[0])).toContain('C++17');
    expect(text(nodes['#bots-list'].children[0])).toContain('Strategy SDK');
    expect(text(nodes['#bots-list'].children[0])).toContain('Bản chính');
    expect(text(nodes['#bots-list'].children[0])).toContain('<script>Safe Bot</script>');
    expect(nodes['#bots-list'].children[0].children[0].children[0].children[1].children[0].tag).toBe('h3');
    expect(text(nodes['#bots-list'].children[1])).toContain('node');
    expect(text(nodes['#bots-list'].children[1])).toContain('Xóa');
  });

  it('opens the dialog with a clean result and restores focus when closed', async () => {
    const ids = ['practice-modal', 'practice-title', 'practice-status', 'practice-result', 'practice-result-details', 'practice-error', 'practice-output', 'practice-board-frame', 'practice-run'];
    const nodes: Record<string, TestElement> = Object.fromEntries(ids.map(id => [id, new TestElement('div')]));
    const trigger = new TestElement('button');
    const doc = {
      activeElement: trigger,
      body: new TestElement('body'),
      getElementById: (id: string) => nodes[id],
      querySelector: () => null,
    };
    for (const element of [trigger, nodes['practice-run']]) element.onFocus = () => { doc.activeElement = element; };
    const state = { practiceRevision: null, practiceRequestToken: 0, modalReturnFocus: null };
    const functions = await actualFunctions(['openModal', 'closeModal', 'openPracticeRunner'], {
      $: (selector: string) => nodes[selector.slice(1)], document: doc, HTMLElement: TestElement, state,
      getModalFocusable: () => [nodes['practice-run']],
      clear: (node: TestElement) => { node.children = []; },
    });
    functions.openPracticeRunner({ revisionId: 'rev-12345678', label: 'Bản kiểm tra' });
    expect(nodes['practice-modal'].classes.has('open')).toBe(true);
    expect(nodes['practice-output'].hidden).toBe(true);
    expect(doc.activeElement).toBe(nodes['practice-run']);
    functions.closeModal('practice-modal');
    expect(nodes['practice-modal'].classes.has('open')).toBe(false);
    expect(doc.activeElement).toBe(trigger);
    expect(state.practiceRevision).toBeNull();
    expect(state.practiceRequestToken).toBe(2);
  });

  it('does not report a saved revision when selection fails and retries without duplicating the immutable revision', async () => {
    const bot = { id: 'owned-bot', name: 'Bot chiến thuật', command: 'node', args: [] };
    const state = { sourceWorkspaceBot: bot, botWorkspaceReadOnly: false, sourceExecutionMode: 'strategy',
      sourceDirty: true, pendingSourceRevision: null, pendingInitialRevision: null, authRevision: 1, viewRevision: 1 };
    const editor = { value: 'my unsaved strategy' };
    const runtime = { value: 'cpp' };
    const notices: string[] = [];
    const navigations: string[] = [];
    const calls: string[] = [];
    let selectionFails = true;
    const functions = await actualFunctions(['saveBotSource', 'submitBot'], {
      state, TextEncoder,
      $: (selector: string) => selector === '#bot-source-editor' ? editor : selector === '#bot-source-runtime' ? runtime : {},
      botNameInput: () => ({ name: bot.name }),
      botSourceInput: () => ({ source: editor.value, runtimeId: runtime.value }),
      setSourceError: () => {}, clearBotFormError: () => {},
      showBotFormError: (message: string) => notices.push(message),
      isCurrentView: () => true,
      runPending: async (_key: string, _button: unknown, action: () => Promise<unknown>) => {
        try { return await action(); } catch { return undefined; }
      },
      api: async (route: string) => {
        calls.push(route);
        if (route.endsWith('/revisions')) return { revisionId: 'saved-once' };
        if (route.endsWith('/select') && selectionFails) throw new Error('Không thể chọn phiên bản.');
        return {};
      },
      setSourceDirty: (dirty: boolean) => { state.sourceDirty = dirty; },
      setWorkspaceStatus: () => {},
      loadBotRevisions: async () => {},
      showToast: (message: string) => notices.push(message),
      showBotFeedback: (message: string) => notices.push(message),
      friendlyBotMessage: (error: { message?: string } | string, fallback: string) => (typeof error === 'string' ? error : error?.message) || fallback,
      markBotFeedbackShown: (error: unknown) => error,
      navigate: (view: string) => navigations.push(view),
      loadBots: async () => {},
    });
    await functions.submitBot();
    expect(state.pendingSourceRevision).toMatchObject({ revision: { revisionId: 'saved-once' }, source: editor.value });
    expect(editor.value).toBe('my unsaved strategy');
    expect(state.sourceDirty).toBe(true);
    expect(navigations).toEqual([]);
    expect(notices).not.toContain('Đã lưu phiên bản mã nguồn.');

    selectionFails = false;
    await functions.submitBot();
    expect(calls.filter(route => route.endsWith('/revisions'))).toHaveLength(1);
    expect(calls.filter(route => route.endsWith('/select'))).toHaveLength(2);
    expect(state.pendingSourceRevision).toBeNull();
    expect(notices).toContain('Đã lưu phiên bản mã nguồn.');
    expect(navigations).toContain('bots');
  });

  it('opens the replay view when a completed test-match response arrives', async () => {
    const nodes: Record<string, TestElement & { disabled?: boolean }> = {
      '#practice-run': new TestElement('button'),
      '#practice-output': new TestElement('section'),
      '#practice-status': new TestElement('p'),
    };
    const state = {
      practiceRevision: { botId: 'bot-1', revisionId: 'rev-1', runtimeId: 'cpp' },
      practiceDraft: null,
      practiceAbortController: null as { abort: () => void } | null,
      practiceRequestToken: 0,
    };
    const replayCalls: Array<{ result: Record<string, unknown>; revision: unknown }> = [];
    const result = {
      status: 'completed', winner: 'B', terminationReason: 'goal_reached',
      opponentName: 'Bot hệ thống', moves: [{ turn: 1 }],
      initialState: { boardSize: 9, pieces: [] },
    };
    const functions = await actualFunctions(['testBotMatch'], {
      state,
      AbortController: class {
        abort() {}
      },
      $: (selector: string) => nodes[selector],
      clearPracticeResult: () => {},
      request: async () => result,
      openPracticeReplayPage: (response: Record<string, unknown>, revision: unknown) => {
        replayCalls.push({ result: response, revision });
        nodes['#practice-status'].textContent = 'Đã chuyển sang replay';
      },
    });

    await functions.testBotMatch();

    expect(replayCalls).toHaveLength(1);
    expect(replayCalls[0].result).toBe(result);
    expect(replayCalls[0].revision).toBe(state.practiceRevision);
    expect(nodes['#practice-status'].textContent).not.toBe('Đang chạy trận thử với Bot hệ thống…');
    expect(nodes['#practice-run'].disabled).toBe(false);
    expect(nodes['#practice-run'].textContent).toBe('Chạy thử');
  });

  it('uses the single-turn revision test instead of the fixed-opponent match', async () => {
    const nodes: Record<string, TestElement> = {
      '#practice-run': new TestElement('button'),
      '#practice-output': new TestElement('section'),
      '#practice-status': new TestElement('p'),
      '#practice-scenario': new TestElement('select'),
    };
    nodes['#practice-scenario'].value = 'initial';
    const state = {
      practiceRevision: { botId: 'bot-1', revisionId: 'rev-1', runtimeId: 'cpp' },
      practiceDraft: null,
      practiceAbortController: null as { abort: () => void } | null,
      practiceRequestToken: 0,
    };
    const calls: string[] = [];
    const functions = await actualFunctions(['testBotRevision'], {
      state,
      AbortController: class { abort() {} },
      $: (selector: string) => nodes[selector],
      clearPracticeResult: () => {},
      startPracticeProgress: () => {},
      finishPracticeProgress: () => {},
      renderPracticeValidationResult: () => {},
      request: async (route: string) => { calls.push(route); return { valid: true, accepted: true }; },
    });

    await functions.testBotRevision();

    expect(calls).toEqual(['/bots/bot-1/revisions/rev-1/test']);
    expect(nodes['#practice-run'].disabled).toBe(false);
  });
});
