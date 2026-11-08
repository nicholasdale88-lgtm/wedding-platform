import { describe, expect, it } from 'vitest';
import { previewNow, previewOffset } from '../src/guest/previewClock';

/** Rehearsal's "as of": the couple's preview counts down from the moment being rehearsed; guests never do. */
describe('preview clock', () => {
  const real = Date.parse('2026-11-08T00:00:00Z');
  const night = '2027-11-17T06:00:00.000Z';

  it('moves the clock only in a preview with a good date', () => {
    expect(previewOffset(`?preview=1&asOf=${encodeURIComponent(night)}`, real)).toBe(Date.parse(night) - real);
    expect(previewOffset(`?g=tok&asOf=${encodeURIComponent(night)}`, real)).toBe(0); // a guest's own link
    expect(previewOffset('?preview=1&asOf=soon', real)).toBe(0);
    expect(previewOffset('?preview=1', real)).toBe(0);
  });

  it('now, as the page sees it', () => {
    expect(Math.abs(previewNow(`?preview=1&asOf=${encodeURIComponent(night)}`) - Date.parse(night))).toBeLessThan(1000);
    expect(Math.abs(previewNow('') - Date.now())).toBeLessThan(1000);
  });
});
