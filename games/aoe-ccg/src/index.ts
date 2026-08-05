import {
  defineRuleset,
  type CardKind,
  type CardSpec,
  type EngineEffect,
  type PlayerId,
  type Ruleset,
  type SetupOpts,
} from '@opencards/core';

/**
 * AoE CCG — Age of Empires themed card game built on the @opencards engine.
 *
 * Design note: the engine does not support hard age-gating on card legality
 * without touching packages/core, so the Feudal -> Castle -> Imperial "age"
 * progression is projected onto the economy: the "Advance to X Age" tactics
 * provide energy ramp + card draw, and expensive late-game units fall
 * naturally on the cost curve (energy grows 1/turn to a cap of 12).
 * The Wonder keeps its alternate-win condition via a self counter.
 */

export const AOE_RULESET: Ruleset = defineRuleset({
  id: 'aoe-ccg',
  version: 1,
  phases: ['start', 'main', 'combat', 'end'],
  startingPhase: 'start',
  battlefieldLimit: 6,
  handLimit: 8,
  energy: { gainPerTurn: 1, maximum: 12, refillAtTurnStart: true },
  fatigue: { enabled: true, firstDamage: 1, increment: 1 },
});

export type AoeFaction = 'britons' | 'franks' | 'neutral';

type UnitKey = 'keywords' | 'abilities';
type UnitOptions = Partial<Pick<CardSpec, UnitKey>>;

const unit = (
  kind: string,
  cost: number,
  attack: number,
  health: number,
  options: UnitOptions = {},
): CardSpec => ({
  kind: kind as CardKind,
  type: 'unit',
  cost,
  attack,
  health,
  ...(options.keywords === undefined ? {} : { keywords: options.keywords }),
  ...(options.abilities === undefined ? {} : { abilities: options.abilities }),
});

const tactic = (kind: string, cost: number, effects: readonly EngineEffect[]): CardSpec => ({
  kind: kind as CardKind,
  type: 'tactic',
  cost,
  effects,
});

export const AOE_CARDS: readonly CardSpec[] = Object.freeze([
  // ---- Neutral ----
  unit('villager', 1, 1, 1, {
    abilities: [
      { trigger: 'turnStart', effects: [{ op: 'gainResource', amount: 1, target: 'self' }] },
    ],
  }),
  unit('town-militia', 1, 2, 1),
  unit('monk', 3, 1, 4, {
    keywords: ['lifesteal'],
    abilities: [{ trigger: 'turnEnd', effects: [{ op: 'heal', amount: 1, target: 'ownUnit' }] }],
  }),
  tactic('advance-castle-age', 3, [
    { op: 'gainResource', amount: 2, target: 'self' },
    { op: 'drawCards', amount: 1, target: 'self' },
  ]),
  tactic('advance-imperial-age', 5, [
    { op: 'gainResource', amount: 3, target: 'self' },
    { op: 'drawCards', amount: 2, target: 'self' },
  ]),
  unit('wonder', 8, 0, 12, {
    keywords: ['guard'],
    abilities: [
      {
        trigger: 'turnStart',
        effects: [{ op: 'addCounter', counter: 'wonder-progress', amount: 1, target: 'self' }],
      },
      {
        trigger: 'turnStart',
        conditions: [
          {
            subject: 'source',
            metric: 'counter',
            counter: 'wonder-progress',
            operator: 'gte',
            value: 4,
          },
        ],
        effects: [{ op: 'dealDamage', amount: 999, target: 'enemyBase' }],
      },
    ],
  }),

  // ---- Britons (longbows, scale, wide clear) ----
  unit('sheep-herder', 2, 1, 3, {
    abilities: [
      { trigger: 'onPlay', effects: [{ op: 'gainResource', amount: 2, target: 'self' }] },
    ],
  }),
  unit('yeoman-archer', 2, 2, 2, { keywords: ['rush'] }),
  unit('longbowman', 3, 3, 2, { keywords: ['rush'] }),
  tactic('fletching-upgrade', 2, [
    { op: 'modifyStat', amount: 2, stat: 'attack', target: 'ownUnit' },
  ]),
  unit('castle', 4, 0, 6, {
    keywords: ['guard'],
    abilities: [
      { trigger: 'turnStart', effects: [{ op: 'drawCards', amount: 1, target: 'self' }] },
    ],
  }),
  tactic('longbow-volley', 4, [{ op: 'damageAll', amount: 2, target: 'enemyUnit' }]),
  unit('elite-longbowman', 5, 4, 5, {
    keywords: ['rush'],
    abilities: [
      {
        trigger: 'onPlay',
        conditions: [{ subject: 'controller', metric: 'units', operator: 'gte', value: 2 }],
        effects: [{ op: 'drawCards', amount: 1, target: 'self' }],
      },
    ],
  }),
  unit('king-arthur', 7, 5, 6, {
    keywords: ['rush'],
    abilities: [
      {
        trigger: 'onPlay',
        effects: [
          { op: 'modifyStat', amount: 3, stat: 'attack', target: 'ownUnit' },
          { op: 'modifyStat', amount: 2, stat: 'health', target: 'ownUnit' },
        ],
      },
    ],
  }),

  // ---- Franks (heavy cavalry, charge, face burst) ----
  unit('scout-cavalry', 2, 2, 2, { keywords: ['charge'] }),
  unit('throwing-axeman', 3, 3, 3),
  tactic('foraging', 2, [{ op: 'gainResource', amount: 3, target: 'self' }]),
  tactic('chivalry', 2, [
    { op: 'modifyStatUntilEndOfTurn', amount: 2, stat: 'attack', target: 'ownUnit' },
    { op: 'addKeyword', keyword: 'charge', target: 'ownUnit' },
  ]),
  unit('knight', 4, 4, 4, { keywords: ['charge'] }),
  unit('battering-ram', 5, 3, 6, {
    abilities: [
      { trigger: 'onAttack', effects: [{ op: 'dealDamage', amount: 2, target: 'enemyBase' }] },
    ],
  }),
  unit('paladin', 6, 6, 6, { keywords: ['charge'] }),
  unit('charlemagne', 7, 5, 7, {
    keywords: ['charge'],
    abilities: [
      { trigger: 'onPlay', effects: [{ op: 'dealDamage', amount: 4, target: 'enemyBase' }] },
    ],
  }),
]);

const copies = (kinds: readonly string[]): readonly CardKind[] =>
  kinds.flatMap((kind) => [kind as CardKind, kind as CardKind]);

export const BRITON_STARTER_DECK: readonly CardKind[] = Object.freeze(
  copies([
    'villager',
    'town-militia',
    'sheep-herder',
    'yeoman-archer',
    'longbowman',
    'fletching-upgrade',
    'advance-castle-age',
    'castle',
    'longbow-volley',
    'elite-longbowman',
    'advance-imperial-age',
    'king-arthur',
  ]),
);

export const FRANK_STARTER_DECK: readonly CardKind[] = Object.freeze(
  copies([
    'villager',
    'town-militia',
    'scout-cavalry',
    'foraging',
    'throwing-axeman',
    'chivalry',
    'advance-castle-age',
    'knight',
    'battering-ram',
    'advance-imperial-age',
    'paladin',
    'charlemagne',
  ]),
);

export type AoeDeckId = 'britons' | 'franks';

export function createAoeCcgSetup(seed: number, players: readonly PlayerId[]): SetupOpts {
  const [first, second] = players;
  if (first === undefined || second === undefined || players.length !== 2) {
    throw new Error('AoE CCG requires exactly two players');
  }
  return {
    seed,
    players,
    deckSize: 24,
    openingHandSize: 4,
    cardKinds: AOE_CARDS.map((card) => card.kind),
    decklists: {
      [first]: BRITON_STARTER_DECK,
      [second]: FRANK_STARTER_DECK,
    },
    baseTotal: 30,
    startingEnergy: 1,
    cards: AOE_CARDS,
    ruleset: AOE_RULESET,
  };
}

const AOE_TUTORIALS = Object.freeze([
  {
    id: 'villagers-job',
    title: '1. El trabajo del aldeano',
    seed: 31,
    objective: 'Juega dos unidades el turno 4 gracias al aldeano.',
    focus: 'El aldeano genera energia al inicio de turno.',
  },
  {
    id: 'charge',
    title: '2. ¡A la carga!',
    seed: 41,
    objective: 'Usa la Caballeria Exploradora para atacar la base de inmediato.',
    focus: 'Charge permite atacar el turno en que entra.',
  },
  {
    id: 'fletching',
    title: '3. Flechado',
    seed: 53,
    objective: 'Acumula mejoras permanentes sobre un Longbowman.',
    focus: 'Las mejoras de ataque se acumulan de forma permanente.',
  },
  {
    id: 'advance',
    title: '4. Avanzar de epoca',
    seed: 61,
    objective: 'Usa Advance to Castle Age para generar energia y robar.',
    focus: 'Avanzar de epoca acelera tu economia hacia late-game.',
  },
  {
    id: 'wonder',
    title: '5. La Maravilla',
    seed: 71,
    objective: 'Construye la Wonder y sobrevive 4 turnos para ganar.',
    focus: 'La Wonder genera progreso cada turno; su condicion de victoria es alternativa.',
  },
]);

export type AoeTutorialId = (typeof AOE_TUTORIALS)[number]['id'];

export function createAoeTutorialSetup(id: string, players: readonly PlayerId[]): SetupOpts {
  const tutorial = AOE_TUTORIALS.find((candidate) => candidate.id === id);
  if (tutorial === undefined) throw new Error('Unknown AoE CCG tutorial');
  const [first, second] = players;
  if (first === undefined || second === undefined || players.length !== 2) {
    throw new Error('AoE CCG tutorials require exactly two players');
  }
  const setup = createAoeCcgSetup(tutorial.seed, players);
  const scenario =
    id === 'villagers-job'
      ? {
          activePlayer: first,
          phase: 'start' as const,
          turn: 3,
          players: {
            [first]: {
              hand: ['villager' as CardKind, 'town-militia' as CardKind],
              battlefield: [{ kind: 'villager' as CardKind, exhausted: false }],
              energy: 2,
              maxEnergy: 3,
              drawnThisTurn: false,
            },
            [second]: { hand: [], deck: [], battlefield: [], base: 30 },
          },
        }
      : id === 'charge'
        ? {
            activePlayer: first,
            phase: 'combat' as const,
            turn: 2,
            players: {
              [first]: {
                hand: [],
                battlefield: [{ kind: 'scout-cavalry' as CardKind, exhausted: false }],
              },
              [second]: { hand: [], deck: [], battlefield: [], base: 28 },
            },
          }
        : id === 'fletching'
          ? {
              activePlayer: first,
              phase: 'main' as const,
              turn: 4,
              players: {
                [first]: {
                  hand: ['fletching-upgrade' as CardKind, 'fletching-upgrade' as CardKind],
                  battlefield: [{ kind: 'longbowman' as CardKind }],
                  energy: 4,
                  maxEnergy: 4,
                },
                [second]: {
                  hand: [],
                  battlefield: [{ kind: 'knight' as CardKind }],
                },
              },
            }
          : id === 'advance'
            ? {
                activePlayer: first,
                phase: 'main' as const,
                turn: 4,
                players: {
                  [first]: {
                    hand: ['advance-castle-age' as CardKind, 'knight' as CardKind],
                    battlefield: [],
                    energy: 3,
                    maxEnergy: 4,
                  },
                  [second]: { hand: [], battlefield: [] },
                },
              }
            : {
                activePlayer: first,
                phase: 'start' as const,
                turn: 5,
                players: {
                  [first]: {
                    hand: ['wonder' as CardKind],
                    battlefield: [
                      { kind: 'castle' as CardKind, exhausted: false },
                      { kind: 'castle' as CardKind, exhausted: false },
                    ],
                    energy: 8,
                    maxEnergy: 8,
                    drawnThisTurn: false,
                  },
                  [second]: { hand: [], deck: [], battlefield: [], base: 30 },
                },
              };
  return { ...setup, scenario };
}

export const AOE_HUMAN_READABLE = Object.freeze({
  rulesetId: AOE_RULESET.id,
  factionNames: { britons: 'Britons', franks: 'Franks', neutral: 'Neutral' },
});
