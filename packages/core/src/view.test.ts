import { describe, expect, it } from 'vitest';
import type { CardInstanceId, CardKind, PlayerId, PlayerView, State } from './types.js';
import { seedRng } from './rng.js';
import { getView } from './view.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;

type _OpponentHandElement = PlayerView['opponents'][PlayerId]['hand'][number];
// @ts-expect-error opponent hand entries carry no canonical id by design.
const _badWithId: _OpponentHandElement = { id: 'x' as CardInstanceId, masked: true };
// @ts-expect-error opponent hand entries carry no kind by design.
const _badWithKind: _OpponentHandElement = { masked: true, kind: 'leaked' as CardKind };
const _goodMasked: _OpponentHandElement = { masked: true };
const _goodOwnHandElement: PlayerView['viewer']['hand'][number] = {
  id: 'x' as CardInstanceId,
  kind: 'visible' as CardKind,
};

const state: State = {
  rng: seedRng(3),
  activePlayer: p1,
  phase: 'main',
  turn: 2,
  players: {
    [p1]: {
      id: p1,
      hand: [{ id: 'p1-c00' as CardInstanceId, kind: 'ember-secret' }],
      deck: [{ id: 'p1-c01' as CardInstanceId, kind: 'ember-deck-secret' }],
      discard: [{ id: 'p1-c02' as CardInstanceId, kind: 'public-discard' }],
      exile: [],
      battlefield: [{ id: 'p1-c03' as CardInstanceId, kind: 'public-battlefield' }],
    },
    [p2]: {
      id: p2,
      hand: [
        { id: 'p2-c00' as CardInstanceId, kind: 'frost-secret' },
        { id: 'p2-c01' as CardInstanceId, kind: 'frost-secret-2' },
      ],
      deck: [
        { id: 'p2-c02' as CardInstanceId, kind: 'frost-deck-secret' },
        { id: 'p2-c03' as CardInstanceId, kind: 'frost-deck-secret-2' },
      ],
      discard: [{ id: 'p2-c04' as CardInstanceId, kind: 'public-opponent-discard' }],
      exile: [],
      battlefield: [{ id: 'p2-c05' as CardInstanceId, kind: 'public-opponent-battlefield' }],
    },
  },
};

describe('getView', () => {
  it('lets the viewer see own card kinds and ids', () => {
    const view = getView(state, p1);
    expect(_goodOwnHandElement.kind).toBe('visible');
    expect(_goodMasked.masked).toBe(true);
    expect(JSON.stringify(view.viewer.hand)).toContain('ember-secret');
    expect(JSON.stringify(view.viewer.deck)).toContain('ember-deck-secret');
  });

  it('masks opponent hand entries to {masked: true} only — no id, no kind', () => {
    const view = getView(state, p1);
    const opponentHand = view.opponents[p2]?.hand ?? [];

    expect(opponentHand).toEqual([{ masked: true }, { masked: true }]);
    for (const entry of opponentHand) {
      expect(Object.keys(entry).sort()).toEqual(['masked']);
      expect(Object.hasOwn(entry, 'kind')).toBe(false);
      expect(Object.hasOwn(entry, 'id')).toBe(false);
    }
  });

  it('does not leak opponent canonical hand ids or kinds into the view', () => {
    const view = getView(state, p1);
    const serialised = JSON.stringify(view);

    // Hidden opponent hand identities (R5 critical leak vector):
    expect(serialised).not.toContain('p2-c00');
    expect(serialised).not.toContain('p2-c01');
    expect(serialised).not.toContain('frost-secret');
    expect(serialised).not.toContain('frost-secret-2');

    // Hidden opponent deck identities:
    expect(serialised).not.toContain('p2-c02');
    expect(serialised).not.toContain('p2-c03');
    expect(serialised).not.toContain('frost-deck-secret');
    expect(serialised).not.toContain('frost-deck-secret-2');
  });

  it('shows opponent deck as count only', () => {
    const view = getView(state, p1);
    expect(view.opponents[p2]?.deck).toEqual({ count: 2 });
    expect(Object.keys(view.opponents[p2]?.deck ?? {}).sort()).toEqual(['count']);
  });

  it('keeps battlefield and discard visible to both players', () => {
    const p1View = getView(state, p1);
    const p2View = getView(state, p2);

    expect(JSON.stringify(p1View)).toContain('public-opponent-battlefield');
    expect(JSON.stringify(p1View)).toContain('public-opponent-discard');
    expect(JSON.stringify(p2View)).toContain('public-battlefield');
    expect(JSON.stringify(p2View)).toContain('public-discard');
  });
});
