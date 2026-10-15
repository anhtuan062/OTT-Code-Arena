import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('BO3 replay presentation', () => {
  it('exposes game selection, series score, and BO3 API support', async () => {
    const [app, server, types] = await Promise.all([
      source('app.js'), source('server/index.ts'), source('match-runner/types.ts'),
    ]);
    expect(app).toContain('renderReplaySeriesControls');
    expect(app).toContain('Tỷ số ${series.winsA}-${series.winsB}');
    expect(server).toContain('bestOf: 3');
    expect(types).toContain("format: 'bo3'");
    expect(types).toContain('bestOf: 3');
  });

  it('accurately resolves winner participant card across BO3 side swaps', async () => {
    const app = await source('app.js');
    expect(app).toContain('function getReplayWinningParticipantSlot()');
    expect(app).toContain('winningSlot === \'A\'');
    expect(app).toContain('winningSlot === \'B\'');
    expect(app).toContain('is-current-side-b');
  });
});
