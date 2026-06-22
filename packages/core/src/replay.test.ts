import { describe, expect, it } from 'vitest';
import type { CardKind, PlayerId } from './types.js';
import { computeReplayHash, replay, type ReplayEnvelopeV1 } from './replay.js';
import type { SetupOpts } from './setup.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const cardKinds: CardKind[] = ['unit-a', 'unit-b', 'unit-c', 'tactic-a'];

const setupOpts = (seed: number): SetupOpts => ({
  seed,
  players: [p1, p2],
  deckSize: 12,
  openingHandSize: 0,
  cardKinds,
});

const envelopeForSeed = (seed: number): ReplayEnvelopeV1 => {
  const draft: ReplayEnvelopeV1 = {
    schemaVersion: '0.1.0',
    seed,
    setupOpts: setupOpts(seed),
    commands: [
      { type: 'drawCard', player: p1 },
      { type: 'drawCard', player: p2 },
      { type: 'drawCard', player: p1 },
    ],
    finalStateHash: '',
  };

  return { ...draft, finalStateHash: computeReplayHash(draft) };
};

describe('replay', () => {
  it('replays a 3-command envelope to the recorded hash', () => {
    const envelope = envelopeForSeed(42);
    const result = replay(envelope);
    expect(result.ok).toBe(true);
    expect(result.hash).toBe(envelope.finalStateHash);
  });

  it('returns ok false when the finalStateHash is wrong', () => {
    const result = replay({ ...envelopeForSeed(42), finalStateHash: '0'.repeat(64) });
    expect(result.ok).toBe(false);
    expect(result.expected).toBe('0'.repeat(64));
    expect(result.hash).not.toBe(result.expected);
  });

  it('keeps computed hashes stable across 100 seeds', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const envelope = envelopeForSeed(seed);
      expect(computeReplayHash(envelope)).toBe(computeReplayHash(envelope));
    }
  });

  it('returns issues for invalid replay commands and computeReplayHash throws', () => {
    const invalid: ReplayEnvelopeV1 = {
      ...envelopeForSeed(3),
      commands: [{ type: 'drawCard', player: 'missing' as PlayerId }],
    };
    const result = replay(invalid);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(['UNKNOWN_PLAYER']);
    expect(() => computeReplayHash(invalid)).toThrow(/UNKNOWN_PLAYER/);
  });
});
