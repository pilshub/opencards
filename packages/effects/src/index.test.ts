import { describe, expect, it } from 'vitest';
import {
  ABILITY_TRIGGERS,
  BUILTIN_KEYWORDS,
  V1_OPERATIONS,
  isAbilityTrigger,
  isBuiltinKeyword,
  isV1Operation,
} from './index.js';

describe('@opencards/effects v1 operation set', () => {
  it('matches the complete declarative operation set', () => {
    expect(V1_OPERATIONS).toHaveLength(21);
    expect(new Set(V1_OPERATIONS)).toEqual(
      new Set([
        'gainResource',
        'drawCards',
        'dealDamage',
        'heal',
        'summonUnit',
        'moveCard',
        'discardCards',
        'addCounter',
        'modifyStatUntilEndOfTurn',
        'modifyStat',
        'applyStatus',
        'silence',
        'addKeyword',
        'removeKeyword',
        'attach',
        'setSecret',
        'resurrectUnit',
        'damageAll',
        'damageAdjacent',
        'randomDamage',
        'chooseOne',
      ]),
    );
  });

  it('isV1Operation accepts canonical names', () => {
    expect(isV1Operation('dealDamage')).toBe(true);
  });

  it('isV1Operation rejects unknown names', () => {
    expect(isV1Operation('teleportToMoon')).toBe(false);
  });
});

describe('Foundry semantic vocabulary', () => {
  it('publishes the reusable combat keywords', () => {
    expect(BUILTIN_KEYWORDS).toEqual([
      'guard',
      'haste',
      'charge',
      'rush',
      'shield',
      'lifesteal',
      'poisonous',
      'stealth',
    ]);
    expect(isBuiltinKeyword('guard')).toBe(true);
    expect(isBuiltinKeyword('flying')).toBe(false);
  });

  it('publishes deterministic ability triggers', () => {
    expect(ABILITY_TRIGGERS).toEqual([
      'onPlay',
      'onDeath',
      'onAttack',
      'turnStart',
      'turnEnd',
      'onEnemyPlay',
      'onEnemyAttack',
      'onFriendlyDeath',
    ]);
    expect(isAbilityTrigger('onDeath')).toBe(true);
    expect(isAbilityTrigger('whenever')).toBe(false);
  });
});
