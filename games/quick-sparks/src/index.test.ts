import { describe, expect, it } from 'vitest';
import { simulateMatch } from '@opencards/ai';
import { startMatch, viewMatch, type PlayerId } from '@opencards/core';
import {
  createQuickSparksSetup,
  QUICK_SPARKS_CARDS,
  QUICK_SPARKS_DECK,
  QUICK_SPARKS_RULESET,
} from './index.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;

describe('Quick Sparks portability proof', () => {
  it('uses a distinct three-phase, fixed-energy ruleset', () => {
    expect(QUICK_SPARKS_RULESET.phases).toEqual(['start', 'combat', 'main', 'end']);
    expect(QUICK_SPARKS_RULESET.battlefieldLimit).toBe(3);
    expect(QUICK_SPARKS_RULESET.energy.maximum).toBe(3);
  });

  it('starts without a draw phase and keeps the micro deck contract', () => {
    expect(QUICK_SPARKS_CARDS).toHaveLength(6);
    expect(QUICK_SPARKS_DECK).toHaveLength(8);
    const setup = createQuickSparksSetup(5, [p1, p2]);
    const started = startMatch(setup);
    const view = viewMatch(started.handles[p1]!);
    expect(view.phase).toBe('start');
    expect(view.viewer.base).toBe(10);
    expect(view.viewer.energy).toBe(3);
    expect(view.viewer.hand).toHaveLength(4);
  });

  it('plays to completion through the same public AI facade', () => {
    const result = simulateMatch(createQuickSparksSetup(17, [p1, p2]));
    expect(result.capped).toBe(false);
    expect(result.winner).not.toBeNull();
  });

  it('rejects unsupported player counts', () => {
    expect(() => createQuickSparksSetup(1, [p1])).toThrow('exactly two');
  });
});
