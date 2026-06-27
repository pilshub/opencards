import { describe, expect, it } from 'vitest';
import type { CardKind, CardSpec, PlayerId } from './types.js';
import { hashState } from './hash.js';
import { createInitialState, type SetupOpts } from './setup.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const cardKinds: CardKind[] = ['unit-a', 'unit-b', 'unit-c'];

const opts = (seed: number): SetupOpts => ({
  seed,
  players: [p1, p2],
  deckSize: 12,
  openingHandSize: 4,
  cardKinds,
});

describe('createInitialState', () => {
  it('creates identical state hashes for the same seed and options', () => {
    expect(hashState(createInitialState(opts(42)))).toBe(hashState(createInitialState(opts(42))));
  });

  it('creates different state hashes for different seeds', () => {
    expect(hashState(createInitialState(opts(42)))).not.toBe(
      hashState(createInitialState(opts(43))),
    );
  });

  it('draws the configured opening hand size for each player', () => {
    const state = createInitialState(opts(7));
    expect(state.players[p1]?.hand).toHaveLength(4);
    expect(state.players[p2]?.hand).toHaveLength(4);
    expect(state.players[p1]?.deck).toHaveLength(8);
    expect(state.players[p2]?.deck).toHaveLength(8);
  });

  it('defaults base to 20, energy to 0, and winner to null', () => {
    const state = createInitialState(opts(7));

    expect(state.players[p1]?.base).toBe(20);
    expect(state.players[p1]?.energy).toBe(0);
    expect(state.players[p2]?.base).toBe(20);
    expect(state.players[p2]?.energy).toBe(0);
    expect(state.winner).toBeNull();
  });

  it('applies configured baseTotal and startingEnergy to each player', () => {
    const state = createInitialState({ ...opts(7), baseTotal: 30, startingEnergy: 3 });

    expect(state.players[p1]?.base).toBe(30);
    expect(state.players[p1]?.energy).toBe(3);
    expect(state.players[p2]?.base).toBe(30);
    expect(state.players[p2]?.energy).toBe(3);
    expect(state.winner).toBeNull();
  });

  it('rejects invalid setup inputs', () => {
    expect(() => createInitialState({ ...opts(1), players: [] })).toThrow(/at least one player/);
    expect(() => createInitialState({ ...opts(1), cardKinds: [] })).toThrow(/card kind/);
    expect(() => createInitialState({ ...opts(1), openingHandSize: 13 })).toThrow(/valid deck/);
  });

  it('indexes opts.cards into State.cards by kind', () => {
    const specs: CardSpec[] = [
      { kind: 'unit-a' as CardKind, type: 'unit', cost: 2, attack: 3, health: 4 },
      { kind: 'tactic-a' as CardKind, type: 'tactic', cost: 1 },
    ];
    const state = createInitialState({ ...opts(42), cards: specs });

    expect(state.cards['unit-a']).toEqual(specs[0]);
    expect(state.cards['tactic-a']).toEqual(specs[1]);
    expect(Object.keys(state.cards).sort()).toEqual(['tactic-a', 'unit-a']);
  });

  it('sets State.cards to empty object when opts.cards is omitted', () => {
    const state = createInitialState(opts(42));
    expect(state.cards).toEqual({});
  });
});
