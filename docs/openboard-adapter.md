# OpenBoard Adapter Guide

This guide documents the Phase 8 path for embedding OpenCards as a card deck,
hand, legal-command, and effect subsystem inside an external board-game host.
The host owns the board game. OpenCards owns only its deterministic card match.

## Stable Facade

Adapter code should import from the root package only:

```ts
import {
  applyCommand,
  legalCommands,
  replayEnvelope,
  startMatch,
  viewMatch,
} from '@opencards/core';
```

Use these facade calls as the adapter boundary:

- `startMatch(setupOpts)` creates one viewer-bound handle per player.
- `legalCommands(handle)` lists only commands legal for that handle's viewer.
- `applyCommand(handle, command)` advances the match through the command path.
- `viewMatch(handle)` returns the hidden-information-safe projection for that
  handle's viewer.
- `replayEnvelope(envelope)` replays and verifies an exported envelope. Passing
  a draft with `finalStateHash: ''` returns the computed `hash`, which can then
  be written back into the exported envelope.

Stable helpers also available at the root are `hashState`, `canonicalJson`,
`CORE_VERSION`, `seedRng`, `nextRng`, `nextRangeRng`, and `fisherYates`.

Do not import `@opencards/core/internal` from an OpenBoard adapter. Do not read
raw `State`, call `apply`, call `replay`, or import source files by path.

## Setup Input

Build the card subsystem from `SetupOpts`:

- `seed`
- `players`
- `deckSize`
- `openingHandSize`
- `cardKinds`
- optional `decklist`
- optional `baseTotal`
- optional `startingEnergy`
- optional `cards`

Edited cards are passed as `setupOpts.cards`. Each `CardSpec` may include
`effects`; those definitions are part of replay setup. There is no separate
`cardDbHash` field in the Phase 8 replay envelope.

Card instance ids created by setup follow `${player}-c${index}` with the index
zero-padded to at least two digits, for example `p1-c00`.

## Hidden-Info Projection Contract

`viewMatch(handle)` is the only supported read path for adapter UI.

The viewer projection includes full own hand and own deck identity. Opponent
hands are arrays of `{ masked: true }` entries with no `id` and no `kind`.
Opponent decks expose only `{ count }`. Public zones such as discard, exile,
battlefield, base, energy, phase, turn, winner, and stack are visible.

The host must keep player handles scoped to the right seat. A handle is bound
to one viewer; `viewMatch` and `legalCommands` do not accept a player override.

## Replay Envelope

The adapter should persist ordered OpenCards commands alongside the board-game
log. Export the card subsystem replay as:

```ts
{
  schemaVersion: '0.1.0',
  seed,
  setupOpts,
  commands,
  finalStateHash,
}
```

The final hash is the canonical OpenCards final state hash, computed by the
same replay path used for verification.

## Minimal Adapter Sketch

```ts
import {
  applyCommand,
  legalCommands,
  replayEnvelope,
  startMatch,
  viewMatch,
  type CardSpec,
  type Command,
  type PlayerId,
  type ReplayEnvelopeV1,
  type SetupOpts,
  type ViewerHandle,
} from '@opencards/core';

type CardSubsystem = {
  readonly seed: number;
  readonly setupOpts: SetupOpts;
  readonly handles: Record<PlayerId, ViewerHandle>;
  readonly commands: Command[];
};

export function createCardSubsystem(input: {
  seed: number;
  players: readonly PlayerId[];
  decklist: readonly string[];
  cards: readonly CardSpec[];
}): CardSubsystem {
  const setupOpts: SetupOpts = {
    seed: input.seed,
    players: input.players,
    deckSize: input.decklist.length,
    openingHandSize: 5,
    cardKinds: input.cards.map((card) => card.kind),
    decklist: input.decklist,
    cards: input.cards,
  };

  const started = startMatch(setupOpts);

  return {
    seed: input.seed,
    setupOpts,
    handles: started.handles,
    commands: [],
  };
}

export function projectCardsForSeat(subsystem: CardSubsystem, player: PlayerId) {
  const handle = subsystem.handles[player];
  if (!handle) {
    throw new Error(`No OpenCards handle for player ${player}`);
  }

  return {
    view: viewMatch(handle),
    legal: legalCommands(handle),
  };
}

export function submitCardCommand(subsystem: CardSubsystem, command: Command) {
  const handle = subsystem.handles[command.player];
  if (!handle) {
    throw new Error(`No OpenCards handle for player ${command.player}`);
  }

  const result = applyCommand(handle, command);
  if (result.issues.length > 0) {
    return { ok: false as const, issues: result.issues };
  }

  subsystem.commands.push(command);

  return {
    ok: true as const,
    projection: projectCardsForSeat(subsystem, command.player),
  };
}

export function exportCardReplay(subsystem: CardSubsystem): ReplayEnvelopeV1 {
  const draft: ReplayEnvelopeV1 = {
    schemaVersion: '0.1.0',
    seed: subsystem.seed,
    setupOpts: subsystem.setupOpts,
    commands: subsystem.commands,
    finalStateHash: '',
  };

  const verified = replayEnvelope(draft);
  return { ...draft, finalStateHash: verified.hash };
}
```

The board host can wrap these functions in its own action system, but the
OpenCards side should still move only by `Command` and read only by player
projection.
