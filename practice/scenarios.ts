import { createEngine, posToAlgebraic, type GameEngine } from '@engine/index.js';
import type { GameState, InitialPieceConfig, MoveOption, PieceType, Player } from '@engine/types.js';
import { validateState } from '@engine/state.js';

export const PRACTICE_SCENARIO_IDS = ['initial', 'capture', 'near-goal'] as const;
export type PracticeScenarioId = typeof PRACTICE_SCENARIO_IDS[number] | 'custom';

export interface PracticeScenario {
  id: PracticeScenarioId;
  label: string;
  expectedPlayer: Player;
  engine: GameEngine;
  state: GameState;
  legalMoves: MoveOption[];
}

export interface PracticeLegalMoveResponse {
  pieceId: string;
  from: string;
  to: string;
  captures: string | null;
}

export interface PracticeSelectedMove {
  piece_id: string;
  from: string;
  to: string;
}

export function serializePracticeLegalMoves(moves: MoveOption[]): PracticeLegalMoveResponse[] {
  return moves.map(move => ({
    pieceId: move.pieceId,
    from: posToAlgebraic(move.from),
    to: posToAlgebraic(move.to),
    captures: move.captures,
  }));
}

export function matchesPracticeSelectedMove(
  selected: PracticeSelectedMove | undefined,
  legalMoves: PracticeLegalMoveResponse[],
): boolean {
  return !!selected && legalMoves.some(move =>
    move.pieceId === selected.piece_id && move.from === selected.from && move.to === selected.to
  );
}

const scenarioPieces = (extra: InitialPieceConfig[]): InitialPieceConfig[] => [
  { type: 'dam', player: 'A', row: 0, col: 2 },
  { type: 'la', player: 'A', row: 1, col: 6 },
  { type: 'keo', player: 'A', row: 2, col: 7 },
  { type: 'dam', player: 'B', row: 8, col: 6 },
  { type: 'la', player: 'B', row: 7, col: 2 },
  { type: 'keo', player: 'B', row: 6, col: 1 },
  ...extra,
];

function createScenario(id: PracticeScenarioId, label: string, initialPieces?: InitialPieceConfig[]): PracticeScenario {
  const engine = initialPieces ? createEngine({ initialPieces }) : createEngine();
  const state = engine.getState();
  const validation = validateState(state);
  if (!validation.valid) throw new Error(`Invalid practice scenario ${id}: ${validation.reason}`);
  const legalMoves = engine.getLegalMoves();
  if (!legalMoves.length) throw new Error(`Practice scenario ${id} has no legal moves`);
  return { id, label, expectedPlayer: state.currentPlayer, engine, state, legalMoves };
}

export interface CustomPracticePiece {
  player: Player;
  type: PieceType;
  row: number;
  col: number;
}

export function createCustomPracticeScenario(pieces: CustomPracticePiece[]): PracticeScenario {
  if (!Array.isArray(pieces)) {
    throw new Error('Dữ liệu quân cờ không hợp lệ.');
  }

  const playerAPieces = pieces.filter(p => p && p.player === 'A');
  if (playerAPieces.length !== 1) {
    throw new Error('Thế cờ thử nghiệm yêu cầu đúng 1 quân của Bot A.');
  }

  const occupied = new Set<string>();
  const initialPieces: InitialPieceConfig[] = [];

  for (const piece of pieces) {
    if (!piece || (piece.player !== 'A' && piece.player !== 'B')) {
      throw new Error('Người sở hữu quân phải là A hoặc B.');
    }
    if (!['dam', 'la', 'keo'].includes(piece.type)) {
      throw new Error(`Loại quân không hợp lệ: ${piece.type}.`);
    }
    if (
      !Number.isInteger(piece.row) ||
      !Number.isInteger(piece.col) ||
      piece.row < 0 ||
      piece.row >= 9 ||
      piece.col < 0 ||
      piece.col >= 9
    ) {
      throw new Error('Vị trí quân cờ nằm ngoài bàn cờ 9x9.');
    }

    const key = `${piece.row},${piece.col}`;
    if (occupied.has(key)) {
      throw new Error(`Hai quân cờ không được đặt trùng ô (${posToAlgebraic({ row: piece.row, col: piece.col })}).`);
    }
    occupied.add(key);

    initialPieces.push({
      player: piece.player,
      type: piece.type,
      row: piece.row,
      col: piece.col,
    });
  }

  const engine = createEngine({ initialPieces });
  const state = engine.getState();
  const validation = validateState(state);
  if (!validation.valid) {
    throw new Error(`Thế cờ không hợp lệ: ${validation.reason}`);
  }

  const legalMoves = engine.getLegalMoves();
  if (!legalMoves.length) {
    throw new Error('Bot A không có nước đi hợp lệ nào trong thế cờ này (bị chặn hoặc không thể di chuyển).');
  }

  return {
    id: 'custom' as PracticeScenarioId,
    label: 'Thế cờ tự thiết lập',
    expectedPlayer: 'A',
    engine,
    state,
    legalMoves,
  };
}

export function createPracticeScenario(id: string): PracticeScenario | null {
  switch (id) {
    case 'initial':
      return createScenario('initial', 'Bàn cờ ban đầu');
    case 'capture':
      return createScenario('capture', 'Có cơ hội ăn quân', scenarioPieces([
        { type: 'dam', player: 'A', row: 4, col: 4 },
        { type: 'keo', player: 'B', row: 4, col: 5 },
      ]));
    case 'near-goal':
      return createScenario('near-goal', 'Tiến gần ô đích', scenarioPieces([
        { type: 'dam', player: 'A', row: 7, col: 7 },
        { type: 'dam', player: 'B', row: 1, col: 1 },
      ]));
    default:
      return null;
  }
}
