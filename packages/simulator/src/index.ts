/**
 * @opencards/simulator - deterministic bots and full-match replay harness.
 */

import { nextRangeRng, seedRng, type RNGState, type SetupOpts } from '@opencards/core';
import {
  apply,
  computeReplayHash,
  createInitialState,
  getLegalCommands,
  type Command,
  type PlayerId,
  type State,
} from '@opencards/core/internal';

/** Max commands allowed before a simulated match is treated as non-terminating. */
export const DEFAULT_MAX_COMMANDS = 500;

/** Bot policies implemented by the simulator. */
export const PLANNED_POLICIES = Object.freeze([
  'random-legal',
  'greedy-damage',
  'smoke-test',
] as const);

/** Simulator bot policy label. */
export type PlannedPolicy = (typeof PLANNED_POLICIES)[number];

/** Bot policy decision. */
export interface BotDecision {
  readonly command: Command;
  readonly rng: RNGState;
}

/** Deterministic bot policy. */
export type BotPolicy = (state: State, player: PlayerId, rng: RNGState) => BotDecision;

/** Result from one simulated match. */
export interface MatchResult {
  readonly winner: PlayerId | null;
  readonly turns: number;
  readonly commandCount: number;
  readonly finalHash: string;
  readonly commands: readonly Command[];
}

/** Aggregate result from a seed range. */
export interface MatchSeriesResult {
  readonly matches: readonly MatchResult[];
  readonly totalMatches: number;
  readonly outcomes: Readonly<Record<string, number>>;
  readonly turnCounts: readonly number[];
  readonly commandCounts: readonly number[];
  readonly averageTurns: number;
  readonly averageCommandCount: number;
  readonly winRates: Readonly<Record<string, number>>;
}

/** True if a label names a simulator policy. */
export function isPlannedPolicy(label: string): label is PlannedPolicy {
  return (PLANNED_POLICIES as readonly string[]).includes(label);
}

/** Pick uniformly from legal commands using the threaded seeded RNG. */
export const randomLegalPolicy: BotPolicy = (state, player, rng) => {
  const legal = getLegalOrThrow(state, player);
  const [nextRng, index] = nextRangeRng(rng, 0, legal.length);
  return { command: legal[index]!, rng: nextRng };
};

/** Pick the legal command that best advances base damage, then board pressure. */
export const greedyDamagePolicy: BotPolicy = (state, player, rng) => {
  const legal = getLegalOrThrow(state, player);
  let best = legal[0]!;
  let bestPriority = commandPriority(state, player, best);

  for (const command of legal.slice(1)) {
    const priority = commandPriority(state, player, command);
    if (priority < bestPriority) {
      best = command;
      bestPriority = priority;
    }
  }

  return { command: best, rng };
};

/** Always choose the first legal command. */
export const smokeTestPolicy: BotPolicy = (state, player, rng) => {
  return { command: getLegalOrThrow(state, player)[0]!, rng };
};

/** Policy lookup by label. */
export const BOT_POLICIES: Readonly<Record<PlannedPolicy, BotPolicy>> = Object.freeze({
  'random-legal': randomLegalPolicy,
  'greedy-damage': greedyDamagePolicy,
  'smoke-test': smokeTestPolicy,
});

/** Simulate one seeded match with deterministic bot policies. */
export function runMatch(
  setupOpts: SetupOpts,
  policyP1: BotPolicy,
  policyP2: BotPolicy,
  seed: number,
  maxCommands = DEFAULT_MAX_COMMANDS,
): MatchResult {
  const effectiveSetupOpts: SetupOpts = { ...setupOpts, seed };
  const p1 = effectiveSetupOpts.players[0];
  const p2 = effectiveSetupOpts.players[1];

  if (p1 === undefined || p2 === undefined) {
    throw new Error('runMatch requires exactly two configured players');
  }

  const policies: Readonly<Record<PlayerId, BotPolicy>> = {
    [p1]: policyP1,
    [p2]: policyP2,
  };
  let state = createInitialState(effectiveSetupOpts);
  let rng = seedRng(seed);
  const commands: Command[] = [];

  while (state.winner === null) {
    if (commands.length >= maxCommands) {
      throw new Error(
        `runMatch exceeded max command cap (${String(maxCommands)}) for seed ${String(seed)}`,
      );
    }

    const player = state.activePlayer;
    const policy = policies[player];
    if (policy === undefined) {
      throw new Error(`runMatch has no policy for active player ${player}`);
    }

    const legal = getLegalCommands(state, player);
    if (legal.length === 0) {
      throw new Error(`runMatch found no legal commands for live player ${player}`);
    }

    const decision = policy(state, player, rng);
    rng = decision.rng;

    if (!legal.some((command) => commandsEqual(command, decision.command))) {
      throw new Error(
        `bot emitted illegal command for ${player}: ${JSON.stringify(decision.command)}`,
      );
    }

    const result = apply(state, decision.command);
    if (result.issues.length > 0) {
      throw new Error(
        `legal command failed to apply for ${player}: ${JSON.stringify(result.issues)}`,
      );
    }

    commands.push(decision.command);
    state = result.state;
  }

  const finalHash = computeReplayHash({
    schemaVersion: '0.1.0',
    seed,
    setupOpts: effectiveSetupOpts,
    commands,
    finalStateHash: '',
  });

  return {
    winner: state.winner,
    turns: state.turn,
    commandCount: commands.length,
    finalHash,
    commands,
  };
}

/** Simulate a contiguous seed range and summarize outcomes and match lengths. */
export function runMatches(
  setupOpts: SetupOpts,
  policyP1: BotPolicy,
  policyP2: BotPolicy,
  seedStart: number,
  seedCount: number,
  maxCommands = DEFAULT_MAX_COMMANDS,
): MatchSeriesResult {
  if (!Number.isInteger(seedCount) || seedCount < 0) {
    throw new RangeError('runMatches requires a non-negative integer seedCount');
  }

  const matches = Array.from({ length: seedCount }, (_, index) =>
    runMatch(setupOpts, policyP1, policyP2, seedStart + index, maxCommands),
  );
  const outcomes: Record<string, number> = {};
  const turnCounts = matches.map((match) => match.turns);
  const commandCounts = matches.map((match) => match.commandCount);

  for (const match of matches) {
    const key = match.winner ?? 'draw';
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  }

  const winRates = Object.fromEntries(
    Object.entries(outcomes).map(([winner, count]) => [
      winner,
      seedCount === 0 ? 0 : count / seedCount,
    ]),
  );

  return {
    matches,
    totalMatches: matches.length,
    outcomes,
    turnCounts,
    commandCounts,
    averageTurns: average(turnCounts),
    averageCommandCount: average(commandCounts),
    winRates,
  };
}

function getLegalOrThrow(state: State, player: PlayerId): Command[] {
  const legal = getLegalCommands(state, player);
  if (legal.length === 0) {
    throw new Error(`No legal commands for player ${player}`);
  }
  return legal;
}

function commandPriority(state: State, player: PlayerId, command: Command): number {
  switch (command.type) {
    case 'attack':
      return command.target === 'base' ? 0 : 1;
    case 'playCard':
      return playCardPriority(state, player, command.instance);
    case 'chooseTarget':
      if (state.stack[state.stack.length - 1]?.target !== null) {
        return 4;
      }
      return command.target === 'base' ? 3 : 4;
    case 'resolveStack':
      return 3;
    case 'makeChoice':
      return 2;
    case 'drawCard':
      return 5;
    case 'endPhase':
      return 6;
    case 'endTurn':
      return 7;
  }
}

function playCardPriority(state: State, player: PlayerId, instance: string): number {
  const card = state.players[player]?.hand.find((candidate) => candidate.id === instance);
  const spec = card === undefined ? undefined : state.cards[card.kind];
  return spec?.type === 'unit' ? 2 : 3;
}

function commandsEqual(left: Command, right: Command): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
