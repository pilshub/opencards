import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMAT, validateFormat } from './format.js';
import { ISSUE_CODES } from './index.js';

describe('validateFormat', () => {
  it('DEFAULT_FORMAT validates ok:true', () => {
    const result = validateFormat(DEFAULT_FORMAT);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('non-object input returns ok:false with INVALID_DECK_SIZE', () => {
    const result = validateFormat('not-an-object');
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_DECK_SIZE)).toBe(true);
  });

  it('null input returns ok:false', () => {
    const result = validateFormat(null);
    expect(result.ok).toBe(false);
  });

  it('array input returns ok:false', () => {
    const result = validateFormat([]);
    expect(result.ok).toBe(false);
  });

  it('empty name emits EMPTY_NAME', () => {
    const result = validateFormat({ ...DEFAULT_FORMAT, name: '   ' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.EMPTY_NAME)).toBe(true);
  });

  it('deckSize 0 emits INVALID_DECK_SIZE', () => {
    const result = validateFormat({ ...DEFAULT_FORMAT, deckSize: 0 });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_DECK_SIZE)).toBe(true);
  });

  it('deckSize -1 emits INVALID_DECK_SIZE', () => {
    const result = validateFormat({ ...DEFAULT_FORMAT, deckSize: -1 });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_DECK_SIZE)).toBe(true);
  });

  it('deckSize non-integer emits INVALID_DECK_SIZE', () => {
    const result = validateFormat({ ...DEFAULT_FORMAT, deckSize: 1.5 });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_DECK_SIZE)).toBe(true);
  });

  it('openingHandSize > deckSize emits INVALID_OPENING_HAND', () => {
    const result = validateFormat({ ...DEFAULT_FORMAT, deckSize: 5, openingHandSize: 6 });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_OPENING_HAND)).toBe(true);
  });

  it('openingHandSize -1 emits INVALID_OPENING_HAND', () => {
    const result = validateFormat({ ...DEFAULT_FORMAT, openingHandSize: -1 });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_OPENING_HAND)).toBe(true);
  });

  it('openingHandSize == deckSize is valid', () => {
    const result = validateFormat({ ...DEFAULT_FORMAT, deckSize: 5, openingHandSize: 5 });
    expect(result.ok).toBe(true);
  });

  it('openingHandSize checked as integer even when deckSize is invalid', () => {
    // deckSize=0 is invalid; openingHandSize=-1 should still emit INVALID_OPENING_HAND
    const result = validateFormat({ ...DEFAULT_FORMAT, deckSize: 0, openingHandSize: -1 });
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_OPENING_HAND)).toBe(true);
  });

  it('copyLimit 0 emits INVALID_COPY_LIMIT', () => {
    const result = validateFormat({ ...DEFAULT_FORMAT, copyLimit: 0 });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_COPY_LIMIT)).toBe(true);
  });

  it('baseTotal 0 emits INVALID_BASE_TOTAL', () => {
    const result = validateFormat({ ...DEFAULT_FORMAT, baseTotal: 0 });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_BASE_TOTAL)).toBe(true);
  });

  it('startingEnergy -1 emits INVALID_STARTING_ENERGY', () => {
    const result = validateFormat({ ...DEFAULT_FORMAT, startingEnergy: -1 });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === ISSUE_CODES.INVALID_STARTING_ENERGY)).toBe(true);
  });

  it('startingEnergy 0 is valid', () => {
    const result = validateFormat({ ...DEFAULT_FORMAT, startingEnergy: 0 });
    expect(result.ok).toBe(true);
  });

  it('collects all issues in a single pass', () => {
    const result = validateFormat({
      name: '',
      deckSize: 0,
      openingHandSize: -1,
      copyLimit: 0,
      baseTotal: 0,
      startingEnergy: -1,
    });
    expect(result.ok).toBe(false);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain(ISSUE_CODES.EMPTY_NAME);
    expect(codes).toContain(ISSUE_CODES.INVALID_DECK_SIZE);
    expect(codes).toContain(ISSUE_CODES.INVALID_OPENING_HAND);
    expect(codes).toContain(ISSUE_CODES.INVALID_COPY_LIMIT);
    expect(codes).toContain(ISSUE_CODES.INVALID_BASE_TOTAL);
    expect(codes).toContain(ISSUE_CODES.INVALID_STARTING_ENERGY);
  });
});
