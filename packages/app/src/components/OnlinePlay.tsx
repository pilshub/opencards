import { useEffect, useRef, useState } from 'react';
import type {
  CardInstanceId,
  Command,
  PlayerId,
  PlayerView,
  SpectatorView,
  ValidationIssue,
} from '@opencards/core';
import { BoardView, buildCardRegistry } from '../App.js';
import type { TargetCommand, TargetingState } from '../App.js';
import { SpectatorView as SpectatorBoard } from './SpectatorView.js';

type ServerMessage =
  | { type: 'joined'; player: PlayerId }
  | { type: 'view'; view: PlayerView; legal: Command[] }
  | { type: 'issues'; issues: ValidationIssue[] }
  | { type: 'error'; message: string }
  | { type: 'spectating' }
  | { type: 'spectatorView'; view: SpectatorView };

type OnlineStatus =
  | { status: 'form' }
  | { status: 'connecting' }
  | { status: 'connected'; view: PlayerView; legal: Command[]; issues: ValidationIssue[] }
  | { status: 'spectating'; view: SpectatorView }
  | { status: 'error'; message: string };

const DEFAULT_SERVER_URL = 'ws://localhost:8787';

const P1 = 'p1' as PlayerId;
const P2 = 'p2' as PlayerId;

type OnlineMode = 'seat' | 'watch';

export function OnlinePlay(): JSX.Element {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [matchCode, setMatchCode] = useState('');
  const [mode, setMode] = useState<OnlineMode>('seat');
  const [seat, setSeat] = useState<PlayerId>(P1);
  const [status, setStatus] = useState<OnlineStatus>({ status: 'form' });
  const [targeting, setTargeting] = useState<TargetingState>({ status: 'idle' });
  const socketRef = useRef<WebSocket | null>(null);

  function closeSocket(): void {
    const socket = socketRef.current;
    if (socket) {
      // Detach handlers before closing so an intentional close or unmount does
      // not trigger the unexpected-disconnect error path.
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
      socketRef.current = null;
    }
  }

  function connect(): void {
    closeSocket();
    setTargeting({ status: 'idle' });
    setStatus({ status: 'connecting' });

    let socket: WebSocket;
    try {
      socket = new WebSocket(serverUrl);
    } catch {
      setStatus({ status: 'error', message: 'Connection failed' });
      return;
    }
    socketRef.current = socket;

    socket.onopen = () => {
      if (mode === 'watch') {
        socket.send(JSON.stringify({ type: 'watch', matchCode }));
      } else {
        socket.send(JSON.stringify({ type: 'join', matchCode, player: seat }));
      }
    };
    socket.onmessage = (event: MessageEvent) => {
      handleServerMessage(event.data);
    };
    socket.onclose = () => {
      setStatus((current) => {
        if (current.status === 'error') {
          return current;
        }
        return { status: 'error', message: 'Connection closed' };
      });
    };
    socket.onerror = () => {
      setStatus((current) => {
        if (current.status === 'error') {
          return current;
        }
        return { status: 'error', message: 'Connection failed' };
      });
    };
  }

  function handleServerMessage(data: unknown): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(String(data)) as ServerMessage;
    } catch {
      setStatus({ status: 'error', message: 'Invalid server message' });
      return;
    }

    switch (message.type) {
      case 'joined':
        break;
      case 'spectating':
        break;
      case 'view':
        // The server is authoritative: a fresh view supersedes any in-flight
        // targeting draft, so reset to idle and clear stale issues.
        setTargeting({ status: 'idle' });
        setStatus({
          status: 'connected',
          view: message.view,
          legal: message.legal,
          issues: [],
        });
        break;
      case 'spectatorView':
        setTargeting({ status: 'idle' });
        setStatus({ status: 'spectating', view: message.view });
        break;
      case 'issues':
        setStatus((current) => {
          if (current.status === 'connected') {
            return {
              status: 'connected',
              view: current.view,
              legal: current.legal,
              issues: message.issues,
            };
          }
          return current;
        });
        break;
      case 'error':
        setStatus({ status: 'error', message: message.message });
        break;
    }
  }

  function disconnect(): void {
    closeSocket();
    setTargeting({ status: 'idle' });
    setStatus({ status: 'form' });
  }

  function sendCommand(command: Command): void {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'command', command }));
    }
  }

  function onSelectAttacker(instanceId: CardInstanceId): void {
    if (status.status !== 'connected') {
      return;
    }
    if (
      !status.legal.some((command) => command.type === 'attack' && command.attacker === instanceId)
    ) {
      return;
    }
    setTargeting({
      status: 'awaitingTarget',
      draft: { type: 'attack', player: seat, attacker: instanceId },
    });
  }

  function onTargetCommand(command: TargetCommand): void {
    setTargeting({ status: 'confirming', command });
    sendCommand(command);
  }

  function onCancelTargeting(): void {
    setTargeting({ status: 'idle' });
  }

  function onCommand(command: Command): void {
    sendCommand(command);
  }

  useEffect(() => {
    return () => closeSocket();
  }, []);

  if (status.status === 'connected') {
    return (
      <section className="flex flex-col gap-3" data-testid="online-play">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-500" data-testid="online-note">
            Live event history is not wired up yet for online play.
          </p>
          <button
            className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
            data-testid="online-disconnect"
            type="button"
            onClick={disconnect}
          >
            Disconnect
          </button>
        </div>
        {/* commands={[]} and eventLog={[]} are a documented v1 gap: the server
            only broadcasts the latest projected view + legal, not a full
            command/event history. hashMatch is a fixed literal because the
            server is the authority — there is no local replay hash to verify. */}
        <BoardView
          viewer={seat}
          view={status.view}
          activePlayer={status.view.activePlayer}
          cardRegistry={buildCardRegistry(false)}
          commands={[]}
          eventLog={[]}
          hashMatch="match"
          issues={status.issues}
          legal={status.legal}
          targeting={targeting}
          onCancelTargeting={onCancelTargeting}
          onCommand={onCommand}
          onSelectAttacker={onSelectAttacker}
          onTargetCommand={onTargetCommand}
        />
      </section>
    );
  }

  if (status.status === 'spectating') {
    return (
      <section className="flex flex-col gap-3" data-testid="online-play">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-500" data-testid="online-note">
            Watching this match — read-only, no commands.
          </p>
          <button
            className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
            data-testid="online-disconnect"
            type="button"
            onClick={disconnect}
          >
            Disconnect
          </button>
        </div>
        <SpectatorBoard view={status.view} />
      </section>
    );
  }

  return (
    <section className="rounded border border-white/10 bg-zinc-900 p-4" data-testid="online-play">
      {status.status === 'connecting' ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-300" data-testid="online-connecting">
            Connecting…
          </p>
          <button
            className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
            data-testid="online-disconnect"
            type="button"
            onClick={disconnect}
          >
            Disconnect
          </button>
        </div>
      ) : null}
      {status.status === 'error' ? (
        <p
          className="mb-4 rounded border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-100"
          data-testid="online-error"
        >
          {status.message}
        </p>
      ) : null}
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Server URL
          <input
            className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
            data-testid="online-server-url"
            type="text"
            value={serverUrl}
            onChange={(event) => setServerUrl(event.currentTarget.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Match code
          <input
            className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
            data-testid="online-match-code"
            type="text"
            value={matchCode}
            onChange={(event) => setMatchCode(event.currentTarget.value)}
          />
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-300">Seat</span>
          <button
            className={seatButtonClass(mode === 'seat' && seat === P1)}
            data-testid="online-seat-p1"
            type="button"
            onClick={() => {
              setMode('seat');
              setSeat(P1);
            }}
          >
            p1
          </button>
          <button
            className={seatButtonClass(mode === 'seat' && seat === P2)}
            data-testid="online-seat-p2"
            type="button"
            onClick={() => {
              setMode('seat');
              setSeat(P2);
            }}
          >
            p2
          </button>
          <button
            className={seatButtonClass(mode === 'watch')}
            data-testid="online-seat-spectator"
            type="button"
            onClick={() => setMode('watch')}
          >
            Watch
          </button>
        </div>
        <button
          className="rounded bg-[color:var(--oc-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="online-connect"
          disabled={matchCode.trim() === ''}
          type="button"
          onClick={connect}
        >
          Connect
        </button>
      </div>
    </section>
  );
}

function seatButtonClass(active: boolean): string {
  return `rounded border border-[color:var(--oc-border)] px-3 py-1.5 text-sm font-semibold ${
    active ? 'bg-[color:var(--oc-accent)] text-zinc-950' : 'text-zinc-300 hover:bg-zinc-800'
  }`;
}
