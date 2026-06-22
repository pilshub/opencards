import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/** Hash a value as canonical JSON using sha256 hex output. */
export function hashState(value: unknown): string {
  const canonical = canonicalJson(value);
  return bytesToHex(sha256(new TextEncoder().encode(canonical)));
}

/** Convert a value to canonical JSON with sorted object keys and stable array order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = canonicalize(record[key]);
  }
  return sorted;
}
