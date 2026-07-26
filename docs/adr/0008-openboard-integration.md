# ADR-0008: OpenBoard Integration Path

## Status

Accepted - 2026-07-02.

## Context

Phase 8 prepares OpenCards for reuse by OpenBoard or another board-game host
without coupling the two projects. OpenCards has a deterministic public facade,
a replay envelope, hidden-information-safe player views, and browser-compatible
hashing. OpenBoard needs to know which parts of that surface are stable enough
to adapt against and which parts remain internal.

## Decision

### Stable id convention

Card instances created by setup use `${player}-c${index}` with a zero-padded
numeric index. The current implementation pads to at least two digits with
`String(index).padStart(2, '0')`, so the first generated card for player `p1`
is `p1-c00`.

These ids are canonical state ids, not hidden-information tokens. Public
opponent hand projections must not expose them.

### Stable hash convention

OpenCards hashes canonical JSON with sha256:

1. Convert the value with `canonicalJson`.
2. Sort object keys deterministically.
3. Preserve array order.
4. Encode the canonical JSON as UTF-8 bytes.
5. Hash with sha256 from `@noble/hashes`.
6. Return lowercase hex.

This is the browser-safe hash path accepted in ADR-0007. `hashState` is the
public helper for the full convention.

### Replay envelope convention

The stable Phase 8 replay envelope is `ReplayEnvelopeV1`:

```ts
{
  schemaVersion: '0.1.0',
  seed: number,
  setupOpts: SetupOpts,
  commands: Command[],
  finalStateHash: string,
}
```

`setupOpts` is part of the replay input. It includes the seed, players, deck
size, opening hand size, card kinds, optional exact `decklist`, optional format
values such as `baseTotal` and `startingEnergy`, and optional `cards:
CardSpec[]`.

Edited card definitions, including `CardSpec.effects`, ride in
`setupOpts.cards`. Phase 6 did not add a separate `cardDbHash`; adapters must
not invent one. If a future version needs a separate artifact hash, it requires
a versioned replay field and a new ADR.

### Asset reference convention

`@opencards/core` does not currently define a stable asset field on `CardSpec`.
Adapters should keep art and board presentation metadata outside the core,
keyed by `CardSpec.kind`.

Asset references should be portable logical ids or host URLs owned by the
embedding product, for example `cards/flare-strike/portrait.webp`. Do not put
absolute local filesystem paths into replay envelopes. Asset metadata is not
part of `finalStateHash` unless a future replay schema explicitly adds it.

### Stable public surface

The root `@opencards/core` runtime value exports stable for adapters are:

- `CORE_VERSION`
- `applyCommand`
- `canonicalJson`
- `fisherYates`
- `hashState`
- `legalCommands`
- `nextRangeRng`
- `nextRng`
- `replayEnvelope`
- `seedRng`
- `startMatch`
- `viewMatch`

The root TypeScript types currently exported for adapter authors are:

- `CardInstanceId`
- `CardKind`
- `CardSpec`
- `Command`
- `EffectOp`
- `EngineEffect`
- `HiddenDeckView`
- `MaskedCardView`
- `MatchStartResult`
- `MatchStepResult`
- `OpponentPlayerView`
- `OwnPlayerView`
- `Phase`
- `PlayerId`
- `PlayerView`
- `RNGState`
- `ReplayEnvelopeV1`
- `ReplayVerifyResult`
- `SetupOpts`
- `StackItem`
- `TargetSelector`
- `ValidationIssue`
- `ViewerHandle`
- `ZoneId`

The runtime value allow-list is guarded by
`packages/core/src/public-surface.test.ts`.

### Internal boundary

`@opencards/core/internal` is not a public adapter API. Raw `State`, `apply`,
`replay`, `computeReplayHash`, `createInitialState`, and `getLegalCommands`
are reserved for package internals, simulator tooling, and repository-owned
verification scripts.

Adapters must drive OpenCards through `startMatch`, `applyCommand`,
`viewMatch`, `legalCommands`, and `replayEnvelope`. They must not read raw
state, derive hidden card identities from setup order, or import source module
paths.

## Alternatives Considered

- Merge OpenCards directly into OpenBoard now. Rejected because card-specific
  contracts are still settling and the MVP works as an independent package.
- Expose raw state for board adapters. Rejected because it bypasses the
  hidden-information projection boundary and recreates the leak fixed in
  ADR-0005.
- Add `cardDbHash` to the replay envelope. Rejected for Phase 8 because edited
  definitions already ride in `setupOpts.cards` and are included in the
  canonical final state hash.

## Consequences

- OpenBoard can embed OpenCards as a deck, hand, and effect subsystem without
  taking a dependency on engine internals.
- Replay compatibility is framed around the existing `ReplayEnvelopeV1` shape
  and canonical sha256 state hash.
- Accidental runtime export drift from the root facade fails the core test
  suite.
- Future adapter-facing changes must update this ADR, the adapter guide, and
  the stable-surface guard together.
