import generic from '../../../../seed/texts.generic.json';

/**
 * The wording every wedding starts from: the invitation, night-before guide and photo page in neutral words,
 * with [placeholders] where a couple fills in their own (the venue, the date). A wedding's own wording
 * (content.texts, edited in Setup → Wording) replaces any of it. Without this, a new wedding's pages
 * would have no words at all.
 */
export const DEFAULT_TEXTS: Record<string, string> = generic;

/** What the couple has already told us, to fill the starting wording's placeholders with. */
export interface Facts {
  tz: string;
  /** The wedding first, then any other events. */
  events: { starts_at: string; venue?: string | null; address?: string | null }[];
  /** Replies close (yyyy-mm-dd), if set. */
  rsvpClose?: string;
}

const parts = (iso: string, tz: string) => {
  const d = new Date(iso);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-AU', { timeZone: tz, ...o }).format(d);
  return {
    wd: f({ weekday: 'long' }),
    day: f({ day: 'numeric' }),
    month: f({ month: 'long' }),
    year: f({ year: 'numeric' }),
    time: (at: Date) => new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(at).replace(/\s/g, '').toLowerCase(),
  };
};

/** The starting wording's placeholders, filled from the events' dates and venues and the reply-by date. */
export function fillsFor(f: Facts): Record<string, string> {
  const out: Record<string, string> = {};
  const first = f.events[0];
  if (first?.starts_at && !Number.isNaN(Date.parse(first.starts_at))) {
    const p = parts(first.starts_at, f.tz);
    const start = new Date(first.starts_at);
    const time = p.time(start);
    Object.assign(out, {
      'inv.5fb81f2d': `${p.wd} ${p.day} ${p.month} ${p.year}`,
      'inv.9dc5006a': `${p.wd}, ${p.day} ${p.month} ${p.year}`,
      'inv.d73ce566': `${p.wd} ${p.day} ${p.month}`,
      'inv.46988d28': `${p.day} ${p.month} ${p.year}`,
      'inv.78ae6f0c': p.wd,
      'inv.52f6e451': `${p.wd} ${p.day} ${p.month}, at ${time}`,
      // "Please arrive from {half an hour before}. The ceremony starts at {the time} sharp."
      'inv.8edf3058': time,
      'inv.6fcb1ea3': p.time(new Date(start.getTime() - 30 * 60_000)),
    });
  }
  // The place: the venue's name, and its street address where they've given one.
  const venue = first?.venue?.trim();
  const address = first?.address?.trim();
  if (venue) Object.assign(out, { 'inv.984b8c1f': venue, 'inv.e257ef55': venue, 'inv.a045b264': ` ${venue}.`, 'inv.ffa3f3e2': address || venue, 'inv.de092a2e': `At ${venue}` });
  if (address)
    Object.assign(out, {
      'inv.ffa3f3e2': address,
      'inv.8297e5e4': `Address: ${address}. `,
      'inv.db80331a': ` to ${address}.`,
      'inv.bcd99820': ` book a car or shuttle from the airport to ${address}.`,
      'inv.698be8f5': `. Mention ${address}.`,
    });
  const second = f.events[1];
  if (second?.starts_at && !Number.isNaN(Date.parse(second.starts_at))) {
    const p = parts(second.starts_at, f.tz);
    Object.assign(out, {
      'inv.151c236f': `${p.wd} ${p.day} ${p.month} ${p.year}`,
      'inv.cab17d53': `Dress code · ${p.wd} ${p.day} ${p.month}`,
      'inv.77a888e3': `${p.wd} ${p.day} ${p.month}, ${p.time(new Date(second.starts_at))}`,
    });
  }
  if (f.rsvpClose && /^\d{4}-\d{2}-\d{2}$/.test(f.rsvpClose)) {
    const p = parts(`${f.rsvpClose}T12:00:00Z`, 'UTC');
    out['inv.ddbb7763'] = `${p.day} ${p.month} ${p.year}`;
  }
  return out;
}

/**
 * A wedding's wording: its own, over the starting wording, with the starting wording's placeholders filled
 * from what the couple has told us (anything they've written themselves is never replaced).
 */
export const withDefaults = (texts: Record<string, string> | undefined, facts?: Facts): Record<string, string> => {
  const own = texts ?? {};
  const out = { ...DEFAULT_TEXTS, ...own };
  if (facts) for (const [k, v] of Object.entries(fillsFor(facts))) if (own[k] === undefined && v) out[k] = v;
  return out;
};
