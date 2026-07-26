import { describe, expect, it } from 'vitest';
import { startMatch, viewMatch, type PlayerId, type SetupOpts } from '@opencards/core';
import { chooseBotCommand, simulateBatch, simulateMatch } from './index.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const setup = (seed = 1): SetupOpts => ({
  seed,
  players: [p1, p2],
  deckSize: 4,
  openingHandSize: 2,
  cardKinds: ['soldier'],
  cards: [{ kind: 'soldier', type: 'unit', cost: 1, attack: 3, health: 2 }],
  startingEnergy: 1,
  baseTotal: 8,
});

describe('@opencards/ai', () => {
  it('selects only legal commands and prioritizes the mandatory draw', () => {
    const started = startMatch(setup());
    const command = chooseBotCommand(started.handles[p1]!);
    expect(command).toEqual({ type: 'drawCard', player: p1 });
  });

  it('plays a complete deterministic match', () => {
    const first = simulateMatch(setup(8));
    const second = simulateMatch(setup(8));
    expect(first).toEqual(second);
    expect(first.winner).not.toBeNull();
    expect(first.capped).toBe(false);
  });

  it('returns null after a match ends and summarizes batches', () => {
    const batch = simulateBatch(setup, 3);
    expect(batch.matches).toBe(3);
    expect(batch.draws).toBe(0);
    expect(batch.capped).toBe(0);
    expect(batch.averageTurns).toBeGreaterThan(0);

    const started = startMatch(setup());
    expect(viewMatch(started.handles[p1]!).winner).toBeNull();
  });

  it('handles empty batches and command caps', () => {
    expect(simulateBatch(setup, 0).averageTurns).toBe(0);
    expect(simulateMatch(setup(), { maxCommands: 0 }).capped).toBe(true);
  });
});
