/**
 * @opencards/schema — JSON Schemas and runtime validators.
 *
 * Phase 0 stub. Phase 2 implements the card / decklist / format / replay
 * schemas plus the cross-field runtime validator. See docs/roadmap.md and
 * docs/adr/0002-effect-dsl-v1.md.
 */

/** Stable issue code namespace. Future codes follow the pattern OC-NNNN. */
export const SCHEMA_VERSION = '0.0.0' as const;

/** Issue codes the validator will emit. Populated in Phase 2. */
export const ISSUE_CODES = Object.freeze({
  UNKNOWN_EFFECT_OP: 'OC-0001',
  DUPLICATE_CARD_KIND: 'OC-0002',
  INVALID_DECK_SIZE: 'OC-0003',
  UNKNOWN_TARGET_SELECTOR: 'OC-0004',
  MISSING_UNIT_STATS: 'OC-0005',
  /** kind missing/empty or not lowercase kebab-case ^[a-z][a-z0-9-]*$ */
  INVALID_KIND: 'OC-0006',
  /** name missing or only whitespace */
  EMPTY_NAME: 'OC-0007',
  /** type not 'unit' or 'tactic' */
  UNSUPPORTED_CARD_TYPE: 'OC-0008',
  /** cost.energy not an integer >= 0 */
  INVALID_COST: 'OC-0009',
  /** unit stats present but attack < 0 or health < 1, or non-integers */
  INVALID_STATS: 'OC-0010',
  /** a tactic carries a stats object */
  UNEXPECTED_STATS: 'OC-0011',
  /** effect amount present but not an integer >= 0 */
  INVALID_EFFECT_AMOUNT: 'OC-0012',
  /** openingHandSize not an integer in [0, deckSize] */
  INVALID_OPENING_HAND: 'OC-0013',
  /** copyLimit not an integer >= 1 */
  INVALID_COPY_LIMIT: 'OC-0014',
  /** baseTotal not an integer >= 1 */
  INVALID_BASE_TOTAL: 'OC-0015',
  /** startingEnergy not an integer >= 0 */
  INVALID_STARTING_ENERGY: 'OC-0016',
  /** card copies exceed the active format copyLimit */
  COPY_LIMIT_EXCEEDED: 'OC-0017',
  /** decklist contains a kind that is not present in the active card database */
  UNKNOWN_CARD_KIND: 'OC-0018',
  /** ruleset root/id/version is malformed */
  INVALID_RULESET: 'OC-0019',
  /** phase order is empty, duplicated, unsupported, or misses startingPhase */
  INVALID_PHASE_ORDER: 'OC-0020',
  /** battlefield/hand limit is neither null nor a positive integer */
  INVALID_RULESET_LIMIT: 'OC-0021',
  /** energy progression configuration is malformed */
  INVALID_ENERGY_RULES: 'OC-0022',
  /** fatigue progression configuration is malformed */
  INVALID_FATIGUE_RULES: 'OC-0023',
  /** keyword is unknown or duplicated */
  INVALID_KEYWORD: 'OC-0024',
  /** triggered ability timing is unsupported */
  INVALID_ABILITY_TRIGGER: 'OC-0025',
  /** draft pick targets a kind outside the current choices or a completed draft */
  INVALID_DRAFT_PICK: 'OC-0026',
} as const);

/** Stable validator issue code emitted by schema checks. */
export type IssueCode = (typeof ISSUE_CODES)[keyof typeof ISSUE_CODES];

/** Card definition types: CardDefinition, CardType, CardCost, CardStats, EffectDef, TargetSelector. */
export type {
  CardDefinition,
  CardType,
  CardCost,
  CardStats,
  EffectDef,
  AbilityDef,
  TargetSelector,
  ValidationIssue,
  ValidationResult,
} from './card-definition.js';
/** Canonical target selector values for effect targeting. */
export {
  TARGET_SELECTORS,
  cardDefinitionToSpec,
  validateCardDefinition,
  validateCardDatabase,
} from './card-definition.js';
/** GameFormat type describing the rules/settings of a game format. */
export type { GameFormat } from './format.js';
/** Default frozen GameFormat value (Ember Duel). */
export { DEFAULT_FORMAT } from './format.js';
/** Validate an unknown value as a GameFormat. Collects all issues, never throws. */
export { validateFormat } from './format.js';
/** DecklistValidationContext type used to validate a deck against a card pool and format. */
export type { DecklistValidationContext } from './decklist.js';
/** Validate a decklist and hash a valid ordered decklist reproducibly. */
export { hashDecklist, validateDecklist } from './decklist.js';
/** Deterministic draft engine state and current choice types. */
export type { DraftState, DraftChoice } from './draft.js';
/** Deterministic draft engine: start a draft, read choices, pick, finalize. */
export { startDraft, currentChoice, pick, isDraftComplete, finalizeDecklist } from './draft.js';
/** Serializable ruleset contract and runtime validator. */
export type { Ruleset } from '@opencards/core';
export { validateRuleset } from './ruleset.js';
