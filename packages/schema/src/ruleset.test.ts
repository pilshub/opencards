import { FOUNDRY_RULESET } from '@opencards/core';
import { describe, expect, it } from 'vitest';
import { ISSUE_CODES } from './index.js';
import { validateRuleset } from './ruleset.js';

describe('validateRuleset', () => {
  it('accepts the Foundry profile', () => {
    expect(validateRuleset(FOUNDRY_RULESET)).toEqual({ ok: true, issues: [] });
  });

  it('rejects non-object roots', () => {
    expect(validateRuleset(null).issues).toEqual([
      { code: ISSUE_CODES.INVALID_RULESET, message: 'ruleset must be an object' },
    ]);
  });

  it('collects independent identity, phase, limit, energy, and fatigue issues', () => {
    const result = validateRuleset({
      id: '',
      version: 0,
      phases: ['main', 'main', 'unknown'],
      startingPhase: 'start',
      battlefieldLimit: 0,
      handLimit: -1,
      energy: { gainPerTurn: -1, maximum: 0, refillAtTurnStart: 'yes' },
      fatigue: { enabled: 'yes', firstDamage: -1, increment: -1 },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      ISSUE_CODES.INVALID_RULESET,
      ISSUE_CODES.INVALID_RULESET,
      ISSUE_CODES.INVALID_PHASE_ORDER,
      ISSUE_CODES.INVALID_RULESET_LIMIT,
      ISSUE_CODES.INVALID_RULESET_LIMIT,
      ISSUE_CODES.INVALID_ENERGY_RULES,
      ISSUE_CODES.INVALID_FATIGUE_RULES,
    ]);
  });

  it('reports missing nested policies', () => {
    const result = validateRuleset({
      id: 'missing.policies',
      version: 1,
      phases: ['start'],
      startingPhase: 'start',
      battlefieldLimit: null,
      handLimit: null,
    });

    expect(result.issues.map((issue) => issue.code)).toEqual([
      ISSUE_CODES.INVALID_ENERGY_RULES,
      ISSUE_CODES.INVALID_FATIGUE_RULES,
    ]);
  });
});
