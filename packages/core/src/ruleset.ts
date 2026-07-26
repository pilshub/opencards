import type { Ruleset } from './types.js';

/** Backwards-compatible profile matching the pre-ruleset engine behavior. */
export const CLASSIC_RULESET = Object.freeze({
  id: 'opencards.classic',
  version: 1,
  phases: ['start', 'main', 'combat', 'end'] as const,
  startingPhase: 'start',
  battlefieldLimit: null,
  handLimit: null,
  energy: {
    gainPerTurn: 1,
    maximum: null,
    refillAtTurnStart: false,
  },
  fatigue: {
    enabled: false,
    firstDamage: 1,
    increment: 1,
  },
}) satisfies Ruleset;

/** Digital battler profile used by Ember Duel: Foundry Set. */
export const FOUNDRY_RULESET = Object.freeze({
  id: 'opencards.ember-foundry',
  version: 1,
  phases: ['start', 'main', 'combat', 'end'] as const,
  startingPhase: 'start',
  battlefieldLimit: 5,
  handLimit: 10,
  energy: {
    gainPerTurn: 1,
    maximum: 10,
    refillAtTurnStart: true,
  },
  fatigue: {
    enabled: true,
    firstDamage: 1,
    increment: 1,
  },
}) satisfies Ruleset;

/** Validate and freeze a creator-supplied deterministic rules profile. */
export function defineRuleset(ruleset: Ruleset): Ruleset {
  if (ruleset.id.trim() === '') {
    throw new Error('defineRuleset requires a non-empty id');
  }
  if (!Number.isInteger(ruleset.version) || ruleset.version < 1) {
    throw new Error('defineRuleset requires a positive integer version');
  }
  if (ruleset.phases.length === 0 || !ruleset.phases.includes(ruleset.startingPhase)) {
    throw new Error('defineRuleset requires phases containing startingPhase');
  }
  validateNullableLimit(ruleset.battlefieldLimit, 'battlefieldLimit');
  validateNullableLimit(ruleset.handLimit, 'handLimit');
  if (!Number.isInteger(ruleset.energy.gainPerTurn) || ruleset.energy.gainPerTurn < 0) {
    throw new Error('defineRuleset requires energy.gainPerTurn >= 0');
  }
  validateNullableLimit(ruleset.energy.maximum, 'energy.maximum');
  if (
    !Number.isInteger(ruleset.fatigue.firstDamage) ||
    ruleset.fatigue.firstDamage < 0 ||
    !Number.isInteger(ruleset.fatigue.increment) ||
    ruleset.fatigue.increment < 0
  ) {
    throw new Error('defineRuleset requires non-negative fatigue damage values');
  }

  return Object.freeze({
    ...ruleset,
    phases: Object.freeze([...ruleset.phases]),
    energy: Object.freeze({ ...ruleset.energy }),
    fatigue: Object.freeze({ ...ruleset.fatigue }),
  });
}

function validateNullableLimit(value: number | null, label: string): void {
  if (value !== null && (!Number.isInteger(value) || value < 1)) {
    throw new Error(`defineRuleset requires ${label} to be null or a positive integer`);
  }
}
