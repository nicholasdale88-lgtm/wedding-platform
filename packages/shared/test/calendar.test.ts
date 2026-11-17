import { describe, expect, it } from 'vitest';
import { googleCalendarUrl, icsFor, offsetMinutes, outlookCalendarUrl, vtimezone, weddingCalendarEvent, whenLine, zoneLabel } from '../src/calendar';

/** Add to calendar: the right instant, carried in the wedding's own timezone, across daylight saving. */
const W = { slug: 'harriet-and-theo', name1: 'Harriet Lane', name2: 'Theo Marsh', timezone: 'Australia/Sydney' };
const ev = (startsAt: string) => weddingCalendarEvent(W, { key: 'wedding', name: 'The wedding', startsAt, venue: 'Larkwood Estate', address: 'Hunter Valley NSW' }, 'https://example.com/')!;
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('add to calendar', () => {
  it('a summer wedding in the Hunter Valley: 2 pm AEDT (UTC+11) everywhere', () => {
    const e = ev('2027-03-20T03:00:00.000Z'); // 2 pm in Sydney, daylight saving on
    expect(offsetMinutes(e.start, 'Australia/Sydney')).toBe(660);
    expect(zoneLabel(e.start, 'Australia/Sydney')).toBe('AEDT');
    expect(whenLine(e.start, 'Australia/Sydney')).toBe('Saturday 20 March 2027 · 2:00 pm AEDT');
    expect(e).toMatchObject({ title: 'Harriet & Theo: The wedding', location: 'Larkwood Estate, Hunter Valley NSW', url: 'https://example.com/w/harriet-and-theo' });

    const ics = unfold(icsFor(e, new Date('2026-11-17T00:00:00Z')));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;TZID=Australia/Sydney:20270320T140000');
    expect(ics).toContain('DTEND;TZID=Australia/Sydney:20270320T200000');
    expect(ics).toContain('SUMMARY:Harriet & Theo: The wedding');
    expect(ics).toContain('LOCATION:Larkwood Estate\\, Hunter Valley NSW');
    expect(ics).toContain('URL:https://example.com/w/harriet-and-theo');
    expect(ics).toContain('UID:harriet-and-theo-wedding@wedding-platform');
    expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Australia/Sydney');
    // Every line within 75 octets.
    for (const line of icsFor(e).split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);

    const g = new URL(googleCalendarUrl(e));
    expect(g.searchParams.get('dates')).toBe('20270320T030000Z/20270320T090000Z');
    expect(g.searchParams.get('ctz')).toBe('Australia/Sydney');
    expect(g.searchParams.get('text')).toBe('Harriet & Theo: The wedding');
    expect(g.searchParams.get('location')).toBe('Larkwood Estate, Hunter Valley NSW');
    expect(g.searchParams.get('details')).toContain('https://example.com/w/harriet-and-theo');

    const live = new URL(outlookCalendarUrl(e, 'live'));
    expect(live.origin).toBe('https://outlook.live.com');
    expect(live.searchParams.get('startdt')).toBe('2027-03-20T14:00:00+11:00');
    expect(live.searchParams.get('enddt')).toBe('2027-03-20T20:00:00+11:00');
    expect(live.searchParams.get('subject')).toBe('Harriet & Theo: The wedding');
    expect(new URL(outlookCalendarUrl(e, 'office')).origin).toBe('https://outlook.office.com');
  });

  it('the weekend the clocks go back (Sunday 4 April 2027, 3 am AEDT becomes 2 am AEST)', () => {
    const before = ev('2027-04-03T04:00:00.000Z'); // Saturday 3 pm AEDT
    const after = ev('2027-04-04T05:00:00.000Z'); // Sunday 3 pm AEST
    expect(offsetMinutes(before.start, 'Australia/Sydney')).toBe(660);
    expect(offsetMinutes(after.start, 'Australia/Sydney')).toBe(600);
    expect(whenLine(before.start, 'Australia/Sydney')).toBe('Saturday 3 April 2027 · 3:00 pm AEDT');
    expect(whenLine(after.start, 'Australia/Sydney')).toBe('Sunday 4 April 2027 · 3:00 pm AEST');
    expect(icsFor(before)).toContain('DTSTART;TZID=Australia/Sydney:20270403T150000');
    expect(icsFor(after)).toContain('DTSTART;TZID=Australia/Sydney:20270404T150000');
    expect(new URL(outlookCalendarUrl(after, 'live')).searchParams.get('startdt')).toBe('2027-04-04T15:00:00+10:00');
    // The zone's rules include that very change, as it happens on the clock.
    const tz = vtimezone('Australia/Sydney', after.start, after.end).join('\n');
    expect(tz).toContain('BEGIN:STANDARD\nDTSTART:20270404T030000\nTZOFFSETFROM:+1100\nTZOFFSETTO:+1000\nTZNAME:AEST\nEND:STANDARD');
    expect(tz).toContain('BEGIN:DAYLIGHT\nDTSTART:20261004T020000\nTZOFFSETFROM:+1000\nTZOFFSETTO:+1100\nTZNAME:AEDT\nEND:DAYLIGHT');
  });

  it('a zone without daylight saving (Brisbane) has one fixed rule', () => {
    const e = weddingCalendarEvent({ ...W, timezone: 'Australia/Brisbane' }, { key: 'wedding', name: 'The wedding', startsAt: '2027-03-20T04:00:00.000Z' }, 'https://example.com')!;
    expect(icsFor(e)).toContain('DTSTART;TZID=Australia/Brisbane:20270320T140000');
    expect(vtimezone('Australia/Brisbane', e.start, e.end).join('\n')).toContain('TZOFFSETFROM:+1000\nTZOFFSETTO:+1000');
    expect(e.location).toBeUndefined();
  });

  it('no date yet: no calendar event', () => {
    expect(weddingCalendarEvent(W, { key: 'wedding', name: 'The wedding', startsAt: '' }, 'https://example.com')).toBeNull();
  });
});
