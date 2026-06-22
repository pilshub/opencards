import type { RNGState } from './types.js';

const ZERO_SEED_REPLACEMENT = 0x9e3779b9;

/** Create a non-zero xorshift32 RNG state from any numeric seed. */
export function seedRng(seed: number): RNGState {
  const value = seed >>> 0;
  return { value: value === 0 ? ZERO_SEED_REPLACEMENT : value };
}

/** Advance the RNG once and return the new state plus an unsigned 32-bit value. */
export function nextRng(state: RNGState): [RNGState, number] {
  let value = state.value >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  const normalized = value >>> 0;
  return [{ value: normalized }, normalized];
}

/** Advance the RNG and return an integer in the half-open range [min, max). */
export function nextRangeRng(state: RNGState, min: number, max: number): [RNGState, number] {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max <= min) {
    throw new RangeError('nextRangeRng requires integer bounds with max greater than min');
  }

  const [next, value] = nextRng(state);
  return [next, min + (value % (max - min))];
}
