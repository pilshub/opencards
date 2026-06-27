/** Branded player identifier used as a stable state key. */
export type PlayerId = string & { readonly __brand: 'PlayerId' };

/** Engine-local card specification defining type, cost, and optional combat stats. */
export interface CardSpec {
  readonly kind: CardKind;
  readonly type: 'unit' | 'tactic';
  readonly cost: number; // energy cost, integer >= 0
  readonly attack?: number; // units only
  readonly health?: number; // units only
}

/** Stable card definition identifier. */
export type CardKind = string;

/** Branded card instance identifier unique within a match. */
export type CardInstanceId = string & { readonly __brand: 'CardInstanceId' };

/** Canonical zone identifiers supported by the Phase 1 kernel. */
export type ZoneId = 'hand' | 'deck' | 'discard' | 'exile' | 'battlefield';

/** Turn phase identifiers supported by the Phase 1 kernel. */
export type Phase = 'start' | 'main' | 'combat' | 'end';

/** Opaque deterministic random number generator state. */
export interface RNGState {
  /** Unsigned non-zero xorshift32 state value. */
  readonly value: number;
}

/** Card instance stored in zones. */
export interface CardInstance {
  /** Stable instance id. */
  readonly id: CardInstanceId;
  /** Card definition id. */
  readonly kind: CardKind;
}

/** Ordered card zone. */
export type Zone = CardInstance[];

/** Canonical per-player state. */
export interface Player {
  /** Stable player id. */
  readonly id: PlayerId;
  /** Cards currently held by the player. */
  readonly hand: Zone;
  /** Face-down draw pile with the top card at index zero. */
  readonly deck: Zone;
  /** Public discard pile. */
  readonly discard: Zone;
  /** Public exile pile. */
  readonly exile: Zone;
  /** Public battlefield. */
  readonly battlefield: Zone;
  /** Player's base (life total). Public information. */
  readonly base: number;
  /** Player's current energy pool. Public information. */
  readonly energy: number;
}

/** Canonical match state. */
export interface State {
  /** Current deterministic random number generator state. */
  readonly rng: RNGState;
  /** Players keyed by stable id. */
  readonly players: Record<PlayerId, Player>;
  /** Player whose turn is active. */
  readonly activePlayer: PlayerId;
  /** Current turn phase. */
  readonly phase: Phase;
  /** One-based turn number. */
  readonly turn: number;
  /** Winner of the match, null while the game is live. */
  readonly winner: PlayerId | null;
  /** Card database indexed by kind. Part of canonical state and replay hash. */
  readonly cards: Record<CardKind, CardSpec>;
}

/** Player command accepted by the dispatcher. */
export type Command =
  | { readonly type: 'drawCard'; readonly player: PlayerId }
  | { readonly type: 'endPhase'; readonly player: PlayerId }
  | { readonly type: 'endTurn'; readonly player: PlayerId }
  | { readonly type: 'playCard'; readonly player: PlayerId; readonly instance: CardInstanceId };

/** Durable event emitted by successful commands. */
export type Event =
  | { readonly type: 'cardDrawn'; readonly player: PlayerId; readonly instance: CardInstance }
  | {
      readonly type: 'phaseAdvanced';
      readonly player: PlayerId;
      readonly from: Phase;
      readonly to: Phase;
    }
  | {
      readonly type: 'turnEnded';
      readonly player: PlayerId;
      readonly nextPlayer: PlayerId;
      readonly turn: number;
    }
  | {
      readonly type: 'resourceGained';
      readonly player: PlayerId;
      readonly resource: 'energy';
      readonly amount: number;
    }
  | { readonly type: 'gameEnded'; readonly winner: PlayerId }
  | {
      readonly type: 'cardPlayed';
      readonly player: PlayerId;
      readonly instance: CardInstance;
      readonly to: ZoneId;
    }
  | {
      readonly type: 'resourceSpent';
      readonly player: PlayerId;
      readonly resource: 'energy';
      readonly amount: number;
    };

/** Structured validation issue returned instead of throwing for invalid commands. */
export interface ValidationIssue {
  /** Stable issue code. */
  readonly code: string;
  /** Human-readable issue message. */
  readonly message: string;
}

/** Result returned by command application. */
export interface ApplyResult {
  /** Resulting state, unchanged when issues are present. */
  readonly state: State;
  /** Events emitted by the command. */
  readonly events: readonly Event[];
  /** Validation issues that prevented the command. */
  readonly issues: readonly ValidationIssue[];
}

/**
 * Masked card entry for hidden opponent hand zones. Carries no canonical
 * identity by design: leaking `id` or `kind` to the wrong viewer would let
 * a consumer derive the hidden card via the deterministic setup order.
 * Per-view slot tokens for animation will be introduced in a Phase 5 ADR
 * if the UI needs them.
 */
export interface MaskedCardView {
  /** Marker that this entry's identity is hidden from the viewer. */
  readonly masked: true;
}

/** Hidden deck projection exposing only the count. */
export interface HiddenDeckView {
  /** Number of cards in the hidden deck. */
  readonly count: number;
}

/** Own-player projection visible to the viewer. */
export interface OwnPlayerView {
  /** Stable player id. */
  readonly id: PlayerId;
  /** Full own hand. */
  readonly hand: readonly CardInstance[];
  /** Full own deck. */
  readonly deck: readonly CardInstance[];
  /** Public discard pile. */
  readonly discard: readonly CardInstance[];
  /** Public exile pile. */
  readonly exile: readonly CardInstance[];
  /** Public battlefield. */
  readonly battlefield: readonly CardInstance[];
  /** Base (life total). Public information. */
  readonly base: number;
  /** Current energy pool. Public information. */
  readonly energy: number;
}

/** Opponent projection visible to the viewer. */
export interface OpponentPlayerView {
  /** Stable player id. */
  readonly id: PlayerId;
  /** Masked opponent hand. */
  readonly hand: readonly MaskedCardView[];
  /** Opponent deck count. */
  readonly deck: HiddenDeckView;
  /** Public discard pile. */
  readonly discard: readonly CardInstance[];
  /** Public exile pile. */
  readonly exile: readonly CardInstance[];
  /** Public battlefield. */
  readonly battlefield: readonly CardInstance[];
  /** Base (life total). Public information. */
  readonly base: number;
  /** Current energy pool. Public information. */
  readonly energy: number;
}

/** Hidden-information-safe state projection for one viewer. */
export interface PlayerView {
  /** Full projection for the viewing player. */
  readonly viewer: OwnPlayerView;
  /** Opponent projections keyed by stable id. */
  readonly opponents: Record<PlayerId, OpponentPlayerView>;
  /** Player whose turn is active. */
  readonly activePlayer: PlayerId;
  /** Current turn phase. */
  readonly phase: Phase;
  /** One-based turn number. */
  readonly turn: number;
  /** Winner of the match, null while the game is live. */
  readonly winner: PlayerId | null;
}
