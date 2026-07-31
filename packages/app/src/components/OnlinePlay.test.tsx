import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlayerId } from '@opencards/core';
import { legalCommands, startMatch, viewMatch } from '@opencards/core';
import { createFoundrySetup } from '@opencards/ember-foundry';
import { OnlinePlay } from './OnlinePlay.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;

/**
 * Hand-rolled WebSocket mock so unit tests can drive the connection state
 * machine deterministically instead of spinning up the real packages/server.
 * jsdom does expose a native WebSocket global, but it attempts real TCP
 * connections; this controllable fake is assigned over it for these tests.
 */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = MockWebSocket.CLOSED;
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  receive(payload: unknown): void {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.onmessage?.({ data });
  }

  closeFromServer(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1006, reason: '' });
  }

  fail(): void {
    this.onerror?.(new Error('connection error'));
  }
}

const NativeWebSocket = globalThis.WebSocket;

function buildView(): {
  view: ReturnType<typeof viewMatch>;
  legal: ReturnType<typeof legalCommands>;
} {
  const { handles } = startMatch(createFoundrySetup(42, [p1, p2]));
  return { view: viewMatch(handles[p1]!), legal: legalCommands(handles[p1]!) };
}

function fillMatchCode(value = 'room-1'): void {
  fireEvent.change(screen.getByTestId('online-match-code'), { target: { value } });
}

function connectAndOpen(): MockWebSocket {
  fireEvent.click(screen.getByTestId('online-connect'));
  const socket = MockWebSocket.instances.at(-1)!;
  act(() => socket.open());
  return socket;
}

function receiveView(socket: MockWebSocket): void {
  const { view, legal } = buildView();
  act(() => socket.receive({ type: 'joined', player: p1 }));
  act(() => socket.receive({ type: 'view', view, legal }));
}

beforeEach(() => {
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
  cleanup();
  globalThis.WebSocket = NativeWebSocket;
});

describe('@opencards/app OnlinePlay', () => {
  it('renders the connection form with documented test ids and default server URL', () => {
    render(<OnlinePlay />);

    expect((screen.getByTestId('online-server-url') as HTMLInputElement).value).toBe(
      'ws://localhost:8787',
    );
    expect(screen.getByTestId('online-match-code')).toBeTruthy();
    expect(screen.getByTestId('online-seat-p1')).toBeTruthy();
    expect(screen.getByTestId('online-seat-p2')).toBeTruthy();
    expect(screen.getByTestId('online-connect')).toHaveProperty('disabled', true);
  });

  it('opens a WebSocket to the entered URL and sends a join message on open', () => {
    render(<OnlinePlay />);

    fireEvent.change(screen.getByTestId('online-server-url'), {
      target: { value: 'ws://localhost:9999' },
    });
    fillMatchCode('abc');
    fireEvent.click(screen.getByTestId('online-seat-p2'));
    fireEvent.click(screen.getByTestId('online-connect'));

    expect(MockWebSocket.instances).toHaveLength(1);
    const socket = MockWebSocket.instances[0]!;
    expect(socket.url).toBe('ws://localhost:9999');

    act(() => socket.open());
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0]!)).toEqual({ type: 'join', matchCode: 'abc', player: 'p2' });
  });

  it('renders the board from a received view message', () => {
    render(<OnlinePlay />);
    fillMatchCode();
    const socket = connectAndOpen();
    receiveView(socket);

    expect(screen.getByTestId('board')).toBeTruthy();
    const playerArea = screen.getByTestId('player-area');
    expect(within(playerArea).getAllByTestId('own-card-p1').length).toBeGreaterThan(0);
  });

  it('keeps the board visible and surfaces issues after an issues message', () => {
    render(<OnlinePlay />);
    fillMatchCode();
    const socket = connectAndOpen();
    receiveView(socket);

    act(() =>
      socket.receive({
        type: 'issues',
        issues: [{ code: 'OC-TEST', message: 'Not enough energy' }],
      }),
    );

    expect(screen.getByTestId('board')).toBeTruthy();
    expect(screen.getByText('Not enough energy')).toBeTruthy();
  });

  it('shows the error state and the form again after an error message', () => {
    render(<OnlinePlay />);
    fillMatchCode();
    const socket = connectAndOpen();
    receiveView(socket);

    act(() => socket.receive({ type: 'error', message: 'Match not found' }));

    expect(screen.getByTestId('online-error').textContent).toBe('Match not found');
    expect(screen.getByTestId('online-server-url')).toBeTruthy();
    expect(screen.queryByTestId('board')).toBeNull();
  });

  it('closes the socket and returns to the form when Disconnect is clicked', () => {
    render(<OnlinePlay />);
    fillMatchCode();
    const socket = connectAndOpen();
    receiveView(socket);

    fireEvent.click(screen.getByTestId('online-disconnect'));

    expect(socket.closed).toBe(true);
    expect(screen.getByTestId('online-server-url')).toBeTruthy();
    expect(screen.queryByTestId('board')).toBeNull();
  });

  it('sends a command message when a board control is used', () => {
    render(<OnlinePlay />);
    fillMatchCode();
    const socket = connectAndOpen();
    receiveView(socket);

    fireEvent.click(
      within(screen.getByTestId('player-area')).getByRole('button', { name: 'Draw card' }),
    );

    const sent = socket.sent.at(-1)!;
    expect(JSON.parse(sent)).toEqual({
      type: 'command',
      command: { type: 'drawCard', player: 'p1' },
    });
  });

  it('shows Connection closed when the socket closes unexpectedly', () => {
    render(<OnlinePlay />);
    fillMatchCode();
    const socket = connectAndOpen();
    receiveView(socket);

    act(() => socket.closeFromServer());

    expect(screen.getByTestId('online-error').textContent).toBe('Connection closed');
    expect(screen.queryByTestId('board')).toBeNull();
  });

  it('shows Connection failed when a socket-level error fires', () => {
    render(<OnlinePlay />);
    fillMatchCode();
    const socket = connectAndOpen();

    act(() => socket.fail());

    expect(screen.getByTestId('online-error').textContent).toBe('Connection failed');
  });

  it('shows an invalid-server-message error on unparseable payloads', () => {
    render(<OnlinePlay />);
    fillMatchCode();
    const socket = connectAndOpen();

    act(() => socket.receive('not json'));

    expect(screen.getByTestId('online-error').textContent).toBe('Invalid server message');
  });
});
