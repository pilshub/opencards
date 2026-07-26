import {
  FOUNDRY_RULESET,
  type CardKind,
  type CardSpec,
  type PlayerId,
  type SetupOpts,
} from '@opencards/core';
import type { AbilityTrigger, BuiltinKeyword } from '@opencards/effects';
import { cardDefinitionToSpec } from '@opencards/schema';
import type { AbilityDef, CardDefinition, EffectDef, GameFormat } from '@opencards/schema';

export type FoundryFaction = 'ember' | 'verdant' | 'neutral';

type UnitOptions = {
  readonly keywords?: readonly BuiltinKeyword[];
  readonly abilities?: readonly AbilityDef[];
};

const ability = (trigger: AbilityTrigger, effects: readonly EffectDef[]): AbilityDef => ({
  trigger,
  effects,
});

const unit = (
  kind: string,
  name: string,
  faction: FoundryFaction,
  cost: number,
  attack: number,
  health: number,
  text: string,
  options: UnitOptions = {},
): CardDefinition => ({
  kind,
  name,
  faction,
  type: 'unit',
  cost: { energy: cost },
  stats: { attack, health },
  effects: [],
  text,
  ...(options.keywords === undefined ? {} : { keywords: options.keywords }),
  ...(options.abilities === undefined ? {} : { abilities: options.abilities }),
});

const tactic = (
  kind: string,
  name: string,
  faction: FoundryFaction,
  cost: number,
  text: string,
  effects: readonly EffectDef[],
): CardDefinition => ({
  kind,
  name,
  faction,
  type: 'tactic',
  cost: { energy: cost },
  effects,
  text,
});

/** Forty original cards: sixteen Ember, sixteen Verdant, and eight neutral. */
export const FOUNDRY_CARDS: readonly CardDefinition[] = Object.freeze([
  unit('cinder-initiate', 'Cinder Initiate', 'ember', 1, 1, 2, 'Haste.', {
    keywords: ['haste'],
  }),
  unit('spark-runner', 'Spark Runner', 'ember', 1, 2, 1, 'Rush.', {
    keywords: ['rush'],
  }),
  unit('ashen-guard', 'Ashen Guard', 'ember', 2, 2, 3, 'Guard.', {
    keywords: ['guard'],
  }),
  unit('flame-squire', 'Flame Squire', 'ember', 2, 3, 2, 'On play, gain 1 energy.', {
    abilities: [ability('onPlay', [{ op: 'gainResource', amount: 1, target: 'self' }])],
  }),
  unit('furnace-adept', 'Furnace Adept', 'ember', 3, 3, 3, 'On play, deal 1 to the enemy base.', {
    abilities: [ability('onPlay', [{ op: 'dealDamage', amount: 1, target: 'enemyBase' }])],
  }),
  unit('ember-medic', 'Ember Medic', 'ember', 3, 2, 4, 'On play, restore 2 to your base.', {
    abilities: [ability('onPlay', [{ op: 'heal', amount: 2, target: 'self' }])],
  }),
  unit('coalback-brute', 'Coalback Brute', 'ember', 4, 4, 5, 'Guard.', {
    keywords: ['guard'],
  }),
  unit('phoenix-whelp', 'Phoenix Whelp', 'ember', 4, 4, 3, 'On death, summon a Cinder Initiate.', {
    abilities: [
      ability('onDeath', [{ op: 'summonUnit', kind: 'cinder-initiate', target: 'self' }]),
    ],
  }),
  unit('scorchblade', 'Scorchblade', 'ember', 5, 5, 4, 'Charge.', {
    keywords: ['charge'],
  }),
  unit(
    'inferno-regent',
    'Inferno Regent',
    'ember',
    6,
    6,
    6,
    'Shield. On attack, gain a heat counter.',
    {
      keywords: ['shield'],
      abilities: [
        ability('onAttack', [{ op: 'addCounter', target: 'ownUnit', counter: 'heat', amount: 1 }]),
      ],
    },
  ),
  unit('molten-colossus', 'Molten Colossus', 'ember', 8, 8, 8, 'Guard.', {
    keywords: ['guard'],
  }),
  tactic('searing-pact', 'Searing Pact', 'ember', 1, 'Deal 2 damage to an enemy.', [
    { op: 'dealDamage', amount: 2, target: 'enemyUnitOrBase' },
  ]),
  tactic('kindled-resolve', 'Kindled Resolve', 'ember', 2, 'Equip a unit with +2 attack.', [
    {
      op: 'attach',
      target: 'ownUnit',
      kind: 'kindled-blade',
      attachmentType: 'equipment',
      attack: 2,
    },
  ]),
  tactic(
    'focused-fire',
    'Focused Fire',
    'ember',
    3,
    'Deal 3, freeze it, and deal 1 to adjacent units.',
    [
      { op: 'dealDamage', amount: 3, target: 'enemyUnit' },
      { op: 'applyStatus', target: 'enemyUnit', status: 'frozen', duration: 1 },
      { op: 'damageAdjacent', amount: 1, target: 'enemyUnit' },
    ],
  ),
  tactic(
    'stoke-flames',
    'Stoke the Flames',
    'ember',
    3,
    'Secret: when the enemy attacks, deal 3 to their base.',
    [
      {
        op: 'setSecret',
        trigger: 'onEnemyAttack',
        effects: [{ op: 'dealDamage', amount: 3, target: 'enemyBase' }],
      },
    ],
  ),
  tactic(
    'last-ember',
    'Last Ember',
    'ember',
    5,
    'Deal 5 to the enemy base, 2 to a random enemy, then exile this.',
    [
      { op: 'dealDamage', amount: 5, target: 'enemyBase' },
      { op: 'randomDamage', amount: 2, target: 'enemyUnit' },
      { op: 'moveCard', from: 'stack', to: 'exile' },
    ],
  ),

  unit('mossling', 'Mossling', 'verdant', 1, 2, 3, 'A stubborn seedling.'),
  unit('thorn-scout', 'Thorn Scout', 'verdant', 1, 2, 1, 'Stealth.', {
    keywords: ['stealth'],
  }),
  unit('grove-keeper', 'Grove Keeper', 'verdant', 2, 2, 4, 'Guard.', {
    keywords: ['guard'],
  }),
  unit('bloom-healer', 'Bloom Healer', 'verdant', 2, 2, 2, 'On play, restore 2 to your base.', {
    abilities: [ability('onPlay', [{ op: 'heal', amount: 2, target: 'self' }])],
  }),
  unit('venom-seed', 'Venom Seed', 'verdant', 2, 2, 2, 'Poisonous.', {
    keywords: ['poisonous'],
  }),
  unit('vine-charger', 'Vine Charger', 'verdant', 3, 4, 3, 'Rush.', {
    keywords: ['rush'],
  }),
  unit('lifebloom-druid', 'Lifebloom Druid', 'verdant', 3, 3, 4, 'Lifesteal.', {
    keywords: ['lifesteal'],
  }),
  unit('barkshield-guardian', 'Barkshield Guardian', 'verdant', 4, 3, 6, 'Guard. Shield.', {
    keywords: ['guard', 'shield'],
  }),
  unit('wildcaller', 'Wildcaller', 'verdant', 4, 4, 5, 'On play, summon a Mossling.', {
    abilities: [ability('onPlay', [{ op: 'summonUnit', kind: 'mossling', target: 'self' }])],
  }),
  unit('ancient-stag', 'Ancient Stag', 'verdant', 5, 5, 6, 'Haste.', {
    keywords: ['haste'],
  }),
  unit('root-titan', 'Root Titan', 'verdant', 7, 7, 9, 'Guard.', {
    keywords: ['guard'],
  }),
  tactic('natural-remedy', 'Natural Remedy', 'verdant', 1, 'Restore 3 and resurrect a Mossling.', [
    { op: 'heal', amount: 3, target: 'self' },
    { op: 'resurrectUnit', target: 'self', kind: 'mossling' },
  ]),
  tactic(
    'growth-spurt',
    'Growth Spurt',
    'verdant',
    2,
    'Enchant a unit with +1 attack and +2 health.',
    [
      {
        op: 'attach',
        target: 'ownUnit',
        kind: 'living-vines',
        attachmentType: 'enchantment',
        attack: 1,
        health: 2,
      },
    ],
  ),
  tactic('seed-cache', 'Seed Cache', 'verdant', 2, 'Draw 2. The opponent discards 1.', [
    { op: 'drawCards', amount: 2, target: 'self' },
    { op: 'discardCards', amount: 1, target: 'enemyBase' },
  ]),
  tactic('verdant-surge', 'Verdant Surge', 'verdant', 3, 'Summon a Mossling.', [
    { op: 'summonUnit', kind: 'mossling', target: 'self' },
  ]),
  tactic('canopy-wrath', 'Canopy Wrath', 'verdant', 5, 'Deal 2 damage to all enemy units.', [
    { op: 'damageAll', amount: 2, target: 'enemyUnit' },
  ]),

  unit('clockwork-page', 'Clockwork Page', 'neutral', 1, 1, 1, 'On death, draw a card.', {
    abilities: [ability('onDeath', [{ op: 'drawCards', amount: 1, target: 'self' }])],
  }),
  unit('iron-courier', 'Iron Courier', 'neutral', 2, 2, 2, 'On play, draw a card.', {
    abilities: [ability('onPlay', [{ op: 'drawCards', amount: 1, target: 'self' }])],
  }),
  unit('gate-warden', 'Gate Warden', 'neutral', 3, 2, 5, 'Guard. On play, gain a ward counter.', {
    keywords: ['guard'],
    abilities: [
      ability('onPlay', [{ op: 'addCounter', target: 'ownUnit', counter: 'ward', amount: 1 }]),
    ],
  }),
  unit('glass-assassin', 'Glass Assassin', 'neutral', 3, 4, 1, 'Stealth. Poisonous.', {
    keywords: ['stealth', 'poisonous'],
  }),
  unit('aegis-construct', 'Aegis Construct', 'neutral', 4, 3, 4, 'Shield.', {
    keywords: ['shield'],
  }),
  unit('wandering-giant', 'Wandering Giant', 'neutral', 6, 6, 7, 'A reliable finisher.'),
  tactic('arcane-insight', 'Arcane Insight', 'neutral', 2, 'Choose one: draw 2, or restore 4.', [
    {
      op: 'chooseOne',
      options: [
        [{ op: 'drawCards', amount: 2, target: 'self' }],
        [{ op: 'heal', amount: 4, target: 'self' }],
      ],
    },
  ]),
  tactic('null-pulse', 'Null Pulse', 'neutral', 2, 'Silence, stun, and give a unit -1 attack.', [
    { op: 'silence', target: 'anyUnit' },
    { op: 'applyStatus', target: 'anyUnit', status: 'stunned', duration: 1 },
    { op: 'modifyStat', target: 'anyUnit', stat: 'attack', amount: -1 },
  ]),
]);

export const FOUNDRY_FORMAT: GameFormat = Object.freeze({
  name: 'Ember Duel: Foundry Set',
  deckSize: 20,
  openingHandSize: 4,
  copyLimit: 2,
  baseTotal: 20,
  startingEnergy: 1,
  ruleset: FOUNDRY_RULESET,
});

const copies = (kinds: readonly string[]): CardKind[] =>
  kinds.flatMap((kind) => [kind as CardKind, kind as CardKind]);

export const EMBER_STARTER_DECK: readonly CardKind[] = Object.freeze(
  copies([
    'cinder-initiate',
    'spark-runner',
    'ashen-guard',
    'furnace-adept',
    'coalback-brute',
    'scorchblade',
    'searing-pact',
    'last-ember',
    'iron-courier',
    'gate-warden',
  ]),
);

export const VERDANT_STARTER_DECK: readonly CardKind[] = Object.freeze(
  copies([
    'mossling',
    'thorn-scout',
    'grove-keeper',
    'venom-seed',
    'lifebloom-druid',
    'root-titan',
    'natural-remedy',
    'canopy-wrath',
    'clockwork-page',
    'aegis-construct',
  ]),
);

export const FOUNDRY_CARD_SPECS: readonly CardSpec[] = Object.freeze(
  FOUNDRY_CARDS.map(cardDefinitionToSpec),
);

export type FoundryTutorialId =
  | 'first-turn'
  | 'combat'
  | 'guard-rush'
  | 'shield-poison'
  | 'tactics';

export interface FoundryTutorial {
  readonly id: FoundryTutorialId;
  readonly title: string;
  readonly seed: number;
  readonly objective: string;
  readonly focus: string;
}

export const FOUNDRY_TUTORIALS: readonly FoundryTutorial[] = Object.freeze([
  {
    id: 'first-turn',
    title: '1. Tutorial completo',
    seed: 11,
    objective: 'Aprende el objetivo, roba, juega una unidad y destruye la base rival.',
    focus: 'El tutorial te indicara cada accion paso a paso.',
  },
  {
    id: 'combat',
    title: '2. Combate',
    seed: 19,
    objective: 'Ataca la base Verdant con tu unidad preparada.',
    focus: 'Las unidades normales esperan un turno antes de atacar.',
  },
  {
    id: 'guard-rush',
    title: '3. Guardia y Rush',
    seed: 29,
    objective: 'Usa Spark Runner para atacar a la unidad con Guard.',
    focus: 'Rush permite atacar unidades al entrar; Guard protege la base.',
  },
  {
    id: 'shield-poison',
    title: '4. Escudo y veneno',
    seed: 37,
    objective: 'Rompe el Shield y despues destruye al Guardian con Poisonous.',
    focus: 'El veneno solo actua cuando el dano atraviesa el escudo.',
  },
  {
    id: 'tactics',
    title: '5. Tacticas y objetivos',
    seed: 47,
    objective: 'Lanza Focused Fire sobre la unidad central y resuelvelo.',
    focus: 'Congelar y el dano adyacente usan el mismo objetivo declarado.',
  },
]);

export function createFoundryTutorialSetup(
  id: FoundryTutorialId,
  players: readonly PlayerId[],
): SetupOpts {
  const tutorial = FOUNDRY_TUTORIALS.find((candidate) => candidate.id === id);
  if (tutorial === undefined) throw new Error('Unknown Foundry tutorial');
  const [first, second] = players;
  if (first === undefined || second === undefined || players.length !== 2) {
    throw new Error('Foundry tutorials require exactly two players');
  }
  const setup = createFoundrySetup(tutorial.seed, players);
  const scenario =
    id === 'first-turn'
      ? {
          activePlayer: first,
          phase: 'start' as const,
          turn: 1,
          players: {
            [first]: {
              hand: ['cinder-initiate' as CardKind],
              deck: ['molten-colossus' as CardKind],
              energy: 1,
              maxEnergy: 1,
              drawnThisTurn: false,
            },
            [second]: {
              hand: [],
              deck: [],
              battlefield: [],
              base: 1,
              energy: 1,
              maxEnergy: 1,
            },
          },
        }
      : id === 'combat'
        ? {
            activePlayer: first,
            phase: 'combat' as const,
            turn: 3,
            players: {
              [first]: {
                hand: [],
                deck: [],
                battlefield: [{ kind: 'cinder-initiate' as CardKind, exhausted: false }],
              },
              [second]: { hand: [], deck: [], battlefield: [], base: 8 },
            },
          }
        : id === 'guard-rush'
          ? {
              activePlayer: first,
              phase: 'combat' as const,
              turn: 3,
              players: {
                [first]: {
                  hand: [],
                  deck: [],
                  battlefield: [{ kind: 'spark-runner' as CardKind, exhausted: false }],
                },
                [second]: {
                  hand: [],
                  deck: [],
                  battlefield: [{ kind: 'ashen-guard' as CardKind, exhausted: false }],
                },
              },
            }
          : id === 'shield-poison'
            ? {
                activePlayer: first,
                phase: 'combat' as const,
                turn: 4,
                players: {
                  [first]: {
                    hand: [],
                    deck: [],
                    battlefield: [
                      { kind: 'venom-seed' as CardKind, exhausted: false },
                      { kind: 'venom-seed' as CardKind, exhausted: false },
                    ],
                  },
                  [second]: {
                    hand: [],
                    deck: [],
                    battlefield: [{ kind: 'barkshield-guardian' as CardKind, exhausted: false }],
                  },
                },
              }
            : {
                activePlayer: first,
                phase: 'main' as const,
                turn: 5,
                players: {
                  [first]: {
                    hand: ['focused-fire' as CardKind],
                    deck: [],
                    battlefield: [],
                    energy: 3,
                    maxEnergy: 5,
                  },
                  [second]: {
                    hand: [],
                    deck: [],
                    battlefield: [
                      { kind: 'mossling' as CardKind },
                      { kind: 'grove-keeper' as CardKind },
                      { kind: 'thorn-scout' as CardKind, keywords: [] },
                    ],
                  },
                },
              };
  return { ...setup, scenario };
}

export function createFoundrySetup(seed: number, players: readonly PlayerId[]): SetupOpts {
  const [first, second] = players;
  if (first === undefined || second === undefined || players.length !== 2) {
    throw new Error('createFoundrySetup requires exactly two players');
  }

  return {
    seed,
    players,
    deckSize: FOUNDRY_FORMAT.deckSize,
    openingHandSize: FOUNDRY_FORMAT.openingHandSize,
    cardKinds: FOUNDRY_CARDS.map((card) => card.kind as CardKind),
    decklists: {
      [first]: EMBER_STARTER_DECK,
      [second]: VERDANT_STARTER_DECK,
    },
    baseTotal: FOUNDRY_FORMAT.baseTotal,
    startingEnergy: FOUNDRY_FORMAT.startingEnergy,
    cards: FOUNDRY_CARD_SPECS,
    ruleset: FOUNDRY_RULESET,
  };
}
