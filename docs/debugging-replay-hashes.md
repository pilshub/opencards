# Debugging Replay Hashes

Use this workflow when `npm run verify:replay` reports a fixture hash mismatch.

1. Reproduce the mismatch from a clean build.

   ```powershell
   npm run typecheck
   npm run verify:replay
   ```

2. Identify the failing fixture and seed from the verifier output. The verifier prints the
   fixture name, seed, expected hash, actual hash, and any engine issues returned by replay.

3. Dump the canonical final state for the fixture.

   ```powershell
   node --input-type=module -e "import { readFile } from 'node:fs/promises'; import { replay } from '@opencards/core/internal'; import { canonicalJson } from '@opencards/core'; const f = JSON.parse(await readFile('packages/simulator/fixtures/replays/<fixture>.json','utf8')); const r = replay(f); console.log(canonicalJson(r.state));"
   ```

   Canonical JSON uses sorted object keys, so diffs are stable across platforms.

4. Bisect the command list by replaying prefixes. Replace `N` with a command count near the
   middle, compare the prefix hash against a known-good run, then narrow until the first divergent
   command is isolated.

   ```powershell
   node --input-type=module -e "import { readFile } from 'node:fs/promises'; import { computeReplayHash } from '@opencards/core/internal'; const f = JSON.parse(await readFile('packages/simulator/fixtures/replays/<fixture>.json','utf8')); const prefix = { ...f, commands: f.commands.slice(0, N), finalStateHash: '' }; console.log(computeReplayHash(prefix));"
   ```

5. Compare per-command hashes around the divergent command.

   ```powershell
   node --input-type=module -e "import { readFile } from 'node:fs/promises'; import { apply, createInitialState } from '@opencards/core/internal'; import { hashState } from '@opencards/core'; const f = JSON.parse(await readFile('packages/simulator/fixtures/replays/<fixture>.json','utf8')); let s = createInitialState({ ...f.setupOpts, seed: f.seed }); console.log(0, hashState(s)); for (const [i,c] of f.commands.entries()) { const r = apply(s,c); if (r.issues.length) throw new Error(JSON.stringify(r.issues)); s = r.state; console.log(i + 1, c.type, hashState(s)); }"
   ```

6. Classify the cause before editing anything.
   - Fixture drift: card data, setup options, or intended rules changed. Regenerate the fixture and
     record why the new hash is expected.
   - Engine regression: an unintended state transition changed. Fix the engine or the caller that
     emitted the command.
   - RNG drift: setup shuffling or simulator bot-choice seeding changed. Confirm the seed and command
     list are still produced by the expected policy.

7. Confirm the repair.

   ```powershell
   npm run verify:replay
   npm run check
   ```
