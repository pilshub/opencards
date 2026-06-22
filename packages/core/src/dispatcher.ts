import type { ApplyResult, Command, State, ValidationIssue } from './types.js';
import { moveCard } from './zones.js';

const unknownPlayer = (player: string): ValidationIssue => ({
  code: 'UNKNOWN_PLAYER',
  message: `Unknown player: ${player}`,
});

const emptyDeck = (player: string): ValidationIssue => ({
  code: 'EMPTY_DECK',
  message: `Player has no cards to draw: ${player}`,
});

const unknownCommand = (command: { readonly type?: unknown }): ValidationIssue => ({
  code: 'UNKNOWN_COMMAND',
  message: `Unknown command type: ${command.type ?? '<missing>'}`,
});

/** Apply a Phase 1 command to canonical state without mutating the input. */
export function apply(state: State, command: Command): ApplyResult {
  switch (command.type) {
    case 'drawCard': {
      const player = state.players[command.player];

      if (player === undefined) {
        return { state, events: [], issues: [unknownPlayer(command.player)] };
      }

      if (player.deck.length === 0) {
        return { state, events: [], issues: [emptyDeck(command.player)] };
      }

      const drawn = player.deck[0]!;
      const nextState = moveCard(state, drawn, 'deck', 'hand');
      return {
        state: nextState,
        events: [{ type: 'cardDrawn', player: command.player, instance: drawn }],
        issues: [],
      };
    }

    default:
      return { state, events: [], issues: [unknownCommand(command as { type?: unknown })] };
  }
}
