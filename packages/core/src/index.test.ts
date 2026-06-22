import { describe, expect, it } from 'vitest';
import * as core from './index.js';
import type { CardKind, PlayerId, SetupOpts } from './index.js';
import {
  CORE_VERSION,
  applyCommand,
  fisherYates,
  hashState,
  nextRangeRng,
  nextRng,
  seedRng,
  startMatch,
  viewMatch,
} from './index.js';

describe('@opencards/core public API', () => {
  it('exposes a semver package version', () => {
    expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('supports deterministic setup, command and view through the package surface', () => {
    const p1 = 'p1' as PlayerId;
    const p2 = 'p2' as PlayerId;
    const cardKinds: CardKind[] = ['unit-a', 'unit-b'];
    const setupOpts: SetupOpts = {
      seed: 11,
      players: [p1, p2],
      deckSize: 4,
      openingHandSize: 1,
      cardKinds,
    };

    const started = startMatch(setupOpts);
    const applied = applyCommand(started.handles[p1]!, { type: 'drawCard', player: p1 });
    const view = viewMatch(applied.handle);

    expect(Object.hasOwn(applied, 'events')).toBe(false);
    expect(Object.hasOwn(applied, 'views')).toBe(false);
    expect(view.opponents[p2]?.deck).toEqual({ count: 3 });
    expect(hashState(view)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('exports deterministic utility helpers', () => {
    const rng = seedRng(5);
    const [next, value] = nextRng(rng);
    const [, ranged] = nextRangeRng(next, 0, 10);
    const [shuffled] = fisherYates(['a', 'b'], rng);

    expect(value).toBeGreaterThan(0);
    expect(ranged).toBeGreaterThanOrEqual(0);
    expect(ranged).toBeLessThan(10);
    expect([...shuffled].sort()).toEqual(['a', 'b']);
  });

  it('does not export raw state APIs from the root facade', () => {
    expect(Object.hasOwn(core, 'createInitialState')).toBe(false);
    expect(Object.hasOwn(core, 'apply')).toBe(false);
    expect(Object.hasOwn(core, 'replay')).toBe(false);
    expect(Object.hasOwn(core, 'computeReplayHash')).toBe(false);
    expect(Object.hasOwn(core, 'getView')).toBe(false);
    expect(Object.hasOwn(core, 'Event')).toBe(false);
  });
});
