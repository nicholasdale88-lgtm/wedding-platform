import { describe, expect, it } from 'vitest';
import {
  displayPhone, inQuietHours, isToken, joinFirstNames, localParts, nonGsmChars, randomToken, render, segments,
  toE164, toGsm, toProviderFormat, unknownPlaceholders, zonedToUtc,
} from '../src';

const TZ = 'Australia/Sydney';

describe('phone', () => {
  it.each([
    ['0412 381 904', '+61412381904'],
    ['+61 412 381 904', '+61412381904'],
    ['61412381904', '+61412381904'],
    ['412381904', '+61412381904'],
    ['(0412) 381-904', '+61412381904'],
    ['0061412381904', '+61412381904'],
  ])('normalises %s', (input, out) => expect(toE164(input)).toBe(out));

  it.each(['', '02 4375 1222', '0412 381', 'abc', null])('rejects %s', (input) => expect(toE164(input)).toBeNull());

  it('displays and formats for the provider', () => {
    expect(displayPhone('+61412381904')).toBe('0412 381 904');
    expect(toProviderFormat('+61412381904')).toBe('0412381904');
  });
});

describe('tokens', () => {
  it('are 22 url-safe chars and unique', () => {
    const set = new Set(Array.from({ length: 5000 }, () => randomToken()));
    expect(set.size).toBe(5000);
    for (const t of set) expect(isToken(t)).toBe(true);
  });
});

describe('time (Sydney, DST-safe)', () => {
  it('converts wall-clock to UTC in summer (AEDT, +11)', () => {
    expect(zonedToUtc('2027-11-17T17:00', TZ).toISOString()).toBe('2027-11-17T06:00:00.000Z');
  });
  it('converts wall-clock to UTC in winter (AEST, +10)', () => {
    expect(zonedToUtc('2027-06-18T10:00', TZ).toISOString()).toBe('2027-06-18T00:00:00.000Z');
  });
  it('round-trips across the October DST change', () => {
    const utc = zonedToUtc('2027-10-03T09:00', TZ);
    expect(localParts(utc, TZ)).toMatchObject({ day: 3, hour: 9, minute: 0 });
  });
  it('quiet hours are 20:00-08:00 local', () => {
    expect(inQuietHours(zonedToUtc('2027-06-18T07:59', TZ), TZ)).toBe(true);
    expect(inQuietHours(zonedToUtc('2027-06-18T08:00', TZ), TZ)).toBe(false);
    expect(inQuietHours(zonedToUtc('2027-06-18T19:59', TZ), TZ)).toBe(false);
    expect(inQuietHours(zonedToUtc('2027-06-18T20:00', TZ), TZ)).toBe(true);
  });
});

describe('sms segments', () => {
  it('counts GSM parts', () => {
    expect(segments('a'.repeat(160)).parts).toBe(1);
    expect(segments('a'.repeat(161)).parts).toBe(2);
    expect(segments('a'.repeat(306)).parts).toBe(2);
    expect(segments('a'.repeat(307)).parts).toBe(3);
  });
  it('extension chars cost two', () => expect(segments('€'.repeat(80)).length).toBe(160));
  it('emoji forces unicode', () => {
    const s = segments('Hi 🎉');
    expect(s.unicode).toBe(true);
    expect(nonGsmChars('Hi 🎉')).toEqual(['🎉']);
  });
  it('replaces smart punctuation', () => expect(toGsm('Nick’s “day” – yes…')).toBe('Nick\'s "day" - yes...'));
});

describe('templates', () => {
  it('joins first names', () => {
    expect(joinFirstNames(['Margaret Bloor'])).toBe('Margaret');
    expect(joinFirstNames(['Margaret Bloor', 'Peter Bloor'])).toBe('Margaret and Peter');
    expect(joinFirstNames(['Charlotte Wilson', 'Ben Wilson', 'Archie', 'Lily'])).toBe('Charlotte, Ben, Archie and Lily');
    expect(joinFirstNames([])).toBe('there');
  });
  it('flags unknown placeholders, allows per-event guides', () => {
    expect(unknownPlaceholders('Hi {first} {link} {guide30} {frist}')).toEqual(['frist']);
  });
  it('renders', () => expect(render('Hi {first}: {link}', { first: 'Ella', link: 'x/y' })).toBe('Hi Ella: x/y'));
});
