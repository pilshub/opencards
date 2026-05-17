# OpenCards Roadmap

OpenCards is currently a planning scaffold. The first objective is not to build a universal trading-card rules engine; it is to prove a narrow, deterministic, editor-owned card-game loop with **Ember Duel**.

The MVP should demonstrate this invariant:

```text
card database hash + decklist hash + setup + seed + ordered commands = final state hash
```

## Current Read

- The repository has documentation, `examples/starter-deck.json`, and a root `package.json`.
- No TypeScript workspace, package implementations, tests, browser app, or CI-style verification scripts exist yet.
- The strongest reusable precedent is `open-board`: deterministic command dispatch, replay envelopes, runtime validation, browser demo, bot simulation, and visual smoke tests.
- OpenCards should borrow the OpenBoard engineering shape, but specialize its model around zones, visibility, timing, targeting, card definitions, deck legality, and effect resolution.

## Development Principles

- Determinism comes first: all setup, shuffle, draw, bot choices, replay and simulation must use seeded state.
- Commands are the only way to mutate game state.
- Events are durable facts used by logs, animation, analytics and replay.
- The editor writes data, not hidden rules.
- The effect DSL starts small and grows only when Ember Duel needs a new operation.
- Hidden information is a projection of canonical state, never a second state.
- Every milestone must add executable checks, not only more structure.

## MVP Product Target

The MVP is a local two-player browser demo for Ember Duel:

- 12-card starter decks.
- deterministic setup, shuffle and draw;
- hand, deck, discard, exile, battlefield and stack zones;
- base/life total and energy resource;
- unit and tactic cards;
- legal command generation;
- effect DSL for damage, resource gain, draw, discard, summon and card movement;
- deck/card validation;
- bot-vs-bot match simulation;
- replay export/import and verification;
- basic card and deck editor.

## Phase 0: Workspace Bootstrap

Goal: turn the planning scaffold into a working TypeScript monorepo.

Tasks:

- Add npm workspaces for `packages/core`, `packages/schema`, `packages/effects`, `packages/simulator` and `packages/app`.
- Add root TypeScript config, test runner setup and package exports.
- Add scripts for `typecheck`, `test`, `check`, `dev`, `build:app` and later `verify:mvp`.
- Create package placeholders with public `index.ts` files.
- Keep documentation in sync with the package boundaries.

Exit criteria:

- `npm run check` executes real TypeScript and test commands.
- A minimal core test imports from `packages/core`.
- The repo has a stable package layout that later phases can build on.

## Phase 1: Deterministic Core And Replay

Goal: create the engine kernel before implementing card-specific rules.

Tasks:

- Define core ids and state types: players, card kinds, card instances, zones, phase, turn, priority, resources, RNG and logs.
- Port/adapt the OpenBoard-style command dispatcher, validation result shape, replay helpers and stable hash helper.
- Add deterministic RNG and deterministic shuffle.
- Model zones as ordered collections with helpers for move, draw, reveal, mask and query.
- Add player-view projection for hidden hand/deck information.
- Add command and event ids that remain stable during replay.

Exit criteria:

- A scripted setup plus ordered commands replays to the same final hash.
- Invalid commands return structured validation issues.
- Hidden opponent cards are masked in player views without changing canonical state.
- Unit tests cover RNG, shuffle, replay, card movement and hidden information.

## Phase 2: Declarative Data And Validation

Goal: make card and deck data safe enough for an editor to own.

Tasks:

- Split the current `examples/starter-deck.json` into clearer card database, decklist and format concepts or document why they stay bundled for MVP.
- Add JSON Schema for card definitions, decklists, formats and replay envelopes.
- Add runtime validation for cross-field rules:
  - duplicate card ids/kinds;
  - unsupported card types;
  - invalid costs/resources;
  - invalid deck sizes/copy counts;
  - unknown effect operations;
  - target selector mismatches;
  - missing required stats for units;
  - unsupported timing windows.
- Add valid and invalid fixtures.

Exit criteria:

- The starter Ember Duel data validates through schema and runtime validation.
- Invalid fixtures fail with stable issue codes.
- Definition and decklist hashes are reproducible.

## Phase 3: Ember Duel Vertical Slice

Goal: create the first playable rules module with the smallest complete game loop.

Tasks:

- Define Ember Duel setup: two players, base total, starting energy, shuffled decks, opening hands and first active player.
- Implement phases: start, main, combat, end.
- Implement commands:
  - `playCard`;
  - `chooseTarget`;
  - `attack`;
  - `resolveStack`;
  - `endPhase`;
  - `endTurn`.
- Implement legal command generation for the active player.
- Implement unit state: attack, health, damage, exhausted/ready and summoning restrictions.
- Implement tactic resolution for `flare-strike`.
- Implement win condition.

Exit criteria:

- Starter decks can complete a legal match through commands only.
- Bot-vs-bot simulation reaches a winner.
- The final simulated state verifies through a replay envelope.
- Tests cover at least one full match and several illegal action cases.

## Phase 4: Effect Engine V1

Goal: move card behavior into a narrow declarative effect interpreter.

Initial operations:

- `gainResource`;
- `drawCards`;
- `dealDamage`;
- `heal`;
- `summonUnit`;
- `moveCard`;
- `discardCards`;
- `addCounter`;
- `modifyStatUntilEndOfTurn`.

Tasks:

- Define target selectors such as `self`, `ownUnit`, `enemyUnit`, `enemyBase`, `enemyUnitOrBase`, `anyUnit`.
- Add target validation before effects enter the stack.
- Add stack/effect queue state and deterministic resolution.
- Keep unsupported timing, replacement effects and triggered abilities out of MVP unless a sample card requires them.

Exit criteria:

- Ember Duel cards use declarative effects rather than bespoke per-card code.
- Every effect emits events that are readable by UI and replay logs.
- Adding a simple new card requires data changes plus validation, not engine edits.

## Phase 5: Browser Play And Replay Surface

Goal: expose the deterministic engine in a local app.

Tasks:

- Add a Vite app in `packages/app`.
- Render player base totals, energy, hand, deck count, discard, exile, battlefield, stack and event log.
- Show legal action controls generated from engine state.
- Add target selection flow for cards and attacks.
- Add replay export/import, verification status and step scrubbing.
- Add visual smoke tests with Playwright and pixel checks once the first UI exists.

Exit criteria:

- A human can complete Ember Duel locally in the browser.
- Replay import/export works from the browser.
- Player views do not reveal hidden opponent hand/deck identities.
- `npm run verify:app` builds and smoke-tests the UI.

## Phase 6: Basic Editor

Goal: prove the editor-owned data contract.

Tasks:

- Add card list and card detail editing.
- Add deck editor with copy counts and legality feedback.
- Add format/settings editor for deck size, copy limit, starting hand, base total and starting energy.
- Add import/export JSON.
- Store local edited definitions in browser storage for MVP.
- Let the play surface run against edited local definitions.

Exit criteria:

- A user can change a card, validate the definition and play the changed match without engine code edits.
- The replay envelope records the edited definition hash.
- Documentation explains how to add a card and a format.

## Phase 7: Simulator And QA Hardening

Goal: make regressions obvious and cheap to catch.

Tasks:

- Add deterministic bot policies: random legal, greedy damage, and smoke-test policy.
- Run many seeded matches and collect outcomes.
- Add replay fixtures for known matches.
- Add fuzz-like tests that only choose legal commands.
- Add `verify:mvp` to run schema validation, runtime validation, unit tests, simulations, app build and visual smoke.
- Document debugging workflows for failed replay hashes.

Exit criteria:

- `npm run verify:mvp` is the single confidence command.
- Bot simulations across a seed range are deterministic.
- Replay fixtures catch behavior drift.

## Phase 8: OpenBoard Integration Path

Goal: prepare reuse without blocking the MVP.

Tasks:

- Align replay envelope fields and hash conventions with OpenBoard where possible.
- Define which OpenCards APIs are stable enough for OpenBoard adapters.
- Document how a board game could embed an OpenCards deck, hand and effect subsystem.
- Keep OpenCards independent until its card-specific contracts settle.

Exit criteria:

- OpenBoard can consume OpenCards-style card definitions through a documented adapter path.
- Shared conventions exist for ids, hashes, replay envelopes and asset references.

## First Sprint

The next development sprint should focus on a thin executable spine:

1. Create the TypeScript workspace and `packages/core`.
2. Add core types, deterministic RNG, stable hash, dispatcher and replay helpers.
3. Add card instance and zone helpers.
4. Convert the starter data into a validated Ember Duel sample fixture.
5. Add the first replay test: setup, shuffle, draw, one or two scripted commands, final hash verification.
6. Add `npm run check` as a real quality gate.

This sprint deliberately stops before a full effect system or browser UI. The important win is making deterministic replay real as early as possible.

## Key Risks

- Scope creep into a universal TCG rules language before Ember Duel proves the loop.
- Hidden information leaking through browser state, logs or replay views.
- Replays becoming unverifiable when card data changes without clear hashes.
- Timing/priority rules becoming too complex before the sample card set needs them.
- The editor accidentally becoming a second rules engine.
- UI work outrunning legal-command generation and validation.

## MVP Definition Of Done

- Ember Duel can be played to completion locally.
- Bot-vs-bot simulation completes and verifies through replay.
- Card/deck/format JSON is schema-validated and runtime-validated.
- A basic editor can alter card/deck data and run the changed game.
- Hidden information is projected correctly.
- Replay export/import works.
- The full verification command runs tests, validation, simulation and browser smoke checks.
