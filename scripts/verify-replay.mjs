#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replayEnvelope } from '@opencards/core';
import { computeReplayHash } from '@opencards/core/internal';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '..', 'packages', 'simulator', 'fixtures', 'replays');

const fail = (message) => {
  console.error(`[verify:replay] ${message}`);
  process.exit(1);
};

const fixtureNames = (await readdir(fixturesDir).catch(() => []))
  .filter((name) => name.endsWith('.json'))
  .sort();

if (fixtureNames.length === 0) {
  fail(`no replay fixtures found in ${fixturesDir}`);
}

let verified = 0;
const expected = fixtureNames.length * 100;

for (const fixtureName of fixtureNames) {
  const fixturePath = resolve(fixturesDir, fixtureName);
  const envelope = JSON.parse(await readFile(fixturePath, 'utf8'));
  const result = replayEnvelope(envelope);

  if (result.ok !== true) {
    fail(
      `fixture ${fixtureName}, own seed: expected ${result.expected}, got ${
        result.hash
      }; issues ${JSON.stringify(result.issues)}`,
    );
  }

  for (let seed = 0; seed < 100; seed += 1) {
    const draft = {
      ...envelope,
      seed,
      setupOpts: { ...envelope.setupOpts, seed },
      finalStateHash: '',
    };
    const expectedHash = computeReplayHash(draft);
    const seededEnvelope = { ...draft, finalStateHash: expectedHash };
    const seededResult = replayEnvelope(seededEnvelope);

    if (seededResult.ok !== true) {
      fail(
        `fixture ${fixtureName}, seed ${seed}: expected ${seededResult.expected}, got ${
          seededResult.hash
        }; issues ${JSON.stringify(seededResult.issues)}`,
      );
    }

    verified += 1;
  }
}

console.log(
  `replay matrix: ${verified}/${expected} seeds verified across ${fixtureNames.length} fixture(s)`,
);
