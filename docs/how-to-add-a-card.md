# How to Add a Card

This walkthrough uses the local editor flow added in Phase 6.

1. Open the app and select **Create**.
2. Fill in the card kind, name, type, cost, stats, and any effects. The card can be saved only when the validator reports a valid definition.
3. Select **Deck**. The available pool includes built-in cards plus saved custom cards.
4. Add copies until the deck reaches the active format size without exceeding the copy limit. The deck legality chip shows `ok` only when the saved deck is legal.
5. Select **Play** and start a new game. A legal saved deck is passed into the engine as `setupOpts.decklist`, so both hot-seat players use that exact decklist.
6. Play the match, then select **Export envelope**. The replay envelope includes `setupOpts.cards` and `setupOpts.decklist`; replay verification rebuilds the same card database and deck before checking the final hash.
7. Paste the exported envelope into the replay verifier and select **Verify**. A valid edited-card match should verify with `ok: true`.

Use the Deck editor JSON panel to export or import saved cards, the decklist, and the active format. Imports are validated before they are written to localStorage.
