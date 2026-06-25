import { describe, it, expect } from 'vitest';
import { validateCardDefinition, validateCardDatabase } from './card-definition.js';
import { ISSUE_CODES } from './index.js';

const validUnit = {
  kind: 'ember-knight',
  name: 'Ember Knight',
  type: 'unit' as const,
  cost: { energy: 3 },
  stats: { attack: 2, health: 4 },
  effects: [],
};

const validTactic = {
  kind: 'fire-bolt',
  name: 'Fire Bolt',
  type: 'tactic' as const,
  cost: { energy: 2 },
  effects: [{ op: 'dealDamage', amount: 2, target: 'enemyUnitOrBase' }],
};

describe('validateCardDefinition', () => {
  it('valid unit → ok:true, no issues', () => {
    const result = validateCardDefinition(validUnit);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('valid tactic with dealDamage effect → ok:true', () => {
    const result = validateCardDefinition(validTactic);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('non-object input → ok:false', () => {
    const result = validateCardDefinition('not-an-object');
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_KIND)).toBe(true);
  });

  it('null input → ok:false, INVALID_KIND', () => {
    const result = validateCardDefinition(null);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_KIND)).toBe(true);
  });

  it('INVALID_KIND: uppercase kind', () => {
    const result = validateCardDefinition({ ...validUnit, kind: 'EmberKnight' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_KIND)).toBe(true);
  });

  it('EMPTY_NAME: whitespace-only name', () => {
    const result = validateCardDefinition({ ...validUnit, name: '   ' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.EMPTY_NAME)).toBe(true);
  });

  it('UNSUPPORTED_CARD_TYPE: type=spell', () => {
    const result = validateCardDefinition({ ...validUnit, type: 'spell' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.UNSUPPORTED_CARD_TYPE)).toBe(true);
  });

  it('INVALID_COST: energy -1', () => {
    const result = validateCardDefinition({ ...validUnit, cost: { energy: -1 } });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_COST)).toBe(true);
  });

  it('MISSING_UNIT_STATS: unit without stats', () => {
    const { stats: _stats, ...unitNoStats } = validUnit;
    const result = validateCardDefinition(unitNoStats);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.MISSING_UNIT_STATS)).toBe(true);
  });

  it('INVALID_STATS: health 0', () => {
    const result = validateCardDefinition({ ...validUnit, stats: { attack: 2, health: 0 } });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_STATS)).toBe(true);
  });

  it('UNEXPECTED_STATS: tactic with stats', () => {
    const result = validateCardDefinition({ ...validTactic, stats: { attack: 1, health: 1 } });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.UNEXPECTED_STATS)).toBe(true);
  });

  it('UNKNOWN_EFFECT_OP: op=teleport', () => {
    const result = validateCardDefinition({ ...validUnit, effects: [{ op: 'teleport' }] });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.UNKNOWN_EFFECT_OP)).toBe(true);
  });

  it('UNKNOWN_TARGET_SELECTOR: target=moon', () => {
    const result = validateCardDefinition({
      ...validUnit,
      effects: [{ op: 'dealDamage', target: 'moon' }],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.UNKNOWN_TARGET_SELECTOR)).toBe(true);
  });

  it('INVALID_EFFECT_AMOUNT: amount -1', () => {
    const result = validateCardDefinition({
      ...validUnit,
      effects: [{ op: 'dealDamage', amount: -1 }],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_EFFECT_AMOUNT)).toBe(true);
  });

  it('never throws on malformed effect entries and reports them', () => {
    for (const badEffect of [null, undefined, 42, 'nope', []]) {
      const run = () =>
        validateCardDefinition({
          kind: 'flare-strike',
          name: 'Flare Strike',
          type: 'tactic',
          cost: { energy: 1 },
          effects: [badEffect],
        });
      expect(run).not.toThrow();
      const result = run();
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === ISSUE_CODES.UNKNOWN_EFFECT_OP)).toBe(true);
    }
  });

  it('collects multiple issues in a single pass', () => {
    const result = validateCardDefinition({
      kind: 'BAD',
      name: '',
      type: 'spell',
      cost: { energy: -1 },
      effects: [],
    });
    expect(result.ok).toBe(false);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain(ISSUE_CODES.INVALID_KIND);
    expect(codes).toContain(ISSUE_CODES.EMPTY_NAME);
    expect(codes).toContain(ISSUE_CODES.UNSUPPORTED_CARD_TYPE);
    expect(codes).toContain(ISSUE_CODES.INVALID_COST);
  });
});

describe('validateCardDatabase', () => {
  it('valid list of two distinct cards → ok:true', () => {
    const result = validateCardDatabase([validUnit, validTactic]);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('non-array input → ok:false', () => {
    const result = validateCardDatabase({ notAnArray: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_KIND)).toBe(true);
  });

  it('duplicate kind → issues contains DUPLICATE_CARD_KIND', () => {
    const result = validateCardDatabase([validUnit, { ...validUnit, name: 'Ember Knight 2' }]);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.DUPLICATE_CARD_KIND)).toBe(true);
  });

  it('duplicate kind message includes the kind string', () => {
    const result = validateCardDatabase([validUnit, { ...validUnit, name: 'Ember Knight 2' }]);
    const dupIssue = result.issues.find((i) => i.code === ISSUE_CODES.DUPLICATE_CARD_KIND);
    expect(dupIssue?.message).toContain('ember-knight');
  });

  it('empty array → ok:true', () => {
    const result = validateCardDatabase([]);
    expect(result.ok).toBe(true);
  });
});
