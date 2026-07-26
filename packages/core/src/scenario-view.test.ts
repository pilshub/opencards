import { describe, expect, it } from 'vitest';
import { createInitialState } from './setup.js';
import { getView } from './view.js';
import type { CardInstanceId, PlayerId, State } from './types.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;

describe('scenario public metadata projection', () => {
  it('projects secret counts and sanitized pending-choice metadata', () => {
    const initial = createInitialState({
      seed: 1,
      players: [p1, p2],
      deckSize: 1,
      openingHandSize: 0,
      cardKinds: ['spell'],
      cards: [{ kind: 'spell', type: 'tactic', cost: 0 }],
    });
    const secret = {
      source: 'secret' as CardInstanceId,
      kind: 'spell',
      trigger: 'onEnemyPlay' as const,
      effects: [{ op: 'dealDamage' as const, amount: 9, target: 'enemyBase' as const }],
    };
    const state: State = {
      ...initial,
      pendingChoice: {
        player: p1,
        source: 'choice' as CardInstanceId,
        kind: 'spell',
        options: [
          [{ op: 'heal', amount: 1, target: 'self' }],
          [{ op: 'heal', amount: 9, target: 'self' }],
        ],
      },
      players: {
        ...initial.players,
        [p1]: { ...initial.players[p1]!, secrets: [secret] },
        [p2]: { ...initial.players[p2]!, secrets: [secret, secret] },
      },
    };
    const view = getView(state, p1);
    expect(view.viewer.secretCount).toBe(1);
    expect(view.opponents[p2]?.secretCount).toBe(2);
    expect(view.pendingChoice).toEqual({ player: p1, source: 'choice', options: 2 });
    expect(JSON.stringify(view)).not.toContain('amount":9');
  });
});
