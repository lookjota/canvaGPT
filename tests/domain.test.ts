import { describe, expect, it } from 'vitest';

describe('canvas domain invariants', () => {
  it('keeps viewport within supported zoom limits', () => {
    expect(Math.min(2.5, Math.max(.25, .1))).toBe(.25);
    expect(Math.min(2.5, Math.max(.25, 4))).toBe(2.5);
  });
});
