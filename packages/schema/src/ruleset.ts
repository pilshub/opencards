import type { Phase, Ruleset } from '@opencards/core';
import type { ValidationIssue, ValidationResult } from './card-definition.js';
import { ISSUE_CODES } from './index.js';

const PHASES: readonly Phase[] = ['start', 'main', 'combat', 'end'];

/** Validate a creator-supplied ruleset while collecting every structural issue. */
export function validateRuleset(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ code: ISSUE_CODES.INVALID_RULESET, message: 'ruleset must be an object' }],
    };
  }

  const issues: ValidationIssue[] = [];
  if (typeof value['id'] !== 'string' || value['id'].trim() === '') {
    issues.push({ code: ISSUE_CODES.INVALID_RULESET, message: 'ruleset.id must be non-empty' });
  }
  if (!isInteger(value['version']) || value['version'] < 1) {
    issues.push({
      code: ISSUE_CODES.INVALID_RULESET,
      message: 'ruleset.version must be a positive integer',
    });
  }

  const phases = value['phases'];
  const startingPhase = value['startingPhase'];
  if (
    !Array.isArray(phases) ||
    phases.length === 0 ||
    phases.some((phase) => !PHASES.includes(phase as Phase)) ||
    new Set(phases).size !== phases.length ||
    typeof startingPhase !== 'string' ||
    !phases.includes(startingPhase)
  ) {
    issues.push({
      code: ISSUE_CODES.INVALID_PHASE_ORDER,
      message: 'ruleset.phases must be unique supported phases containing startingPhase',
    });
  }

  for (const field of ['battlefieldLimit', 'handLimit'] as const) {
    const limit = value[field];
    if (limit !== null && (!isInteger(limit) || limit < 1)) {
      issues.push({
        code: ISSUE_CODES.INVALID_RULESET_LIMIT,
        message: `ruleset.${field} must be null or a positive integer`,
      });
    }
  }

  if (!isRecord(value['energy'])) {
    issues.push({
      code: ISSUE_CODES.INVALID_ENERGY_RULES,
      message: 'ruleset.energy must be an object',
    });
  } else {
    const energy = value['energy'];
    if (
      !isInteger(energy['gainPerTurn']) ||
      energy['gainPerTurn'] < 0 ||
      (energy['maximum'] !== null && (!isInteger(energy['maximum']) || energy['maximum'] < 1)) ||
      typeof energy['refillAtTurnStart'] !== 'boolean'
    ) {
      issues.push({
        code: ISSUE_CODES.INVALID_ENERGY_RULES,
        message: 'ruleset.energy has invalid gain, maximum, or refill policy',
      });
    }
  }

  if (!isRecord(value['fatigue'])) {
    issues.push({
      code: ISSUE_CODES.INVALID_FATIGUE_RULES,
      message: 'ruleset.fatigue must be an object',
    });
  } else {
    const fatigue = value['fatigue'];
    if (
      typeof fatigue['enabled'] !== 'boolean' ||
      !isInteger(fatigue['firstDamage']) ||
      fatigue['firstDamage'] < 0 ||
      !isInteger(fatigue['increment']) ||
      fatigue['increment'] < 0
    ) {
      issues.push({
        code: ISSUE_CODES.INVALID_FATIGUE_RULES,
        message: 'ruleset.fatigue has invalid enabled or damage progression values',
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** Compile-time assertion that accepted values conform to the public core type. */
export type ValidRuleset = Ruleset;
