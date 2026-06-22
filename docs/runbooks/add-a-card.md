# Runbook: Add a card

**Status:** TBD. Phase 2 writes the data contract; Phase 4 closes the loop with the effect engine. This runbook will document the data-only workflow once those phases ship.

Expected outline (to be filled in):

1. Add the card definition to the active card database JSON.
2. Run schema validation (`npm run test --workspace=@opencards/schema`).
3. Run the runtime validator with the deck the card belongs to.
4. Add or update a replay fixture if behavior changed.
5. Confirm `npm run check` is green.
