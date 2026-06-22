# Runbook: Debug a replay-mismatch

**Status:** TBD. The full workflow lands with Phase 7. Skeleton below.

Expected outline (to be filled in):

1. Reproduce locally with the failing seed: `npm run verify:replay -- --seed=<N> --fixture=<path>`.
2. Diff the recorded `finalStateHash` against the recomputed one.
3. Bisect: run the fixture up to command `i` and compare projected views.
4. Identify whether the mismatch came from card-data changes, RNG changes, or interpreter changes.
5. Decide: bump the fixture (intentional change, recorded in commit) or fix the regression.
6. Confirm `npm run check` is green.
