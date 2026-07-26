import { describe, expect, it } from 'vitest';
import { apply, applyDamageToTarget, checkWin, validateTarget } from './dispatcher.js';
import { seedRng } from './rng.js';
import { FOUNDRY_RULESET } from './ruleset.js';
import type { CardInstanceId, Player, PlayerId, State, Unit } from './types.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const missing = 'missing' as PlayerId;
const id = (value: string) => value as CardInstanceId;
const unit = (value: string, attack = 2, health = 3, keywords: readonly string[] = []): Unit => ({
  id: id(value),
  kind: value,
  attack,
  health,
  damage: 0,
  exhausted: false,
  ...(keywords.length ? { keywords } : {}),
  attacksThisTurn: 0,
  summonedTurn: 1,
});
const player = (value: PlayerId): Player => ({
  id: value,
  hand: [],
  deck: [],
  discard: [],
  exile: [],
  battlefield: [],
  base: 20,
  energy: 3,
  maxEnergy: 3,
  fatigueCount: 0,
  drawnThisTurn: false,
});
function state(): State {
  return {
    rng: seedRng(5),
    activePlayer: p1,
    phase: 'combat',
    turn: 2,
    winner: null,
    ruleset: FOUNDRY_RULESET,
    cards: {
      token: { kind: 'token', type: 'unit', cost: 0, attack: 1, health: 1 },
      striker: { kind: 'striker', type: 'unit', cost: 1, attack: 2, health: 2 },
      spell: { kind: 'spell', type: 'tactic', cost: 1 },
    },
    stack: [],
    players: { [p1]: player(p1), [p2]: player(p2) },
  };
}

describe('dispatcher defensive and alternate branches', () => {
  it('handles degenerate wins and missing damage targets without mutation', () => {
    const single: State = { ...state(), players: { [p1]: { ...player(p1), base: 0 } } };
    expect(checkWin(single, []).state.winner).toBeNull();
    const initial = state();
    expect(applyDamageToTarget(initial, missing, 'base', 2, []).state).toBe(initial);
    expect(applyDamageToTarget(initial, p2, id('absent'), 2, []).state).toBe(initial);
  });

  it('validates every public selector boundary', () => {
    const initial: State = {
      ...state(),
      players: {
        [p1]: { ...player(p1), battlefield: [unit('ally')] },
        [p2]: { ...player(p2), battlefield: [unit('enemy')] },
      },
    };
    expect(validateTarget(initial, p1, 'self', 'base')).toBe(true);
    expect(validateTarget(initial, p1, 'self', id('ally'))).toBe(false);
    expect(validateTarget(initial, p1, 'ownUnit', id('enemy'))).toBe(false);
    expect(validateTarget(initial, p1, 'enemyBase', id('enemy'))).toBe(false);
    expect(validateTarget(initial, p1, 'anyUnit', id('ally'))).toBe(true);
    expect(validateTarget(initial, missing, 'anyUnit', id('ally'))).toBe(false);
  });

  it('applies poisonous and lifesteal from the defending unit', () => {
    const initial: State = {
      ...state(),
      players: {
        [p1]: { ...player(p1), battlefield: [unit('attacker', 3, 4)] },
        [p2]: {
          ...player(p2),
          base: 10,
          battlefield: [unit('defender', 1, 5, ['poisonous', 'lifesteal'])],
        },
      },
    };
    const result = apply(initial, {
      type: 'attack',
      player: p1,
      attacker: id('attacker'),
      target: id('defender'),
    });
    expect(result.state.players[p1]?.battlefield).toEqual([]);
    expect(result.state.players[p2]?.base).toBe(11);
  });

  it('heals units, draws until empty, and summons with default values', () => {
    const initial: State = {
      ...state(),
      phase: 'main',
      stack: [
        {
          source: id('spell-source'),
          controller: p1,
          kind: 'spell',
          target: id('ally'),
          effects: [
            { op: 'heal', target: 'ownUnit', amount: 2 },
            { op: 'drawCards', target: 'self', amount: 3 },
            { op: 'summonUnit', target: 'self', kind: 'token' },
          ],
        },
      ],
      players: {
        [p1]: {
          ...player(p1),
          battlefield: [{ ...unit('ally'), damage: 2 }],
          deck: [{ id: id('drawn'), kind: 'striker' }],
        },
        [p2]: player(p2),
      },
    };
    const result = apply(initial, { type: 'resolveStack', player: p1 });
    expect(result.state.players[p1]?.battlefield[0]?.damage).toBe(0);
    expect(result.state.players[p1]?.battlefield[1]?.kind).toBe('token');
    expect(result.state.players[p1]?.hand).toEqual([{ id: id('drawn'), kind: 'striker' }]);
  });

  it('triggers attack and friendly-death secrets', () => {
    const attackSecret = {
      source: id('attack-secret'),
      kind: 'spell',
      trigger: 'onEnemyAttack' as const,
      effects: [{ op: 'heal' as const, target: 'self' as const, amount: 2 }],
    };
    const deathSecret = {
      source: id('death-secret'),
      kind: 'spell',
      trigger: 'onFriendlyDeath' as const,
      effects: [{ op: 'summonUnit' as const, target: 'self' as const, kind: 'token' }],
    };
    const initial: State = {
      ...state(),
      players: {
        [p1]: { ...player(p1), battlefield: [unit('attacker', 3, 3)] },
        [p2]: {
          ...player(p2),
          base: 10,
          battlefield: [unit('fragile', 0, 1)],
          secrets: [attackSecret, deathSecret],
        },
      },
    };
    const result = apply(initial, {
      type: 'attack',
      player: p1,
      attacker: id('attacker'),
      target: id('fragile'),
    });
    expect(result.state.players[p2]?.base).toBe(12);
    expect(
      result.state.players[p2]?.battlefield.some((candidate) => candidate.kind === 'token'),
    ).toBe(true);
    expect(result.state.players[p2]?.secrets).toBeUndefined();
  });

  it('returns invalid choice when no choice is pending', () => {
    expect(apply(state(), { type: 'makeChoice', player: p1, option: 0 }).issues[0]?.code).toBe(
      'INVALID_CHOICE',
    );
  });
});
