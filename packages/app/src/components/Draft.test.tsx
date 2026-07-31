import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CardDefinition, GameFormat } from '@opencards/schema';
import { currentChoice, finalizeDecklist, pick, startDraft } from '@opencards/schema';
import { FOUNDRY_CARDS } from '@opencards/ember-foundry';
import { Draft } from './Draft.js';

const DECK_KEY = 'opencards.deck';

const tinyFormat: GameFormat = {
  name: 'Tiny Draft',
  deckSize: 3,
  openingHandSize: 3,
  copyLimit: 4,
  baseTotal: 20,
  startingEnergy: 1,
};

const pool: readonly CardDefinition[] = FOUNDRY_CARDS.filter((card) =>
  [
    'cinder-initiate',
    'spark-runner',
    'ashen-guard',
    'flame-squire',
    'mossling',
    'thorn-scout',
  ].includes(card.kind),
);

function cardName(kind: string): string {
  return pool.find((card) => card.kind === kind)?.name ?? kind;
}

/** Click the first offered option through all picks and return the resulting decklist. */
function driveToEnd(): string[] {
  let state = startDraft(1, tinyFormat, pool);
  for (let index = 0; index < tinyFormat.deckSize; index += 1) {
    const options = currentChoice(state)?.options ?? [];
    const kind = options[0]!;
    fireEvent.click(screen.getByTestId(`draft-pick-${kind}`));
    state = pick(state, kind).state;
  }
  return [...finalizeDecklist(state)];
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('@opencards/app Draft', () => {
  it('renders the pre-draft form with a seed input and start button', () => {
    render(<Draft format={tinyFormat} pool={pool} />);

    expect(screen.getByTestId('draft')).toBeTruthy();
    expect((screen.getByTestId('draft-seed') as HTMLInputElement).value).toBe('1');
    expect(screen.getByTestId('draft-start')).toBeTruthy();
    expect(screen.queryByTestId('draft-progress')).toBeNull();
  });

  it('starts a draft and renders the expected pick options as real cards', () => {
    render(<Draft format={tinyFormat} pool={pool} />);
    fireEvent.click(screen.getByTestId('draft-start'));

    expect(screen.getByTestId('draft-progress').textContent).toBe('Pick 1 of 3');

    const expected = currentChoice(startDraft(1, tinyFormat, pool))?.options ?? [];
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThanOrEqual(3);

    for (const kind of expected) {
      const option = screen.getByTestId(`draft-option-${kind}`);
      expect(option).toBeTruthy();
      expect(option.querySelector('svg')).not.toBeNull();
      expect(option.textContent).toContain(cardName(kind));
      expect(within(option).getByTestId(`draft-pick-${kind}`)).toBeTruthy();
    }
  });

  it('picking an option advances progress and shows a new set of options', () => {
    render(<Draft format={tinyFormat} pool={pool} />);
    fireEvent.click(screen.getByTestId('draft-start'));

    const firstChoice = currentChoice(startDraft(1, tinyFormat, pool))?.options ?? [];
    const firstKind = firstChoice[0]!;
    fireEvent.click(screen.getByTestId(`draft-pick-${firstKind}`));

    expect(screen.getByTestId('draft-progress').textContent).toBe('Pick 2 of 3');
    expect(screen.getByTestId('draft-picks').textContent).toContain(cardName(firstKind));

    const secondChoice =
      currentChoice(pick(startDraft(1, tinyFormat, pool), firstKind).state)?.options ?? [];
    expect(secondChoice.length).toBeGreaterThan(0);
    for (const kind of secondChoice) {
      expect(screen.getByTestId(`draft-option-${kind}`)).toBeTruthy();
    }
  });

  it('completes a full draft and shows the result, validity, and Save/Restart controls', () => {
    render(<Draft format={tinyFormat} pool={pool} />);
    fireEvent.click(screen.getByTestId('draft-start'));

    const decklist = driveToEnd();

    expect(screen.getByTestId('draft-result')).toBeTruthy();
    const counts = new Map<string, number>();
    for (const kind of decklist) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    for (const [kind, count] of counts) {
      expect(screen.getByTestId('draft-result').textContent).toContain(
        `${count}x ${cardName(kind)}`,
      );
    }

    expect(screen.getByTestId('draft-valid').getAttribute('data-status')).toBe('ok');
    expect(screen.getByTestId('draft-save')).toBeTruthy();
    expect(screen.getByTestId('draft-restart')).toBeTruthy();
    expect(screen.queryByTestId('draft-progress')).toBeNull();
  });

  it('Save as my deck persists to the same storage DeckEditor reads', () => {
    render(<Draft format={tinyFormat} pool={pool} />);
    fireEvent.click(screen.getByTestId('draft-start'));

    const decklist = driveToEnd();

    fireEvent.click(screen.getByTestId('draft-save'));

    expect(screen.getByTestId('draft-saved')).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem(DECK_KEY) ?? '[]') as string[];
    expect(stored).toEqual(decklist);
  });

  it('Draft again returns to the pre-draft form and a fresh draft can start', () => {
    render(<Draft format={tinyFormat} pool={pool} />);
    fireEvent.click(screen.getByTestId('draft-start'));

    driveToEnd();

    fireEvent.click(screen.getByTestId('draft-restart'));

    expect(screen.getByTestId('draft-seed')).toBeTruthy();
    expect(screen.queryByTestId('draft-result')).toBeNull();
    expect(screen.queryByTestId('draft-progress')).toBeNull();

    fireEvent.click(screen.getByTestId('draft-start'));
    expect(screen.getByTestId('draft-progress').textContent).toBe('Pick 1 of 3');
  });

  it('shows an exhausted message when the pool cannot fill the deck', () => {
    const format: GameFormat = {
      name: 'Too Big',
      deckSize: 2,
      openingHandSize: 2,
      copyLimit: 1,
      baseTotal: 20,
      startingEnergy: 1,
    };
    const oneCardPool: readonly CardDefinition[] = FOUNDRY_CARDS.filter(
      (card) => card.kind === 'cinder-initiate',
    );
    render(<Draft format={format} pool={oneCardPool} />);
    fireEvent.click(screen.getByTestId('draft-start'));

    const firstKind = currentChoice(startDraft(1, format, oneCardPool))!.options[0]!;
    fireEvent.click(screen.getByTestId(`draft-pick-${firstKind}`));

    expect(screen.getByTestId('draft-exhausted').textContent).toContain('No eligible cards remain');
  });
});
