# OpenCards

OpenCards is the card-game member of the Open\* engine family. It is planned as a deterministic engine, editor and simulator for games where cards are the primary object: duels, deckbuilders, drafting games, trick-taking games, expandable card games and card-driven board games.

OpenBoard already proves the shared pattern: commands, events, deterministic replay, declarative data, browser demo and editor-first workflows. OpenCards should go deeper on cards than OpenBoard does.

## Why This Exists

OpenBoard can handle cards inside a board game. OpenCards should own the hard card-game problems:

- deck construction and legality;
- card zones and visibility;
- timing windows and priority;
- effect resolution;
- stack/queue behavior;
- targeting;
- keywords and replacement effects;
- card text templating;
- deterministic bot simulation;
- replay and shareable match files.

## MVP Target

The MVP is a two-player browser demo with:

- declarative card definitions in JSON;
- a small starter deck format;
- deterministic setup, shuffle and draw;
- hand, deck, discard, exile and battlefield zones;
- command/event/replay core;
- simple effect DSL for damage, resource gain, draw, discard and summon;
- deck validator;
- basic card editor;
- bot-vs-bot simulation;
- browser play surface.

## Planned Repo Layout

```text
opencards/
  docs/
  examples/
    starter-deck.json
  packages/
    core/
    effects/
    schema/
    simulator/
    app/
```

## Relationship To OpenBoard

OpenCards should not replace OpenBoard. It should become a specialist engine that can later be embedded by OpenBoard for card-heavy board games.

Shared ideas:

- deterministic command dispatcher;
- replay envelopes;
- JSON Schema plus runtime validation;
- visual smoke tests;
- editor writes data, not rules.

Different emphasis:

- OpenBoard: spatial board/card/piece games.
- OpenCards: timing, zones, deck legality, card text and effect systems.

## Development Status

The current quality gate is `npm run check`; see [dev-system](docs/dev-system.md) and [ADR-0004](docs/adr/0004-dev-system-phase-0-deferrals-and-runner.md).
Phase 1 wires: typecheck, lint, format:check, test (per package via the Windows-safe runner from ADR-0003), verify:coverage-overall, verify:replay, verify:hidden-info.
`verify:mvp` remains deferred to Phase 7.
Live demo deploys from packages/app via Vercel; see README's Deploy section.

## Deploy

- Repo root is the Vercel project root.
- Build command: `npm run build:app`.
- Output: `packages/app/dist-web`.
- Node version: 22.6+ (matches engines.node).

## First Demo Candidate

Working title: **Ember Duel**.

Two players use small 12-card decks. Each turn they gain energy, play units or tactics, attack the opponent, and race to reduce the rival base to zero.

The demo is intentionally small but should prove card zones, targeting, deterministic draws, legal command generation and replay.
