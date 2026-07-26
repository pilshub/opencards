import { describe, expect, it } from 'vitest';
import { apply } from './dispatcher.js';
import { CLASSIC_RULESET, FOUNDRY_RULESET, defineRuleset } from './ruleset.js';
import { createInitialState, type SetupOpts } from './setup.js';
import type { CardInstanceId, CardKind, PlayerId, Ruleset, Unit } from './types.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const unitKind = 'foundry-unit' as CardKind;

function foundrySetup(overrides: Partial<SetupOpts> = {}): SetupOpts {
  return {
    seed: 42,
    players: [p1, p2],
    deckSize: 11,
    openingHandSize: 0,
    cardKinds: [unitKind],
    cards: [{ kind: unitKind, type: 'unit', cost: 1, attack: 1, health: 2 }],
    baseTotal: 20,
    startingEnergy: 1,
    ruleset: FOUNDRY_RULESET,
    ...overrides,
  };
}

describe('rulesets', () => {
  it('publishes backwards-compatible classic and digital Foundry profiles', () => {
    expect(CLASSIC_RULESET.battlefieldLimit).toBeNull();
    expect(CLASSIC_RULESET.energy.refillAtTurnStart).toBe(false);
    expect(FOUNDRY_RULESET.battlefieldLimit).toBe(5);
    expect(FOUNDRY_RULESET.handLimit).toBe(10);
    expect(FOUNDRY_RULESET.energy.maximum).toBe(10);
    expect(FOUNDRY_RULESET.fatigue.enabled).toBe(true);
  });

  it('defines and freezes creator-owned profiles', () => {
    const ruleset = defineRuleset({ ...FOUNDRY_RULESET, id: 'creator.duel' });
    expect(ruleset.id).toBe('creator.duel');
    expect(Object.isFrozen(ruleset)).toBe(true);
    expect(Object.isFrozen(ruleset.energy)).toBe(true);
    expect(Object.isFrozen(ruleset.phases)).toBe(true);
  });

  it.each([
    [{ ...FOUNDRY_RULESET, id: '' }, /non-empty id/],
    [{ ...FOUNDRY_RULESET, version: 0 }, /positive integer version/],
    [{ ...FOUNDRY_RULESET, phases: [] }, /phases containing/],
    [{ ...FOUNDRY_RULESET, battlefieldLimit: 0 }, /battlefieldLimit/],
    [{ ...FOUNDRY_RULESET, handLimit: -1 }, /handLimit/],
    [{ ...FOUNDRY_RULESET, energy: { ...FOUNDRY_RULESET.energy, gainPerTurn: -1 } }, /gainPerTurn/],
    [{ ...FOUNDRY_RULESET, energy: { ...FOUNDRY_RULESET.energy, maximum: 0 } }, /energy.maximum/],
    [{ ...FOUNDRY_RULESET, fatigue: { ...FOUNDRY_RULESET.fatigue, firstDamage: -1 } }, /fatigue/],
  ] as const)('rejects invalid creator profiles', (candidate, message) => {
    expect(() => defineRuleset(candidate as Ruleset)).toThrow(message);
  });

  it('stores Foundry in canonical state with resource and fatigue metadata', () => {
    const state = createInitialState(foundrySetup());
    expect(state.ruleset).toEqual(FOUNDRY_RULESET);
    expect(state.players[p1]?.energy).toBe(1);
    expect(state.players[p1]?.maxEnergy).toBe(1);
    expect(state.players[p1]?.fatigueCount).toBe(0);
  });

  it('refills energy, grows capacity, and respects the cap', () => {
    const initial = createInitialState(foundrySetup());
    const p2State = initial.players[p2]!;
    const nearCap = {
      ...initial,
      players: {
        ...initial.players,
        [p2]: { ...p2State, energy: 0, maxEnergy: 9 },
      },
    };
    const ended = apply(nearCap, { type: 'endTurn', player: p1 });

    expect(ended.issues).toEqual([]);
    expect(ended.state.players[p2]?.energy).toBe(10);
    expect(ended.state.players[p2]?.maxEnergy).toBe(10);
    expect(ended.events[0]).toEqual({
      type: 'resourceGained',
      player: p2,
      resource: 'energy',
      amount: 1,
    });

    const capped = apply(ended.state, { type: 'endTurn', player: p2 });
    const p1Capped = {
      ...capped.state,
      activePlayer: p1,
      players: {
        ...capped.state.players,
        [p1]: { ...capped.state.players[p1]!, energy: 0, maxEnergy: 10 },
      },
    };
    const cappedAgain = apply(p1Capped, { type: 'endTurn', player: p1 });
    expect(cappedAgain.state.players[p2]?.maxEnergy).toBe(10);
  });

  it('burns the top card when drawing into a full hand', () => {
    const state = createInitialState(foundrySetup({ openingHandSize: 10 }));
    const top = state.players[p1]?.deck[0];
    const result = apply(state, { type: 'drawCard', player: p1 });

    expect(result.issues).toEqual([]);
    expect(result.state.players[p1]?.hand).toHaveLength(10);
    expect(result.state.players[p1]?.discard.at(-1)).toEqual(top);
    expect(result.events).toEqual([{ type: 'cardBurned', player: p1, instance: top }]);
  });

  it('applies increasing deterministic fatigue damage when the deck is empty', () => {
    const initial = createInitialState(foundrySetup({ deckSize: 1, openingHandSize: 1 }));
    const first = apply(initial, { type: 'drawCard', player: p1 });

    expect(first.issues).toEqual([]);
    expect(first.state.players[p1]?.base).toBe(19);
    expect(first.state.players[p1]?.fatigueCount).toBe(1);
    expect(first.events).toEqual([
      { type: 'fatigueTriggered', player: p1, amount: 1, count: 1 },
      { type: 'damageDealt', target: 'base', amount: 1, owner: p1 },
    ]);

    const readyAgain = {
      ...first.state,
      players: {
        ...first.state.players,
        [p1]: { ...first.state.players[p1]!, drawnThisTurn: false },
      },
    };
    const second = apply(readyAgain, { type: 'drawCard', player: p1 });
    expect(second.state.players[p1]?.base).toBe(17);
    expect(second.state.players[p1]?.fatigueCount).toBe(2);
  });

  it('rejects playing a sixth unit onto the Foundry battlefield', () => {
    const initial = createInitialState(foundrySetup({ openingHandSize: 1 }));
    const player = initial.players[p1]!;
    const units: Unit[] = Array.from({ length: 5 }, (_, index) => ({
      id: `existing-${String(index)}` as CardInstanceId,
      kind: unitKind,
      attack: 1,
      health: 2,
      damage: 0,
      exhausted: false,
    }));
    const full = {
      ...initial,
      phase: 'main' as const,
      players: {
        ...initial.players,
        [p1]: { ...player, battlefield: units },
      },
    };
    const result = apply(full, { type: 'playCard', player: p1, instance: player.hand[0]!.id });

    expect(result.issues).toEqual([
      { code: 'BATTLEFIELD_FULL', message: 'Battlefield is full (limit 5)' },
    ]);
    expect(result.state).toBe(full);
  });

  it('rejects starting energy above the configured maximum', () => {
    expect(() => createInitialState(foundrySetup({ startingEnergy: 11 }))).toThrow(
      /startingEnergy exceeds/,
    );
  });
});
