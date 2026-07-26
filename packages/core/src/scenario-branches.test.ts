import { describe, expect, it } from 'vitest';
import { createInitialState, type SetupOpts } from './setup.js';
import type { PlayerId } from './types.js';

const p1 = 'p1' as PlayerId;
const base: SetupOpts = {
  seed: 1,
  players: [p1],
  deckSize: 1,
  openingHandSize: 0,
  cardKinds: ['unit'],
  cards: [{ kind: 'unit', type: 'unit', cost: 1, attack: 1, health: 1 }],
};

describe('scenario optional branches', () => {
  it('accepts an empty scenario contract', () => {
    const state = createInitialState({ ...base, scenario: {} });
    expect(state.players[p1]?.deck).toHaveLength(1);
  });

  it('ignores configuration for players outside the match', () => {
    const outsider = 'outsider' as PlayerId;
    const state = createInitialState({
      ...base,
      scenario: { players: { [outsider]: { base: 1 } } },
    });
    expect(state.players[p1]?.base).toBe(20);
  });
});
