import { joinFirstNames, render, segments, toGsm } from '@wp/shared';
import type { EventInfo, Recipient, WeddingCtx } from './types';

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

/** Personal page URLs. The first event's guide is `{guide}`; others are `{guide_<key>}`. */
export function links(w: WeddingCtx, events: EventInfo[], r: Recipient) {
  const base = `${w.baseUrl.replace(/\/+$/, '')}/w/${w.slug}`;
  const q = `?g=${r.token}`;
  const guides: Record<string, string> = {};
  [...events].sort((a, b) => a.sort - b.sort).forEach((e, i) => {
    guides[i === 0 ? 'guide' : `guide_${e.key}`] = i === 0 ? `${base}/tomorrow${q}` : `${base}/tomorrow/${e.key}${q}`;
  });
  return { link: `${base}/${q}`, photos: `${base}/photos${q}`, savethedate: `${base}/save-the-date${q}`, ...guides };
}

/** "the wedding and the 30th" for invited events still awaiting a reply. */
export function pending(events: EventInfo[], r: Recipient): string {
  const labels = [...events]
    .sort((a, b) => a.sort - b.sort)
    .filter((e) => r.invited.includes(e.key) && (r.rsvp[e.key]?.attending ?? null) === null)
    .map((e) => e.pendingLabel);
  return labels.length ? labels.join(' and ') : 'the celebrations';
}

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
    ...(r.tableName ? { table: r.tableName } : {}),
    ...links(w, events, r),
  });
  body = toGsm(body).trim();
  if (opts.footer && w.optOutFooter && !/\bSTOP\b/i.test(body)) body = `${body} ${w.optOutFooter}`;
  const unfilled = [...body.matchAll(/\{([a-z0-9_]+)\}/gi)].map((m) => m[1]!);
  return { body, parts: segments(body).parts, unfilled };
}
