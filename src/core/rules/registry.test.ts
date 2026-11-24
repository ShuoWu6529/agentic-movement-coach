import { describe, expect, it } from 'vitest';
import { ISSUE_CATEGORIES, RULES } from './registry';

describe('rule registry', () => {
  it('has unique rule IDs', () => {
    const ids = RULES.map((r) => r.ruleId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every advice rule an issue category, and no other kind one', () => {
    for (const r of RULES) {
      if (r.kind === 'advice') expect(ISSUE_CATEGORIES).toContain(r.category);
      else expect(r.category).toBeNull();
    }
  });

  it('ties status rules to no exercise', () => {
    for (const r of RULES) if (r.kind === 'status') expect(r.exercise).toBeNull();
  });
});
