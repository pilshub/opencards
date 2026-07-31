import { describe, expect, it } from 'vitest';
import type {
  CardInstanceId,
  PlayerId,
  PlayerView,
  SetupOpts,
  SpectatorView,
} from '@opencards/core';
import { createFoundrySetup } from '@opencards/ember-foundry';
import { MatchRoom, deriveSeedFromMatchCode, type RoomSend, type ServerMessage } from './index.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;

interface RecordedMessage {
  player: PlayerId;
  message: ServerMessage;
}

function createRecorder() {
  const recorded: RecordedMessage[] = [];
  const send: RoomSend = (player, message) => {
    recorded.push({ player, message });
  };
  return {
    send,
    recorded,
    to(player: PlayerId): ServerMessage[] {
      return recorded.filter((entry) => entry.player === player).map((entry) => entry.message);
    },
    viewCount(player: PlayerId): number {
      return this.to(player).filter((message) => message.type === 'view').length;
    },
    lastView(player: PlayerId): PlayerView {
      const messages = this.to(player);
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message !== undefined && message.type === 'view') {
          return message.view;
        }
      }
      throw new Error(`no view message recorded for ${player}`);
    },
  };
}

function buildRoom() {
  const recorder = createRecorder();
  const room = new MatchRoom(
    createFoundrySetup(deriveSeedFromMatchCode('test-room'), [p1, p2]),
    recorder.send,
  );
  return { room, recorder };
}

describe('@opencards/server MatchRoom', () => {
  it('sends joined then a hidden-info-safe view to each joining player', () => {
    const { room, recorder } = buildRoom();

    expect(room.join(p1)).toBe(true);
    expect(room.join(p2)).toBe(true);

    const p1Messages = recorder.to(p1);
    const p2Messages = recorder.to(p2);

    expect(p1Messages[0]).toEqual({ type: 'joined', player: p1 });
    expect(p2Messages[0]).toEqual({ type: 'joined', player: p2 });
    expect(p1Messages[1]?.type).toBe('view');
    expect(p2Messages[1]?.type).toBe('view');

    const p1View = recorder.lastView(p1);
    expect(p1View.viewer.hand.length).toBeGreaterThan(0);
    for (const card of p1View.viewer.hand) {
      expect(card.id).toBeDefined();
      expect(card.kind).toBeDefined();
    }

    const p1OpponentHand = p1View.opponents[p2]?.hand ?? [];
    expect(p1OpponentHand.length).toBeGreaterThan(0);
    for (const entry of p1OpponentHand) {
      expect(Object.keys(entry).sort()).toEqual(['masked']);
      expect(Object.hasOwn(entry, 'id')).toBe(false);
      expect(Object.hasOwn(entry, 'kind')).toBe(false);
    }
  });

  it('broadcasts a fresh view to both seats after a legal command', () => {
    const { room, recorder } = buildRoom();
    room.join(p1);
    room.join(p2);

    const p1HandBefore = recorder.lastView(p1).viewer.hand.length;
    const p2ViewsBefore = recorder.viewCount(p2);

    room.handleCommand(p1, { type: 'drawCard', player: p1 });

    expect(recorder.lastView(p1).viewer.hand.length).toBe(p1HandBefore + 1);
    expect(recorder.viewCount(p1)).toBe(2);
    expect(recorder.viewCount(p2)).toBe(p2ViewsBefore + 1);
  });

  it('rejects a command whose player is not the sender without applying it', () => {
    const { room, recorder } = buildRoom();
    room.join(p1);
    room.join(p2);

    const p1ViewsBefore = recorder.viewCount(p1);
    const p2ViewsBefore = recorder.viewCount(p2);
    const p1ErrorsBefore = recorder.to(p1).filter((message) => message.type === 'error').length;

    room.handleCommand(p1, { type: 'drawCard', player: p2 });

    const errors = recorder.to(p1).filter((message) => message.type === 'error');
    expect(errors).toHaveLength(p1ErrorsBefore + 1);
    expect(recorder.viewCount(p1)).toBe(p1ViewsBefore);
    expect(recorder.viewCount(p2)).toBe(p2ViewsBefore);
    expect(recorder.to(p2).some((message) => message.type === 'error')).toBe(false);
  });

  it('returns issues to the sender only for an illegal command', () => {
    const { room, recorder } = buildRoom();
    room.join(p1);
    room.join(p2);

    const p1ViewsBefore = recorder.viewCount(p1);
    const p2ViewsBefore = recorder.viewCount(p2);

    room.handleCommand(p1, {
      type: 'attack',
      player: p1,
      attacker: 'no-such-unit' as CardInstanceId,
      target: 'base',
    });

    const issues = recorder.to(p1).filter((message) => message.type === 'issues');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.type).toBe('issues');
    if (issues[0]?.type === 'issues') {
      expect(issues[0].issues).toHaveLength(1);
      expect(issues[0].issues[0]?.code).toBe('PHASE_NOT_COMBAT');
    }

    expect(recorder.to(p2).some((message) => message.type === 'issues')).toBe(false);
    expect(recorder.viewCount(p1)).toBe(p1ViewsBefore);
    expect(recorder.viewCount(p2)).toBe(p2ViewsBefore);
  });

  it('returns false for an unknown seat and sends nothing', () => {
    const { room, recorder } = buildRoom();
    expect(room.join('ghost' as PlayerId)).toBe(false);
    expect(recorder.recorded).toHaveLength(0);
  });

  it('rejects a second join from the same seat without disturbing the first', () => {
    const { room, recorder } = buildRoom();
    expect(room.join(p1)).toBe(true);

    const viewsBefore = recorder.viewCount(p1);
    const joinsBefore = recorder.to(p1).filter((message) => message.type === 'joined').length;

    expect(room.join(p1)).toBe(false);

    expect(recorder.viewCount(p1)).toBe(viewsBefore);
    expect(recorder.to(p1).filter((message) => message.type === 'joined').length).toBe(joinsBefore);
  });

  it('frees a seat on leave so it can be joined again', () => {
    const { room, recorder } = buildRoom();
    expect(room.join(p1)).toBe(true);
    room.leave(p1);
    expect(room.join(p1)).toBe(true);
    expect(recorder.to(p1).filter((message) => message.type === 'joined')).toHaveLength(2);
  });

  it('treats leave for an unconnected player as a no-op', () => {
    const { room, recorder } = buildRoom();
    expect(() => room.leave(p2)).not.toThrow();
    expect(recorder.recorded).toHaveLength(0);
  });

  it('errors for a command sent by a sender who is not a seat in this room', () => {
    const { room, recorder } = buildRoom();
    room.join(p1);

    room.handleCommand('ghost' as PlayerId, { type: 'drawCard', player: 'ghost' as PlayerId });

    const errors = recorder.to('ghost' as PlayerId).filter((message) => message.type === 'error');
    expect(errors).toHaveLength(1);
    expect(recorder.viewCount(p1)).toBe(1);
  });

  it('derives a deterministic integer seed from a match code', () => {
    expect(deriveSeedFromMatchCode('same-code')).toBe(deriveSeedFromMatchCode('same-code'));
    expect(Number.isInteger(deriveSeedFromMatchCode('test-room'))).toBe(true);
    expect(deriveSeedFromMatchCode('room-a')).not.toBe(deriveSeedFromMatchCode('room-b'));
  });

  it('watch delivers an immediate spectator view with both hands fully masked', () => {
    const { room } = buildRoom();
    room.join(p1);
    room.join(p2);

    const spectatorViews: SpectatorView[] = [];
    const { unwatch } = room.watch((view) => spectatorViews.push(view));

    expect(spectatorViews).toHaveLength(1);
    const view = spectatorViews[0]!;
    for (const seat of [p1, p2]) {
      const playerView = view.players[seat]!;
      expect(playerView.hand.length).toBeGreaterThan(0);
      for (const entry of playerView.hand) {
        expect(Object.keys(entry).sort()).toEqual(['masked']);
        expect(Object.hasOwn(entry, 'id')).toBe(false);
        expect(Object.hasOwn(entry, 'kind')).toBe(false);
      }
    }
    unwatch();
  });

  it('pushes a fresh spectator view to registered spectators after a legal command', () => {
    const { room } = buildRoom();
    room.join(p1);
    room.join(p2);

    const spectatorViews: SpectatorView[] = [];
    room.watch((view) => spectatorViews.push(view));

    const handBefore = spectatorViews[0]!.players[p1]!.hand.length;
    room.handleCommand(p1, { type: 'drawCard', player: p1 });

    expect(spectatorViews).toHaveLength(2);
    expect(spectatorViews[1]!.players[p1]!.hand.length).toBe(handBefore + 1);
  });

  it('unwatch stops further pushes to that callback', () => {
    const { room } = buildRoom();
    room.join(p1);
    room.join(p2);

    const spectatorViews: SpectatorView[] = [];
    const { unwatch } = room.watch((view) => spectatorViews.push(view));
    expect(spectatorViews).toHaveLength(1);

    unwatch();
    room.handleCommand(p1, { type: 'drawCard', player: p1 });

    expect(spectatorViews).toHaveLength(1);
  });

  it('multiple simultaneous spectators all receive the same push on a command', () => {
    const { room } = buildRoom();
    room.join(p1);
    room.join(p2);

    const firstViews: SpectatorView[] = [];
    const secondViews: SpectatorView[] = [];
    room.watch((view) => firstViews.push(view));
    room.watch((view) => secondViews.push(view));

    room.handleCommand(p1, { type: 'drawCard', player: p1 });

    expect(firstViews).toHaveLength(2);
    expect(secondViews).toHaveLength(2);
    expect(firstViews[1]).toEqual(secondViews[1]);
  });

  it('spectator view never leaks a hand-only kind into the serialized view', () => {
    const handOnlyKinds = ['hand-only-a', 'hand-only-b', 'hand-only-c', 'hand-only-d'];
    const setup: SetupOpts = {
      seed: 7,
      players: [p1, p2],
      deckSize: 4,
      openingHandSize: 4,
      cardKinds: handOnlyKinds,
      baseTotal: 20,
      startingEnergy: 1,
      cards: handOnlyKinds.map((kind) => ({
        kind,
        type: 'unit' as const,
        cost: 1,
        attack: 1,
        health: 1,
      })),
    };
    const recorder = createRecorder();
    const room = new MatchRoom(setup, recorder.send);

    const spectatorViews: SpectatorView[] = [];
    room.watch((view) => spectatorViews.push(view));

    const serialised = JSON.stringify(spectatorViews[0]!);
    for (const kind of handOnlyKinds) {
      expect(serialised).not.toContain(kind);
    }
  });
});
