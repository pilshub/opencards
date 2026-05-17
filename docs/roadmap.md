# OpenCards Roadmap

## Phase 0: Foundation

- TypeScript workspace.
- Core command/event/replay skeleton.
- Card instance and zone model.
- JSON schema draft.
- Ember Duel sample data.

Exit: one scripted game can be replayed to the same hash.

## Phase 1: Effect Engine

- Costs and resources.
- Target selectors.
- Stack/effect queue.
- Basic operations: draw, move, damage, heal, summon.
- Runtime validator for card definitions.

Exit: starter decks can play a legal match through commands only.

## Phase 2: Browser Play

- Vite app.
- Hand/deck/discard/battlefield UI.
- Legal action buttons.
- Target selection.
- Event log.
- Replay import/export.

Exit: human can complete Ember Duel locally.

## Phase 3: Editor

- Card editor.
- Deck editor.
- Format validator.
- Import/export JSON.
- Bot simulation from edited cards.

Exit: a user can change a card and play the changed match without engine edits.

## Phase 4: Integration

- Shared replay ideas with OpenBoard.
- Optional embedding path for OpenBoard card-heavy games.
- Shared asset/id conventions.

Exit: OpenBoard can consume OpenCards-style card definitions or adapters.
