import { apply, validateTarget } from './dispatcher.js';
import type {
  CardInstanceId,
  Command,
  PlayerId,
  StackItem,
  State,
  TargetSelector,
} from './types.js';

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

  const top = state.stack[state.stack.length - 1];
  if (top !== undefined) {
    for (const target of targetCandidates(state, player, top)) {
      candidates.push({ type: 'chooseTarget', player, target });
    }
    candidates.push({ type: 'resolveStack', player });
  }

  return candidates.filter((command) => apply(state, command).issues.length === 0);
}

function targetCandidates(
  state: State,
  player: PlayerId,
  item: StackItem,
): readonly (CardInstanceId | 'base')[] {
  if (item.controller !== player) {
    return [];
  }

  const selectors = requiredTargetSelectors(item);
  if (selectors.length === 0) {
    return [];
  }

  const candidates: (CardInstanceId | 'base')[] = [];
  const playerState = state.players[player];
  if (playerState !== undefined) {
    for (const unit of playerState.battlefield) {
      candidates.push(unit.id);
    }
  }

  for (const opponent of Object.values(state.players)) {
    if (opponent.id === player) {
      continue;
    }

    for (const unit of opponent.battlefield) {
      candidates.push(unit.id);
    }
  }
  candidates.push('base');

  return candidates.filter((target) =>
    selectors.every((selector) => validateTarget(state, item.controller, selector, target)),
  );
}

function requiredTargetSelectors(item: StackItem): readonly TargetSelector[] {
  const selectors: TargetSelector[] = [];

  for (const effect of item.effects) {
    if (effect.target === undefined || effect.target === 'self') {
      continue;
    }

    if (!selectors.includes(effect.target)) {
      selectors.push(effect.target);
    }
  }

  return selectors;
}
