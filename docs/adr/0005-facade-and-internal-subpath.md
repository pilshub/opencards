# ADR-0005: Facade and Internal Subpath

## Status

Accepted on 2026-06-09.

## Context

Round-1 and round-2 reviews showed raw `State` leaks through `@opencards/core` public exports despite a lint ban on type imports. Functions returning state still leak because consumers can read the returned object even when direct type imports are restricted.

Round-3 review also found that public facade result shapes leaked hidden information by returning all player projections together and by returning raw events containing `CardInstance.kind`.

## Decision

1. Public `@opencards/core` exposes only facade types (`MatchHandle`, `MatchStartResult`, `MatchStepResult`, `ReplayVerifyResult`, `PlayerView` and components, `SetupOpts`, `ReplayEnvelopeV1`, `ValidationIssue`, `RNGState`, `Command`), facade functions (`startMatch`, `applyCommand`, `viewMatch`, `replayEnvelope`), and pure utilities (`hashState`, `canonicalJson`, `seedRng`, `nextRng`, `nextRangeRng`, `fisherYates`, `CORE_VERSION`).
2. Raw State APIs (`createInitialState`, `apply`, `replay`, `computeReplayHash`, `State`, `Player`, `Zone`, `CardInstance`, `ApplyResult`, `ReplayResult`) move to the `@opencards/core/internal` subpath via the package.json exports map.
3. Facade returns no events and no multi-viewer view maps. Consumers invoke `viewMatch(handle, viewer)` for each viewer they want. `replayEnvelope` returns verification fields plus an opaque `finalHandle` so callers can inspect the replay result through `viewMatch` without raw state.
4. `MatchHandle` is an opaque brand. Raw state is held in a module-private `WeakMap` keyed by the handle. `(handle as any).__state` is `undefined`.
5. ESLint forbids `@opencards/core/internal` in `packages/app` and adds belt-and-suspenders bans on `createInitialState`/`apply`/`replay`/`computeReplayHash`/`getView` named imports from `@opencards/core` in app code. The override globs cover `*.ts` and `*.tsx`.

## Alternatives Considered

- Document raw access as a convention without enforcement: rejected because convention failed in v1.
- Brand-only handle with a non-enumerable property: rejected because it is readable through direct property access, as found in round-3 F10.
- Per-viewer engine instance: rejected because it loses single-state determinism guarantees.

## Consequences

- Public API signatures are breaking changes from earlier Phase 1 facade signatures.
- Scripts and tests that need raw state use `@opencards/core/internal`.
- Future event streams require masked variants and a follow-up ADR.
- The test suite must include negative lint checks and runtime opacity tests.
- A hostile public consumer can only obtain views from handles they were explicitly given.
- Multi-viewer admin/server flows go through `@opencards/core/internal`.

## Revision: Viewer-bound handles

Round-4 review found that `viewMatch(handle, viewer)` allowed any holder of a public handle to request another player's own-player projection. This revision supersedes Decision items 1, 3, and 4 where they refer to `MatchHandle`, `finalHandle`, or a caller-supplied viewer parameter.

6. `ViewerHandle` is bound to exactly one `PlayerId` at construction time. The `WeakMap` holds (`MatchInstance`, `PlayerId`) per handle. `viewMatch` takes only the handle - there is no viewer parameter - which prevents a holder of one player's handle from reading another player's `OwnPlayerView`. Servers/admins that need multi-viewer access use the raw `@opencards/core/internal` APIs.

## Revision 2: Masked entries carry no canonical identity

Round-5 adversarial review found that `MaskedCardView` exposed the canonical `CardInstanceId` (`{ id, masked: true }`). Setup builds decks deterministically as `${player}-c${index}` with `kind = cardKinds[index % cardKinds.length]`, so a holder of a viewer handle could read `viewMatch(handle).opponents[opponent].hand[0].id` and derive the kind from public setup options. Pillar 6 was therefore not actually wired.

7. `MaskedCardView` carries only `{ masked: true }`. No id, no kind. Opponent hand entries are interchangeable from the viewer's perspective; hand size is preserved by array length.
8. `verify-hidden-info` reconstructs the engine's canonical id pattern and asserts none of those ids appear in the opponent projection. Hidden-zone scans now cover both `kind` and `id` leak vectors.
9. Per-view slot tokens for animation (drawn-card pin, played-card pin, etc.) are intentionally deferred. When a UI needs them, a follow-up ADR will introduce opaque per-view tokens that cannot be correlated to canonical state or setup order. Until then, hidden zones project no identity at all.
