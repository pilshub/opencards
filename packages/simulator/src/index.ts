/**
 * @opencards/simulator — bots and the replay matrix harness.
 *
 * Phase 0 stub. Phase 3 adds the first bot policies; Phase 7 wires the
 * full QA harness. See docs/roadmap.md.
 */

/** Bot policies promised by the roadmap. Implemented in Phase 7. */
export const PLANNED_POLICIES = Object.freeze([
  'random-legal',
  'greedy-damage',
  'smoke-test',
] as const);

/** Planned simulator bot policy label. */
export type PlannedPolicy = (typeof PLANNED_POLICIES)[number];

/** True if a label names a planned policy. */
export function isPlannedPolicy(label: string): label is PlannedPolicy {
  return (PLANNED_POLICIES as readonly string[]).includes(label);
}
