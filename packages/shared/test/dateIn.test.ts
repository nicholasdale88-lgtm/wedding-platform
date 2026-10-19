import { describe, expect, it } from 'vitest';
import { dateIn, daysUntil } from '../src/time';

describe('dates where the wedding is', () => {
  it('8am in Sydney is still yesterday in UTC, but today here', () => {
    const at = new Date('2027-11-16T21:00:00Z'); // 8:00am 17 Nov in Sydney (summer time)
    expect(at.toISOString().slice(0, 10)).toBe('2027-11-16');
    expect(dateIn('Australia/Sydney', at)).toBe('2027-11-17');
  });
  it('days to go count calendar days: the day before is 1, the morning of is 0', () => {
    const wedding = '2027-11-18T03:00:00Z'; // 2pm 18 Nov in Sydney
    expect(daysUntil(wedding, 'Australia/Sydney', new Date('2027-11-16T22:00:00Z'))).toBe(1); // 9am the day before
    expect(daysUntil(wedding, 'Australia/Sydney', new Date('2027-11-17T21:00:00Z'))).toBe(0); // 8am on the day
  });
  it('a bad zone falls back rather than throwing', () => {
    expect(dateIn('Not/AZone', new Date('2027-11-16T21:00:00Z'))).toBe('2027-11-17');
  });
});
