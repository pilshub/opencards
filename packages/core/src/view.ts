import type { MaskedCardView, OpponentPlayerView, PlayerView, PlayerId, State } from './types.js';

/** Project canonical state into the hidden-information-safe view for one player. */
export function getView(state: State, viewer: PlayerId): PlayerView {
  const viewerState = state.players[viewer]!;
  const opponents = {} as Record<PlayerId, OpponentPlayerView>;

  for (const player of Object.values(state.players)) {
    if (player.id === viewer) {
      continue;
    }

    // Hidden hands carry no canonical identity. Returning a fresh marker per
    // card prevents reference-equality probes from correlating slots across
    // turns. Hand size is preserved via array length.
    const hand: MaskedCardView[] = player.hand.map(() => ({ masked: true }));

    opponents[player.id] = {
      id: player.id,
      hand,
      deck: { count: player.deck.length },
      discard: [...player.discard],
      exile: [...player.exile],
      battlefield: [...player.battlefield],
      base: player.base,
      energy: player.energy,
    };
  }

  return {
    viewer: {
      id: viewerState.id,
      hand: [...viewerState.hand],
      deck: [...viewerState.deck],
      discard: [...viewerState.discard],
      exile: [...viewerState.exile],
      battlefield: [...viewerState.battlefield],
      base: viewerState.base,
      energy: viewerState.energy,
    },
    opponents,
    activePlayer: state.activePlayer,
    phase: state.phase,
    turn: state.turn,
    winner: state.winner,
  };
}
