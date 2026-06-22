# Runbook: Add a turn phase

**Status:** TBD. Phase 3 ships `start → main → combat → end`. This runbook will document how to safely extend that sequence.

Expected outline (to be filled in):

1. Add the phase to the `Phase` union in `@opencards/core`.
2. Update legal-command generation so each command opts in to the phases it is legal in.
3. Update the dispatcher's phase-transition table.
4. Add tests asserting illegal commands in the new phase are rejected with stable issue codes.
5. Update or add a replay fixture exercising the new phase.
6. Confirm `npm run check` is green.
