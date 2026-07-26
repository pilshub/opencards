import { describe, expect, it } from 'vitest';
import { apply } from './dispatcher.js';
import { seedRng } from './rng.js';
import { FOUNDRY_RULESET } from './ruleset.js';
import type { CardInstanceId, CardSpec, Player, PlayerId, State, Unit } from './types.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const cid = (value: string) => value as CardInstanceId;
const minion = (value: string, keywords?: readonly string[]): Unit => ({
  id: cid(value),
  kind: 'minion',
  attack: 2,
  health: 3,
  damage: 0,
  exhausted: false,
  ...(keywords === undefined ? {} : { keywords }),
  attacksThisTurn: 0,
  summonedTurn: 1,
});
const player = (id: PlayerId): Player => ({
  id,
  hand: [],
  deck: [],
  discard: [],
  exile: [],
  battlefield: [],
  base: 20,
  energy: 5,
  maxEnergy: 5,
  fatigueCount: 0,
  drawnThisTurn: false,
});

function base(): State {
  const cards: Record<string, CardSpec> = {
    minion: { kind: 'minion', type: 'unit', cost: 1, attack: 2, health: 3 },
    conditional: {
      kind: 'conditional',
      type: 'unit',
      cost: 1,
      attack: 1,
      health: 2,
      abilities: [
        {
          trigger: 'onPlay',
          conditions: [
            { subject: 'source', metric: 'damage', operator: 'eq', value: 0 },
            { subject: 'source', metric: 'counter', operator: 'lte', value: 0, counter: 'charge' },
            { subject: 'controller', metric: 'base', operator: 'gte', value: 20 },
            { subject: 'controller', metric: 'energy', operator: 'lt', value: 5 },
            { subject: 'controller', metric: 'handSize', operator: 'neq', value: 5 },
            { subject: 'opponent', metric: 'units', operator: 'gt', value: 0 },
          ],
          effects: [{ op: 'gainResource', target: 'self', amount: 2 }],
        },
      ],
    },
  };
  return {
    rng: seedRng(9),
    activePlayer: p1,
    phase: 'main',
    turn: 2,
    winner: null,
    ruleset: FOUNDRY_RULESET,
    cards,
    stack: [],
    players: {
      [p1]: { ...player(p1), hand: [{ id: cid('conditional-card'), kind: 'conditional' }] },
      [p2]: { ...player(p2), battlefield: [minion('enemy')] },
    },
  };
}

describe('advanced mechanic edge paths', () => {
  it('evaluates all declarative condition subjects and comparators', () => {
    const result = apply(base(), {
      type: 'playCard',
      player: p1,
      instance: cid('conditional-card'),
    });
    expect(result.issues).toEqual([]);
    expect(result.state.players[p1]?.energy).toBe(6);
    expect(result.events.some((event) => event.type === 'abilityTriggered')).toBe(true);

    const blocked = base();
    const lowBase: State = {
      ...blocked,
      players: { ...blocked.players, [p1]: { ...blocked.players[p1]!, base: 19 } },
    };
    const noTrigger = apply(lowBase, {
      type: 'playCard',
      player: p1,
      instance: cid('conditional-card'),
    });
    expect(noTrigger.state.players[p1]?.energy).toBe(4);
  });

  it('supports keyword removal and the default attachment shape', () => {
    const initial = base();
    const withStack: State = {
      ...initial,
      stack: [
        {
          source: cid('spell'),
          controller: p1,
          kind: 'minion',
          target: cid('ally'),
          effects: [
            { op: 'removeKeyword', target: 'ownUnit', keyword: 'guard' },
            { op: 'attach', target: 'ownUnit' },
          ],
        },
      ],
      players: {
        ...initial.players,
        [p1]: { ...initial.players[p1]!, battlefield: [minion('ally', ['guard', 'shield'])] },
      },
    };
    const result = apply(withStack, { type: 'resolveStack', player: p1 });
    expect(result.state.players[p1]?.battlefield[0]?.keywords).toEqual(['shield']);
    expect(result.state.players[p1]?.battlefield[0]?.attachments?.[0]).toEqual({
      kind: 'minion',
      type: 'enchantment',
      attack: 0,
      health: 0,
    });
  });

  it('keeps multi-turn stuns active for the configured number of ready steps', () => {
    const initial = base();
    const target = {
      ...minion('enemy'),
      exhausted: true,
      status: 'stunned' as const,
      disabledTurns: 2,
    };
    const prepared: State = {
      ...initial,
      phase: 'end',
      players: { ...initial.players, [p2]: { ...initial.players[p2]!, battlefield: [target] } },
    };
    const ended = apply(prepared, { type: 'endTurn', player: p1 });
    expect(ended.state.players[p2]?.battlefield[0]).toMatchObject({
      status: 'stunned',
      disabledTurns: 1,
      exhausted: true,
    });
  });

  it('rejects unavailable choices and leaves choice state intact', () => {
    const initial: State = {
      ...base(),
      pendingChoice: {
        player: p1,
        source: cid('choice'),
        kind: 'minion',
        options: [[{ op: 'heal', target: 'self', amount: 1 }]],
      },
    };
    expect(apply(initial, { type: 'makeChoice', player: p2, option: 0 }).issues[0]?.code).toBe(
      'INVALID_CHOICE',
    );
    expect(apply(initial, { type: 'makeChoice', player: p1, option: 4 }).issues[0]?.code).toBe(
      'INVALID_CHOICE',
    );
  });

  it('no-ops safely when random targets and resurrection slots are unavailable', () => {
    const initial = base();
    const noEnemy: State = {
      ...initial,
      stack: [
        {
          source: cid('random'),
          controller: p1,
          kind: 'minion',
          effects: [{ op: 'randomDamage', target: 'enemyUnit', amount: 2 }],
          target: null,
        },
      ],
      players: { ...initial.players, [p2]: { ...initial.players[p2]!, battlefield: [] } },
    };
    expect(apply(noEnemy, { type: 'resolveStack', player: p1 }).state.players[p2]?.base).toBe(20);

    const full: State = {
      ...initial,
      stack: [
        {
          source: cid('raise'),
          controller: p1,
          kind: 'minion',
          effects: [{ op: 'resurrectUnit', target: 'self' }],
          target: null,
        },
      ],
      players: {
        ...initial.players,
        [p1]: {
          ...initial.players[p1]!,
          battlefield: [0, 1, 2, 3, 4].map((index) => minion(`ally-${String(index)}`)),
          discard: [{ id: cid('dead'), kind: 'minion' }],
        },
      },
    };
    const raised = apply(full, { type: 'resolveStack', player: p1 });
    expect(raised.state.players[p1]?.battlefield).toHaveLength(5);
    expect(raised.state.players[p1]?.discard.some((card) => card.id === cid('dead'))).toBe(true);
  });

  it('damages both armies with any-unit AOE and handles one-sided selectors', () => {
    const initial = base();
    const withStack: State = {
      ...initial,
      stack: [
        {
          source: cid('wave'),
          controller: p1,
          kind: 'minion',
          effects: [{ op: 'damageAll', target: 'anyUnit', amount: 1 }],
          target: null,
        },
      ],
      players: {
        ...initial.players,
        [p1]: { ...initial.players[p1]!, battlefield: [minion('ally')] },
      },
    };
    const result = apply(withStack, { type: 'resolveStack', player: p1 });
    expect(result.state.players[p1]?.battlefield[0]?.damage).toBe(1);
    expect(result.state.players[p2]?.battlefield[0]?.damage).toBe(1);
  });
});
