import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

describe('UX.8 Strategy SDK-only Bot creation', () => {
  it('offers only the supported runtimes and identifies the SDK workspace', async () => {
    const page = await source('views/pages/bot-workspace.html');
    expect(page).toContain('id="bot-sdk-description"');
    expect(page).toContain('<option value="cpp">C++17</option>');
    expect(page).toContain('<option value="python3">Python 3</option>');
    expect(page).not.toContain('id="bot-execution-mode"');
    expect(page).not.toContain('name="executionMode"');
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
});
