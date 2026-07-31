import type {
  OpponentPlayerView,
  SpectatorView as SpectatorViewState,
  StackItem,
} from '@opencards/core';
import { Card } from './Card.js';

/**
 * Read-only projection of a live match for a spectator. Both seats are shown
 * with identical, fully masked treatment (no real hand for anyone), and there
 * are deliberately no interactive controls: a spectator has no seat and no
 * legal commands, so any Play/Attack/target button would be wrong here.
 */
export function SpectatorView({ view }: { view: SpectatorViewState }): JSX.Element {
  return (
    <section
      className="oc-spectator-board overflow-hidden rounded border border-white/15 bg-zinc-950/60 shadow-2xl shadow-black/50"
      data-testid="spectator-board"
    >
      {view.winner ? (
        <div
          className="border-b border-emerald-400/40 bg-emerald-500/15 px-4 py-3 text-center text-lg font-semibold text-emerald-100"
          data-testid="spectator-winner"
        >
          {view.winner} wins
        </div>
      ) : null}

      <div
        className="flex flex-col gap-2 border-b border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200 sm:flex-row sm:items-center sm:gap-5"
        data-testid="spectator-turn-info"
      >
        <span data-testid="spectator-turn">Turn: {view.turn}</span>
        <span data-testid="spectator-phase">Phase: {view.phase}</span>
        <span data-testid={`spectator-active-${view.activePlayer}`}>
          Active: {view.activePlayer}
        </span>
      </div>

      <div className="grid gap-4 p-4" data-testid="spectator-players">
        {Object.values(view.players).map((player) => (
          <SpectatorPlayer key={player.id} player={player} />
        ))}
      </div>

      <div className="border-t border-white/10 p-4">
        <SpectatorStack stack={view.stack} />
      </div>
    </section>
  );
}

function SpectatorPlayer({ player }: { player: OpponentPlayerView }): JSX.Element {
  return (
    <section
      className="rounded border border-white/10 bg-black/25 p-4"
      data-testid={`spectator-player-${player.id}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-[color:var(--oc-border)] px-2 py-1 text-sm font-semibold">
            {player.id}
          </span>
          <span className="text-sm text-zinc-400" data-testid={`spectator-hand-count-${player.id}`}>
            Hand {player.hand.length} · Deck {player.deck.count}
          </span>
        </div>
        <div className="inline-flex overflow-hidden rounded border border-zinc-700/70 bg-zinc-900 text-xs text-zinc-300">
          <span className="border-r border-zinc-700/70 px-2 py-1">
            HP{' '}
            <span
              className="font-semibold text-zinc-100"
              data-testid={`spectator-base-${player.id}`}
            >
              {player.base}
            </span>
          </span>
          <span className="px-2 py-1">
            ⚡{' '}
            <span
              className="font-semibold text-zinc-100"
              data-testid={`spectator-energy-${player.id}`}
            >
              {player.energy}
            </span>
          </span>
        </div>
      </div>

      <ul
        className="flex min-h-28 items-end gap-1 overflow-x-auto px-1 pb-1 pt-4"
        data-testid={`spectator-hand-${player.id}`}
      >
        {player.hand.map((_, index) => (
          <li className="h-28 w-20 list-none shrink-0" key={index}>
            <Card masked testId={`spectator-hand-card-${player.id}-${String(index)}`} />
          </li>
        ))}
      </ul>

      <div
        className="mt-3 rounded border border-[color:var(--oc-border)] bg-zinc-950/80 px-3 py-3 text-sm text-zinc-400"
        data-testid={`spectator-battlefield-${player.id}`}
      >
        {player.battlefield.length === 0 ? (
          <span>No units</span>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {player.battlefield.map((unit) => {
              const remainingHealth = unit.health - unit.damage;
              return (
                <li
                  className="list-none rounded border border-[color:var(--oc-border)] bg-zinc-900/70 p-2"
                  data-testid={`spectator-bf-unit-${player.id}-${unit.id}`}
                  key={unit.id}
                >
                  <Card kind={unit.kind} />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-100">
                    <span className="rounded bg-zinc-800 px-2 py-1">ATK {unit.attack}</span>
                    <span className="rounded bg-zinc-800 px-2 py-1">HP {remainingHealth}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"
        data-testid={`spectator-zones-${player.id}`}
      >
        <ZoneBadge label="Deck" value={player.deck.count} />
        <ZoneBadge label="Discard" value={player.discard.length} />
        <ZoneBadge label="Exile" value={player.exile.length} />
        <ZoneBadge label="Battlefield" value={player.battlefield.length} />
      </div>
    </section>
  );
}

function ZoneBadge({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded border border-[color:var(--oc-border)] bg-zinc-950 px-3 py-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function SpectatorStack({ stack }: { stack: readonly StackItem[] }): JSX.Element {
  return (
    <section
      className="rounded border border-[color:var(--oc-border)] bg-zinc-950/85 p-3 text-sm text-zinc-300"
      data-testid="spectator-stack"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">Stack</h2>
      </div>
      {stack.length === 0 ? (
        <p className="text-xs text-zinc-500">Stack empty</p>
      ) : (
        <ol className="grid gap-2">
          {stack.map((item) => (
            <li
              className="rounded border border-[color:var(--oc-border)] bg-zinc-900/80 px-3 py-2"
              data-testid={`spectator-stack-item-${item.source}`}
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
