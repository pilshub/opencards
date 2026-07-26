import { describe, expect, it } from 'vitest';
import { ISSUE_CODES } from './index.js';
import { cardDefinitionToSpec, validateCardDefinition } from './card-definition.js';

const foundryUnit = {
  kind: 'ember-sentinel',
  name: 'Ember Sentinel',
  type: 'unit',
  faction: 'ember',
  text: 'Guard. On death, deal 1 damage to the enemy base.',
  cost: { energy: 2 },
  stats: { attack: 2, health: 3 },
  effects: [],
  keywords: ['guard', 'shield'],
  abilities: [
    {
      trigger: 'onDeath',
      effects: [{ op: 'dealDamage', amount: 1, target: 'enemyBase' }],
    },
  ],
} as const;

describe('Foundry card contract', () => {
  it('accepts factions, text, semantic keywords, and triggered abilities', () => {
    expect(validateCardDefinition(foundryUnit)).toEqual({ ok: true, issues: [] });
  });

  it('rejects unknown and duplicate keywords', () => {
    const result = validateCardDefinition({
      ...foundryUnit,
      keywords: ['guard', 'guard', 'flying'],
    });
    expect(result.issues).toContainEqual({
      code: ISSUE_CODES.INVALID_KEYWORD,
      message: 'keywords must contain unique built-in semantic ids',
    });
  });

  it('rejects malformed ability roots and trigger names', () => {
    const malformed = validateCardDefinition({ ...foundryUnit, abilities: ['bad'] });
    const trigger = validateCardDefinition({
      ...foundryUnit,
      abilities: [{ trigger: 'whenever', effects: [] }],
    });
    expect(malformed.issues[0]?.code).toBe(ISSUE_CODES.INVALID_ABILITY_TRIGGER);
    expect(trigger.issues[0]?.code).toBe(ISSUE_CODES.INVALID_ABILITY_TRIGGER);
  });

  it('validates nested ability effect operations, targets, and amounts', () => {
    const result = validateCardDefinition({
      ...foundryUnit,
      abilities: [
        {
          trigger: 'onPlay',
          effects: [{ op: 'unknown', amount: -1, target: 'moon' }],
        },
      ],
    });
    expect(result.issues.map((issue) => issue.code)).toEqual([
      ISSUE_CODES.UNKNOWN_EFFECT_OP,
      ISSUE_CODES.UNKNOWN_TARGET_SELECTOR,
      ISSUE_CODES.INVALID_EFFECT_AMOUNT,
    ]);
  });

  it('rejects non-array ability collections', () => {
    const result = validateCardDefinition({ ...foundryUnit, abilities: {} });
    expect(result.issues[0]?.code).toBe(ISSUE_CODES.INVALID_ABILITY_TRIGGER);
  });

  it('preserves conditions and nested advanced parameters in the engine spec', () => {
    const spec = cardDefinitionToSpec({
      ...foundryUnit,
      abilities: [
        {
          trigger: 'onPlay',
          conditions: [
            {
              subject: 'controller',
              metric: 'counter',
              operator: 'gte',
              value: 2,
              counter: 'heat',
            },
          ],
          effects: [
            {
              op: 'setSecret',
              trigger: 'onEnemyAttack',
              effects: [
                {
                  op: 'attach',
                  target: 'ownUnit',
                  kind: 'aegis',
                  attachmentType: 'equipment',
                  attack: 2,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(spec.abilities?.[0]?.conditions).toEqual([
      {
        subject: 'controller',
        metric: 'counter',
        operator: 'gte',
        value: 2,
        counter: 'heat',
      },
    ]);
    expect(spec.abilities?.[0]?.effects[0]).toEqual({
      op: 'setSecret',
      trigger: 'onEnemyAttack',
      effects: [
        {
          op: 'attach',
          target: 'ownUnit',
          kind: 'aegis',
          attachmentType: 'equipment',
          attack: 2,
        },
      ],
    });
  });
});
