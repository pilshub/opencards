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
const cardLabels = ['Spark Adept', 'Ember Guard', 'Flare Strike'] as const;
const cardLabelByKind = new Map<CardKind, string>([
  ['spark-adept', 'Spark Adept'],
  ['ember-guard', 'Ember Guard'],
  ['flare-strike', 'Flare Strike'],
]);
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

function labelForKind(kind: CardKind): string {
  return cardLabelByKind.get(kind) ?? kind;
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
  it('renders board with viewer hand on bottom and opponent backs on top', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    const playerArea = screen.getByTestId('player-area');
    const opponentArea = screen.getByTestId('opponent-area');
    expect(within(playerArea).getAllByTestId('own-card-p1')).toHaveLength(5);
    expect(within(opponentArea).getAllByTestId(/^opponent-card-/)).toHaveLength(5);
    expect(within(opponentArea).getByTestId('opponent-card-0')).toBeTruthy();
  });

  it('starts a hot-seat match and advances p1 through the facade', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    const playerArea = screen.getByTestId('player-area');

    fireEvent.click(within(playerArea).getByRole('button', { name: 'Draw card' }));

    expect(within(playerArea).getAllByTestId('own-card-p1')).toHaveLength(6);
    expect(within(playerArea).getByTestId('deck-count-p1').textContent).toBe('6');

    const { handles } = startMatch(setupOpts);
    const p1Projection = viewMatch(handles[p1]!);
    const p1OpponentJson = JSON.stringify(p1Projection.opponents[p2]);
    for (const kind of cardKinds) {
      expect(p1OpponentJson).not.toContain(kind);
    }

    const opponentArea = screen.getByTestId('opponent-area');
    const opponentHtml = opponentArea.outerHTML;
    for (const kind of cardKinds) {
      expect(opponentHtml).not.toContain(kind);
      expect(opponentHtml).not.toContain(labelForKind(kind));
    }

    const p1OpponentEntries = opponentArea.querySelectorAll('[data-testid^="opponent-card-"]');
    expect(p1OpponentEntries.length).toBeGreaterThan(0);
    for (const entry of p1OpponentEntries) {
      for (const kind of cardKinds) {
        expect(entry.textContent).not.toContain(kind);
      }
      for (const label of cardLabels) {
        expect(entry.textContent).not.toContain(label);
      }
    }
  });

  it('perspective toggle flips the board', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.click(screen.getByTestId('view-as-p2'));

    const playerArea = screen.getByTestId('player-area');
    const opponentArea = screen.getByTestId('opponent-area');
    expect(within(playerArea).getAllByTestId('own-card-p2')).toHaveLength(5);
    expect(within(opponentArea).getAllByTestId(/^opponent-card-/)).toHaveLength(5);

    const { handles } = startMatch(setupOpts);
    const p1HandKinds = viewMatch(handles[p1]!).viewer.hand.map((card) => card.kind);
    const opponentHtml = opponentArea.outerHTML;
    for (const kind of p1HandKinds) {
      expect(opponentHtml).not.toContain(kind);
      expect(opponentHtml).not.toContain(labelForKind(kind));
    }
  });

  it('does not render opponent hand kinds anywhere in the board DOM', () => {
    const hiddenInfoSetup: SetupOpts = {
      seed: 1,
      players: [p1, p2],
      deckSize: 24,
      openingHandSize: 5,
      cardKinds: Array.from({ length: 24 }, (_, index) => {
        return `hidden-kind-${String(index).padStart(2, '0')}`;
      }),
    };
    const { handles } = startMatch(hiddenInfoSetup);
    const p1HandKinds = viewMatch(handles[p1]!).viewer.hand.map((card) => card.kind);
    const p2HandKinds = viewMatch(handles[p2]!).viewer.hand.map((card) => card.kind);
    render(createElement<AppProps>(App, { defaultSetup: () => hiddenInfoSetup }));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    let boardHtml = screen.getByTestId('board').innerHTML;
    for (const kind of p2HandKinds) {
      expect(boardHtml).not.toContain(kind);
      expect(boardHtml).not.toContain(labelForKind(kind));
    }

    fireEvent.click(screen.getByTestId('view-as-p2'));

    boardHtml = screen.getByTestId('board').innerHTML;
    for (const kind of p1HandKinds) {
      expect(boardHtml).not.toContain(kind);
      expect(boardHtml).not.toContain(labelForKind(kind));
    }
  });

  it('card front shows kind label for own hand', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    const firstOwnCard = within(screen.getByTestId('player-area')).getAllByTestId(
      'own-card-p1',
    )[0]!;
    expect(cardLabels.some((label) => firstOwnCard.textContent?.includes(label))).toBe(true);
  });

  it('card back has no kind text for opponent', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    const opponentCard = within(screen.getByTestId('opponent-area')).getAllByTestId(
      'opponent-card-0',
    )[0]!;
    for (const kind of cardKinds) {
      expect(opponentCard.textContent).not.toContain(kind);
    }
    for (const label of cardLabels) {
      expect(opponentCard.textContent).not.toContain(label);
    }
  });

  it('active player area has glow indicator', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    expect(screen.getByTestId('player-area').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('opponent-area').getAttribute('data-active')).toBe('false');
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

    const drawButton = within(screen.getByTestId('player-area')).getByRole('button', {
      name: 'Draw card',
    });
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
      within(screen.getByTestId('player-area')).getByRole('button', { name: 'Draw card' }),
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

    fireEvent.click(
      within(screen.getByTestId('player-area')).getByRole('button', { name: 'Draw card' }),
    );

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

    expect(screen.getByTestId('player-area')).toBeTruthy();

    fireEvent.keyDown(window, { key: '1' });

    expect(within(screen.getByTestId('player-area')).getAllByTestId('own-card-p1')).toHaveLength(6);
  });

  it('shortcut focus guard ignores keys while typing in seed input', () => {
    render(createElement(App));

    const seedInput = screen.getByLabelText('Seed');
    seedInput.focus();
    fireEvent.keyDown(seedInput, { key: 'n' });

    expect(screen.queryByTestId('player-area')).toBeNull();
  });

  it('shortcut focus guard ignores keys while typing in replay textarea', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    const replayTextarea = screen.getByTestId('replay-input');
    replayTextarea.focus();
    fireEvent.keyDown(replayTextarea, { key: '1' });

    expect(within(screen.getByTestId('player-area')).getAllByTestId('own-card-p1')).toHaveLength(5);
  });

  it("shortcut '2' draws for p2", () => {
    render(createElement(App));

    fireEvent.keyDown(window, { key: 'n' });
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.click(screen.getByTestId('view-as-p2'));

    expect(within(screen.getByTestId('player-area')).getAllByTestId('own-card-p2')).toHaveLength(6);
  });

  it("shortcut 'v' toggles perspective", () => {
    render(createElement(App));

    fireEvent.keyDown(window, { key: 'n' });
    expect(within(screen.getByTestId('player-area')).getAllByTestId('own-card-p1')).toHaveLength(5);

    fireEvent.keyDown(window, { key: 'v' });

    expect(within(screen.getByTestId('player-area')).getAllByTestId('own-card-p2')).toHaveLength(5);
  });

  it("shortcut 'r' resets the match", () => {
    render(createElement(App));

    fireEvent.keyDown(window, { key: 'n' });
    fireEvent.keyDown(window, { key: 'r' });

    expect(screen.queryByTestId('player-area')).toBeNull();
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

    const playerArea = screen.getByTestId('player-area');
    expect(within(playerArea).getAllByTestId('own-card-p1')).toHaveLength(5);

    fireEvent.keyDown(document.body, { key: '1' });

    expect(within(playerArea).getAllByTestId('own-card-p1')).toHaveLength(5);
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
      within(screen.getByTestId('player-area')).getByRole('button', { name: 'Draw card' }),
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
      within(screen.getByTestId('player-area')).getByRole('button', { name: 'Draw card' }),
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
      within(screen.getByTestId('player-area')).getByRole('button', { name: 'Draw card' }),
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
    const drawButton = within(screen.getByTestId('player-area')).getByRole('button', {
      name: 'Draw card',
    });
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
    const drawButton = within(screen.getByTestId('player-area')).getByRole('button', {
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
    const drawButton = within(screen.getByTestId('player-area')).getByRole('button', {
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
      within(screen.getByTestId('player-area')).getByRole('button', { name: 'Draw card' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export envelope' }));
    fireEvent.click(screen.getByTestId('clear-export'));

    expect(screen.queryByTestId('export-envelope')).toBeNull();
  });

  it('Reset auto-clears export', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.click(
      within(screen.getByTestId('player-area')).getByRole('button', { name: 'Draw card' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export envelope' }));
    fireEvent.click(screen.getByTestId('reset-game'));

    expect(screen.queryByTestId('export-envelope')).toBeNull();
  });

  it('New Game auto-clears export', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.click(
      within(screen.getByTestId('player-area')).getByRole('button', { name: 'Draw card' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export envelope' }));
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    expect(screen.queryByTestId('export-envelope')).toBeNull();
  });

  it('shows export metadata with timestamp, command count, and seed', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    const drawButton = within(screen.getByTestId('player-area')).getByRole('button', {
      name: 'Draw card',
    });
    fireEvent.click(drawButton);
    fireEvent.click(drawButton);
    fireEvent.click(screen.getByRole('button', { name: 'Export envelope' }));

    const exportMeta = screen.getByTestId('export-meta').textContent;
    expect(exportMeta).toContain('commands');
    expect(exportMeta).toContain('seed 42');
  });

  it('cmd-count badges reflect commands per player', () => {
    render(createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    const drawButton = within(screen.getByTestId('player-area')).getByRole('button', {
      name: 'Draw card',
    });
    fireEvent.click(drawButton);
    fireEvent.click(drawButton);

    expect(screen.getByTestId('cmd-count-p1').textContent).toBe('2');

    fireEvent.click(screen.getByTestId('view-as-p2'));
    fireEvent.click(
      within(screen.getByTestId('player-area')).getByRole('button', { name: 'Draw card' }),
    );

    expect(screen.getByTestId('cmd-count-p2').textContent).toBe('1');
  });
});

const LS_KEY = 'opencards.customCards';
const FORMAT_LS_KEY = 'opencards.format';

describe('@opencards/app Format Editor', () => {
  afterEach(() => {
    localStorage.removeItem(FORMAT_LS_KEY);
  });

  it('nav-rules shows format-editor; nav-play returns to the board (New Game visible)', () => {
    render(createElement(App));

    expect(screen.queryByTestId('format-editor')).toBeNull();

    fireEvent.click(screen.getByTestId('nav-rules'));
    expect(screen.getByTestId('format-editor')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New Game' })).toBeNull();

    fireEvent.click(screen.getByTestId('nav-play'));
    expect(screen.getByRole('button', { name: 'New Game' })).toBeTruthy();
    expect(screen.queryByTestId('format-editor')).toBeNull();
  });

  it('editing Deck size to 0 shows format-issues and disables save-format', () => {
    render(createElement(App));
    fireEvent.click(screen.getByTestId('nav-rules'));

    const deckSizeInput = screen.getByLabelText('Deck size') as HTMLInputElement;
    fireEvent.change(deckSizeInput, { target: { value: '0' } });

    expect(screen.getByTestId('format-issues')).toBeTruthy();
    expect(screen.queryByTestId('format-valid')).toBeNull();
    expect(screen.getByTestId('save-format')).toHaveProperty('disabled', true);
  });

  it('valid format shows format-valid, enables save-format; Save writes to localStorage', () => {
    render(createElement(App));
    fireEvent.click(screen.getByTestId('nav-rules'));

    // Change deck size to a different valid value
    const deckSizeInput = screen.getByLabelText('Deck size') as HTMLInputElement;
    fireEvent.change(deckSizeInput, { target: { value: '20' } });

    expect(screen.getByTestId('format-valid')).toBeTruthy();
    expect(screen.queryByTestId('format-issues')).toBeNull();

    const saveBtn = screen.getByTestId('save-format');
    expect(saveBtn).toHaveProperty('disabled', false);

    fireEvent.click(saveBtn);

    const stored = JSON.parse(localStorage.getItem(FORMAT_LS_KEY) ?? 'null') as {
      deckSize: number;
    };
    expect(stored).not.toBeNull();
    expect(stored.deckSize).toBe(20);
  });

  it('on mount a pre-seeded valid localStorage format populates the fields', () => {
    const seeded = {
      name: 'Custom Format',
      deckSize: 30,
      openingHandSize: 7,
      copyLimit: 2,
      baseTotal: 25,
      startingEnergy: 1,
    };
    localStorage.setItem(FORMAT_LS_KEY, JSON.stringify(seeded));

    render(createElement(App));
    fireEvent.click(screen.getByTestId('nav-rules'));

    const deckSizeInput = screen.getByLabelText('Deck size') as HTMLInputElement;
    expect(deckSizeInput.value).toBe('30');
  });

  it('corrupt localStorage format falls back to defaults without crashing', () => {
    localStorage.setItem(FORMAT_LS_KEY, '{bad json]]]');

    render(createElement(App));
    fireEvent.click(screen.getByTestId('nav-rules'));

    // Should render without crashing and show default deck size
    const deckSizeInput = screen.getByLabelText('Deck size') as HTMLInputElement;
    expect(Number(deckSizeInput.value)).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('format-editor')).toBeTruthy();
  });

  it('invalid saved format falls back to defaults without crashing', () => {
    localStorage.setItem(FORMAT_LS_KEY, JSON.stringify({ deckSize: -99, name: '' }));

    render(createElement(App));
    fireEvent.click(screen.getByTestId('nav-rules'));

    const deckSizeInput = screen.getByLabelText('Deck size') as HTMLInputElement;
    // Should have fallen back to DEFAULT_FORMAT deckSize (12)
    expect(Number(deckSizeInput.value)).toBe(12);
  });
});

describe('@opencards/app Card Creator', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('nav: clicking nav-create shows card-creator; clicking nav-play shows the board area again', () => {
    render(createElement(App));

    // Initially the play view is shown — New Game button is visible
    expect(screen.getByRole('button', { name: 'New Game' })).toBeTruthy();
    expect(screen.queryByTestId('card-creator')).toBeNull();

    fireEvent.click(screen.getByTestId('nav-create'));
    expect(screen.getByTestId('card-creator')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New Game' })).toBeNull();

    fireEvent.click(screen.getByTestId('nav-play'));
    expect(screen.getByRole('button', { name: 'New Game' })).toBeTruthy();
    expect(screen.queryByTestId('card-creator')).toBeNull();
  });

  it('typing a Name updates the creator-preview text', () => {
    render(createElement(App));
    fireEvent.click(screen.getByTestId('nav-create'));

    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Fire Drake' } });

    const preview = screen.getByTestId('creator-preview');
    expect(preview.textContent).toContain('Fire Drake');
  });

  it('invalid kind (uppercase "BAD") shows validation-issues and disables save-card', () => {
    render(createElement(App));
    fireEvent.click(screen.getByTestId('nav-create'));

    const kindInput = screen.getByLabelText('Kind') as HTMLInputElement;
    fireEvent.change(kindInput, { target: { value: 'BAD' } });

    expect(screen.queryByTestId('validation-ok')).toBeNull();
    expect(screen.getByTestId('validation-issues')).toBeTruthy();
    expect(screen.getByTestId('save-card')).toHaveProperty('disabled', true);
  });

  it('valid unit card shows validation-ok, enables save-card, saves to list and localStorage', () => {
    render(createElement(App));
    fireEvent.click(screen.getByTestId('nav-create'));

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'test-unit' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Unit' } });
    // Type is already 'unit' by default
    fireEvent.change(screen.getByLabelText('Cost'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Attack'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Health'), { target: { value: '2' } });

    expect(screen.getByTestId('validation-ok')).toBeTruthy();
    expect(screen.getByTestId('save-card')).toHaveProperty('disabled', false);

    fireEvent.click(screen.getByTestId('save-card'));

    expect(screen.getByTestId('saved-card-test-unit')).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as Array<{ kind: string }>;
    expect(stored.some((c) => c.kind === 'test-unit')).toBe(true);
  });

  it('delete-card removes from list and from localStorage', () => {
    render(createElement(App));
    fireEvent.click(screen.getByTestId('nav-create'));

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'test-unit' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Unit' } });
    fireEvent.change(screen.getByLabelText('Cost'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Attack'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Health'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('save-card'));

    expect(screen.getByTestId('saved-card-test-unit')).toBeTruthy();

    fireEvent.click(screen.getByTestId('delete-card-test-unit'));

    expect(screen.queryByTestId('saved-card-test-unit')).toBeNull();
    const stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as Array<{ kind: string }>;
    expect(stored.some((c) => c.kind === 'test-unit')).toBe(false);
  });

  it('on mount loads pre-seeded localStorage entry into saved list', () => {
    const preSeeded = [
      {
        kind: 'pre-seeded',
        name: 'Pre Seeded',
        type: 'tactic',
        cost: { energy: 0 },
        effects: [],
      },
    ];
    localStorage.setItem(LS_KEY, JSON.stringify(preSeeded));

    render(createElement(App));
    fireEvent.click(screen.getByTestId('nav-create'));

    expect(screen.getByTestId('saved-card-pre-seeded')).toBeTruthy();
  });

  it('skips corrupt localStorage entries and loads only valid cards on mount', () => {
    const mixed = [
      { garbage: true },
      {
        kind: 'good-card',
        name: 'Good Card',
        type: 'tactic',
        cost: { energy: 1 },
        effects: [],
      },
    ];
    localStorage.setItem(LS_KEY, JSON.stringify(mixed));

    render(createElement(App));
    fireEvent.click(screen.getByTestId('nav-create'));

    expect(screen.getByTestId('saved-card-good-card')).toBeTruthy();
    expect(screen.queryByTestId('saved-card-undefined')).toBeNull();
  });

  it('saving a kind that already exists overwrites it in the list and localStorage', () => {
    render(createElement(App));
    fireEvent.click(screen.getByTestId('nav-create'));

    // Save first version
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'my-card' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Version One' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'tactic' } });
    fireEvent.change(screen.getByLabelText('Cost'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('save-card'));

    // Save second version with same kind
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Version Two' } });
    fireEvent.click(screen.getByTestId('save-card'));

    const stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as Array<{
      kind: string;
      name: string;
    }>;
    const matches = stored.filter((c) => c.kind === 'my-card');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe('Version Two');
  });
});

describe('@opencards/app custom game integration', () => {
  const CUSTOM_KEY = 'opencards.customCards';
  const FORMAT_KEY = 'opencards.format';

  const customCards = [
    { kind: 'my-dragon', name: 'My Dragon', type: 'tactic', cost: { energy: 1 }, effects: [] },
    {
      kind: 'my-knight',
      name: 'My Knight',
      type: 'unit',
      cost: { energy: 2 },
      stats: { attack: 2, health: 3 },
      effects: [],
    },
  ];

  afterEach(() => {
    localStorage.clear();
  });

  it('default play is unaffected when no custom cards are saved', () => {
    render(createElement(App));

    const toggle = screen.getByTestId('use-custom-cards') as HTMLInputElement;
    expect(toggle.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    expect(within(screen.getByTestId('player-area')).getAllByTestId('own-card-p1')).toHaveLength(5);
  });

  it('plays with custom cards and shows their names in the viewer hand', () => {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(customCards));
    render(createElement(App));

    fireEvent.click(screen.getByTestId('use-custom-cards'));
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    const playerArea = screen.getByTestId('player-area');
    const handText = playerArea.textContent ?? '';
    expect(handText.includes('My Dragon') || handText.includes('My Knight')).toBe(true);
  });

  it('keeps the opponent masked even when playing custom cards', () => {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(customCards));
    render(createElement(App));

    fireEvent.click(screen.getByTestId('use-custom-cards'));
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));

    const opponentHtml = screen.getByTestId('opponent-area').outerHTML;
    for (const card of customCards) {
      expect(opponentHtml).not.toContain(card.kind);
      expect(opponentHtml).not.toContain(card.name);
    }
  });

  it('uses the saved format for the active-format summary and the deal', () => {
    const format = {
      name: 'My Format',
      deckSize: 8,
      openingHandSize: 3,
      copyLimit: 4,
      baseTotal: 20,
      startingEnergy: 0,
    };
    localStorage.setItem(FORMAT_KEY, JSON.stringify(format));
    render(createElement(App));

    const activeFormat = screen.getByTestId('active-format').textContent ?? '';
    expect(activeFormat).toContain('My Format');
    expect(activeFormat).toContain('deck 8');

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    expect(within(screen.getByTestId('player-area')).getByTestId('deck-count-p1').textContent).toBe(
      '5',
    );
  });
});
