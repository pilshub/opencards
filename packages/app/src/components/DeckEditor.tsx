import { useMemo, useState } from 'react';
import type { CardDefinition, GameFormat } from '@opencards/schema';
import {
  DEFAULT_FORMAT,
  hashDecklist,
  validateCardDatabase,
  validateDecklist,
  validateFormat,
} from '@opencards/schema';
import { Card } from './Card.js';

const CUSTOM_CARDS_KEY = 'opencards.customCards';
const DECK_KEY = 'opencards.deck';
const FORMAT_KEY = 'opencards.format';

type DeckEditorProps = {
  readonly builtinCards: readonly CardDefinition[];
  readonly defaultFormat?: GameFormat;
};

function loadSavedCards(): CardDefinition[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_CARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const result = validateCardDatabase(parsed);
    if (!result.ok) return [];
    return parsed.map((card) => normalizeCard(card as CardDefinition));
  } catch {
    return [];
  }
}

function loadSavedDeck(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DECK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((kind): kind is string => typeof kind === 'string');
  } catch {
    return [];
  }
}

function loadSavedFormat(defaultFormat: GameFormat): GameFormat {
  if (typeof window === 'undefined') return defaultFormat;
  try {
    const raw = localStorage.getItem(FORMAT_KEY);
    if (!raw) return defaultFormat;
    const parsed = JSON.parse(raw) as unknown;
    const result = validateFormat(parsed);
    if (!result.ok) return defaultFormat;
    return parsed as GameFormat;
  } catch {
    return defaultFormat;
  }
}

function persistCards(cards: readonly CardDefinition[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_CARDS_KEY, JSON.stringify(cards));
}

function persistDeck(decklist: readonly string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DECK_KEY, JSON.stringify(decklist));
}

function persistFormat(format: GameFormat): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FORMAT_KEY, JSON.stringify(format));
}

function mergeCards(
  builtinCards: readonly CardDefinition[],
  customCards: readonly CardDefinition[],
): CardDefinition[] {
  const merged = new Map<string, CardDefinition>();
  for (const card of builtinCards) {
    merged.set(card.kind, card);
  }
  for (const card of customCards) {
    merged.set(card.kind, card);
  }
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeCard(card: CardDefinition): CardDefinition {
  return { ...card, effects: Array.isArray(card.effects) ? card.effects : [] };
}

function parseImport(value: string): { readonly ok: true; readonly value: unknown } | null {
  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return null;
  }
}

function formatIssues(
  issues: readonly { readonly code: string; readonly message: string }[],
): string {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n');
}

export function DeckEditor({
  builtinCards,
  defaultFormat = DEFAULT_FORMAT,
}: DeckEditorProps): JSX.Element {
  const [customCards, setCustomCards] = useState<CardDefinition[]>(() => loadSavedCards());
  const [format, setFormat] = useState<GameFormat>(() => loadSavedFormat(defaultFormat));
  const [decklist, setDecklist] = useState<string[]>(() => loadSavedDeck());
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const availableCards = useMemo(
    () => mergeCards(builtinCards, customCards),
    [builtinCards, customCards],
  );
  const copyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const kind of decklist) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return counts;
  }, [decklist]);
  const validation = validateDecklist(decklist, { format, cards: availableCards });
  const deckHash = hashDecklist(decklist);

  function applyDecklist(nextDecklist: string[]): void {
    setDecklist(nextDecklist);
    persistDeck(nextDecklist);
    setImportError(null);
  }

  function addCopy(kind: string): void {
    const currentCopies = copyCounts.get(kind) ?? 0;
    if (decklist.length >= format.deckSize || currentCopies >= format.copyLimit) {
      return;
    }
    applyDecklist([...decklist, kind]);
  }

  function removeCopy(kind: string): void {
    const index = decklist.lastIndexOf(kind);
    if (index === -1) {
      return;
    }
    applyDecklist(decklist.filter((_, currentIndex) => currentIndex !== index));
  }

  function exportCards(): void {
    setExportText(JSON.stringify(customCards, null, 2));
    setImportError(null);
  }

  function exportDeck(): void {
    setExportText(JSON.stringify(decklist, null, 2));
    setImportError(null);
  }

  function exportFormat(): void {
    setExportText(JSON.stringify(format, null, 2));
    setImportError(null);
  }

  function importCards(): void {
    const parsed = parseImport(importText);
    if (!parsed) {
      setImportError('INVALID_JSON: import payload must be valid JSON');
      return;
    }

    const result = validateCardDatabase(parsed.value);
    if (!result.ok) {
      setImportError(formatIssues(result.issues));
      return;
    }

    const nextCards = (parsed.value as CardDefinition[]).map(normalizeCard);
    setCustomCards(nextCards);
    persistCards(nextCards);
    setImportError(null);
  }

  function importDeck(): void {
    const parsed = parseImport(importText);
    if (!parsed) {
      setImportError('INVALID_JSON: import payload must be valid JSON');
      return;
    }

    const result = validateDecklist(parsed.value, { format, cards: availableCards });
    if (!result.ok) {
      setImportError(formatIssues(result.issues));
      return;
    }

    applyDecklist(parsed.value as string[]);
  }

  function importFormat(): void {
    const parsed = parseImport(importText);
    if (!parsed) {
      setImportError('INVALID_JSON: import payload must be valid JSON');
      return;
    }

    const result = validateFormat(parsed.value);
    if (!result.ok) {
      setImportError(formatIssues(result.issues));
      return;
    }

    const nextFormat = parsed.value as GameFormat;
    setFormat(nextFormat);
    persistFormat(nextFormat);
    setImportError(null);
  }

  return (
    <div className="flex flex-col gap-6" data-testid="deck-editor">
      <section className="rounded border border-[color:var(--oc-border)] bg-zinc-900 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Deck editor</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {format.name} - {format.deckSize} cards, {format.copyLimit} copies per card
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span
              className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2"
              data-testid="deck-size"
            >
              {decklist.length}/{format.deckSize}
            </span>
            <span
              className={`rounded border px-3 py-2 ${
                validation.ok
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
                  : 'border-red-400/40 bg-red-500/15 text-red-100'
              }`}
              data-status={validation.ok ? 'ok' : 'invalid'}
              data-testid="deck-legality"
            >
              {validation.ok ? 'ok' : validation.issues.map((issue) => issue.code).join(', ')}
            </span>
            <span className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300">
              {deckHash}
            </span>
          </div>
        </div>
        {!validation.ok ? (
          <ul className="mt-3 rounded border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {validation.issues.map((issue) => (
              <li key={`${issue.code}-${issue.message}`}>
                <span className="font-mono text-xs text-red-400">{issue.code}</span> {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {availableCards.map((card) => {
          const copies = copyCounts.get(card.kind) ?? 0;
          const atCopyLimit = copies >= format.copyLimit;
          const deckFull = decklist.length >= format.deckSize;
          const overCopyLimit = copies > format.copyLimit;

          return (
            <article
              className="flex gap-3 rounded border border-[color:var(--oc-border)] bg-zinc-900 p-3"
              key={card.kind}
            >
              <div className="w-20 shrink-0">
                <Card kind={card.kind} name={card.name} type={card.type} cost={card.cost.energy} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div>
                  <h3 className="truncate text-sm font-semibold text-zinc-100">{card.name}</h3>
                  <p className="font-mono text-xs text-zinc-400">{card.kind}</p>
                </div>
                <p className="text-sm text-zinc-300" data-testid={`deck-copies-${card.kind}`}>
                  Copies: {copies}
                </p>
                {overCopyLimit ? (
                  <p className="text-xs text-red-200">Over copy limit</p>
                ) : atCopyLimit ? (
                  <p className="text-xs text-yellow-100">Copy limit reached</p>
                ) : null}
                <div className="mt-auto flex gap-2">
                  <button
                    className="rounded border border-[color:var(--oc-accent)] bg-[color:var(--oc-accent-soft)] px-3 py-2 text-sm font-semibold text-orange-100 hover:bg-orange-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`deck-add-${card.kind}`}
                    disabled={deckFull || atCopyLimit}
                    type="button"
                    onClick={() => addCopy(card.kind)}
                  >
                    Add
                  </button>
                  <button
                    className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`deck-remove-${card.kind}`}
                    disabled={copies === 0}
                    type="button"
                    onClick={() => removeCopy(card.kind)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 rounded border border-[color:var(--oc-border)] bg-zinc-900 p-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Export JSON</h2>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm hover:bg-zinc-800"
              data-testid="export-cards"
              type="button"
              onClick={exportCards}
            >
              Export cards
            </button>
            <button
              className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm hover:bg-zinc-800"
              data-testid="export-deck"
              type="button"
              onClick={exportDeck}
            >
              Export deck
            </button>
            <button
              className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm hover:bg-zinc-800"
              data-testid="export-format"
              type="button"
              onClick={exportFormat}
            >
              Export format
            </button>
          </div>
          <textarea
            aria-label="Exported JSON"
            className="min-h-44 rounded border border-[color:var(--oc-border)] bg-zinc-950 p-3 font-mono text-sm text-zinc-100"
            readOnly
            value={exportText}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Import JSON</h2>
          <textarea
            aria-label="Import JSON"
            className="min-h-44 rounded border border-[color:var(--oc-border)] bg-zinc-950 p-3 font-mono text-sm text-zinc-100"
            value={importText}
            onChange={(event) => {
              setImportText(event.currentTarget.value);
              setImportError(null);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm hover:bg-zinc-800"
              data-testid="import-cards"
              type="button"
              onClick={importCards}
            >
              Import cards
            </button>
            <button
              className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm hover:bg-zinc-800"
              data-testid="import-deck"
              type="button"
              onClick={importDeck}
            >
              Import deck
            </button>
            <button
              className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm hover:bg-zinc-800"
              data-testid="import-format"
              type="button"
              onClick={importFormat}
            >
              Import format
            </button>
          </div>
          {importError ? (
            <pre
              className="whitespace-pre-wrap rounded border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200"
              data-testid="import-error"
            >
              {importError}
            </pre>
          ) : null}
        </div>
      </section>
    </div>
  );
}
