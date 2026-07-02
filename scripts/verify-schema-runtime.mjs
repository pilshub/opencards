#!/usr/bin/env node
import {
  DEFAULT_FORMAT,
  hashDecklist,
  validateCardDatabase,
  validateDecklist,
  validateFormat,
} from '@opencards/schema';
import { applyCommand, legalCommands, startMatch, viewMatch } from '@opencards/core';

const fail = (message) => {
  console.error(`[verify:schema-runtime] ${message}`);
  process.exit(1);
};

const assertOk = (label, result) => {
  if (result.ok !== true) {
    fail(`${label} failed: ${JSON.stringify(result.issues)}`);
  }
};

const p1 = 'p1';
const p2 = 'p2';
const cards = [
  {
    kind: 'striker',
    name: 'Striker',
    type: 'unit',
    cost: { energy: 0 },
    stats: { attack: 2, health: 2 },
    effects: [],
  },
  {
    kind: 'spark',
    name: 'Spark',
    type: 'tactic',
    cost: { energy: 0 },
    effects: [{ op: 'dealDamage', amount: 1, target: 'enemyBase' }],
  },
];
const format = {
  ...DEFAULT_FORMAT,
  deckSize: 4,
  openingHandSize: 2,
  copyLimit: 4,
  baseTotal: 2,
  startingEnergy: 0,
};
const decklist = ['striker', 'spark', 'striker', 'spark'];

assertOk('DEFAULT_FORMAT', validateFormat(DEFAULT_FORMAT));
assertOk('custom format', validateFormat(format));
assertOk('card database', validateCardDatabase(cards));
assertOk('decklist', validateDecklist(decklist, { format, cards }));

if (hashDecklist(decklist) !== hashDecklist([...decklist])) {
  fail('decklist hash is not deterministic');
}

const engineCards = [{ kind: 'striker', type: 'unit', cost: 0, attack: 2, health: 2 }];
const { handles } = startMatch({
  seed: 7,
  players: [p1, p2],
  deckSize: 1,
  openingHandSize: 1,
  cardKinds: ['striker'],
  decklist: ['striker'],
  baseTotal: 2,
  startingEnergy: 0,
  cards: engineCards,
});

const commands = [
  { type: 'endPhase', player: p1 },
  { type: 'playCard', player: p1, instance: 'p1-c00' },
  { type: 'endPhase', player: p1 },
  { type: 'endPhase', player: p1 },
  { type: 'endTurn', player: p1 },
  { type: 'endTurn', player: p2 },
  { type: 'endPhase', player: p1 },
  { type: 'endPhase', player: p1 },
];

for (const command of commands) {
  const result = applyCommand(handles[command.player], command);
  if (result.issues.length > 0) {
    fail(`runtime command ${command.type} failed: ${JSON.stringify(result.issues)}`);
  }
}

const attack = { type: 'attack', player: p1, attacker: 'p1-c00', target: 'base' };
if (
  !legalCommands(handles[p1]).some((command) => JSON.stringify(command) === JSON.stringify(attack))
) {
  fail('runtime legalCommands did not include the expected lethal base attack');
}

const attackResult = applyCommand(handles[p1], attack);
if (attackResult.issues.length > 0) {
  fail(`runtime attack failed: ${JSON.stringify(attackResult.issues)}`);
}

const finalView = viewMatch(handles[p1]);
if (finalView.winner !== p1) {
  fail(`runtime smoke expected winner ${p1}, got ${String(finalView.winner)}`);
}

console.log('schema-runtime: validators passed and facade runtime smoke reached winner p1');
