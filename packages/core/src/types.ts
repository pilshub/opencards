/** Branded player identifier used as a stable state key. */
export type PlayerId = string & { readonly __brand: 'PlayerId' };

/** Battlefield unit with combat state. */
export interface Unit {
  /** Stable instance id matching the underlying CardInstance. */
  readonly id: CardInstanceId;
  /** Card definition id. */
  readonly kind: CardKind;
  /** Attack power from the card spec (0 if not specified). */
  readonly attack: number;
  /** Maximum health from the card spec (>=1). */
  readonly health: number;
  /** Damage taken so far; unit dies when damage >= health. */
  readonly damage: number;
  /** Cannot attack when true (summoning sickness or already attacked this turn). */
  readonly exhausted: boolean;
  /** Optional named counters carried by the unit. */
  readonly counters?: Readonly<Record<string, number>>;
  /** Temporary stat modifiers to revert at end of turn. */
  readonly temporaryModifiers?: readonly TemporaryStatModifier[];
}

/** Temporary unit stat delta that expires at end of turn. */
export interface TemporaryStatModifier {
  /** Modified stat. */
  readonly stat: 'attack' | 'health';
  /** Applied delta. */
  readonly amount: number;
}

/** Effect operations supported by the Phase 4 engine. */
export type EffectOp =
  | 'gainResource'
  | 'drawCards'
  | 'dealDamage'
  | 'heal'
  | 'summonUnit'
  | 'moveCard'
  | 'discardCards'
  | 'addCounter'
  | 'modifyStatUntilEndOfTurn';

/** Engine-local effect target selectors supported by the Phase 4 engine. */
export type TargetSelector =
  | 'self'
  | 'ownUnit'
  | 'enemyUnit'
  | 'enemyBase'
  | 'enemyUnitOrBase'
  | 'anyUnit';

/** Engine-local data effect attached to a CardSpec. */
export interface EngineEffect {
  readonly op: EffectOp;
  readonly amount?: number;
  readonly target?: TargetSelector;
  readonly kind?: CardKind;
  readonly counter?: string;
  readonly stat?: 'attack' | 'health';
  readonly from?: ZoneId;
  readonly to?: ZoneId;
}

/** Engine-local card specification defining type, cost, and optional combat stats. */
export interface CardSpec {
  readonly kind: CardKind;
  readonly type: 'unit' | 'tactic';
  readonly cost: number; // energy cost, integer >= 0
  readonly attack?: number; // units only
  readonly health?: number; // units only
  readonly effects?: readonly EngineEffect[]; // tactics only in Phase 4
}

/** Stable card definition identifier. */
export type CardKind = string;

/** Branded card instance identifier unique within a match. */
export type CardInstanceId = string & { readonly __brand: 'CardInstanceId' };

/** Canonical zone identifiers supported by the Phase 1 kernel. */
export type ZoneId = 'hand' | 'deck' | 'discard' | 'exile' | 'battlefield' | 'stack';

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

/** Stack entry for a played tactic. Top of stack is the last array element (LIFO). */
export interface StackItem {
  /** Source card instance id. */
  readonly source: CardInstanceId;
  /** Player who controls the stack item. */
  readonly controller: PlayerId;
  /** Source card kind. */
  readonly kind: CardKind;
  /** Effects resolved in order when this stack item resolves. */
  readonly effects: readonly EngineEffect[];
  /** Chosen target for targeted effects, null before selection or for no-target effects. */
  readonly target: CardInstanceId | 'base' | null;
}

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
  /** Public battlefield with combat state. */
  readonly battlefield: readonly Unit[];
  /** Player's base (life total). Public information. */
  readonly base: number;
  /** Player's current energy pool. Public information. */
  readonly energy: number;
  /** Whether this player has used their once-per-turn draw. Public information. */
  readonly drawnThisTurn: boolean;
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
  /** Public deterministic effect stack. Top of stack is the last element. */
  readonly stack: readonly StackItem[];
}

/** Player command accepted by the dispatcher. */
export type Command =
  | { readonly type: 'drawCard'; readonly player: PlayerId }
  | { readonly type: 'endPhase'; readonly player: PlayerId }
  | { readonly type: 'endTurn'; readonly player: PlayerId }
  | { readonly type: 'playCard'; readonly player: PlayerId; readonly instance: CardInstanceId }
  | {
      readonly type: 'chooseTarget';
      readonly player: PlayerId;
      readonly target: CardInstanceId | 'base';
    }
  | { readonly type: 'resolveStack'; readonly player: PlayerId }
  | {
      readonly type: 'attack';
      readonly player: PlayerId;
      readonly attacker: CardInstanceId;
      readonly target: CardInstanceId | 'base';
    };

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
    }
  | {
      readonly type: 'attackDeclared';
      readonly player: PlayerId;
      readonly attacker: CardInstanceId;
      readonly target: CardInstanceId | 'base';
    }
  | {
      readonly type: 'damageDealt';
      readonly target: CardInstanceId | 'base';
      readonly amount: number;
      readonly owner: PlayerId;
    }
  | {
      readonly type: 'healed';
      readonly target: CardInstanceId | 'base';
      readonly amount: number;
      readonly owner: PlayerId;
    }
  | {
      readonly type: 'targetChosen';
      readonly player: PlayerId;
      readonly source: CardInstanceId;
      readonly target: CardInstanceId | 'base';
    }
  | {
      readonly type: 'unitSummoned';
      readonly player: PlayerId;
      readonly unit: Unit;
    }
  | {
      readonly type: 'cardsDiscarded';
      readonly player: PlayerId;
      readonly instances: readonly CardInstance[];
    }
  | {
      readonly type: 'cardMoved';
      readonly instance: CardInstance;
      readonly from: ZoneId;
      readonly to: ZoneId;
    }
  | {
      readonly type: 'counterAdded';
      readonly target: CardInstanceId;
      readonly owner: PlayerId;
      readonly counter: string;
      readonly amount: number;
    }
  | {
      readonly type: 'statModified';
      readonly target: CardInstanceId;
      readonly owner: PlayerId;
      readonly stat: 'attack' | 'health';
      readonly amount: number;
    }
  | {
      readonly type: 'unitDestroyed';
      readonly owner: PlayerId;
      readonly instance: CardInstance;
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
  /** Public battlefield with combat state (public information). */
  readonly battlefield: readonly Unit[];
  /** Base (life total). Public information. */
  readonly base: number;
  /** Current energy pool. Public information. */
  readonly energy: number;
  /** Whether this player has used their once-per-turn draw. Public information. */
  readonly drawnThisTurn: boolean;
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
  /** Public battlefield with combat state (public information). */
  readonly battlefield: readonly Unit[];
  /** Base (life total). Public information. */
  readonly base: number;
  /** Current energy pool. Public information. */
  readonly energy: number;
  /** Whether this player has used their once-per-turn draw. Public information. */
  readonly drawnThisTurn: boolean;
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
  /** Public deterministic effect stack. */
  readonly stack: readonly StackItem[];
}
