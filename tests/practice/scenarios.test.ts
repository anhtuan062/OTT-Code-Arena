import { describe, expect, it } from 'vitest';
import { createPracticeScenario, matchesPracticeSelectedMove, serializePracticeLegalMoves } from '../../practice/scenarios.js';
import { canCapture, posToAlgebraic, validateState } from '@engine/index.js';

describe('practice scenarios', () => {
  it('creates deterministic engine-validated scenarios with legal moves', () => {
    for (const id of ['initial', 'capture', 'near-goal']) {
      const first = createPracticeScenario(id);
      const second = createPracticeScenario(id);
      expect(first).not.toBeNull();
      expect(validateState(first!.state).valid).toBe(true);
      expect(first!.legalMoves.length).toBeGreaterThan(0);
      expect(first!.expectedPlayer).toBe(first!.state.currentPlayer);
      expect(first!.state).toEqual(second!.state);
      expect(first!.legalMoves).toEqual(second!.legalMoves);
    }
  });

  it('contains an engine-generated capture opportunity', () => {
    const scenario = createPracticeScenario('capture')!;
    const attacker = scenario.state.pieces.find(piece => piece.type === 'dam' && piece.player === 'A' && piece.row === 4 && piece.col === 4);
    const defender = scenario.state.pieces.find(piece => piece.type === 'keo' && piece.player === 'B' && piece.row === 4 && piece.col === 5);
    expect(scenario.expectedPlayer).toBe('A');
    expect(scenario.state.status).toBe('playing');
    expect(attacker).toMatchObject({ type: 'dam', player: 'A', row: 4, col: 4 });
    expect(defender).toMatchObject({ type: 'keo', player: 'B', row: 4, col: 5 });
    expect(canCapture(attacker!.type, defender!.type)).toBe(true);
    expect(scenario.legalMoves).toContainEqual(expect.objectContaining({
      pieceId: attacker!.id,
      from: { row: 4, col: 4 },
      to: { row: 4, col: 5 },
      captures: defender!.id,
    }));
  });

  it.each(['cpp', 'python3'])('allows the %s first-legal-move strategy in capture scenario without forcing a capture', () => {
    const scenario = createPracticeScenario('capture')!;
    const legalMoves = serializePracticeLegalMoves(scenario.legalMoves);
    const firstEngineMove = scenario.legalMoves[0]!;
    const protocolMove = {
      piece_id: firstEngineMove.pieceId,
      from: posToAlgebraic(firstEngineMove.from),
      to: posToAlgebraic(firstEngineMove.to),
    };

    expect(firstEngineMove.captures).toBeNull();
    expect(matchesPracticeSelectedMove(protocolMove, legalMoves)).toBe(true);
  });

  it('contains a legal move toward the A goal in the near-goal scenario', () => {
    const scenario = createPracticeScenario('near-goal')!;
    expect(scenario.legalMoves.some(move => posToAlgebraic(move.to) === 'i9')).toBe(true);
  });

  it('rejects unknown scenario identifiers', () => {
    expect(createPracticeScenario('arbitrary-state')).toBeNull();
  });

  it.each(['cpp', 'python3'])('matches the %s protocol move against API legal-move fields', () => {
    const scenario = createPracticeScenario('initial')!;
    const legalMoves = serializePracticeLegalMoves(scenario.legalMoves);
    const engineMove = scenario.legalMoves[0]!;
    const selected = {
      piece_id: engineMove.pieceId,
      from: posToAlgebraic(engineMove.from),
      to: posToAlgebraic(engineMove.to),
    };

    expect(legalMoves[0]).toHaveProperty('pieceId');
    expect(legalMoves[0]).not.toHaveProperty('piece_id');
    expect(matchesPracticeSelectedMove(selected, legalMoves)).toBe(true);
    expect(matchesPracticeSelectedMove({ ...selected, to: 'z0' }, legalMoves)).toBe(false);
  });
});
