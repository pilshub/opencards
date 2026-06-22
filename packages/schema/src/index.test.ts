import { describe, expect, it } from 'vitest';
import { ISSUE_CODES, SCHEMA_VERSION } from './index.js';

describe('@opencards/schema sentinel', () => {
  it('exposes a version string', () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('issue codes follow the OC-NNNN pattern', () => {
    for (const code of Object.values(ISSUE_CODES)) {
      expect(code).toMatch(/^OC-\d{4}$/);
    }
  });

  it('issue codes are unique', () => {
    const codes = Object.values(ISSUE_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
