import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';

const source = (file: string) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

async function importSourceFunction(context: Record<string, unknown>) {
  const app = await source('app.js');
  const start = app.indexOf('async function importBotSourceFile(');
  const nextPattern = /\n(?:async )?function /g;
  nextPattern.lastIndex = start + 10;
  const next = nextPattern.exec(app)?.index ?? app.length;
  return runInNewContext(`${app.slice(start, next)}\n({ importBotSourceFile })`, context) as {
    importBotSourceFile: (event: unknown) => Promise<void>;
  };
}

describe('UX.8 Strategy SDK-only Bot creation', () => {
  it('offers only the supported runtimes and identifies the SDK workspace', async () => {
    const page = await source('views/pages/bot-workspace.html');
    expect(page).toContain('id="bot-sdk-description"');
    expect(page).toContain('<option value="cpp">C++17</option>');
    expect(page).toContain('<option value="python3">Python 3</option>');
    expect(page).not.toContain('id="bot-execution-mode"');
    expect(page).not.toContain('name="executionMode"');
  });

  it('offers a runtime-matched UTF-8 source file upload without changing the revision API', async () => {
    const [app, page] = await Promise.all([source('app.js'), source('views/pages/bot-workspace.html')]);
    expect(page).toContain('id="bot-source-file"');
    expect(page).toContain('id="load-github-source"');
    expect(page).toContain('>Nạp mã</button>');
    expect(page).toContain('>GitHub URL <small>');
    expect(page).toContain('accept=".cpp,text/x-c++"');
    expect(app).toContain('function importBotSourceFile(event)');
    expect(app).toContain("new TextDecoder('utf-8', { fatal: true })");
    expect(app).toContain("file.size > 64 * 1024");
    expect(app).toContain("on('#bot-source-file', 'change'");
    expect(app).toContain('function loadGitHubSourceIntoEditor()');
    expect(app).toContain("on('#bot-github-url', 'keydown'");
    expect(app).toContain('sourceFile.disabled = false');
    expect(app).toContain("loadRevisionSource(revision, 'draft', false)");
    expect(app).toContain('body: JSON.stringify({ source, runtimeId, executionMode: state.sourceExecutionMode })');
  });

  it('loads a matching UTF-8 file into the editor and rejects a mismatched extension', async () => {
    const editor = { value: '' };
    const github = { value: 'https://github.com/example/bot' };
    const input = { value: 'selected.cpp', files: [{ name: 'bot.cpp', size: 12, arrayBuffer: async () => new TextEncoder().encode('move source').buffer }] };
    const nodes: Record<string, any> = {
      '#bot-source-file': input,
      '#bot-source-runtime': { value: 'cpp' },
      '#bot-source-editor': editor,
      '#bot-github-url': github,
      '#bot-source-error': { textContent: '', hidden: true },
    };
    const dirty: boolean[] = [];
    const statuses: string[] = [];
    const functions = await importSourceFunction({
      state: { botWorkspaceReadOnly: false },
      $: (selector: string) => nodes[selector],
      TextDecoder,
      setSourceError: (message: string) => { nodes['#bot-source-error'].textContent = message; },
      setSourceDirty: (value: boolean) => dirty.push(value),
      updateEditorMetrics: () => {},
      syncSourceEditorTools: () => {},
      setWorkspaceStatus: (message: string) => statuses.push(message),
    });

    await functions.importBotSourceFile({ target: input });
    expect(editor.value).toBe('move source');
    expect(github.value).toBe('');
    expect(dirty).toEqual([true]);
    expect(statuses).toEqual(['Đã tải bot.cpp']);
    expect(input.value).toBe('');

    nodes['#bot-source-runtime'].value = 'python3';
    input.files = [{ name: 'bot.cpp', size: 12, arrayBuffer: async () => new ArrayBuffer(0) }];
    await functions.importBotSourceFile({ target: input });
    expect(nodes['#bot-source-error'].textContent).toContain('Python 3');
  });

  it('starts new workspaces with compilable Strategy SDK templates', async () => {
    const app = await source('app.js');
    const cppTemplate = await source('bot-sdk/templates/cpp17.cpp');
    expect(app).toContain('const STRATEGY_TEMPLATES = {');
    expect(app).toContain('Move chooseMove(const GameState& state, const vector<Move>& legalMoves)');
    expect(app).toContain('def choose_move(state: GameState, legal_moves: list[Move])');
    expect(cppTemplate).toContain('Move chooseMove(const GameState& state, const std::vector<Move>& legalMoves)');
    expect(cppTemplate).not.toContain('#include "ott_strategy_sdk.hpp"');
    expect(cppTemplate).not.toContain('int main(');
    expect(app).toContain("updateSourceModeMeta(bot ? '' : 'strategy', bot ? '' : '1.0.0')");
  });

  it('posts Strategy mode for both first and subsequent revisions', async () => {
    const app = await source('app.js');
    expect(app).toContain("executionMode: 'strategy' }),");
    expect(app).toContain('executionMode: state.sourceExecutionMode');
    expect(app).toContain("state.sourceExecutionMode = revision.executionMode || 'raw'");
  });

  it('keeps duplicate-submit protection, Enter submission, and opens the created workspace', async () => {
    const app = await source('app.js');
    expect(app).toContain("runPending(editingBot ? `save-bot:${editingBot.id}` : 'create-bot'");
    expect(app).toContain("event.key !== 'Enter' || event.isComposing");
    expect(app).toContain('await openBotWorkspace(created)');
    expect(app).toContain("$('#save-bot-source').textContent = bot ? 'Lưu phiên bản' : 'Tạo Bot'");
  });
  it('restores the selected Bot workspace after a page reload', async () => {
    const app = await source('app.js');
    expect(app).toContain("const BOT_WORKSPACE_SELECTION_KEY = 'ott_bot_workspace_selection_v1'");
    expect(app).toContain('void restoreBotWorkspace()');
    expect(app).toContain("persistBotWorkspaceSelection(bot?.id || '')");
  });
  it('provides visible onboarding and editing guidance banners in bot-workspace', async () => {
    const [app, page] = await Promise.all([source('app.js'), source('views/pages/bot-workspace.html')]);
    expect(page).toContain('id="bot-workspace-notice"');
    expect(page).toContain('id="bot-workspace-notice-title"');
    expect(page).toContain('id="bot-workspace-notice-text"');
    expect(page).toContain('id="notice-create-draft-btn"');
    expect(app).toContain('function syncBotWorkspaceNotice()');
    expect(app).toContain('async function unlockDraftFromNotice()');
    expect(app).toContain("notice.classList.add('is-readonly')");
    expect(app).toContain("notice.classList.add('is-draft')");
    expect(app).toContain("on('#notice-create-draft-btn', 'click'");
  });
});
