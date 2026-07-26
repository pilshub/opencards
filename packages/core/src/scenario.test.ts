import { describe, expect, it } from 'vitest';
import { startMatch, viewMatch } from './index.js';
import { createInitialState, type SetupOpts } from './setup.js';
import type { CardKind, PlayerId } from './types.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const kind = (value: string) => value as CardKind;
const base: SetupOpts = {
  seed: 3,
  players: [p1, p2],
  deckSize: 4,
  openingHandSize: 1,
  cardKinds: [kind('soldier')],
  cards: [
    { kind: kind('soldier'), type: 'unit', cost: 1, attack: 2, health: 3, keywords: ['guard'] },
  ],
};

describe('deterministic scenario setup', () => {
  it('overrides tutorial zones, board, resources, phase, and turn', () => {
    const setup: SetupOpts = {
      ...base,
      scenario: {
        activePlayer: p2,
        phase: 'combat',
        turn: 7,
        players: {
          [p1]: {
            hand: [kind('soldier'), kind('soldier')],
            deck: [],
            discard: [kind('soldier')],
            exile: [kind('soldier')],
            battlefield: [
              { kind: kind('soldier'), damage: 1, exhausted: true },
              { kind: kind('soldier'), attack: 5, health: 6, keywords: [] },
            ],
            base: 9,
            energy: 4,
            maxEnergy: 6,
            drawnThisTurn: true,
            fatigueCount: 2,
          },
        },
      },
    };
    const state = createInitialState(setup);
    expect(state).toMatchObject({ activePlayer: p2, phase: 'combat', turn: 7 });
    expect(state.players[p1]).toMatchObject({
      base: 9,
      energy: 4,
      maxEnergy: 6,
      drawnThisTurn: true,
      fatigueCount: 2,
    });
    expect(state.players[p1]?.hand.map((card) => card.id)).toEqual([
      'p1-scenario-hand-00',
      'p1-scenario-hand-01',
    ]);
    expect(state.players[p1]?.battlefield[0]).toMatchObject({
      attack: 2,
      health: 3,
      damage: 1,
      exhausted: true,
      keywords: ['guard'],
    });
    expect(state.players[p1]?.battlefield[1]).toMatchObject({ attack: 5, health: 6, keywords: [] });
  });

  it('keeps scenario hands hidden through viewer handles', () => {
    const setup: SetupOpts = {
      ...base,
      scenario: {
        players: { [p2]: { hand: [kind('soldier'), kind('soldier'), kind('soldier')] } },
      },
    };
    const started = startMatch(setup);
    const p1View = viewMatch(started.handles[p1]!);
    expect(p1View.opponents[p2]?.hand).toHaveLength(3);
    expect(p1View.opponents[p2]?.hand.every((card) => card.masked)).toBe(true);
  });
});
