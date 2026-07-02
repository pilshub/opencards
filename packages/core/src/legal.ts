import { apply } from './dispatcher.js';
import type { Command, PlayerId, State } from './types.js';

/** Enumerate legal commands by filtering deterministic candidates through apply(). */
export function getLegalCommands(state: State, player: PlayerId): Command[] {
  if (state.winner !== null) {
    return [];
  }

  const candidates: Command[] = [
    { type: 'drawCard', player },
    { type: 'endPhase', player },
    { type: 'endTurn', player },
  ];

  const playerState = state.players[player];
  if (playerState !== undefined) {
    for (const instance of playerState.hand) {
      candidates.push({ type: 'playCard', player, instance: instance.id });
    }

    const targetIds = Object.values(state.players)
      .filter((candidate) => candidate.id !== player)
      .flatMap((opponent) => opponent.battlefield.map((unit) => unit.id));

    for (const attacker of playerState.battlefield) {
      for (const target of targetIds) {
        candidates.push({ type: 'attack', player, attacker: attacker.id, target });
      }
      candidates.push({ type: 'attack', player, attacker: attacker.id, target: 'base' });
    }
  }

  return candidates.filter((command) => apply(state, command).issues.length === 0);
}
