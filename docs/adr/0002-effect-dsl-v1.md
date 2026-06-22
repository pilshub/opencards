# ADR-0002: Effect DSL v1

## Status

Accepted — 2026-05-17.

## Context

The effect engine (Phase 4) and the data validator (Phase 2) both need to know the set of legal operations. The two prior documents disagreed:

- `docs/architecture.md` listed 8 operations.
- `docs/roadmap.md` listed 9 (added `discardCards`).

Drift between sibling docs on commit one is a smell that, left alone, becomes "which list is right?" on commit fifty. This ADR is the single source of truth. Other documents reference it instead of restating the list.

The DSL must also stay narrow. Ember Duel is the only consumer for the MVP, and the engineering principle is: add an operation only when a real card needs it. A universal TCG language is explicitly out of scope.

## Decision

### Canonical operations (v1)

| Operation                  | Purpose                                              | Required fields                                  |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| `gainResource`             | Increase a player's resource pool.                   | `amount`, `resource`, `target` (player selector) |
| `drawCards`                | Move N cards from deck to hand for a player.         | `amount`, `target` (player selector)             |
| `dealDamage`               | Apply damage to a unit or base.                      | `amount`, `target` (unit/base selector)          |
| `heal`                     | Reduce damage on a unit or restore base.             | `amount`, `target` (unit/base selector)          |
| `summonUnit`               | Place a unit instance onto the battlefield.          | `kind`, `target` (owner selector)                |
| `moveCard`                 | Move a card instance between zones.                  | `instance`, `fromZone`, `toZone`                 |
| `discardCards`             | Move cards from hand to discard.                     | `amount`, `target` (player selector)             |
| `addCounter`               | Add a counter of a named kind to a target.           | `counter`, `amount`, `target`                    |
| `modifyStatUntilEndOfTurn` | Temporarily adjust a unit stat for the current turn. | `stat`, `delta`, `target` (unit selector)        |

### Target selectors (v1)

`self`, `ownUnit`, `enemyUnit`, `ownBase`, `enemyBase`, `enemyUnitOrBase`, `anyUnit`, `owner`, `opponent`.

Selectors that reference units must validate against the active battlefield state before the effect enters the stack.

### Out of scope for v1

- Triggered abilities (`onPlay`, `onDeath`, etc.).
- Replacement effects.
- Layered continuous effects.
- Conditional / branching operations (`if-then-else`).
- Loops or repetition operations.
- Cost modifiers as effects.

These are revisited only when a concrete card in the Ember Duel set (or its successor) cannot be expressed without them. A new operation requires its own ADR.

### Events

Every operation emits a typed event into the event log. Replay reconstructs state by applying events in order. Suggested event names (finalized in Phase 4):

`resourceGained`, `cardsDrawn`, `damageDealt`, `healed`, `unitSummoned`, `cardMoved`, `cardsDiscarded`, `counterAdded`, `statModified`.

## Alternatives Considered

- **A universal TCG rules language.** Rejected: explicit non-goal of the MVP. The MVP exists to prove the deterministic loop, not to compete with Magic.
- **Operations as arbitrary TypeScript functions.** Rejected: breaks the "editor writes data, not rules" principle. Functions cannot be hashed reproducibly across machines.
- **A larger v1 set including triggers and replacements.** Rejected: no card in the starter Ember Duel deck requires them. Adding them speculatively expands the test surface without paying back.

## Consequences

- The validator (Phase 2) checks effect ops against this list. Unknown ops fail with a stable issue code.
- The effect engine (Phase 4) implements exactly these nine operations.
- Adding a new operation is a deliberate event: new ADR, new schema entry, new validator branch, new engine branch, new tests. Friction is the feature.
- `docs/architecture.md` and `docs/roadmap.md` reference this ADR instead of restating the operation list.
