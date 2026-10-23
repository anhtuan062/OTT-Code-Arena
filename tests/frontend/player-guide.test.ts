import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

describe('Player guide', () => {
  it('contains only documented player workflows and fixed rules', async () => {
    const guide = await source('views/pages/player-guide.html');
    expect(guide).toContain('Bot của tôi');
    expect(guide).toContain('Test thế cờ');
    expect(guide).toContain('đang mở đăng ký');
    expect(guide).toContain('Bàn cờ 9×9');
    expect(guide).toContain('maxTurns');
    expect(guide).toContain('Thắng 3 điểm, hòa 1 điểm, thua 0 điểm');
    expect(guide).toContain('Replay chưa công bố chỉ dành cho chủ giải');
    expect(guide).toContain('chooseMove');
    expect(guide).toContain('choose_move');
  });

  it('registers a competitor-only route and navigation entry', async () => {
    const [navigation, auth, build, shell, css] = await Promise.all([
      source('js/navigation.js'), source('js/auth.js'), source('scripts/build-html.js'),
      source('views/layout/navigation.html'), source('styles/views/player-guide.css'),
    ]);
    expect(navigation).toContain("'player-guide'");
    expect(navigation).toContain("view === 'player-guide' && state.user?.role !== 'competitor'");
    expect(auth).toContain("targetView === 'player-guide'");
    expect(build).toContain("views/pages/player-guide.html");
    expect(shell).toContain('data-target="player-guide"');
    expect(css).toContain('.player-guide-page');
  });
});
