# Architecture Decision Records

## ADR-001: Language and Runtime

**Date**: 2026-10-09
**Status**: Accepted

**Context**: Need to choose implementation language for OTT Code Arena.

**Decision**: TypeScript on Node.js 20+

**Rationale**:
- Existing OTTv2 is JavaScript/TypeScript compatible
- Node.js has built-in child_process for bot execution
- Type safety for protocol schemas
- Large ecosystem for testing, tooling
- Can share types between engine and UI

**Consequences**:
- Need tsconfig, build step
- Node.js version must be specified
- Bot runners for other languages need separate adapters

---

## ADR-002: Repository Structure

**Date**: 2026-10-09
**Status**: Accepted

**Context**: How to organize code.

**Decision**: Modular monolith with clear package boundaries under `engine/`, `bot-protocol/`, `bot-runner/`, `match-runner/`, `tournament/`

**Rationale**:
- Single repository for MVP simplicity
- Clear separation of concerns
- Can extract to separate packages later
- Shared types via internal imports

**Consequences**:
- Need build config for each module or single tsconfig
- Import paths must respect boundaries

---

## ADR-003: Bot Protocol Transport

**Date**: 2026-10-09
**Status**: Accepted

**Context**: How engine communicates with bots.

**Decision**: JSON Lines over stdio (one request per turn, one response per turn)

**Rationale**:
- Language agnostic
- Simple to implement in any language
- Easy to debug (text-based)
- No persistent process complexity
- Natural timeout per turn

**Consequences**:
- Bot startup overhead per turn (mitigated by warm-up or persistent mode later)
- Must validate every response
- Stderr for logging only

---

## ADR-004: Game Engine Purity

**Date**: 2026-10-09
**Status**: Accepted

**Context**: Should engine depend on I/O?

**Decision**: Pure functions, no I/O, no side effects, no external dependencies

**Rationale**:
- Fully testable in isolation
- Deterministic
- Portable to browser, server, CLI
- Easy to verify correctness

**Consequences**:
- All state passed explicitly
- No random numbers in engine (seeded if needed)
- Serialization separate

---

## ADR-005: Coordinate System

**Date**: 2026-10-09
**Status**: Accepted

**Context**: Internal vs external coordinate representation.

**Decision**: Internal: 0-indexed (row, col). External (protocol): algebraic `a1`-`i9`.

**Rationale**:
- Algebraic is standard for chess-like games
- 0-indexed is natural for arrays
- Conversion functions in one place

**Consequences**:
- Need conversion utilities
- Protocol uses algebraic only

---

## ADR-006: Win Condition Priority

**Date**: 2026-10-09
**Status**: Provisional

**Context**: What if a move triggers multiple win conditions?

**Decision**: Check in order: 1) Type elimination, 2) Goal square. First match wins.

**Rationale**:
- Type elimination is the "main" win condition
- Goal square is alternative
- Order must be documented and testable

**Consequences**:
- Must be configurable if rules change
- Test both orders

---

## ADR-007: Invalid Move Penalty

**Date**: 2026-10-09
**Status**: Provisional

**Context**: What happens when bot makes illegal move?

**Decision**: Immediate forfeit (opponent wins, reason: "invalid_move")

**Rationale**:
- Simple, unambiguous
- Encourages correct bot implementation
- Matches chess engine conventions

**Consequences**:
- Harsh for bugs; consider "skip turn" alternative
- Must be configurable

---

## ADR-008: Timeout Duration

**Date**: 2026-10-09
**Status**: Provisional

**Context**: How long does a bot get per move?

**Decision**: 2000ms default, configurable per tournament

**Rationale**:
- Allows non-trivial search (minimax depth 4-5)
- Fast enough for tournament pace
- Configurable for different formats

**Consequences**:
- Must be enforced by bot runner
- Communicated in tournament rules

---

## ADR-009: Data Persistence (MVP)

**Date**: 2026-10-09
**Status**: Accepted

**Context**: How to store tournament data.

**Decision**: JSON files in `data/` directory for MVP

**Rationale**:
- Zero dependencies
- Human readable
- Easy to migrate later
- Sufficient for small tournaments

**Consequences**:
- No concurrent write safety
- No query capability
- Will need database for production

---

## ADR-010: Tournament Scoring

**Date**: 2026-10-09
**Status**: Provisional

**Context**: How to rank teams.

**Decision**: Win=3, Draw=1, Loss=0. Tie-breaks: 1) Buchholz, 2) Sonneborn-Berger, 3) Head-to-head.

**Rationale**:
- Standard football/scrabble scoring
- Encourages wins over draws
- Buchholz is standard chess tie-break

**Consequences**:
- Must be configurable
- Document in tournament rules