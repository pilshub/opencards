import { describe, expect, it } from 'vitest';
import { PLANNED_POLICIES, isPlannedPolicy } from './index.js';

describe('@opencards/simulator planned policies', () => {
  it('lists the three roadmap-planned policies', () => {
    expect(new Set(PLANNED_POLICIES)).toEqual(
      new Set(['random-legal', 'greedy-damage', 'smoke-test']),
    );
  });

  it('isPlannedPolicy accepts a known policy label', () => {
    expect(isPlannedPolicy('greedy-damage')).toBe(true);
  });

  it('isPlannedPolicy rejects an unknown policy label', () => {
    expect(isPlannedPolicy('always-concede')).toBe(false);
  });
});
