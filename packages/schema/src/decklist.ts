/**
 * Decklist validator and reproducible hash helpers for @opencards/schema.
 */

import { ISSUE_CODES } from './index.js';
import type { CardDefinition, ValidationIssue, ValidationResult } from './card-definition.js';
import type { GameFormat } from './format.js';

/** Context required to validate a decklist against the active editor data. */
export interface DecklistValidationContext {
  readonly format: GameFormat;
  readonly cards: readonly CardDefinition[];
}

/**
 * Validate an unknown value as an ordered decklist of card kinds.
 * Collects all issues and never throws.
 */
export function validateDecklist(
  decklist: unknown,
  context: DecklistValidationContext,
): ValidationResult {
  if (!Array.isArray(decklist)) {
    return {
      ok: false,
      issues: [{ code: ISSUE_CODES.INVALID_DECK_SIZE, message: 'decklist must be an array' }],
    };
  }

  const issues: ValidationIssue[] = [];
  const legalKinds = new Set(context.cards.map((card) => card.kind));
  const copyCounts = new Map<string, number>();

  if (decklist.length !== context.format.deckSize) {
    issues.push({
      code: ISSUE_CODES.INVALID_DECK_SIZE,
      message: `decklist must contain exactly ${String(context.format.deckSize)} cards`,
    });
  }

  for (const [index, rawKind] of decklist.entries()) {
    if (typeof rawKind !== 'string' || !legalKinds.has(rawKind)) {
      issues.push({
        code: ISSUE_CODES.UNKNOWN_CARD_KIND,
        message: `decklist[${String(index)}] is not in the active card database`,
      });
      continue;
    }

    copyCounts.set(rawKind, (copyCounts.get(rawKind) ?? 0) + 1);
  }

  for (const [kind, count] of copyCounts) {
    if (count > context.format.copyLimit) {
      issues.push({
        code: ISSUE_CODES.COPY_LIMIT_EXCEEDED,
        message: `${kind} has ${String(count)} copies; limit is ${String(context.format.copyLimit)}`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

/** Hash an ordered decklist reproducibly using canonical JSON and FNV-1a 64-bit hex. */
export function hashDecklist(decklist: readonly string[]): string {
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(JSON.stringify([...decklist]));

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return hash.toString(16).padStart(16, '0');
}
