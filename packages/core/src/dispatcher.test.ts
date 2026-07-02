import { describe, expect, it } from 'vitest';
import type { CardInstanceId, CardSpec, Command, PlayerId, State, Unit } from './types.js';
import { apply, checkWin } from './dispatcher.js';
import { seedRng } from './rng.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const unknown = 'missing' as PlayerId;

const makeUnit = (
  id: CardInstanceId,
  kind: string,
  attack: number,
  health: number,
  overrides: Partial<Pick<Unit, 'damage' | 'exhausted'>> = {},
): Unit => ({
  id,
  kind,
  attack,
  health,
  damage: overrides.damage ?? 0,
  exhausted: overrides.exhausted ?? false,
});

const baseState = (): State => ({
  rng: seedRng(1),
  activePlayer: p1,
  phase: 'start',
  turn: 1,
  winner: null,
  cards: {},
  players: {
    [p1]: {
      id: p1,
      hand: [],
      deck: [
        { id: 'p1-c00' as CardInstanceId, kind: 'unit-a' },
        { id: 'p1-c01' as CardInstanceId, kind: 'unit-b' },
      ],
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
      deck: [{ id: 'p2-c00' as CardInstanceId, kind: 'unit-a' }],
      discard: [],
      exile: [],
      battlefield: [],
      base: 20,
      energy: 0,
      drawnThisTurn: false,
    },
  },
});

describe('apply', () => {
  it('returns UNKNOWN_COMMAND and leaves state unchanged for unrecognized command types', () => {
    const state = baseState();
    const result = apply(state, { type: 'noSuchCommand', player: p1 } as unknown as Command);

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'UNKNOWN_COMMAND', message: 'Unknown command type: noSuchCommand' },
    ]);
  });

  it('drawCard moves the top deck card to the bottom of hand and emits cardDrawn', () => {
    const state = baseState();
    const result = apply(state, { type: 'drawCard', player: p1 });

    expect(result.issues).toEqual([]);
    expect(result.events).toEqual([
      { type: 'cardDrawn', player: p1, instance: { id: 'p1-c00', kind: 'unit-a' } },
    ]);
    expect(result.state.players[p1]?.deck).toEqual([{ id: 'p1-c01', kind: 'unit-b' }]);
    expect(result.state.players[p1]?.hand).toEqual([{ id: 'p1-c00', kind: 'unit-a' }]);
    expect(result.state.players[p1]?.drawnThisTurn).toBe(true);
    expect(state.players[p1]?.deck).toHaveLength(2);
  });

  it('returns ALREADY_DREW and leaves state unchanged when drawing twice in one turn', () => {
    const state = baseState();
    const first = apply(state, { type: 'drawCard', player: p1 });
    const second = apply(first.state, { type: 'drawCard', player: p1 });

    expect(first.issues).toEqual([]);
    expect(second.state).toBe(first.state);
    expect(second.events).toEqual([]);
    expect(second.issues).toEqual([
      { code: 'ALREADY_DREW', message: 'Player has already drawn this turn: p1' },
    ]);
  });

  it('returns EMPTY_DECK and leaves state unchanged when the deck is empty', () => {
    const state: State = {
      ...baseState(),
      players: {
        ...baseState().players,
        [p1]: { ...baseState().players[p1]!, deck: [] },
      },
    };
    const result = apply(state, { type: 'drawCard', player: p1 });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'EMPTY_DECK', message: 'Player has no cards to draw: p1' },
    ]);
  });

  it('returns UNKNOWN_PLAYER and leaves state unchanged when the player is missing', () => {
    const state = baseState();
    const result = apply(state, { type: 'drawCard', player: unknown });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([{ code: 'UNKNOWN_PLAYER', message: 'Unknown player: missing' }]);
  });

  it('returns NOT_ACTIVE_PLAYER and leaves state unchanged when an inactive player draws', () => {
    const state = baseState();
    const result = apply(state, { type: 'drawCard', player: p2 });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'NOT_ACTIVE_PLAYER', message: 'Player is not the active player: p2' },
    ]);
  });

  it.each(['main', 'combat', 'end'] as const)(
    'returns PHASE_NOT_START and leaves state unchanged when drawing in %s',
    (phase) => {
      const state: State = { ...baseState(), phase };
      const result = apply(state, { type: 'drawCard', player: p1 });

      expect(result.state).toBe(state);
      expect(result.events).toEqual([]);
      expect(result.issues).toEqual([
        { code: 'PHASE_NOT_START', message: 'drawCard requires the start phase' },
      ]);
    },
  );

  // --- endPhase ---

  it('endPhase advances start->main and emits phaseAdvanced', () => {
    const state = baseState(); // phase is 'start'
    const result = apply(state, { type: 'endPhase', player: p1 });

    expect(result.issues).toEqual([]);
    expect(result.state.phase).toBe('main');
    expect(result.events).toEqual([
      { type: 'phaseAdvanced', player: p1, from: 'start', to: 'main' },
    ]);
  });

  it('endPhase advances main->combat', () => {
    const state: State = { ...baseState(), phase: 'main' };
    const result = apply(state, { type: 'endPhase', player: p1 });

    expect(result.issues).toEqual([]);
    expect(result.state.phase).toBe('combat');
    expect(result.events[0]).toMatchObject({ type: 'phaseAdvanced', from: 'main', to: 'combat' });
  });

  it('endPhase advances combat->end', () => {
    const state: State = { ...baseState(), phase: 'combat' };
    const result = apply(state, { type: 'endPhase', player: p1 });

    expect(result.issues).toEqual([]);
    expect(result.state.phase).toBe('end');
    expect(result.events[0]).toMatchObject({ type: 'phaseAdvanced', from: 'combat', to: 'end' });
  });

  it('endPhase on end phase returns PHASE_IS_FINAL and leaves state unchanged', () => {
    const state: State = { ...baseState(), phase: 'end' };
    const result = apply(state, { type: 'endPhase', player: p1 });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      {
        code: 'PHASE_IS_FINAL',
        message: 'Current phase is already the final phase; use endTurn instead',
      },
    ]);
  });

  it('endPhase by non-active player returns NOT_ACTIVE_PLAYER unchanged', () => {
    const state = baseState(); // activePlayer is p1
    const result = apply(state, { type: 'endPhase', player: p2 });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'NOT_ACTIVE_PLAYER', message: 'Player is not the active player: p2' },
    ]);
  });

  // --- endTurn ---

  it('endTurn switches activePlayer, bumps turn, sets phase start, grants +1 energy to next player', () => {
    const state = baseState(); // activePlayer p1, turn 1
    const result = apply(state, { type: 'endTurn', player: p1 });

    expect(result.issues).toEqual([]);
    expect(result.state.activePlayer).toBe(p2);
    expect(result.state.turn).toBe(2);
    expect(result.state.phase).toBe('start');
    // p2 gains 1 energy
    expect(result.state.players[p2]?.energy).toBe(1);
    // p1 energy unchanged
    expect(result.state.players[p1]?.energy).toBe(0);
  });

  it('endTurn resets drawnThisTurn for the incoming active player', () => {
    const state: State = {
      ...baseState(),
      players: {
        ...baseState().players,
        [p2]: { ...baseState().players[p2]!, drawnThisTurn: true },
      },
    };
    const result = apply(state, { type: 'endTurn', player: p1 });
    const draw = apply(result.state, { type: 'drawCard', player: p2 });

    expect(result.issues).toEqual([]);
    expect(result.state.players[p2]?.drawnThisTurn).toBe(false);
    expect(draw.issues).toEqual([]);
    expect(draw.state.players[p2]?.drawnThisTurn).toBe(true);
  });

  it('endTurn emits resourceGained then turnEnded', () => {
    const state = baseState();
    const result = apply(state, { type: 'endTurn', player: p1 });

    expect(result.events).toEqual([
      { type: 'resourceGained', player: p2, resource: 'energy', amount: 1 },
      { type: 'turnEnded', player: p1, nextPlayer: p2, turn: 2 },
    ]);
  });

  it('endTurn by non-active player returns NOT_ACTIVE_PLAYER unchanged', () => {
    const state = baseState(); // activePlayer is p1
    const result = apply(state, { type: 'endTurn', player: p2 });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'NOT_ACTIVE_PLAYER', message: 'Player is not the active player: p2' },
    ]);
  });

  it('endTurn readies all units for the incoming active player', () => {
    const p1Unit = makeUnit('p1-u00' as CardInstanceId, 'unit-a', 2, 3, { exhausted: true });
    const p2UnitA = makeUnit('p2-u00' as CardInstanceId, 'unit-a', 3, 4, { exhausted: true });
    const p2UnitB = makeUnit('p2-u01' as CardInstanceId, 'unit-b', 1, 2, { exhausted: true });
    const state: State = {
      ...baseState(),
      phase: 'end',
      players: {
        ...baseState().players,
        [p1]: { ...baseState().players[p1]!, battlefield: [p1Unit] },
        [p2]: { ...baseState().players[p2]!, battlefield: [p2UnitA, p2UnitB] },
      },
    };
    const result = apply(state, { type: 'endTurn', player: p1 });

    expect(result.issues).toEqual([]);
    expect(result.state.activePlayer).toBe(p2);
    expect(result.state.players[p1]?.battlefield).toEqual([p1Unit]);
    expect(result.state.players[p2]?.battlefield).toEqual([
      { ...p2UnitA, exhausted: false },
      { ...p2UnitB, exhausted: false },
    ]);
    expect(result.events).toEqual([
      { type: 'resourceGained', player: p2, resource: 'energy', amount: 1 },
      { type: 'turnEnded', player: p1, nextPlayer: p2, turn: 2 },
    ]);
  });

  // --- GAME_OVER global guard ---

  it('any command when state.winner !== null returns GAME_OVER and leaves state unchanged', () => {
    const finishedState: State = { ...baseState(), winner: p1 };

    const drawResult = apply(finishedState, { type: 'drawCard', player: p1 });
    expect(drawResult.state).toBe(finishedState);
    expect(drawResult.events).toEqual([]);
    expect(drawResult.issues).toEqual([
      { code: 'GAME_OVER', message: 'The game has already ended' },
    ]);

    const phaseResult = apply(finishedState, { type: 'endPhase', player: p1 });
    expect(phaseResult.issues).toEqual([
      { code: 'GAME_OVER', message: 'The game has already ended' },
    ]);

    const turnResult = apply(finishedState, { type: 'endTurn', player: p1 });
    expect(turnResult.issues).toEqual([
      { code: 'GAME_OVER', message: 'The game has already ended' },
    ]);
  });
});

// --- playCard ---

const unitSpec: CardSpec = { kind: 'unit-a', type: 'unit', cost: 2, attack: 3, health: 4 };
const tacticSpec: CardSpec = { kind: 'tactic-a', type: 'tactic', cost: 1 };

const playCardBaseState = (): State => ({
  ...baseState(),
  phase: 'main',
  cards: { 'unit-a': unitSpec, 'tactic-a': tacticSpec },
  players: {
    [p1]: {
      id: p1,
      hand: [
        { id: 'p1-c00' as CardInstanceId, kind: 'unit-a' },
        { id: 'p1-c01' as CardInstanceId, kind: 'tactic-a' },
      ],
      deck: [],
      discard: [],
      exile: [],
      battlefield: [],
      base: 20,
      energy: 5,
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

const combatBaseState = (
  overrides: {
    readonly phase?: State['phase'];
    readonly activePlayer?: PlayerId;
    readonly winner?: PlayerId | null;
    readonly p1Battlefield?: readonly Unit[];
    readonly p2Battlefield?: readonly Unit[];
    readonly p1Base?: number;
    readonly p2Base?: number;
  } = {},
): State => {
  const base = baseState();

  return {
    ...base,
    activePlayer: overrides.activePlayer ?? p1,
    phase: overrides.phase ?? 'combat',
    winner: overrides.winner ?? null,
    cards: { 'unit-a': unitSpec },
    players: {
      [p1]: {
        ...base.players[p1]!,
        hand: [],
        deck: [],
        discard: [],
        battlefield: overrides.p1Battlefield ?? [],
        base: overrides.p1Base ?? 20,
        energy: 0,
      },
      [p2]: {
        ...base.players[p2]!,
        hand: [],
        deck: [],
        discard: [],
        battlefield: overrides.p2Battlefield ?? [],
        base: overrides.p2Base ?? 20,
        energy: 0,
      },
    },
  };
};

describe('playCard', () => {
  it('plays a unit: adds exhausted Unit to battlefield, decrements energy, emits resourceSpent then cardPlayed to battlefield', () => {
    const state = playCardBaseState();
    const result = apply(state, {
      type: 'playCard',
      player: p1,
      instance: 'p1-c00' as CardInstanceId,
    });

    expect(result.issues).toEqual([]);
    expect(result.state.players[p1]?.energy).toBe(3); // 5 - 2
    expect(result.state.players[p1]?.hand).toEqual([{ id: 'p1-c01', kind: 'tactic-a' }]);
    // battlefield is now Unit[] with summoning sickness
    expect(result.state.players[p1]?.battlefield).toEqual([
      {
        id: 'p1-c00' as CardInstanceId,
        kind: 'unit-a',
        attack: 3,
        health: 4,
        damage: 0,
        exhausted: true,
      } satisfies Unit,
    ]);
    expect(result.events).toEqual([
      { type: 'resourceSpent', player: p1, resource: 'energy', amount: 2 },
      {
        type: 'cardPlayed',
        player: p1,
        instance: { id: 'p1-c00', kind: 'unit-a' },
        to: 'battlefield',
      },
    ]);
  });

  it('plays a tactic: moves hand->discard, decrements energy, emits resourceSpent then cardPlayed to discard', () => {
    const state = playCardBaseState();
    const result = apply(state, {
      type: 'playCard',
      player: p1,
      instance: 'p1-c01' as CardInstanceId,
    });

    expect(result.issues).toEqual([]);
    expect(result.state.players[p1]?.energy).toBe(4); // 5 - 1
    expect(result.state.players[p1]?.hand).toEqual([{ id: 'p1-c00', kind: 'unit-a' }]);
    expect(result.state.players[p1]?.discard).toEqual([{ id: 'p1-c01', kind: 'tactic-a' }]);
    expect(result.events).toEqual([
      { type: 'resourceSpent', player: p1, resource: 'energy', amount: 1 },
      {
        type: 'cardPlayed',
        player: p1,
        instance: { id: 'p1-c01', kind: 'tactic-a' },
        to: 'discard',
      },
    ]);
  });

  it('returns INSUFFICIENT_ENERGY and leaves state unchanged when energy < cost', () => {
    const state: State = {
      ...playCardBaseState(),
      players: {
        ...playCardBaseState().players,
        [p1]: { ...playCardBaseState().players[p1]!, energy: 1 },
      },
    };
    const result = apply(state, {
      type: 'playCard',
      player: p1,
      instance: 'p1-c00' as CardInstanceId,
    });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'INSUFFICIENT_ENERGY', message: 'Insufficient energy: have 1, need 2' },
    ]);
  });

  it('returns PHASE_NOT_MAIN when phase is not main', () => {
    const state: State = { ...playCardBaseState(), phase: 'start' };
    const result = apply(state, {
      type: 'playCard',
      player: p1,
      instance: 'p1-c00' as CardInstanceId,
    });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'PHASE_NOT_MAIN', message: 'playCard requires the main phase' },
    ]);
  });

  it('returns CARD_NOT_IN_HAND for an instance not in the player hand', () => {
    const state = playCardBaseState();
    const result = apply(state, {
      type: 'playCard',
      player: p1,
      instance: 'p1-c99' as CardInstanceId,
    });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'CARD_NOT_IN_HAND', message: 'Card instance not found in player hand: p1-c99' },
    ]);
  });

  it('returns UNKNOWN_CARD when no spec exists for the card kind', () => {
    const state: State = { ...playCardBaseState(), cards: {} };
    const result = apply(state, {
      type: 'playCard',
      player: p1,
      instance: 'p1-c00' as CardInstanceId,
    });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'UNKNOWN_CARD', message: 'No card spec found for kind: unit-a' },
    ]);
  });

  it('returns NOT_ACTIVE_PLAYER when a non-active player attempts to play', () => {
    const state = playCardBaseState();
    const result = apply(state, {
      type: 'playCard',
      player: p2,
      instance: 'p1-c00' as CardInstanceId,
    });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'NOT_ACTIVE_PLAYER', message: 'Player is not the active player: p2' },
    ]);
  });

  it('returns GAME_OVER when winner is already set', () => {
    const state: State = { ...playCardBaseState(), winner: p2 };
    const result = apply(state, {
      type: 'playCard',
      player: p1,
      instance: 'p1-c00' as CardInstanceId,
    });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([{ code: 'GAME_OVER', message: 'The game has already ended' }]);
  });

  it('returns UNKNOWN_PLAYER when player does not exist', () => {
    const state = playCardBaseState();
    const result = apply(state, {
      type: 'playCard',
      player: unknown,
      instance: 'p1-c00' as CardInstanceId,
    });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([{ code: 'UNKNOWN_PLAYER', message: 'Unknown player: missing' }]);
  });
});

describe('attack', () => {
  it('attacks the opponent base in combat', () => {
    const attackerId = 'p1-u00' as CardInstanceId;
    const attacker = makeUnit(attackerId, 'unit-a', 3, 4);
    const state = combatBaseState({ p1Battlefield: [attacker] });
    const result = apply(state, {
      type: 'attack',
      player: p1,
      attacker: attackerId,
      target: 'base',
    });

    expect(result.issues).toEqual([]);
    expect(result.state.players[p2]?.base).toBe(17);
    expect(result.state.players[p1]?.battlefield).toEqual([{ ...attacker, exhausted: true }]);
    expect(result.events).toEqual([
      { type: 'attackDeclared', player: p1, attacker: attackerId, target: 'base' },
      { type: 'damageDealt', target: 'base', amount: 3, owner: p2 },
    ]);
  });

  it('trades damage with an enemy unit while both survive', () => {
    const attackerId = 'p1-u00' as CardInstanceId;
    const defenderId = 'p2-u00' as CardInstanceId;
    const attacker = makeUnit(attackerId, 'unit-a', 3, 5);
    const defender = makeUnit(defenderId, 'unit-b', 2, 5);
    const state = combatBaseState({ p1Battlefield: [attacker], p2Battlefield: [defender] });
    const result = apply(state, {
      type: 'attack',
      player: p1,
      attacker: attackerId,
      target: defenderId,
    });

    expect(result.issues).toEqual([]);
    expect(result.state.players[p1]?.battlefield).toEqual([
      { ...attacker, damage: 2, exhausted: true },
    ]);
    expect(result.state.players[p2]?.battlefield).toEqual([{ ...defender, damage: 3 }]);
    expect(result.events).toEqual([
      { type: 'attackDeclared', player: p1, attacker: attackerId, target: defenderId },
      { type: 'damageDealt', target: defenderId, amount: 3, owner: p2 },
      { type: 'damageDealt', target: attackerId, amount: 2, owner: p1 },
    ]);
  });

  it('moves a destroyed defender to its owner discard after combat damage', () => {
    const attackerId = 'p1-u00' as CardInstanceId;
    const defenderId = 'p2-u00' as CardInstanceId;
    const attacker = makeUnit(attackerId, 'unit-a', 3, 5);
    const defender = makeUnit(defenderId, 'unit-b', 2, 3);
    const state = combatBaseState({ p1Battlefield: [attacker], p2Battlefield: [defender] });
    const result = apply(state, {
      type: 'attack',
      player: p1,
      attacker: attackerId,
      target: defenderId,
    });

    expect(result.issues).toEqual([]);
    expect(result.state.players[p1]?.battlefield).toEqual([
      { ...attacker, damage: 2, exhausted: true },
    ]);
    expect(result.state.players[p2]?.battlefield).toEqual([]);
    expect(result.state.players[p2]?.discard).toEqual([{ id: defenderId, kind: 'unit-b' }]);
    expect(result.events).toEqual([
      { type: 'attackDeclared', player: p1, attacker: attackerId, target: defenderId },
      { type: 'damageDealt', target: defenderId, amount: 3, owner: p2 },
      { type: 'damageDealt', target: attackerId, amount: 2, owner: p1 },
      { type: 'unitDestroyed', owner: p2, instance: { id: defenderId, kind: 'unit-b' } },
    ]);
  });

  it('moves mutually destroyed units to their owners discards', () => {
    const attackerId = 'p1-u00' as CardInstanceId;
    const defenderId = 'p2-u00' as CardInstanceId;
    const attacker = makeUnit(attackerId, 'unit-a', 3, 2);
    const defender = makeUnit(defenderId, 'unit-b', 2, 3);
    const state = combatBaseState({ p1Battlefield: [attacker], p2Battlefield: [defender] });
    const result = apply(state, {
      type: 'attack',
      player: p1,
      attacker: attackerId,
      target: defenderId,
    });

    expect(result.issues).toEqual([]);
    expect(result.state.players[p1]?.battlefield).toEqual([]);
    expect(result.state.players[p2]?.battlefield).toEqual([]);
    expect(result.state.players[p1]?.discard).toEqual([{ id: attackerId, kind: 'unit-a' }]);
    expect(result.state.players[p2]?.discard).toEqual([{ id: defenderId, kind: 'unit-b' }]);
    expect(result.events).toEqual([
      { type: 'attackDeclared', player: p1, attacker: attackerId, target: defenderId },
      { type: 'damageDealt', target: defenderId, amount: 3, owner: p2 },
      { type: 'damageDealt', target: attackerId, amount: 2, owner: p1 },
      { type: 'unitDestroyed', owner: p1, instance: { id: attackerId, kind: 'unit-a' } },
      { type: 'unitDestroyed', owner: p2, instance: { id: defenderId, kind: 'unit-b' } },
    ]);
  });

  it('ends the game when combat damage makes the opponent base lethal', () => {
    const attackerId = 'p1-u00' as CardInstanceId;
    const attacker = makeUnit(attackerId, 'unit-a', 3, 4);
    const state = combatBaseState({ p1Battlefield: [attacker], p2Base: 2 });
    const result = apply(state, {
      type: 'attack',
      player: p1,
      attacker: attackerId,
      target: 'base',
    });

    expect(result.issues).toEqual([]);
    expect(result.state.players[p2]?.base).toBe(-1);
    expect(result.state.players[p1]?.battlefield).toEqual([{ ...attacker, exhausted: true }]);
    expect(result.state.winner).toBe(p1);
    expect(result.events).toEqual([
      { type: 'attackDeclared', player: p1, attacker: attackerId, target: 'base' },
      { type: 'damageDealt', target: 'base', amount: 3, owner: p2 },
      { type: 'gameEnded', winner: p1 },
    ]);
  });

  it('prevents a unit played this turn from attacking in combat', () => {
    const played = apply(playCardBaseState(), {
      type: 'playCard',
      player: p1,
      instance: 'p1-c00' as CardInstanceId,
    });
    const combat = apply(played.state, { type: 'endPhase', player: p1 });
    const result = apply(combat.state, {
      type: 'attack',
      player: p1,
      attacker: 'p1-c00' as CardInstanceId,
      target: 'base',
    });

    expect(played.issues).toEqual([]);
    expect(combat.issues).toEqual([]);
    expect(combat.state.phase).toBe('combat');
    expect(combat.state.players[p1]?.battlefield[0]?.exhausted).toBe(true);
    expect(result.state).toBe(combat.state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'UNIT_EXHAUSTED', message: 'Unit is exhausted and cannot attack: p1-c00' },
    ]);
  });

  it('returns PHASE_NOT_COMBAT when attacking outside combat', () => {
    const attackerId = 'p1-u00' as CardInstanceId;
    const state = combatBaseState({
      phase: 'main',
      p1Battlefield: [makeUnit(attackerId, 'unit-a', 3, 4)],
    });
    const result = apply(state, {
      type: 'attack',
      player: p1,
      attacker: attackerId,
      target: 'base',
    });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'PHASE_NOT_COMBAT', message: 'attack requires the combat phase' },
    ]);
  });

  it('returns ATTACKER_NOT_FOUND when the attacker is absent', () => {
    const missingAttacker = 'p1-missing' as CardInstanceId;
    const state = combatBaseState();
    const result = apply(state, {
      type: 'attack',
      player: p1,
      attacker: missingAttacker,
      target: 'base',
    });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      {
        code: 'ATTACKER_NOT_FOUND',
        message: 'Attacker not found in player battlefield: p1-missing',
      },
    ]);
  });

  it('returns INVALID_TARGET when the target is not in the opponent battlefield', () => {
    const attackerId = 'p1-u00' as CardInstanceId;
    const ownTargetId = 'p1-u01' as CardInstanceId;
    const state = combatBaseState({
      p1Battlefield: [makeUnit(attackerId, 'unit-a', 3, 4), makeUnit(ownTargetId, 'unit-b', 1, 2)],
    });
    const result = apply(state, {
      type: 'attack',
      player: p1,
      attacker: attackerId,
      target: ownTargetId,
    });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'INVALID_TARGET', message: 'Invalid attack target: p1-u01' },
    ]);
  });

  it('returns NOT_ACTIVE_PLAYER when an inactive player attacks', () => {
    const attackerId = 'p2-u00' as CardInstanceId;
    const state = combatBaseState({ p2Battlefield: [makeUnit(attackerId, 'unit-a', 3, 4)] });
    const result = apply(state, {
      type: 'attack',
      player: p2,
      attacker: attackerId,
      target: 'base',
    });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'NOT_ACTIVE_PLAYER', message: 'Player is not the active player: p2' },
    ]);
  });

  it('returns GAME_OVER when attacking after a winner is set', () => {
    const attackerId = 'p1-u00' as CardInstanceId;
    const state = combatBaseState({
      winner: p2,
      p1Battlefield: [makeUnit(attackerId, 'unit-a', 3, 4)],
    });
    const result = apply(state, {
      type: 'attack',
      player: p1,
      attacker: attackerId,
      target: 'base',
    });

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([{ code: 'GAME_OVER', message: 'The game has already ended' }]);
  });
});

// --- win-check helper ---

describe('checkWin', () => {
  it('sets winner to opponent and emits gameEnded when a player base reaches 0', () => {
    const state: State = {
      ...baseState(),
      players: {
        ...baseState().players,
        [p1]: { ...baseState().players[p1]!, base: 0 },
      },
    };

    const { state: newState, events } = checkWin(state, []);

    expect(newState.winner).toBe(p2);
    expect(events).toEqual([{ type: 'gameEnded', winner: p2 }]);
  });

  it('returns state unchanged when no player base is <= 0', () => {
    const state = baseState();
    const { state: newState, events } = checkWin(state, []);

    expect(newState).toBe(state);
    expect(events).toEqual([]);
  });

  it('does not re-fire gameEnded when winner is already set', () => {
    const state: State = { ...baseState(), winner: p1 };
    const { state: newState, events } = checkWin(state, []);

    expect(newState).toBe(state);
    expect(events).toEqual([]);
  });
});
