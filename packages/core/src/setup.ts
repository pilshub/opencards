import type {
  CardInstance,
  CardInstanceId,
  CardKind,
  CardSpec,
  Player,
  PlayerId,
  Ruleset,
  State,
  Unit,
} from './types.js';
import { seedRng } from './rng.js';
import { fisherYates } from './shuffle.js';
import { CLASSIC_RULESET, defineRuleset } from './ruleset.js';

export interface ScenarioUnitSetup {
  readonly kind: CardKind;
  readonly attack?: number;
  readonly health?: number;
  readonly damage?: number;
  readonly exhausted?: boolean;
  readonly keywords?: readonly string[];
}

export interface ScenarioPlayerSetup {
  readonly hand?: readonly CardKind[];
  readonly deck?: readonly CardKind[];
  readonly discard?: readonly CardKind[];
  readonly exile?: readonly CardKind[];
  readonly battlefield?: readonly ScenarioUnitSetup[];
  readonly base?: number;
  readonly energy?: number;
  readonly maxEnergy?: number;
  readonly drawnThisTurn?: boolean;
  readonly fatigueCount?: number;
}

export interface ScenarioSetup {
  readonly activePlayer?: PlayerId;
  readonly phase?: State['phase'];
  readonly turn?: number;
  readonly players?: Readonly<Partial<Record<PlayerId, ScenarioPlayerSetup>>>;
}

/** Options used to create a deterministic initial state. */
export interface SetupOpts {
  /** Seed used to initialize deterministic shuffle state. */
  readonly seed: number;
  /** Ordered player ids; the first player becomes active. */
  readonly players: readonly PlayerId[];
  /** Number of cards built into each player deck. */
  readonly deckSize: number;
  /** Number of cards drawn into each opening hand. */
  readonly openingHandSize: number;
  /** Card kinds cycled through each generated deck. */
  readonly cardKinds: readonly CardKind[];
  /** Optional exact decklist used instead of cycling cardKinds. */
  readonly decklist?: readonly CardKind[];
  /** Optional exact decklists keyed by player for asymmetric factions. */
  readonly decklists?: Readonly<Partial<Record<PlayerId, readonly CardKind[]>>>;
  /** Starting base (life total) for each player. Defaults to 20. */
  readonly baseTotal?: number;
  /** Starting energy for each player. Defaults to 0. */
  readonly startingEnergy?: number;
  /** Card specs to populate the card database. Omit for an empty database. */
  readonly cards?: readonly CardSpec[];
  /** Deterministic rules profile. Defaults to the backwards-compatible classic profile. */
  readonly ruleset?: Ruleset;
  /** Optional deterministic puzzle/tutorial state applied after the opening deal. */
  readonly scenario?: ScenarioSetup;
}

/** Create the deterministic Phase 1 initial state for a set of generated decks. */
export function createInitialState(opts: SetupOpts): State {
  if (opts.players.length === 0) {
    throw new Error('createInitialState requires at least one player');
  }

  if (opts.decklist !== undefined && opts.decklists !== undefined) {
    throw new Error('createInitialState accepts decklist or decklists, not both');
  }

  if (opts.decklist === undefined && opts.decklists === undefined && opts.cardKinds.length === 0) {
    throw new Error('createInitialState requires at least one card kind');
  }

  if (opts.deckSize < 0 || opts.openingHandSize < 0 || opts.openingHandSize > opts.deckSize) {
    throw new Error('createInitialState requires valid deck and opening hand sizes');
  }

  if (opts.decklist !== undefined && opts.decklist.length !== opts.deckSize) {
    throw new Error('createInitialState requires decklist length to match deck size');
  }

  for (const playerId of opts.players) {
    const playerDecklist = opts.decklists?.[playerId];
    if (playerDecklist !== undefined && playerDecklist.length !== opts.deckSize) {
      throw new Error(
        `createInitialState requires decklist length to match deck size for ${playerId}`,
      );
    }
    if (
      playerDecklist === undefined &&
      opts.decklist === undefined &&
      opts.cardKinds.length === 0
    ) {
      throw new Error(`createInitialState requires a decklist for ${playerId}`);
    }
  }

  const baseTotal = opts.baseTotal ?? 20;
  const startingEnergy = opts.startingEnergy ?? 0;
  const ruleset = opts.ruleset === undefined ? CLASSIC_RULESET : defineRuleset(opts.ruleset);

  if (ruleset.energy.maximum !== null && startingEnergy > ruleset.energy.maximum) {
    throw new Error('createInitialState startingEnergy exceeds ruleset energy.maximum');
  }

  let rng = seedRng(opts.seed);
  const players = {} as Record<PlayerId, Player>;

  for (const playerId of opts.players) {
    const deck = buildDeck(
      playerId,
      opts.deckSize,
      opts.cardKinds,
      opts.decklists?.[playerId] ?? opts.decklist,
    );
    const [shuffled, nextRng] = fisherYates(deck, rng);
    rng = nextRng;
    players[playerId] = {
      id: playerId,
      hand: [],
      deck: shuffled,
      discard: [],
      exile: [],
      battlefield: [],
      base: baseTotal,
      energy: startingEnergy,
      drawnThisTurn: false,
      ...(opts.ruleset === undefined
        ? {}
        : {
            maxEnergy: startingEnergy,
            fatigueCount: 0,
          }),
    };
  }

  const activePlayer = opts.players[0] as PlayerId;
  const cards: Record<CardKind, CardSpec> = {};
  for (const spec of opts.cards ?? []) {
    cards[spec.kind] = spec;
  }
  let state: State = {
    rng,
    players,
    activePlayer,
    phase: ruleset.startingPhase,
    turn: 1,
    winner: null,
    cards,
    stack: [],
    ...(opts.ruleset === undefined ? {} : { ruleset }),
  };

  for (const playerId of opts.players) {
    for (let draws = 0; draws < opts.openingHandSize; draws += 1) {
      const player = state.players[playerId]!;
      const [instance, ...deck] = player.deck as [CardInstance, ...CardInstance[]];
      const nextPlayer: Player = { ...player, deck, hand: [...player.hand, instance] };
      state = { ...state, players: { ...state.players, [playerId]: nextPlayer } };
    }
  }

  return opts.scenario === undefined ? state : applyScenario(state, opts.scenario);
}

function applyScenario(state: State, scenario: ScenarioSetup): State {
  const players = { ...state.players };
  for (const playerId of Object.keys(scenario.players ?? {}) as PlayerId[]) {
    const current = players[playerId];
    const configured = scenario.players?.[playerId];
    if (current === undefined || configured === undefined) continue;
    const zone = (
      name: 'hand' | 'deck' | 'discard' | 'exile',
      kinds: readonly CardKind[] | undefined,
    ) =>
      kinds === undefined
        ? current[name]
        : kinds.map((kind, index) => ({
            id: (playerId +
              '-scenario-' +
              name +
              '-' +
              String(index).padStart(2, '0')) as CardInstanceId,
            kind,
          }));
    const battlefield =
      configured.battlefield === undefined
        ? current.battlefield
        : configured.battlefield.map((entry, index): Unit => {
            const spec = state.cards[entry.kind];
            const unitKeywords = entry.keywords ?? spec?.keywords;
            return {
              id: (playerId +
                '-scenario-battlefield-' +
                String(index).padStart(2, '0')) as CardInstanceId,
              kind: entry.kind,
              attack: entry.attack ?? spec?.attack ?? 0,
              health: entry.health ?? spec?.health ?? 1,
              damage: entry.damage ?? 0,
              exhausted: entry.exhausted ?? false,
              ...(unitKeywords === undefined ? {} : { keywords: [...unitKeywords] }),
              ...(state.ruleset === undefined ? {} : { attacksThisTurn: 0, summonedTurn: 0 }),
            };
          });
    players[playerId] = {
      ...current,
      hand: zone('hand', configured.hand),
      deck: zone('deck', configured.deck),
      discard: zone('discard', configured.discard),
      exile: zone('exile', configured.exile),
      battlefield,
      base: configured.base ?? current.base,
      energy: configured.energy ?? current.energy,
      drawnThisTurn: configured.drawnThisTurn ?? current.drawnThisTurn,
      ...(configured.maxEnergy === undefined ? {} : { maxEnergy: configured.maxEnergy }),
      ...(configured.fatigueCount === undefined ? {} : { fatigueCount: configured.fatigueCount }),
    };
  }
  return {
    ...state,
    players,
    activePlayer: scenario.activePlayer ?? state.activePlayer,
    phase: scenario.phase ?? state.phase,
    turn: scenario.turn ?? state.turn,
  };
}

function buildDeck(
  playerId: PlayerId,
  deckSize: number,
  cardKinds: readonly CardKind[],
  decklist: readonly CardKind[] | undefined,
): CardInstance[] {
  return Array.from({ length: deckSize }, (_, index): CardInstance => {
    return {
      id: `${playerId}-c${String(index).padStart(2, '0')}` as CardInstanceId,
      kind: decklist?.[index] ?? cardKinds[index % cardKinds.length]!,
    };
  });
}
