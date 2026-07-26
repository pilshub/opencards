# Runbook: Add A Card

Cards are data. A normal card addition must not modify packages/core.

1. Add a CardDefinition to the game package or create one in OpenCards Studio.
2. Use a stable lowercase kebab-case kind, a non-empty name, type, energy cost, and unit stats when applicable.
3. Compose behavior from effects, abilities, conditions, keywords, and target selectors.
4. Validate the database with validateCardDatabase.
5. Convert definitions through cardDefinitionToSpec; do not write a game-local partial mapper.
6. Add the card to a legal deck or export/import it through the Deck surface.
7. Add a focused behavior test for every new mechanic combination.
8. Run:

   npm test --workspace=@opencards/schema
   npm test --workspace=@opencards/core
   npm test --workspace=@opencards/ember-foundry
   npm run verify:mvp

If the card needs an operation that is not in V1_OPERATIONS, follow add-an-effect-op.md and add the operation generically with schema, engine, replay, hidden-information, and editor coverage.
