import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardKind, PlayerId, ReplayEnvelopeV1, SetupOpts } from '@opencards/core';
import { replayEnvelope, startMatch, viewMatch } from '@opencards/core';
import { createElement } from 'react';
import App from './App.js';
import type { AppProps } from './App.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const cardKinds: readonly CardKind[] = ['spark-adept', 'ember-guard', 'flare-strike'];
const setupOpts: SetupOpts = {
  seed: 42,
  players: [p1, p2],
  deckSize: 12,
  openingHandSize: 5,
  cardKinds,
};

function buildEnvelope(overrides: Partial<ReplayEnvelopeV1> = {}): ReplayEnvelopeV1 {
  const draft: ReplayEnvelopeV1 = {
    schemaVersion: '0.1.0',
    seed: 42,
    setupOpts,
    commands: [{ type: 'drawCard', player: p1 }],
    finalStateHash: '',
    ...overrides,
  };
  const result = replayEnvelope(draft);

  return { ...draft, finalStateHash: result.hash };
}

function removeClipboard(): void {
  Reflect.deleteProperty(navigator, 'clipboard');
}

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      readText: vi.fn(),
      writeText: vi.fn(),
    },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('@opencards/app Ember Duel demo', () => {
  it('starts a hot-seat match and advances p1 through the facade', () => {
    render(createElement(App));
    const labelKind = (kind: string) =>
      kind
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    const p1Column = screen.getByTestId('player-p1');
    const p2Column = screen.getByTestId('player-p2');
    expect(within(p1Column).getAllByTestId('own-card-p1')).toHaveLength(5);
    expect(within(p2Column).getByTestId('opponent-p1').children).toHaveLength(5);

    fireEvent.click(within(p1Column).getByRole('button', { name: 'Draw card' }));

    expect(within(p1Column).getAllByTestId('own-card-p1')).toHaveLength(6);
    expect(within(p1Column).getByTestId('deck-count-p1').textContent).toBe('6');

    const { handles } = startMatch(setupOpts);
    const p1Projection = viewMatch(handles[p1]!);
    const p1OpponentJson = JSON.stringify(p1Projection.opponents[p2]);
    for (const kind of cardKinds) {
      expect(p1OpponentJson).not.toContain(kind);
    }

    // Opponent zones are within each player column under [data-testid="opponent-<other>"].
    const p1OpponentZone = within(p1Column).getByTestId('opponent-p2');
    const p2OpponentZone = within(p2Column).getByTestId('opponent-p1');

    for (const zone of [p1OpponentZone, p2OpponentZone]) {
      const zoneHtml = zone.outerHTML;
      for (const kind of cardKinds) {
        expect(zoneHtml).not.toContain(kind);
        expect(zoneHtml).not.toContain(labelKind(kind));
      }
    }

    const p1OpponentEntries = p1OpponentZone.querySelectorAll('[data-testid^="opponent-card-"]');
    expect(p1OpponentEntries.length).toBeGreaterThan(0);
    for (const entry of p1OpponentEntries) {
      expect(entry.textContent?.trim()).toBe('?');
    }
  });

  it('verifies replay envelope JSON without exposing raw state', () => {
    const envelope: ReplayEnvelopeV1 = {
      schemaVersion: '0.1.0',
      seed: 42,
      setupOpts,
      commands: [{ type: 'drawCard', player: p1 }],
      finalStateHash: 'expected-hash',
    };
    render(createElement(App));

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: JSON.stringify(envelope) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(screen.getByText('ok: false')).toBeTruthy();
    expect(screen.getByText('expected: expected-hash')).toBeTruthy();
  });

  it('shows turn / phase / active player', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    const turnInfo = screen.getByTestId('turn-info');
    expect(turnInfo.textContent).toContain('Turn:');
    expect(turnInfo.textContent).toContain('Phase:');
    expect(turnInfo.textContent).toContain('Active:');
  });

  it('disables Draw when deck is empty', () => {
    const emptyDeckSetup: SetupOpts = {
      ...setupOpts,
      deckSize: 1,
      openingHandSize: 1,
    };
    render(createElement<AppProps>(App, { defaultSetup: () => emptyDeckSetup }));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    const p1Column = screen.getByTestId('player-p1');
    const drawButton = within(p1Column).getByRole('button', { name: 'Draw card' });
    expect(drawButton).toHaveProperty('disabled', true);
  });

  it('Reset clears the match', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.click(screen.getByTestId('reset-game'));

    expect(screen.getByText('Start a new game to create both hot-seat player views.')).toBeTruthy();
  });

  it('Export envelope produces valid JSON that round-trips', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.click(
      within(screen.getByTestId('player-p1')).getByRole('button', { name: 'Draw card' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export envelope' }));

    const exported = screen.getByTestId('export-envelope') as HTMLTextAreaElement;
    const envelope = JSON.parse(exported.value) as ReplayEnvelopeV1;
    const result = replayEnvelope(envelope);

    expect(result.ok).toBe(true);
  });

  it('export envelope reflects the started match, not the live seed input', () => {
    render(createElement(App));

    const seedInput = screen.getByLabelText('Seed') as HTMLInputElement;
    fireEvent.change(seedInput, { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    const p1Column = screen.getByTestId('player-p1');
    fireEvent.click(within(p1Column).getByRole('button', { name: 'Draw card' }));

    fireEvent.change(seedInput, { target: { value: '999' } });

    fireEvent.click(screen.getByRole('button', { name: /Export envelope/i }));
    const exportArea = screen.getByTestId('export-envelope') as HTMLTextAreaElement;
    const envelope = JSON.parse(exportArea.value);

    expect(envelope.seed).toBe(42);
    expect(envelope.setupOpts.seed).toBe(42);
    expect(envelope.commands).toHaveLength(1);
    expect(envelope.commands[0]).toEqual({ type: 'drawCard', player: 'p1' });
  });

  it('keyboard shortcuts: n starts a match, 1 draws for p1', () => {
    render(createElement(App));

    fireEvent.keyDown(window, { key: 'n' });

    expect(screen.getByTestId('player-p1')).toBeTruthy();

    fireEvent.keyDown(window, { key: '1' });

    const p1Column = screen.getByTestId('player-p1');
    expect(within(p1Column).getAllByTestId('own-card-p1')).toHaveLength(6);
  });

  it('shortcut focus guard ignores keys while typing in seed input', () => {
    render(createElement(App));

    const seedInput = screen.getByLabelText('Seed');
    seedInput.focus();
    fireEvent.keyDown(seedInput, { key: 'n' });

    expect(screen.queryByTestId('player-p1')).toBeNull();
  });

  it('shortcut focus guard ignores keys while typing in replay textarea', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    const replayTextarea = screen.getByTestId('replay-input');
    replayTextarea.focus();
    fireEvent.keyDown(replayTextarea, { key: '1' });

    const p1Column = screen.getByTestId('player-p1');
    expect(within(p1Column).getAllByTestId('own-card-p1')).toHaveLength(5);
  });

  it("shortcut '2' draws for p2", () => {
    render(createElement(App));

    fireEvent.keyDown(window, { key: 'n' });
    fireEvent.keyDown(window, { key: '2' });

    const p2Column = screen.getByTestId('player-p2');
    expect(within(p2Column).getAllByTestId('own-card-p2')).toHaveLength(6);
  });

  it("shortcut 'r' resets the match", () => {
    render(createElement(App));

    fireEvent.keyDown(window, { key: 'n' });
    fireEvent.keyDown(window, { key: 'r' });

    expect(screen.queryByTestId('player-p1')).toBeNull();
    expect(screen.getByText('Start a new game to create both hot-seat player views.')).toBeTruthy();
  });

  it("shortcut '1' is a no-op when p1 deck is empty", () => {
    const emptyAfterSetup: SetupOpts = {
      ...setupOpts,
      deckSize: 5,
      openingHandSize: 5,
    };
    render(createElement<AppProps>(App, { defaultSetup: () => emptyAfterSetup }));

    fireEvent.keyDown(window, { key: 'n' });

    const p1Column = screen.getByTestId('player-p1');
    expect(within(p1Column).getAllByTestId('own-card-p1')).toHaveLength(5);

    fireEvent.keyDown(document.body, { key: '1' });

    expect(within(p1Column).getAllByTestId('own-card-p1')).toHaveLength(5);
    expect(screen.queryByTestId('log-entry-0')).toBeNull();
    expect(screen.queryByText('Player has no cards to draw: p1')).toBeNull();
  });

  it('pastes replay JSON from the clipboard', async () => {
    const envelopeJson = JSON.stringify(buildEnvelope());
    const readText = vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue(envelopeJson);
    render(createElement(App));

    fireEvent.click(screen.getByTestId('paste-replay'));

    await waitFor(() => {
      expect((screen.getByTestId('replay-input') as HTMLTextAreaElement).value).toBe(envelopeJson);
    });
    readText.mockRestore();
  });

  it('shows a paste error when clipboard read fails', async () => {
    const readText = vi
      .spyOn(navigator.clipboard, 'readText')
      .mockRejectedValue(new Error('blocked'));
    render(createElement(App));

    fireEvent.click(screen.getByTestId('paste-replay'));

    expect(await screen.findByText('Clipboard read failed — paste manually')).toBeTruthy();
    readText.mockRestore();
  });

  it('shows manual paste guidance when the Clipboard API is unavailable', async () => {
    removeClipboard();
    render(createElement(App));

    fireEvent.click(screen.getByTestId('paste-replay'));

    expect(await screen.findByText('Clipboard API not available — paste manually')).toBeTruthy();
  });

  it('copies exported replay envelopes to the clipboard', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.click(
      within(screen.getByTestId('player-p1')).getByRole('button', { name: 'Draw card' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export envelope' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect((await screen.findByTestId('copy-status')).textContent).toBe('Copied');
    expect(writeText).toHaveBeenCalledWith(
      (screen.getByTestId('export-envelope') as HTMLTextAreaElement).value,
    );
    writeText.mockRestore();
  });

  it('shows copy fallback UX when the Clipboard API is unavailable', async () => {
    removeClipboard();
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.click(
      within(screen.getByTestId('player-p1')).getByRole('button', { name: 'Draw card' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export envelope' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect((await screen.findByTestId('copy-status')).textContent).toBe(
      'Select all + Ctrl+C to copy',
    );
  });

  it('shows copy fallback UX when clipboard write fails', async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new Error('blocked'));
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.click(
      within(screen.getByTestId('player-p1')).getByRole('button', { name: 'Draw card' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export envelope' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect((await screen.findByTestId('copy-status')).textContent).toBe(
      'Select all + Ctrl+C to copy',
    );
    writeText.mockRestore();
  });

  it('shows soft paste validation hints after clipboard paste', async () => {
    const readText = vi
      .spyOn(navigator.clipboard, 'readText')
      .mockResolvedValueOnce('{')
      .mockResolvedValueOnce('{"schemaVersion":"0.1.0","seed":42}')
      .mockResolvedValueOnce(JSON.stringify(buildEnvelope()));
    render(createElement(App));

    fireEvent.click(screen.getByTestId('paste-replay'));
    expect((await screen.findByTestId('paste-validation')).textContent).toBe(
      'Pasted content is not valid JSON',
    );

    fireEvent.click(screen.getByTestId('paste-replay'));
    await waitFor(() => {
      expect(screen.getByTestId('paste-validation').textContent).toBe(
        'Looks like JSON but missing fields: setupOpts, commands, finalStateHash',
      );
    });

    fireEvent.click(screen.getByTestId('paste-replay'));
    await waitFor(() => {
      expect(screen.getByTestId('paste-validation').textContent).toBe(
        'Looks like a valid envelope. Click Verify to confirm.',
      );
    });
    readText.mockRestore();
  });

  it('Reset clears replay verification and paste validation hints', async () => {
    const envelopeJson = JSON.stringify(buildEnvelope());
    vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue(envelopeJson);
    render(createElement(App));

    fireEvent.click(screen.getByTestId('paste-replay'));
    expect(await screen.findByTestId('paste-validation')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByTestId('verify-result')).toBeTruthy();

    fireEvent.click(screen.getByTestId('reset-game'));

    expect(screen.queryByTestId('verify-result')).toBeNull();
    expect(screen.queryByTestId('paste-validation')).toBeNull();
  });

  it('New Game clears replay verification and paste validation hints', async () => {
    const envelopeJson = JSON.stringify(buildEnvelope());
    vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue(envelopeJson);
    render(createElement(App));

    fireEvent.click(screen.getByTestId('paste-replay'));
    expect(await screen.findByTestId('paste-validation')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByTestId('verify-result')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    expect(screen.queryByTestId('verify-result')).toBeNull();
    expect(screen.queryByTestId('paste-validation')).toBeNull();
  });

  it('editing the replay textarea clears the previous verify result', () => {
    const envelopeJson = JSON.stringify(buildEnvelope());
    render(createElement(App));

    fireEvent.change(screen.getByTestId('replay-input'), {
      target: { value: envelopeJson },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByTestId('verify-result')).toBeTruthy();

    fireEvent.change(screen.getByTestId('replay-input'), {
      target: { value: `${envelopeJson} ` },
    });

    expect(screen.queryByTestId('verify-result')).toBeNull();
  });

  it('match log truncates when commands exceed 50', () => {
    const logSetup: SetupOpts = {
      ...setupOpts,
      deckSize: 8,
      openingHandSize: 0,
    };
    render(createElement<AppProps>(App, { defaultSetup: () => logSetup, matchLogLimit: 3 }));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    const p1Column = screen.getByTestId('player-p1');
    const drawButton = within(p1Column).getByRole('button', { name: 'Draw card' });
    fireEvent.click(drawButton);
    fireEvent.click(drawButton);
    fireEvent.click(drawButton);
    fireEvent.click(drawButton);

    expect(screen.getByTestId('log-truncation').textContent).toBe('Showing latest 3 of 4');
    expect(screen.queryByTestId('log-entry-0')).toBeNull();
    expect(screen.getByTestId('log-entry-1').textContent).toBe('#2 · p1 · drawCard');
    expect(screen.getByTestId('log-entry-3').textContent).toBe('#4 · p1 · drawCard');
  });

  it('guards non-positive matchLogLimit values before slicing the match log', () => {
    const logSetup: SetupOpts = {
      ...setupOpts,
      deckSize: 60,
      openingHandSize: 0,
    };
    render(createElement<AppProps>(App, { defaultSetup: () => logSetup, matchLogLimit: 0 }));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    const drawButton = within(screen.getByTestId('player-p1')).getByRole('button', {
      name: 'Draw card',
    });
    for (let index = 0; index < 60; index += 1) {
      fireEvent.click(drawButton);
    }

    expect(screen.getByTestId('match-log')).toBeTruthy();
    expect(screen.getByTestId('log-truncation').textContent).toContain('of 60');
  });

  it('matchLogLimit NaN falls back to default and truncates', () => {
    const logSetup: SetupOpts = {
      ...setupOpts,
      deckSize: 60,
      openingHandSize: 0,
    };
    render(
      createElement<AppProps>(App, {
        defaultSetup: () => logSetup,
        matchLogLimit: Number.NaN,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    const drawButton = within(screen.getByTestId('player-p1')).getByRole('button', {
      name: 'Draw card',
    });
    for (let index = 0; index < 51; index += 1) {
      fireEvent.click(drawButton);
    }

    expect(screen.getByTestId('log-truncation')).toBeTruthy();
  });

  it('clear-export removes exported textarea', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.click(
      within(screen.getByTestId('player-p1')).getByRole('button', { name: 'Draw card' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export envelope' }));
    fireEvent.click(screen.getByTestId('clear-export'));

    expect(screen.queryByTestId('export-envelope')).toBeNull();
  });

  it('Reset auto-clears export', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.click(
      within(screen.getByTestId('player-p1')).getByRole('button', { name: 'Draw card' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export envelope' }));
    fireEvent.click(screen.getByTestId('reset-game'));

    expect(screen.queryByTestId('export-envelope')).toBeNull();
  });

  it('New Game auto-clears export', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.click(
      within(screen.getByTestId('player-p1')).getByRole('button', { name: 'Draw card' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export envelope' }));
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    expect(screen.queryByTestId('export-envelope')).toBeNull();
  });

  it('shows export metadata with timestamp, command count, and seed', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    const p1Column = screen.getByTestId('player-p1');
    fireEvent.click(within(p1Column).getByRole('button', { name: 'Draw card' }));
    fireEvent.click(within(p1Column).getByRole('button', { name: 'Draw card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export envelope' }));

    const exportMeta = screen.getByTestId('export-meta').textContent;
    expect(exportMeta).toContain('commands');
    expect(exportMeta).toContain('seed 42');
  });

  it('cmd-count badges reflect commands per player', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    const p1Column = screen.getByTestId('player-p1');
    const p2Column = screen.getByTestId('player-p2');
    fireEvent.click(within(p1Column).getByRole('button', { name: 'Draw card' }));
    fireEvent.click(within(p1Column).getByRole('button', { name: 'Draw card' }));
    fireEvent.click(within(p2Column).getByRole('button', { name: 'Draw card' }));

    expect(screen.getByTestId('cmd-count-p1').textContent).toBe('2');
    expect(screen.getByTestId('cmd-count-p2').textContent).toBe('1');
  });
});
