import { useEffect, useMemo, useState } from 'react';
import type { AbilityDef, CardDefinition, CardType, EffectDef } from '@opencards/schema';
import { TARGET_SELECTORS, validateCardDefinition } from '@opencards/schema';
import { ABILITY_TRIGGERS, BUILTIN_KEYWORDS, V1_OPERATIONS } from '@opencards/effects';
import { Card } from './Card.js';

const LS_KEY = 'opencards.customCards';

type EditorMode = 'visual' | 'json';
type EffectRow = {
  readonly op: string;
  readonly amount: string;
  readonly target: string;
  readonly trigger: string;
  readonly params: string;
};

function loadSavedCards(): CardDefinition[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is CardDefinition => validateCardDefinition(entry).ok);
  } catch {
    return [];
  }
}

function persistCards(cards: readonly CardDefinition[]): void {
  if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify(cards));
}

function defaultEffect(): EffectRow {
  return { op: V1_OPERATIONS[0], amount: '', target: '', trigger: '', params: '' };
}

function parseExtraParams(value: string): Record<string, unknown> {
  if (value.trim() === '') return {};
  const parsed = JSON.parse(value) as unknown;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Extra parameters must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function rowToEffect(row: EffectRow): EffectDef {
  const effect: Record<string, unknown> = { op: row.op, ...parseExtraParams(row.params) };
  if (row.amount.trim() !== '') effect['amount'] = Number(row.amount);
  if (row.target !== '') effect['target'] = row.target;
  return effect as unknown as EffectDef;
}

export function CardCreator(): JSX.Element {
  const [mode, setMode] = useState<EditorMode>('visual');
  const [kind, setKind] = useState('');
  const [name, setName] = useState('');
  const [faction, setFaction] = useState('neutral');
  const [rulesText, setRulesText] = useState('');
  const [cardType, setCardType] = useState<CardType>('unit');
  const [cost, setCost] = useState(1);
  const [attack, setAttack] = useState(1);
  const [health, setHealth] = useState(1);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [effects, setEffects] = useState<EffectRow[]>([]);
  const [jsonInput, setJsonInput] = useState('');
  const [savedCards, setSavedCards] = useState<CardDefinition[]>([]);

  useEffect(() => setSavedCards(loadSavedCards()), []);

  function buildVisualDefinition(): unknown {
    try {
      const immediate: EffectDef[] = [];
      const grouped = new Map<string, EffectDef[]>();
      for (const row of effects) {
        const effect = rowToEffect(row);
        if (row.trigger === '') immediate.push(effect);
        else grouped.set(row.trigger, [...(grouped.get(row.trigger) ?? []), effect]);
      }
      const abilities: AbilityDef[] = [...grouped.entries()].map(([trigger, abilityEffects]) => ({
        trigger,
        effects: abilityEffects,
      }));
      return {
        kind,
        name,
        faction,
        text: rulesText,
        type: cardType,
        cost: { energy: cost },
        ...(cardType === 'unit' ? { stats: { attack, health } } : {}),
        effects: immediate,
        ...(keywords.length === 0 ? {} : { keywords }),
        ...(abilities.length === 0 ? {} : { abilities }),
      } satisfies Partial<CardDefinition>;
    } catch {
      return {
        kind,
        name,
        type: cardType,
        cost: { energy: cost },
        effects: [{ op: '__invalid_params__' }],
      };
    }
  }

  const visualDefinition = buildVisualDefinition();
  const parsedJson = useMemo(() => {
    if (mode !== 'json') return visualDefinition;
    try {
      return JSON.parse(jsonInput) as unknown;
    } catch {
      return null;
    }
  }, [jsonInput, mode, visualDefinition]);
  const currentDefinition = mode === 'visual' ? visualDefinition : parsedJson;
  const validation = validateCardDefinition(currentDefinition);

  function selectMode(nextMode: EditorMode): void {
    if (nextMode === 'json' && mode !== 'json') {
      setJsonInput(JSON.stringify(visualDefinition, null, 2));
    }
    setMode(nextMode);
  }

  function handleSave(): void {
    if (!validation.ok || currentDefinition === null) return;
    const card = currentDefinition as CardDefinition;
    setSavedCards((previous) => {
      const next = previous.some((candidate) => candidate.kind === card.kind)
        ? previous.map((candidate) => (candidate.kind === card.kind ? card : candidate))
        : [...previous, card];
      persistCards(next);
      return next;
    });
  }

  function handleDelete(targetKind: string): void {
    setSavedCards((previous) => {
      const next = previous.filter((card) => card.kind !== targetKind);
      persistCards(next);
      return next;
    });
  }

  function updateEffect(index: number, patch: Partial<EffectRow>): void {
    setEffects((previous) =>
      previous.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  function toggleKeyword(keyword: string): void {
    setKeywords((current) =>
      current.includes(keyword)
        ? current.filter((candidate) => candidate !== keyword)
        : [...current, keyword],
    );
  }

  return (
    <div className="grid gap-5" data-testid="card-creator">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-300">OpenCards Studio</p>
          <h2 className="mt-1 text-2xl font-semibold">Card and ability builder</h2>
        </div>
        <div
          className="flex rounded border border-white/10 bg-zinc-900 p-1"
          role="tablist"
          aria-label="Editor mode"
        >
          {(['visual', 'json'] as const).map((option) => (
            <button
              aria-selected={mode === option}
              className={`rounded px-3 py-2 text-sm font-semibold ${mode === option ? 'bg-emerald-400 text-zinc-950' : 'text-zinc-300 hover:bg-white/5'}`}
              data-testid={`editor-mode-${option}`}
              key={option}
              role="tab"
              type="button"
              onClick={() => selectMode(option)}
            >
              {option === 'visual' ? 'Visual' : 'JSON'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <section className="rounded border border-white/10 bg-zinc-900/80 p-4">
          {mode === 'json' ? (
            <div className="grid gap-3">
              <label className="grid gap-2 text-sm text-zinc-300">
                Advanced card JSON
                <textarea
                  className="min-h-[520px] w-full rounded border border-white/10 bg-zinc-950 p-4 font-mono text-sm leading-6 text-zinc-100"
                  data-testid="advanced-json"
                  spellCheck={false}
                  value={jsonInput}
                  onChange={(event) => setJsonInput(event.currentTarget.value)}
                />
              </label>
              <p className="text-xs text-zinc-400">
                Supports nested conditions, choice options, secrets, attachments, zones, status, and
                custom parameters.
              </p>
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Kind">
                  <input
                    className="oc-input"
                    value={kind}
                    onChange={(event) => setKind(event.currentTarget.value)}
                  />
                </Field>
                <Field label="Name">
                  <input
                    className="oc-input"
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                  />
                </Field>
                <Field label="Faction">
                  <input
                    className="oc-input"
                    value={faction}
                    onChange={(event) => setFaction(event.currentTarget.value)}
                  />
                </Field>
                <Field label="Type">
                  <select
                    className="oc-input"
                    value={cardType}
                    onChange={(event) => setCardType(event.currentTarget.value as CardType)}
                  >
                    <option value="unit">unit</option>
                    <option value="tactic">tactic</option>
                  </select>
                </Field>
                <NumberField label="Cost" min={0} value={cost} onChange={setCost} />
                {cardType === 'unit' ? (
                  <NumberField label="Attack" min={0} value={attack} onChange={setAttack} />
                ) : null}
                {cardType === 'unit' ? (
                  <NumberField label="Health" min={1} value={health} onChange={setHealth} />
                ) : null}
              </div>

              <Field label="Rules text">
                <textarea
                  className="oc-input min-h-20"
                  value={rulesText}
                  onChange={(event) => setRulesText(event.currentTarget.value)}
                />
              </Field>

              {cardType === 'unit' ? (
                <fieldset className="grid gap-2">
                  <legend className="text-sm font-semibold text-zinc-300">Keywords</legend>
                  <div className="flex flex-wrap gap-2">
                    {BUILTIN_KEYWORDS.map((keyword) => (
                      <label
                        className={`rounded border px-3 py-2 text-sm ${keywords.includes(keyword) ? 'border-emerald-300 bg-emerald-400/15 text-emerald-100' : 'border-white/10 text-zinc-400'}`}
                        key={keyword}
                      >
                        <input
                          className="sr-only"
                          checked={keywords.includes(keyword)}
                          type="checkbox"
                          onChange={() => toggleKeyword(keyword)}
                        />
                        {keyword}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-zinc-300">
                    Effects and triggered abilities
                  </h3>
                  <button
                    className="rounded border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
                    data-testid="add-effect"
                    type="button"
                    onClick={() => setEffects((current) => [...current, defaultEffect()])}
                  >
                    Add effect
                  </button>
                </div>
                {effects.length === 0 ? (
                  <p className="rounded border border-dashed border-white/10 p-4 text-sm text-zinc-400">
                    No effects.
                  </p>
                ) : null}
                {effects.map((row, index) => (
                  <div
                    className="grid gap-2 rounded border border-white/10 bg-zinc-950/70 p-3 lg:grid-cols-[150px_1fr_100px_150px_minmax(180px,1fr)_auto]"
                    key={index}
                  >
                    <select
                      aria-label={`Effect ${String(index + 1)} trigger`}
                      className="oc-input"
                      value={row.trigger}
                      onChange={(event) =>
                        updateEffect(index, { trigger: event.currentTarget.value })
                      }
                    >
                      <option value="">Immediate</option>
                      {ABILITY_TRIGGERS.map((trigger) => (
                        <option key={trigger} value={trigger}>
                          {trigger}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Effect ${String(index + 1)} op`}
                      className="oc-input"
                      value={row.op}
                      onChange={(event) => updateEffect(index, { op: event.currentTarget.value })}
                    >
                      {V1_OPERATIONS.map((operation) => (
                        <option key={operation} value={operation}>
                          {operation}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Effect ${String(index + 1)} amount`}
                      className="oc-input"
                      placeholder="Amount"
                      type="number"
                      value={row.amount}
                      onChange={(event) =>
                        updateEffect(index, { amount: event.currentTarget.value })
                      }
                    />
                    <select
                      aria-label={`Effect ${String(index + 1)} target`}
                      className="oc-input"
                      value={row.target}
                      onChange={(event) =>
                        updateEffect(index, { target: event.currentTarget.value })
                      }
                    >
                      <option value="">No target</option>
                      {TARGET_SELECTORS.map((selector) => (
                        <option key={selector} value={selector}>
                          {selector}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Effect ${String(index + 1)} extra parameters`}
                      className="oc-input font-mono text-xs"
                      placeholder='Extra JSON: {"status":"frozen"}'
                      value={row.params}
                      onChange={(event) =>
                        updateEffect(index, { params: event.currentTarget.value })
                      }
                    />
                    <button
                      className="rounded border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
                      data-testid={`remove-effect-${String(index)}`}
                      type="button"
                      onClick={() =>
                        setEffects((current) => current.filter((_, rowIndex) => rowIndex !== index))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {validation.ok ? (
            <p
              className="mt-4 rounded border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
              data-testid="validation-ok"
            >
              Valid card definition
            </p>
          ) : (
            <ul
              className="mt-4 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200"
              data-testid="validation-issues"
            >
              {validation.issues.map((issue) => (
                <li key={`${issue.code}-${issue.message}`}>
                  <span className="font-mono text-xs">{issue.code}</span> {issue.message}
                </li>
              ))}
            </ul>
          )}
          <button
            className="mt-4 rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
            data-testid="save-card"
            disabled={!validation.ok}
            type="button"
            onClick={handleSave}
          >
            Save card
          </button>
        </section>

        <aside
          className="flex flex-col items-center gap-4 rounded border border-white/10 bg-zinc-900/80 p-4"
          data-testid="creator-preview"
        >
          <h2 className="text-sm font-semibold text-zinc-300">Live preview</h2>
          <div className="w-32">
            <Card kind={kind || 'preview'} name={name} type={cardType} cost={cost} />
          </div>
          <pre className="max-h-64 w-full overflow-auto rounded bg-black/40 p-3 text-xs text-zinc-400">
            {JSON.stringify(currentDefinition, null, 2)}
          </pre>
        </aside>
      </div>

      <section className="rounded border border-white/10 bg-zinc-900/80 p-4">
        <h2 className="mb-4 text-lg font-semibold">Saved cards</h2>
        {savedCards.length === 0 ? (
          <p className="text-sm text-zinc-400">No saved cards.</p>
        ) : (
          <ul className="flex flex-wrap gap-4" data-testid="saved-cards">
            {savedCards.map((card) => (
              <li
                className="flex flex-col items-center gap-2 rounded border border-white/10 bg-zinc-950 p-3"
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
                <span className="text-sm">{card.name}</span>
                <button
                  className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-200"
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

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="grid gap-1 text-sm text-zinc-300">
      {label}
      {children}
    </label>
  );
}

function NumberField({
  label,
  min,
  value,
  onChange,
}: {
  readonly label: string;
  readonly min: number;
  readonly value: number;
  readonly onChange: (value: number) => void;
}): JSX.Element {
  return (
    <Field label={label}>
      <input
        className="oc-input"
        min={min}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </Field>
  );
}
