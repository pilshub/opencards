# OpenCards Foundry Goal

## Objective

Ship a reusable deterministic card-game platform and prove it with a polished, complete reference game rather than a card-specific engine.

## Delivered Acceptance Criteria

- Configurable serializable rulesets, asymmetric decklists, and deterministic scenario setup.
- Declarative trigger/condition/target/effect card definitions with runtime validation.
- Player-safe projections, legal command generation, stable replay envelopes, and state hashes.
- Ember Duel: Foundry Set with 40 original cards, two factions, neutrals, and 20-card starters.
- Combat keywords, triggers, control statuses, stat changes, counters, tokens, attachments, secrets, discard, exile, resurrection, fatigue, area/random/adjacent effects, and choices.
- Playable Verdant AI and seeded batch balance simulation.
- Visual/JSON card creator, deck builder, format editor, persistence, and JSON import/export.
- Integrated rules and five deterministic playable lessons.
- Responsive React UI, browser E2E coverage, and one npm run verify:mvp gate.
- A second game, Quick Sparks, using a different ruleset without core changes.

## Product Boundary

The repository is a complete local reference game and creator foundation. Hosted accounts, online matchmaking, a marketplace, economy, and production card-art pipelines are separate product phases.
