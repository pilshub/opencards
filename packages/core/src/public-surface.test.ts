import { describe, expect, it } from 'vitest';
import * as core from './index.js';

const stableRuntimeExports = [
  'CORE_VERSION',
  'CLASSIC_RULESET',
  'FOUNDRY_RULESET',
  'applyCommand',
  'canonicalJson',
  'defineRuleset',
  'fisherYates',
  'hashState',
  'legalCommands',
  'nextRangeRng',
  'nextRng',
  'replayEnvelope',
  'seedRng',
  'startMatch',
  'viewMatch',
] as const;

describe('@opencards/core stable public surface', () => {
  it('matches the documented root runtime export allow-list', () => {
    expect(Object.keys(core).sort()).toEqual([...stableRuntimeExports].sort());
  });
});
