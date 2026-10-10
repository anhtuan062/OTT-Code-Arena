#!/usr/bin/env node
/**
 * Example Bot - Simple strategy: pick first legal move
 * Demonstrates the bot protocol v0.1.0
 */

import { readFileSync } from 'fs';

function isValidAlgebraic(alg: string): boolean {
  if (typeof alg !== 'string' || alg.length !== 2) return false;
  const col = alg.charAt(0).toLowerCase();
  const row = alg.charAt(1);
  return 'abcdefghi'.includes(col) && row >= '1' && row <= '9';
}

function isValidPieceId(id: string): boolean {
  return /^[AB]-(dam|la|keo)-\d+$/.test(id);
}

function validateBotRequest(request: unknown): { valid: boolean; error?: { message: string } } {
  if (typeof request !== 'object' || request === null) {
    return { valid: false, error: { message: 'Request must be an object' } };
  }
  const r = request as Record<string, unknown>;
  if (r.protocol_version !== '0.1.0') {
    return { valid: false, error: { message: `Unsupported protocol version: ${r.protocol_version}` } };
  }
  if (!Array.isArray(r.legal_moves)) {
    return { valid: false, error: { message: 'legal_moves must be an array' } };
  }
  return { valid: true };
}

function main(): void {
  let input = '';
  try {
    input = readFileSync(0, 'utf-8');
  } catch (e) {
    console.error(`Failed to read stdin: ${e}`);
    process.exit(1);
  }

  if (!input.trim()) {
    console.error('Empty input');
    process.exit(1);
  }

  let request: unknown;
  try {
    request = JSON.parse(input);
  } catch (e) {
    console.error(`Invalid JSON: ${e}`);
    process.exit(1);
  }

  const validation = validateBotRequest(request);
  if (!validation.valid) {
    console.error(`Invalid request: ${validation.error?.message}`);
    process.exit(1);
  }

  const req = request as { legal_moves: Array<{ piece_id: string; from: string; to: string; captures: string | null }> };

  if (!req.legal_moves || req.legal_moves.length === 0) {
    console.error('No legal moves available');
    process.exit(1);
  }

  const move = req.legal_moves[0];

  const response = {
    move: {
      piece_id: move.piece_id,
      from: move.from,
      to: move.to,
    },
  };

  console.log(JSON.stringify(response));
}

main();