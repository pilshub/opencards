/**
 * @opencards/effects — declarative effect operations.
 *
 * Phase 0 stub. Phase 4 implements the v1 operation set defined in
 * docs/adr/0002-effect-dsl-v1.md.
 */

/**
 * Canonical v1 operation names. Source of truth: ADR-0002.
 * Adding an entry here without updating ADR-0002 is a process bug.
 */
export const V1_OPERATIONS = Object.freeze([
  'gainResource',
  'drawCards',
  'dealDamage',
  'heal',
  'summonUnit',
  'moveCard',
  'discardCards',
  'addCounter',
  'modifyStatUntilEndOfTurn',
] as const);

/** Operation name supported by the v1 effect DSL. */
export type V1Operation = (typeof V1_OPERATIONS)[number];

/** True if a name is a known v1 operation. */
export function isV1Operation(name: string): name is V1Operation {
  return (V1_OPERATIONS as readonly string[]).includes(name);
}
