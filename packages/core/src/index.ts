/**
 * @opencards/core - deterministic engine kernel.
 */

import type { Command, PlayerId, PlayerView, State, ValidationIssue } from './types.js';
import type { ReplayEnvelopeV1 } from './replay.js';
import { apply } from './dispatcher.js';
import { replay } from './replay.js';
import { createInitialState, type SetupOpts } from './setup.js';
import { getView } from './view.js';

/** Current package version. Bumped together with the package.json. */
export const CORE_VERSION = '0.0.0' as const;

export type {
  CardInstanceId,
  CardKind,
  Command,
  HiddenDeckView,
  MaskedCardView,
  OpponentPlayerView,
  OwnPlayerView,
  Phase,
  PlayerId,
  PlayerView,
  RNGState,
  ValidationIssue,
  ZoneId,
} from './types.js';
export type { ReplayEnvelopeV1 } from './replay.js';
export type { SetupOpts } from './setup.js';
export { canonicalJson, hashState } from './hash.js';
export { nextRangeRng, nextRng, seedRng } from './rng.js';
export { fisherYates } from './shuffle.js';

/** Opaque public viewer handle. Raw state is intentionally hidden behind the facade. */
export type ViewerHandle = { readonly __brand: 'ViewerHandle' };

/** Result returned after starting a match through the public facade. */
export interface MatchStartResult {
  readonly handles: Record<PlayerId, ViewerHandle>;
}

/** Result returned after applying a command through the public facade. */
export interface MatchStepResult {
  readonly handle: ViewerHandle;
  readonly issues: readonly ValidationIssue[];
}

/** Replay verification result exposed by the public facade without raw state. */
export interface ReplayVerifyResult {
  readonly ok: boolean;
  readonly hash: string;
  readonly expected: string;
  readonly issues: readonly ValidationIssue[];
  readonly finalHandles: Record<PlayerId, ViewerHandle>;
}

type MatchInstance = { state: State };
type HandleData = { readonly match: MatchInstance; readonly viewer: PlayerId };

const handleData = new WeakMap<ViewerHandle, HandleData>();

/** Start a deterministic match and return one opaque viewer-bound handle per player. */
export function startMatch(opts: SetupOpts): MatchStartResult {
  const match: MatchInstance = { state: createInitialState(opts) };
  return { handles: bindPlayers(match, opts.players) };
}

/** Apply a command through a viewer handle and return the same advanced handle. */
export function applyCommand(handle: ViewerHandle, command: Command): MatchStepResult {
  const { match } = lookup(handle);
  const result = apply(match.state, command);
  match.state = result.state;
  return {
    handle,
    issues: result.issues,
  };
}

/** Read the hidden-information-safe player view bound to this handle. */
export function viewMatch(handle: ViewerHandle): PlayerView {
  const { match, viewer } = lookup(handle);
  return getView(match.state, viewer);
}

/** Replay an envelope and return verification details plus final viewer-bound handles. */
export function replayEnvelope(envelope: ReplayEnvelopeV1): ReplayVerifyResult {
  const result = replay(envelope);
  const match: MatchInstance = { state: result.state };
  return {
    ok: result.ok,
    hash: result.hash,
    expected: result.expected,
    issues: result.issues,
    finalHandles: bindPlayers(match, envelope.setupOpts.players),
  };
}

function bindPlayers(
  match: MatchInstance,
  players: readonly PlayerId[],
): Record<PlayerId, ViewerHandle> {
  const handles = {} as Record<PlayerId, ViewerHandle>;

  for (const viewer of players) {
    const handle = mkHandle();
    bind(handle, { match, viewer });
    handles[viewer] = handle;
  }

  return handles;
}

function mkHandle(): ViewerHandle {
  return Object.freeze({ __brand: 'ViewerHandle' as const }) as ViewerHandle;
}

function bind(handle: ViewerHandle, data: HandleData): void {
  handleData.set(handle, data);
}

function lookup(handle: ViewerHandle): HandleData {
  const data = handleData.get(handle);
  if (!data) {
    throw new Error('Invalid or expired ViewerHandle');
  }

  return data;
}
