import { describe, expect, it } from 'vitest';
import { simulateMatch } from '@opencards/ai';
import { startMatch, viewMatch, type PlayerId } from '@opencards/core';
import {
  AOE_CARDS,
  AOE_RULESET,
  BRITON_STARTER_DECK,
  FRANK_STARTER_DECK,
  createAoeCcgSetup,
  createAoeTutorialSetup,
} from './index.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;

describe('AoE CCG ruleset', () => {
  it('defines the Age of Empires pacing profile', () => {
    expect(AOE_RULESET.id).toBe('aoe-ccg');
    expect(AOE_RULESET.phases).toEqual(['start', 'main', 'combat', 'end']);
    expect(AOE_RULESET.battlefieldLimit).toBe(6);
    expect(AOE_RULESET.handLimit).toBe(8);
    expect(AOE_RULESET.energy).toEqual({ gainPerTurn: 1, maximum: 12, refillAtTurnStart: true });
    expect(AOE_RULESET.fatigue).toEqual({ enabled: true, firstDamage: 1, increment: 1 });
  });

  it('ships 22 cards and 24-card starter decks with at most two copies', () => {
    expect(AOE_CARDS).toHaveLength(22);
    expect(BRITON_STARTER_DECK).toHaveLength(24);
    expect(FRANK_STARTER_DECK).toHaveLength(24);
    const count = (deck: readonly string[], kind: string) =>
      deck.filter((candidate) => candidate === kind).length;
    for (const kind of new Set(BRITON_STARTER_DECK)) {
      expect(count(BRITON_STARTER_DECK, kind)).toBeLessThanOrEqual(2);
    }
    for (const kind of new Set(FRANK_STARTER_DECK)) {
      expect(count(FRANK_STARTER_DECK, kind)).toBeLessThanOrEqual(2);
    }
  });

  it('every card kind in a starter deck has a definition', () => {
    const defined = new Set(AOE_CARDS.map((card) => card.kind));
    for (const kind of [...BRITON_STARTER_DECK, ...FRANK_STARTER_DECK]) {
      expect(defined.has(kind)).toBe(true);
    }
  });

  it('starts with a 30-health Town Center and a 4-card opening hand', () => {
    const setup = createAoeCcgSetup(5, [p1, p2]);
    const started = startMatch(setup);
    const view = viewMatch(started.handles[p1]!);
    expect(view.phase).toBe('start');
    expect(view.viewer.base).toBe(30);
    expect(view.viewer.hand).toHaveLength(4);
  });

  it('rejects non-two-player setup', () => {
    expect(() => createAoeCcgSetup(5, [p1])).toThrow('exactly two players');
  });
});

describe('AoE CCG match integrity', () => {
  it.each([1, 7, 42, 90210])('plays a seed %d match to a winner', (seed) => {
    const result = simulateMatch(createAoeCcgSetup(seed, [p1, p2]));
    expect(result.capped).toBe(false);
    expect(result.winner).not.toBeNull();
  });

  it('is deterministic: the same seed always yields the same winner', () => {
    const first = simulateMatch(createAoeCcgSetup(99, [p1, p2]));
    const second = simulateMatch(createAoeCcgSetup(99, [p1, p2]));
    expect(first.winner).toBe(second.winner);
  });
});

describe('AoE CCG tutorials', () => {
  it('builds a scenario for every tutorial id', () => {
    for (const id of ['villagers-job', 'charge', 'fletching', 'advance', 'wonder']) {
      const setup = createAoeTutorialSetup(id, [p1, p2]);
      expect(setup).toMatchObject({ baseTotal: 30 });
      expect(setup.scenario).toBeDefined();
    }
  });

  it('rejects unknown tutorials and bad player counts', () => {
    expect(() => createAoeTutorialSetup('nope', [p1, p2])).toThrow('Unknown AoE CCG tutorial');
    expect(() => createAoeTutorialSetup('wonder', [p1])).toThrow('exactly two players');
  });
});
