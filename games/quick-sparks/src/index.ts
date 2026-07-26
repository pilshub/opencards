import {
  defineRuleset,
  type CardKind,
  type CardSpec,
  type PlayerId,
  type Ruleset,
  type SetupOpts,
} from '@opencards/core';

/** A deliberately different microgame proving ruleset portability. */
export const QUICK_SPARKS_RULESET: Ruleset = defineRuleset({
  id: 'opencards.quick-sparks',
  version: 1,
  phases: ['start', 'combat', 'main', 'end'],
  startingPhase: 'start',
  battlefieldLimit: 3,
  handLimit: 6,
  energy: { gainPerTurn: 0, maximum: 3, refillAtTurnStart: true },
  fatigue: { enabled: true, firstDamage: 2, increment: 0 },
});

export const QUICK_SPARKS_CARDS: readonly CardSpec[] = Object.freeze([
  {
    kind: 'quick-spark' as CardKind,
    type: 'unit',
    cost: 1,
    attack: 2,
    health: 1,
    keywords: ['haste'],
  },
  {
    kind: 'quick-wall' as CardKind,
    type: 'unit',
    cost: 1,
    attack: 1,
    health: 3,
    keywords: ['guard'],
  },
  {
    kind: 'quick-leech' as CardKind,
    type: 'unit',
    cost: 2,
    attack: 2,
    health: 2,
    keywords: ['lifesteal'],
  },
  {
    kind: 'quick-bolt' as CardKind,
    type: 'tactic',
    cost: 1,
    effects: [{ op: 'dealDamage', amount: 2, target: 'enemyUnitOrBase' }],
  },
  {
    kind: 'quick-swarm' as CardKind,
    type: 'tactic',
    cost: 2,
    effects: [{ op: 'summonUnit', kind: 'quick-spark' as CardKind, target: 'self' }],
  },
  {
    kind: 'quick-choice' as CardKind,
    type: 'tactic',
    cost: 1,
    effects: [
      {
        op: 'chooseOne',
        options: [
          [{ op: 'gainResource', amount: 1, target: 'self' }],
          [{ op: 'heal', amount: 2, target: 'self' }],
        ],
      },
    ],
  },
]);

const deck = (kinds: readonly string[]): readonly CardKind[] =>
  kinds.map((kind) => kind as CardKind);
export const QUICK_SPARKS_DECK = Object.freeze(
  deck([
    'quick-spark',
    'quick-wall',
    'quick-bolt',
    'quick-leech',
    'quick-spark',
    'quick-swarm',
    'quick-bolt',
    'quick-choice',
  ]),
);

export function createQuickSparksSetup(seed: number, players: readonly PlayerId[]): SetupOpts {
  if (players.length !== 2) throw new Error('Quick Sparks requires exactly two players');
  return {
    seed,
    players,
    deckSize: 8,
    openingHandSize: 4,
    cardKinds: QUICK_SPARKS_CARDS.map((card) => card.kind),
    decklist: QUICK_SPARKS_DECK,
    cards: QUICK_SPARKS_CARDS,
    baseTotal: 10,
    startingEnergy: 3,
    ruleset: QUICK_SPARKS_RULESET,
  };
}
