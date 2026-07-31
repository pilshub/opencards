import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CardInstanceId, PlayerId, SpectatorView } from '@opencards/core';
import { CLASSIC_RULESET } from '@opencards/core';
import { SpectatorView as SpectatorBoard } from './SpectatorView.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;

function buildFixture(): SpectatorView {
  return {
    players: {
      [p1]: {
        id: p1,
        hand: [{ masked: true }],
        deck: { count: 3 },
        discard: [{ id: 'p1-discard-1' as CardInstanceId, kind: 'ember-guard' }],
        exile: [],
        battlefield: [
          {
            id: 'p1-unit-1' as CardInstanceId,
            kind: 'spark-adept',
            attack: 2,
            health: 3,
            damage: 1,
            exhausted: false,
          },
        ],
        base: 17,
        energy: 2,
        maxEnergy: 2,
        drawnThisTurn: true,
        fatigueCount: 0,
      },
      [p2]: {
        id: p2,
        hand: [{ masked: true }, { masked: true }],
        deck: { count: 5 },
        discard: [],
        exile: [],
        battlefield: [],
        base: 12,
        energy: 4,
        maxEnergy: 4,
        drawnThisTurn: false,
        fatigueCount: 0,
      },
    },
    activePlayer: p1,
    phase: 'main',
    turn: 3,
    winner: null,
    stack: [
      {
        source: 'p1-tactic-1' as CardInstanceId,
        controller: p1,
        kind: 'flare-strike',
        effects: [{ op: 'dealDamage', amount: 2, target: 'enemyUnitOrBase' }],
        target: 'base',
      },
    ],
    ruleset: CLASSIC_RULESET,
  };
}

afterEach(() => {
  cleanup();
});

describe('@opencards/app SpectatorView', () => {
  it('renders both players with masked hands and no interactive controls', () => {
    render(<SpectatorBoard view={buildFixture()} />);

    expect(screen.getByTestId('spectator-board')).toBeTruthy();
    expect(screen.getByTestId('spectator-player-p1')).toBeTruthy();
    expect(screen.getByTestId('spectator-player-p2')).toBeTruthy();

    expect(screen.queryAllByTestId(/play-card-/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/attack-with-/)).toHaveLength(0);
    expect(screen.queryByTestId('draw-card')).toBeNull();
  });

  it('shows per-player public fields (base, energy, hand/deck counts)', () => {
    render(<SpectatorBoard view={buildFixture()} />);

    expect(screen.getByTestId('spectator-base-p1').textContent).toBe('17');
    expect(screen.getByTestId('spectator-energy-p1').textContent).toBe('2');
    expect(screen.getByTestId('spectator-base-p2').textContent).toBe('12');
    expect(screen.getByTestId('spectator-energy-p2').textContent).toBe('4');
    expect(screen.getByTestId('spectator-hand-count-p1').textContent).toContain('Hand 1');
    expect(screen.getByTestId('spectator-hand-count-p2').textContent).toContain('Hand 2');
  });

  it('renders the turn info, stack, and battlefield units read-only', () => {
    render(<SpectatorBoard view={buildFixture()} />);

    expect(screen.getByTestId('spectator-turn').textContent).toBe('Turn: 3');
    expect(screen.getByTestId('spectator-phase').textContent).toBe('Phase: main');
    expect(screen.getByTestId('spectator-active-p1')).toBeTruthy();
    expect(screen.getByTestId('spectator-stack-item-p1-tactic-1').textContent).toContain(
      'flare-strike',
    );
    expect(screen.getByTestId('spectator-bf-unit-p1-p1-unit-1').textContent).toContain('ATK 2');
  });

  it('shows a winner banner when the match is decided', () => {
    render(<SpectatorBoard view={{ ...buildFixture(), winner: p2 }} />);

    expect(screen.getByTestId('spectator-winner').textContent).toBe('p2 wins');
  });
});
