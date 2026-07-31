import { useEffect, useState } from 'react';
import type { GameFormat } from '@opencards/schema';
import { DEFAULT_FORMAT, validateFormat } from '@opencards/schema';

const LS_KEY = 'opencards.format';

/** Load a saved GameFormat from localStorage. Falls back to DEFAULT_FORMAT if missing or corrupt. */
function loadSavedFormat(defaultFormat: GameFormat): GameFormat {
  if (typeof window === 'undefined') return defaultFormat;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultFormat;
    const parsed = JSON.parse(raw) as unknown;
    const result = validateFormat(parsed);
    if (!result.ok) return defaultFormat;
    return parsed as GameFormat;
  } catch {
    return defaultFormat;
  }
}

/** Persist a format to localStorage. */
function persistFormat(fmt: GameFormat): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEY, JSON.stringify(fmt));
}

export function FormatEditor({
  defaultFormat = DEFAULT_FORMAT,
}: {
  readonly defaultFormat?: GameFormat;
}): JSX.Element {
  const [name, setName] = useState(defaultFormat.name);
  const [deckSize, setDeckSize] = useState(defaultFormat.deckSize);
  const [openingHand, setOpeningHand] = useState(defaultFormat.openingHandSize);
  const [copyLimit, setCopyLimit] = useState(defaultFormat.copyLimit);
  const [baseTotal, setBaseTotal] = useState(defaultFormat.baseTotal);
  const [startingEnergy, setStartingEnergy] = useState(defaultFormat.startingEnergy);
  const [ruleset, setRuleset] = useState(defaultFormat.ruleset);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadSavedFormat(defaultFormat);
    setName(saved.name);
    setDeckSize(saved.deckSize);
    setOpeningHand(saved.openingHandSize);
    setCopyLimit(saved.copyLimit);
    setBaseTotal(saved.baseTotal);
    setStartingEnergy(saved.startingEnergy);
    setRuleset(saved.ruleset);
  }, [defaultFormat]);

  const current: unknown = {
    name,
    deckSize,
    openingHandSize: openingHand,
    copyLimit,
    baseTotal,
    startingEnergy,
    ...(ruleset === undefined ? {} : { ruleset }),
  };
  const validation = validateFormat(current);

  function handleSave(): void {
    if (!validation.ok) return;
    persistFormat(current as GameFormat);
  }

  return (
    <div className="flex flex-col gap-6" data-testid="format-editor">
      <section className="flex flex-col gap-4 rounded border border-[color:var(--oc-border)] bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">Game format</h2>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Format name
          <input
            className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
            type="text"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Deck size
          <input
            className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
            type="number"
            min={1}
            value={deckSize}
            onChange={(e) => setDeckSize(Number(e.currentTarget.value))}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Opening hand
          <input
            className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
            type="number"
            min={0}
            value={openingHand}
            onChange={(e) => setOpeningHand(Number(e.currentTarget.value))}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Copy limit
          <input
            className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
            type="number"
            min={1}
            value={copyLimit}
            onChange={(e) => setCopyLimit(Number(e.currentTarget.value))}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Base total
          <input
            className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
            type="number"
            min={1}
            value={baseTotal}
            onChange={(e) => setBaseTotal(Number(e.currentTarget.value))}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Starting energy
          <input
            className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
            type="number"
            min={0}
            value={startingEnergy}
            onChange={(e) => setStartingEnergy(Number(e.currentTarget.value))}
          />
        </label>

        <p className="text-xs text-zinc-400">
          Saving preserves the active phase order, board limits, energy progression, and fatigue
          rules.
        </p>

        {validation.ok ? (
          <p
            className="rounded bg-emerald-900/40 px-3 py-2 text-sm text-emerald-200"
            data-testid="format-valid"
          >
            Valid format
          </p>
        ) : (
          <ul
            className="rounded border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200"
            data-testid="format-issues"
          >
            {validation.issues.map((issue) => (
              <li key={`${issue.code}-${issue.message}`}>
                <span className="font-mono text-xs text-red-400">{issue.code}</span> {issue.message}
              </li>
            ))}
          </ul>
        )}

        <button
          className="rounded bg-[color:var(--oc-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="save-format"
          disabled={!validation.ok}
          type="button"
          onClick={handleSave}
        >
          Save format
        </button>
      </section>
    </div>
  );
}
