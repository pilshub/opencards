import { describe, expect, it } from 'vitest';
import { seedRng } from '@opencards/core';
import type { CardDefinition } from './card-definition.js';
import { validateDecklist } from './decklist.js';
import { currentChoice, finalizeDecklist, isDraftComplete, pick, startDraft } from './draft.js';
import { DEFAULT_FORMAT } from './format.js';
import type { GameFormat } from './format.js';
import { ISSUE_CODES } from './index.js';

const pool: readonly CardDefinition[] = [
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
  {
    kind: 'cinder-wisp',
    name: 'Cinder Wisp',
    type: 'unit',
    cost: { energy: 0 },
    stats: { attack: 1, health: 1 },
    effects: [],
  },
  {
    kind: 'ashen-warden',
    name: 'Ashen Warden',
    type: 'unit',
    cost: { energy: 3 },
    stats: { attack: 3, health: 4 },
    effects: [],
  },
  {
    kind: 'sear-volley',
    name: 'Sear Volley',
    type: 'tactic',
    cost: { energy: 2 },
    effects: [{ op: 'dealDamage', amount: 3, target: 'enemyUnitOrBase' }],
  },
];

const triPool: readonly CardDefinition[] = pool.slice(0, 3);
const soloPool: readonly CardDefinition[] = [pool[0]!];

const tinyFormat: GameFormat = {
  name: 'Tiny',
  deckSize: 2,
  openingHandSize: 1,
  copyLimit: 1,
  baseTotal: 20,
  startingEnergy: 0,
};

/** Drive a draft to completion always picking the first offered option. */
function runFullDraft(
  seed: number,
  format: GameFormat,
  cards: readonly CardDefinition[],
): readonly string[] {
  let state = startDraft(seed, format, cards);
  while (!isDraftComplete(state)) {
    const choice = currentChoice(state);
    if (choice === null || choice.options.length === 0) {
      throw new Error(`unable to complete draft for seed ${seed}`);
    }
    state = pick(state, choice.options[0]!).state;
  }
  return finalizeDecklist(state);
}

describe('startDraft', () => {
  it('creates an empty draft with a seeded rng', () => {
    const state = startDraft(0, DEFAULT_FORMAT, pool);

    expect(state.format).toBe(DEFAULT_FORMAT);
    expect(state.pool).toBe(pool);
    expect(state.picks).toEqual([]);
    expect(state.rng).toEqual(seedRng(0));
  });
});

describe('currentChoice', () => {
  it('is pure and deterministic and offers 3 distinct kinds', () => {
    const state = startDraft(42, DEFAULT_FORMAT, pool);

    const first = currentChoice(state);
    const second = currentChoice(state);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.options).toEqual(second!.options);
    expect(first!.options).toHaveLength(3);
    expect(new Set(first!.options).size).toBe(3);
    expect(state.rng).toEqual(seedRng(42));
    expect(state.picks).toEqual([]);
  });

  it('returns fewer than 3 options when the eligible pool shrinks', () => {
    let state = startDraft(9, DEFAULT_FORMAT, triPool);
    for (let i = 0; i < 4; i++) {
      state = pick(state, 'spark-adept').state;
    }

    expect(currentChoice(state)!.options).toHaveLength(2);

    for (let i = 0; i < 4; i++) {
      state = pick(state, 'ember-guard').state;
    }

    const last = currentChoice(state)!;
    expect(last.options).toHaveLength(1);
    expect(last.options).toEqual(['flare-strike']);
  });

  it('returns an empty option set when the pool is exhausted before deckSize', () => {
    const state = pick(startDraft(1, tinyFormat, soloPool), 'spark-adept').state;

    const choice = currentChoice(state);

    expect(choice).not.toBeNull();
    expect(choice!.options).toEqual([]);
  });
});

describe('pick', () => {
  it('rejects a kind outside the current options without changing state', () => {
    const state = startDraft(7, DEFAULT_FORMAT, pool);
    const choice = currentChoice(state)!;
    const foreign = pool.map((card) => card.kind).find((kind) => !choice.options.includes(kind))!;

    const result = pick(state, foreign);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe(ISSUE_CODES.INVALID_DRAFT_PICK);
    expect(result.state).toEqual(state);
    expect(result.state.picks).toEqual(state.picks);
    expect(result.state.rng).toEqual(state.rng);
  });

  it('appends the kind, advances the rng, and offers a fresh choice', () => {
    const state = startDraft(7, DEFAULT_FORMAT, pool);
    const before = currentChoice(state)!;
    const picked = before.options[0]!;

    const result = pick(state, picked);

    expect(result.issues).toEqual([]);
    expect(result.state.picks).toEqual([picked]);
    expect(result.state.rng).not.toEqual(state.rng);
    expect(isDraftComplete(result.state)).toBe(false);

    const after = currentChoice(result.state)!;
    expect(after.options).toHaveLength(3);
    expect(after.options).not.toEqual(before.options);
  });

  it('excludes a kind once it reaches the copy limit', () => {
    let state = startDraft(3, DEFAULT_FORMAT, triPool);
    for (let i = 0; i < 4; i++) {
      state = pick(state, 'spark-adept').state;
    }

    const choice = currentChoice(state)!;

    expect(choice.options).toHaveLength(2);
    expect(choice.options).not.toContain('spark-adept');
  });

  it('rejects any pick once the draft is complete', () => {
    let state = startDraft(5, DEFAULT_FORMAT, triPool);
    for (let i = 0; i < 4; i++) {
      state = pick(state, 'spark-adept').state;
    }
    for (let i = 0; i < 4; i++) {
      state = pick(state, 'ember-guard').state;
    }
    for (let i = 0; i < 4; i++) {
      state = pick(state, 'flare-strike').state;
    }

    expect(isDraftComplete(state)).toBe(true);
    expect(currentChoice(state)).toBeNull();

    const result = pick(state, 'spark-adept');

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe(ISSUE_CODES.INVALID_DRAFT_PICK);
    expect(result.state).toEqual(state);
  });

  it('rejects any pick when the current options are empty', () => {
    const state = pick(startDraft(1, tinyFormat, soloPool), 'spark-adept').state;

    const result = pick(state, 'spark-adept');

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe(ISSUE_CODES.INVALID_DRAFT_PICK);
    expect(result.state).toEqual(state);
  });
});

describe('full draft', () => {
  it('produces valid decklists by construction across seeds that actually differ', () => {
    const decklists = [0, 1, 2].map((seed) => runFullDraft(seed, DEFAULT_FORMAT, pool));

    for (const decklist of decklists) {
      expect(decklist).toHaveLength(DEFAULT_FORMAT.deckSize);
      const result = validateDecklist(decklist, { format: DEFAULT_FORMAT, cards: pool });
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
    }

    const distinct = new Set(decklists.map((decklist) => JSON.stringify(decklist)));
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });

  it('replays the same seed and choices to an identical decklist', () => {
    expect(runFullDraft(0, DEFAULT_FORMAT, pool)).toEqual(runFullDraft(0, DEFAULT_FORMAT, pool));
  });
});

describe('pool handling', () => {
  it('dedupes duplicate kinds in the pool so options stay distinct', () => {
    const dupPool: readonly CardDefinition[] = [pool[0]!, pool[0]!, pool[1]!, pool[2]!];
    const state = startDraft(11, DEFAULT_FORMAT, dupPool);

    const choice = currentChoice(state)!;

    expect(choice.options).toHaveLength(3);
    expect(new Set(choice.options).size).toBe(3);
  });
});
