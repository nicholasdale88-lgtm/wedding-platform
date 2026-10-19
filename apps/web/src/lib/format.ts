/** Dates in the wedding's own timezone, worded like the design ("3 Oct, 7:12pm", "Thu 18 Nov 2027, 2:00pm"). */

// Our own short names: en-AU's Intl writes "June"/"July" in full, the design uses "Jun"/"Jul".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Local {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
}

function local(iso: string, tz: string): Local {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(String(p.weekday)),
  };
}

const time = (l: Local) => `${l.hour % 12 || 12}:${String(l.minute).padStart(2, '0')}${l.hour >= 12 ? 'pm' : 'am'}`;

/** "3 Oct, 7:12pm"; adds the year when it isn't this year. */
export function fmtWhen(iso: string, tz: string, now = new Date()): string {
  const l = local(iso, tz);
  const year = local(now.toISOString(), tz).year;
  return `${l.day} ${MONTHS[l.month - 1]}${l.year !== year ? ` ${l.year}` : ''}, ${time(l)}`;
}

/** "Thu 18 Nov 2027, 2:00pm" */
export function fmtEvent(iso: string, tz: string): string {
  const l = local(iso, tz);
  return `${DAYS[l.weekday]} ${l.day} ${MONTHS[l.month - 1]} ${l.year}, ${time(l)}`;
}

/** "Thu 18 Nov" */
export function fmtWeekday(iso: string, tz: string): string {
  const l = local(iso, tz);
  return `${DAYS[l.weekday]} ${l.day} ${MONTHS[l.month - 1]}`;
}

/** "18 Jun" */
export function fmtDay(iso: string, tz: string): string {
  const l = local(iso, tz);
  return `${l.day} ${MONTHS[l.month - 1]}`;
}

/** "Wedding" for "The wedding"; other event names as written. */
export const shortLabel = (name: string) => {
  const n = name.replace(/^the\s+/i, '');
  return n.charAt(0).toUpperCase() + n.slice(1);
};
