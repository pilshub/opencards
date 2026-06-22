import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { canonicalJson, hashState } from './hash.js';

describe('hashState', () => {
  it('returns the same hash for the same input', () => {
    expect(hashState({ turn: 1, phase: 'start' })).toBe(hashState({ turn: 1, phase: 'start' }));
  });

  it('does not depend on object key order', () => {
    expect(hashState({ a: 1, b: 2 })).toBe(hashState({ b: 2, a: 1 }));
  });

  it('does depend on array order', () => {
    expect(hashState(['a', 'b'])).not.toBe(hashState(['b', 'a']));
  });

  it('returns a 64-character lowercase hex sha256', () => {
    expect(hashState({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the known sha256 hex for raw abc bytes', () => {
    expect(bytesToHex(sha256(new TextEncoder().encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('canonicalizes nested objects with sorted keys', () => {
    expect(canonicalJson({ b: [{ d: 4, c: 3 }], a: null })).toBe('{"a":null,"b":[{"c":3,"d":4}]}');
  });
});
