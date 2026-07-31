import type {
  MaskedCardView,
  OpponentPlayerView,
  Player,
  PlayerView,
  PlayerId,
  SpectatorView,
  State,
} from './types.js';
import { CLASSIC_RULESET } from './ruleset.js';

/**
 * Project one player's hidden zones exactly as an opponent sees them.
 * Shared by the per-viewer opponent path and the spectator path so both
 * always apply identical masking (a spectator must see no real hand).
 */
function projectOpponent(player: Player): OpponentPlayerView {
  // Hidden hands carry no canonical identity. Returning a fresh marker per
  // card prevents reference-equality probes from correlating slots across
  // turns. Hand size is preserved via array length.
  const hand: MaskedCardView[] = player.hand.map(() => ({ masked: true }));

  return {
    id: player.id,
    hand,
    deck: { count: player.deck.length },
    discard: [...player.discard],
    exile: [...player.exile],
    battlefield: player.battlefield.map((u) => ({ ...u })),
    base: player.base,
    energy: player.energy,
    maxEnergy: player.maxEnergy ?? player.energy,
    drawnThisTurn: player.drawnThisTurn,
    fatigueCount: player.fatigueCount ?? 0,
    ...(player.secrets === undefined ? {} : { secretCount: player.secrets.length }),
  };
}

/** Project canonical state into the hidden-information-safe view for one player. */
export function getView(state: State, viewer: PlayerId): PlayerView {
  const viewerState = state.players[viewer]!;
  const opponents = {} as Record<PlayerId, OpponentPlayerView>;

  for (const player of Object.values(state.players)) {
    if (player.id === viewer) {
      continue;
    }

    opponents[player.id] = projectOpponent(player);
  }

  return {
    viewer: {
      id: viewerState.id,
      hand: [...viewerState.hand],
      deck: [...viewerState.deck],
      discard: [...viewerState.discard],
      exile: [...viewerState.exile],
      battlefield: viewerState.battlefield.map((u) => ({ ...u })),
      base: viewerState.base,
      energy: viewerState.energy,
      maxEnergy: viewerState.maxEnergy ?? viewerState.energy,
      drawnThisTurn: viewerState.drawnThisTurn,
      fatigueCount: viewerState.fatigueCount ?? 0,
      ...(viewerState.secrets === undefined ? {} : { secretCount: viewerState.secrets.length }),
    },
    opponents,
    activePlayer: state.activePlayer,
    phase: state.phase,
    turn: state.turn,
    winner: state.winner,
    stack: projectStack(state),
    ruleset: state.ruleset ?? CLASSIC_RULESET,
    ...(state.pendingChoice === undefined
      ? {}
      : {
          pendingChoice: {
            player: state.pendingChoice.player,
            source: state.pendingChoice.source,
            options: state.pendingChoice.options.length,
          },
        }),
  };
}

/** Project canonical state into a hidden-information-safe spectator view. */
export function getSpectatorView(state: State): SpectatorView {
  const players = {} as Record<PlayerId, OpponentPlayerView>;

  for (const player of Object.values(state.players)) {
    players[player.id] = projectOpponent(player);
  }

  return {
    players,
    activePlayer: state.activePlayer,
    phase: state.phase,
    turn: state.turn,
    winner: state.winner,
    stack: projectStack(state),
    ruleset: state.ruleset ?? CLASSIC_RULESET,
    ...(state.pendingChoice === undefined
      ? {}
      : {
          pendingChoice: {
            player: state.pendingChoice.player,
            source: state.pendingChoice.source,
            options: state.pendingChoice.options.length,
          },
        }),
  };
}

/** Public stack projection: defensive copies so consumers cannot mutate state. */
function projectStack(state: State) {
  return state.stack.map((item) => ({
    ...item,
    effects: item.effects.map((effect) => ({ ...effect })),
  }));
}
