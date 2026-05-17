# OpenCards MVP Goal

## Objective

Build a focused card-game engine MVP that proves Codex can define cards, validate decks, simulate a full match, replay it deterministically and expose a basic browser editor/player.

## Acceptance Criteria

- deterministic match setup from seed;
- declarative card JSON;
- decklist validation;
- hand/deck/discard/battlefield/stack zones;
- legal command generation;
- simple effect DSL;
- hidden information projection;
- replay envelope with card/deck hashes;
- bot-vs-bot simulation;
- browser play surface;
- basic card/deck editor;
- documentation for adding a card and adding a format.

## Non-Goals

- full Magic/Yu-Gi-Oh compatibility;
- online ranked ladder;
- marketplace/economy;
- polished card art pipeline;
- every possible timing edge case.

## MVP Demo

**Ember Duel**:

- 2 players;
- 12-card starter decks;
- life/base total;
- energy resource;
- units and tactics;
- simple attack step;
- clear win condition.
