/** Dates in the wedding's own timezone, worded like the design ("3 Oct, 7:12pm", "Thu 18 Nov 2027, 2:00pm"). */

const parts = (iso: string, tz: string, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: tz, ...opts }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));

const time = (iso: string, tz: string) => {
  const p = parts(iso, tz, { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${p.hour}:${p.minute}${String(p.dayPeriod ?? '').toLowerCase().replace(/\./g, '')}`;
};

/** "3 Oct, 7:12pm"; adds the year when it isn't this year. */
export function fmtWhen(iso: string, tz: string, now = new Date()): string {
  const p = parts(iso, tz, { day: 'numeric', month: 'short', year: 'numeric' });
  const thisYear = parts(now.toISOString(), tz, { year: 'numeric' }).year;
  return `${p.day} ${p.month}${p.year !== thisYear ? ` ${p.year}` : ''}, ${time(iso, tz)}`;
}

/** "Thu 18 Nov 2027, 2:00pm" */
export function fmtEvent(iso: string, tz: string): string {
  const p = parts(iso, tz, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${time(iso, tz)}`;
}

/** "18 Jun" */
export function fmtDay(iso: string, tz: string): string {
  const p = parts(iso, tz, { day: 'numeric', month: 'short' });
  return `${p.day} ${p.month}`;
}

/** "Wedding" for "The wedding"; other event names as written. */
export const shortLabel = (name: string) => {
  const n = name.replace(/^the\s+/i, '');
  return n.charAt(0).toUpperCase() + n.slice(1);
};
