import { describe, expect, it } from 'vitest';
import { V1_OPERATIONS, isV1Operation } from './index.js';

describe('@opencards/effects v1 operation set', () => {
  it('matches ADR-0002 (9 operations, exact set)', () => {
    expect(V1_OPERATIONS).toHaveLength(9);
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
