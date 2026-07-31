import { describe, expect, it } from 'vitest';
import { apply, validateTarget } from './dispatcher.js';
import { getLegalCommands } from './legal.js';
import { seedRng } from './rng.js';
import { FOUNDRY_RULESET } from './ruleset.js';
import type { CardInstanceId, CardSpec, Command, Player, PlayerId, State, Unit } from './types.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;

const card = (id: string, kind: string) => ({ id: id as CardInstanceId, kind });

const unit = (
  id: string,
  kind: string,
  attack: number,
  health: number,
  keywords: readonly string[] = [],
  exhausted = false,
  summonedTurn = 0,
): Unit => ({
  id: id as CardInstanceId,
  kind,
  attack,
  health,
  damage: 0,
  exhausted,
  ...(keywords.length === 0 ? {} : { keywords }),
  attacksThisTurn: 0,
  summonedTurn,
});

const player = (id: PlayerId): Player => ({
  id,
  hand: [],
  deck: [],
  discard: [],
  exile: [],
  battlefield: [],
  base: 20,
  energy: 10,
  maxEnergy: 10,
  fatigueCount: 0,
  drawnThisTurn: false,
});

const state = (cards: Readonly<Record<string, CardSpec>> = {}): State => ({
  rng: seedRng(7),
  activePlayer: p1,
  phase: 'combat',
  turn: 3,
  winner: null,
  ruleset: FOUNDRY_RULESET,
  cards,
  stack: [],
  players: { [p1]: player(p1), [p2]: player(p2) },
});

describe('Foundry keyword semantics', () => {
  it('forces attacks into a visible guard and leaves rejected state untouched', () => {
    const initial: State = {
      ...state(),
      players: {
        [p1]: { ...player(p1), battlefield: [unit('a', 'attacker', 3, 3)] },
        [p2]: {
          ...player(p2),
          battlefield: [unit('g', 'guard', 1, 4, ['guard']), unit('x', 'other', 2, 2)],
        },
      },
    };

    const baseAttack = apply(initial, {
      type: 'attack',
      player: p1,
      attacker: 'a' as CardInstanceId,
      target: 'base',
    });
    expect(baseAttack.state).toBe(initial);
    expect(baseAttack.issues[0]?.code).toBe('GUARD_BLOCKS_ATTACK');

    const guardAttack = apply(initial, {
      type: 'attack',
      player: p1,
      attacker: 'a' as CardInstanceId,
      target: 'g' as CardInstanceId,
    });
    expect(guardAttack.issues).toEqual([]);
    expect(guardAttack.state.players[p2]?.battlefield[0]?.damage).toBe(3);
  });

  it('hides stealth units from attacks and targeted effects until they attack', () => {
    const hidden = unit('hidden', 'scout', 2, 2, ['stealth']);
    const initial: State = {
      ...state(),
      players: {
        [p1]: { ...player(p1), battlefield: [unit('a', 'attacker', 1, 3)] },
        [p2]: { ...player(p2), battlefield: [hidden] },
      },
    };

    expect(validateTarget(initial, p1, 'enemyUnit', hidden.id)).toBe(false);
    expect(
      apply(initial, {
        type: 'attack',
        player: p1,
        attacker: 'a' as CardInstanceId,
        target: hidden.id,
      }).issues[0]?.code,
    ).toBe('INVALID_TARGET');

    const attackingState: State = { ...initial, activePlayer: p2 };
    const revealed = apply(attackingState, {
      type: 'attack',
      player: p2,
      attacker: hidden.id,
      target: 'base',
    });
    expect(revealed.issues).toEqual([]);
    expect(revealed.state.players[p2]?.battlefield[0]?.keywords).toBeUndefined();
  });

  it('lets rush attack a unit immediately but reserves base attacks for charge or haste', () => {
    const rush = unit('rush', 'runner', 2, 2, ['rush'], false, 3);
    const charge = unit('charge', 'charger', 2, 2, ['charge'], false, 3);
    const initial: State = {
      ...state(),
      players: {
        [p1]: { ...player(p1), battlefield: [rush, charge] },
        [p2]: { ...player(p2), battlefield: [unit('target', 'target', 1, 3)] },
      },
    };

    expect(
      apply(initial, { type: 'attack', player: p1, attacker: rush.id, target: 'base' }).issues[0]
        ?.code,
    ).toBe('RUSH_CANNOT_ATTACK_BASE');
    expect(
      apply(initial, {
        type: 'attack',
        player: p1,
        attacker: rush.id,
        target: 'target' as CardInstanceId,
      }).issues,
    ).toEqual([]);
    expect(
      apply(initial, { type: 'attack', player: p1, attacker: charge.id, target: 'base' }).state
        .players[p2]?.base,
    ).toBe(18);
  });

  it('absorbs poison with shield, then applies poison after shield is gone', () => {
    const poisonous = unit('venom', 'venom', 1, 3, ['poisonous']);
    const shielded = unit('shield', 'shield', 5, 5, ['shield']);
    const initial: State = {
      ...state(),
      players: {
        [p1]: { ...player(p1), battlefield: [poisonous] },
        [p2]: { ...player(p2), battlefield: [shielded] },
      },
    };

    const first = apply(initial, {
      type: 'attack',
      player: p1,
      attacker: poisonous.id,
      target: shielded.id,
    });
    expect(first.state.players[p2]?.battlefield).toHaveLength(1);
    expect(first.state.players[p2]?.battlefield[0]?.damage).toBe(0);
    expect(first.events.some((event) => event.type === 'shieldBroken')).toBe(true);

    const ready: State = {
      ...first.state,
      players: {
        ...first.state.players,
        [p1]: {
          ...first.state.players[p1]!,
          battlefield: [unit('venom-2', 'venom', 1, 3, ['poisonous'])],
        },
      },
    };
    const second = apply(ready, {
      type: 'attack',
      player: p1,
      attacker: 'venom-2' as CardInstanceId,
      target: shielded.id,
    });
    expect(second.state.players[p2]?.battlefield).toEqual([]);
  });

  it('heals lifesteal by effective combat damage, including overkill', () => {
    const initial: State = {
      ...state(),
      players: {
        [p1]: {
          ...player(p1),
          base: 10,
          battlefield: [unit('leech', 'leech', 5, 4, ['lifesteal'])],
        },
        [p2]: { ...player(p2), battlefield: [unit('small', 'small', 0, 2)] },
      },
    };
    const result = apply(initial, {
      type: 'attack',
      player: p1,
      attacker: 'leech' as CardInstanceId,
      target: 'small' as CardInstanceId,
    });
    expect(result.state.players[p1]?.base).toBe(12);
    expect(result.events).toContainEqual({ type: 'healed', target: 'base', amount: 2, owner: p1 });
  });

  it('keeps a windfury unit ready after its first attack in a turn', () => {
    const windfury = unit('wf', 'windfury', 2, 3, ['windfury']);
    const initial: State = {
      ...state(),
      players: {
        [p1]: { ...player(p1), battlefield: [windfury] },
        [p2]: { ...player(p2), battlefield: [unit('target', 'target', 1, 6)] },
      },
    };

    const first = apply(initial, {
      type: 'attack',
      player: p1,
      attacker: windfury.id,
      target: 'target' as CardInstanceId,
    });

    expect(first.issues).toEqual([]);
    expect(first.state.players[p1]?.battlefield[0]?.exhausted).toBe(false);
    expect(first.state.players[p1]?.battlefield[0]?.attacksThisTurn).toBe(1);
  });

  it('exhausts a windfury unit only after its second attack and rejects a third', () => {
    const windfury = unit('wf', 'windfury', 2, 3, ['windfury']);
    const initial: State = {
      ...state(),
      players: {
        [p1]: { ...player(p1), battlefield: [windfury] },
        [p2]: { ...player(p2), battlefield: [unit('target', 'target', 1, 6)] },
      },
    };
    const attack = {
      type: 'attack' as const,
      player: p1,
      attacker: windfury.id,
      target: 'target' as CardInstanceId,
    };

    const first = apply(initial, attack);
    const second = apply(first.state, attack);
    expect(second.issues).toEqual([]);
    expect(second.state.players[p1]?.battlefield[0]?.exhausted).toBe(true);
    expect(second.state.players[p1]?.battlefield[0]?.attacksThisTurn).toBe(2);

    const third = apply(second.state, attack);
    expect(third.state).toBe(second.state);
    expect(third.issues[0]?.code).toBe('UNIT_EXHAUSTED');
  });

  it('readies a windfury unit with reset attacksThisTurn at the start of its controller next turn', () => {
    const windfury = unit('wf', 'windfury', 2, 3, ['windfury']);
    const initial: State = {
      ...state(),
      players: {
        [p1]: { ...player(p1), battlefield: [windfury] },
        [p2]: { ...player(p2), battlefield: [unit('target', 'target', 1, 6)] },
      },
    };
    const attack = {
      type: 'attack' as const,
      player: p1,
      attacker: windfury.id,
      target: 'target' as CardInstanceId,
    };

    const twice = apply(apply(initial, attack).state, attack);
    expect(twice.state.players[p1]?.battlefield[0]?.exhausted).toBe(true);

    const afterOpponentTurn = apply(twice.state, { type: 'endTurn', player: p1 });
    const afterOwnTurn = apply(afterOpponentTurn.state, { type: 'endTurn', player: p2 });
    const readied = afterOwnTurn.state.players[p1]?.battlefield[0];
    expect(readied?.exhausted).toBe(false);
    expect(readied?.attacksThisTurn).toBe(0);
  });

  it('exhausts a unit without windfury after a single attack', () => {
    const attacker = unit('plain', 'plain', 2, 3);
    const initial: State = {
      ...state(),
      players: {
        [p1]: { ...player(p1), battlefield: [attacker] },
        [p2]: { ...player(p2), battlefield: [unit('target', 'target', 1, 6)] },
      },
    };

    const result = apply(initial, {
      type: 'attack',
      player: p1,
      attacker: attacker.id,
      target: 'target' as CardInstanceId,
    });

    expect(result.issues).toEqual([]);
    expect(result.state.players[p1]?.battlefield[0]?.exhausted).toBe(true);
    expect(result.state.players[p1]?.battlefield[0]?.attacksThisTurn).toBe(1);
  });

  it('consumes stealth on a windfury unit first attack without exhausting it', () => {
    const windfury = unit('wf', 'wf', 2, 3, ['windfury', 'stealth']);
    const initial: State = {
      ...state(),
      players: {
        [p1]: { ...player(p1), battlefield: [windfury] },
        [p2]: { ...player(p2), battlefield: [unit('target', 'target', 1, 3)] },
      },
    };

    const result = apply(initial, {
      type: 'attack',
      player: p1,
      attacker: windfury.id,
      target: 'base',
    });

    expect(result.issues).toEqual([]);
    const after = result.state.players[p1]?.battlefield[0];
    expect(after?.keywords).toEqual(['windfury']);
    expect(after?.exhausted).toBe(false);
    expect(after?.attacksThisTurn).toBe(1);
  });

  it('keeps a windfury attack legal after the first attack and drops it after the second', () => {
    const windfury = unit('wf', 'windfury', 2, 3, ['windfury']);
    const target = unit('target', 'target', 1, 6);
    const initial: State = {
      ...state(),
      players: {
        [p1]: { ...player(p1), battlefield: [windfury] },
        [p2]: { ...player(p2), battlefield: [target] },
      },
    };
    const attack = (): Command => ({
      type: 'attack',
      player: p1,
      attacker: windfury.id,
      target: target.id,
    });

    expect(getLegalCommands(initial, p1)).toContainEqual(attack());

    const first = apply(initial, attack());
    expect(first.issues).toEqual([]);
    expect(getLegalCommands(first.state, p1)).toContainEqual(attack());

    const second = apply(first.state, attack());
    expect(second.issues).toEqual([]);
    expect(getLegalCommands(second.state, p1)).not.toContainEqual(attack());
  });
});

describe('declarative ability triggers', () => {
  const cards: Readonly<Record<string, CardSpec>> = {
    herald: {
      kind: 'herald',
      type: 'unit',
      cost: 2,
      attack: 2,
      health: 2,
      abilities: [
        { trigger: 'onPlay', effects: [{ op: 'dealDamage', amount: 2, target: 'enemyBase' }] },
      ],
    },
    egg: {
      kind: 'egg',
      type: 'unit',
      cost: 1,
      attack: 0,
      health: 1,
      abilities: [
        { trigger: 'onDeath', effects: [{ op: 'summonUnit', kind: 'token', target: 'self' }] },
      ],
    },
    token: { kind: 'token', type: 'unit', cost: 0, attack: 1, health: 1 },
    drummer: {
      kind: 'drummer',
      type: 'unit',
      cost: 1,
      attack: 1,
      health: 3,
      abilities: [
        { trigger: 'onAttack', effects: [{ op: 'gainResource', amount: 1, target: 'self' }] },
        { trigger: 'turnEnd', effects: [{ op: 'heal', amount: 1, target: 'self' }] },
      ],
    },
  };

  it('resolves on-play abilities through the standard effect pipeline', () => {
    const initial: State = {
      ...state(cards),
      phase: 'main',
      players: {
        [p1]: { ...player(p1), hand: [card('herald-card', 'herald')] },
        [p2]: player(p2),
      },
    };
    const result = apply(initial, {
      type: 'playCard',
      player: p1,
      instance: 'herald-card' as CardInstanceId,
    });
    expect(result.issues).toEqual([]);
    expect(result.state.players[p2]?.base).toBe(18);
    expect(
      result.events.some(
        (event) => event.type === 'abilityTriggered' && event.trigger === 'onPlay',
      ),
    ).toBe(true);
  });

  it('resolves death, attack, and turn abilities deterministically', () => {
    const initial: State = {
      ...state(cards),
      players: {
        [p1]: {
          ...player(p1),
          base: 10,
          battlefield: [unit('egg', 'egg', 0, 1), unit('drum', 'drummer', 1, 3)],
        },
        [p2]: { ...player(p2), battlefield: [unit('killer', 'killer', 2, 3)] },
      },
    };

    const killed = apply(
      { ...initial, activePlayer: p2 },
      {
        type: 'attack',
        player: p2,
        attacker: 'killer' as CardInstanceId,
        target: 'egg' as CardInstanceId,
      },
    );
    expect(
      killed.state.players[p1]?.battlefield.some((candidate) => candidate.kind === 'token'),
    ).toBe(true);
    expect(
      killed.events.some(
        (event) => event.type === 'abilityTriggered' && event.trigger === 'onDeath',
      ),
    ).toBe(true);

    const attacked = apply(initial, {
      type: 'attack',
      player: p1,
      attacker: 'drum' as CardInstanceId,
      target: 'base',
    });
    expect(attacked.state.players[p1]?.energy).toBe(11);

    const ended = apply({ ...initial, phase: 'end' }, { type: 'endTurn', player: p1 });
    expect(ended.state.players[p1]?.base).toBe(11);
    expect(
      ended.events.some(
        (event) => event.type === 'abilityTriggered' && event.trigger === 'turnEnd',
      ),
    ).toBe(true);
  });
});
