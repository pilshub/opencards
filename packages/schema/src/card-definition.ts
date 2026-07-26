/**
 * Card definition types and runtime validators for @opencards/schema.
 * Phase 2 implementation. See docs/adr/0002-effect-dsl-v1.md.
 */

import { isAbilityTrigger, isBuiltinKeyword, isV1Operation } from '@opencards/effects';
import { ISSUE_CODES } from './index.js';
import type { IssueCode } from './index.js';
import type {
  CardSpec,
  EngineAbility,
  EngineCondition,
  EngineEffect,
  TargetSelector as EngineTargetSelector,
} from '@opencards/core';

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
  readonly kind?: string;
  readonly counter?: string;
  readonly stat?: 'attack' | 'health';
  readonly from?: string;
  readonly to?: string;
  readonly keyword?: string;
  readonly status?: 'frozen' | 'stunned';
  readonly duration?: number;
  readonly attachmentType?: 'equipment' | 'enchantment';
  readonly attack?: number;
  readonly health?: number;
  readonly trigger?: string;
  readonly effects?: readonly EffectDef[];
  readonly options?: readonly (readonly EffectDef[])[];
}

export interface ConditionDef {
  readonly subject: 'source' | 'controller' | 'opponent';
  readonly metric: 'base' | 'energy' | 'damage' | 'units' | 'handSize' | 'counter';
  readonly operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';
  readonly value: number;
  readonly counter?: string;
}

/** Declarative triggered ability composed from the same effect operations. */
export interface AbilityDef {
  readonly trigger: string;
  readonly conditions?: readonly ConditionDef[];
  readonly effects: readonly EffectDef[];
}

/** Full definition of a single card in the card database. */
export interface CardDefinition {
  readonly kind: string;
  readonly name: string;
  readonly type: CardType;
  readonly cost: CardCost;
  readonly stats?: CardStats;
  readonly effects: readonly EffectDef[];
  /** Game-owned faction id; omitted cards are neutral. */
  readonly faction?: string;
  /** Player-facing rules text. */
  readonly text?: string;
  /** Built-in semantic keyword ids. */
  readonly keywords?: readonly string[];
  /** Triggered abilities resolved by the deterministic engine. */
  readonly abilities?: readonly AbilityDef[];
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

/** Convert a validated editor definition into the complete deterministic engine contract. */
export function cardDefinitionToSpec(card: CardDefinition): CardSpec {
  const effects = card.effects.map(effectDefinitionToEngine);
  const abilities: EngineAbility[] = (card.abilities ?? []).map((ability) => ({
    trigger: ability.trigger as EngineAbility['trigger'],
    ...(ability.conditions === undefined
      ? {}
      : { conditions: ability.conditions.map(conditionDefinitionToEngine) }),
    effects: ability.effects.map(effectDefinitionToEngine),
  }));

  return {
    kind: card.kind,
    type: card.type,
    cost: card.cost.energy,
    ...(card.stats === undefined ? {} : { attack: card.stats.attack, health: card.stats.health }),
    ...(effects.length === 0 ? {} : { effects }),
    ...(card.keywords === undefined ? {} : { keywords: card.keywords }),
    ...(abilities.length === 0 ? {} : { abilities }),
  };
}

function effectDefinitionToEngine(effect: EffectDef): EngineEffect {
  return {
    op: effect.op as EngineEffect['op'],
    ...(effect.amount === undefined ? {} : { amount: effect.amount }),
    ...(effect.target === undefined ? {} : { target: definitionTargetToEngine(effect.target) }),
    ...(effect.kind === undefined ? {} : { kind: effect.kind }),
    ...(effect.counter === undefined ? {} : { counter: effect.counter }),
    ...(effect.stat === undefined ? {} : { stat: effect.stat }),
    ...(effect.from === undefined
      ? {}
      : { from: effect.from as NonNullable<EngineEffect['from']> }),
    ...(effect.to === undefined ? {} : { to: effect.to as NonNullable<EngineEffect['to']> }),
    ...(effect.keyword === undefined ? {} : { keyword: effect.keyword }),
    ...(effect.status === undefined ? {} : { status: effect.status }),
    ...(effect.duration === undefined ? {} : { duration: effect.duration }),
    ...(effect.attachmentType === undefined ? {} : { attachmentType: effect.attachmentType }),
    ...(effect.attack === undefined ? {} : { attack: effect.attack }),
    ...(effect.health === undefined ? {} : { health: effect.health }),
    ...(effect.trigger === undefined
      ? {}
      : { trigger: effect.trigger as NonNullable<EngineEffect['trigger']> }),
    ...(effect.effects === undefined
      ? {}
      : { effects: effect.effects.map(effectDefinitionToEngine) }),
    ...(effect.options === undefined
      ? {}
      : { options: effect.options.map((option) => option.map(effectDefinitionToEngine)) }),
  };
}

function conditionDefinitionToEngine(condition: ConditionDef): EngineCondition {
  return {
    subject: condition.subject,
    metric: condition.metric,
    operator: condition.operator,
    value: condition.value,
    ...(condition.counter === undefined ? {} : { counter: condition.counter }),
  };
}

function definitionTargetToEngine(target: string): EngineTargetSelector {
  switch (target) {
    case 'ownBase':
    case 'owner':
      return 'self';
    case 'opponent':
      return 'enemyBase';
    default:
      return target as EngineTargetSelector;
  }
}
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

  validateEffects(card['effects'], 'effect', issues);

  const keywords = card['keywords'];
  if (keywords !== undefined) {
    if (
      !Array.isArray(keywords) ||
      keywords.some((keyword) => typeof keyword !== 'string' || !isBuiltinKeyword(keyword)) ||
      new Set(keywords).size !== keywords.length
    ) {
      issues.push({
        code: ISSUE_CODES.INVALID_KEYWORD,
        message: 'keywords must contain unique built-in semantic ids',
      });
    }
  }

  const abilities = card['abilities'];
  if (abilities !== undefined) {
    if (!Array.isArray(abilities)) {
      issues.push({
        code: ISSUE_CODES.INVALID_ABILITY_TRIGGER,
        message: 'abilities must be an array',
      });
    } else {
      abilities.forEach((raw, index) => {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
          issues.push({
            code: ISSUE_CODES.INVALID_ABILITY_TRIGGER,
            message: `ability[${index}] must be an object`,
          });
          return;
        }
        const ability = raw as Record<string, unknown>;
        if (typeof ability['trigger'] !== 'string' || !isAbilityTrigger(ability['trigger'])) {
          issues.push({
            code: ISSUE_CODES.INVALID_ABILITY_TRIGGER,
            message: `ability[${index}].trigger is unsupported: ${String(ability['trigger'])}`,
          });
        }
        validateEffects(ability['effects'], `ability[${index}].effect`, issues);
        const conditions = ability['conditions'];
        if (conditions !== undefined && !validConditions(conditions)) {
          issues.push({
            code: ISSUE_CODES.INVALID_ABILITY_TRIGGER,
            message: `ability[${index}].conditions are invalid`,
          });
        }
      });
    }
  }
  // missing/non-array effects: treated as fine (empty is allowed, and undefined just means no effects array to validate)

  return { ok: issues.length === 0, issues };
}

function validConditions(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const subjects = ['source', 'controller', 'opponent'];
  const metrics = ['base', 'energy', 'damage', 'units', 'handSize', 'counter'];
  const operators = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte'];
  return value.every((raw) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const condition = raw as Record<string, unknown>;
    return (
      subjects.includes(String(condition['subject'])) &&
      metrics.includes(String(condition['metric'])) &&
      operators.includes(String(condition['operator'])) &&
      isInteger(condition['value'])
    );
  });
}

function validateEffects(value: unknown, label: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) {
    return;
  }

  value.forEach((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      issues.push({
        code: ISSUE_CODES.UNKNOWN_EFFECT_OP,
        message: `${label}[${index}] must be an object with an op`,
      });
      return;
    }
    const effect = raw as Record<string, unknown>;
    if (typeof effect['op'] !== 'string' || !isV1Operation(effect['op'])) {
      issues.push({
        code: ISSUE_CODES.UNKNOWN_EFFECT_OP,
        message: `${label}[${index}].op is not a known v1 operation: ${String(effect['op'])}`,
      });
    }
    if (
      effect['target'] !== undefined &&
      !(TARGET_SELECTORS as readonly string[]).includes(effect['target'] as string)
    ) {
      issues.push({
        code: ISSUE_CODES.UNKNOWN_TARGET_SELECTOR,
        message: `${label}[${index}].target is not a known selector: ${String(effect['target'])}`,
      });
    }
    const signedAmount =
      effect['op'] === 'modifyStat' || effect['op'] === 'modifyStatUntilEndOfTurn';
    if (
      effect['amount'] !== undefined &&
      (!isInteger(effect['amount']) || (!signedAmount && (effect['amount'] as number) < 0))
    ) {
      issues.push({
        code: ISSUE_CODES.INVALID_EFFECT_AMOUNT,
        message: `${label}[${index}].amount must be an integer >= 0`,
      });
    }
    validateEffects(effect['effects'], `${label}[${index}].effect`, issues);
    const options = effect['options'];
    if (Array.isArray(options)) {
      options.forEach((option, optionIndex) =>
        validateEffects(option, `${label}[${index}].option[${optionIndex}]`, issues),
      );
    }
  });
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
