# ADR-0009: Configurable Rulesets And Foundry Mechanics

## Status

Accepted - 2026-07-10. Extends ADR-0002 for the Foundry reference game.

## Context

The original vertical slice deliberately locked nine operations and deferred triggers, statuses, attachments, secrets, and choices. That proved deterministic play and replay, but it was too narrow to prove that OpenCards could host different card games or support a creator-facing Studio.

Ember Duel: Foundry Set provides concrete cards for the expanded vocabulary. Quick Sparks provides a second consumer with a different phase order, board limit, fixed energy, and fatigue profile.

## Decision

### Rulesets

SetupOpts may carry a serializable Ruleset containing:

- stable id and version;
- ordered phases and starting phase;
- battlefield and hand limits;
- energy gain, cap, and refill behavior;
- fatigue enablement, first damage, and increment.

The ruleset is part of canonical state and replay hashing. No global singleton controls game format behavior.

### Abilities

A CardDefinition can contain abilities composed from:

- one supported trigger;
- zero or more declarative conditions;
- one or more effects using the same operation vocabulary as tactics.

Supported triggers are onPlay, onDeath, onAttack, turnStart, turnEnd, onEnemyPlay, onEnemyAttack, and onFriendlyDeath.

### Operations

ADR-0002's original nine operations remain valid. Foundry adds:

- modifyStat;
- applyStatus;
- silence;
- addKeyword and removeKeyword;
- attach;
- setSecret;
- resurrectUnit;
- damageAll;
- damageAdjacent;
- randomDamage;
- chooseOne.

The canonical executable list is V1_OPERATIONS in @opencards/effects. All randomness uses canonical RNG state, and all choices become explicit legal commands.

### Data Boundary

The schema package owns cardDefinitionToSpec, the complete recursive conversion from editor data to engine data. Game packages and UI surfaces must not maintain partial conversion tables.

### Scenarios

SetupOpts may include deterministic scenario overrides for tutorials and test fixtures. Scenarios configure public match state through setup; they do not bypass command legality or introduce a second engine.

## Consequences

- A normal card or game package remains data plus tests; core changes are required only for a genuinely new generic rule.
- Replays include rulesets, nested effects, choices, secrets, and scenario setup in the deterministic contract.
- Opponent projections expose secret counts but never secret definitions or effects.
- The Studio can persist and import the same contract executed by the engine.
- Quick Sparks demonstrates that changing game rules does not require modifying core.
- ADR-0002 is historical for the first slice; this ADR is authoritative for the expanded operation and ruleset contract.
