import { describe, expect, it } from 'vitest';
import { apply } from './dispatcher.js';
import { seedRng } from './rng.js';
import { FOUNDRY_RULESET } from './ruleset.js';
import type { CardInstanceId, EngineEffect, Player, PlayerId, State, Unit } from './types.js';

const a = 'a' as PlayerId;
const b = 'b' as PlayerId;
const id = (value: string) => value as CardInstanceId;
const unit = (keywords: readonly string[] = []): Unit => ({
  id: id('unit'),
  kind: 'unit',
  attack: 1,
  health: 2,
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
  base: 10,
  energy: 2,
  maxEnergy: 2,
  fatigueCount: 0,
  drawnThisTurn: false,
});
function withEffects(
  effects: readonly EngineEffect[],
  target: CardInstanceId | 'base' | null = id('unit'),
): State {
  return {
    rng: seedRng(4),
    activePlayer: a,
    phase: 'main',
    turn: 1,
    winner: null,
    ruleset: FOUNDRY_RULESET,
    cards: {
      unit: { kind: 'unit', type: 'unit', cost: 1, attack: 1, health: 2 },
      tactic: { kind: 'tactic', type: 'tactic', cost: 0, effects },
    },
    stack: [{ source: id('source'), controller: a, kind: 'tactic', effects, target }],
    players: {
      [a]: { ...player(a), battlefield: [unit(['guard'])] },
      [b]: player(b),
    },
  };
}
const resolve = (state: State) => apply(state, { type: 'resolveStack', player: a });

describe('remaining declarative fallback paths', () => {
  it('removes the last keyword and clamps permanent health and attachment stats', () => {
    const result = resolve(
      withEffects([
        { op: 'removeKeyword', target: 'ownUnit', keyword: 'guard' },
        { op: 'modifyStat', target: 'ownUnit', stat: 'health', amount: -20 },
        { op: 'attach', target: 'ownUnit', attack: -20, health: -20 },
      ]),
    );
    expect(result.state.players[a]?.battlefield[0]).toMatchObject({ attack: 0, health: 1 });
    expect(result.state.players[a]?.battlefield[0]?.keywords).toBeUndefined();
  });

  it('ignores empty choices, invalid secrets, and missing adjacent anchors', () => {
    const result = resolve(
      withEffects(
        [
          { op: 'chooseOne', options: [] },
          { op: 'setSecret', trigger: 'onPlay', effects: [] },
          { op: 'damageAdjacent', target: 'ownUnit', amount: 3 },
        ],
        id('absent'),
      ),
    );
    expect(result.state.pendingChoice).toBeUndefined();
    expect(result.state.players[a]?.secrets).toBeUndefined();
    expect(result.state.players[a]?.battlefield[0]?.damage).toBe(0);
  });

  it('handles empty resurrection piles, non-unit cards, and default healing amounts', () => {
    const empty = resolve(
      withEffects([
        { op: 'resurrectUnit', target: 'self' },
        { op: 'heal', target: 'self' },
      ]),
    );
    expect(empty.state.players[a]?.battlefield).toHaveLength(1);
    expect(empty.state.players[a]?.base).toBe(10);

    const initial = withEffects([{ op: 'resurrectUnit', target: 'self' }]);
    const nonUnit: State = {
      ...initial,
      players: {
        ...initial.players,
        [a]: { ...initial.players[a]!, discard: [{ id: id('dead-tactic'), kind: 'tactic' }] },
      },
    };
    expect(resolve(nonUnit).state.players[a]?.battlefield).toHaveLength(1);
  });

  it('allows zero damage through shield without consuming it', () => {
    const result = resolve(withEffects([{ op: 'dealDamage', target: 'ownUnit', amount: 0 }]));
    expect(result.state.players[a]?.battlefield[0]?.keywords).toEqual(['guard']);
    expect(result.state.players[a]?.battlefield[0]?.damage).toBe(0);
  });
});
