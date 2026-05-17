# OpenCards Session Handoff

## Current Status

Planning scaffold only. No engine code exists yet.

## Start Here Next Session

1. Create `packages/core` with command/event/replay types.
2. Add a tiny deterministic RNG and final-state hash helper.
3. Model card instances and zones.
4. Turn `examples/starter-deck.json` into a validated sample.
5. Add the first replay test.

## Decisions Already Made

- OpenCards is separate from OpenBoard, but should reuse the same engineering philosophy.
- Card data should be declarative and editor-owned.
- The effect system starts small and expands only when a sample card needs it.
- Replay verification must include card and deck hashes.

## Sibling Repos

- `open-board`: board/card/piece MVP, already implemented.
- `openadvance`: turn-based tactics engine scaffold.
- `opencompany`: company/economy simulation engine scaffold.
- `openrts`: deterministic RTS engine scaffold.
