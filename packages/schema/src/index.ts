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
} as const);

/** Stable validator issue code emitted by schema checks. */
export type IssueCode = (typeof ISSUE_CODES)[keyof typeof ISSUE_CODES];
