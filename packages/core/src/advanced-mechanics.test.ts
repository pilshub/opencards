import { describe, expect, it } from 'vitest';
import { apply } from './dispatcher.js';
import { getLegalCommands } from './legal.js';
import { seedRng } from './rng.js';
import { FOUNDRY_RULESET } from './ruleset.js';
import type {
  CardInstanceId,
  CardSpec,
  EngineEffect,
  Player,
  PlayerId,
  StackItem,
  State,
  Unit,
} from './types.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const id = (value: string) => value as CardInstanceId;

function unit(
  value: string,
  kind = value,
  attack = 2,
  health = 3,
  keywords: readonly string[] = [],
): Unit {
  return {
    id: id(value),
    kind,
    attack,
    health,
    damage: 0,
    exhausted: false,
    ...(keywords.length === 0 ? {} : { keywords }),
    attacksThisTurn: 0,
    summonedTurn: 1,
  };
}

function player(playerId: PlayerId): Player {
  return {
    id: playerId,
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
  };
}

function state(
  effects: readonly EngineEffect[] = [],
  target: CardInstanceId | 'base' | null = null,
): State {
  const source = id('source');
  const stack: StackItem[] =
    effects.length === 0 ? [] : [{ source, controller: p1, kind: 'spell', effects, target }];
  const cards: Record<string, CardSpec> = {
    spell: { kind: 'spell', type: 'tactic', cost: 0, effects },
    token: { kind: 'token', type: 'unit', cost: 0, attack: 1, health: 1 },
    minion: { kind: 'minion', type: 'unit', cost: 1, attack: 2, health: 2 },
  };
  return {
    rng: seedRng(123),
    activePlayer: p1,
    phase: 'main',
    turn: 3,
    winner: null,
    ruleset: FOUNDRY_RULESET,
    cards,
    stack,
    players: {
      [p1]: { ...player(p1), battlefield: [unit('ally')] },
      [p2]: { ...player(p2), battlefield: [unit('left'), unit('middle'), unit('right')] },
    },
  };
}

function resolve(initial: State) {
  return apply(initial, { type: 'resolveStack', player: p1 });
}

describe('advanced declarative mechanics', () => {
  it('applies freeze and skips the next ready step', () => {
    const frozen = resolve(
      state(
        [{ op: 'applyStatus', target: 'enemyUnit', status: 'frozen', duration: 1 }],
        id('middle'),
      ),
    );
    expect(frozen.issues).toEqual([]);
    expect(frozen.state.players[p2]?.battlefield[1]).toMatchObject({
      exhausted: true,
      status: 'frozen',
      disabledTurns: 1,
    });

    const ended = apply({ ...frozen.state, phase: 'end' }, { type: 'endTurn', player: p1 });
    const middle = ended.state.players[p2]?.battlefield[1];
    expect(middle?.exhausted).toBe(true);
    expect(middle?.status).toBeUndefined();
  });

  it('supports permanent buffs, keywords, attachments, and silence', () => {
    const enhanced = resolve(
      state(
        [
          { op: 'modifyStat', target: 'ownUnit', stat: 'attack', amount: 2 },
          { op: 'addKeyword', target: 'ownUnit', keyword: 'guard' },
          {
            op: 'attach',
            target: 'ownUnit',
            kind: 'blade',
            attachmentType: 'equipment',
            attack: 1,
            health: 2,
          },
        ],
        id('ally'),
      ),
    );
    const ally = enhanced.state.players[p1]?.battlefield[0];
    expect(ally).toMatchObject({ attack: 5, health: 5, keywords: ['guard'] });
    expect(ally?.attachments?.[0]).toMatchObject({ kind: 'blade', type: 'equipment' });

    const silenceState: State = {
      ...enhanced.state,
      stack: [
        {
          source: id('silence'),
          controller: p2,
          kind: 'spell',
          effects: [{ op: 'silence', target: 'enemyUnit' }],
          target: id('ally'),
        },
      ],
    };
    const silenced = apply(silenceState, { type: 'resolveStack', player: p2 });
    expect(silenced.state.players[p1]?.battlefield[0]?.silenced).toBe(true);
    expect(silenced.state.players[p1]?.battlefield[0]?.keywords).toBeUndefined();
  });

  it('sets and consumes hidden-style secrets on enemy play', () => {
    const secret = resolve(
      state([
        {
          op: 'setSecret',
          trigger: 'onEnemyPlay',
          effects: [{ op: 'dealDamage', target: 'enemyBase', amount: 3 }],
        },
      ]),
    );
    expect(secret.state.players[p1]?.secrets).toHaveLength(1);

    const playable: State = {
      ...secret.state,
      activePlayer: p2,
      phase: 'main',
      players: {
        ...secret.state.players,
        [p2]: { ...secret.state.players[p2]!, hand: [{ id: id('p2-card'), kind: 'minion' }] },
      },
    };
    const played = apply(playable, { type: 'playCard', player: p2, instance: id('p2-card') });
    expect(played.issues).toEqual([]);
    expect(played.state.players[p2]?.base).toBe(17);
    expect(played.state.players[p1]?.secrets).toBeUndefined();
    expect(played.events.some((event) => event.type === 'secretTriggered')).toBe(true);
  });

  it('resurrects units and enforces the battlefield limit', () => {
    const initial = state([{ op: 'resurrectUnit', target: 'self', kind: 'token' }]);
    const withDiscard: State = {
      ...initial,
      players: {
        ...initial.players,
        [p1]: { ...initial.players[p1]!, discard: [{ id: id('dead'), kind: 'token' }] },
      },
    };
    const result = resolve(withDiscard);
    expect(
      result.state.players[p1]?.battlefield.some((candidate) => candidate.id === id('dead')),
    ).toBe(true);
    expect(result.state.players[p1]?.discard).toEqual([{ id: id('source'), kind: 'spell' }]);
  });

  it('deals area and adjacent damage with simultaneous death processing', () => {
    const area = resolve(state([{ op: 'damageAll', target: 'enemyUnit', amount: 1 }]));
    expect(area.state.players[p2]?.battlefield.map((candidate) => candidate.damage)).toEqual([
      1, 1, 1,
    ]);

    const adjacent = resolve(
      state([{ op: 'damageAdjacent', target: 'enemyUnit', amount: 2 }], id('middle')),
    );
    expect(adjacent.state.players[p2]?.battlefield.map((candidate) => candidate.damage)).toEqual([
      2, 0, 2,
    ]);
  });

  it('uses canonical RNG state for random damage', () => {
    const initial = state([{ op: 'randomDamage', target: 'enemyUnit', amount: 2 }]);
    const first = resolve(initial);
    const second = resolve(initial);
    expect(first.state).toEqual(second.state);
    expect(first.state.rng).not.toEqual(initial.rng);
    expect(
      first.state.players[p2]?.battlefield.filter((candidate) => candidate.damage === 2),
    ).toHaveLength(1);
  });

  it('blocks other commands until a declared choice is made', () => {
    const requested = resolve(
      state([
        {
          op: 'chooseOne',
          options: [
            [{ op: 'gainResource', target: 'self', amount: 2 }],
            [{ op: 'heal', target: 'self', amount: 4 }],
          ],
        },
      ]),
    );
    expect(requested.state.pendingChoice?.options).toHaveLength(2);
    expect(getLegalCommands(requested.state, p1)).toEqual([
      { type: 'makeChoice', player: p1, option: 0 },
      { type: 'makeChoice', player: p1, option: 1 },
    ]);
    expect(apply(requested.state, { type: 'endTurn', player: p1 }).issues[0]?.code).toBe(
      'CHOICE_PENDING',
    );

    const chosen = apply(requested.state, { type: 'makeChoice', player: p1, option: 0 });
    expect(chosen.issues).toEqual([]);
    expect(chosen.state.pendingChoice).toBeUndefined();
    expect(chosen.state.players[p1]?.energy).toBe(7);
  });
});
