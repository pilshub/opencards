#!/usr/bin/env node
import { startMatch, viewMatch } from '@opencards/core';

const p1 = 'p1';
const p2 = 'p2';
const viewers = [p1, p2];
const cardKinds = ['alpha-secret', 'beta-secret', 'gamma-secret', 'delta-secret'];
const deckSize = 8;
const openingHandSize = 4;

const fail = (message) => {
  console.error(`[verify:hidden-info] ${message}`);
  process.exit(1);
};

const { handles } = startMatch({
  seed: 42,
  players: viewers,
  deckSize,
  openingHandSize,
  cardKinds,
});

// Reconstruct the canonical ids the engine assigns to each player's deck.
// setup.ts uses `${player}-c${String(index).padStart(2,'0')}`.
const canonicalIds = (player) =>
  Array.from({ length: deckSize }, (_, i) => `${player}-c${String(i).padStart(2, '0')}`);

let verified = 0;

for (const viewer of viewers) {
  const opponent = viewer === p1 ? p2 : p1;
  const view = viewMatch(handles[viewer]);

  if (view === undefined) {
    fail(`missing view for viewer ${viewer}`);
  }

  const opponentView = view.opponents[opponent];

  if (opponentView === undefined) {
    fail(`missing opponent projection for viewer ${viewer}`);
  }

  const opponentJson = JSON.stringify(opponentView);

  // Kind leak (round-1 check, still required).
  for (const kind of cardKinds) {
    if (opponentJson.includes(kind)) {
      fail(`viewer ${viewer} leaked opponent kind ${kind} via projection`);
    }
  }

  // Round-5 critical: hidden zones must not expose canonical instance ids
  // (since deterministic setup maps `${player}-cNN` -> cardKinds[N % len]).
  for (const id of canonicalIds(opponent)) {
    if (opponentJson.includes(id)) {
      fail(`viewer ${viewer} leaked opponent canonical id ${id} via projection`);
    }
  }

  // Deck must be count-only.
  const deckKeys = Object.keys(opponentView.deck).sort();
  if (JSON.stringify(deckKeys) !== JSON.stringify(['count'])) {
    fail(`viewer ${viewer} opponent deck is not count-only: ${JSON.stringify(opponentView.deck)}`);
  }

  // Hand entries must be {masked: true} only — no id, no kind.
  for (const card of opponentView.hand) {
    const keys = Object.keys(card).sort();
    if (JSON.stringify(keys) !== JSON.stringify(['masked'])) {
      fail(`viewer ${viewer} opponent hand entry exposes extra keys ${JSON.stringify(keys)}`);
    }
    if (Object.hasOwn(card, 'kind')) {
      fail(`viewer ${viewer} opponent hand entry exposes kind: ${JSON.stringify(card)}`);
    }
    if (Object.hasOwn(card, 'id')) {
      fail(`viewer ${viewer} opponent hand entry exposes id: ${JSON.stringify(card)}`);
    }
  }

  verified += 1;
}

console.log(
  `hidden-info: ${verified}/${viewers.length} viewer projections verified; opponent canonical ids and kinds masked`,
);
