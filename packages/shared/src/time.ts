/**
 * Times are stored as UTC ISO strings. Each wedding has an IANA timezone;
 * quiet hours and send dates are evaluated in that zone (DST-safe via Intl).
 */

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-AU', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of a UTC instant in the given zone. */
export function localParts(utc: Date, tz: string): LocalParts {
  const p = Object.fromEntries(formatter(tz).formatToParts(utc).map((x) => [x.type, x.value]));
  return { year: +p.year!, month: +p.month!, day: +p.day!, hour: +p.hour!, minute: +p.minute! };
}

/** Convert a wall-clock time in `tz` ("2027-11-17T17:00") to a UTC Date. */
export function zonedToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error(`Bad local time: ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the offset, including across DST transitions.
  let utc = guess;
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(utc), tz);
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    utc += guess - asIfUtc;
  }
  return new Date(utc);
}

/** True when the local hour is outside [start, end). Quiet hours block sends. */
export function inQuietHours(utc: Date, tz: string, start = 8, end = 20): boolean {
  const { hour } = localParts(utc, tz);
  return hour < start || hour >= end;
}

export const iso = (d: Date): string => d.toISOString();

/** The calendar date ("2027-11-18") of an instant where the wedding is (not UTC, which is yesterday in Australia until mid-morning). */
export function dateIn(tz: string | undefined, at: Date = new Date()): string {
  let p: LocalParts;
  try {
    p = localParts(at, tz || 'Australia/Sydney');
  } catch {
    p = localParts(at, 'Australia/Sydney');
  }
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Whole calendar days until an instant, counted where the wedding is: the day before is 1, the morning of is 0. */
export function daysUntil(whenIso: string, tz: string | undefined, now: Date = new Date()): number {
  return Math.round((Date.parse(dateIn(tz, new Date(whenIso))) - Date.parse(dateIn(tz, now))) / 86_400_000);
}

/** Invitations go out this many months before the first event, unless the couple picks a date. */
export const INVITE_LEAD_MONTHS = 8;
export function defaultInvitesFrom(firstEventIso: string): string {
  const d = new Date(firstEventIso);
  d.setUTCMonth(d.getUTCMonth() - INVITE_LEAD_MONTHS);
  return d.toISOString();
}
