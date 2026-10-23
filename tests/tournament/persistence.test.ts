/**
 * Tournament Manager - Persistence Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  FileTournamentRepository,
  createTournament,
  validateTournament,
  TournamentStorageConfig,
} from '@tournament/persistence.js';
import type {
  Tournament,
  TournamentParticipant,
  TournamentMatchRecord,
  TournamentStanding,
  MatchReplay,
  TournamentFormat,
  TournamentStatus,
} from '@tournament/types.js';

describe('Tournament Persistence', () => {
  let testDir: string;
  let repository: FileTournamentRepository;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `ott-persist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(testDir, { recursive: true });
    repository = new FileTournamentRepository({ baseDir: testDir, indent: 2 });
    await repository.initialize();
  });

  afterEach(async () => {
    repository.close();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  const createTestTournament = (id: string = 'test-tournament'): Tournament => {
    return createTournament(id, 'Test Tournament', 'single_round_robin');
  };

  const createTestParticipant = (id: string): TournamentParticipant => ({
    participantId: id,
    name: `Player ${id}`,
    bot: {
      botId: `bot-${id}`,
      player: 'A' as const,
      command: 'node',
      args: ['bot.js'],
    },
    registeredAt: new Date().toISOString(),
  });

  const createTestMatchRecord = (matchId: string): TournamentMatchRecord => ({
    matchId,
    pairingId: `pairing-${matchId}`,
    participantA: 'P1',
    participantB: 'P2',
    winner: 'A',
    terminationReason: 'goal_reached',
    turnCount: 10,
    durationMs: 1000,
    replayRef: matchId,
    completedAt: new Date().toISOString(),
  });

  const createTestReplay = (matchId: string): MatchReplay => ({
    matchId,
    protocolVersion: '0.1.0',
    initialState: {
      turn: 1,
      currentPlayer: 'A',
      status: 'in_progress',
      winner: null,
      winReason: null,
      pieces: [],
      lastMove: null,
      positionHistory: [],
    },
    moves: [],
    finalState: {
      turn: 10,
      currentPlayer: 'A',
      status: 'finished',
      winner: 'A',
      winReason: 'goal_reached',
      pieces: [],
      lastMove: null,
      positionHistory: [],
    },
    winner: 'A',
    terminationReason: 'goal_reached',
  });

  const createTestStanding = (id: string): TournamentStanding => ({
    participantId: id,
    participantName: `Player ${id}`,
    matchesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    forfeits: 0,
    points: 0,
    tiebreakHeadToHead: {},
  });

  it('rejects unsafe identifiers before using them as paths', async () => {
    await expect(repository.load('../outside')).rejects.toThrow('Invalid tournament identifier');
    await expect(repository.save(createTournament('../outside', 'Invalid'))).rejects.toThrow('Invalid tournament identifier');
    await expect(repository.loadMatchResult('safe', '../outside')).rejects.toThrow('Invalid match identifier');
  });

  it('serializes concurrent saves for the same tournament without corrupting JSON', async () => {
    const first = createTestTournament('concurrent');
    first.name = 'first';
    const second = createTestTournament('concurrent');
    second.name = 'second';
    await Promise.all([repository.save(first), repository.save(second)]);
    const loaded = await repository.load('concurrent');
    expect(loaded?.name === 'first' || loaded?.name === 'second').toBe(true);
    expect(() => JSON.stringify(loaded)).not.toThrow();
  });

  it('serializes parallel list reads with saves without exposing recovery-window races', async () => {
    const initial = createTestTournament('parallel-list-save');
    await repository.save(initial);

    const saves = Array.from({ length: 24 }, (_, index) => {
      const next = createTestTournament('parallel-list-save');
      next.name = `revision-${index}`;
      return repository.save(next);
    });
    const reads = Array.from({ length: 24 }, () => repository.list());
    const results = await Promise.all([...saves, ...reads]);

    expect(results.slice(24).every(list => list.some(item => item.tournamentId === 'parallel-list-save'))).toBe(true);
    expect((await repository.load('parallel-list-save'))?.name).toMatch(/^revision-/);
  });

  describe('FileTournamentRepository', () => {
    it('should save and load tournament', async () => {
      const tournament = createTestTournament('tourney-1');
      tournament.participants = [createTestParticipant('P1'), createTestParticipant('P2')];
      tournament.standings = [createTestStanding('P1'), createTestStanding('P2')];

      await repository.save(tournament);
      const loaded = await repository.load('tourney-1');

      expect(loaded).not.toBeNull();
      expect(loaded?.tournamentId).toBe('tourney-1');
      expect(loaded?.name).toBe('Test Tournament');
      expect(loaded?.participants).toHaveLength(2);
    });

    it('should return null for non-existent tournament', async () => {
      const loaded = await repository.load('non-existent');
      expect(loaded).toBeNull();
    });

    it('should list tournaments', async () => {
      await repository.save(createTestTournament('tourney-1'));
      await repository.save(createTestTournament('tourney-2'));

      const list = await repository.list();

      expect(list).toHaveLength(2);
      expect(list.map(t => t.tournamentId)).toContain('tourney-1');
      expect(list.map(t => t.tournamentId)).toContain('tourney-2');
    });

    it('should delete tournament', async () => {
      await repository.save(createTestTournament('tourney-1'));
      expect(await repository.exists('tourney-1')).toBe(true);

      await repository.delete('tourney-1');
      expect(await repository.exists('tourney-1')).toBe(false);
    });

    it('should check existence', async () => {
      expect(await repository.exists('tourney-1')).toBe(false);
      await repository.save(createTestTournament('tourney-1'));
      expect(await repository.exists('tourney-1')).toBe(true);
    });

    it('should save and load match result', async () => {
      const tournamentId = 'tourney-1';
      await repository.save(createTestTournament(tournamentId));

      const matchRecord = createTestMatchRecord('match-1');
      const replay = createTestReplay('match-1');

      await repository.saveMatchResult(tournamentId, 'match-1', matchRecord, replay);
      const loaded = await repository.loadMatchResult(tournamentId, 'match-1');

      expect(loaded).not.toBeNull();
      expect(loaded?.matchId).toBe('match-1');
      expect(loaded?.winner).toBe('A');
    });

    it('should load replay', async () => {
      const tournamentId = 'tourney-1';
      await repository.save(createTestTournament(tournamentId));

      const replay = createTestReplay('match-1');
      await repository.saveMatchResult(tournamentId, 'match-1', createTestMatchRecord('match-1'), replay);

      const loaded = await repository.loadReplay(tournamentId, 'match-1');

      expect(loaded).not.toBeNull();
      expect(loaded?.matchId).toBe('match-1');
    });

    it('should list match results', async () => {
      const tournamentId = 'tourney-1';
      await repository.save(createTestTournament(tournamentId));

      await repository.saveMatchResult(tournamentId, 'match-1', createTestMatchRecord('match-1'), createTestReplay('match-1'));
      await repository.saveMatchResult(tournamentId, 'match-2', createTestMatchRecord('match-2'), createTestReplay('match-2'));

      const results = await repository.listMatchResults(tournamentId);

      expect(results).toHaveLength(2);
    });
  });

  describe('createTournament', () => {
    it('should create tournament with defaults', () => {
      const tournament = createTournament('test-id', 'Test Name');

      expect(tournament.tournamentId).toBe('test-id');
      expect(tournament.name).toBe('Test Name');
      expect(tournament.format).toBe('multi_stage');
      expect(tournament.status).toBe('draft');
      expect(tournament.participants).toHaveLength(0);
      expect(tournament.rounds).toHaveLength(0);
      expect(tournament.standings).toHaveLength(0);
      expect(tournament.createdAt).toBeDefined();
      expect(tournament.matchConfig).toBeDefined();
      expect(tournament.scoringConfig).toBeDefined();
    });

    it('should allow custom match config', () => {
      const tournament = createTournament('test-id', 'Test Name', 'single_round_robin', { maxTurns: 100 });

      expect(tournament.matchConfig.maxTurns).toBe(100);
      expect(tournament.matchConfig.turnTimeoutMs).toBe(2000); // default preserved
    });

    it('should allow custom scoring config', () => {
      const tournament = createTournament('test-id', 'Test Name', 'single_round_robin', {}, { winPoints: 5 });

      expect(tournament.scoringConfig.winPoints).toBe(5);
      expect(tournament.scoringConfig.drawPoints).toBe(1); // default preserved
    });
  });

  describe('validateTournament', () => {
    it('should validate correct tournament', () => {
      const tournament = createTestTournament('test');
      tournament.participants = [
        createTestParticipant('P1'),
        createTestParticipant('P2'),
      ];
      tournament.standings = [
        createTestStanding('P1'),
        createTestStanding('P2'),
      ];

      const result = validateTournament(tournament);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing tournamentId', () => {
      const tournament = createTestTournament('test');
      (tournament as any).tournamentId = '';

      const result = validateTournament(tournament);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('tournamentId'))).toBe(true);
    });

    it('should detect duplicate participant IDs', () => {
      const tournament = createTestTournament('test');
      tournament.participants = [
        createTestParticipant('P1'),
        createTestParticipant('P1'), // duplicate
      ];

      const result = validateTournament(tournament);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate participant'))).toBe(true);
    });

    it('should detect missing standings', () => {
      const tournament = createTestTournament('test');
      tournament.participants = [createTestParticipant('P1')];
      tournament.standings = []; // missing standing

      const result = validateTournament(tournament);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Missing standing'))).toBe(true);
    });
  });
});
