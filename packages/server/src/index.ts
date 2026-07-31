import type {
  Command,
  PlayerId,
  PlayerView,
  SetupOpts,
  ValidationIssue,
  ViewerHandle,
} from '@opencards/core';
import { applyCommand, legalCommands, startMatch, viewMatch } from '@opencards/core';

export type ServerMessage =
  | { type: 'joined'; player: PlayerId }
  | { type: 'view'; view: PlayerView; legal: Command[] }
  | { type: 'issues'; issues: ValidationIssue[] }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'join'; matchCode: string; player: PlayerId }
  | { type: 'command'; command: Command };

export interface RoomSend {
  (player: PlayerId, message: ServerMessage): void;
}

export class MatchRoom {
  private readonly handles: Record<PlayerId, ViewerHandle>;
  private readonly connected = new Set<PlayerId>();
  private readonly send: RoomSend;

  constructor(setup: SetupOpts, send: RoomSend) {
    this.send = send;
    this.handles = startMatch(setup).handles;
  }

  join(player: PlayerId): boolean {
    if (!(player in this.handles) || this.connected.has(player)) {
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

  handleCommand(sender: PlayerId, command: Command): void {
    if (command.player !== sender) {
      this.send(sender, {
        type: 'error',
        message: 'Command player does not match the sender seat',
      });
      return;
    }

    const handle = this.handles[sender];
    if (handle === undefined) {
      this.send(sender, { type: 'error', message: `Unknown player: ${sender}` });
      return;
    }

    const result = applyCommand(handle, command);
    if (result.issues.length > 0) {
      this.send(sender, { type: 'issues', issues: [...result.issues] });
      return;
    }

    for (const player of this.connected) {
      this.pushState(player);
    }
  }

  private pushState(player: PlayerId): void {
    const handle = this.handles[player]!;
    this.send(player, {
      type: 'view',
      view: viewMatch(handle),
      legal: legalCommands(handle),
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
