import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileTournamentRepository } from '@tournament/persistence.js';
import type { Tournament } from '@tournament/types.js';

describe('Persistence Recovery - Fault Injection', () => {
  let testBaseDir: string;
  let repository: FileTournamentRepository;

  const createTestTournament = (id: string, name: string = 'Test'): Tournament => ({
    tournamentId: id,
    name,
    format: 'single_round_robin',
    status: 'draft',
    participants: [],
    matchConfig: {
      protocolVersion: '0.1.0',
      maxTurns: 200,
      turnTimeoutMs: 2000,
      maxStdoutBytes: 1024 * 1024,
      maxStderrBytes: 10 * 1024 * 1024,
      failurePolicy: 'forfeit',
      maxRetries: 0,
      logRequests: true,
      logResponses: true,
      logStates: false,
    },
    scoringConfig: {
      winPoints: 3,
      drawPoints: 1,
      lossPoints: 0,
      byePoints: 3,
    },
    rounds: [],
    standings: [],
    createdAt: new Date().toISOString(),
    registrationOpenedAt: null,
    registrationClosedAt: null,
    startedAt: null,
    completedAt: null,
  });

  beforeEach(async () => {
    testBaseDir = path.join(os.tmpdir(), `ott-fault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(testBaseDir, { recursive: true });
    repository = new FileTournamentRepository({ baseDir: testBaseDir });
    await repository.initialize();
  });

  afterEach(async () => {
    repository.close();
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {}
  });

  describe('write failure simulation', () => {
    it('should retain original data when temp file exists but target is intact', async () => {
      const tournament = createTestTournament('fault-1', 'Original');
      await repository.save(tournament);

      const targetFile = path.join(testBaseDir, 'fault-1', 'tournament.json');
      const tempFile = targetFile + '.tmp';
      await fs.writeFile(tempFile, JSON.stringify({ ...tournament, name: 'Partial Write' }), 'utf-8');

      const loaded = await repository.load('fault-1');
      expect(loaded?.name).toBe('Original');
    });

    it('should preserve backup file when rename to target fails mid-write', async () => {
      const tournament = createTestTournament('fault-2', 'Original');
      await repository.save(tournament);

      const targetFile = path.join(testBaseDir, 'fault-2', 'tournament.json');
      const backupFile = targetFile + '.bak';

      await fs.copyFile(targetFile, backupFile);
      await fs.rm(targetFile);

      const backupData = await fs.readFile(backupFile, 'utf-8');
      const parsed = JSON.parse(backupData) as Tournament;
      expect(parsed.name).toBe('Original');

      await fs.rename(backupFile, targetFile);
      const loaded = await repository.load('fault-2');
      expect(loaded?.name).toBe('Original');
    });

    it('should handle restore from backup after target deletion', async () => {
      const tournament = createTestTournament('fault-3', 'Original');
      await repository.save(tournament);

      const targetFile = path.join(testBaseDir, 'fault-3', 'tournament.json');
      const backupFile = targetFile + '.bak';

      await fs.rename(targetFile, backupFile);

      const restored = await repository.load('fault-3');
      expect(restored?.name).toBe('Original');
    });

    it('should reject ambiguous backup recovery instead of choosing arbitrarily', async () => {
      const tournamentId = 'fault-ambiguous-backup';
      const dir = path.join(testBaseDir, tournamentId);
      await fs.mkdir(dir, { recursive: true });
      const data = JSON.stringify(createTestTournament(tournamentId, 'Recoverable'));
      await fs.writeFile(path.join(dir, 'tournament.json.first.bak'), data, 'utf-8');
      await fs.writeFile(path.join(dir, 'tournament.json.second.bak'), data, 'utf-8');

      await expect(repository.load(tournamentId)).rejects.toThrow('Ambiguous tournament recovery');
    });

    it('should surface a corrupt primary even when a backup exists', async () => {
      const tournamentId = 'fault-corrupt-primary';
      const dir = path.join(testBaseDir, tournamentId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'tournament.json'), '{corrupt', 'utf-8');
      await fs.writeFile(
        path.join(dir, 'tournament.json.bak'),
        JSON.stringify(createTestTournament(tournamentId, 'Backup')),
        'utf-8'
      );

      await expect(repository.load(tournamentId)).rejects.toThrow();
    });
  });

  describe('cleanup failure simulation', () => {
    it('should not leave stale temp files after successful save', async () => {
      const tournament = createTestTournament('cleanup-1', 'Test');
      await repository.save(tournament);

      const dir = path.join(testBaseDir, 'cleanup-1');
      const files = await fs.readdir(dir);
      const tmpFiles = files.filter(f => f.endsWith('.tmp'));
      const bakFiles = files.filter(f => f.endsWith('.bak'));

      expect(tmpFiles).toHaveLength(0);
      expect(bakFiles).toHaveLength(0);
    });

    it('should handle rapid sequential saves without data loss', async () => {
      const id = 'rapid-save';
      for (let i = 0; i < 20; i++) {
        await repository.save(createTestTournament(id, `Version ${i}`));
      }

      const loaded = await repository.load(id);
      expect(loaded?.name).toBe('Version 19');
    });
  });

  describe('match result fault injection', () => {
    it('should handle save of match result when tournament directory exists', async () => {
      await repository.save(createTestTournament('match-fault-1'));

      const matchResult = {
        matchId: 'mf-1',
        pairingId: 'p-1',
        participantA: 'P1',
        participantB: 'P2',
        winner: 'A',
        terminationReason: 'goal_reached',
        turnCount: 10,
        durationMs: 500,
        replayRef: 'mf-1',
        completedAt: new Date().toISOString(),
      };

      const replay = {
        matchId: 'mf-1',
        protocolVersion: '0.1.0',
        initialState: {},
        moves: [],
        finalState: {},
        winner: 'A',
        terminationReason: 'goal_reached',
      };

      await repository.saveMatchResult('match-fault-1', 'mf-1', matchResult, replay);

      const loadedResult = await repository.loadMatchResult('match-fault-1', 'mf-1');
      expect(loadedResult?.matchId).toBe('mf-1');

      const loadedReplay = await repository.loadReplay('match-fault-1', 'mf-1');
      expect(loadedReplay?.matchId).toBe('mf-1');
    });

    it('should return null for missing match result', async () => {
      await repository.save(createTestTournament('match-fault-2'));
      const result = await repository.loadMatchResult('match-fault-2', 'nonexistent');
      expect(result).toBeNull();
    });

    it('should return null for missing replay', async () => {
      await repository.save(createTestTournament('match-fault-3'));
      const replay = await repository.loadReplay('match-fault-3', 'nonexistent');
      expect(replay).toBeNull();
    });

    it('should return empty array for tournament with no match results', async () => {
      await repository.save(createTestTournament('match-fault-4'));
      const results = await repository.listMatchResults('match-fault-4');
      expect(results).toEqual([]);
    });

    it('should surface a result file left without its replay after an interrupted write', async () => {
      const tournamentId = 'match-fault-partial';
      await repository.save(createTestTournament(tournamentId));
      const dir = path.join(testBaseDir, tournamentId);
      await fs.writeFile(
        path.join(dir, 'match-orphan.json'),
        JSON.stringify({
          matchId: 'orphan',
          pairingId: 'pairing-orphan',
          participantA: 'P1',
          participantB: 'P2',
          winner: 'A',
          terminationReason: 'goal_reached',
          turnCount: 1,
          durationMs: 1,
          replayRef: 'orphan',
          completedAt: new Date().toISOString(),
        }),
        'utf-8'
      );

      await expect(repository.listMatchResults(tournamentId)).rejects.toThrow('Incomplete persisted match orphan');
    });

    it('should reject a replay written without a result', async () => {
      const tournamentId = 'match-replay-orphan';
      await repository.save(createTestTournament(tournamentId));
      await fs.writeFile(path.join(testBaseDir, tournamentId, 'replay-orphan.json'), '{}', 'utf-8');

      await expect(repository.listMatchResults(tournamentId)).rejects.toThrow('Incomplete persisted match orphan');
      await expect(repository.loadReplay(tournamentId, 'orphan')).rejects.toThrow('Incomplete persisted match orphan');
    });

    it('should reject mismatched or malformed committed pairs', async () => {
      const tournamentId = 'match-mismatch';
      await repository.save(createTestTournament(tournamentId));
      const result = {
        matchId: 'one', pairingId: 'p', participantA: 'P1', participantB: 'P2', winner: 'A',
        terminationReason: 'goal_reached', turnCount: 1, durationMs: 1, replayRef: 'one',
        completedAt: new Date().toISOString(),
      };
      const replay = { matchId: 'two' };
      await fs.writeFile(path.join(testBaseDir, tournamentId, 'match-one.json'), JSON.stringify(result), 'utf-8');
      await fs.writeFile(path.join(testBaseDir, tournamentId, 'replay-one.json'), JSON.stringify(replay), 'utf-8');
      await fs.writeFile(path.join(testBaseDir, tournamentId, 'match-one.commit.json'), JSON.stringify({
        matchId: 'one', resultHash: 'bad', replayHash: 'bad',
      }), 'utf-8');

      await expect(repository.listMatchResults(tournamentId)).rejects.toThrow('Inconsistent persisted match one');
    });

    it('should reject markerless pairs instead of falling back to legacy acceptance', async () => {
      const tournamentId = 'match-legacy';
      await repository.save(createTestTournament(tournamentId));
      const result = {
        matchId: 'legacy', pairingId: 'p', participantA: 'P1', participantB: 'P2', winner: 'A',
        terminationReason: 'goal_reached', turnCount: 1, durationMs: 1, replayRef: 'legacy',
        completedAt: new Date().toISOString(),
      };
      const replay = { matchId: 'legacy' };
      const dir = path.join(testBaseDir, tournamentId);
      await fs.writeFile(path.join(dir, 'match-legacy.json'), JSON.stringify(result), 'utf-8');
      await fs.writeFile(path.join(dir, 'replay-legacy.json'), JSON.stringify(replay), 'utf-8');

      await expect(repository.listMatchResults(tournamentId)).rejects.toThrow('Uncommitted persisted match legacy: commit marker is required');
      await expect(repository.loadMatchResult(tournamentId, 'legacy')).rejects.toThrow('Uncommitted persisted match legacy: commit marker is required');
      await expect(repository.loadReplay(tournamentId, 'legacy')).rejects.toThrow('Uncommitted persisted match legacy: commit marker is required');
    });
  });

  describe('corrupted state recovery', () => {
    it('should throw on corrupted JSON in tournament file', async () => {
      const dir = path.join(testBaseDir, 'corrupt-fault');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'tournament.json'), '{invalid json', 'utf-8');

      await expect(repository.load('corrupt-fault')).rejects.toThrow();
    });

    it('should throw on corrupted JSON in match result file', async () => {
      const dir = path.join(testBaseDir, 'corrupt-match');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'tournament.json'), JSON.stringify(createTestTournament('corrupt-match')));
      await fs.writeFile(path.join(dir, 'match-broken.json'), 'not json', 'utf-8');

      await expect(repository.listMatchResults('corrupt-match')).rejects.toThrow();
    });

    it('should handle empty tournament directory', async () => {
      const dir = path.join(testBaseDir, 'empty-dir');
      await fs.mkdir(dir, { recursive: true });

      const loaded = await repository.load('empty-dir');
      expect(loaded).toBeNull();
    });
  });
});
