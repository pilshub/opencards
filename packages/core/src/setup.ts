import type {
  CardInstance,
  CardInstanceId,
  CardKind,
  CardSpec,
  Player,
  PlayerId,
  State,
} from './types.js';
import { seedRng } from './rng.js';
import { fisherYates } from './shuffle.js';

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
  /** Starting base (life total) for each player. Defaults to 20. */
  readonly baseTotal?: number;
  /** Starting energy for each player. Defaults to 0. */
  readonly startingEnergy?: number;
  /** Card specs to populate the card database. Omit for an empty database. */
  readonly cards?: readonly CardSpec[];
}

/** Create the deterministic Phase 1 initial state for a set of generated decks. */
export function createInitialState(opts: SetupOpts): State {
  if (opts.players.length === 0) {
    throw new Error('createInitialState requires at least one player');
  }

  if (opts.cardKinds.length === 0) {
    throw new Error('createInitialState requires at least one card kind');
  }

  if (opts.deckSize < 0 || opts.openingHandSize < 0 || opts.openingHandSize > opts.deckSize) {
    throw new Error('createInitialState requires valid deck and opening hand sizes');
  }

  const baseTotal = opts.baseTotal ?? 20;
  const startingEnergy = opts.startingEnergy ?? 0;

  let rng = seedRng(opts.seed);
  const players = {} as Record<PlayerId, Player>;

  for (const playerId of opts.players) {
    const deck = buildDeck(playerId, opts.deckSize, opts.cardKinds);
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
    };
  }

  const activePlayer = opts.players[0] as PlayerId;
  const cards: Record<CardKind, CardSpec> = {};
  for (const spec of opts.cards ?? []) {
    cards[spec.kind] = spec;
  }
  let state: State = { rng, players, activePlayer, phase: 'start', turn: 1, winner: null, cards };

  for (const playerId of opts.players) {
    for (let draws = 0; draws < opts.openingHandSize; draws += 1) {
      const player = state.players[playerId]!;
      const [instance, ...deck] = player.deck as [CardInstance, ...CardInstance[]];
      const nextPlayer: Player = { ...player, deck, hand: [...player.hand, instance] };
      state = { ...state, players: { ...state.players, [playerId]: nextPlayer } };
    }
  }

  return state;
}

function buildDeck(
  playerId: PlayerId,
  deckSize: number,
  cardKinds: readonly CardKind[],
): CardInstance[] {
  return Array.from({ length: deckSize }, (_, index): CardInstance => {
    return {
      id: `${playerId}-c${String(index).padStart(2, '0')}` as CardInstanceId,
      kind: cardKinds[index % cardKinds.length]!,
    };
  });
}
