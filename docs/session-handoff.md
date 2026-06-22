# OpenCards Session Handoff

## Current Status (updated)

- Phase -1 (foundation locks) done: ADR-0001, ADR-0002, dev-system.md, terminology cleanup.
- Phase 0 (workspace bootstrap) done: workspaces, strict TS, vitest, eslint, prettier, husky, scripts, sentinel tests.
- Next: Phase 1 (deterministic core).

## Start Here Next Session

1. Implement a tiny deterministic RNG in `@opencards/core`.
2. Add deterministic Fisher-Yates shuffle over that RNG.
3. Add a canonical final-state hash helper.
4. Sketch command/event types and the dispatcher skeleton.
5. Add the first replay fixture and replay test.

## Decisions Already Made

- OpenCards is separate from OpenBoard, but should reuse the same engineering philosophy.
- Card data should be declarative and editor-owned.
- The effect system starts small and expands only when a sample card needs it.
- Replay verification must include card and deck hashes.

## Sibling Repos

- `open-board`: board/card/piece MVP, already implemented.
- `openadvance`: turn-based tactics engine scaffold.
- `opencompany`: company/economy simulation engine scaffold.
- `openpuzzle`: puzzle/casual engine scaffold.
- `openrts`: deterministic RTS engine scaffold.

## Phase 1 thin slice (lift)

- Deterministic core kernel landed: seeded RNG, shuffle, canonical sha256 state hash, setup, zones, draw-card dispatcher and replay.
- Hidden-info projection landed: own zones are visible, opponent hand kinds are masked, and opponent deck identity is hidden behind count-only projection.
- Facade hardening landed: public results no longer return events or multi-viewer view maps, `replayEnvelope` returns opaque `finalHandles`, and `ViewerHandle` state is hidden in a module-private WeakMap.
- Viewer-bound handles (ADR-0005 revision) close the round-4 critical finding.
- Masked entries carry no canonical identity (ADR-0005 revision 2) close the round-5 critical finding: `MaskedCardView` is `{ masked: true }` only; `verify:hidden-info` asserts both kind and canonical-id absence in opponent projections.
- ADR-0005 records the `@opencards/core` facade and `@opencards/core/internal` subpath contract.
- `verify:replay` and `verify:hidden-info` are real checks again and are re-added to `npm run check` after overall coverage.
- Browser-compatible hashing landed for Phase 5: ADR-0007 replaces `node:crypto` with `@noble/hashes` and closes the round-2 high finding.
- ADR-0004 is superseded by the Phase 1 implementation.
- Next: Phase 2 (schemas + cross-field validation).
