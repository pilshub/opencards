import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LayoutGroup, MotionConfig, motion } from 'framer-motion';
import type {
  CardInstanceId,
  CardKind,
  CardSpec,
  Command,
  PlayerId,
  PlayerView,
  ReplayEnvelopeV1,
  SetupOpts,
  StackItem,
  ValidationIssue,
  ViewerHandle,
} from '@opencards/core';
import {
  applyCommand,
  hashState,
  legalCommands,
  replayEnvelope,
  startMatch,
  viewMatch,
} from '@opencards/core';
import type { CardDefinition, GameFormat } from '@opencards/schema';
import {
  cardDefinitionToSpec,
  validateCardDefinition,
  validateDecklist,
  validateFormat,
} from '@opencards/schema';
import {
  FOUNDRY_CARDS,
  FOUNDRY_FORMAT,
  FOUNDRY_TUTORIALS,
  createFoundrySetup,
  createFoundryTutorialSetup,
  type FoundryTutorial,
  type FoundryTutorialId,
} from '@opencards/ember-foundry';
import { chooseBotCommand } from '@opencards/ai';
import { Card } from './components/Card.js';
import { CardCreator } from './components/CardCreator.js';
import { DeckEditor } from './components/DeckEditor.js';
import { Draft } from './components/Draft.js';
import { FormatEditor } from './components/FormatEditor.js';
import { OnlinePlay } from './components/OnlinePlay.js';

// ── Built-in card definitions ───────────────────────────────────────────────

export const BUILTIN_DEFINITIONS: Record<string, CardDefinition> = Object.fromEntries(
  FOUNDRY_CARDS.map((card) => [card.kind, card]),
);

const CUSTOM_CARDS_KEY = 'opencards.customCards';
const DECK_KEY = 'opencards.deck';
const FORMAT_KEY = 'opencards.format';

/** Load and validate custom cards from localStorage. */
function loadCustomCards(): CardDefinition[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_CARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is CardDefinition => validateCardDefinition(entry).ok);
  } catch {
    return [];
  }
}

/** Load validated format from localStorage, falling back to Foundry. */
function loadFormat(): GameFormat {
  if (typeof window === 'undefined') return FOUNDRY_FORMAT;
  try {
    const raw = localStorage.getItem(FORMAT_KEY);
    if (!raw) return FOUNDRY_FORMAT;
    const parsed = JSON.parse(raw) as unknown;
    const result = validateFormat(parsed);
    if (!result.ok) return FOUNDRY_FORMAT;
    return parsed as GameFormat;
  } catch {
    return FOUNDRY_FORMAT;
  }
}

/** Load a saved decklist only when it is valid for the active format and card pool. */
function loadDecklist(format: GameFormat, cards: readonly CardDefinition[]): CardKind[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DECK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const result = validateDecklist(parsed, { format, cards });
    if (!result.ok || !Array.isArray(parsed)) return null;
    return parsed as CardKind[];
  } catch {
    return null;
  }
}

function mergeCardDefinitions(customCards: readonly CardDefinition[]): CardDefinition[] {
  const registry = new Map<string, CardDefinition>(Object.entries(BUILTIN_DEFINITIONS));
  for (const def of customCards) {
    registry.set(def.kind, def);
  }
  return [...registry.values()];
}

/**
 * Build a kind→definition map for the VIEWER's own cards only.
 * Builtins are always present; custom cards override on kind clash when useCustom is true.
 */
export function buildCardRegistry(useCustom: boolean): Map<string, CardDefinition> {
  const registry = new Map<string, CardDefinition>(Object.entries(BUILTIN_DEFINITIONS));
  if (useCustom) {
    for (const def of loadCustomCards()) {
      registry.set(def.kind, def);
    }
  }
  return registry;
}

type AppView = 'play' | 'deck' | 'create' | 'rules' | 'online' | 'draft';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const players = [p1, p2] as const;

type MatchState = {
  readonly handles: Record<PlayerId, ViewerHandle>;
  readonly p1View: PlayerView;
  readonly p2View: PlayerView;
  readonly seed: number;
  readonly setupOpts: SetupOpts;
  readonly commands: readonly Command[];
};

type SetupFactory = (seed: number) => SetupOpts;

export type AppProps = {
  readonly defaultSetup?: SetupFactory;
  readonly matchLogLimit?: number;
};

type ReplayState =
  | { readonly status: 'idle' }
  | { readonly status: 'error'; readonly message: string }
  | {
      readonly status: 'verified';
      readonly ok: boolean;
      readonly hash: string;
      readonly expected: string;
      readonly issues: readonly ValidationIssue[];
    };

type PasteValidationState =
  | { readonly status: 'invalid-json'; readonly message: string }
  | { readonly status: 'missing-fields'; readonly message: string }
  | { readonly status: 'valid-shape'; readonly message: string };

type PlayCardCommand = Extract<Command, { readonly type: 'playCard' }>;
type AttackCommand = Extract<Command, { readonly type: 'attack' }>;
type ChooseTargetCommand = Extract<Command, { readonly type: 'chooseTarget' }>;
type ResolveStackCommand = Extract<Command, { readonly type: 'resolveStack' }>;
export type TargetCommand = AttackCommand | ChooseTargetCommand;

type TargetCommandDraft =
  | {
      readonly type: 'attack';
      readonly player: PlayerId;
      readonly attacker: CardInstanceId;
    }
  | {
      readonly type: 'chooseTarget';
      readonly player: PlayerId;
      readonly source: CardInstanceId;
    };

export type TargetingState =
  | { readonly status: 'idle' }
  | { readonly status: 'awaitingTarget'; readonly draft: TargetCommandDraft }
  | { readonly status: 'confirming'; readonly command: TargetCommand };

type GuidedTutorialStage =
  | 'intro'
  | 'draw'
  | 'go-main'
  | 'play-unit'
  | 'go-combat'
  | 'select-attacker'
  | 'attack-base'
  | 'victory';

type CommandEvent =
  | { readonly type: 'cardDrawn'; readonly player: PlayerId }
  | { readonly type: 'phaseAdvanced'; readonly player: PlayerId }
  | { readonly type: 'turnEnded'; readonly player: PlayerId }
  | { readonly type: 'cardPlayed'; readonly player: PlayerId }
  | {
      readonly type: 'targetChosen';
      readonly player: PlayerId;
      readonly target: CardInstanceId | 'base';
    }
  | { readonly type: 'stackResolved'; readonly player: PlayerId }
  | { readonly type: 'choiceMade'; readonly player: PlayerId; readonly option: number }
  | {
      readonly type: 'attackDeclared';
      readonly player: PlayerId;
      readonly target: CardInstanceId | 'base';
    };

type EventLogEntry = {
  readonly index: number;
  readonly commandIndex: number;
  readonly event: CommandEvent;
};

type ReplayArtifacts = {
  readonly events: readonly EventLogEntry[];
  readonly hash: string;
  readonly issues: readonly ValidationIssue[];
};

export default function App({ defaultSetup, matchLogLimit }: AppProps = {}): JSX.Element {
  const [appView, setAppView] = useState<AppView>('play');
  const [seed, setSeed] = useState(42);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [viewer, setViewer] = useState<PlayerId>(p1);
  const [errors, setErrors] = useState<Record<string, readonly ValidationIssue[]>>({});
  const [replayInput, setReplayInput] = useState('');
  const [replay, setReplay] = useState<ReplayState>({ status: 'idle' });
  const [pasteValidation, setPasteValidation] = useState<PasteValidationState | null>(null);
  const [exportedEnvelope, setExportedEnvelope] = useState<string | null>(null);
  const [exportMeta, setExportMeta] = useState<{
    readonly timestamp: string;
    readonly commandCount: number;
    readonly seed: number;
  } | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [pasteStatus, setPasteStatus] = useState<'idle' | 'pasted' | 'failed' | 'unavailable'>(
    'idle',
  );
  const [useCustomCards, setUseCustomCards] = useState(false);
  const [botEnabled, setBotEnabled] = useState(true);
  const [tutorial, setTutorial] = useState<FoundryTutorial | null>(null);
  const [guidedTutorial, setGuidedTutorial] = useState(false);
  const [guidedIntroComplete, setGuidedIntroComplete] = useState(false);
  const [targeting, setTargeting] = useState<TargetingState>({ status: 'idle' });
  const exportedEnvelopeRef = useRef<HTMLTextAreaElement | null>(null);
  const replayArtifacts = useMemo<ReplayArtifacts | null>(
    () => (match ? deriveReplayArtifacts(match) : null),
    [match],
  );
  const hashMatch = useMemo<'match' | 'mismatch'>(
    () => (match && replayArtifacts ? deriveHashMatch(match, replayArtifacts.hash) : 'match'),
    [match, replayArtifacts],
  );
  const currentHash = replayArtifacts?.hash ?? 'no match';
  const rawLimit = matchLogLimit ?? 50;
  const logLimit = Number.isFinite(rawLimit) ? Math.max(1, rawLimit) : 50;

  const activeFormat = loadFormat();
  const savedCustomCards = loadCustomCards();
  const hasCustomCards = savedCustomCards.length > 0;
  const viewerLegalCommands = useMemo<readonly Command[]>(
    () => (match ? legalCommands(match.handles[viewer]!) : []),
    [match, viewer],
  );
  const guidedStage = useMemo<GuidedTutorialStage | null>(
    () =>
      guidedTutorial && match
        ? deriveGuidedTutorialStage(match, targeting, guidedIntroComplete)
        : null,
    [guidedIntroComplete, guidedTutorial, match, targeting],
  );
  const visibleLegalCommands = useMemo<readonly Command[]>(
    () => filterCommandsForGuide(viewerLegalCommands, guidedStage, match),
    [guidedStage, match, viewerLegalCommands],
  );

  function startNewGame(): void {
    const currentFormat = loadFormat();
    const currentCustomCards = loadCustomCards();
    const savedDecklist = loadDecklist(currentFormat, mergeCardDefinitions(currentCustomCards));
    const setupOpts = defaultSetup
      ? defaultSetup(seed)
      : buildSetupFromFormat(seed, {
          customCards: useCustomCards && currentCustomCards.length > 0 ? currentCustomCards : null,
          decklist: savedDecklist,
        });
    const started = startMatch(setupOpts);
    setMatch(project(started.handles, seed, setupOpts, []));
    setErrors({});
    setReplay({ status: 'idle' });
    setPasteValidation(null);
    setExportedEnvelope(null);
    setExportMeta(null);
    setCopyStatus('idle');
    setPasteStatus('idle');
    setTargeting({ status: 'idle' });
    setTutorial(null);
    setGuidedTutorial(false);
    setGuidedIntroComplete(false);
  }

  function startTutorial(nextTutorial: FoundryTutorial): void {
    const isGuided = nextTutorial.id === 'first-turn';
    const setupOpts = createFoundryTutorialSetup(nextTutorial.id, players);
    const started = startMatch(setupOpts);
    setSeed(nextTutorial.seed);
    setTutorial(nextTutorial);
    setBotEnabled(!isGuided);
    setGuidedTutorial(isGuided);
    setGuidedIntroComplete(false);
    setViewer(p1);
    setMatch(project(started.handles, nextTutorial.seed, setupOpts, []));
    setErrors({});
    setTargeting({ status: 'idle' });
  }

  function startGuidedTutorial(): void {
    const lesson = FOUNDRY_TUTORIALS.find((candidate) => candidate.id === 'first-turn');
    if (lesson !== undefined) {
      startTutorial(lesson);
    }
  }

  function resetGame(): void {
    setMatch(null);
    setErrors({});
    setReplay({ status: 'idle' });
    setPasteValidation(null);
    setExportedEnvelope(null);
    setExportMeta(null);
    setCopyStatus('idle');
    setPasteStatus('idle');
    setTargeting({ status: 'idle' });
    setTutorial(null);
    setGuidedTutorial(false);
    setGuidedIntroComplete(false);
  }

  function applyPlayerCommand(command: Command): void {
    if (!match) {
      return;
    }

    if (!isCommandAllowedByGuide(guidedStage, command, match)) {
      return;
    }

    if (!hasLegalCommand(legalCommands(match.handles[command.player]!), command)) {
      return;
    }

    const result = applyCommand(match.handles[command.player]!, command);
    const acceptedCommands =
      result.issues.length === 0 ? [...match.commands, command] : match.commands;
    const nextMatch = project(match.handles, match.seed, match.setupOpts, acceptedCommands);
    setMatch(nextMatch);
    setErrors((current) => ({ ...current, [command.player]: result.issues }));
    setTargeting(
      result.issues.length === 0 && nextMatch.p1View.winner === null
        ? nextTargetingAfterCommand(nextMatch, command)
        : { status: 'idle' },
    );
  }

  useEffect(() => {
    if (!match || !botEnabled || match.p1View.winner !== null || match.p1View.activePlayer !== p2) {
      return;
    }
    const timer = window.setTimeout(() => {
      const command = chooseBotCommand(match.handles[p2]!, match.p2View, 'control');
      if (command !== null) {
        applyPlayerCommand(command);
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [botEnabled, match]);

  function drawCard(player: PlayerId): void {
    applyFirstLegalCommand(player, (command) => command.type === 'drawCard');
  }

  function applyFirstLegalCommand(
    player: PlayerId,
    predicate: (command: Command) => boolean,
  ): void {
    if (!match) {
      return;
    }

    const command = legalCommands(match.handles[player]!).find(predicate);
    if (command !== undefined) {
      applyPlayerCommand(command);
    }
  }

  function flipViewer(): void {
    setTargeting({ status: 'idle' });
    setViewer((current) => (current === p1 ? p2 : p1));
  }

  function selectViewer(player: PlayerId): void {
    setTargeting({ status: 'idle' });
    setViewer(player);
  }

  function onSelectAttacker(instanceId: CardInstanceId): void {
    if (!match) {
      return;
    }

    if (guidedStage !== null && guidedStage !== 'select-attacker') {
      return;
    }

    const legal = legalCommands(match.handles[viewer]!);
    if (!legal.some((command) => command.type === 'attack' && command.attacker === instanceId)) {
      return;
    }

    setTargeting({
      status: 'awaitingTarget',
      draft: { type: 'attack', player: viewer, attacker: instanceId },
    });
  }

  function onTargetCommand(command: TargetCommand): void {
    setTargeting({ status: 'confirming', command });
    applyPlayerCommand(command);
  }

  function onCancelTargeting(): void {
    setTargeting({ status: 'idle' });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (isShortcutTarget(event.target)) {
        return;
      }

      if (event.key === 'n' || event.key === 'N') {
        startNewGame();
        return;
      }

      if (event.key === 'r' || event.key === 'R') {
        resetGame();
        return;
      }

      if (event.key === 'v' || event.key === 'V') {
        flipViewer();
        return;
      }

      if (event.key === '1' && match && match.p1View.viewer.deck.length > 0) {
        drawCard(p1);
        return;
      }

      if (event.key === '2' && match && match.p2View.viewer.deck.length > 0) {
        drawCard(p2);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  function verifyReplay(): void {
    try {
      const envelope = JSON.parse(replayInput) as ReplayEnvelopeV1;
      const result = replayEnvelope(envelope);
      setReplay({
        status: 'verified',
        ok: result.ok,
        hash: result.hash,
        expected: result.expected,
        issues: result.issues,
      });
    } catch (error) {
      setReplay({
        status: 'error',
        message: error instanceof Error ? error.message : 'Replay JSON could not be verified.',
      });
    }
  }

  function exportEnvelope(): void {
    if (!match) {
      return;
    }

    const draft: ReplayEnvelopeV1 = {
      schemaVersion: '0.1.0',
      seed: match.seed,
      setupOpts: match.setupOpts,
      commands: match.commands,
      finalStateHash: '',
    };
    const result = replayEnvelope(draft);
    const envelope: ReplayEnvelopeV1 = { ...draft, finalStateHash: result.hash };
    setExportedEnvelope(JSON.stringify(envelope, null, 2));
    setExportMeta({
      timestamp: new Date().toLocaleTimeString(),
      commandCount: match.commands.length,
      seed: match.seed,
    });
    setCopyStatus('idle');
  }

  function clearExportedEnvelope(): void {
    setExportedEnvelope(null);
    setExportMeta(null);
    setCopyStatus('idle');
  }

  async function pasteReplayFromClipboard(): Promise<void> {
    if (!navigator.clipboard?.readText) {
      setPasteStatus('unavailable');
      setPasteValidation(null);
      window.setTimeout(() => setPasteStatus('idle'), 4000);
      return;
    }

    try {
      const pasted = await navigator.clipboard.readText();
      setReplayInput(pasted);
      setReplay({ status: 'idle' });
      setPasteValidation(validatePastedEnvelopeShape(pasted));
      setPasteStatus('pasted');
      window.setTimeout(() => setPasteStatus('idle'), 2000);
    } catch {
      setPasteStatus('failed');
      setPasteValidation(null);
      window.setTimeout(() => setPasteStatus('idle'), 4000);
    }
  }

  async function copyEnvelope(): Promise<void> {
    if (!exportedEnvelope) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard write unavailable.');
      }

      await navigator.clipboard.writeText(exportedEnvelope);
      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      exportedEnvelopeRef.current?.focus();
      exportedEnvelopeRef.current?.select();
      setCopyStatus('failed');
      window.setTimeout(() => setCopyStatus('idle'), 4000);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="oc-app-shell min-h-screen px-3 py-3 text-zinc-100 sm:px-5 lg:px-7">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
          <header className="oc-topbar flex flex-col gap-3 rounded border border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">
                OpenCards <span className="text-orange-300">Foundry</span>
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                Build any card game. Play the reference set.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <nav className="flex flex-wrap rounded border border-[color:var(--oc-border)] bg-zinc-900 p-1">
                <button
                  className={`rounded px-3 py-1.5 text-sm font-semibold ${
                    appView === 'play'
                      ? 'bg-[color:var(--oc-accent)] text-zinc-950'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                  data-testid="nav-play"
                  type="button"
                  onClick={() => setAppView('play')}
                >
                  Play
                </button>
                <button
                  className={`rounded px-3 py-1.5 text-sm font-semibold ${
                    appView === 'deck'
                      ? 'bg-[color:var(--oc-accent)] text-zinc-950'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                  data-testid="nav-deck"
                  type="button"
                  onClick={() => setAppView('deck')}
                >
                  Deck
                </button>
                <button
                  className={`rounded px-3 py-1.5 text-sm font-semibold ${
                    appView === 'create'
                      ? 'bg-[color:var(--oc-accent)] text-zinc-950'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                  data-testid="nav-create"
                  type="button"
                  onClick={() => setAppView('create')}
                >
                  Create
                </button>
                <button
                  className={`rounded px-3 py-1.5 text-sm font-semibold ${
                    appView === 'rules'
                      ? 'bg-[color:var(--oc-accent)] text-zinc-950'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                  data-testid="nav-rules"
                  type="button"
                  onClick={() => setAppView('rules')}
                >
                  Rules
                </button>
                <button
                  className={`rounded px-3 py-1.5 text-sm font-semibold ${
                    appView === 'online'
                      ? 'bg-[color:var(--oc-accent)] text-zinc-950'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                  data-testid="nav-online"
                  type="button"
                  onClick={() => setAppView('online')}
                >
                  Online
                </button>
                <button
                  className={`rounded px-3 py-1.5 text-sm font-semibold ${
                    appView === 'draft'
                      ? 'bg-[color:var(--oc-accent)] text-zinc-950'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                  data-testid="nav-draft"
                  type="button"
                  onClick={() => setAppView('draft')}
                >
                  Draft
                </button>
              </nav>
              <div
                className="max-w-full overflow-hidden rounded border border-[color:var(--oc-border)] bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-300"
                title={currentHash}
              >
                <span className="mr-2 text-zinc-400">hash</span>
                <span data-testid="state-hash">{shortHash(currentHash)}</span>
              </div>
            </div>
          </header>

          {appView === 'create' ? <CardCreator /> : null}

          {appView === 'deck' ? (
            <DeckEditor
              builtinCards={Object.values(BUILTIN_DEFINITIONS)}
              defaultFormat={FOUNDRY_FORMAT}
            />
          ) : null}

          {appView === 'rules' ? <RulesView /> : null}

          {appView === 'online' ? <OnlinePlay /> : null}

          {appView === 'draft' ? (
            <Draft format={activeFormat} pool={Object.values(BUILTIN_DEFINITIONS)} />
          ) : null}

          {appView === 'play' ? (
            <>
              <section className="oc-command-bar flex flex-col gap-3 rounded border border-white/10 p-4 sm:flex-row sm:items-end">
                <div className="flex flex-col gap-1">
                  <label className="flex max-w-36 flex-col gap-1 text-sm text-zinc-300">
                    Seed
                    <input
                      className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2 text-zinc-100"
                      type="number"
                      value={seed}
                      onChange={(event) => setSeed(Number(event.currentTarget.value))}
                    />
                  </label>
                  <p className="text-xs text-zinc-400">Live seed (next New Game): {seed}</p>
                  {match ? (
                    <p className="text-xs text-zinc-300" data-testid="match-seed">
                      Match seed (active): {match.seed}
                    </p>
                  ) : null}
                  <p className="text-xs text-zinc-400" data-testid="active-format">
                    {`Format: ${activeFormat.name} · deck ${String(activeFormat.deckSize)} · hand ${String(activeFormat.openingHandSize)}`}
                  </p>
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      checked={useCustomCards && hasCustomCards}
                      data-testid="use-custom-cards"
                      disabled={!hasCustomCards}
                      type="checkbox"
                      onChange={(event) => setUseCustomCards(event.currentTarget.checked)}
                    />
                    Use my cards
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      checked={botEnabled}
                      data-testid="bot-enabled"
                      disabled={guidedTutorial}
                      type="checkbox"
                      onChange={(event) => setBotEnabled(event.currentTarget.checked)}
                    />
                    Jugar contra la IA Verdant
                  </label>
                </div>
                <button
                  className="rounded border border-emerald-300/60 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/20"
                  data-testid="start-guided-tutorial"
                  type="button"
                  onClick={startGuidedTutorial}
                >
                  Tutorial paso a paso
                </button>
                <button
                  className="rounded bg-[color:var(--oc-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 hover:brightness-110"
                  aria-label="New Game"
                  type="button"
                  onClick={startNewGame}
                >
                  Nueva partida
                </button>
                <button
                  className="rounded border border-[color:var(--oc-border)] px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
                  data-testid="reset-game"
                  type="button"
                  onClick={resetGame}
                >
                  Reset
                </button>
                {match ? (
                  <button
                    className="rounded border border-[color:var(--oc-accent)] bg-[color:var(--oc-accent-soft)] px-4 py-2 text-sm font-semibold text-orange-100 hover:bg-orange-500/25"
                    type="button"
                    onClick={exportEnvelope}
                  >
                    Export envelope
                  </button>
                ) : null}
                <p className="text-xs text-zinc-400 sm:pb-3">n new · r reset · 1/2 draw · v flip</p>
              </section>

              {exportedEnvelope ? (
                <section className="rounded border border-[color:var(--oc-border)] bg-zinc-900 p-4">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Exported replay envelope</h2>
                      <p className="text-sm text-zinc-400">
                        finalStateHash is computed by replaying through the public facade.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm hover:bg-zinc-800"
                        type="button"
                        onClick={() => void copyEnvelope()}
                      >
                        Copy
                      </button>
                      <button
                        className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm hover:bg-zinc-800"
                        data-testid="clear-export"
                        type="button"
                        onClick={clearExportedEnvelope}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {exportMeta ? (
                    <p className="mb-2 text-xs text-zinc-400" data-testid="export-meta">
                      {`Exported: ${exportMeta.timestamp} \u00b7 ${exportMeta.commandCount} commands \u00b7 seed ${exportMeta.seed}`}
                    </p>
                  ) : null}
                  <textarea
                    className="min-h-48 w-full rounded border border-[color:var(--oc-border)] bg-zinc-950 p-3 font-mono text-sm text-zinc-100"
                    data-testid="export-envelope"
                    ref={exportedEnvelopeRef}
                    readOnly
                    value={exportedEnvelope}
                  />
                  {copyStatus === 'copied' ? (
                    <p className="mt-2 text-sm text-emerald-200" data-testid="copy-status">
                      Copied
                    </p>
                  ) : null}
                  {copyStatus === 'failed' ? (
                    <p className="mt-2 text-sm text-red-200" data-testid="copy-status">
                      Select all + Ctrl+C to copy
                    </p>
                  ) : null}
                </section>
              ) : null}

              <section>
                {match ? (
                  <div className="flex flex-col gap-3" data-guide-stage={guidedStage ?? undefined}>
                    {guidedStage ? (
                      <GuidedTutorialPanel
                        stage={guidedStage}
                        onBegin={() => setGuidedIntroComplete(true)}
                        onExit={resetGame}
                        onPlayMatch={() => {
                          setBotEnabled(true);
                          startNewGame();
                        }}
                      />
                    ) : null}
                    {!guidedTutorial ? (
                      <div
                        className="inline-flex w-fit rounded border border-[color:var(--oc-border)] bg-zinc-900 p-1"
                        data-testid="perspective-toggle"
                      >
                        {players.map((player) => (
                          <button
                            className={`rounded px-3 py-2 text-sm font-semibold ${
                              viewer === player
                                ? 'bg-[color:var(--oc-accent)] text-zinc-950'
                                : 'text-zinc-300 hover:bg-zinc-800'
                            }`}
                            data-testid={`view-as-${player}`}
                            key={player}
                            type="button"
                            onClick={() => selectViewer(player)}
                          >
                            View as {player}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <BoardView
                      activePlayer={match.p1View.activePlayer}
                      cardRegistry={buildCardRegistry(
                        match.setupOpts.decklist !== undefined ||
                          (useCustomCards && hasCustomCards),
                      )}
                      commands={match.commands}
                      eventLog={replayArtifacts?.events ?? []}
                      hashMatch={hashMatch}
                      issues={errors[viewer] ?? []}
                      legal={visibleLegalCommands}
                      targeting={targeting}
                      view={viewer === p1 ? match.p1View : match.p2View}
                      viewer={viewer}
                      onCancelTargeting={onCancelTargeting}
                      onCommand={applyPlayerCommand}
                      onSelectAttacker={onSelectAttacker}
                      onTargetCommand={onTargetCommand}
                    />
                  </div>
                ) : (
                  <div className="oc-empty-board flex min-h-[460px] items-end rounded border border-white/15 p-6 sm:p-9">
                    <div className="max-w-xl">
                      <p className="text-xs font-semibold uppercase text-emerald-300">
                        Ember versus Verdant
                      </p>
                      <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
                        Aprende jugando. Luego gana.
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-zinc-300 sm:text-base">
                        Empieza con un tutorial guiado de un turno completo o entra directamente en
                        una partida contra la IA Verdant.
                      </p>
                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          className="rounded bg-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-950 hover:bg-emerald-200"
                          data-testid="hero-guided-tutorial"
                          type="button"
                          onClick={startGuidedTutorial}
                        >
                          Aprender paso a paso
                        </button>
                        <button
                          className="rounded bg-orange-500 px-5 py-3 text-sm font-semibold text-black hover:bg-orange-400"
                          data-testid="start-duel"
                          type="button"
                          onClick={startNewGame}
                        >
                          Partida libre
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <TutorialPicker
                active={tutorial}
                complete={tutorial === null ? false : isTutorialComplete(tutorial.id, match)}
                onStart={startTutorial}
              />

              {match === null ? (
                <div className="sr-only">
                  <ReplayPanel
                    replayInput={replayInput}
                    replay={replay}
                    pasteValidation={pasteValidation}
                    pasteStatus={pasteStatus}
                    onReplayInput={(value) => {
                      setReplayInput(value);
                      setReplay({ status: 'idle' });
                      setPasteValidation(null);
                    }}
                    onVerify={verifyReplay}
                    onPaste={() => void pasteReplayFromClipboard()}
                  />
                </div>
              ) : null}

              {match ? (
                <details className="rounded border border-white/10 bg-zinc-900/70 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-300">
                    Match data, logs, and replay
                  </summary>
                  <div className="mt-4 grid gap-4">
                    <MatchLog commands={match.commands} limit={logLimit} />
                    <EventLog events={replayArtifacts?.events ?? []} />
                    <ReplayPanel
                      replayInput={replayInput}
                      replay={replay}
                      pasteValidation={pasteValidation}
                      pasteStatus={pasteStatus}
                      onReplayInput={(value) => {
                        setReplayInput(value);
                        setReplay({ status: 'idle' });
                        setPasteValidation(null);
                      }}
                      onVerify={verifyReplay}
                      onPaste={() => void pasteReplayFromClipboard()}
                    />
                  </div>
                </details>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </MotionConfig>
  );
}

const GUIDED_TUTORIAL_CONTENT: Record<
  GuidedTutorialStage,
  {
    readonly step: number;
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly action: string;
  }
> = {
  intro: {
    step: 0,
    eyebrow: 'Antes de mover',
    title: 'Tu objetivo: dejar la base rival en 0',
    body: 'En una partida normal ambas bases empiezan con 20 PV. Juegas cartas pagando energia, colocas unidades y atacas hasta reducir la base enemiga a cero. En esta practica la base rival tiene 1 PV para que completes el ciclo entero en un turno.',
    action: 'Primero veras como robar, jugar una unidad y atacar.',
  },
  draw: {
    step: 1,
    eyebrow: 'Paso 1 de 6 - Inicio',
    title: 'Roba una carta',
    body: 'Cada turno comienza en Inicio. Puedes robar una vez; la carta pasa de tu mazo a tu mano sin que el rival vea cual es.',
    action: 'Pulsa el boton resaltado "Robar carta".',
  },
  'go-main': {
    step: 2,
    eyebrow: 'Paso 2 de 6 - Fases',
    title: 'Avanza a la fase principal',
    body: 'El turno se divide en Inicio, Principal, Combate y Fin. En Principal puedes gastar energia para jugar cartas.',
    action: 'Pulsa "Siguiente fase".',
  },
  'play-unit': {
    step: 3,
    eyebrow: 'Paso 3 de 6 - Energia',
    title: 'Juega Cinder Initiate',
    body: 'El numero de la esquina de una carta es su coste. Tienes 1 de energia y Cinder Initiate cuesta 1, asi que puedes jugarla. La energia se rellena y aumenta al comenzar tus siguientes turnos.',
    action: 'Pulsa "Jugar" debajo de la carta resaltada.',
  },
  'go-combat': {
    step: 4,
    eyebrow: 'Paso 4 de 6 - Combate',
    title: 'Avanza a Combate',
    body: 'Las unidades normales esperan un turno antes de atacar. Cinder Initiate tiene Haste, por eso puede atacar inmediatamente.',
    action: 'Pulsa otra vez "Siguiente fase".',
  },
  'select-attacker': {
    step: 5,
    eyebrow: 'Paso 5 de 6 - Atacante',
    title: 'Elige la unidad que atacara',
    body: 'Una unidad preparada puede atacar una vez. Primero eliges atacante y despues objetivo. Si hay una unidad con Guard, debes atacarla antes que a la base.',
    action: 'Pulsa "Atacar" en Cinder Initiate.',
  },
  'attack-base': {
    step: 6,
    eyebrow: 'Paso 6 de 6 - Objetivo',
    title: 'Ataca la base rival',
    body: 'El rival no tiene unidades con Guard, asi que su base es un objetivo legal. Tu unidad inflige su ataque a la base.',
    action: 'Pulsa "Atacar base". Al llegar a 0 PV, ganas.',
  },
  victory: {
    step: 6,
    eyebrow: 'Tutorial completado',
    title: 'Has ganado tu primera partida',
    body: 'La base Verdant ha llegado a 0. En una partida normal repetiras este ciclo durante varios turnos: robar, jugar cartas, combatir y terminar turno mientras la IA hace lo mismo.',
    action: 'Ya conoces el objetivo, las cuatro fases, la energia, las unidades y el combate.',
  },
};

function GuidedTutorialPanel({
  stage,
  onBegin,
  onExit,
  onPlayMatch,
}: {
  readonly stage: GuidedTutorialStage;
  readonly onBegin: () => void;
  readonly onExit: () => void;
  readonly onPlayMatch: () => void;
}): JSX.Element {
  const content = GUIDED_TUTORIAL_CONTENT[stage];
  const progress = Math.round((content.step / 6) * 100);

  return (
    <section
      aria-live="polite"
      className="oc-guide-panel sticky top-3 z-40 overflow-hidden rounded border border-emerald-300/40 bg-zinc-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
      data-testid="guided-tutorial"
    >
      <div className="h-1 bg-zinc-800">
        <div
          className="h-full bg-emerald-300 transition-all duration-300"
          data-testid="guided-progress"
          style={{ width: `${String(progress)}%` }}
        />
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-300" data-testid="guided-stage">
            {content.eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">{content.title}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-300">{content.body}</p>
          <p className="mt-2 text-sm font-semibold text-orange-200">{content.action}</p>
          <div className="mt-3 flex flex-wrap gap-1 text-xs text-zinc-400">
            {['Inicio', 'Principal', 'Combate', 'Fin'].map((phase) => (
              <span className="rounded border border-white/10 bg-white/5 px-2 py-1" key={phase}>
                {phase}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          {stage === 'intro' ? (
            <button
              className="rounded bg-emerald-300 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-200"
              data-testid="guided-begin"
              type="button"
              onClick={onBegin}
            >
              Empezar tutorial
            </button>
          ) : null}
          {stage === 'victory' ? (
            <button
              className="rounded bg-orange-500 px-4 py-2 text-sm font-bold text-black hover:bg-orange-400"
              data-testid="guided-play-match"
              type="button"
              onClick={onPlayMatch}
            >
              Jugar contra la IA
            </button>
          ) : null}
          <button
            className="rounded border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/5"
            data-testid="guided-exit"
            type="button"
            onClick={onExit}
          >
            Salir del tutorial
          </button>
        </div>
      </div>
    </section>
  );
}

function deriveGuidedTutorialStage(
  match: MatchState,
  targeting: TargetingState,
  introComplete: boolean,
): GuidedTutorialStage {
  if (!introComplete) return 'intro';
  if (match.p1View.winner === p1) return 'victory';
  if (targeting.status === 'awaitingTarget' && targeting.draft.type === 'attack') {
    return 'attack-base';
  }
  if (match.p1View.phase === 'combat') return 'select-attacker';
  if (match.commands.some((command) => command.type === 'playCard')) return 'go-combat';
  if (match.p1View.phase === 'main') return 'play-unit';
  if (match.commands.some((command) => command.type === 'drawCard')) return 'go-main';
  return 'draw';
}

function filterCommandsForGuide(
  legal: readonly Command[],
  stage: GuidedTutorialStage | null,
  match: MatchState | null,
): readonly Command[] {
  if (stage === null) return legal;
  switch (stage) {
    case 'draw':
      return legal.filter((command) => command.type === 'drawCard');
    case 'go-main':
    case 'go-combat':
      return legal.filter((command) => command.type === 'endPhase');
    case 'play-unit': {
      const cinder = match?.p1View.viewer.hand.find((card) => card.kind === 'cinder-initiate');
      return legal.filter(
        (command) => command.type === 'playCard' && command.instance === cinder?.id,
      );
    }
    case 'select-attacker':
      return legal.filter((command) => command.type === 'attack');
    case 'attack-base':
      return legal.filter((command) => command.type === 'attack' && command.target === 'base');
    case 'intro':
    case 'victory':
      return [];
  }
}

function isCommandAllowedByGuide(
  stage: GuidedTutorialStage | null,
  command: Command,
  match: MatchState,
): boolean {
  return hasLegalCommand(filterCommandsForGuide([command], stage, match), command);
}

function isTutorialComplete(id: FoundryTutorialId, match: MatchState | null): boolean {
  if (match === null) return false;
  switch (id) {
    case 'first-turn':
      return match.p1View.winner === p1;
    case 'combat':
      return match.commands.some(
        (command) => command.type === 'attack' && command.target === 'base',
      );
    case 'guard-rush':
      return match.commands.some(
        (command) => command.type === 'attack' && command.target !== 'base',
      );
    case 'shield-poison':
      return !match.p1View.opponents[p2]?.battlefield.some(
        (unit) => unit.kind === 'barkshield-guardian',
      );
    case 'tactics':
      return match.commands.some((command) => command.type === 'resolveStack');
  }
}

function TutorialPicker({
  active,
  complete,
  onStart,
}: {
  readonly active: FoundryTutorial | null;
  readonly complete: boolean;
  readonly onStart: (tutorial: FoundryTutorial) => void;
}): JSX.Element {
  return (
    <section
      className="rounded border border-emerald-400/20 bg-emerald-950/30 p-4"
      data-testid="tutorial-picker"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-300">Academia Foundry</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">Aprende antes de competir</h2>
            {complete ? (
              <span
                className="rounded bg-emerald-300 px-2 py-1 text-xs font-bold text-emerald-950"
                data-testid="tutorial-complete"
              >
                Leccion completada
              </span>
            ) : null}
          </div>
          {active ? (
            <p className="mt-1 text-sm text-emerald-100" data-testid="tutorial-objective">
              {active.objective} {active.focus}
            </p>
          ) : (
            <p className="mt-1 text-sm text-zinc-400">
              Empieza por el tutorial completo y practica despues cada mecanica por separado.
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {FOUNDRY_TUTORIALS.map((item) => (
          <button
            className={`min-h-14 rounded border px-3 py-2 text-left text-sm font-semibold transition ${
              active?.id === item.id
                ? 'border-emerald-300 bg-emerald-400/20 text-white'
                : 'border-white/10 bg-black/20 text-zinc-300 hover:border-emerald-400/50 hover:bg-emerald-400/10'
            }`}
            data-testid={`tutorial-${item.id}`}
            key={item.id}
            type="button"
            onClick={() => onStart(item)}
          >
            {item.title}
          </button>
        ))}
      </div>
    </section>
  );
}

const KEYWORD_RULES = [
  ['Guard', 'While visible, this unit must be attacked before its base or non-Guard allies.'],
  ['Rush', 'May attack units on the turn it enters play, but not the enemy base.'],
  ['Charge', 'May attack any legal target on the turn it enters play.'],
  ['Haste', 'Enters ready and may attack immediately.'],
  ['Shield', 'Prevents the next positive damage, then disappears.'],
  ['Lifesteal', 'Combat damage dealt restores that much life to its controller.'],
  ['Poisonous', 'Any combat damage dealt to a unit destroys that unit.'],
  ['Stealth', 'Cannot be attacked or targeted by enemies until it attacks.'],
] as const;

const ADVANCED_RULES = [
  [
    'Triggers',
    'Abilities can react to play, death, attack, turn start or end, enemy actions, and friendly deaths.',
  ],
  [
    'Control',
    'Freeze and stun delay units; silence removes abilities, statuses, modifiers, counters, and keywords.',
  ],
  [
    'Modification',
    'Permanent or temporary buffs and debuffs can change stats, add keywords, or place named counters.',
  ],
  [
    'Attachments',
    'Equipment and enchantments stay on a unit and contribute their own attack or health modifiers.',
  ],
  [
    'Secrets',
    'Face-down traps expose only a count to the opponent, then reveal and resolve on their trigger.',
  ],
  [
    'Zones',
    'Cards can move through deck, hand, battlefield, stack, discard, exile, and resurrection flows.',
  ],
  [
    'Area effects',
    'Effects can hit every unit, adjacent units, or a deterministic random legal target.',
  ],
  [
    'Choices',
    'Choose-one effects pause resolution until the controlling player selects a legal option.',
  ],
  [
    'Fatigue',
    'Drawing from an empty deck deals increasing damage instead of silently ending the game.',
  ],
] as const;
function RulesView(): JSX.Element {
  return (
    <div className="flex flex-col gap-6" data-testid="rules-view">
      <section className="grid gap-6 border-b border-white/10 pb-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase text-orange-300">Ember Duel: Foundry Set</p>
          <h2 className="mt-2 text-3xl font-semibold">Rules of the duel</h2>
          <p className="mt-3 max-w-2xl text-zinc-300">
            Reduce the opposing base from 20 to 0. Build a 20-card deck, draw four cards, and deploy
            units or tactics using energy that grows from 1 to 10.
          </p>
          <ol className="mt-5 grid gap-3 text-sm text-zinc-300">
            <li>
              <strong className="text-white">1. Start:</strong> draw once. Empty decks deal
              increasing fatigue damage.
            </li>
            <li>
              <strong className="text-white">2. Main:</strong> play cards. Each side can control at
              most five units.
            </li>
            <li>
              <strong className="text-white">3. Combat:</strong> ready units attack a unit or the
              enemy base. Unit damage is simultaneous.
            </li>
            <li>
              <strong className="text-white">4. End:</strong> temporary modifiers expire and the
              opponent begins with refilled energy.
            </li>
          </ol>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {KEYWORD_RULES.map(([name, description]) => (
            <article className="rounded border border-white/10 bg-white/5 p-3" key={name}>
              <h3 className="font-semibold text-emerald-200">{name}</h3>
              <p className="mt-1 text-sm leading-5 text-zinc-400">{description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="border-b border-white/10 pb-6">
        <p className="text-xs font-semibold uppercase text-emerald-300">Advanced vocabulary</p>
        <h3 className="mt-2 text-xl font-semibold">Composable mechanics</h3>
        <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {ADVANCED_RULES.map(([name, description]) => (
            <div className="border-l-2 border-emerald-400/40 pl-3" key={name}>
              <h4 className="font-semibold text-zinc-100">{name}</h4>
              <p className="mt-1 text-sm leading-5 text-zinc-400">{description}</p>
            </div>
          ))}
        </div>
      </section>
      <FormatEditor defaultFormat={FOUNDRY_FORMAT} />
    </div>
  );
}

function MatchLog({
  commands,
  limit,
}: {
  readonly commands: readonly Command[];
  readonly limit: number;
}): JSX.Element {
  const hasTruncatedCommands = commands.length > limit;
  const visibleCommands = hasTruncatedCommands ? commands.slice(-limit) : commands;
  const indexOffset = hasTruncatedCommands ? commands.length - limit : 0;

  return (
    <section
      className="rounded border border-[color:var(--oc-border)] bg-zinc-900 p-4"
      data-testid="match-log"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Match log</h2>
        <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
          {commands.length}
        </span>
      </div>
      {commands.length === 0 ? (
        <p className="text-sm text-zinc-400">No commands yet — click Draw or press 1 / 2</p>
      ) : (
        <>
          {hasTruncatedCommands ? (
            <p
              className="mb-3 inline-flex rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
              data-testid="log-truncation"
            >
              Showing latest {limit} of {commands.length}
            </p>
          ) : null}
          <ol className="grid max-h-64 gap-2 overflow-y-auto pr-1 text-sm text-zinc-300">
            {visibleCommands.map((command, index) => {
              const absoluteIndex = index + indexOffset;

              return (
                <li
                  className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2"
                  data-testid={`log-entry-${absoluteIndex}`}
                  key={`${absoluteIndex}-${command.player}-${command.type}`}
                >
                  #{absoluteIndex + 1} · {command.player} · {command.type}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

function EventLog({ events }: { readonly events: readonly EventLogEntry[] }): JSX.Element {
  return (
    <section
      className="rounded border border-[color:var(--oc-border)] bg-zinc-900 p-4"
      data-testid="event-log"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Event log</h2>
        <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">{events.length}</span>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-zinc-400">No events yet</p>
      ) : (
        <ol className="grid max-h-64 gap-2 overflow-y-auto pr-1 text-sm text-zinc-300">
          {events.map((entry) => (
            <li
              className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2"
              data-testid={`event-${entry.index}`}
              key={`${entry.index}-${entry.event.type}`}
            >
              #{entry.index + 1} - cmd {entry.commandIndex + 1} - {formatEvent(entry.event)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TurnInfo({ view }: { readonly view: PlayerView }): JSX.Element {
  return (
    <div
      className="flex flex-col gap-2 rounded border border-[color:var(--oc-border)] bg-zinc-900 px-4 py-3 text-sm text-zinc-200 sm:flex-row sm:items-center sm:gap-5 lg:col-span-2"
      data-testid="turn-info"
    >
      <span>Turn: {view.turn}</span>
      <span>Phase: {view.phase}</span>
      <span data-testid={`active-${view.activePlayer}`}>Active: {view.activePlayer}</span>
    </div>
  );
}

function StackPanel({
  stack,
  legal,
  targeting,
  onCommand,
  onTargetCommand,
}: {
  readonly stack: readonly StackItem[];
  readonly legal: readonly Command[];
  readonly targeting: TargetingState;
  readonly onCommand: (command: Command) => void;
  readonly onTargetCommand: (command: TargetCommand) => void;
}): JSX.Element {
  const resolveCommand = legal.find(
    (command): command is ResolveStackCommand => command.type === 'resolveStack',
  );
  const chooseBaseCommand = targetCommandForTarget(legal, targeting, stack, 'base', 'chooseTarget');
  const choiceCommands = legal.filter(
    (command): command is Extract<Command, { readonly type: 'makeChoice' }> =>
      command.type === 'makeChoice',
  );

  return (
    <section
      className="rounded border border-[color:var(--oc-border)] bg-zinc-950/85 p-3 text-sm text-zinc-300"
      data-testid="stack"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">Stack</h2>
        <div className="flex flex-wrap gap-2">
          {chooseBaseCommand ? (
            <button
              className="rounded border border-red-400/60 bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/25"
              data-testid="choose-target-base"
              type="button"
              onClick={() => onTargetCommand(chooseBaseCommand)}
            >
              Choose base
            </button>
          ) : null}
          {resolveCommand ? (
            <button
              className="rounded border border-[color:var(--oc-accent)] bg-[color:var(--oc-accent-soft)] px-2 py-1 text-xs font-semibold text-orange-100 hover:bg-orange-500/25"
              data-testid="resolve-stack"
              type="button"
              onClick={() => onCommand(resolveCommand)}
            >
              Resolve
            </button>
          ) : null}
        </div>
      </div>
      {choiceCommands.length > 0 ? (
        <div
          className="mb-3 rounded border border-emerald-400/30 bg-emerald-500/10 p-3"
          data-testid="pending-choice"
        >
          <p className="mb-2 text-xs font-semibold uppercase text-emerald-200">Choose one</p>
          <div className="flex flex-wrap gap-2">
            {choiceCommands.map((command) => (
              <button
                className="rounded border border-emerald-300/40 bg-emerald-400/15 px-3 py-2 text-sm font-semibold text-emerald-50 hover:bg-emerald-400/25"
                data-testid={`choice-option-${String(command.option)}`}
                key={command.option}
                type="button"
                onClick={() => onCommand(command)}
              >
                Option {command.option + 1}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {stack.length === 0 ? (
        <p className="text-xs text-zinc-400">Stack empty</p>
      ) : (
        <ol className="grid gap-2">
          {stack.map((item) => (
            <li
              className="rounded border border-[color:var(--oc-border)] bg-zinc-900/80 px-3 py-2"
              data-testid={`stack-item-${item.source}`}
              key={item.source}
            >
              <div className="font-semibold text-zinc-100">{item.kind}</div>
              <div className="text-xs text-zinc-400">
                {item.controller} - {item.target === null ? 'no target' : `target ${item.target}`}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function BoardView({
  viewer,
  view,
  activePlayer,
  cardRegistry,
  commands,
  eventLog,
  hashMatch,
  issues,
  legal,
  targeting,
  onCancelTargeting,
  onCommand,
  onSelectAttacker,
  onTargetCommand,
}: {
  readonly viewer: PlayerId;
  readonly view: PlayerView;
  readonly activePlayer: PlayerId;
  readonly cardRegistry: Map<string, CardDefinition>;
  readonly commands: readonly Command[];
  readonly eventLog: readonly EventLogEntry[];
  readonly hashMatch: 'match' | 'mismatch';
  readonly issues: readonly ValidationIssue[];
  readonly legal: readonly Command[];
  readonly targeting: TargetingState;
  readonly onCancelTargeting: () => void;
  readonly onCommand: (command: Command) => void;
  readonly onSelectAttacker: (instanceId: CardInstanceId) => void;
  readonly onTargetCommand: (command: TargetCommand) => void;
}): JSX.Element {
  const opponent = otherPlayer(viewer);
  const opponentView = view.opponents[opponent]!;
  const attackBaseCommand = targetCommandForTarget(legal, targeting, view.stack, 'base', 'attack');

  return (
    <div
      className="oc-game-board overflow-hidden rounded border border-white/15 shadow-2xl shadow-black/50"
      data-testid="board"
    >
      {view.winner ? (
        <div
          className="border-b border-emerald-400/40 bg-emerald-500/15 px-4 py-3 text-center text-lg font-semibold text-emerald-100"
          data-testid="winner-banner"
        >
          {view.winner} wins
        </div>
      ) : null}
      <BoardArea
        className="rounded-b-none border-x-0 border-t-0 bg-black/25"
        isActive={opponent === activePlayer}
        testId="opponent-area"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-[color:var(--oc-border)] px-2 py-1 text-sm font-semibold">
                {opponent}
              </span>
              <span className="text-sm text-zinc-400">
                Hand {opponentView.hand.length} · Deck {opponentView.deck.count}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <BaseBadge base={opponentView.base} energy={opponentView.energy} player={opponent} />
              {attackBaseCommand ? (
                <button
                  aria-label="Attack base"
                  className="rounded border border-red-400/60 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/25"
                  data-testid="attack-target-base"
                  type="button"
                  onClick={() => onTargetCommand(attackBaseCommand)}
                >
                  Atacar base
                </button>
              ) : null}
              {isAwaitingAttackTarget(targeting) ? (
                <button
                  className="rounded border border-[color:var(--oc-border)] bg-zinc-900 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800"
                  data-testid="cancel-attack"
                  type="button"
                  onClick={onCancelTargeting}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
          <FannedHand masked cardCount={opponentView.hand.length} owner={opponent} />
          <BattlefieldStrip
            units={opponentView.battlefield}
            owner={opponent}
            cardRegistry={cardRegistry}
            mode={targetModeForBattlefield(legal, targeting, view.stack, onTargetCommand)}
          />
        </div>
      </BoardArea>

      <div
        className="relative border-y border-white/10 bg-black/20 px-4 py-3 backdrop-blur-[2px]"
        data-testid="board-center"
      >
        <div className="absolute inset-x-6 top-1/2 h-px bg-gradient-to-r from-transparent via-orange-300/35 to-transparent" />
        <div className="relative grid gap-4 lg:grid-cols-[1fr_1fr]">
          <TurnInfo view={view} />
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
              <span className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-2 py-1">
                legal <span data-testid="legal-commands-count">{legal.length}</span>
              </span>
              <span
                className={`rounded border px-2 py-1 ${
                  hashMatch === 'match'
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
                    : 'border-red-400/40 bg-red-500/15 text-red-100'
                }`}
                data-testid="hash-match"
              >
                {hashMatch}
              </span>
              <span
                className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-2 py-1"
                data-testid="targeting-state"
              >
                {targeting.status}
              </span>
            </div>
            <StackPanel
              legal={legal}
              stack={view.stack}
              targeting={targeting}
              onCommand={onCommand}
              onTargetCommand={onTargetCommand}
            />
          </div>
        </div>
      </div>

      <PlayerArea
        activePlayer={activePlayer}
        cardRegistry={cardRegistry}
        commands={commands}
        eventLog={eventLog}
        issues={issues}
        legal={legal}
        targeting={targeting}
        onCommand={onCommand}
        onSelectAttacker={onSelectAttacker}
        onTargetCommand={onTargetCommand}
        view={view}
        viewer={viewer}
      />
    </div>
  );
}

function PlayerArea({
  viewer,
  view,
  activePlayer,
  cardRegistry,
  commands,
  eventLog,
  issues,
  legal,
  targeting,
  onCommand,
  onSelectAttacker,
  onTargetCommand,
}: {
  readonly viewer: PlayerId;
  readonly view: PlayerView;
  readonly activePlayer: PlayerId;
  readonly cardRegistry: Map<string, CardDefinition>;
  readonly commands: readonly Command[];
  readonly eventLog: readonly EventLogEntry[];
  readonly issues: readonly ValidationIssue[];
  readonly legal: readonly Command[];
  readonly targeting: TargetingState;
  readonly onCommand: (command: Command) => void;
  readonly onSelectAttacker: (instanceId: CardInstanceId) => void;
  readonly onTargetCommand: (command: TargetCommand) => void;
}): JSX.Element {
  const isActive = viewer === activePlayer;
  const hasWinner = view.winner !== null;
  const drawCommand = legal.find((command) => command.type === 'drawCard');
  const endPhaseCommand = legal.find((command) => command.type === 'endPhase');
  const endTurnCommand = legal.find((command) => command.type === 'endTurn');
  const playCommands = legal.filter(
    (command): command is PlayCardCommand => command.type === 'playCard',
  );
  const attackCommands = legal.filter(
    (command): command is AttackCommand => command.type === 'attack',
  );
  const commandCount = commands.filter((command) => command.player === viewer).length;
  const drawEventCount = eventLog.filter(
    ({ event }) => event.type === 'cardDrawn' && event.player === viewer,
  ).length;
  const [sparkBurstKey, setSparkBurstKey] = useState<number | null>(null);
  const previousDrawEventCount = useRef(drawEventCount);
  const previousViewer = useRef(viewer);

  useEffect(() => {
    if (previousViewer.current !== viewer) {
      previousViewer.current = viewer;
      previousDrawEventCount.current = drawEventCount;
      setSparkBurstKey(null);
      return undefined;
    }

    if (drawEventCount > previousDrawEventCount.current) {
      const burstKey = Date.now();
      setSparkBurstKey(burstKey);
      const timeoutId = window.setTimeout(() => setSparkBurstKey(null), 650);
      previousDrawEventCount.current = drawEventCount;

      return () => window.clearTimeout(timeoutId);
    }

    previousDrawEventCount.current = drawEventCount;
    return undefined;
  }, [drawEventCount, viewer]);

  return (
    <BoardArea
      className="rounded-t-none border-x-0 border-b-0 bg-black/25"
      isActive={isActive}
      testId="player-area"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-[color:var(--oc-border)] px-2 py-1 text-sm font-semibold">
            {viewer}
          </span>
          <span className="text-sm text-zinc-400">Hand {view.viewer.hand.length}</span>
          <BaseBadge base={view.viewer.base} energy={view.viewer.energy} player={viewer} />
          <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
            Cmds: <span data-testid={`cmd-count-${viewer}`}>{commandCount}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isActive && !hasWinner ? (
            <span className="text-xs text-zinc-400">Waiting for {activePlayer}</span>
          ) : null}
          <button
            aria-label="Draw card"
            className={`rounded border border-[color:var(--oc-accent)] bg-[color:var(--oc-accent-soft)] px-3 py-2 text-sm text-orange-100 hover:bg-orange-500/25 ${
              drawCommand ? '' : 'cursor-not-allowed opacity-50'
            }`}
            data-testid="draw-card"
            disabled={!drawCommand}
            type="button"
            onClick={() => {
              if (drawCommand) onCommand(drawCommand);
            }}
          >
            Robar carta
          </button>
          <button
            aria-label="End phase"
            className={`rounded border border-[color:var(--oc-border)] bg-zinc-900 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800 ${
              endPhaseCommand ? '' : 'cursor-not-allowed opacity-50'
            }`}
            data-testid="end-phase"
            disabled={!endPhaseCommand}
            type="button"
            onClick={() => {
              if (endPhaseCommand) onCommand(endPhaseCommand);
            }}
          >
            Siguiente fase
          </button>
          <button
            aria-label="End turn"
            className={`rounded border border-[color:var(--oc-border)] bg-zinc-900 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800 ${
              endTurnCommand ? '' : 'cursor-not-allowed opacity-50'
            }`}
            data-testid="end-turn"
            disabled={!endTurnCommand}
            type="button"
            onClick={() => {
              if (endTurnCommand) onCommand(endTurnCommand);
            }}
          >
            Terminar turno
          </button>
        </div>
      </div>

      <FannedHand
        cards={view.viewer.hand}
        owner={viewer}
        cardRegistry={cardRegistry}
        playCommands={playCommands}
        onCommand={onCommand}
      />

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="relative">
          <CountBadge
            label="Deck"
            testId={`deck-count-${viewer}`}
            value={view.viewer.deck.length}
          />
          {sparkBurstKey ? <SparkBurst key={sparkBurstKey} /> : null}
        </div>
        <CountBadge label="Discard" value={view.viewer.discard.length} />
        <CountBadge label="Exile" value={view.viewer.exile.length} />
        <CountBadge label="Battlefield" value={view.viewer.battlefield.length} />
      </div>

      <BattlefieldStrip
        units={view.viewer.battlefield}
        owner={viewer}
        cardRegistry={cardRegistry}
        mode={playerBattlefieldMode(
          legal,
          attackCommands,
          targeting,
          view.stack,
          onSelectAttacker,
          onTargetCommand,
        )}
      />

      {issues.length > 0 ? (
        <div className="mt-4 rounded border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-100">
          {issues.map((issue) => (
            <p key={`${issue.code}-${issue.message}`}>{issue.message}</p>
          ))}
        </div>
      ) : null}
    </BoardArea>
  );
}

function isAwaitingAttackTarget(targeting: TargetingState): boolean {
  return targeting.status === 'awaitingTarget' && targeting.draft.type === 'attack';
}

function selectedAttacker(targeting: TargetingState): CardInstanceId | null {
  if (targeting.status === 'awaitingTarget' && targeting.draft.type === 'attack') {
    return targeting.draft.attacker;
  }

  return null;
}

function playerBattlefieldMode(
  legal: readonly Command[],
  attackCommands: readonly AttackCommand[],
  targeting: TargetingState,
  stack: readonly StackItem[],
  onSelectAttacker: (instanceId: CardInstanceId) => void,
  onTargetCommand: (command: TargetCommand) => void,
): BattlefieldStripMode {
  if (targeting.status === 'awaitingTarget' && targeting.draft.type === 'chooseTarget') {
    return targetModeForBattlefield(legal, targeting, stack, onTargetCommand);
  }

  return {
    type: 'attacker',
    legalAttackCommands: attackCommands,
    selectedAttacker: selectedAttacker(targeting),
    onSelectAttacker,
  };
}

function targetModeForBattlefield(
  legal: readonly Command[],
  targeting: TargetingState,
  stack: readonly StackItem[],
  onTargetCommand: (command: TargetCommand) => void,
): BattlefieldStripMode {
  if (targeting.status !== 'awaitingTarget') {
    return { type: 'plain' };
  }

  return {
    type: 'target',
    targetKind: targeting.draft.type,
    targetCommands: targetCommandsForDraft(legal, targeting, stack),
    onTargetCommand,
  };
}

function targetCommandForTarget(
  legal: readonly Command[],
  targeting: TargetingState,
  stack: readonly StackItem[],
  target: CardInstanceId | 'base',
  kind: 'attack' | 'chooseTarget',
): TargetCommand | null {
  return (
    targetCommandsForDraft(legal, targeting, stack).find(
      (command) => command.type === kind && command.target === target,
    ) ?? null
  );
}

function targetCommandsForDraft(
  legal: readonly Command[],
  targeting: TargetingState,
  stack: readonly StackItem[],
): readonly TargetCommand[] {
  if (targeting.status !== 'awaitingTarget') {
    return [];
  }

  const draft = targeting.draft;

  if (draft.type === 'attack') {
    return legal.filter(
      (command): command is AttackCommand =>
        command.type === 'attack' &&
        command.player === draft.player &&
        command.attacker === draft.attacker,
    );
  }

  const top = stack[stack.length - 1];
  if (top?.source !== draft.source) {
    return [];
  }

  return legal.filter(
    (command): command is ChooseTargetCommand =>
      command.type === 'chooseTarget' && command.player === draft.player,
  );
}

function BoardArea({
  testId,
  isActive,
  className,
  children,
}: {
  readonly testId: 'opponent-area' | 'player-area';
  readonly isActive: boolean;
  readonly className: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <motion.section
      animate={
        isActive
          ? {
              borderColor: ['rgba(245, 158, 11, 0.45)', 'rgba(249, 115, 22, 0.9)'],
              boxShadow: [
                'inset 0 0 0 1px rgba(245, 158, 11, 0.24), 0 0 18px rgba(245, 158, 11, 0.12)',
                'inset 0 0 0 1px rgba(249, 115, 22, 0.48), 0 0 28px rgba(249, 115, 22, 0.24)',
              ],
            }
          : { borderColor: 'rgba(244, 244, 245, 0.16)', boxShadow: '0 0 0 rgba(0, 0, 0, 0)' }
      }
      className={`border p-4 ${className}`}
      data-active={isActive ? 'true' : 'false'}
      data-testid={testId}
      transition={
        isActive
          ? { duration: 1.5, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }
          : { duration: 0.2 }
      }
    >
      {children}
    </motion.section>
  );
}

type FannedHandProps =
  | {
      readonly cards: PlayerView['viewer']['hand'];
      readonly owner: PlayerId;
      readonly cardRegistry: Map<string, CardDefinition>;
      readonly masked?: false;
      readonly playCommands: readonly PlayCardCommand[];
      readonly onCommand: (command: Command) => void;
    }
  | {
      readonly cardCount: number;
      readonly owner: PlayerId;
      readonly masked: true;
    };

function FannedHand(props: FannedHandProps): JSX.Element {
  const count = props.masked ? props.cardCount : props.cards.length;
  const layoutId = props.masked ? `opponent-hand-${props.owner}` : `hand-${props.owner}`;

  return (
    <LayoutGroup id={layoutId}>
      <ul
        className="flex min-h-[12.5rem] items-end justify-center overflow-x-auto overflow-y-visible px-8 pb-2 pt-6"
        data-testid={props.masked ? `opponent-${props.owner}` : `own-hand-${props.owner}`}
        tabIndex={0}
      >
        {Array.from({ length: count }).map((_, index) => {
          const fan = fanTransform(index, count);

          if (props.masked) {
            return (
              <motion.li
                aria-label={`Hidden card ${index + 1}`}
                className="-mx-3 list-none"
                data-testid={`opponent-card-${index}`}
                key={index}
                layout
                layoutId={`opp-${props.owner}-${index}`}
                animate={{ rotate: fan.rotate, y: fan.y }}
                style={{ transformOrigin: '50% 100%' }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              >
                <Card masked />
              </motion.li>
            );
          }

          const card = props.cards[index]!;
          // Resolve the viewer's own card through the registry so custom cards
          // show their real name/type/cost. The opponent path never gets the
          // registry, so hidden information stays masked.
          const def = props.cardRegistry.get(card.kind);
          const playCommand = props.playCommands.find((command) => command.instance === card.id);
          const isPlayDisabled = playCommand === undefined;

          return (
            <motion.li
              className={`-mx-3 list-none${isPlayDisabled ? ' opacity-50' : ''}`}
              data-card-kind={card.kind}
              data-testid={`own-card-${props.owner}`}
              key={card.id}
              layout
              layoutId={card.id}
              initial={{ opacity: 0, x: 72, y: -44, scale: 0.78, rotate: fan.rotate + 7 }}
              animate={{ opacity: 1, x: 0, y: fan.y, scale: 1, rotate: fan.rotate }}
              style={{ transformOrigin: '50% 100%' }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            >
              <Card kind={card.kind} name={def?.name} type={def?.type} cost={def?.cost.energy} />
              <button
                aria-label="Play"
                data-card-kind={card.kind}
                data-testid={`play-card-${card.id}`}
                disabled={isPlayDisabled}
                type="button"
                onClick={() => {
                  if (playCommand) props.onCommand(playCommand);
                }}
              >
                Jugar
              </button>
            </motion.li>
          );
        })}
      </ul>
    </LayoutGroup>
  );
}

function fanTransform(
  index: number,
  count: number,
): { readonly rotate: number; readonly y: number } {
  const center = (count - 1) / 2;
  const offset = index - center;

  return {
    rotate: offset * 4,
    y: Math.abs(offset) * 4,
  };
}

type BattlefieldUnit = PlayerView['viewer']['battlefield'][number];

type BattlefieldStripMode =
  | { readonly type: 'plain' }
  | {
      readonly type: 'attacker';
      readonly legalAttackCommands: readonly AttackCommand[];
      readonly selectedAttacker: CardInstanceId | null;
      readonly onSelectAttacker: (instanceId: CardInstanceId) => void;
    }
  | {
      readonly type: 'target';
      readonly targetKind: 'attack' | 'chooseTarget';
      readonly targetCommands: readonly TargetCommand[];
      readonly onTargetCommand: (command: TargetCommand) => void;
    };

function BattlefieldStrip({
  units,
  owner,
  cardRegistry,
  mode,
}: {
  readonly units: readonly BattlefieldUnit[];
  readonly owner: PlayerId;
  readonly cardRegistry: Map<string, CardDefinition>;
  readonly mode?: BattlefieldStripMode;
}): JSX.Element {
  const stripMode: BattlefieldStripMode = mode ?? { type: 'plain' };

  return (
    <div
      className="mt-4 rounded border border-[color:var(--oc-border)] bg-zinc-950/80 px-3 py-3 text-sm text-zinc-400"
      data-testid={`battlefield-${owner}`}
    >
      {units.length === 0 ? (
        <span>No units</span>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {units.map((unit) => {
            const def = cardRegistry.get(unit.kind);
            const remainingHealth = unit.health - unit.damage;
            const isSelected =
              stripMode.type === 'attacker' && stripMode.selectedAttacker === unit.id;
            const attackCommand =
              stripMode.type === 'attacker'
                ? stripMode.legalAttackCommands.find((command) => command.attacker === unit.id)
                : undefined;
            const targetCommand =
              stripMode.type === 'target'
                ? stripMode.targetCommands.find((command) => command.target === unit.id)
                : undefined;

            return (
              <li
                className={`list-none rounded border border-[color:var(--oc-border)] bg-zinc-900/70 p-2 ${
                  unit.exhausted ? 'opacity-60' : ''
                } ${isSelected ? 'ring-2 ring-orange-300' : ''}`}
                data-attack={unit.attack}
                data-damage={unit.damage}
                data-exhausted={String(unit.exhausted)}
                data-health={remainingHealth}
                data-selected={isSelected ? 'true' : 'false'}
                data-testid={`bf-unit-${unit.id}`}
                key={unit.id}
              >
                <Card kind={unit.kind} name={def?.name} type={def?.type} cost={def?.cost.energy} />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-100">
                  <span className="rounded bg-zinc-800 px-2 py-1">ATK {unit.attack}</span>
                  <span className="rounded bg-zinc-800 px-2 py-1">HP {remainingHealth}</span>
                  {unit.exhausted ? (
                    <span className="rounded border border-yellow-400/40 px-2 py-1 text-yellow-100">
                      Exhausted
                    </span>
                  ) : null}
                </div>
                {stripMode.type === 'attacker' ? (
                  <button
                    aria-label="Attack"
                    className={`mt-2 w-full rounded border border-[color:var(--oc-accent)] px-2 py-1 text-xs font-semibold ${
                      attackCommand
                        ? 'bg-[color:var(--oc-accent-soft)] text-orange-100 hover:bg-orange-500/25'
                        : 'cursor-not-allowed text-zinc-500 opacity-60'
                    }`}
                    data-testid={`attack-with-${unit.id}`}
                    disabled={!attackCommand}
                    type="button"
                    onClick={() => stripMode.onSelectAttacker(unit.id)}
                  >
                    Atacar
                  </button>
                ) : null}
                {stripMode.type === 'target' && targetCommand ? (
                  <button
                    className="mt-2 w-full rounded border border-red-400/60 bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/25"
                    data-testid={`${stripMode.targetKind === 'attack' ? 'attack-target' : 'choose-target'}-${unit.id}`}
                    type="button"
                    onClick={() => stripMode.onTargetCommand(targetCommand)}
                  >
                    {stripMode.targetKind === 'attack' ? 'Target' : 'Choose'}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BaseBadge({
  player,
  base,
  energy,
}: {
  readonly player: PlayerId;
  readonly base: number;
  readonly energy: number;
}): JSX.Element {
  return (
    <span className="inline-flex overflow-hidden rounded border border-zinc-700/70 bg-zinc-900 text-xs text-zinc-300">
      <span className="border-r border-zinc-700/70 px-2 py-1">
        HP{' '}
        <span className="font-semibold text-zinc-100" data-testid={`base-${player}`}>
          {base}
        </span>
      </span>
      <span className="px-2 py-1">
        ⚡{' '}
        <span className="font-semibold text-zinc-100" data-testid={`energy-${player}`}>
          {energy}
        </span>
      </span>
    </span>
  );
}

function otherPlayer(player: PlayerId): PlayerId {
  return player === p1 ? p2 : p1;
}

function SparkBurst(): JSX.Element {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
      {[0, 1, 2, 3, 4].map((index) => (
        <span className={`oc-spark oc-spark-${index + 1}`} key={index}>
          {index % 2 === 0 ? '*' : '+'}
        </span>
      ))}
    </div>
  );
}

function CountBadge({
  label,
  value,
  testId,
}: {
  readonly label: string;
  readonly value: number;
  readonly testId?: string;
}): JSX.Element {
  return (
    <div className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="text-lg font-semibold" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

function ReplayPanel({
  replayInput,
  replay,
  pasteValidation,
  pasteStatus,
  onReplayInput,
  onVerify,
  onPaste,
}: {
  readonly replayInput: string;
  readonly replay: ReplayState;
  readonly pasteValidation: PasteValidationState | null;
  readonly pasteStatus: 'idle' | 'pasted' | 'failed' | 'unavailable';
  readonly onReplayInput: (value: string) => void;
  readonly onVerify: () => void;
  readonly onPaste: () => void;
}): JSX.Element {
  return (
    <section className="rounded border border-[color:var(--oc-border)] bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Replay verify</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm hover:bg-zinc-800"
            data-testid="paste-replay"
            type="button"
            onClick={onPaste}
          >
            Paste from clipboard
          </button>
          <button
            className="rounded border border-[color:var(--oc-border)] px-3 py-2 text-sm hover:bg-zinc-800"
            type="button"
            onClick={onVerify}
          >
            Verify
          </button>
        </div>
      </div>
      <textarea
        className="min-h-40 w-full rounded border border-[color:var(--oc-border)] bg-zinc-950 p-3 font-mono text-sm text-zinc-100"
        data-testid="replay-input"
        onChange={(event) => onReplayInput(event.currentTarget.value)}
        placeholder='{"schemaVersion":"0.1.0",...}'
        value={replayInput}
      />
      {pasteStatus === 'pasted' ? (
        <p className="mt-2 text-sm text-emerald-200">Pasted from clipboard</p>
      ) : null}
      {pasteStatus === 'failed' ? (
        <p className="mt-2 text-sm text-red-200">Clipboard read failed — paste manually</p>
      ) : null}
      {pasteStatus === 'unavailable' ? (
        <p className="mt-2 text-sm text-red-200">Clipboard API not available — paste manually</p>
      ) : null}
      {pasteValidation ? (
        <p
          className={`mt-2 text-sm ${
            pasteValidation.status === 'valid-shape' ? 'text-emerald-200' : 'text-yellow-200'
          }`}
          data-testid="paste-validation"
        >
          {pasteValidation.message}
        </p>
      ) : null}
      <ReplayResult replay={replay} />
    </section>
  );
}

function validatePastedEnvelopeShape(pasted: string): PasteValidationState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(pasted);
  } catch {
    return { status: 'invalid-json', message: 'Pasted content is not valid JSON' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      status: 'missing-fields',
      message:
        'Looks like JSON but missing fields: schemaVersion, seed, setupOpts, commands, finalStateHash',
    };
  }

  const requiredFields = ['schemaVersion', 'seed', 'setupOpts', 'commands', 'finalStateHash'];
  const missingFields = requiredFields.filter(
    (field) => !Object.prototype.hasOwnProperty.call(parsed, field),
  );

  if (missingFields.length > 0) {
    return {
      status: 'missing-fields',
      message: `Looks like JSON but missing fields: ${missingFields.join(', ')}`,
    };
  }

  return {
    status: 'valid-shape',
    message: 'Looks like a valid envelope. Click Verify to confirm.',
  };
}

function ReplayResult({ replay }: { readonly replay: ReplayState }): JSX.Element | null {
  if (replay.status === 'idle') {
    return null;
  }

  if (replay.status === 'error') {
    return (
      <p className="mt-3 text-sm text-red-200" data-testid="verify-result">
        {replay.message}
      </p>
    );
  }

  return (
    <div className="mt-3 grid gap-2 text-sm text-zinc-300" data-testid="verify-result">
      <p>ok: {String(replay.ok)}</p>
      <p>hash: {replay.hash}</p>
      <p>expected: {replay.expected}</p>
      <p>
        issues: {replay.issues.length === 0 ? 'none' : replay.issues.map(formatIssue).join('; ')}
      </p>
    </div>
  );
}

function hasLegalCommand(legal: readonly Command[], candidate: Command): boolean {
  return legal.some((command) => isSameCommand(command, candidate));
}

function isSameCommand(left: Command, right: Command): boolean {
  if (left.type !== right.type || left.player !== right.player) {
    return false;
  }

  switch (left.type) {
    case 'drawCard':
    case 'endPhase':
    case 'endTurn':
    case 'resolveStack':
      return true;
    case 'makeChoice':
      return right.type === 'makeChoice' && left.option === right.option;
    case 'playCard':
      return right.type === 'playCard' && left.instance === right.instance;
    case 'chooseTarget':
      return right.type === 'chooseTarget' && left.target === right.target;
    case 'attack':
      return (
        right.type === 'attack' && left.attacker === right.attacker && left.target === right.target
      );
  }
}

function nextTargetingAfterCommand(match: MatchState, command: Command): TargetingState {
  if (command.type !== 'playCard') {
    return { status: 'idle' };
  }

  const view = command.player === p1 ? match.p1View : match.p2View;
  const top = view.stack[view.stack.length - 1];
  const legal = legalCommands(match.handles[command.player]!);

  if (
    top !== undefined &&
    top.controller === command.player &&
    legal.some((candidate) => candidate.type === 'chooseTarget')
  ) {
    return {
      status: 'awaitingTarget',
      draft: { type: 'chooseTarget', player: command.player, source: top.source },
    };
  }

  return { status: 'idle' };
}

function deriveReplayArtifacts(match: MatchState): ReplayArtifacts {
  const draft: ReplayEnvelopeV1 = {
    schemaVersion: '0.1.0',
    seed: match.seed,
    setupOpts: match.setupOpts,
    commands: match.commands,
    finalStateHash: '',
  };
  const result = replayEnvelope(draft);
  const events = match.commands.map((command, commandIndex): EventLogEntry => {
    return { index: commandIndex, commandIndex, event: commandToEvent(command) };
  });

  return { events, hash: result.hash, issues: result.issues };
}

function deriveHashMatch(match: MatchState, replayHash: string): 'match' | 'mismatch' {
  const envelope: ReplayEnvelopeV1 = {
    schemaVersion: '0.1.0',
    seed: match.seed,
    setupOpts: match.setupOpts,
    commands: match.commands,
    finalStateHash: replayHash,
  };
  const result = replayEnvelope(envelope);
  const replayP1View = viewMatch(result.finalHandles[p1]!);
  const replayP2View = viewMatch(result.finalHandles[p2]!);
  const localPublicHash = hashState({ p1: match.p1View, p2: match.p2View });
  const replayPublicHash = hashState({ p1: replayP1View, p2: replayP2View });

  return result.ok && localPublicHash === replayPublicHash ? 'match' : 'mismatch';
}

function commandToEvent(command: Command): CommandEvent {
  switch (command.type) {
    case 'drawCard':
      return { type: 'cardDrawn', player: command.player };
    case 'endPhase':
      return { type: 'phaseAdvanced', player: command.player };
    case 'endTurn':
      return { type: 'turnEnded', player: command.player };
    case 'playCard':
      return { type: 'cardPlayed', player: command.player };
    case 'chooseTarget':
      return { type: 'targetChosen', player: command.player, target: command.target };
    case 'resolveStack':
      return { type: 'stackResolved', player: command.player };
    case 'makeChoice':
      return { type: 'choiceMade', player: command.player, option: command.option };
    case 'attack':
      return { type: 'attackDeclared', player: command.player, target: command.target };
  }
}

function formatEvent(event: CommandEvent): string {
  switch (event.type) {
    case 'cardDrawn':
      return `${event.player} drew a card`;
    case 'phaseAdvanced':
      return `${event.player} advanced phase`;
    case 'turnEnded':
      return `${event.player} ended turn`;
    case 'cardPlayed':
      return `${event.player} played a card`;
    case 'attackDeclared':
      return `${event.player} attacked ${event.target}`;
    case 'targetChosen':
      return `${event.player} chose ${event.target}`;
    case 'stackResolved':
      return `${event.player} resolved stack`;
    case 'choiceMade':
      return `${event.player} chose option ${String(event.option + 1)}`;
  }
}

function buildSetupFromFormat(
  seed: number,
  options: {
    readonly customCards: CardDefinition[] | null;
    readonly decklist: readonly CardKind[] | null;
  },
): SetupOpts {
  const format = loadFormat();
  if (
    options.decklist === null &&
    options.customCards === null &&
    format.name === FOUNDRY_FORMAT.name &&
    format.deckSize === FOUNDRY_FORMAT.deckSize
  ) {
    return createFoundrySetup(seed, players);
  }
  // Custom cards drive the playable kinds; fall back to the built-in set so
  // cardKinds is never empty (the engine cycles the deck over these kinds).
  const activeDefs =
    options.decklist !== null
      ? mergeCardDefinitions(loadCustomCards())
      : options.customCards && options.customCards.length > 0
        ? options.customCards
        : Object.values(BUILTIN_DEFINITIONS);
  const kinds = activeDefs.map((card) => card.kind);
  const cards: CardSpec[] = activeDefs.map(cardDefinitionToSpec);
  const setup: SetupOpts = {
    seed,
    players,
    deckSize: format.deckSize,
    openingHandSize: format.openingHandSize,
    baseTotal: format.baseTotal,
    startingEnergy: format.startingEnergy,
    cardKinds: kinds,
    cards,
    ...(format.ruleset === undefined ? {} : { ruleset: format.ruleset }),
  };
  return options.decklist !== null ? { ...setup, decklist: options.decklist } : setup;
}

function project(
  handles: Record<PlayerId, ViewerHandle>,
  seed: number,
  setupOpts: SetupOpts,
  commands: readonly Command[],
): MatchState {
  return {
    handles,
    p1View: viewMatch(handles[p1]!),
    p2View: viewMatch(handles[p2]!),
    seed,
    setupOpts,
    commands,
  };
}

function isShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

function shortHash(hash: string): string {
  return hash === 'no match' ? hash : `${hash.slice(0, 12)}...`;
}

function formatIssue(issue: ValidationIssue): string {
  return `${issue.code}: ${issue.message}`;
}
