import { describe, expect, it } from 'vitest';
import { seedRng } from './rng.js';
import { fisherYates } from './shuffle.js';

describe('fisherYates', () => {
  it('returns the same permutation for the same seed', () => {
    const input = [1, 2, 3, 4, 5, 6];
    expect(fisherYates(input, seedRng(42))[0]).toEqual(fisherYates(input, seedRng(42))[0]);
  });

  it('returns a permutation without mutating the original input', () => {
    const input = [4, 1, 3, 2];
    const [shuffled] = fisherYates(input, seedRng(9));
    expect([...shuffled].sort()).toEqual([...input].sort());
    expect(input).toEqual([4, 1, 3, 2]);
  });

  it('handles an empty array', () => {
    expect(fisherYates([], seedRng(1))[0]).toEqual([]);
  });

  it('handles a single-item array', () => {
    expect(fisherYates(['only'], seedRng(1))[0]).toEqual(['only']);
  });
});
