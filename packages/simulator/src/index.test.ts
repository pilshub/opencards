import { seedRng, type CardInstanceId, type SetupOpts } from '@opencards/core';
import {
  apply,
  createInitialState,
  getLegalCommands,
  type PlayerId,
} from '@opencards/core/internal';
import { describe, expect, it } from 'vitest';
import {
  BOT_POLICIES,
  DEFAULT_MAX_COMMANDS,
  PLANNED_POLICIES,
  greedyDamagePolicy,
  isPlannedPolicy,
  randomLegalPolicy,
  runMatch,
  runMatches,
  smokeTestPolicy,
  type BotPolicy,
} from './index.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;

const fullHandWinSetup: SetupOpts = {
  seed: 0,
  players: [p1, p2],
  deckSize: 2,
  openingHandSize: 2,
  cardKinds: ['striker', 'spark'],
  decklist: ['striker', 'spark'],
  baseTotal: 1,
  startingEnergy: 0,
  cards: [
    { kind: 'striker', type: 'unit', cost: 0, attack: 1, health: 1 },
    {
      kind: 'spark',
      type: 'tactic',
      cost: 0,
      effects: [{ op: 'dealDamage', amount: 1, target: 'enemyBase' }],
    },
  ],
};

const unitFixtureSetup: SetupOpts = {
  seed: 0,
  players: [p1, p2],
  deckSize: 1,
  openingHandSize: 1,
  cardKinds: ['striker'],
  decklist: ['striker'],
  baseTotal: 2,
  startingEnergy: 0,
  cards: [{ kind: 'striker', type: 'unit', cost: 0, attack: 2, health: 2 }],
};

describe('@opencards/simulator policies', () => {
  it('lists the three roadmap-planned policies', () => {
    expect(new Set(PLANNED_POLICIES)).toEqual(
      new Set(['random-legal', 'greedy-damage', 'smoke-test']),
    );
    expect(Object.keys(BOT_POLICIES).sort()).toEqual([...PLANNED_POLICIES].sort());
  });

  it('isPlannedPolicy accepts known labels and rejects unknown labels', () => {
    expect(isPlannedPolicy('greedy-damage')).toBe(true);
    expect(isPlannedPolicy('always-concede')).toBe(false);
  });

  it('smoke-test always returns the first legal command without advancing rng', () => {
    const state = createInitialState(fullHandWinSetup);
    const rng = seedRng(12);
    const legal = getLegalCommands(state, p1);
    const decision = smokeTestPolicy(state, p1, rng);

    expect(decision.command).toEqual(legal[0]);
    expect(decision.rng).toEqual(rng);
  });

  it('random-legal is deterministic for the same state and rng', () => {
    const state = createInitialState(fullHandWinSetup);
    const rng = seedRng(99);

    expect(randomLegalPolicy(state, p1, rng)).toEqual(randomLegalPolicy(state, p1, rng));
  });

  it('greedy-damage prefers unit pressure, target-base tactics, and attack-base lethal lines', () => {
    let state = createInitialState(fullHandWinSetup);
    let result = apply(state, { type: 'endPhase', player: p1 });
    expect(result.issues).toEqual([]);
    state = result.state;

    const mainDecision = greedyDamagePolicy(state, p1, seedRng(1));
    const playCommand = mainDecision.command;
    expect(playCommand).toMatchObject({ type: 'playCard' });
    if (playCommand.type !== 'playCard') {
      throw new Error('expected greedy policy to play a card');
    }
    const playedCard = state.players[p1]!.hand.find((card) => card.id === playCommand.instance);
    expect(state.cards[playedCard!.kind]!.type).toBe('unit');

    state = createInitialState({
      ...fullHandWinSetup,
      deckSize: 1,
      openingHandSize: 1,
      cardKinds: ['spark'],
      decklist: ['spark'],
    });
    result = apply(state, { type: 'endPhase', player: p1 });
    expect(result.issues).toEqual([]);
    result = apply(result.state, { type: 'playCard', player: p1, instance: cardId(p1, 0) });
    expect(result.issues).toEqual([]);
    expect(greedyDamagePolicy(result.state, p1, seedRng(1)).command).toEqual({
      type: 'chooseTarget',
      player: p1,
      target: 'base',
    });

    const combat = runToReadyCombat(unitFixtureSetup);
    expect(greedyDamagePolicy(combat, p1, seedRng(1)).command).toEqual({
      type: 'attack',
      player: p1,
      attacker: cardId(p1, 0),
      target: 'base',
    });
  });
});

describe('@opencards/simulator harness', () => {
  it('runs a full seeded match to a replay hash', () => {
    const match = runMatch(unitFixtureSetup, greedyDamagePolicy, greedyDamagePolicy, 7);

    expect(match.winner).toBe(p1);
    expect(match.turns).toBe(3);
    expect(match.commandCount).toBeGreaterThan(0);
    expect(match.finalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(match.commands.at(-1)).toEqual({
      type: 'attack',
      player: p1,
      attacker: cardId(p1, 0),
      target: 'base',
    });
  });

  it('throws loudly when the max-command termination guard is exceeded', () => {
    const stallingPolicy: BotPolicy = (state, player, rng) => {
      const command = getLegalCommands(state, player).find(
        (candidate) => candidate.type === 'endTurn',
      );
      if (command === undefined) {
        throw new Error('expected endTurn to remain legal');
      }
      return { command, rng };
    };

    expect(() => runMatch(unitFixtureSetup, stallingPolicy, stallingPolicy, 1, 4)).toThrow(
      /max command cap/,
    );
    expect(DEFAULT_MAX_COMMANDS).toBe(500);
  });

  it('rejects malformed setup, invalid ranges, and illegal bot output', () => {
    expect(() =>
      runMatch({ ...unitFixtureSetup, players: [p1] }, greedyDamagePolicy, greedyDamagePolicy, 1),
    ).toThrow(/exactly two/);

    const illegalPolicy: BotPolicy = (_state, _player, rng) => ({
      command: { type: 'endTurn', player: p2 },
      rng,
    });
    expect(() => runMatch(unitFixtureSetup, illegalPolicy, greedyDamagePolicy, 1)).toThrow(
      /illegal command/,
    );

    expect(() =>
      runMatches(unitFixtureSetup, greedyDamagePolicy, greedyDamagePolicy, 0, -1),
    ).toThrow(/non-negative integer/);
    expect(() =>
      runMatches(unitFixtureSetup, greedyDamagePolicy, greedyDamagePolicy, 0, 1.5),
    ).toThrow(/non-negative integer/);
  });

  it('summarizes outcomes, lengths, and win rates over a seed range', () => {
    const series = runMatches(unitFixtureSetup, greedyDamagePolicy, greedyDamagePolicy, 0, 4);

    expect(series.totalMatches).toBe(4);
    expect(series.outcomes[p1]).toBe(4);
    expect(series.commandCounts).toEqual([13, 13, 13, 13]);
    expect(series.turnCounts).toEqual([3, 3, 3, 3]);
    expect(series.averageCommandCount).toBe(13);
    expect(series.averageTurns).toBe(3);
    expect(series.winRates[p1]).toBe(1);
  });

  it('returns empty aggregates for an empty seed range', () => {
    const series = runMatches(unitFixtureSetup, greedyDamagePolicy, greedyDamagePolicy, 0, 0);

    expect(series.totalMatches).toBe(0);
    expect(series.averageCommandCount).toBe(0);
    expect(series.averageTurns).toBe(0);
    expect(series.winRates).toEqual({});
  });

  it('runs the same random-legal seed bit-identically', () => {
    const first = runMatch(fullHandWinSetup, randomLegalPolicy, greedyDamagePolicy, 12);
    const second = runMatch(fullHandWinSetup, randomLegalPolicy, greedyDamagePolicy, 12);

    expect(second.finalHash).toBe(first.finalHash);
    expect(second.commands).toEqual(first.commands);
  });
});

describe('@opencards/simulator legal-action fuzz', () => {
  it('emits only legal commands and applies each one with zero issues over seeded matches', () => {
    const pairings: readonly (readonly [BotPolicy, BotPolicy])[] = [
      [randomLegalPolicy, randomLegalPolicy],
      [randomLegalPolicy, greedyDamagePolicy],
      [greedyDamagePolicy, randomLegalPolicy],
      [greedyDamagePolicy, greedyDamagePolicy],
    ];

    for (let seed = 0; seed < 20; seed += 1) {
      for (const [policyP1, policyP2] of pairings) {
        assertLegalMatch(fullHandWinSetup, policyP1, policyP2, seed);
      }
    }
  });
});

function assertLegalMatch(
  setupOpts: SetupOpts,
  policyP1: BotPolicy,
  policyP2: BotPolicy,
  seed: number,
): void {
  const effectiveSetupOpts: SetupOpts = { ...setupOpts, seed };
  const policies: Readonly<Record<PlayerId, BotPolicy>> = {
    [p1]: policyP1,
    [p2]: policyP2,
  };
  let state = createInitialState(effectiveSetupOpts);
  let rng = seedRng(seed);
  let commandCount = 0;

  while (state.winner === null) {
    expect(commandCount).toBeLessThan(DEFAULT_MAX_COMMANDS);

    const player = state.activePlayer;
    const legal = getLegalCommands(state, player);
    const decision = policies[player]!(state, player, rng);
    rng = decision.rng;

    expect(legal).toContainEqual(decision.command);
    const result = apply(state, decision.command);
    expect(result.issues).toEqual([]);

    state = result.state;
    commandCount += 1;
  }
}

function runToReadyCombat(setupOpts: SetupOpts) {
  let state = createInitialState(setupOpts);
  const commands = [
    { type: 'endPhase', player: p1 },
    { type: 'playCard', player: p1, instance: cardId(p1, 0) },
    { type: 'endPhase', player: p1 },
    { type: 'endPhase', player: p1 },
    { type: 'endTurn', player: p1 },
    { type: 'endTurn', player: p2 },
    { type: 'endPhase', player: p1 },
    { type: 'endPhase', player: p1 },
  ] as const;

  for (const command of commands) {
    const result = apply(state, command);
    expect(result.issues).toEqual([]);
    state = result.state;
  }

  return state;
}

function cardId(player: PlayerId, index: number): CardInstanceId {
  return `${player}-c${String(index).padStart(2, '0')}` as CardInstanceId;
}
