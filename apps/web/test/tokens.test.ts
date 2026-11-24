import { describe, expect, it } from 'vitest';
import { contrast, TOKENS as T } from '../src/sales/tokens';

/** VS-01: the marketing colours meet WCAG AA where they're used (4.5:1 normal text, 3:1 large text and UI). */
describe('marketing colour tokens', () => {
  it('body, headline and small gold type pass AA as normal text', () => {
    for (const bg of [T.paper, T.paperBright]) {
      expect(contrast(T.ink, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(T.sage, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(T.muted, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(T.goldInk, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(T.inviteInk, T.paperInvite)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(T.btnOnInk, T.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(T.creamText, T.burgundy)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(T.creamText, T.sage)).toBeGreaterThanOrEqual(4.5);
  });
  it('display gold is large-only on cream, and fails on blush (so it is never used there)', () => {
    expect(contrast(T.gold, T.paper)).toBeGreaterThanOrEqual(3);
    expect(contrast(T.gold, T.paper)).toBeLessThan(4.5);
    expect(contrast(T.gold, T.blush)).toBeLessThan(3);
  });
});
