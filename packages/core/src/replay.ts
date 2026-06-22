import type { Command, State, ValidationIssue } from './types.js';
import type { SetupOpts } from './setup.js';
import { apply } from './dispatcher.js';
import { hashState } from './hash.js';
import { createInitialState } from './setup.js';

/** Version 1 replay envelope for the Phase 1 deterministic kernel. */
export interface ReplayEnvelopeV1 {
  /** Replay envelope schema version. */
  readonly schemaVersion: '0.1.0';
  /** Authoritative setup seed for deterministic replay. */
  readonly seed: number;
  /** Initial state construction options. */
  readonly setupOpts: SetupOpts;
  /** Ordered commands to replay. */
  readonly commands: readonly Command[];
  /** Expected canonical final state hash. */
  readonly finalStateHash: string;
}

/** Replay verification result with final state and hash details. */
export interface ReplayResult {
  /** True when the computed hash matches the envelope hash and no issues occurred. */
  readonly ok: boolean;
  /** Computed final state hash. */
  readonly hash: string;
  /** Expected final state hash from the envelope. */
  readonly expected: string;
  /** Final state reached by replaying commands. */
  readonly state: State;
  /** Issues encountered while applying commands. */
  readonly issues: readonly ValidationIssue[];
}

/** Compute the final state hash for a replay envelope, throwing on invalid commands. */
export function computeReplayHash(envelope: ReplayEnvelopeV1): string {
  const result = runReplay(envelope);
  if (result.issues.length > 0) {
    const codes = result.issues.map((issue) => issue.code).join(', ');
    throw new Error(`Replay command produced issue(s): ${codes}`);
  }
  return result.hash;
}

/** Replay an envelope and compare its computed final state hash to the expected hash. */
export function replay(envelope: ReplayEnvelopeV1): ReplayResult {
  return runReplay(envelope);
}

function runReplay(envelope: ReplayEnvelopeV1): ReplayResult {
  let state = createInitialState({ ...envelope.setupOpts, seed: envelope.seed });
  const issues: ValidationIssue[] = [];

  for (const command of envelope.commands) {
    const result = apply(state, command);
    if (result.issues.length > 0) {
      issues.push(...result.issues);
      break;
    }
    state = result.state;
  }

  const hash = hashState(state);
  return {
    ok: issues.length === 0 && hash === envelope.finalStateHash,
    hash,
    expected: envelope.finalStateHash,
    state,
    issues,
  };
}
