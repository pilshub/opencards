import type {
  ApplyResult,
  CardInstance,
  CardInstanceId,
  Command,
  EngineEffect,
  Event,
  Phase,
  Player,
  PlayerId,
  StackItem,
  State,
  TargetSelector,
  Unit,
  ValidationIssue,
  ZoneId,
} from './types.js';
import { drawTop, moveCard, type CardZoneId } from './zones.js';

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

const phaseNotMain = (): ValidationIssue => ({
  code: 'PHASE_NOT_MAIN',
  message: 'playCard requires the main phase',
});

const phaseNotStart = (): ValidationIssue => ({
  code: 'PHASE_NOT_START',
  message: 'drawCard requires the start phase',
});

const alreadyDrew = (player: string): ValidationIssue => ({
  code: 'ALREADY_DREW',
  message: `Player has already drawn this turn: ${player}`,
});

const cardNotInHand = (instance: string): ValidationIssue => ({
  code: 'CARD_NOT_IN_HAND',
  message: `Card instance not found in player hand: ${instance}`,
});

const unknownCard = (kind: string): ValidationIssue => ({
  code: 'UNKNOWN_CARD',
  message: `No card spec found for kind: ${kind}`,
});

const insufficientEnergy = (have: number, need: number): ValidationIssue => ({
  code: 'INSUFFICIENT_ENERGY',
  message: `Insufficient energy: have ${have}, need ${need}`,
});

const phaseNotCombat = (): ValidationIssue => ({
  code: 'PHASE_NOT_COMBAT',
  message: 'attack requires the combat phase',
});

const attackerNotFound = (attacker: string): ValidationIssue => ({
  code: 'ATTACKER_NOT_FOUND',
  message: `Attacker not found in player battlefield: ${attacker}`,
});

const unitExhausted = (attacker: string): ValidationIssue => ({
  code: 'UNIT_EXHAUSTED',
  message: `Unit is exhausted and cannot attack: ${attacker}`,
});

const invalidAttackTarget = (target: string): ValidationIssue => ({
  code: 'INVALID_TARGET',
  message: `Invalid attack target: ${target}`,
});

const emptyStack = (): ValidationIssue => ({
  code: 'EMPTY_STACK',
  message: 'The stack is empty',
});

const notController = (player: string): ValidationIssue => ({
  code: 'NOT_CONTROLLER',
  message: `Player does not control the top stack item: ${player}`,
});

const targetRequired = (): ValidationIssue => ({
  code: 'TARGET_REQUIRED',
  message: 'A target is required before this stack item can resolve',
});

const invalidEffectTarget = (target: string): ValidationIssue => ({
  code: 'INVALID_TARGET',
  message: `Invalid target: ${target}`,
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

/** Apply damage to one base or unit and emit the matching damageDealt event. */
export function applyDamageToTarget(
  state: State,
  owner: PlayerId,
  target: CardInstanceId | 'base',
  amount: number,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const player = state.players[owner];
  if (player === undefined) {
    return { state, events };
  }

  if (target === 'base') {
    const updatedPlayer: Player = { ...player, base: player.base - amount };
    return {
      state: { ...state, players: { ...state.players, [owner]: updatedPlayer } },
      events: [...events, { type: 'damageDealt', target, amount, owner }],
    };
  }

  const unit = player.battlefield.find((candidate) => candidate.id === target);
  if (unit === undefined) {
    return { state, events };
  }

  const updatedUnit: Unit = { ...unit, damage: unit.damage + amount };
  const updatedPlayer: Player = {
    ...player,
    battlefield: player.battlefield.map((candidate) =>
      candidate.id === target ? updatedUnit : candidate,
    ),
  };

  return {
    state: { ...state, players: { ...state.players, [owner]: updatedPlayer } },
    events: [...events, { type: 'damageDealt', target, amount, owner }],
  };
}

/** Move every unit with lethal damage to its owner's discard and emit unitDestroyed events. */
export function processDeaths(
  state: State,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  let current = state;
  let currentEvents = events;

  for (const ownerId of Object.keys(current.players) as PlayerId[]) {
    const ownerPlayer = current.players[ownerId];
    if (ownerPlayer === undefined) {
      continue;
    }

    const dead = ownerPlayer.battlefield.filter((unit) => unit.damage >= unit.health);
    if (dead.length === 0) {
      continue;
    }

    const surviving = ownerPlayer.battlefield.filter((unit) => unit.damage < unit.health);
    const deadInstances: CardInstance[] = dead.map((unit) => ({
      id: unit.id,
      kind: unit.kind,
    }));
    const updatedOwner: Player = {
      ...ownerPlayer,
      battlefield: surviving,
      discard: [...ownerPlayer.discard, ...deadInstances],
    };
    current = {
      ...current,
      players: { ...current.players, [ownerId]: updatedOwner },
    };

    for (const instance of deadInstances) {
      currentEvents = [...currentEvents, { type: 'unitDestroyed', owner: ownerId, instance }];
    }
  }

  return { state: current, events: currentEvents };
}

/** Apply damage and immediately process resulting deaths. Used by effect dealDamage. */
export function applyDamageAndDeaths(
  state: State,
  owner: PlayerId,
  target: CardInstanceId | 'base',
  amount: number,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const damaged = applyDamageToTarget(state, owner, target, amount, events);
  return processDeaths(damaged.state, damaged.events);
}

/** Pure target validation shared by chooseTarget and resolveStack. */
export function validateTarget(
  state: State,
  controller: PlayerId,
  selector: TargetSelector,
  target: CardInstanceId | 'base' | null,
): boolean {
  const controllerState = state.players[controller];
  if (controllerState === undefined || target === null) {
    return false;
  }

  const opponentId = getOpponentId(state, controller);
  const opponent = opponentId === undefined ? undefined : state.players[opponentId];

  switch (selector) {
    case 'self':
      return target === 'base';
    case 'ownUnit':
      return target !== 'base' && controllerState.battlefield.some((unit) => unit.id === target);
    case 'enemyUnit':
      return (
        target !== 'base' && (opponent?.battlefield.some((unit) => unit.id === target) ?? false)
      );
    case 'enemyBase':
      return target === 'base' && opponent !== undefined;
    case 'enemyUnitOrBase':
      return (
        (target === 'base' && opponent !== undefined) ||
        (target !== 'base' && (opponent?.battlefield.some((unit) => unit.id === target) ?? false))
      );
    case 'anyUnit':
      return (
        target !== 'base' &&
        Object.values(state.players).some((player) =>
          player.battlefield.some((unit) => unit.id === target),
        )
      );
  }
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

      if (command.player !== state.activePlayer) {
        return { state, events: [], issues: [notActivePlayer(command.player)] };
      }

      if (state.phase !== 'start') {
        return { state, events: [], issues: [phaseNotStart()] };
      }

      if (player.drawnThisTurn) {
        return { state, events: [], issues: [alreadyDrew(command.player)] };
      }

      if (player.deck.length === 0) {
        return { state, events: [], issues: [emptyDeck(command.player)] };
      }

      const drawn = player.deck[0]!;
      const stateWithDraw = moveCard(state, drawn, 'deck', 'hand');
      const drawnPlayer = stateWithDraw.players[command.player]!;
      const nextState: State = {
        ...stateWithDraw,
        players: {
          ...stateWithDraw.players,
          [command.player]: { ...drawnPlayer, drawnThisTurn: true },
        },
      };
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

      const stateWithoutTemporaryModifiers = clearTemporaryModifiers(state);

      // Find the next player (cycle through player order).
      const playerIds = Object.keys(stateWithoutTemporaryModifiers.players) as PlayerId[];
      const currentIdx = playerIds.indexOf(command.player);
      const nextPlayer = playerIds[(currentIdx + 1) % playerIds.length] as PlayerId;
      const newTurn = state.turn + 1;

      // Grant +1 energy to the incoming active player and ready all their units.
      const nextPlayerState = stateWithoutTemporaryModifiers.players[nextPlayer]!;
      const updatedNextPlayer: Player = {
        ...nextPlayerState,
        energy: nextPlayerState.energy + 1,
        drawnThisTurn: false,
        battlefield: nextPlayerState.battlefield.map((unit) => ({ ...unit, exhausted: false })),
      };

      const nextState: State = {
        ...stateWithoutTemporaryModifiers,
        players: {
          ...stateWithoutTemporaryModifiers.players,
          [nextPlayer]: updatedNextPlayer,
        },
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

    case 'playCard': {
      const player = state.players[command.player];

      if (player === undefined) {
        return { state, events: [], issues: [unknownPlayer(command.player)] };
      }

      if (command.player !== state.activePlayer) {
        return { state, events: [], issues: [notActivePlayer(command.player)] };
      }

      if (state.phase !== 'main') {
        return { state, events: [], issues: [phaseNotMain()] };
      }

      const card = player.hand.find((candidate) => candidate.id === command.instance);
      if (card === undefined) {
        return { state, events: [], issues: [cardNotInHand(command.instance)] };
      }

      const spec = state.cards[card.kind];
      if (spec === undefined) {
        return { state, events: [], issues: [unknownCard(card.kind)] };
      }

      if (player.energy < spec.cost) {
        return { state, events: [], issues: [insufficientEnergy(player.energy, spec.cost)] };
      }

      if (spec.type === 'unit') {
        // Remove card from hand, append a Unit to battlefield (exhausted: summoning sickness).
        const newUnit: Unit = {
          id: card.id,
          kind: card.kind,
          attack: spec.attack ?? 0,
          health: spec.health ?? 1,
          damage: 0,
          exhausted: true,
        };
        const updatedPlayer: Player = {
          ...player,
          energy: player.energy - spec.cost,
          hand: player.hand.filter((candidate) => candidate.id !== card.id),
          battlefield: [...player.battlefield, newUnit],
        };
        const nextState: State = {
          ...state,
          players: { ...state.players, [command.player]: updatedPlayer },
        };
        const events: readonly Event[] = [
          { type: 'resourceSpent', player: command.player, resource: 'energy', amount: spec.cost },
          { type: 'cardPlayed', player: command.player, instance: card, to: 'battlefield' },
        ];
        const checked = checkWin(nextState, events);
        return { state: checked.state, events: checked.events, issues: [] };
      }

      const stackItem: StackItem = {
        source: card.id,
        controller: command.player,
        kind: card.kind,
        effects: spec.effects ?? [],
        target: null,
      };
      const updatedPlayer: Player = {
        ...player,
        energy: player.energy - spec.cost,
        hand: player.hand.filter((candidate) => candidate.id !== card.id),
      };
      const nextState: State = {
        ...state,
        players: { ...state.players, [command.player]: updatedPlayer },
        stack: [...state.stack, stackItem],
      };

      const events: readonly Event[] = [
        { type: 'resourceSpent', player: command.player, resource: 'energy', amount: spec.cost },
        { type: 'cardPlayed', player: command.player, instance: card, to: 'stack' },
      ];
      const checked = checkWin(nextState, events);
      return { state: checked.state, events: checked.events, issues: [] };
    }

    case 'chooseTarget': {
      const player = state.players[command.player];
      if (player === undefined) {
        return { state, events: [], issues: [unknownPlayer(command.player)] };
      }

      const top = topStackItem(state);
      if (top === undefined) {
        return { state, events: [], issues: [emptyStack()] };
      }

      if (top.controller !== command.player) {
        return { state, events: [], issues: [notController(command.player)] };
      }

      const selectors = requiredTargetSelectors(top);
      if (selectors.length === 0) {
        return { state, events: [], issues: [invalidEffectTarget(command.target)] };
      }

      if (
        !selectors.every((selector) =>
          validateTarget(state, top.controller, selector, command.target),
        )
      ) {
        return { state, events: [], issues: [invalidEffectTarget(command.target)] };
      }

      const nextStack = [...state.stack.slice(0, -1), { ...top, target: command.target }];
      const nextState: State = { ...state, stack: nextStack };
      return {
        state: nextState,
        events: [
          {
            type: 'targetChosen',
            player: command.player,
            source: top.source,
            target: command.target,
          },
        ],
        issues: [],
      };
    }

    case 'resolveStack': {
      const player = state.players[command.player];
      if (player === undefined) {
        return { state, events: [], issues: [unknownPlayer(command.player)] };
      }

      const top = topStackItem(state);
      if (top === undefined) {
        return { state, events: [], issues: [emptyStack()] };
      }

      if (top.controller !== command.player) {
        return { state, events: [], issues: [notController(command.player)] };
      }

      const selectors = requiredTargetSelectors(top);
      if (selectors.length > 0 && top.target === null) {
        return { state, events: [], issues: [targetRequired()] };
      }

      if (
        top.target !== null &&
        !selectors.every((selector) => validateTarget(state, top.controller, selector, top.target))
      ) {
        return { state, events: [], issues: [invalidEffectTarget(top.target)] };
      }

      const stateWithPop: State = { ...state, stack: state.stack.slice(0, -1) };
      const resolved = resolveStackItem(stateWithPop, top);
      const withDiscard = discardStackSource(resolved.state, top);
      const checked = checkWin(withDiscard, resolved.events);
      return { state: checked.state, events: checked.events, issues: [] };
    }

    case 'attack': {
      const player = state.players[command.player];

      if (player === undefined) {
        return { state, events: [], issues: [unknownPlayer(command.player)] };
      }

      if (command.player !== state.activePlayer) {
        return { state, events: [], issues: [notActivePlayer(command.player)] };
      }

      if (state.phase !== 'combat') {
        return { state, events: [], issues: [phaseNotCombat()] };
      }

      const attackerUnit = player.battlefield.find((unit) => unit.id === command.attacker);
      if (attackerUnit === undefined) {
        return { state, events: [], issues: [attackerNotFound(command.attacker)] };
      }

      if (attackerUnit.exhausted) {
        return { state, events: [], issues: [unitExhausted(command.attacker)] };
      }

      const opponentId = getOpponentId(state, command.player);
      if (opponentId === undefined) {
        return { state, events: [], issues: [invalidAttackTarget(command.target)] };
      }
      const opponent = state.players[opponentId]!;

      const updatedPlayerState: Player = {
        ...player,
        battlefield: player.battlefield.map((unit) =>
          unit.id === attackerUnit.id ? { ...unit, exhausted: true } : unit,
        ),
      };

      let nextState: State = {
        ...state,
        players: {
          ...state.players,
          [command.player]: updatedPlayerState,
        },
      };
      let events: readonly Event[] = [
        {
          type: 'attackDeclared',
          player: command.player,
          attacker: command.attacker,
          target: command.target,
        },
      ];

      if (command.target === 'base') {
        const damaged = applyDamageToTarget(
          nextState,
          opponentId,
          'base',
          attackerUnit.attack,
          events,
        );
        nextState = damaged.state;
        events = damaged.events;
      } else {
        const defenderUnit = opponent.battlefield.find((unit) => unit.id === command.target);
        if (defenderUnit === undefined) {
          return { state, events: [], issues: [invalidAttackTarget(command.target)] };
        }

        const defenderDamaged = applyDamageToTarget(
          nextState,
          opponentId,
          defenderUnit.id,
          attackerUnit.attack,
          events,
        );
        const attackerDamaged = applyDamageToTarget(
          defenderDamaged.state,
          command.player,
          attackerUnit.id,
          defenderUnit.attack,
          defenderDamaged.events,
        );
        const afterDeaths = processDeaths(attackerDamaged.state, attackerDamaged.events);
        nextState = afterDeaths.state;
        events = afterDeaths.events;
      }

      const checked = checkWin(nextState, events);
      return { state: checked.state, events: checked.events, issues: [] };
    }

    default:
      return { state, events: [], issues: [unknownCommand(command as { type?: unknown })] };
  }
}

function getOpponentId(state: State, player: PlayerId): PlayerId | undefined {
  return (Object.keys(state.players) as PlayerId[]).find((id) => id !== player);
}

function topStackItem(state: State): StackItem | undefined {
  return state.stack[state.stack.length - 1];
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

function resolveStackItem(
  state: State,
  item: StackItem,
): { state: State; events: readonly Event[] } {
  let current = state;
  let events: readonly Event[] = [];

  item.effects.forEach((effect, index) => {
    const result = applyEffect(current, item, effect, index, events);
    current = result.state;
    events = result.events;
  });

  return { state: current, events };
}

function applyEffect(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  effectIndex: number,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  switch (effect.op) {
    case 'gainResource':
      return applyGainResource(state, item, effect, events);
    case 'drawCards':
      return applyDrawCards(state, item, effect, events);
    case 'dealDamage':
      return applyDealDamage(state, item, effect, events);
    case 'heal':
      return applyHeal(state, item, effect, events);
    case 'summonUnit':
      return applySummonUnit(state, item, effect, effectIndex, events);
    case 'moveCard':
      return applyMoveCardEffect(state, item, effect, events);
    case 'discardCards':
      return applyDiscardCards(state, item, effect, events);
    case 'addCounter':
      return applyAddCounter(state, item, effect, events);
    case 'modifyStatUntilEndOfTurn':
      return applyModifyStatUntilEndOfTurn(state, item, effect, events);
  }
}

function applyGainResource(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const playerId = resolvePlayerForEffect(state, item, effect);
  const player = state.players[playerId];
  if (player === undefined) {
    return { state, events };
  }

  const amount = effect.amount ?? 0;
  const updatedPlayer: Player = { ...player, energy: player.energy + amount };
  return {
    state: { ...state, players: { ...state.players, [playerId]: updatedPlayer } },
    events: [...events, { type: 'resourceGained', player: playerId, resource: 'energy', amount }],
  };
}

function applyDrawCards(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const playerId = resolvePlayerForEffect(state, item, effect);
  let player = state.players[playerId];
  if (player === undefined) {
    return { state, events };
  }

  let current = state;
  let currentEvents = events;
  const amount = Math.max(0, effect.amount ?? 0);

  for (let draw = 0; draw < amount; draw += 1) {
    const result = drawTop(player.deck);
    if (result.instance === undefined) {
      break;
    }

    player = { ...player, deck: result.zone, hand: [...player.hand, result.instance] };
    current = { ...current, players: { ...current.players, [playerId]: player } };
    currentEvents = [
      ...currentEvents,
      { type: 'cardDrawn', player: playerId, instance: result.instance },
    ];
  }

  return { state: current, events: currentEvents };
}

function applyDealDamage(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const resolved = resolveUnitOrBaseTarget(state, item, effect);
  if (resolved === null) {
    return { state, events };
  }

  return applyDamageAndDeaths(state, resolved.owner, resolved.target, effect.amount ?? 0, events);
}

function applyHeal(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const resolved = resolveUnitOrBaseTarget(state, item, effect);
  if (resolved === null) {
    return { state, events };
  }

  const player = state.players[resolved.owner];
  if (player === undefined) {
    return { state, events };
  }

  const amount = effect.amount ?? 0;
  if (resolved.target === 'base') {
    const updatedPlayer: Player = { ...player, base: player.base + amount };
    return {
      state: { ...state, players: { ...state.players, [resolved.owner]: updatedPlayer } },
      events: [...events, { type: 'healed', target: 'base', amount, owner: resolved.owner }],
    };
  }

  const unit = player.battlefield.find((candidate) => candidate.id === resolved.target);
  if (unit === undefined) {
    return { state, events };
  }

  const updatedUnit: Unit = { ...unit, damage: Math.max(0, unit.damage - amount) };
  const updatedPlayer: Player = {
    ...player,
    battlefield: player.battlefield.map((candidate) =>
      candidate.id === resolved.target ? updatedUnit : candidate,
    ),
  };

  return {
    state: { ...state, players: { ...state.players, [resolved.owner]: updatedPlayer } },
    events: [...events, { type: 'healed', target: resolved.target, amount, owner: resolved.owner }],
  };
}

function applySummonUnit(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  effectIndex: number,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const playerId = resolvePlayerForEffect(state, item, effect);
  const player = state.players[playerId];
  if (player === undefined) {
    return { state, events };
  }

  const kind = effect.kind ?? item.kind;
  const spec = state.cards[kind];
  const unit: Unit = {
    id: `${item.source}-summon-${effectIndex}` as CardInstanceId,
    kind,
    attack: spec?.attack ?? 0,
    health: spec?.health ?? 1,
    damage: 0,
    exhausted: true,
  };
  const updatedPlayer: Player = {
    ...player,
    battlefield: [...player.battlefield, unit],
  };

  return {
    state: { ...state, players: { ...state.players, [playerId]: updatedPlayer } },
    events: [...events, { type: 'unitSummoned', player: playerId, unit }],
  };
}

function applyMoveCardEffect(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const instance: CardInstance = { id: item.source, kind: item.kind };
  const from = effect.from ?? 'stack';
  const to = effect.to ?? 'discard';
  const nextState =
    isCardZone(from) && isCardZone(to) ? moveCard(state, instance, from, to) : state;

  return {
    state: nextState,
    events: [...events, { type: 'cardMoved', instance, from, to }],
  };
}

function applyDiscardCards(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const playerId = resolvePlayerForEffect(state, item, effect);
  const player = state.players[playerId];
  if (player === undefined) {
    return { state, events };
  }

  const amount = Math.max(0, effect.amount ?? 0);
  const discarded = player.hand.slice(0, amount);
  const updatedPlayer: Player = {
    ...player,
    hand: player.hand.slice(discarded.length),
    discard: [...player.discard, ...discarded],
  };

  return {
    state: { ...state, players: { ...state.players, [playerId]: updatedPlayer } },
    events: [...events, { type: 'cardsDiscarded', player: playerId, instances: discarded }],
  };
}

function applyAddCounter(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const resolved = resolveUnitOrBaseTarget(state, item, effect);
  if (resolved === null || resolved.target === 'base') {
    return { state, events };
  }

  const player = state.players[resolved.owner];
  const unit = player?.battlefield.find((candidate) => candidate.id === resolved.target);
  if (player === undefined || unit === undefined) {
    return { state, events };
  }

  const counter = effect.counter ?? 'counter';
  const amount = effect.amount ?? 0;
  const updatedUnit: Unit = {
    ...unit,
    counters: { ...(unit.counters ?? {}), [counter]: (unit.counters?.[counter] ?? 0) + amount },
  };
  const updatedPlayer: Player = {
    ...player,
    battlefield: player.battlefield.map((candidate) =>
      candidate.id === resolved.target ? updatedUnit : candidate,
    ),
  };

  return {
    state: { ...state, players: { ...state.players, [resolved.owner]: updatedPlayer } },
    events: [
      ...events,
      { type: 'counterAdded', target: resolved.target, owner: resolved.owner, counter, amount },
    ],
  };
}

function applyModifyStatUntilEndOfTurn(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const resolved = resolveUnitOrBaseTarget(state, item, effect);
  if (resolved === null || resolved.target === 'base') {
    return { state, events };
  }

  const player = state.players[resolved.owner];
  const unit = player?.battlefield.find((candidate) => candidate.id === resolved.target);
  if (player === undefined || unit === undefined) {
    return { state, events };
  }

  const stat = effect.stat ?? 'attack';
  const amount = effect.amount ?? 0;
  const updatedUnit: Unit = {
    ...unit,
    [stat]: unit[stat] + amount,
    temporaryModifiers: [...(unit.temporaryModifiers ?? []), { stat, amount }],
  };
  const updatedPlayer: Player = {
    ...player,
    battlefield: player.battlefield.map((candidate) =>
      candidate.id === resolved.target ? updatedUnit : candidate,
    ),
  };

  return {
    state: { ...state, players: { ...state.players, [resolved.owner]: updatedPlayer } },
    events: [
      ...events,
      { type: 'statModified', target: resolved.target, owner: resolved.owner, stat, amount },
    ],
  };
}

function resolveUnitOrBaseTarget(
  state: State,
  item: StackItem,
  effect: EngineEffect,
): { owner: PlayerId; target: CardInstanceId | 'base' } | null {
  const selector = effect.target;

  if (selector === 'self') {
    return { owner: item.controller, target: 'base' };
  }

  if (selector === 'enemyBase') {
    const opponentId = getOpponentId(state, item.controller);
    return opponentId === undefined ? null : { owner: opponentId, target: 'base' };
  }

  if (item.target === null) {
    return null;
  }

  if (item.target === 'base') {
    if (selector === 'enemyUnitOrBase') {
      const opponentId = getOpponentId(state, item.controller);
      return opponentId === undefined ? null : { owner: opponentId, target: 'base' };
    }
    return null;
  }

  const owner = findUnitOwner(state, item.target);
  return owner === undefined ? null : { owner, target: item.target };
}

function resolvePlayerForEffect(state: State, item: StackItem, effect: EngineEffect): PlayerId {
  const resolved = resolveUnitOrBaseTarget(state, item, effect);
  return resolved?.owner ?? item.controller;
}

function findUnitOwner(state: State, target: CardInstanceId): PlayerId | undefined {
  return (Object.keys(state.players) as PlayerId[]).find((playerId) =>
    state.players[playerId]?.battlefield.some((unit) => unit.id === target),
  );
}

function discardStackSource(state: State, item: StackItem): State {
  const controller = state.players[item.controller];
  if (controller === undefined) {
    return state;
  }

  const instance: CardInstance = { id: item.source, kind: item.kind };
  const updatedController: Player = {
    ...controller,
    discard: [...controller.discard, instance],
  };
  return {
    ...state,
    players: { ...state.players, [item.controller]: updatedController },
  };
}

function clearTemporaryModifiers(state: State): State {
  let changed = false;
  const players = { ...state.players };

  for (const playerId of Object.keys(state.players) as PlayerId[]) {
    const player = state.players[playerId];
    if (player === undefined) {
      continue;
    }

    const battlefield = player.battlefield.map((unit) => {
      if (unit.temporaryModifiers === undefined || unit.temporaryModifiers.length === 0) {
        return unit;
      }

      changed = true;
      const reverted = unit.temporaryModifiers.reduce(
        (current, modifier) => ({
          ...current,
          [modifier.stat]: current[modifier.stat] - modifier.amount,
        }),
        unit,
      );
      const { temporaryModifiers: _temporaryModifiers, ...withoutTemporaryModifiers } = reverted;
      return withoutTemporaryModifiers;
    });

    if (battlefield.some((unit, index) => unit !== player.battlefield[index])) {
      players[playerId] = { ...player, battlefield };
    }
  }

  return changed ? { ...state, players } : state;
}

function isCardZone(zone: ZoneId): zone is CardZoneId {
  return zone === 'hand' || zone === 'deck' || zone === 'discard' || zone === 'exile';
}
