import {
  applyCommand,
  legalCommands,
  startMatch,
  viewMatch,
  type Command,
  type PlayerId,
  type PlayerView,
  type SetupOpts,
  type ViewerHandle,
} from '@opencards/core';

export type BotProfile = 'tempo' | 'control';

/** Deterministic, hidden-information-safe command selection. */
export function chooseBotCommand(
  handle: ViewerHandle,
  view: PlayerView = viewMatch(handle),
  profile: BotProfile = 'tempo',
): Command | null {
  const commands = legalCommands(handle);
  if (commands.length === 0 || view.winner !== null) {
    return null;
  }

  const readyResolve =
    view.stack[view.stack.length - 1]?.target !== null
      ? commands.find((command) => command.type === 'resolveStack')
      : undefined;
  if (readyResolve !== undefined) return readyResolve;

  const targetChoice = commands.find(
    (command) => command.type === 'chooseTarget' && preferredTarget(view, command.target, profile),
  );
  if (targetChoice !== undefined) return targetChoice;
  const anyTarget = commands.find((command) => command.type === 'chooseTarget');
  if (anyTarget !== undefined) return anyTarget;

  const resolve = commands.find((command) => command.type === 'resolveStack');
  if (resolve !== undefined) return resolve;
  const draw = commands.find((command) => command.type === 'drawCard');
  if (draw !== undefined) return draw;

  const plays = commands.filter((command) => command.type === 'playCard');
  if (plays.length > 0) {
    return plays[plays.length - 1]!;
  }

  const attacks = commands.filter((command) => command.type === 'attack');
  const baseAttack = attacks.find((command) => command.target === 'base');
  if (profile === 'tempo' && baseAttack !== undefined) return baseAttack;
  const unitAttack = attacks.find((command) => command.target !== 'base');
  if (unitAttack !== undefined) return unitAttack;
  if (baseAttack !== undefined) return baseAttack;

  return (
    commands.find((command) => command.type === 'endPhase') ??
    commands.find((command) => command.type === 'endTurn') ??
    commands[0]!
  );
}

function preferredTarget(
  view: PlayerView,
  target: Extract<Command, { readonly type: 'chooseTarget' }>['target'],
  profile: BotProfile,
): boolean {
  if (profile === 'tempo') return target === 'base';
  if (target === 'base') return false;
  return Object.values(view.opponents).some((opponent) =>
    opponent.battlefield.some((unit) => unit.id === target),
  );
}

export interface SimulationResult {
  readonly winner: PlayerId | null;
  readonly commands: number;
  readonly turns: number;
  readonly capped: boolean;
}

/** Run one complete deterministic match using only public facade APIs. */
export function simulateMatch(
  setup: SetupOpts,
  options: {
    readonly maxCommands?: number;
    readonly profiles?: Readonly<Record<string, BotProfile>>;
  } = {},
): SimulationResult {
  const started = startMatch(setup);
  const maxCommands = options.maxCommands ?? 500;
  let commands = 0;

  while (commands < maxCommands) {
    const first = setup.players[0]!;
    const observer = viewMatch(started.handles[first]!);
    if (observer.winner !== null) {
      return { winner: observer.winner, commands, turns: observer.turn, capped: false };
    }
    const active = observer.activePlayer;
    const handle = started.handles[active]!;
    const command = chooseBotCommand(
      handle,
      viewMatch(handle),
      options.profiles?.[active] ?? 'tempo',
    );
    if (command === null) {
      return { winner: null, commands, turns: observer.turn, capped: true };
    }
    const result = applyCommand(handle, command);
    if (result.issues.length > 0) {
      throw new Error(`Bot selected illegal command: ${result.issues[0]?.code ?? 'unknown'}`);
    }
    commands += 1;
  }

  const final = viewMatch(started.handles[setup.players[0]!]!);
  return { winner: final.winner, commands, turns: final.turn, capped: true };
}

export interface BatchSimulationResult {
  readonly matches: number;
  readonly wins: Readonly<Record<string, number>>;
  readonly draws: number;
  readonly capped: number;
  readonly averageTurns: number;
}

export function simulateBatch(
  createSetup: (seed: number) => SetupOpts,
  count: number,
): BatchSimulationResult {
  const wins: Record<string, number> = {};
  let draws = 0;
  let capped = 0;
  let turns = 0;
  for (let seed = 1; seed <= count; seed += 1) {
    const result = simulateMatch(createSetup(seed));
    turns += result.turns;
    if (result.capped) capped += 1;
    if (result.winner === null) draws += 1;
    else wins[result.winner] = (wins[result.winner] ?? 0) + 1;
  }
  return {
    matches: count,
    wins,
    draws,
    capped,
    averageTurns: count === 0 ? 0 : turns / count,
  };
}
