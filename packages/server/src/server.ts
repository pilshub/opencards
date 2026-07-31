import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import type { Command, PlayerId } from '@opencards/core';
import { createFoundrySetup } from '@opencards/ember-foundry';
import {
  MatchRoom,
  deriveSeedFromMatchCode,
  type ClientMessage,
  type RoomSend,
  type ServerMessage,
} from './index.ts';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;

const sendError = (socket: WebSocket, message: string): void => {
  socket.send(JSON.stringify({ type: 'error', message } satisfies ServerMessage));
};

const parseClientMessage = (text: string): ClientMessage | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (record.type === 'join') {
    if (typeof record.matchCode !== 'string' || typeof record.player !== 'string') {
      return null;
    }
    return { type: 'join', matchCode: record.matchCode, player: record.player as PlayerId };
  }
  if (record.type === 'watch') {
    if (typeof record.matchCode !== 'string') {
      return null;
    }
    return { type: 'watch', matchCode: record.matchCode };
  }
  if (record.type === 'command' && typeof record.command === 'object' && record.command !== null) {
    return { type: 'command', command: record.command as Command };
  }
  return null;
};

export function startServer(port?: number): { close: () => void } {
  const httpServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  const wss = new WebSocketServer({ server: httpServer });

  const rooms = new Map<string, MatchRoom>();
  const roomSockets = new Map<string, Map<PlayerId, WebSocket>>();

  const makeSend = (matchCode: string): RoomSend => {
    return (player, message) => {
      const socket = roomSockets.get(matchCode)?.get(player);
      if (socket !== undefined && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    };
  };

  wss.on('connection', (socket) => {
    let matchCode: string | undefined;
    let player: PlayerId | undefined;
    let spectatorHandle: { unwatch: () => void } | undefined;

    const findOrCreateRoom = (code: string): MatchRoom => {
      let room = rooms.get(code);
      if (room === undefined) {
        room = new MatchRoom(
          createFoundrySetup(deriveSeedFromMatchCode(code), [p1, p2]),
          makeSend(code),
        );
        rooms.set(code, room);
      }
      return room;
    };

    socket.on('message', (data) => {
      const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      const msg = parseClientMessage(text);

      if (msg === null) {
        sendError(socket, 'Malformed message');
        if (matchCode === undefined) {
          socket.close();
        }
        return;
      }

      if (matchCode === undefined) {
        if (msg.type === 'join') {
          matchCode = msg.matchCode;
          player = msg.player;

          let sockets = roomSockets.get(matchCode);
          if (sockets === undefined) {
            sockets = new Map();
            roomSockets.set(matchCode, sockets);
          }
          const room = findOrCreateRoom(matchCode);

          sockets.set(player, socket);

          if (!room.join(player)) {
            sockets.delete(player);
            matchCode = undefined;
            player = undefined;
            sendError(socket, 'Seat unavailable');
            socket.close();
          }
          return;
        }

        if (msg.type === 'watch') {
          matchCode = msg.matchCode;
          const room = findOrCreateRoom(matchCode);
          spectatorHandle = room.watch((view) => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'spectatorView', view } satisfies ServerMessage));
            }
          });
          socket.send(JSON.stringify({ type: 'spectating' } satisfies ServerMessage));
          return;
        }

        sendError(socket, 'First message must be a join or watch');
        socket.close();
        return;
      }

      if (msg.type === 'command') {
        const room = rooms.get(matchCode);
        room?.handleCommand(player!, msg.command);
      }
    });

    socket.on('close', () => {
      if (matchCode !== undefined && player !== undefined) {
        rooms.get(matchCode)?.leave(player);
        roomSockets.get(matchCode)?.delete(player);
      }
      if (spectatorHandle !== undefined) {
        spectatorHandle.unwatch();
      }
    });
  });

  const portNumber = port ?? Number(process.env.PORT ?? 8787);
  httpServer.listen(portNumber);
  console.warn(`@opencards/server listening on port ${portNumber}`);

  return {
    close: () => {
      wss.close();
      httpServer.close();
    },
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  startServer();
}
