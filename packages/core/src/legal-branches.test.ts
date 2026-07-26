import { describe, expect, it } from 'vitest';
import { getLegalCommands } from './legal.js';
import { seedRng } from './rng.js';
import type { CardInstanceId, PlayerId, State } from './types.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const base = (): State => ({
  rng: seedRng(1),
  activePlayer: p1,
  phase: 'main',
  turn: 1,
  winner: null,
  cards: { spell: { kind: 'spell', type: 'tactic', cost: 0 } },
  stack: [],
  players: {
    [p1]: {
      id: p1,
      hand: [],
      deck: [],
      discard: [],
      exile: [],
      battlefield: [],
      base: 20,
      energy: 0,
      drawnThisTurn: false,
    },
    [p2]: {
      id: p2,
      hand: [],
      deck: [],
      discard: [],
      exile: [],
      battlefield: [],
      base: 20,
      energy: 0,
      drawnThisTurn: false,
    },
  },
});

describe('legal command alternate branches', () => {
  it('hides another player pending choice', () => {
    const state: State = {
      ...base(),
      pendingChoice: {
        player: p1,
        source: 'choice' as CardInstanceId,
        kind: 'spell',
        options: [[{ op: 'gainResource', amount: 1, target: 'self' }]],
      },
    };
    expect(getLegalCommands(state, p2)).toEqual([]);
  });

  it('does not propose targets for an untargeted opposing stack item', () => {
    const state: State = {
      ...base(),
      stack: [
        {
          source: 'source' as CardInstanceId,
          controller: p2,
          kind: 'spell',
          effects: [],
          target: null,
        },
      ],
    };
    expect(getLegalCommands(state, p1).some((command) => command.type === 'chooseTarget')).toBe(
      false,
    );
  });
});
