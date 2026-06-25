/**
 * Card definition types and runtime validators for @opencards/schema.
 * Phase 2 implementation. See docs/adr/0002-effect-dsl-v1.md.
 */

import { isV1Operation } from '@opencards/effects';
import { ISSUE_CODES } from './index.js';
import type { IssueCode } from './index.js';

/** Discriminated union of supported card types. */
export type CardType = 'unit' | 'tactic';

/** Energy cost of playing a card. */
export interface CardCost {
  readonly energy: number;
}

/** Combat stats for unit cards. */
export interface CardStats {
  readonly attack: number;
  readonly health: number;
}

/** A single declarative effect on a card. */
export interface EffectDef {
  readonly op: string;
  readonly amount?: number;
  readonly target?: string;
}

/** Full definition of a single card in the card database. */
export interface CardDefinition {
  readonly kind: string;
  readonly name: string;
  readonly type: CardType;
  readonly cost: CardCost;
  readonly stats?: CardStats;
  readonly effects: readonly EffectDef[];
}

/** Canonical target selectors for effect targeting (ADR-0002). */
export const TARGET_SELECTORS = Object.freeze([
  'self',
  'ownUnit',
  'enemyUnit',
  'ownBase',
  'enemyBase',
  'enemyUnitOrBase',
  'anyUnit',
  'owner',
  'opponent',
] as const);

/** A valid target selector string. */
export type TargetSelector = (typeof TARGET_SELECTORS)[number];

/** A single validation issue emitted by the validator. */
export interface ValidationIssue {
  readonly code: IssueCode;
  readonly message: string;
}

/** Result of a validation run. ok is true iff issues is empty. */
export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}

const KIND_RE = /^[a-z][a-z0-9-]*$/;

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/**
 * Validate a single unknown value as a CardDefinition.
 * Collects ALL issues — never stops at first failure. Never throws.
 */
export function validateCardDefinition(value: unknown): ValidationResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      issues: [{ code: ISSUE_CODES.INVALID_KIND, message: 'card definition must be an object' }],
    };
  }

  const card = value as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  // kind
  if (typeof card['kind'] !== 'string' || !KIND_RE.test(card['kind'])) {
    issues.push({ code: ISSUE_CODES.INVALID_KIND, message: 'kind must match ^[a-z][a-z0-9-]*$' });
  }

  // name
  if (typeof card['name'] !== 'string' || card['name'].trim() === '') {
    issues.push({ code: ISSUE_CODES.EMPTY_NAME, message: 'name must be a non-empty string' });
  }

  // type
  const cardType = card['type'];
  const isUnit = cardType === 'unit';
  const isTactic = cardType === 'tactic';
  if (!isUnit && !isTactic) {
    issues.push({
      code: ISSUE_CODES.UNSUPPORTED_CARD_TYPE,
      message: `type must be 'unit' or 'tactic', got: ${String(cardType)}`,
    });
  }

  // cost
  const cost = card['cost'];
  if (
    cost === null ||
    typeof cost !== 'object' ||
    Array.isArray(cost) ||
    !isInteger((cost as Record<string, unknown>)['energy']) ||
    ((cost as Record<string, unknown>)['energy'] as number) < 0
  ) {
    issues.push({ code: ISSUE_CODES.INVALID_COST, message: 'cost.energy must be an integer >= 0' });
  }

  // stats
  const stats = card['stats'];
  if (isUnit) {
    if (stats === undefined || stats === null) {
      issues.push({
        code: ISSUE_CODES.MISSING_UNIT_STATS,
        message: 'unit cards must have a stats object',
      });
    } else if (typeof stats === 'object' && !Array.isArray(stats)) {
      const s = stats as Record<string, unknown>;
      const attack = s['attack'];
      const health = s['health'];
      if (
        !isInteger(attack) ||
        (attack as number) < 0 ||
        !isInteger(health) ||
        (health as number) < 1
      ) {
        issues.push({
          code: ISSUE_CODES.INVALID_STATS,
          message: 'stats.attack must be int >= 0 and stats.health must be int >= 1',
        });
      }
    } else {
      issues.push({
        code: ISSUE_CODES.INVALID_STATS,
        message: 'stats must be an object with attack and health',
      });
    }
  } else if (isTactic) {
    if (stats !== undefined) {
      issues.push({
        code: ISSUE_CODES.UNEXPECTED_STATS,
        message: 'tactic cards must not have a stats object',
      });
    }
  }

  // effects
  const effects = card['effects'];
  if (Array.isArray(effects)) {
    for (let i = 0; i < effects.length; i++) {
      const raw = effects[i];
      // Guard non-object effect entries (null/undefined/primitive/array) so the
      // validator never throws on malformed effect lists.
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        issues.push({
          code: ISSUE_CODES.UNKNOWN_EFFECT_OP,
          message: `effect[${i}] must be an object with an op`,
        });
        continue;
      }
      const effect = raw as Record<string, unknown>;
      // op
      if (typeof effect['op'] !== 'string' || !isV1Operation(effect['op'])) {
        issues.push({
          code: ISSUE_CODES.UNKNOWN_EFFECT_OP,
          message: `effect[${i}].op is not a known v1 operation: ${String(effect['op'])}`,
        });
      }
      // target
      if (effect['target'] !== undefined) {
        if (!(TARGET_SELECTORS as readonly string[]).includes(effect['target'] as string)) {
          issues.push({
            code: ISSUE_CODES.UNKNOWN_TARGET_SELECTOR,
            message: `effect[${i}].target is not a known selector: ${String(effect['target'])}`,
          });
        }
      }
      // amount
      if (effect['amount'] !== undefined) {
        if (!isInteger(effect['amount']) || (effect['amount'] as number) < 0) {
          issues.push({
            code: ISSUE_CODES.INVALID_EFFECT_AMOUNT,
            message: `effect[${i}].amount must be an integer >= 0`,
          });
        }
      }
    }
  }
  // missing/non-array effects: treated as fine (empty is allowed, and undefined just means no effects array to validate)

  return { ok: issues.length === 0, issues };
}

/**
 * Validate a list of CardDefinitions.
 * Runs validateCardDefinition on each element and also checks for duplicate kinds.
 * Never throws.
 */
export function validateCardDatabase(value: unknown): ValidationResult {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      issues: [{ code: ISSUE_CODES.INVALID_KIND, message: 'card database must be an array' }],
    };
  }

  const issues: ValidationIssue[] = [];
  const kindCounts = new Map<string, number>();

  for (const element of value) {
    const result = validateCardDefinition(element);
    issues.push(...result.issues);
    // Track kinds for duplicate detection
    if (
      element !== null &&
      typeof element === 'object' &&
      !Array.isArray(element) &&
      typeof (element as Record<string, unknown>)['kind'] === 'string' &&
      KIND_RE.test((element as Record<string, unknown>)['kind'] as string)
    ) {
      const kind = (element as Record<string, unknown>)['kind'] as string;
      kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
    }
  }

  for (const [kind, count] of kindCounts) {
    if (count > 1) {
      issues.push({
        code: ISSUE_CODES.DUPLICATE_CARD_KIND,
        message: `duplicate card kind: '${kind}'`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
