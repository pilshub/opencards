import { describe, expect, it } from 'vitest';
import type { CardKind, PlayerId, ReplayEnvelopeV1, SetupOpts, ViewerHandle } from './index.js';
import { applyCommand, replayEnvelope, startMatch, viewMatch } from './index.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const cardKinds: CardKind[] = ['unit-a', 'unit-b', 'unit-c', 'tactic-a'];

const setupOpts: SetupOpts = {
  seed: 42,
  players: [p1, p2],
  deckSize: 12,
  openingHandSize: 1,
  cardKinds,
};

const validEnvelope: ReplayEnvelopeV1 = {
  schemaVersion: '0.1.0',
  seed: 42,
  setupOpts: { ...setupOpts, openingHandSize: 0 },
  commands: [
    { type: 'drawCard', player: p1 },
    { type: 'drawCard', player: p2 },
    { type: 'drawCard', player: p1 },
  ],
  finalStateHash: '6d446b7fc4b7c1cc54148f34567a5d9165829c10d0c6b7b2f63929fc9bc3e67f',
};

describe('core facade', () => {
  it('startMatch returns one opaque viewer-bound handle per player', () => {
    const result = startMatch(setupOpts);
    const p1Handle = result.handles[p1]!;
    const p2Handle = result.handles[p2]!;
    const p1View = viewMatch(p1Handle);
    const p2View = viewMatch(p2Handle);

    expect(Object.keys(result.handles).sort()).toEqual([p1, p2].sort());
    expect(p1Handle).not.toBe(p2Handle);
    expect(p1Handle.__brand).toBe('ViewerHandle');
    expect(Object.hasOwn(result, 'views')).toBe(false);
    expect((p1Handle as unknown as { __state?: unknown }).__state).toBeUndefined();
    expect(Object.keys(p1Handle)).not.toContain('__state');
    expect(Object.getOwnPropertyDescriptor(p1Handle, '__state')).toBeUndefined();
    expect(p1View.viewer.id).toBe(p1);
    expect(p2View.viewer.id).toBe(p2);
    expect(p1View.viewer.hand).toHaveLength(1);
    expect(p1View.viewer.hand[0]).toHaveProperty('kind');
    expect(p1View.opponents[p2]?.hand).toEqual([{ masked: true }]);
    expect(viewContainsKey(p1View.opponents[p2]?.hand, 'kind')).toBe(false);
    expect(viewContainsKey(p2View.opponents[p1]?.hand, 'kind')).toBe(false);
    expect(viewContainsKey(p1View.opponents[p2]?.hand, 'id')).toBe(false);
    expect(viewContainsKey(p2View.opponents[p1]?.hand, 'id')).toBe(false);
  });

  it('does not leak opponent canonical hand or deck identifiers through the facade', () => {
    // Reconstruct the deterministic ids the engine will assign to p2's hidden
    // zones. Setup builds ids as `${player}-c${index}` with zero-padding.
    const pad = String(setupOpts.deckSize - 1).length;
    const p2HiddenIds: string[] = [];
    for (let i = 0; i < setupOpts.deckSize; i += 1) {
      p2HiddenIds.push(`${p2}-c${i.toString().padStart(pad, '0')}`);
    }
    const { handles } = startMatch(setupOpts);
    const p1View = viewMatch(handles[p1]!);
    const serialised = JSON.stringify(p1View);

    for (const id of p2HiddenIds) {
      expect(serialised).not.toContain(id);
    }
    for (const kind of cardKinds) {
      // Setup uses cardKinds for p2's hidden zones too; viewer p1 must not see them.
      expect(JSON.stringify(p1View.opponents[p2])).not.toContain(kind);
    }
  });

  it('applyCommand returns the same handle and advances the shared match instance', () => {
    const started = startMatch(setupOpts);
    const p1Handle = started.handles[p1]!;
    const p2Handle = started.handles[p2]!;
    const result = applyCommand(p1Handle, { type: 'drawCard', player: p1 });
    const p1View = viewMatch(p1Handle);
    const p2View = viewMatch(p2Handle);

    expect(result.handle).toBe(p1Handle);
    expect(Object.hasOwn(result, 'events')).toBe(false);
    expect(Object.hasOwn(result, 'views')).toBe(false);
    expect(result.issues).toEqual([]);
    expect(p1View.viewer.hand).toHaveLength(2);
    expect(p2View.opponents[p1]?.hand).toHaveLength(2);
    expect(viewContainsKey(p2View.opponents[p1]?.hand, 'kind')).toBe(false);
  });

  it('applyCommand chains through opaque handles', () => {
    const started = startMatch(setupOpts);
    const p1Handle = started.handles[p1]!;
    const p2Handle = started.handles[p2]!;
    const first = applyCommand(p1Handle, { type: 'drawCard', player: p1 });
    const second = applyCommand(p2Handle, { type: 'drawCard', player: p2 });

    expect(second.issues).toEqual([]);
    expect(first.handle).toBe(p1Handle);
    expect(second.handle).toBe(p2Handle);
    expect(viewMatch(p1Handle).opponents[p2]?.hand).toHaveLength(2);
    expect(viewMatch(p2Handle).viewer.hand).toHaveLength(2);
  });

  it('viewMatch returns only the projection bound to the supplied handle', () => {
    const started = startMatch(setupOpts);
    const p1Handle = started.handles[p1]!;
    const p2Handle = started.handles[p2]!;
    applyCommand(p1Handle, { type: 'drawCard', player: p1 });
    const p1View = viewMatch(p1Handle);
    const p2View = viewMatch(p2Handle);

    expect(p1View.viewer.id).toBe(p1);
    expect(p2View.viewer.id).toBe(p2);
    expect(p1View.viewer.hand[0]).toHaveProperty('kind');
    expect(p2View.opponents[p1]?.hand[0]).not.toHaveProperty('kind');
  });

  it('replayEnvelope verifies a valid fixture and returns only verification data plus finalHandles', () => {
    const result = replayEnvelope(validEnvelope);
    const p1View = viewMatch(result.finalHandles[p1]!);

    expect(result.ok).toBe(true);
    expect(result.hash).toBe(validEnvelope.finalStateHash);
    expect(result.expected).toBe(validEnvelope.finalStateHash);
    expect(result.issues).toEqual([]);
    expect(Object.hasOwn(result, 'state')).toBe(false);
    expect(Object.hasOwn(result, 'views')).toBe(false);
    expect(Object.hasOwn(result, 'finalHandle')).toBe(false);
    expect(p1View.opponents[p2]?.hand).toHaveLength(1);
    expect(viewContainsKey(p1View.opponents[p2]?.hand, 'kind')).toBe(false);
  });

  it('keeps ViewerHandle raw state inaccessible', () => {
    const { handles } = startMatch(setupOpts);
    const handle = handles[p1]!;

    expect((handle as unknown as { __state?: unknown }).__state).toBeUndefined();
    expect(Object.keys(handle)).not.toContain('__state');
    expect(Object.getOwnPropertyDescriptor(handle, '__state')).toBeUndefined();
  });

  it('creates distinct handles for distinct starts', () => {
    const first = startMatch(setupOpts);
    const second = startMatch(setupOpts);

    expect(first.handles[p1]).not.toBe(second.handles[p1]);
    expect(viewMatch(first.handles[p1]!)).toEqual(viewMatch(second.handles[p1]!));
  });

  it('rejects manually constructed handles', () => {
    const invalidHandle = { __brand: 'ViewerHandle' } as ViewerHandle;

    expect(() => viewMatch(invalidHandle)).toThrow(/Invalid or expired ViewerHandle/);
  });

  it('does not let one viewer handle request another viewer projection', () => {
    const { handles } = startMatch(setupOpts);
    const p1Handle = handles[p1]!;

    // @ts-expect-error viewMatch intentionally has no viewer parameter.
    const forcedP2View = viewMatch(p1Handle, p2);
    const p1BoundView = viewMatch(p1Handle);

    expect(forcedP2View.viewer.id).toBe(p1);
    expect(p1BoundView.viewer.id).toBe(p1);
    expect(forcedP2View.opponents[p2]?.hand[0]).not.toHaveProperty('kind');
  });
});

function viewContainsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => viewContainsKey(entry, key));
  }

  if (value !== null && typeof value === 'object') {
    if (Object.hasOwn(value, key)) {
      return true;
    }

    return Object.values(value).some((entry) => viewContainsKey(entry, key));
  }

  return false;
}
