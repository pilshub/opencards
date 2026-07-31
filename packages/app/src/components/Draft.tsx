import { useState } from 'react';
import type { CardKind } from '@opencards/core';
import type { CardDefinition, GameFormat } from '@opencards/schema';
import {
  currentChoice,
  finalizeDecklist,
  isDraftComplete,
  pick,
  startDraft,
  validateDecklist,
  type DraftState,
} from '@opencards/schema';
import { Card } from './Card.js';
import { persistDeck } from './DeckEditor.js';

type DraftProps = {
  readonly format: GameFormat;
  readonly pool: readonly CardDefinition[];
};

type DraftUi =
  | { readonly status: 'form' }
  | { readonly status: 'active'; readonly state: DraftState; readonly error: string | null }
  | { readonly status: 'complete'; readonly state: DraftState; readonly saved: boolean };

export function Draft({ format, pool }: DraftProps): JSX.Element {
  const [seed, setSeed] = useState(1);
  const [ui, setUi] = useState<DraftUi>({ status: 'form' });

  function handleStart(): void {
    setUi({ status: 'active', state: startDraft(seed, format, pool), error: null });
  }

  function handlePick(kind: CardKind): void {
    if (ui.status !== 'active') {
      return;
    }
    const result = pick(ui.state, kind);
    if (result.issues.length > 0) {
      setUi({
        status: 'active',
        state: ui.state,
        error: result.issues.map((issue) => issue.message).join('; '),
      });
      return;
    }
    setUi(
      isDraftComplete(result.state)
        ? { status: 'complete', state: result.state, saved: false }
        : { status: 'active', state: result.state, error: null },
    );
  }

  function handleSave(): void {
    if (ui.status !== 'complete') {
      return;
    }
    persistDeck(finalizeDecklist(ui.state));
    setUi({ status: 'complete', state: ui.state, saved: true });
  }

  function handleRestart(): void {
    setUi({ status: 'form' });
  }

  if (ui.status === 'form') {
    return (
      <section className="flex flex-col gap-6" data-testid="draft">
        <div>
          <h2 className="text-lg font-semibold">Draft a deck</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Pick one of three cards each round until your deck is full.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex max-w-36 flex-col gap-1 text-sm text-zinc-300">
            Seed
            <input
              className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
              data-testid="draft-seed"
              type="number"
              value={seed}
              onChange={(event) => setSeed(Number(event.currentTarget.value))}
            />
          </label>
          <button
            className="rounded bg-[color:var(--oc-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 hover:brightness-110"
            data-testid="draft-start"
            type="button"
            onClick={handleStart}
          >
            Start Draft
          </button>
        </div>
      </section>
    );
  }

  if (ui.status === 'complete') {
    const decklist = finalizeDecklist(ui.state);
    const validation = validateDecklist(decklist, { format, cards: pool });
    const counts = new Map<string, number>();
    for (const kind of decklist) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }

    return (
      <section className="flex flex-col gap-6" data-testid="draft">
        <div>
          <h2 className="text-lg font-semibold">Draft complete</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {format.deckSize} cards picked. Review, save, or draft again.
          </p>
        </div>
        <ul className="grid gap-2" data-testid="draft-result">
          {[...counts.entries()].map(([kind, count]) => (
            <li
              className="rounded border border-[color:var(--oc-border)] bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              key={kind}
            >
              {count}x {cardName(pool, kind)}
            </li>
          ))}
        </ul>
        {validation.ok ? (
          <p
            className="inline-flex w-fit rounded border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100"
            data-status="ok"
            data-testid="draft-valid"
          >
            Valid deck ✓
          </p>
        ) : (
          <div
            className="rounded border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-100"
            data-status="invalid"
            data-testid="draft-valid"
          >
            {validation.issues.map((issue) => (
              <p key={`${issue.code}-${issue.message}`}>
                {issue.code}: {issue.message}
              </p>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded bg-[color:var(--oc-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 hover:brightness-110"
            data-testid="draft-save"
            type="button"
            onClick={handleSave}
          >
            Save as my deck
          </button>
          <button
            className="rounded border border-[color:var(--oc-border)] px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
            data-testid="draft-restart"
            type="button"
            onClick={handleRestart}
          >
            Draft again
          </button>
        </div>
        {ui.saved ? (
          <p className="text-sm text-emerald-200" data-testid="draft-saved">
            Saved to your deck
          </p>
        ) : null}
      </section>
    );
  }

  const choice = currentChoice(ui.state);

  return (
    <section className="flex flex-col gap-6" data-testid="draft">
      <div>
        <h2 className="text-lg font-semibold">Draft a deck</h2>
        <p className="mt-1 text-sm text-zinc-400" data-testid="draft-progress">
          Pick {ui.state.picks.length + 1} of {format.deckSize}
        </p>
      </div>
      {choice === null ? (
        <p className="text-sm text-red-200" data-testid="draft-error">
          The draft is not ready to pick.
        </p>
      ) : choice.options.length === 0 ? (
        <p
          className="rounded border border-yellow-500/40 bg-yellow-950/40 p-3 text-sm text-yellow-100"
          data-testid="draft-exhausted"
        >
          No eligible cards remain — cannot complete this draft with the current pool/format
        </p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {choice.options.map((kind) => {
            const def = pool.find((card) => card.kind === kind);
            return (
              <article
                className="w-28 rounded border border-[color:var(--oc-border)] bg-zinc-900 p-2"
                data-testid={`draft-option-${kind}`}
                key={kind}
              >
                <Card kind={kind} name={def?.name} type={def?.type} cost={def?.cost.energy} />
                <button
                  className="mt-2 w-full rounded border border-[color:var(--oc-accent)] bg-[color:var(--oc-accent-soft)] px-2 py-1 text-xs font-semibold text-orange-100 hover:bg-orange-500/25"
                  data-testid={`draft-pick-${kind}`}
                  type="button"
                  onClick={() => handlePick(kind)}
                >
                  Pick
                </button>
              </article>
            );
          })}
        </div>
      )}
      {ui.error ? (
        <p className="text-sm text-red-200" data-testid="draft-error">
          {ui.error}
        </p>
      ) : null}
      <div
        className="rounded border border-[color:var(--oc-border)] bg-zinc-900 p-3"
        data-testid="draft-picks"
      >
        <h3 className="text-sm font-semibold text-zinc-100">Picks so far</h3>
        {ui.state.picks.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-400">No picks yet</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-2 text-sm text-zinc-300">
            {ui.state.picks.map((kind, index) => (
              <li className="rounded bg-zinc-800 px-2 py-1" key={`${kind}-${index}`}>
                {cardName(pool, kind)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function cardName(pool: readonly CardDefinition[], kind: string): string {
  return pool.find((card) => card.kind === kind)?.name ?? kind;
}
