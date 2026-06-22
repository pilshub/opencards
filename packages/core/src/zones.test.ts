import { describe, expect, it } from 'vitest';
import type { CardInstance, CardInstanceId, PlayerId, State } from './types.js';
import { seedRng } from './rng.js';
import { countZone, drawTop, findInstance, moveCard } from './zones.js';

const p1 = 'p1' as PlayerId;
const top: CardInstance = { id: 'p1-c00' as CardInstanceId, kind: 'unit-a' };
const bottom: CardInstance = { id: 'p1-c01' as CardInstanceId, kind: 'unit-b' };
const missing: CardInstance = { id: 'p1-c99' as CardInstanceId, kind: 'missing' };

const state = (): State => ({
  rng: seedRng(1),
  activePlayer: p1,
  phase: 'start',
  turn: 1,
  players: {
    [p1]: {
      id: p1,
      hand: [],
      deck: [top, bottom],
      discard: [],
      exile: [],
      battlefield: [],
    },
  },
});

describe('zones', () => {
  it('drawTop returns the first card and the remaining zone', () => {
    expect(drawTop([top, bottom])).toEqual({ instance: top, zone: [bottom] });
  });

  it('drawTop returns no instance for an empty zone', () => {
    expect(drawTop([])).toEqual({ zone: [] });
  });

  it('countZone returns the zone length', () => {
    expect(countZone([top, bottom])).toBe(2);
  });

  it('findInstance matches by stable id', () => {
    expect(findInstance([top], { ...top, kind: 'other-kind' })).toBe(top);
    expect(findInstance([top], missing)).toBeUndefined();
  });

  it('moveCard removes from the source and appends to the destination', () => {
    const result = moveCard(state(), top, 'deck', 'hand');
    expect(result.players[p1]?.deck).toEqual([bottom]);
    expect(result.players[p1]?.hand).toEqual([top]);
  });

  it('moveCard leaves state unchanged when the zone or instance cannot move', () => {
    const original = state();
    expect(moveCard(original, top, 'deck', 'deck')).toBe(original);
    expect(moveCard(original, missing, 'deck', 'hand')).toBe(original);
  });
});
