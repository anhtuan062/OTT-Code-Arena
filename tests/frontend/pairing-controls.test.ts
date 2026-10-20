import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('Organizer pairing controls', () => {
  it('renders only the organizer requeue control for failed pairings', async () => {
    const tournaments = await source('js/tournaments.js');
    expect(tournaments).toContain("pairing.status === 'failed' && state.user?.role === 'organizer'");
    expect(tournaments).toContain('Đưa vào hàng đợi');
    expect(tournaments).toContain('requeueTournamentPairing');
    expect(tournaments).toContain("/pairings/${pairingId}/requeue");
    expect(tournaments).toContain('window.confirm');
  });

  it('shows a disabled explanation instead of an unsafe rematch action', async () => {
    const tournaments = await source('js/tournaments.js');
    expect(tournaments).toContain('rematchUnavailableButton');
    expect(tournaments).toContain('Rematch không khả dụng');
    expect(tournaments).not.toContain('/pairings/${pairingId}/rematch');
  });

  it('keeps the legacy bundle aligned with the modular source after bundling', async () => {
    const [app, tournaments] = await Promise.all([source('app.js'), source('js/tournaments.js')]);
    expect(app).toContain('Đưa vào hàng đợi');
    expect(app).toContain('requeueTournamentPairing');
    expect(app).toContain('/pairings/${pairingId}/requeue');
    expect(app).toContain(tournaments.slice(tournaments.indexOf('async function requeueTournamentPairing'), tournaments.indexOf('async function requeueTournamentPairing') + 80));
  });
});
