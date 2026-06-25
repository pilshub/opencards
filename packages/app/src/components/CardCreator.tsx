import { useEffect, useState } from 'react';
import type { CardDefinition, CardType, EffectDef } from '@opencards/schema';
import { TARGET_SELECTORS, validateCardDefinition } from '@opencards/schema';
import { V1_OPERATIONS } from '@opencards/effects';
import { Card } from './Card.js';

const LS_KEY = 'opencards.customCards';

/** Load saved cards from localStorage, ignoring corrupt/missing data. */
function loadSavedCards(): CardDefinition[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Defence in depth: only keep entries that pass the card-definition
    // validator, so a corrupt or hand-edited localStorage cannot break the
    // saved-card render (undefined kind -> broken key/testid).
    return parsed.filter((entry): entry is CardDefinition => validateCardDefinition(entry).ok);
  } catch {
    return [];
  }
}

/** Persist the full list to localStorage. */
function persistCards(cards: CardDefinition[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEY, JSON.stringify(cards));
}

type EffectRow = {
  readonly op: string;
  readonly amount: string; // string so the input can be blank
  readonly target: string; // '' means "— none —"
};

function defaultEffect(): EffectRow {
  return { op: V1_OPERATIONS[0], amount: '', target: '' };
}

export function CardCreator(): JSX.Element {
  // Form state
  const [kind, setKind] = useState('');
  const [name, setName] = useState('');
  const [cardType, setCardType] = useState<CardType>('unit');
  const [cost, setCost] = useState(1);
  const [attack, setAttack] = useState(1);
  const [health, setHealth] = useState(1);
  const [effects, setEffects] = useState<EffectRow[]>([]);

  // Saved cards
  const [savedCards, setSavedCards] = useState<CardDefinition[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    setSavedCards(loadSavedCards());
  }, []);

  // Build current definition from form state
  function buildDefinition(): unknown {
    const effectDefs: EffectDef[] = effects.map((row) => {
      const def: Record<string, unknown> = { op: row.op };
      if (row.amount.trim() !== '') {
        def['amount'] = Number(row.amount);
      }
      if (row.target !== '') {
        def['target'] = row.target;
      }
      return def as unknown as EffectDef;
    });

    const def: Record<string, unknown> = {
      kind,
      name,
      type: cardType,
      cost: { energy: cost },
      effects: effectDefs,
    };

    if (cardType === 'unit') {
      def['stats'] = { attack, health };
    }

    return def;
  }

  const currentDef = buildDefinition();
  const validation = validateCardDefinition(currentDef);

  function handleSave(): void {
    if (!validation.ok) return;
    const card = currentDef as CardDefinition;
    setSavedCards((prev) => {
      const updated = prev.some((c) => c.kind === card.kind)
        ? prev.map((c) => (c.kind === card.kind ? card : c))
        : [...prev, card];
      persistCards(updated);
      return updated;
    });
  }

  function handleDelete(targetKind: string): void {
    setSavedCards((prev) => {
      const updated = prev.filter((c) => c.kind !== targetKind);
      persistCards(updated);
      return updated;
    });
  }

  function addEffect(): void {
    setEffects((prev) => [...prev, defaultEffect()]);
  }

  function removeEffect(index: number): void {
    setEffects((prev) => prev.filter((_, i) => i !== index));
  }

  function updateEffect(index: number, patch: Partial<EffectRow>): void {
    setEffects((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="flex flex-col gap-6" data-testid="card-creator">
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Form */}
        <section className="flex flex-1 flex-col gap-4 rounded border border-[color:var(--oc-border)] bg-zinc-900 p-4">
          <h2 className="text-lg font-semibold">Card definition</h2>

          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            Kind
            <input
              className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
              type="text"
              value={kind}
              onChange={(e) => setKind(e.currentTarget.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            Name
            <input
              className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
              type="text"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            Type
            <select
              className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
              value={cardType}
              onChange={(e) => setCardType(e.currentTarget.value as CardType)}
            >
              <option value="unit">unit</option>
              <option value="tactic">tactic</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            Cost
            <input
              className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
              type="number"
              min={0}
              value={cost}
              onChange={(e) => setCost(Number(e.currentTarget.value))}
            />
          </label>

          {cardType === 'unit' ? (
            <>
              <label className="flex flex-col gap-1 text-sm text-zinc-300">
                Attack
                <input
                  className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
                  type="number"
                  min={0}
                  value={attack}
                  onChange={(e) => setAttack(Number(e.currentTarget.value))}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-zinc-300">
                Health
                <input
                  className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
                  type="number"
                  min={1}
                  value={health}
                  onChange={(e) => setHealth(Number(e.currentTarget.value))}
                />
              </label>
            </>
          ) : null}

          {/* Effects */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-300">Effects</span>
              <button
                className="rounded border border-[color:var(--oc-border)] px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                data-testid="add-effect"
                type="button"
                onClick={addEffect}
              >
                + Add effect
              </button>
            </div>
            {effects.map((row, index) => (
              <div
                className="flex flex-wrap items-center gap-2 rounded border border-[color:var(--oc-border)] bg-zinc-950 p-2"
                key={index}
              >
                <select
                  aria-label={`Effect ${String(index + 1)} op`}
                  className="rounded border border-[color:var(--oc-border)] bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                  value={row.op}
                  onChange={(e) => updateEffect(index, { op: e.currentTarget.value })}
                >
                  {V1_OPERATIONS.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-1 text-xs text-zinc-400">
                  Amount
                  <input
                    className="w-16 rounded border border-[color:var(--oc-border)] bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                    type="number"
                    min={0}
                    value={row.amount}
                    onChange={(e) => updateEffect(index, { amount: e.currentTarget.value })}
                  />
                </label>

                <label className="flex items-center gap-1 text-xs text-zinc-400">
                  Target
                  <select
                    className="rounded border border-[color:var(--oc-border)] bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                    value={row.target}
                    onChange={(e) => updateEffect(index, { target: e.currentTarget.value })}
                  >
                    <option value="">— none —</option>
                    {TARGET_SELECTORS.map((sel) => (
                      <option key={sel} value={sel}>
                        {sel}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="ml-auto rounded border border-red-800/60 px-2 py-1 text-xs text-red-300 hover:bg-red-950/50"
                  data-testid={`remove-effect-${String(index)}`}
                  type="button"
                  onClick={() => removeEffect(index)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {/* Validation */}
          {validation.ok ? (
            <p
              className="rounded bg-emerald-900/40 px-3 py-2 text-sm text-emerald-200"
              data-testid="validation-ok"
            >
              Valid card definition
            </p>
          ) : (
            <ul
              className="rounded border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200"
              data-testid="validation-issues"
            >
              {validation.issues.map((issue) => (
                <li key={`${issue.code}-${issue.message}`}>
                  <span className="font-mono text-xs text-red-400">{issue.code}</span>{' '}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}

          <button
            className="rounded bg-[color:var(--oc-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="save-card"
            disabled={!validation.ok}
            type="button"
            onClick={handleSave}
          >
            Save card
          </button>
        </section>

        {/* Preview */}
        <section
          className="flex flex-col items-center gap-4 rounded border border-[color:var(--oc-border)] bg-zinc-900 p-4"
          data-testid="creator-preview"
        >
          <h2 className="text-lg font-semibold">Preview</h2>
          <div className="w-32">
            <Card kind={kind || 'preview'} name={name} type={cardType} cost={cost} />
          </div>
          <p className="text-xs text-zinc-500">Updates as you type</p>
        </section>
      </div>

      {/* Saved cards */}
      <section className="rounded border border-[color:var(--oc-border)] bg-zinc-900 p-4">
        <h2 className="mb-4 text-lg font-semibold">Saved cards</h2>
        {savedCards.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No saved cards yet. Fill out the form and click Save card.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-4" data-testid="saved-cards">
            {savedCards.map((card) => (
              <li
                className="flex flex-col items-center gap-2 rounded border border-[color:var(--oc-border)] bg-zinc-950 p-3"
                data-testid={`saved-card-${card.kind}`}
                key={card.kind}
              >
                <div className="w-24">
                  <Card
                    kind={card.kind}
                    name={card.name}
                    type={card.type}
                    cost={card.cost.energy}
                  />
                </div>
                <span className="text-sm text-zinc-200">{card.name}</span>
                <button
                  className="rounded border border-red-800/60 px-2 py-1 text-xs text-red-300 hover:bg-red-950/50"
                  data-testid={`delete-card-${card.kind}`}
                  type="button"
                  onClick={() => handleDelete(card.kind)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
