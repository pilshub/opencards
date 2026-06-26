import { describe, expect, it } from 'vitest';
import type { CardInstanceId, Command, PlayerId, State } from './types.js';
import { apply, checkWin } from './dispatcher.js';
import { seedRng } from './rng.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const unknown = 'missing' as PlayerId;

const baseState = (): State => ({
  rng: seedRng(1),
  activePlayer: p1,
  phase: 'start',
  turn: 1,
  winner: null,
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
    expect(state.players[p1]?.deck).toHaveLength(2);
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
