import type { MaskedCardView, OpponentPlayerView, PlayerView, PlayerId, State } from './types.js';
import { CLASSIC_RULESET } from './ruleset.js';

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
      battlefield: player.battlefield.map((u) => ({ ...u })),
      base: player.base,
      energy: player.energy,
      maxEnergy: player.maxEnergy ?? player.energy,
      drawnThisTurn: player.drawnThisTurn,
      fatigueCount: player.fatigueCount ?? 0,
      ...(player.secrets === undefined ? {} : { secretCount: player.secrets.length }),
    };
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
    stack: state.stack.map((item) => ({
      ...item,
      effects: item.effects.map((effect) => ({ ...effect })),
    })),
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
