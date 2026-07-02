import { describe, expect, it } from 'vitest';
import { apply } from './dispatcher.js';
import { getLegalCommands } from './legal.js';
import { seedRng } from './rng.js';
import { createInitialState } from './setup.js';
import type { CardInstanceId, CardSpec, Command, PlayerId, State, Unit } from './types.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const unitSpec: CardSpec = { kind: 'unit-a', type: 'unit', cost: 2, attack: 3, health: 4 };
const tacticSpec: CardSpec = { kind: 'tactic-a', type: 'tactic', cost: 1 };

const makeUnit = (
  id: CardInstanceId,
  kind: string,
  overrides: Partial<Pick<Unit, 'exhausted'>> = {},
): Unit => ({
  id,
  kind,
  attack: 2,
  health: 3,
  damage: 0,
  exhausted: overrides.exhausted ?? false,
});

const baseState = (): State => ({
  rng: seedRng(7),
  activePlayer: p1,
  phase: 'start',
  turn: 1,
  winner: null,
  cards: { 'unit-a': unitSpec, 'tactic-a': tacticSpec },
  players: {
    [p1]: {
      id: p1,
      hand: [],
      deck: [{ id: 'p1-d00' as CardInstanceId, kind: 'unit-a' }],
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
      deck: [{ id: 'p2-d00' as CardInstanceId, kind: 'unit-a' }],
      discard: [],
      exile: [],
      battlefield: [],
      base: 20,
      energy: 0,
      drawnThisTurn: false,
    },
  },
});

describe('getLegalCommands', () => {
  it('lists fresh-game active commands in stable order and agrees with apply', () => {
    const state = createInitialState({
      seed: 1,
      players: [p1, p2],
      deckSize: 4,
      openingHandSize: 0,
      cardKinds: ['unit-a'],
      cards: [unitSpec],
    });

    const activeLegal = getLegalCommands(state, p1);
    const inactiveLegal = getLegalCommands(state, p2);

    expect(activeLegal).toEqual([
      { type: 'drawCard', player: p1 },
      { type: 'endPhase', player: p1 },
      { type: 'endTurn', player: p1 },
    ]);
    expect(activeLegal.some((command) => command.type === 'playCard')).toBe(false);
    expect(inactiveLegal).toEqual([]);
    for (const command of [...activeLegal, ...inactiveLegal]) {
      expect(apply(state, command).issues).toEqual([]);
    }
  });

  it('filters known illegal candidate commands through apply', () => {
    const mainState: State = {
      ...baseState(),
      phase: 'main',
      players: {
        ...baseState().players,
        [p1]: {
          ...baseState().players[p1]!,
          hand: [{ id: 'p1-hand' as CardInstanceId, kind: 'unit-a' }],
          battlefield: [makeUnit('p1-ready' as CardInstanceId, 'unit-a')],
        },
        [p2]: {
          ...baseState().players[p2]!,
          battlefield: [makeUnit('p2-ready' as CardInstanceId, 'unit-a')],
        },
      },
    };
    const secondDrawState: State = {
      ...baseState(),
      players: {
        ...baseState().players,
        [p1]: { ...baseState().players[p1]!, drawnThisTurn: true },
      },
    };

    const mainLegal = getLegalCommands(mainState, p1);
    const inactiveLegal = getLegalCommands(mainState, p2);
    const afterDrawLegal = getLegalCommands(secondDrawState, p1);

    expect(mainLegal).not.toContainEqual({
      type: 'attack',
      player: p1,
      attacker: 'p1-ready' as CardInstanceId,
      target: 'base',
    });
    expect(mainLegal).not.toContainEqual({
      type: 'playCard',
      player: p1,
      instance: 'p1-hand' as CardInstanceId,
    });
    expect(inactiveLegal).not.toContainEqual({ type: 'drawCard', player: p2 });
    expect(afterDrawLegal).not.toContainEqual({ type: 'drawCard', player: p1 });
    for (const command of mainLegal) {
      expect(apply(mainState, command).issues).toEqual([]);
    }
    for (const command of inactiveLegal) {
      expect(apply(mainState, command).issues).toEqual([]);
    }
    for (const command of afterDrawLegal) {
      expect(apply(secondDrawState, command).issues).toEqual([]);
    }
  });

  it('lists combat attacks for ready units in battlefield order and omits exhausted units', () => {
    const ready = makeUnit('p1-ready' as CardInstanceId, 'unit-a');
    const exhausted = makeUnit('p1-tired' as CardInstanceId, 'unit-a', { exhausted: true });
    const enemyA = makeUnit('p2-a' as CardInstanceId, 'unit-a');
    const enemyB = makeUnit('p2-b' as CardInstanceId, 'unit-a');
    const state: State = {
      ...baseState(),
      phase: 'combat',
      players: {
        ...baseState().players,
        [p1]: { ...baseState().players[p1]!, battlefield: [ready, exhausted] },
        [p2]: { ...baseState().players[p2]!, battlefield: [enemyA, enemyB] },
      },
    };

    const attacks = getLegalCommands(state, p1).filter(
      (command): command is Extract<Command, { type: 'attack' }> => command.type === 'attack',
    );

    expect(attacks).toEqual([
      { type: 'attack', player: p1, attacker: ready.id, target: enemyA.id },
      { type: 'attack', player: p1, attacker: ready.id, target: enemyB.id },
      { type: 'attack', player: p1, attacker: ready.id, target: 'base' },
    ]);
  });

  it('returns no commands when the game is over', () => {
    expect(getLegalCommands({ ...baseState(), winner: p1 }, p1)).toEqual([]);
  });

  it('does not reference opponent hidden hand instance ids', () => {
    const state: State = {
      ...baseState(),
      phase: 'main',
      players: {
        ...baseState().players,
        [p1]: {
          ...baseState().players[p1]!,
          hand: [{ id: 'p1-visible-hand' as CardInstanceId, kind: 'tactic-a' }],
          energy: 1,
        },
        [p2]: {
          ...baseState().players[p2]!,
          hand: [{ id: 'p2-hidden-hand' as CardInstanceId, kind: 'unit-a' }],
        },
      },
    };

    const json = JSON.stringify(getLegalCommands(state, p1));

    expect(json).toContain('p1-visible-hand');
    expect(json).not.toContain('p2-hidden-hand');
  });
});
