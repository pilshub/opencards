import type {
  ApplyResult,
  Command,
  Event,
  Phase,
  PlayerId,
  State,
  ValidationIssue,
} from './types.js';
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

const notActivePlayer = (player: string): ValidationIssue => ({
  code: 'NOT_ACTIVE_PLAYER',
  message: `Player is not the active player: ${player}`,
});

const gameOver = (): ValidationIssue => ({
  code: 'GAME_OVER',
  message: 'The game has already ended',
});

const phaseIsFinal = (): ValidationIssue => ({
  code: 'PHASE_IS_FINAL',
  message: 'Current phase is already the final phase; use endTurn instead',
});

/** Phase order for advancement. */
const PHASE_ORDER: readonly Phase[] = ['start', 'main', 'combat', 'end'];

function nextPhase(current: Phase): Phase | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx === PHASE_ORDER.length - 1) {
    return null;
  }
  return PHASE_ORDER[idx + 1]!;
}

/**
 * Pure win-check helper. After producing a new state, checks whether any
 * player's base has reached <= 0. If so, the opponent wins. Returns the
 * (possibly updated) state and any newly emitted gameEnded event.
 */
export function checkWin(
  state: State,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  // Already decided; nothing to do.
  if (state.winner !== null) {
    return { state, events };
  }

  const playerList = Object.values(state.players);
  for (const player of playerList) {
    if (player.base <= 0) {
      // In a 2-player game, the opponent wins.
      const winner = playerList.find((p) => p.id !== player.id)?.id as PlayerId | undefined;
      if (winner === undefined) {
        // Degenerate single-player; no winner can be determined.
        continue;
      }
      const newState: State = { ...state, winner };
      const newEvents: readonly Event[] = [...events, { type: 'gameEnded', winner }];
      return { state: newState, events: newEvents };
    }
  }

  return { state, events };
}

/** Apply a command to canonical state without mutating the input. */
export function apply(state: State, command: Command): ApplyResult {
  // Global GAME_OVER guard.
  if (state.winner !== null) {
    return { state, events: [], issues: [gameOver()] };
  }

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
      const events: readonly Event[] = [
        { type: 'cardDrawn', player: command.player, instance: drawn },
      ];
      const checked = checkWin(nextState, events);
      return {
        state: checked.state,
        events: checked.events,
        issues: [],
      };
    }

    case 'endPhase': {
      const player = state.players[command.player];

      if (player === undefined) {
        return { state, events: [], issues: [unknownPlayer(command.player)] };
      }

      if (command.player !== state.activePlayer) {
        return { state, events: [], issues: [notActivePlayer(command.player)] };
      }

      const next = nextPhase(state.phase);
      if (next === null) {
        return { state, events: [], issues: [phaseIsFinal()] };
      }

      const nextState: State = { ...state, phase: next };
      const events: readonly Event[] = [
        { type: 'phaseAdvanced', player: command.player, from: state.phase, to: next },
      ];
      const checked = checkWin(nextState, events);
      return { state: checked.state, events: checked.events, issues: [] };
    }

    case 'endTurn': {
      const player = state.players[command.player];

      if (player === undefined) {
        return { state, events: [], issues: [unknownPlayer(command.player)] };
      }

      if (command.player !== state.activePlayer) {
        return { state, events: [], issues: [notActivePlayer(command.player)] };
      }

      // Find the next player (cycle through player order).
      const playerIds = Object.keys(state.players) as PlayerId[];
      const currentIdx = playerIds.indexOf(command.player);
      const nextPlayer = playerIds[(currentIdx + 1) % playerIds.length] as PlayerId;
      const newTurn = state.turn + 1;

      // Grant +1 energy to the incoming active player.
      const nextPlayerState = state.players[nextPlayer]!;
      const updatedNextPlayer = { ...nextPlayerState, energy: nextPlayerState.energy + 1 };

      const nextState: State = {
        ...state,
        players: { ...state.players, [nextPlayer]: updatedNextPlayer },
        activePlayer: nextPlayer,
        phase: 'start',
        turn: newTurn,
      };

      const events: readonly Event[] = [
        { type: 'resourceGained', player: nextPlayer, resource: 'energy', amount: 1 },
        { type: 'turnEnded', player: command.player, nextPlayer, turn: newTurn },
      ];

      const checked = checkWin(nextState, events);
      return { state: checked.state, events: checked.events, issues: [] };
    }

    default:
      return { state, events: [], issues: [unknownCommand(command as { type?: unknown })] };
  }
}
