import { joinFirstNames, render, segments, toGsm } from '@wp/shared';
import type { EventInfo, Recipient, WeddingCtx } from './types';

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** {rsvp_by}: the day replies close ("Wednesday 18 August"), or "the RSVP date" when none is set. */
export function rsvpBy(close: string | undefined): string {
  if (!close || !/^\d{4}-\d{2}-\d{2}$/.test(close)) return 'the RSVP date';
  const d = new Date(`${close}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Personal page URLs. The first event's guide is `{guide}`; others are `{guide_<key>}`. */
export function links(w: WeddingCtx, events: EventInfo[], r: Recipient) {
  const base = `${w.baseUrl.replace(/\/+$/, '')}/w/${w.slug}`;
  const q = `?g=${r.token}`;
  const guides: Record<string, string> = {};
  [...events].sort((a, b) => a.sort - b.sort).forEach((e, i) => {
    guides[i === 0 ? 'guide' : `guide_${e.key}`] = i === 0 ? `${base}/tomorrow${q}` : `${base}/tomorrow/${e.key}${q}`;
  });
  return { link: `${base}/${q}`, photos: `${base}/photos${q}`, thanks: `${base}/thanks${q}`, savethedate: `${base}/save-the-date${q}`, ...guides };
}

/** "the wedding and the 30th" for invited events still awaiting a reply. */
export function pending(events: EventInfo[], r: Recipient): string {
  const labels = [...events]
    .sort((a, b) => a.sort - b.sort)
    .filter((e) => r.invited.includes(e.key) && (r.rsvp[e.key]?.attending ?? null) === null)
    .map((e) => e.pendingLabel);
  return labels.length ? labels.join(' and ') : 'the celebrations';
}

/** The blanks a text can use: each is filled in for every guest ({table} only once they're seated). */
const FILLABLE = new Set(['first', 'pending', 'couple', 'partner1', 'partner2', 'rsvp_by', 'table', 'link', 'photos', 'thanks', 'savethedate', 'guide']);
/** Blanks in a text's words that can never be filled in for a guest (e.g. {venue}): a text with one is never sent. */
export function cantFill(template: string): string[] {
  const out = new Set<string>();
  for (const [, name] of template.matchAll(/\{([a-z0-9_]+)\}/gi)) if (!FILLABLE.has(name!) && !/^guide_[a-z0-9_]+$/.test(name!)) out.add(name!);
  return [...out];
}
export const cantFillMessage = (names: string[]) =>
  `{${names.join('}, {')}} can’t be filled in for each guest, so the text would never send. Use the + buttons under the message instead, or write it out.`;

export interface Rendered {
  body: string;
  parts: number;
  /** Placeholders left unfilled. A message with any of these is never sent. */
  unfilled: string[];
}

/** Render a template for one invitation, add the opt-out footer, and make it GSM-safe. */
export function renderFor(
  template: string,
  w: WeddingCtx,
  events: EventInfo[],
  r: Recipient,
  opts: { footer?: boolean } = {},
): Rendered {
  let body = render(template, {
    first: joinFirstNames(r.people),
    pending: pending(events, r),
    couple: `${firstName(w.name1)} & ${firstName(w.name2)}`,
    partner1: firstName(w.name1),
    partner2: firstName(w.name2),
    rsvp_by: rsvpBy(w.rsvpClose),
    ...(r.tableName ? { table: r.tableName } : {}),
    ...links(w, events, r),
  });
  body = toGsm(body).trim();
  if (opts.footer && w.optOutFooter && !/\bSTOP\b/i.test(body)) body = `${body} ${w.optOutFooter}`;
  const unfilled = [...body.matchAll(/\{([a-z0-9_]+)\}/gi)].map((m) => m[1]!);
  return { body, parts: segments(body).parts, unfilled };
}
