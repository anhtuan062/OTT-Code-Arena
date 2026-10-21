import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { appExport, closeServer, getTournamentManager, initServer } from '../../server/index.js';
import { createControlledAccount } from '../../server/admin/role-bootstrap.js';

describe('multi-stage conditional polling responses', () => {
  let dir: string;
  let owner: ReturnType<typeof request.agent>;
  let ownerAccount: Awaited<ReturnType<typeof createControlledAccount>>;
  let csrf: string;
  let tournamentId: string;

  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `ott-polling-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(dir, { recursive: true });
    await initServer(dir);
    const account = await createControlledAccount(path.join(dir, 'arena.sqlite'), 'pollowner', 'correct horse battery staple', 'organizer');
    ownerAccount = account;
    owner = request.agent(appExport);
    const login = await owner.post('/api/auth/login').send({ username: account.username, password: 'correct horse battery staple' });
    csrf = login.body.csrfToken;
    const created = await owner.post('/api/tournaments')
      .set('x-csrf-token', csrf)
      .send({ name: 'Conditional multi-stage polling', format: 'multi_stage' });
    expect(created.status).toBe(201);
    tournamentId = created.body.tournamentId;
  });

  afterEach(async () => {
    await closeServer();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns 304 only after authenticated authorization and preserves validators across transitions', async () => {
    const first = await owner.get(`/api/tournaments/${tournamentId}/progress`);
    expect(first.status).toBe(200);
    expect(first.headers.etag).toMatch(/^"/);
    const unchanged = await owner.get(`/api/tournaments/${tournamentId}/progress`).set('if-none-match', first.headers.etag);
    expect(unchanged.status).toBe(304);
    expect(unchanged.text).toBe('');

    const manager = getTournamentManager() as any;
    const tournament = (await manager.loadTournament(tournamentId)).data;
    await manager.repository.save({ ...tournament, status: 'registration_open' });
    const changed = await owner.get(`/api/tournaments/${tournamentId}/progress`).set('if-none-match', first.headers.etag);
    expect(changed.status).toBe(200);
    expect(changed.body.status).toBe('registration_open');
    expect(changed.headers.etag).not.toBe(first.headers.etag);
  });

  it('supports conditional stages/detail reads and never lets an unauthenticated or other owner reuse 304', async () => {
    const paths = [
      `/api/tournaments/${tournamentId}/stages?compact=true`,
      `/api/tournaments/${tournamentId}?includeRounds=false`,
    ];
    for (const url of paths) {
      const first = await owner.get(url);
      expect(first.status).toBe(200);
      expect(first.headers.etag).toBeTruthy();
      expect((await request(appExport).get(url).set('if-none-match', first.headers.etag)).status).toBe(401);
    }

    const otherAccount = await createControlledAccount(path.join(dir, 'arena.sqlite'), 'pollother', 'correct horse battery staple', 'organizer');
    const other = request.agent(appExport);
    const login = await other.post('/api/auth/login').send({ username: otherAccount.username, password: 'correct horse battery staple' });
    expect(login.status).toBe(200);
    const first = await owner.get(`/api/tournaments/${tournamentId}/stages?compact=true`);
    expect((await other.get(`/api/tournaments/${tournamentId}/stages?compact=true`).set('if-none-match', first.headers.etag)).status).toBe(404);
  });

  it('keeps conditional validators correct for a populated multi-stage tournament', async () => {
    const sourceId = 't-3ef92d17-eea6-4296-be69-61100f9dde4c';
    const populatedId = 'populated-conditional-multi-stage';
    const sourceDir = path.join(process.cwd(), 'data', 'tournaments', sourceId);
    const fixtureDir = path.join(dir, populatedId);
    await fs.cp(sourceDir, fixtureDir, { recursive: true });
    const tournamentPath = path.join(fixtureDir, 'tournament.json');
    const tournament = JSON.parse(await fs.readFile(tournamentPath, 'utf8'));
    tournament.tournamentId = populatedId;
    tournament.metadata = { ...(tournament.metadata || {}), ownerId: ownerAccount.id };
    await fs.writeFile(tournamentPath, JSON.stringify(tournament));

    const progressUrl = `/api/tournaments/${populatedId}/progress`;
    const stagesUrl = `/api/tournaments/${populatedId}/stages?compact=true`;
    const firstProgress = await owner.get(progressUrl);
    expect(firstProgress.status).toBe(200);
    expect(firstProgress.body.status).toBe('running');
    const firstStages = await owner.get(stagesUrl);
    expect(firstStages.status).toBe(200);
    expect(firstStages.body.stages).toHaveLength(3);
    expect(tournament.participants).toHaveLength(202);

    expect((await owner.get(progressUrl).set('if-none-match', firstProgress.headers.etag)).status).toBe(304);
    expect((await owner.get(stagesUrl).set('if-none-match', firstStages.headers.etag)).status).toBe(304);

    const competitorAccount = await createControlledAccount(path.join(dir, 'arena.sqlite'), 'pollcompetitor', 'correct horse battery staple', 'competitor');
    const competitor = request.agent(appExport);
    const login = await competitor.post('/api/auth/login').send({ username: competitorAccount.username, password: 'correct horse battery staple' });
    expect(login.status).toBe(200);
    const competitorRead = await competitor.get(progressUrl).set('if-none-match', firstProgress.headers.etag);
    expect(competitorRead.status).toBe(200);
    expect(competitorRead.headers.etag).toBeTruthy();
    expect(competitorRead.body.status).toBe('running');
  });
});
