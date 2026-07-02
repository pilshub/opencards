import { describe, expect, it } from 'vitest';
import type { CardDefinition } from './card-definition.js';
import { hashDecklist, validateDecklist } from './decklist.js';
import { DEFAULT_FORMAT } from './format.js';
import { ISSUE_CODES } from './index.js';

const cards: readonly CardDefinition[] = [
  {
    kind: 'spark-adept',
    name: 'Spark Adept',
    type: 'unit',
    cost: { energy: 1 },
    stats: { attack: 1, health: 2 },
    effects: [],
  },
  {
    kind: 'ember-guard',
    name: 'Ember Guard',
    type: 'unit',
    cost: { energy: 2 },
    stats: { attack: 2, health: 3 },
    effects: [],
  },
  {
    kind: 'flare-strike',
    name: 'Flare Strike',
    type: 'tactic',
    cost: { energy: 1 },
    effects: [{ op: 'dealDamage', amount: 2, target: 'enemyUnitOrBase' }],
  },
];

describe('validateDecklist', () => {
  it('accepts a valid decklist for the active format and card pool', () => {
    const decklist = [
      'spark-adept',
      'spark-adept',
      'spark-adept',
      'spark-adept',
      'ember-guard',
      'ember-guard',
      'ember-guard',
      'ember-guard',
      'flare-strike',
      'flare-strike',
      'flare-strike',
      'flare-strike',
    ];

    const result = validateDecklist(decklist, { format: DEFAULT_FORMAT, cards });

    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('emits INVALID_DECK_SIZE for non-array input', () => {
    const result = validateDecklist('spark-adept', { format: DEFAULT_FORMAT, cards });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === ISSUE_CODES.INVALID_DECK_SIZE)).toBe(true);
  });

  it('emits INVALID_DECK_SIZE for the wrong deck size', () => {
    const result = validateDecklist(['spark-adept'], { format: DEFAULT_FORMAT, cards });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === ISSUE_CODES.INVALID_DECK_SIZE)).toBe(true);
  });

  it('emits COPY_LIMIT_EXCEEDED when one kind has too many copies', () => {
    const result = validateDecklist(Array(12).fill('spark-adept'), {
      format: DEFAULT_FORMAT,
      cards,
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === ISSUE_CODES.COPY_LIMIT_EXCEEDED)).toBe(
      true,
    );
  });

  it('emits UNKNOWN_CARD_KIND for missing or malformed kinds', () => {
    const result = validateDecklist(
      [
        'spark-adept',
        'spark-adept',
        'spark-adept',
        'spark-adept',
        'ember-guard',
        'ember-guard',
        'ember-guard',
        'ember-guard',
        'flare-strike',
        'flare-strike',
        'unknown-card',
        42,
      ],
      { format: DEFAULT_FORMAT, cards },
    );

    expect(result.ok).toBe(false);
    expect(
      result.issues.filter((issue) => issue.code === ISSUE_CODES.UNKNOWN_CARD_KIND),
    ).toHaveLength(2);
  });
});

describe('hashDecklist', () => {
  it('is stable and order-sensitive', () => {
    const left = ['spark-adept', 'ember-guard', 'flare-strike'];
    const right = ['ember-guard', 'spark-adept', 'flare-strike'];

    expect(hashDecklist(left)).toBe(hashDecklist(left));
    expect(hashDecklist(left)).not.toBe(hashDecklist(right));
  });
});
