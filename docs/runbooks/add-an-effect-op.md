# Runbook: Add an effect operation

**Status:** TBD. Phase 4 ships the v1 op set; this runbook documents the friction required to grow it. Adding an operation is a deliberate decision (see [ADR-0002](../adr/0002-effect-dsl-v1.md)).

Expected outline (to be filled in):

1. Write a new ADR (`docs/adr/NNNN-effect-<name>.md`) explaining why an existing op cannot express the new card.
2. Add the operation to `V1_OPERATIONS` (or a new versioned set) in `@opencards/effects`.
3. Add the JSON schema branch and runtime validator branch in `@opencards/schema`.
4. Add the interpreter branch in `@opencards/effects` plus typed event.
5. Add unit + integration tests.
6. Update [ADR-0002](../adr/0002-effect-dsl-v1.md) or supersede it.
7. Confirm `npm run check` is green.
