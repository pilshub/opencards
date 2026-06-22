# OpenCards Roadmap

## North Star

```text
card db hash + decklist hash + setup + seed + ordered commands = final state hash
```

Every phase must serve this invariant. If a feature cannot be replayed or hashed, it is out of scope until it can.

## Current State

Planning scaffold. Documentation, a single starter-deck example, and an empty packages directory. No workspace, no engine code, no tests, no app.

## Development Principles

- Determinism first: every setup, shuffle, draw, bot choice and replay must use seeded state.
- Commands are the only way to mutate state.
- Events are durable facts: they drive logs, animation, analytics and replay.
- The editor writes data, not hidden rules.
- The effect DSL starts narrow and only grows when a real card needs a new operation.
- Hidden information is a projection of canonical state, never a second state.
- Every milestone adds executable checks, not only more structure.
- The UI is a render of `engine.getView(playerId)`. It never invents legality.

## MVP Product Target

A local two-player browser demo for **Ember Duel**:

- 12-card starter decks;
- deterministic setup, shuffle and draw;
- hand, deck, discard, exile, battlefield and stack zones;
- base/life total and energy resource;
- unit and tactic cards;
- legal command generation;
- effect DSL for damage, resource gain, draw, discard, summon, heal, counters, stat mods and card movement;
- deck/card validation;
- bot-vs-bot match simulation;
- replay export/import and verification;
- basic card and deck editor.

## Phase -1: Foundation Locks

Two short commits, before any code. They pay back across every later phase.

Tasks:

- **ADR-0001 — Frontend stack.** One page in `docs/adr/`. Lock: Vite + React 18 + TypeScript strict + Tailwind + Zustand + Playwright + Framer Motion. No "decide later".
- **ADR-0002 — Effect DSL v1.** Single canonical list of operations: `gainResource`, `drawCards`, `dealDamage`, `heal`, `summonUnit`, `moveCard`, `discardCards`, `addCounter`, `modifyStatUntilEndOfTurn`. Other docs reference the ADR instead of restating the list.
- **Terminology cleanup.** Replace "Codex" with "the author" or "the editor" in product-facing docs. Tool names do not belong in product specs.

Exit criteria:

- Every later phase has a single source of truth to obey.
- No drift remains between `architecture.md` and `roadmap.md`.

## Phase 0: Workspace Bootstrap

Goal: a TypeScript monorepo that runs real quality gates.

Tasks:

- npm workspaces for `packages/core`, `packages/schema`, `packages/effects`, `packages/simulator`, `packages/app`.
- Root `tsconfig.json` with `strict: true`, vitest, eslint (minimal config), prettier.
- Scripts: `typecheck`, `test`, `check`, `dev`, `build:app`. Replace the placeholder `check` in the root `package.json`.
- Each package: `src/index.ts` exporting a sentinel symbol plus one passing test.

Exit criteria:

- `npm run check` runs real `tsc` and `vitest`, exits non-zero on failure.
- A test in `core` successfully imports its public surface and asserts real behavior. (Workspace-alias self-import deferred to Phase 1 once a built `dist/` exists; coverage v8 cannot trace the source through the package export otherwise.)
- Repo layout matches `packages/README.md`.

## Phase 1: Deterministic Core And Replay

Goal: the engine kernel, before any card-specific rules.

Tasks:

- Core types: `PlayerId`, `CardKind`, `CardInstanceId`, `ZoneId`, `Phase`, `Turn`, `Priority`, `Resource`, `RNGState`.
- Seeded RNG (xorshift or PCG — not `Math.random`).
- Deterministic Fisher-Yates shuffle over that RNG.
- Stable hash helper: canonical JSON → sha256, deterministic key order.
- Command dispatcher: `apply(state, command) → { state, events, issues }`.
- Zones as ordered collections, with helpers for `move`, `draw`, `reveal`, `mask`, `query`.
- `getView(playerId, state) → PlayerView`: the only hidden-information projection.
- Replay envelope type and `replay(envelope) → state`, with hash verification.

Exit criteria:

- A scripted setup plus an ordered command list replays to the same final hash across 100 seeds.
- Invalid commands return structured validation issues; state is unchanged.
- Hidden opponent cards are masked in `getView`; a test fails if the hand identity leaks.
- Unit tests cover RNG, shuffle, replay, card movement and hidden information.
- Phase 1 closes the loop by re-adding `verify:replay` and `verify:hidden-info` to the `check` gate.

## Phase 2: Declarative Data And Validation

Goal: make card and deck data safe enough for an editor to own.

Tasks:

- Decide whether the starter sample stays bundled or splits into `cards.json` / `decklists.json` / `formats.json`. Document the choice in a short ADR.
- JSON Schemas for card definitions, decklists, formats and replay envelopes.
- Runtime validator for cross-field rules:
  - duplicate card kinds;
  - unsupported card types;
  - invalid costs or unknown resources;
  - invalid deck sizes or copy counts;
  - unknown effect operations (referenced from ADR-0002);
  - unknown target selectors;
  - missing required stats for units;
  - unsupported timing windows.
- Fixtures: at least one valid plus one invalid per failure mode.

Exit criteria:

- The Ember Duel starter data passes both schema and runtime validation.
- Invalid fixtures fail with stable, documented issue codes.
- Card-definition and decklist hashes are reproducible across runs.

## Phase 3: Ember Duel Vertical Slice

Goal: the smallest complete playable loop, commands-only.

Tasks:

- Setup: two players, base total 20, starting energy 0 (grows per turn), 12-card decks, opening hand size 5, first player chosen by seed.
- Phases: `start → main → combat → end`.
- Commands: `playCard`, `chooseTarget`, `attack`, `resolveStack`, `endPhase`, `endTurn`.
- Legal command generation per player and per phase.
- Unit state: attack, health, damage taken, exhausted/ready, summoning sickness.
- Tactic resolution for `flare-strike`.
- Win condition: base ≤ 0.

Exit criteria:

- Starter decks complete a legal match through commands only.
- Random-legal bot vs random-legal bot reaches a winner across seeded runs.
- Final simulated state verifies through a replay envelope.
- Tests cover at least three illegal-action cases per phase.

## Phase 4: Effect Engine v1

Goal: card behavior is data, not code.

Tasks:

- Implement the operations locked by ADR-0002.
- Target selectors: `self`, `ownUnit`, `enemyUnit`, `enemyBase`, `enemyUnitOrBase`, `anyUnit`.
- Target validation before an effect enters the stack.
- Stack/effect queue with deterministic resolution order.
- Every operation emits typed events readable by UI and replay.

Out of scope for v1 (revisit only when a real card forces it):

- triggered abilities;
- replacement effects;
- layered continuous effects.

Exit criteria:

- Ember Duel cards run on the DSL, with no per-card code in `core`.
- Adding a data-only card (e.g. "Heal 3 to self") requires zero engine edits.

## Phase 5: Browser Play And Replay Surface

Goal: expose the deterministic engine in a local app a human can play.

Stack is locked by ADR-0001. Architectural rules for the UI layer:

- The UI reads only `engine.getView(playerId)` and `engine.getLegalCommands(playerId)`. Never raw state.
- Buttons and action affordances render directly from the legal commands list. If it is not in the list, there is no button.
- Target selection is an explicit state machine: `idle → awaitingTarget(commandDraft) → confirming`. Not a boolean.
- Animations trigger from events in the log, not from state diffs. This is what makes the replay reproduce animation.
- A hash-match indicator is visible per applied command. Verifiability is a product feature, not a devtools detail.

Surface scope:

- Hot-seat two-player layout: opponent strip on top (base, energy, hand count, battlefield), your battlefield and hand at the bottom, stack and scrubbable event log in the middle.
- Replay import/export with verification status.
- Click-to-target only. No drag-and-drop in v1.
- One dark theme. No theming infrastructure.
- Playwright smoke tests and pixel checks on the key states (setup, mid-game, win screen).

Exit criteria:

- A human can complete Ember Duel locally in a browser.
- Replay import/export works from the UI.
- `getView` never leaks the opponent's hand or deck identity (tested via DOM inspection).
- `npm run verify:app` builds the app and runs Playwright smoke checks.

## Phase 6: Basic Editor

Goal: prove the editor-owned data contract.

Tasks:

- Card list and card-detail editing.
- Deck editor with copy counts and live legality feedback.
- Format editor (deck size, copy limit, opening hand, base total, starting energy).
- Import/export JSON.
- LocalStorage persistence for the MVP.
- The play surface can run against locally edited definitions; the replay envelope records the edited definition hash.

Exit criteria:

- A user can change a card, validate the result and play the modified match without engine edits.
- Replay envelopes encode the edited definition hash and verify correctly.
- A short "How to add a card" walkthrough lives in `docs/`.

## Phase 7: Simulator And QA Hardening

Goal: regressions are loud and cheap to catch.

Tasks:

- Bot policies: `random-legal`, `greedy-damage`, `smoke-test` (always plays the first legal command).
- Seeded match-harness; collects outcomes, lengths and win rates.
- Replay fixtures for canonical matches.
- Legal-action fuzz: bots must never emit an illegal command.
- `verify:mvp` script: schema + runtime validation + unit tests + simulator + app build + Playwright smoke.
- Document debugging workflow for failed replay hashes.

Exit criteria:

- `npm run verify:mvp` is the single confidence command.
- Bot simulations across a seed range are bit-identical between runs.
- Replay fixtures catch behavior drift.

## Phase 8: OpenBoard Integration Path

Goal: prepare reuse without blocking the MVP.

Tasks:

- Align replay envelope shape and hash conventions with OpenBoard.
- Define which OpenCards APIs are stable enough for adapters.
- Document how a board game could embed an OpenCards deck/hand/effect subsystem.
- Keep OpenCards independent until card-specific contracts settle.

Exit criteria:

- OpenBoard could consume OpenCards card definitions via a documented adapter path.
- Shared conventions exist for ids, hashes, replay envelopes and asset references.

## First Sprint

Concrete, in order:

1. Land ADR-0001 and ADR-0002. Clean up "Codex" references in product docs. (~30 min)
2. Phase 0: workspace, strict TS, vitest, scripts, sentinel tests. (~2 h)
3. Phase 1, thin slice: core types, RNG, deterministic shuffle, stable hash, dispatcher skeleton, one scripted replay test that asserts the final hash. (~1 day)

The sprint deliberately stops before effects and UI. The win is making determinism real and tested before any card knows it exists.

## Key Risks

- Scope creep into a universal TCG rules language before Ember Duel proves the loop.
- Hidden information leaking through devtools, logs or replay views.
- DSL drift between documents (already happened once; ADR-0002 fixes it).
- UI outpacing legal-command generation. If a button exists without a backing legal command, that is the bug.
- The editor accidentally becoming a second rules engine.
- Timing/priority rules growing complex before any card requires them.

## MVP Definition Of Done

- Ember Duel plays to completion locally.
- Bot-vs-bot simulation completes and verifies through replay.
- All card/deck/format JSON passes schema and runtime validation.
- The basic editor can alter card/deck data and the changed match still verifies.
- Hidden information is correctly projected and tested against leakage.
- Replay export/import round-trips.
- `npm run verify:mvp` runs tests, validation, simulation and browser smoke checks, and is green.
