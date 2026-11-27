import { describe, expect, it } from 'vitest';
import { dmyToIso } from '../src/try/dmy';

describe('/try: the wedding date, day / month / year', () => {
  it('reads Australian dates, never month first', () => {
    expect(dmyToIso('20/03/2027')).toBe('2027-03-20');
    expect(dmyToIso('5/4/27')).toBe('2027-04-05');
    expect(dmyToIso(' 01.12.2026 ')).toBe('2026-12-01');
    expect(dmyToIso('20-3-2027')).toBe('2027-03-20');
  });
  it('empty is fine; a date that does not exist is not', () => {
    expect(dmyToIso('')).toBe('');
    expect(dmyToIso('03/20/2027')).toBeNull(); // month 20
    expect(dmyToIso('31/02/2027')).toBeNull();
    expect(dmyToIso('next spring')).toBeNull();
  });
});
