import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import type {
  CardKind,
  Command,
  PlayerId,
  PlayerView,
  ReplayEnvelopeV1,
  SetupOpts,
  ValidationIssue,
  ViewerHandle,
} from '@opencards/core';
import { applyCommand, hashState, replayEnvelope, startMatch, viewMatch } from '@opencards/core';
import { Card } from './components/Card.js';

const p1 = 'p1' as PlayerId;
const p2 = 'p2' as PlayerId;
const cardKinds: readonly CardKind[] = ['spark-adept', 'ember-guard', 'flare-strike'];
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

export default function App({
  defaultSetup = buildSetup,
  matchLogLimit,
}: AppProps = {}): JSX.Element {
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
  const exportedEnvelopeRef = useRef<HTMLTextAreaElement | null>(null);
  const currentHash = useMemo(() => (match ? hashState(match.p1View) : 'no match'), [match]);
  const rawLimit = matchLogLimit ?? 50;
  const logLimit = Number.isFinite(rawLimit) ? Math.max(1, rawLimit) : 50;

  function startNewGame(): void {
    const setupOpts = defaultSetup(seed);
    const started = startMatch(setupOpts);
    setMatch(project(started.handles, seed, setupOpts, []));
    setErrors({});
    setReplay({ status: 'idle' });
    setPasteValidation(null);
    setExportedEnvelope(null);
    setExportMeta(null);
    setCopyStatus('idle');
    setPasteStatus('idle');
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
  }

  function drawCard(player: PlayerId): void {
    if (!match) {
      return;
    }

    const command: Command = { type: 'drawCard', player };
    const result = applyCommand(match.handles[player]!, command);
    setMatch(
      project(
        match.handles,
        match.seed,
        match.setupOpts,
        result.issues.length === 0 ? [...match.commands, command] : match.commands,
      ),
    );
    setErrors((current) => ({ ...current, [player]: result.issues }));
  }

  function flipViewer(): void {
    setViewer((current) => (current === p1 ? p2 : p1));
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
    <main className="min-h-screen bg-zinc-950 px-4 py-5 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-[color:var(--oc-border)] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">OpenCards · Ember Duel demo</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Hot-seat facade demo using projected player views.
            </p>
          </div>
          <div
            className="max-w-full overflow-hidden rounded border border-[color:var(--oc-border)] bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-300"
            title={currentHash}
          >
            <span className="mr-2 text-zinc-500">hash</span>
            <span data-testid="state-hash">{shortHash(currentHash)}</span>
          </div>
        </header>

        <section className="flex flex-col gap-3 rounded border border-[color:var(--oc-border)] bg-zinc-900/70 p-4 sm:flex-row sm:items-end">
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
          </div>
          <button
            className="rounded bg-[color:var(--oc-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 hover:brightness-110"
            type="button"
            onClick={startNewGame}
          >
            New Game
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
          <p className="text-xs text-zinc-500 sm:pb-3">n new · r reset · 1/2 draw · v flip</p>
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
            <div className="flex flex-col gap-3">
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
                    onClick={() => setViewer(player)}
                  >
                    View as {player}
                  </button>
                ))}
              </div>
              <BoardView
                activePlayer={match.p1View.activePlayer}
                commands={match.commands}
                issues={errors[viewer] ?? []}
                view={viewer === p1 ? match.p1View : match.p2View}
                viewer={viewer}
                onDraw={drawCard}
              />
            </div>
          ) : (
            <div className="rounded border border-[color:var(--oc-border)] bg-zinc-900 p-5 text-zinc-400">
              Start a new game to create both hot-seat player views.
            </div>
          )}
        </section>

        <MatchLog commands={match?.commands ?? []} limit={logLimit} />

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
    </main>
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

function BoardView({
  viewer,
  view,
  activePlayer,
  commands,
  issues,
  onDraw,
}: {
  readonly viewer: PlayerId;
  readonly view: PlayerView;
  readonly activePlayer: PlayerId;
  readonly commands: readonly Command[];
  readonly issues: readonly ValidationIssue[];
  readonly onDraw: (player: PlayerId) => void;
}): JSX.Element {
  const opponent = otherPlayer(viewer);
  const opponentView = view.opponents[opponent]!;

  return (
    <div
      className="overflow-hidden rounded border border-[color:var(--oc-border)] bg-zinc-950 shadow-2xl shadow-black/30"
      data-testid="board"
    >
      <BoardArea
        className="rounded-b-none border-x-0 border-t-0 bg-gradient-to-b from-zinc-900 to-zinc-950"
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
            <BaseBadge />
          </div>
          <FannedHand masked cardCount={opponentView.hand.length} owner={opponent} />
          <BattlefieldStrip count={opponentView.battlefield.length} />
        </div>
      </BoardArea>

      <div
        className="relative border-y border-[color:var(--oc-border)] bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.14),rgba(24,24,27,0.82)_42%,rgba(9,9,11,0.94))] px-4 py-5"
        data-testid="board-center"
      >
        <div className="absolute inset-x-6 top-1/2 h-px bg-gradient-to-r from-transparent via-orange-300/35 to-transparent" />
        <TurnInfo view={view} />
      </div>

      <PlayerArea
        activePlayer={activePlayer}
        commands={commands}
        issues={issues}
        onDraw={onDraw}
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
  commands,
  issues,
  onDraw,
}: {
  readonly viewer: PlayerId;
  readonly view: PlayerView;
  readonly activePlayer: PlayerId;
  readonly commands: readonly Command[];
  readonly issues: readonly ValidationIssue[];
  readonly onDraw: (player: PlayerId) => void;
}): JSX.Element {
  const isActive = viewer === activePlayer;
  const canDraw = view.viewer.deck.length > 0;
  const commandCount = commands.filter((command) => command.player === viewer).length;
  const [sparkBurstKey, setSparkBurstKey] = useState<number | null>(null);
  const previousCommandCount = useRef(commandCount);
  const previousViewer = useRef(viewer);

  useEffect(() => {
    if (previousViewer.current !== viewer) {
      previousViewer.current = viewer;
      previousCommandCount.current = commandCount;
      setSparkBurstKey(null);
      return undefined;
    }

    if (commandCount > previousCommandCount.current) {
      const burstKey = Date.now();
      setSparkBurstKey(burstKey);
      const timeoutId = window.setTimeout(() => setSparkBurstKey(null), 650);
      previousCommandCount.current = commandCount;

      return () => window.clearTimeout(timeoutId);
    }

    previousCommandCount.current = commandCount;
    return undefined;
  }, [commandCount, viewer]);

  return (
    <BoardArea
      className="rounded-t-none border-x-0 border-b-0 bg-gradient-to-b from-zinc-950 to-zinc-900"
      isActive={isActive}
      testId="player-area"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-[color:var(--oc-border)] px-2 py-1 text-sm font-semibold">
            {viewer}
          </span>
          <span className="text-sm text-zinc-400">Hand {view.viewer.hand.length}</span>
          <BaseBadge />
          <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
            Cmds: <span data-testid={`cmd-count-${viewer}`}>{commandCount}</span>
          </span>
        </div>
        <button
          className={`rounded border border-[color:var(--oc-accent)] bg-[color:var(--oc-accent-soft)] px-3 py-2 text-sm text-orange-100 hover:bg-orange-500/25 ${
            canDraw ? '' : 'cursor-not-allowed opacity-50'
          }`}
          disabled={!canDraw}
          type="button"
          onClick={() => onDraw(viewer)}
        >
          Draw card
        </button>
      </div>

      <FannedHand cards={view.viewer.hand} owner={viewer} />

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

      <BattlefieldStrip count={view.viewer.battlefield.length} />

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
      readonly masked?: false;
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

          return (
            <motion.li
              className="-mx-3 list-none"
              data-testid={`own-card-${props.owner}`}
              key={card.id}
              layout
              layoutId={card.id}
              initial={{ opacity: 0, x: 72, y: -44, scale: 0.78, rotate: fan.rotate + 7 }}
              animate={{ opacity: 1, x: 0, y: fan.y, scale: 1, rotate: fan.rotate }}
              style={{ transformOrigin: '50% 100%' }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            >
              <Card kind={card.kind} />
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

function BattlefieldStrip({ count }: { readonly count: number }): JSX.Element {
  return (
    <div className="mt-4 rounded border border-[color:var(--oc-border)] bg-zinc-950/80 px-3 py-3 text-sm text-zinc-400">
      Battlefield: {count === 0 ? 'empty' : count}
    </div>
  );
}

function BaseBadge(): JSX.Element {
  return (
    <span className="rounded border border-zinc-700/70 px-2 py-1 text-xs text-zinc-500">
      Base —
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
      <div className="text-xs text-zinc-500">{label}</div>
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

function buildSetup(seed: number): SetupOpts {
  return {
    seed,
    players,
    deckSize: 12,
    openingHandSize: 5,
    cardKinds,
  };
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
