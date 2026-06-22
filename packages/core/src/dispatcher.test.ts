import { describe, expect, it } from 'vitest';
import type { CardInstanceId, Command, PlayerId, State } from './types.js';
import { apply } from './dispatcher.js';
import { seedRng } from './rng.js';

const p1 = 'p1' as PlayerId;
const unknown = 'missing' as PlayerId;

const baseState = (): State => ({
  rng: seedRng(1),
  activePlayer: p1,
  phase: 'start',
  turn: 1,
  players: {
    [p1]: {
      id: p1,
      hand: [],
      deck: [
        { id: 'p1-c00' as CardInstanceId, kind: 'unit-a' },
        { id: 'p1-c01' as CardInstanceId, kind: 'unit-b' },
      ],
      discard: [],
      exile: [],
      battlefield: [],
    },
  },
});

describe('apply', () => {
  it('returns UNKNOWN_COMMAND and leaves state unchanged for unrecognized command types', () => {
    const state = baseState();
    const result = apply(state, { type: 'noSuchCommand', player: p1 } as unknown as Command);

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'UNKNOWN_COMMAND', message: 'Unknown command type: noSuchCommand' },
    ]);
  });

  it('drawCard moves the top deck card to the bottom of hand and emits cardDrawn', () => {
    const state = baseState();
    const result = apply(state, { type: 'drawCard', player: p1 });

    expect(result.issues).toEqual([]);
    expect(result.events).toEqual([
      { type: 'cardDrawn', player: p1, instance: { id: 'p1-c00', kind: 'unit-a' } },
    ]);
    expect(result.state.players[p1]?.deck).toEqual([{ id: 'p1-c01', kind: 'unit-b' }]);
    expect(result.state.players[p1]?.hand).toEqual([{ id: 'p1-c00', kind: 'unit-a' }]);
    expect(state.players[p1]?.deck).toHaveLength(2);
  });

  it('returns EMPTY_DECK and leaves state unchanged when the deck is empty', () => {
    const state: State = {
      ...baseState(),
      players: { [p1]: { ...baseState().players[p1]!, deck: [] } },
    };
    const result = apply(state, { type: 'drawCard', player: p1 });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'EMPTY_DECK', message: 'Player has no cards to draw: p1' },
    ]);
  });

  it('returns UNKNOWN_PLAYER and leaves state unchanged when the player is missing', () => {
    const state = baseState();
    const result = apply(state, { type: 'drawCard', player: unknown });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([{ code: 'UNKNOWN_PLAYER', message: 'Unknown player: missing' }]);
  });
});
