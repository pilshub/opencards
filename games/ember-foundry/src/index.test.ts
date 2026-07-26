import { createInitialState } from '@opencards/core/internal';
import { validateCardDatabase, validateDecklist, validateFormat } from '@opencards/schema';
import { describe, expect, it } from 'vitest';
import {
  EMBER_STARTER_DECK,
  FOUNDRY_CARDS,
  FOUNDRY_CARD_SPECS,
  FOUNDRY_FORMAT,
  FOUNDRY_TUTORIALS,
  VERDANT_STARTER_DECK,
  createFoundrySetup,
  createFoundryTutorialSetup,
} from './index.js';
import type { PlayerId } from '@opencards/core';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;

describe('Ember Duel: Foundry Set', () => {
  it('contains forty valid original cards across two factions and neutrals', () => {
    expect(FOUNDRY_CARDS).toHaveLength(40);
    expect(validateCardDatabase(FOUNDRY_CARDS)).toEqual({ ok: true, issues: [] });
    expect(countFaction('ember')).toBe(16);
    expect(countFaction('verdant')).toBe(16);
    expect(countFaction('neutral')).toBe(8);
  });

  it('defines a valid twenty-card digital battler format', () => {
    expect(validateFormat(FOUNDRY_FORMAT)).toEqual({ ok: true, issues: [] });
    expect(FOUNDRY_FORMAT.deckSize).toBe(20);
    expect(FOUNDRY_FORMAT.ruleset?.battlefieldLimit).toBe(5);
    expect(FOUNDRY_FORMAT.ruleset?.energy.maximum).toBe(10);
  });

  it('ships legal asymmetric starter decks', () => {
    for (const deck of [EMBER_STARTER_DECK, VERDANT_STARTER_DECK]) {
      expect(deck).toHaveLength(20);
      expect(validateDecklist(deck, { format: FOUNDRY_FORMAT, cards: FOUNDRY_CARDS })).toEqual({
        ok: true,
        issues: [],
      });
    }
    expect(EMBER_STARTER_DECK).not.toEqual(VERDANT_STARTER_DECK);
  });

  it('maps every definition into an engine card spec', () => {
    expect(FOUNDRY_CARD_SPECS).toHaveLength(FOUNDRY_CARDS.length);
    expect(new Set(FOUNDRY_CARD_SPECS.map((card) => card.kind)).size).toBe(40);
    expect(FOUNDRY_CARD_SPECS.find((card) => card.kind === 'ashen-guard')?.keywords).toEqual([
      'guard',
    ]);
    expect(
      FOUNDRY_CARD_SPECS.find((card) => card.kind === 'phoenix-whelp')?.abilities?.[0]?.trigger,
    ).toBe('onDeath');
    expect(FOUNDRY_CARD_SPECS.find((card) => card.kind === 'focused-fire')?.effects).toEqual([
      { op: 'dealDamage', amount: 3, target: 'enemyUnit' },
      { op: 'applyStatus', target: 'enemyUnit', status: 'frozen', duration: 1 },
      { op: 'damageAdjacent', amount: 1, target: 'enemyUnit' },
    ]);
    expect(FOUNDRY_CARD_SPECS.find((card) => card.kind === 'stoke-flames')?.effects).toEqual([
      {
        op: 'setSecret',
        trigger: 'onEnemyAttack',
        effects: [{ op: 'dealDamage', amount: 3, target: 'enemyBase' }],
      },
    ]);
    expect(
      FOUNDRY_CARD_SPECS.find((card) => card.kind === 'arcane-insight')?.effects?.[0]?.options,
    ).toEqual([
      [{ op: 'drawCards', amount: 2, target: 'self' }],
      [{ op: 'heal', amount: 4, target: 'self' }],
    ]);
  });

  it('creates deterministic matches with a different faction deck per player', () => {
    const setup = createFoundrySetup(42, [p1, p2]);
    const state = createInitialState(setup);
    const p1Kinds = new Set([
      ...state.players[p1]!.hand.map((card) => card.kind),
      ...state.players[p1]!.deck.map((card) => card.kind),
    ]);
    const p2Kinds = new Set([
      ...state.players[p2]!.hand.map((card) => card.kind),
      ...state.players[p2]!.deck.map((card) => card.kind),
    ]);
    expect(p1Kinds.has('cinder-initiate')).toBe(true);
    expect(p1Kinds.has('mossling')).toBe(false);
    expect(p2Kinds.has('mossling')).toBe(true);
    expect(p2Kinds.has('cinder-initiate')).toBe(false);
  });

  it('ships five deterministic scenario tutorials', () => {
    expect(FOUNDRY_TUTORIALS).toHaveLength(5);
    const phases = FOUNDRY_TUTORIALS.map(
      (tutorial) => createInitialState(createFoundryTutorialSetup(tutorial.id, [p1, p2])).phase,
    );
    expect(phases).toEqual(['start', 'combat', 'combat', 'combat', 'main']);
    const shieldLesson = createInitialState(createFoundryTutorialSetup('shield-poison', [p1, p2]));
    expect(shieldLesson.players[p1]?.battlefield).toHaveLength(2);
    expect(shieldLesson.players[p2]?.battlefield[0]?.keywords).toEqual(['guard', 'shield']);
    const tacticLesson = createInitialState(createFoundryTutorialSetup('tactics', [p1, p2]));
    expect(tacticLesson.players[p1]?.hand[0]?.kind).toBe('focused-fire');
    expect(tacticLesson.players[p2]?.battlefield).toHaveLength(3);
  });

  it('rejects invalid tutorial ids and player counts', () => {
    expect(() => createFoundryTutorialSetup('missing' as never, [p1, p2])).toThrow('Unknown');
    expect(() => createFoundryTutorialSetup('combat', [p1])).toThrow('exactly two');
  });

  it('rejects setup without exactly two players', () => {
    expect(() => createFoundrySetup(1, [])).toThrow(/exactly two/);
    expect(() => createFoundrySetup(1, [p1])).toThrow(/exactly two/);
    expect(() => createFoundrySetup(1, [p1, p2, 'p3' as PlayerId])).toThrow(/exactly two/);
  });
});

function countFaction(faction: string): number {
  return FOUNDRY_CARDS.filter((card) => card.faction === faction).length;
}
