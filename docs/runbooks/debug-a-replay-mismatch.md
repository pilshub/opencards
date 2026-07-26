# Runbook: Debug A Replay Mismatch

1. Reproduce with npm run verify:replay and record the failing fixture, seed, command index, expected hash, and actual hash.
2. Replay only that envelope through replayEnvelope; do not inspect UI-derived state.
3. Compare setupOpts first: cards, decklists, ruleset, scenario, seed, and player order are all hash inputs.
4. Apply commands one at a time and compare canonical hashes to locate the first divergent transition.
5. Inspect emitted events and RNG state at that transition. Never replace seeded randomness with Math.random.
6. Confirm nested effects, choices, secrets, and triggered abilities were converted through cardDefinitionToSpec.
7. If behavior intentionally changed, update the reviewed fixture and explain the contract change. Do not merely overwrite expected hashes.
8. Run npm run verify:hidden-info and npm run verify:mvp before merging.
