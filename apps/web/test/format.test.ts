import { describe, expect, it } from 'vitest';
import { fmtDay, fmtEvent, fmtWeekday, fmtWhen } from '../src/lib/format';

const TZ = 'Australia/Sydney';
describe('dates in the design wording, in the wedding timezone', () => {
  it('formats event, day and reply times', () => {
    expect(fmtEvent('2027-11-18T03:00:00.000Z', TZ)).toBe('Thu 18 Nov 2027, 2:00pm');
    expect(fmtEvent('2027-11-19T23:00:00.000Z', TZ)).toBe('Sat 20 Nov 2027, 10:00am');
    expect(fmtDay('2027-06-18T00:00:00.000Z', TZ)).toBe('18 Jun');
    expect(fmtDay('2027-07-18T00:00:00.000Z', TZ)).toBe('18 Jul');
    expect(fmtWeekday('2027-11-18T03:00:00.000Z', TZ)).toBe('Thu 18 Nov');
    expect(fmtWhen('2026-10-10T08:12:00.000Z', TZ, new Date('2026-10-19T00:00:00Z'))).toBe('10 Oct, 7:12pm'); // AEDT, +11
    expect(fmtWhen('2026-10-10T08:12:00.000Z', TZ, new Date('2027-01-19T00:00:00Z'))).toBe('10 Oct 2026, 7:12pm');
    expect(fmtWhen('2026-10-02T14:05:00.000Z', TZ, new Date('2026-10-19T00:00:00Z'))).toBe('3 Oct, 12:05am'); // AEST, +10, before daylight saving
  });
});
