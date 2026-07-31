import type {
  AbilityTrigger,
  ApplyResult,
  CardInstance,
  CardInstanceId,
  Command,
  EngineEffect,
  EngineCondition,
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
import { CLASSIC_RULESET } from './ruleset.js';
import { nextRangeRng } from './rng.js';

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

const battlefieldFull = (limit: number): ValidationIssue => ({
  code: 'BATTLEFIELD_FULL',
  message: `Battlefield is full (limit ${String(limit)})`,
});

const guardBlocksAttack = (): ValidationIssue => ({
  code: 'GUARD_BLOCKS_ATTACK',
  message: 'A visible guard unit must be attacked first',
});

const rushCannotAttackBase = (): ValidationIssue => ({
  code: 'RUSH_CANNOT_ATTACK_BASE',
  message: 'A newly summoned rush unit cannot attack the enemy base',
});

const choicePending = (): ValidationIssue => ({
  code: 'CHOICE_PENDING',
  message: 'Resolve the pending choice before issuing another command',
});

const invalidChoice = (): ValidationIssue => ({
  code: 'INVALID_CHOICE',
  message: 'The selected choice option is not available',
});

function nextPhase(state: State, current: Phase): Phase | null {
  const phases = state.ruleset?.phases ?? CLASSIC_RULESET.phases;
  const idx = phases.indexOf(current);
  if (idx === -1 || idx === phases.length - 1) {
    return null;
  }
  return phases[idx + 1]!;
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

  if (amount > 0 && hasKeyword(unit, 'shield')) {
    const updatedUnit = withoutKeyword(unit, 'shield');
    const updatedPlayer: Player = {
      ...player,
      battlefield: player.battlefield.map((candidate) =>
        candidate.id === target ? updatedUnit : candidate,
      ),
    };
    return {
      state: { ...state, players: { ...state.players, [owner]: updatedPlayer } },
      events: [...events, { type: 'shieldBroken', owner, target }],
    };
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

    for (const unit of dead) {
      const triggered = resolveTriggeredAbilities(current, unit, ownerId, 'onDeath', currentEvents);
      current = triggered.state;
      currentEvents = triggered.events;
    }

    const secrets = resolveSecrets(current, ownerId, 'onFriendlyDeath', currentEvents);
    current = secrets.state;
    currentEvents = secrets.events;
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
        target !== 'base' &&
        (opponent?.battlefield.some((unit) => unit.id === target && !hasKeyword(unit, 'stealth')) ??
          false)
      );
    case 'enemyBase':
      return target === 'base' && opponent !== undefined;
    case 'enemyUnitOrBase':
      return (
        (target === 'base' && opponent !== undefined) ||
        (target !== 'base' &&
          (opponent?.battlefield.some(
            (unit) => unit.id === target && !hasKeyword(unit, 'stealth'),
          ) ??
            false))
      );
    case 'anyUnit':
      return (
        target !== 'base' &&
        (controllerState.battlefield.some((unit) => unit.id === target) ||
          (opponent?.battlefield.some(
            (unit) => unit.id === target && !hasKeyword(unit, 'stealth'),
          ) ??
            false))
      );
  }
}

/** Apply a command to canonical state without mutating the input. */
export function apply(state: State, command: Command): ApplyResult {
  // Global GAME_OVER guard.
  if (state.winner !== null) {
    return { state, events: [], issues: [gameOver()] };
  }
  if (state.pendingChoice !== undefined && command.type !== 'makeChoice') {
    return { state, events: [], issues: [choicePending()] };
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
        const fatigue = (state.ruleset ?? CLASSIC_RULESET).fatigue;
        if (!fatigue.enabled) {
          return { state, events: [], issues: [emptyDeck(command.player)] };
        }

        const count = (player.fatigueCount ?? 0) + 1;
        const amount = fatigue.firstDamage + (count - 1) * fatigue.increment;
        const updatedPlayer: Player = {
          ...player,
          base: player.base - amount,
          drawnThisTurn: true,
          fatigueCount: count,
        };
        const nextState: State = {
          ...state,
          players: { ...state.players, [command.player]: updatedPlayer },
        };
        const events: readonly Event[] = [
          { type: 'fatigueTriggered', player: command.player, amount, count },
          { type: 'damageDealt', target: 'base', amount, owner: command.player },
        ];
        const checked = checkWin(nextState, events);
        return { state: checked.state, events: checked.events, issues: [] };
      }

      const drawn = player.deck[0]!;
      const handLimit = (state.ruleset ?? CLASSIC_RULESET).handLimit;
      if (handLimit !== null && player.hand.length >= handLimit) {
        const updatedPlayer: Player = {
          ...player,
          deck: player.deck.slice(1),
          discard: [...player.discard, drawn],
          drawnThisTurn: true,
        };
        return {
          state: {
            ...state,
            players: { ...state.players, [command.player]: updatedPlayer },
          },
          events: [{ type: 'cardBurned', player: command.player, instance: drawn }],
          issues: [],
        };
      }
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

      const next = nextPhase(state, state.phase);
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

      const ended = resolvePlayerTrigger(state, command.player, 'turnEnd', []);
      const endedCheck = checkWin(ended.state, ended.events);
      if (endedCheck.state.winner !== null) {
        return { state: endedCheck.state, events: endedCheck.events, issues: [] };
      }
      const stateWithoutTemporaryModifiers = clearTemporaryModifiers(endedCheck.state);

      // Find the next player (cycle through player order).
      const playerIds = Object.keys(stateWithoutTemporaryModifiers.players) as PlayerId[];
      const currentIdx = playerIds.indexOf(command.player);
      const nextPlayer = playerIds[(currentIdx + 1) % playerIds.length] as PlayerId;
      const newTurn = state.turn + 1;

      // Advance resource capacity according to the active ruleset and ready units.
      const nextPlayerState = stateWithoutTemporaryModifiers.players[nextPlayer]!;
      const ruleset = state.ruleset ?? CLASSIC_RULESET;
      const currentCapacity = nextPlayerState.maxEnergy ?? nextPlayerState.energy;
      const uncappedCapacity = currentCapacity + ruleset.energy.gainPerTurn;
      const nextCapacity =
        ruleset.energy.maximum === null
          ? uncappedCapacity
          : Math.min(ruleset.energy.maximum, uncappedCapacity);
      const nextEnergy = ruleset.energy.refillAtTurnStart
        ? nextCapacity
        : ruleset.energy.maximum === null
          ? nextPlayerState.energy + ruleset.energy.gainPerTurn
          : Math.min(ruleset.energy.maximum, nextPlayerState.energy + ruleset.energy.gainPerTurn);
      const updatedNextPlayer: Player = {
        ...nextPlayerState,
        energy: nextEnergy,
        ...(state.ruleset === undefined ? {} : { maxEnergy: nextCapacity }),
        drawnThisTurn: false,
        battlefield: nextPlayerState.battlefield.map((unit) =>
          readyUnit(unit, state.ruleset !== undefined),
        ),
      };

      const nextState: State = {
        ...stateWithoutTemporaryModifiers,
        players: {
          ...stateWithoutTemporaryModifiers.players,
          [nextPlayer]: updatedNextPlayer,
        },
        activePlayer: nextPlayer,
        phase: ruleset.startingPhase,
        turn: newTurn,
      };

      const events: readonly Event[] = [
        ...endedCheck.events,
        {
          type: 'resourceGained',
          player: nextPlayer,
          resource: 'energy',
          amount: nextCapacity - currentCapacity,
        },
        { type: 'turnEnded', player: command.player, nextPlayer, turn: newTurn },
      ];

      const started = resolvePlayerTrigger(nextState, nextPlayer, 'turnStart', events);
      const checked = checkWin(started.state, started.events);
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
        const battlefieldLimit = (state.ruleset ?? CLASSIC_RULESET).battlefieldLimit;
        if (battlefieldLimit !== null && player.battlefield.length >= battlefieldLimit) {
          return { state, events: [], issues: [battlefieldFull(battlefieldLimit)] };
        }

        // Remove card from hand, append a Unit to battlefield (exhausted: summoning sickness).
        const newUnit: Unit = {
          id: card.id,
          kind: card.kind,
          attack: spec.attack ?? 0,
          health: spec.health ?? 1,
          damage: 0,
          exhausted: !canActOnSummon(spec.keywords),
          ...(spec.keywords === undefined ? {} : { keywords: [...spec.keywords] }),
          ...(state.ruleset === undefined ? {} : { attacksThisTurn: 0, summonedTurn: state.turn }),
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
        const triggered = resolveTriggeredAbilities(
          nextState,
          newUnit,
          command.player,
          'onPlay',
          events,
        );
        const opponentId = getOpponentId(triggered.state, command.player);
        const secrets =
          opponentId === undefined
            ? triggered
            : resolveSecrets(triggered.state, opponentId, 'onEnemyPlay', triggered.events);
        const checked = checkWin(secrets.state, secrets.events);
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
      const opponentId = getOpponentId(nextState, command.player);
      const secrets =
        opponentId === undefined
          ? { state: nextState, events }
          : resolveSecrets(nextState, opponentId, 'onEnemyPlay', events);
      const checked = checkWin(secrets.state, secrets.events);
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

    case 'makeChoice': {
      const pending = state.pendingChoice;
      if (pending === undefined || pending.player !== command.player) {
        return { state, events: [], issues: [invalidChoice()] };
      }
      const effects = pending.options[command.option];
      if (effects === undefined) {
        return { state, events: [], issues: [invalidChoice()] };
      }
      const { pendingChoice: _pendingChoice, ...withoutChoice } = state;
      const item: StackItem = {
        source: pending.source,
        controller: pending.player,
        kind: pending.kind,
        effects,
        target: null,
      };
      const resolved = resolveStackItem(withoutChoice, item);
      const events: readonly Event[] = [
        {
          type: 'choiceMade',
          player: pending.player,
          source: pending.source,
          option: command.option,
        },
        ...resolved.events,
      ];
      const checked = checkWin(resolved.state, events);
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

      const visibleGuards = opponent.battlefield.filter(
        (unit) => hasKeyword(unit, 'guard') && !hasKeyword(unit, 'stealth'),
      );
      const defender =
        command.target === 'base'
          ? undefined
          : opponent.battlefield.find((unit) => unit.id === command.target);
      if (
        command.target !== 'base' &&
        (defender === undefined || hasKeyword(defender, 'stealth'))
      ) {
        return { state, events: [], issues: [invalidAttackTarget(command.target)] };
      }
      if (
        visibleGuards.length > 0 &&
        (command.target === 'base' || !visibleGuards.some((unit) => unit.id === command.target))
      ) {
        return { state, events: [], issues: [guardBlocksAttack()] };
      }
      if (
        command.target === 'base' &&
        hasKeyword(attackerUnit, 'rush') &&
        !hasKeyword(attackerUnit, 'charge') &&
        !hasKeyword(attackerUnit, 'haste') &&
        attackerUnit.summonedTurn === state.turn
      ) {
        return { state, events: [], issues: [rushCannotAttackBase()] };
      }

      const updatedPlayerState: Player = {
        ...player,
        battlefield: player.battlefield.map((unit) => {
          if (unit.id !== attackerUnit.id) {
            return unit;
          }
          const attacksThisTurn = (unit.attacksThisTurn ?? 0) + 1;
          const attacked: Unit = {
            ...unit,
            exhausted: !(hasKeyword(unit, 'windfury') && attacksThisTurn < 2),
            ...(state.ruleset === undefined && unit.attacksThisTurn === undefined
              ? {}
              : { attacksThisTurn }),
          };
          return hasKeyword(attacked, 'stealth') ? withoutKeyword(attacked, 'stealth') : attacked;
        }),
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
        if (hasKeyword(attackerUnit, 'lifesteal') && attackerUnit.attack > 0) {
          const healed = healBase(nextState, command.player, attackerUnit.attack, events);
          nextState = healed.state;
          events = healed.events;
        }
      } else {
        const defenderUnit = defender!;
        const attackerDamage = damageThatLands(defenderUnit, attackerUnit.attack);
        const defenderDamage = damageThatLands(attackerUnit, defenderUnit.attack);

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
        let combatState = attackerDamaged.state;
        let combatEvents = attackerDamaged.events;

        if (hasKeyword(attackerUnit, 'poisonous') && attackerDamage > 0) {
          combatState = markUnitLethal(combatState, opponentId, defenderUnit.id);
        }
        if (hasKeyword(defenderUnit, 'poisonous') && defenderDamage > 0) {
          combatState = markUnitLethal(combatState, command.player, attackerUnit.id);
        }
        if (hasKeyword(attackerUnit, 'lifesteal') && attackerDamage > 0) {
          const healed = healBase(combatState, command.player, attackerDamage, combatEvents);
          combatState = healed.state;
          combatEvents = healed.events;
        }
        if (hasKeyword(defenderUnit, 'lifesteal') && defenderDamage > 0) {
          const healed = healBase(combatState, opponentId, defenderDamage, combatEvents);
          combatState = healed.state;
          combatEvents = healed.events;
        }

        const afterDeaths = processDeaths(combatState, combatEvents);
        nextState = afterDeaths.state;
        events = afterDeaths.events;
      }

      const triggered = resolveTriggeredAbilities(
        nextState,
        attackerUnit,
        command.player,
        'onAttack',
        events,
      );
      nextState = triggered.state;
      events = triggered.events;

      const secrets = resolveSecrets(nextState, opponentId, 'onEnemyAttack', events);
      nextState = secrets.state;
      events = secrets.events;

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

function hasKeyword(unit: Unit, keyword: string): boolean {
  return unit.keywords?.includes(keyword) ?? false;
}

function withoutKeyword(unit: Unit, keyword: string): Unit {
  const remaining = unit.keywords?.filter((candidate) => candidate !== keyword) ?? [];
  if (remaining.length > 0) {
    return { ...unit, keywords: remaining };
  }
  const { keywords: _keywords, ...withoutKeywords } = unit;
  return withoutKeywords;
}

function withoutAllKeywords(unit: Unit): Unit {
  const { keywords: _keywords, ...withoutKeywords } = unit;
  return withoutKeywords;
}

function canActOnSummon(keywords: readonly string[] | undefined): boolean {
  return (
    keywords?.some(
      (keyword) => keyword === 'haste' || keyword === 'charge' || keyword === 'rush',
    ) ?? false
  );
}

function readyUnit(unit: Unit, explicitRuleset: boolean): Unit {
  const remaining = unit.disabledTurns ?? 0;
  if (remaining > 0) {
    const nextRemaining = remaining - 1;
    if (nextRemaining > 0) {
      return {
        ...unit,
        exhausted: true,
        disabledTurns: nextRemaining,
        ...(explicitRuleset || unit.attacksThisTurn !== undefined ? { attacksThisTurn: 0 } : {}),
      };
    }
    const { disabledTurns: _disabledTurns, status: _status, ...cleared } = unit;
    return {
      ...cleared,
      exhausted: true,
      ...(explicitRuleset || unit.attacksThisTurn !== undefined ? { attacksThisTurn: 0 } : {}),
    };
  }
  return {
    ...unit,
    exhausted: false,
    ...(explicitRuleset || unit.attacksThisTurn !== undefined ? { attacksThisTurn: 0 } : {}),
  };
}

function damageThatLands(unit: Unit, amount: number): number {
  if (amount <= 0 || hasKeyword(unit, 'shield')) {
    return 0;
  }
  return Math.min(amount, Math.max(0, unit.health - unit.damage));
}

function markUnitLethal(state: State, owner: PlayerId, target: CardInstanceId): State {
  const player = state.players[owner];
  if (player === undefined) {
    return state;
  }
  return {
    ...state,
    players: {
      ...state.players,
      [owner]: {
        ...player,
        battlefield: player.battlefield.map((unit) =>
          unit.id === target ? { ...unit, damage: Math.max(unit.damage, unit.health) } : unit,
        ),
      },
    },
  };
}

function healBase(
  state: State,
  owner: PlayerId,
  amount: number,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const player = state.players[owner];
  if (player === undefined || amount <= 0) {
    return { state, events };
  }
  return {
    state: {
      ...state,
      players: { ...state.players, [owner]: { ...player, base: player.base + amount } },
    },
    events: [...events, { type: 'healed', target: 'base', amount, owner }],
  };
}

function resolvePlayerTrigger(
  state: State,
  owner: PlayerId,
  trigger: AbilityTrigger,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const units = [...(state.players[owner]?.battlefield ?? [])];
  return units.reduce(
    (current, unit) =>
      resolveTriggeredAbilities(current.state, unit, owner, trigger, current.events),
    { state, events },
  );
}

function resolveSecrets(
  state: State,
  owner: PlayerId,
  trigger: 'onEnemyPlay' | 'onEnemyAttack' | 'onFriendlyDeath',
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const player = state.players[owner];
  const matching = player?.secrets?.filter((secret) => secret.trigger === trigger) ?? [];
  if (player === undefined || matching.length === 0) return { state, events };
  const remaining = player.secrets?.filter((secret) => secret.trigger !== trigger) ?? [];
  let current: State = {
    ...state,
    players: {
      ...state.players,
      [owner]: remaining.length === 0 ? removeSecrets(player) : { ...player, secrets: remaining },
    },
  };
  let currentEvents = events;
  for (const secret of matching) {
    currentEvents = [
      ...currentEvents,
      { type: 'secretTriggered', player: owner, source: secret.source },
    ];
    const resolved = resolveStackItem(current, {
      source: secret.source,
      controller: owner,
      kind: secret.kind,
      effects: secret.effects,
      target: null,
    });
    current = resolved.state;
    currentEvents = [...currentEvents, ...resolved.events];
  }
  return { state: current, events: currentEvents };
}

function removeSecrets(player: Player): Player {
  const { secrets: _secrets, ...withoutSecrets } = player;
  return withoutSecrets;
}

function resolveTriggeredAbilities(
  state: State,
  source: Unit,
  owner: PlayerId,
  trigger: AbilityTrigger,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  if (source.silenced === true) {
    return { state, events };
  }
  const abilities = state.cards[source.kind]?.abilities?.filter(
    (ability) =>
      ability.trigger === trigger &&
      (ability.conditions?.every((condition) =>
        conditionMatches(state, source, owner, condition),
      ) ??
        true),
  );
  if (abilities === undefined || abilities.length === 0) {
    return { state, events };
  }

  let current = state;
  let currentEvents = events;
  for (const ability of abilities) {
    currentEvents = [
      ...currentEvents,
      { type: 'abilityTriggered', owner, source: source.id, trigger },
    ];
    const item: StackItem = {
      source: source.id,
      controller: owner,
      kind: source.kind,
      effects: ability.effects,
      target: source.id,
    };
    const resolved = resolveStackItem(current, item);
    current = resolved.state;
    currentEvents = [...currentEvents, ...resolved.events];
  }
  return { state: current, events: currentEvents };
}

function conditionMatches(
  state: State,
  source: Unit,
  owner: PlayerId,
  condition: EngineCondition,
): boolean {
  const opponent = getOpponentId(state, owner);
  const player =
    condition.subject === 'opponent' && opponent !== undefined
      ? state.players[opponent]
      : state.players[owner];
  const actual =
    condition.subject === 'source'
      ? condition.metric === 'damage'
        ? source.damage
        : condition.metric === 'counter'
          ? (source.counters?.[condition.counter ?? 'counter'] ?? 0)
          : 0
      : condition.metric === 'base'
        ? (player?.base ?? 0)
        : condition.metric === 'energy'
          ? (player?.energy ?? 0)
          : condition.metric === 'units'
            ? (player?.battlefield.length ?? 0)
            : condition.metric === 'handSize'
              ? (player?.hand.length ?? 0)
              : 0;
  switch (condition.operator) {
    case 'eq':
      return actual === condition.value;
    case 'neq':
      return actual !== condition.value;
    case 'lt':
      return actual < condition.value;
    case 'lte':
      return actual <= condition.value;
    case 'gt':
      return actual > condition.value;
    case 'gte':
      return actual >= condition.value;
  }
  return false;
}

function topStackItem(state: State): StackItem | undefined {
  return state.stack[state.stack.length - 1];
}

export function requiredTargetSelectors(item: StackItem): readonly TargetSelector[] {
  const selectors: TargetSelector[] = [];

  for (const effect of item.effects) {
    if (
      effect.target === undefined ||
      effect.target === 'self' ||
      effect.op === 'damageAll' ||
      effect.op === 'randomDamage'
    ) {
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
    case 'modifyStat':
      return applyModifyStat(state, item, effect, events);
    case 'applyStatus':
      return applyStatus(state, item, effect, events);
    case 'silence':
      return applySilence(state, item, effect, events);
    case 'addKeyword':
      return applyKeywordChange(state, item, effect, true, events);
    case 'removeKeyword':
      return applyKeywordChange(state, item, effect, false, events);
    case 'attach':
      return applyAttachment(state, item, effect, events);
    case 'setSecret':
      return applySetSecret(state, item, effect, events);
    case 'resurrectUnit':
      return applyResurrectUnit(state, item, effect, events);
    case 'damageAll':
      return applyDamageAll(state, item, effect, events);
    case 'damageAdjacent':
      return applyDamageAdjacent(state, item, effect, events);
    case 'randomDamage':
      return applyRandomDamage(state, item, effect, events);
    case 'chooseOne':
      return applyChooseOne(state, item, effect, events);
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

  const battlefieldLimit = (state.ruleset ?? CLASSIC_RULESET).battlefieldLimit;
  if (battlefieldLimit !== null && player.battlefield.length >= battlefieldLimit) {
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
    exhausted: !canActOnSummon(spec?.keywords),
    ...(spec?.keywords === undefined ? {} : { keywords: [...spec.keywords] }),
    ...(state.ruleset === undefined ? {} : { attacksThisTurn: 0, summonedTurn: state.turn }),
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
  let nextState = state;
  if (from === 'stack' && isCardZone(to)) {
    const player = state.players[item.controller];
    if (player !== undefined) {
      nextState = {
        ...state,
        players: {
          ...state.players,
          [item.controller]: { ...player, [to]: [...player[to], instance] },
        },
      };
    }
  } else if (isCardZone(from) && isCardZone(to)) {
    nextState = moveCard(state, instance, from, to);
  }

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

function applyModifyStat(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const stat = effect.stat ?? 'attack';
  const amount = effect.amount ?? 0;
  return updateTargetUnit(state, item, effect, events, (unit, owner) => ({
    unit: { ...unit, [stat]: Math.max(stat === 'health' ? 1 : 0, unit[stat] + amount) },
    event: { type: 'statModified', target: unit.id, owner, stat, amount },
  }));
}

function applyStatus(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const status = effect.status ?? 'stunned';
  const duration = Math.max(1, effect.duration ?? 1);
  return updateTargetUnit(state, item, effect, events, (unit, owner) => ({
    unit: { ...unit, exhausted: true, status, disabledTurns: duration },
    event: { type: 'statusApplied', owner, target: unit.id, status, duration },
  }));
}

function applySilence(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  return updateTargetUnit(state, item, effect, events, (unit, owner) => {
    const { keywords: _keywords, status: _status, disabledTurns: _disabledTurns, ...base } = unit;
    return {
      unit: { ...base, silenced: true },
      event: { type: 'unitSilenced', owner, target: unit.id },
    };
  });
}

function applyKeywordChange(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  added: boolean,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const keyword = effect.keyword;
  if (keyword === undefined) return { state, events };
  return updateTargetUnit(state, item, effect, events, (unit, owner) => {
    const keywords = new Set(unit.keywords ?? []);
    if (added) keywords.add(keyword);
    else keywords.delete(keyword);
    const values = [...keywords];
    const next = values.length === 0 ? withoutAllKeywords(unit) : { ...unit, keywords: values };
    return {
      unit: next,
      event: { type: 'keywordChanged', owner, target: unit.id, keyword, added },
    };
  });
}

function applyAttachment(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const attachment = {
    kind: effect.kind ?? item.kind,
    type: effect.attachmentType ?? ('enchantment' as const),
    attack: effect.attack ?? 0,
    health: effect.health ?? 0,
  };
  return updateTargetUnit(state, item, effect, events, (unit, owner) => ({
    unit: {
      ...unit,
      attack: Math.max(0, unit.attack + attachment.attack),
      health: Math.max(1, unit.health + attachment.health),
      attachments: [...(unit.attachments ?? []), attachment],
    },
    event: { type: 'attachmentAdded', owner, target: unit.id, attachment },
  }));
}

function applySetSecret(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const player = state.players[item.controller];
  const trigger = effect.trigger;
  if (
    player === undefined ||
    (trigger !== 'onEnemyPlay' && trigger !== 'onEnemyAttack' && trigger !== 'onFriendlyDeath')
  ) {
    return { state, events };
  }
  const secret = { source: item.source, kind: item.kind, trigger, effects: effect.effects ?? [] };
  return {
    state: {
      ...state,
      players: {
        ...state.players,
        [item.controller]: { ...player, secrets: [...(player.secrets ?? []), secret] },
      },
    },
    events: [...events, { type: 'secretSet', player: item.controller, source: item.source }],
  };
}

function applyResurrectUnit(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const playerId = resolvePlayerForEffect(state, item, effect);
  const player = state.players[playerId];
  const limit = (state.ruleset ?? CLASSIC_RULESET).battlefieldLimit;
  if (player === undefined || (limit !== null && player.battlefield.length >= limit)) {
    return { state, events };
  }
  const index = player.discard.findIndex(
    (card) => effect.kind === undefined || card.kind === effect.kind,
  );
  const instance = player.discard[index];
  if (instance === undefined) return { state, events };
  const spec = state.cards[instance.kind];
  if (spec?.type !== 'unit') return { state, events };
  const resurrected: Unit = {
    id: instance.id,
    kind: instance.kind,
    attack: spec.attack ?? 0,
    health: spec.health ?? 1,
    damage: 0,
    exhausted: !canActOnSummon(spec.keywords),
    ...(spec.keywords === undefined ? {} : { keywords: [...spec.keywords] }),
    ...(state.ruleset === undefined ? {} : { attacksThisTurn: 0, summonedTurn: state.turn }),
  };
  const discard = player.discard.filter((_, cardIndex) => cardIndex !== index);
  return {
    state: {
      ...state,
      players: {
        ...state.players,
        [playerId]: { ...player, discard, battlefield: [...player.battlefield, resurrected] },
      },
    },
    events: [...events, { type: 'unitResurrected', player: playerId, unit: resurrected }],
  };
}

function applyDamageAll(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  let current = state;
  let currentEvents = events;
  for (const { owner, unit } of unitsForSelector(state, item.controller, effect.target)) {
    const damaged = applyDamageToTarget(current, owner, unit.id, effect.amount ?? 0, currentEvents);
    current = damaged.state;
    currentEvents = damaged.events;
  }
  return processDeaths(current, currentEvents);
}

function applyDamageAdjacent(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  if (item.target === null || item.target === 'base') return { state, events };
  const owner = findUnitOwner(state, item.target);
  const battlefield = owner === undefined ? undefined : state.players[owner]?.battlefield;
  const index = battlefield?.findIndex((unit) => unit.id === item.target) ?? -1;
  if (owner === undefined || battlefield === undefined || index < 0) return { state, events };
  let current = state;
  let currentEvents = events;
  for (const adjacent of [battlefield[index - 1], battlefield[index + 1]]) {
    if (adjacent === undefined) continue;
    const damaged = applyDamageToTarget(
      current,
      owner,
      adjacent.id,
      effect.amount ?? 0,
      currentEvents,
    );
    current = damaged.state;
    currentEvents = damaged.events;
  }
  return processDeaths(current, currentEvents);
}

function applyRandomDamage(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const candidates = unitsForSelector(state, item.controller, effect.target);
  if (candidates.length === 0) return { state, events };
  const [rng, index] = nextRangeRng(state.rng, 0, candidates.length);
  const selected = candidates[index]!;
  return applyDamageAndDeaths(
    { ...state, rng },
    selected.owner,
    selected.unit.id,
    effect.amount ?? 0,
    events,
  );
}

function applyChooseOne(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
): { state: State; events: readonly Event[] } {
  const options = effect.options ?? [];
  if (options.length === 0) return { state, events };
  return {
    state: {
      ...state,
      pendingChoice: { player: item.controller, source: item.source, kind: item.kind, options },
    },
    events: [
      ...events,
      {
        type: 'choiceRequested',
        player: item.controller,
        source: item.source,
        options: options.length,
      },
    ],
  };
}

function updateTargetUnit(
  state: State,
  item: StackItem,
  effect: EngineEffect,
  events: readonly Event[],
  update: (unit: Unit, owner: PlayerId) => { readonly unit: Unit; readonly event: Event },
): { state: State; events: readonly Event[] } {
  const resolved = resolveUnitOrBaseTarget(state, item, effect);
  if (resolved === null || resolved.target === 'base') return { state, events };
  const player = state.players[resolved.owner];
  const unit = player?.battlefield.find((candidate) => candidate.id === resolved.target);
  if (player === undefined || unit === undefined) return { state, events };
  const result = update(unit, resolved.owner);
  return {
    state: {
      ...state,
      players: {
        ...state.players,
        [resolved.owner]: {
          ...player,
          battlefield: player.battlefield.map((candidate) =>
            candidate.id === unit.id ? result.unit : candidate,
          ),
        },
      },
    },
    events: [...events, result.event],
  };
}

function unitsForSelector(
  state: State,
  controller: PlayerId,
  selector: EngineEffect['target'],
): { readonly owner: PlayerId; readonly unit: Unit }[] {
  const opponent = getOpponentId(state, controller);
  const owners =
    selector === 'ownUnit'
      ? [controller]
      : selector === 'enemyUnit'
        ? opponent === undefined
          ? []
          : [opponent]
        : opponent === undefined
          ? [controller]
          : [controller, opponent];
  return owners.flatMap((owner) =>
    (state.players[owner]?.battlefield ?? []).map((unit) => ({ owner, unit })),
  );
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
  if (
    controller.discard.some((card) => card.id === item.source) ||
    controller.exile.some((card) => card.id === item.source)
  ) {
    return state;
  }
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
