#!/usr/bin/env node
import { simulateMatch } from '@opencards/ai';
import {
  createFoundrySetup,
  EMBER_STARTER_DECK,
  VERDANT_STARTER_DECK,
} from '@opencards/ember-foundry';

const players = ['p1', 'p2'];
const matches = 400;
let emberWins = 0;
let verdantWins = 0;
let firstPlayerWins = 0;
let capped = 0;
let draws = 0;
let totalTurns = 0;

for (let seed = 1; seed <= matches; seed += 1) {
  const swapped = seed % 2 === 0;
  const base = createFoundrySetup(seed, players);
  const setup = swapped
    ? { ...base, decklists: { p1: VERDANT_STARTER_DECK, p2: EMBER_STARTER_DECK } }
    : base;
  const result = simulateMatch(setup);
  totalTurns += result.turns;
  if (result.capped) capped += 1;
  if (result.winner === null) {
    draws += 1;
    continue;
  }
  if (result.winner === 'p1') firstPlayerWins += 1;
  const emberWon = (result.winner === 'p1') !== swapped;
  if (emberWon) emberWins += 1;
  else verdantWins += 1;
}

const emberRate = emberWins / matches;
const summary = {
  matches,
  emberWins,
  verdantWins,
  firstPlayerWins,
  draws,
  capped,
  emberRate,
  averageTurns: totalTurns / matches,
};
console.log(`[verify:balance] ${JSON.stringify(summary)}`);

if (capped !== 0 || draws !== 0) {
  console.error('[verify:balance] every simulated match must finish');
  process.exit(1);
}
if (emberRate < 0.4 || emberRate > 0.6) {
  console.error('[verify:balance] faction win rate must remain within 40%-60%');
  process.exit(1);
}
