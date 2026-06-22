import type { RNGState } from './types.js';
import { nextRangeRng } from './rng.js';

/** Return a deterministic Fisher-Yates permutation without mutating the input array. */
export function fisherYates<T>(arr: readonly T[], rng: RNGState): [T[], RNGState] {
  const shuffled = [...arr];
  let next = rng;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const [advanced, swapIndex] = nextRangeRng(next, 0, index + 1);
    next = advanced;
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex] as T, shuffled[index] as T];
  }

  return [shuffled, next];
}
