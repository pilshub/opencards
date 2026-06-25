/**
 * GameFormat type and validator for @opencards/schema.
 * A GameFormat describes the rules/settings for a game session.
 */

import { ISSUE_CODES } from './index.js';
import type { ValidationIssue, ValidationResult } from './card-definition.js';

/** The rules/settings that govern a game format. */
export interface GameFormat {
  readonly name: string;
  readonly deckSize: number;
  readonly openingHandSize: number;
  readonly copyLimit: number;
  readonly baseTotal: number;
  readonly startingEnergy: number;
}

/** Default valid format for the Ember Duel demo. */
export const DEFAULT_FORMAT: GameFormat = Object.freeze({
  name: 'Ember Duel',
  deckSize: 12,
  openingHandSize: 5,
  copyLimit: 4,
  baseTotal: 20,
  startingEnergy: 0,
});

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/**
 * Validate an unknown value as a GameFormat.
 * Collects ALL issues — never stops at first failure. Never throws.
 */
export function validateFormat(value: unknown): ValidationResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      issues: [{ code: ISSUE_CODES.INVALID_DECK_SIZE, message: 'format must be an object' }],
    };
  }

  const fmt = value as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  // name: non-empty trimmed string
  if (typeof fmt['name'] !== 'string' || fmt['name'].trim() === '') {
    issues.push({ code: ISSUE_CODES.EMPTY_NAME, message: 'name must be a non-empty string' });
  }

  // deckSize: integer >= 1
  const deckSizeValid = isInteger(fmt['deckSize']) && (fmt['deckSize'] as number) >= 1;
  if (!deckSizeValid) {
    issues.push({
      code: ISSUE_CODES.INVALID_DECK_SIZE,
      message: 'deckSize must be an integer >= 1',
    });
  }

  // openingHandSize: integer >= 0 AND <= deckSize (when deckSize valid)
  const ohs = fmt['openingHandSize'];
  const ohsIsInt = isInteger(ohs);
  const ohsGe0 = ohsIsInt && (ohs as number) >= 0;
  const ohsLeDs = !deckSizeValid || (ohsIsInt && (ohs as number) <= (fmt['deckSize'] as number));
  if (!ohsGe0 || !ohsLeDs) {
    issues.push({
      code: ISSUE_CODES.INVALID_OPENING_HAND,
      message: 'openingHandSize must be an integer >= 0 and <= deckSize',
    });
  }

  // copyLimit: integer >= 1
  if (!isInteger(fmt['copyLimit']) || (fmt['copyLimit'] as number) < 1) {
    issues.push({
      code: ISSUE_CODES.INVALID_COPY_LIMIT,
      message: 'copyLimit must be an integer >= 1',
    });
  }

  // baseTotal: integer >= 1
  if (!isInteger(fmt['baseTotal']) || (fmt['baseTotal'] as number) < 1) {
    issues.push({
      code: ISSUE_CODES.INVALID_BASE_TOTAL,
      message: 'baseTotal must be an integer >= 1',
    });
  }

  // startingEnergy: integer >= 0
  if (!isInteger(fmt['startingEnergy']) || (fmt['startingEnergy'] as number) < 0) {
    issues.push({
      code: ISSUE_CODES.INVALID_STARTING_ENERGY,
      message: 'startingEnergy must be an integer >= 0',
    });
  }

  return { ok: issues.length === 0, issues };
}
