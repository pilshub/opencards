import type {
  Command,
  PlayerId,
  PlayerView,
  SetupOpts,
  SpectatorView,
  ValidationIssue,
} from '@opencards/core';
import type { State } from '@opencards/core/internal';
import {
  apply,
  createInitialState,
  getLegalCommands,
  getSpectatorView,
  getView,
} from '@opencards/core/internal';

export type ServerMessage =
  | { type: 'joined'; player: PlayerId }
  | { type: 'view'; view: PlayerView; legal: Command[] }
  | { type: 'issues'; issues: ValidationIssue[] }
  | { type: 'error'; message: string }
  | { type: 'spectating' }
  | { type: 'spectatorView'; view: SpectatorView };

export type ClientMessage =
  | { type: 'join'; matchCode: string; player: PlayerId }
  | { type: 'command'; command: Command }
  | { type: 'watch'; matchCode: string };

export interface RoomSend {
  (player: PlayerId, message: ServerMessage): void;
}

export class MatchRoom {
  private state: State;
  private readonly connected = new Set<PlayerId>();
  private readonly spectators = new Set<(view: SpectatorView) => void>();
  private readonly send: RoomSend;

  constructor(setup: SetupOpts, send: RoomSend) {
    this.send = send;
    this.state = createInitialState(setup);
  }

  join(player: PlayerId): boolean {
    if (!(player in this.state.players) || this.connected.has(player)) {
      return false;
    }
    this.connected.add(player);
    this.send(player, { type: 'joined', player });
    this.pushState(player);
    return true;
  }

  leave(player: PlayerId): void {
    this.connected.delete(player);
  }

  watch(sendSpectator: (view: SpectatorView) => void): { unwatch: () => void } {
    sendSpectator(getSpectatorView(this.state));
    this.spectators.add(sendSpectator);
    return {
      unwatch: () => {
        this.spectators.delete(sendSpectator);
      },
    };
  }

  handleCommand(sender: PlayerId, command: Command): void {
    if (command.player !== sender) {
      this.send(sender, {
        type: 'error',
        message: 'Command player does not match the sender seat',
      });
      return;
    }

    if (!(sender in this.state.players)) {
      this.send(sender, { type: 'error', message: `Unknown player: ${sender}` });
      return;
    }

    const result = apply(this.state, command);
    if (result.issues.length > 0) {
      this.send(sender, { type: 'issues', issues: [...result.issues] });
      return;
    }

    this.state = result.state;

    const spectatorView = getSpectatorView(this.state);
    for (const sendSpectator of this.spectators) {
      sendSpectator(spectatorView);
    }

    for (const player of this.connected) {
      this.pushState(player);
    }
  }

  private pushState(player: PlayerId): void {
    this.send(player, {
      type: 'view',
      view: getView(this.state, player),
      legal: getLegalCommands(this.state, player),
    });
  }
}

/** FNV-1a 32-bit hash; deterministic string -> unsigned 32-bit integer seed. */
export function deriveSeedFromMatchCode(matchCode: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < matchCode.length; i += 1) {
    hash ^= matchCode.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
