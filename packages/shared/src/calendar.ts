import { localParts } from './time';

/**
 * "Add to calendar" for an event, the same everywhere (the invitation, the sample, the API's .ics):
 * Google Calendar, Outlook.com, Office 365 and a calendar file (.ics) for Apple Calendar and anything else.
 * Times are the event's instant (UTC) shown in the wedding's own timezone: the .ics carries that zone
 * (TZID plus a VTIMEZONE with its daylight-saving changes), so a guest in another zone, or an event the
 * week the clocks change, still lands at the right time.
 */
export interface CalendarEvent {
  /** Stable id, so adding it twice updates rather than duplicates. */
  uid: string;
  title: string;
  start: Date;
  end: Date;
  /** The wedding's IANA timezone (e.g. Australia/Sydney). */
  tz: string;
  location?: string;
  /** A link back to the wedding's site. */
  url?: string;
  description?: string;
  /** A reminder the day before (the .ics only). */
  reminder?: string;
}

/** Hours an event lasts when only its start is known. */
export const EVENT_HOURS = 6;

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');
/** 20270320T030000Z */
const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Minutes the zone is ahead of UTC at an instant (Sydney in summer: 660). */
export function offsetMinutes(at: Date, tz: string): number {
  const p = localParts(at, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}
/** 20270320T140000 (wall clock in the zone, no Z). */
const localStamp = (at: Date, tz: string) => {
  const p = localParts(at, tz);
  return `${p.year}${pad(p.month)}${pad(p.day)}T${pad(p.hour === 24 ? 0 : p.hour)}${pad(p.minute)}00`;
};
const offsetText = (min: number) => `${min < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(min) / 60))}${pad(Math.abs(min) % 60)}`;

/** The zone's short name at that moment ("AEDT", "AEST"; "GMT+11" where there isn't one). */
export function zoneLabel(at: Date, tz: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-AU', { timeZone: tz, timeZoneName: 'short' }).formatToParts(at).find((x) => x.type === 'timeZoneName');
    return part?.value ?? tz;
  } catch {
    return tz;
  }
}

/** The city a zone is named after ("Sydney"), for "Sydney time". */
export const zoneCity = (tz: string) => (tz.split('/').pop() ?? tz).replace(/_/g, ' ');

/** "Saturday 20 March 2027 · 2:00 pm AEDT", in the wedding's timezone. */
export function whenLine(at: Date, tz: string): string {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-AU', { timeZone: tz, ...o }).format(at);
  const time = f({ hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s+/g, ' ').toLowerCase();
  return `${f({ weekday: 'long' })} ${f({ day: 'numeric' })} ${f({ month: 'long' })} ${f({ year: 'numeric' })} · ${time} ${zoneLabel(at, tz)}`;
}

/** Google Calendar's "add event" page: UTC times plus the zone to show them in. */
export function googleCalendarUrl(e: CalendarEvent): string {
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${utcStamp(e.start)}/${utcStamp(e.end)}`,
    ctz: e.tz,
    ...(e.location ? { location: e.location } : {}),
    details: [e.description, e.url].filter(Boolean).join('\n\n'),
  }).toString()}`;
}

/** Outlook on the web: Outlook.com (personal) or Office 365 (work and school). Times with their offset. */
export function outlookCalendarUrl(e: CalendarEvent, kind: 'live' | 'office'): string {
  const withOffset = (d: Date) => {
    const off = offsetMinutes(d, e.tz);
    const local = new Date(d.getTime() + off * 60_000).toISOString().slice(0, 19);
    return `${local}${off < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  };
  return `https://outlook.${kind === 'live' ? 'live' : 'office'}.com/calendar/0/action/compose?${new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: withOffset(e.start),
    enddt: withOffset(e.end),
    ...(e.location ? { location: e.location } : {}),
    body: [e.description, e.url].filter(Boolean).join('\n\n'),
  }).toString()}`;
}

/** Text as an iCalendar value (commas, semicolons, backslashes and new lines escaped). */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Lines longer than 75 octets continue on the next line (RFC 5545 §3.1). */
const fold = (line: string) => {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
};

/**
 * The zone's rules for the years around the event, as a VTIMEZONE: each daylight-saving change found
 * (to the minute) from the zone itself, so it's right for any zone and any year.
 */
export function vtimezone(tz: string, from: Date, to: Date): string[] {
  const startYear = from.getUTCFullYear() - 1;
  const endYear = to.getUTCFullYear() + 1;
  let t = Date.UTC(startYear, 0, 1);
  const stop = Date.UTC(endYear + 1, 0, 1);
  const changes: { at: number; before: number; after: number }[] = [];
  let off = offsetMinutes(new Date(t), tz);
  const DAY = 86_400_000;
  while (t < stop) {
    const next = Math.min(t + DAY, stop);
    const o2 = offsetMinutes(new Date(next), tz);
    if (o2 !== off) {
      // Narrow to the minute it changes.
      let lo = t;
      let hi = next;
      while (hi - lo > 60_000) {
        const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
        if (offsetMinutes(new Date(mid), tz) === off) lo = mid;
        else hi = mid;
      }
      changes.push({ at: hi, before: off, after: o2 });
      off = o2;
    }
    t = next;
  }
  const lines = ['BEGIN:VTIMEZONE', `TZID:${tz}`];
  if (!changes.length) {
    const o = offsetText(off);
    lines.push('BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${o}`, `TZOFFSETTO:${o}`, `TZNAME:${zoneLabel(new Date(), tz)}`, 'END:STANDARD');
  } else {
    const least = Math.min(...changes.map((c) => c.after));
    for (const c of changes) {
      const kind = c.after > least ? 'DAYLIGHT' : 'STANDARD';
      // The change's moment as the clock showed it just before (RFC 5545: in the offset it changes from).
      const wall = new Date(c.at + c.before * 60_000);
      const stamp = `${wall.getUTCFullYear()}${pad(wall.getUTCMonth() + 1)}${pad(wall.getUTCDate())}T${pad(wall.getUTCHours())}${pad(wall.getUTCMinutes())}00`;
      lines.push(`BEGIN:${kind}`, `DTSTART:${stamp}`, `TZOFFSETFROM:${offsetText(c.before)}`, `TZOFFSETTO:${offsetText(c.after)}`, `TZNAME:${zoneLabel(new Date(c.at), tz)}`, `END:${kind}`);
    }
  }
  lines.push('END:VTIMEZONE');
  return lines;
}

/** A calendar file (.ics) for the event, in its own timezone. */
export function icsFor(e: CalendarEvent, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Yes List//Invitations//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-TIMEZONE:${e.tz}`,
    ...vtimezone(e.tz, e.start, e.end),
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;TZID=${e.tz}:${localStamp(e.start, e.tz)}`,
    `DTEND;TZID=${e.tz}:${localStamp(e.end, e.tz)}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    `DESCRIPTION:${esc([e.description, e.url].filter(Boolean).join('\n\n'))}`,
    ...(e.url ? [`URL:${e.url}`] : []),
    ...(e.reminder ? ['BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.reminder)}`, 'END:VALARM'] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** The calendar event for one of a wedding's events. */
export function weddingCalendarEvent(w: { slug: string; name1: string; name2: string; timezone?: string }, ev: { key: string; name: string; startsAt: string; venue?: string; address?: string }, siteUrl: string): CalendarEvent | null {
  const start = new Date(ev.startsAt);
  if (!ev.startsAt || Number.isNaN(start.getTime())) return null;
  const couple = `${w.name1.trim().split(/\s+/)[0]} & ${w.name2.trim().split(/\s+/)[0]}`;
  const url = `${siteUrl.replace(/\/$/, '')}/w/${w.slug}`;
  return {
    uid: `${w.slug}-${ev.key}@wedding-platform`, // as before, so adding it again updates the same event
    title: `${couple}: ${ev.name}`,
    start,
    end: new Date(start.getTime() + EVENT_HOURS * 3_600_000),
    tz: w.timezone || 'Australia/Sydney',
    location: [ev.venue, ev.address].map((x) => x?.trim()).filter(Boolean).join(', ') || undefined,
    url,
    description: 'Details, the timeline and your RSVP',
    reminder: `Tomorrow: ${ev.name}`,
  };
}
