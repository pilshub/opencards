/**
 * Deterministic draft engine for @opencards/schema.
 * Drives pick-1-of-N card choices, format.deckSize times, assembling a decklist
 * that satisfies validateDecklist by construction.
 */

import { nextRangeRng, nextRng, seedRng } from '@opencards/core';
import type { CardKind, RNGState } from '@opencards/core';
import type { CardDefinition, ValidationIssue } from './card-definition.js';
import type { GameFormat } from './format.js';
import { ISSUE_CODES } from './index.js';

/** A single in-progress deterministic draft. */
export interface DraftState {
  readonly format: GameFormat;
  readonly pool: readonly CardDefinition[];
  readonly picks: readonly CardKind[];
  readonly rng: RNGState;
}

/** The pick options currently offered by a draft. */
export interface DraftChoice {
  /** Up to 3 distinct eligible kinds; fewer near exhaustion, empty when none remain. */
  readonly options: readonly CardKind[];
}

/** Start a draft from a numeric seed. Pure setup; format/pool are assumed validated. */
export function startDraft(
  seed: number,
  format: GameFormat,
  pool: readonly CardDefinition[],
): DraftState {
  return { format, pool, picks: [], rng: seedRng(seed) };
}

/** True once the draft has filled every decklist slot. */
export function isDraftComplete(state: DraftState): boolean {
  return state.picks.length >= state.format.deckSize;
}

/** The picks made so far, ready to feed into validateDecklist. */
export function finalizeDecklist(state: DraftState): readonly CardKind[] {
  return state.picks;
}

/**
 * Compute the current pick options deterministically.
 * Pure: derives an ephemeral RNG sequence from state.rng without ever writing
 * it back, so repeated calls on the same state return identical options.
 */
export function currentChoice(state: DraftState): DraftChoice | null {
  if (isDraftComplete(state)) {
    return null;
  }

  const options: CardKind[] = [];
  const remaining = distinctEligibleKinds(state);
  const target = Math.min(3, remaining.length);
  let rng = state.rng;

  for (let i = 0; i < target; i++) {
    const [next, index] = nextRangeRng(rng, 0, remaining.length);
    rng = next;
    options.push(remaining.splice(index, 1)[0]!);
  }

  return { options };
}

/** Record a pick, advancing the rng exactly once. Never throws. */
export function pick(
  state: DraftState,
  kind: CardKind,
): { readonly state: DraftState; readonly issues: readonly ValidationIssue[] } {
  const choice = currentChoice(state);
  if (choice === null) {
    return {
      state,
      issues: [{ code: ISSUE_CODES.INVALID_DRAFT_PICK, message: 'draft is already complete' }],
    };
  }

  if (!choice.options.includes(kind)) {
    return {
      state,
      issues: [
        {
          code: ISSUE_CODES.INVALID_DRAFT_PICK,
          message: `${kind} is not among the current choices`,
        },
      ],
    };
  }

  const [nextRngState] = nextRng(state.rng);
  return {
    state: { ...state, picks: [...state.picks, kind], rng: nextRngState },
    issues: [],
  };
}

/** Distinct pool kinds whose copy count in picks is below the format copyLimit. */
function distinctEligibleKinds(state: DraftState): CardKind[] {
  const counts = new Map<CardKind, number>();
  for (const kind of state.picks) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  const eligible: CardKind[] = [];
  const seen = new Set<CardKind>();
  for (const card of state.pool) {
    const kind = card.kind;
    if (seen.has(kind)) {
      continue;
    }
    seen.add(kind);
    if ((counts.get(kind) ?? 0) < state.format.copyLimit) {
      eligible.push(kind);
    }
  }
  return eligible;
}
