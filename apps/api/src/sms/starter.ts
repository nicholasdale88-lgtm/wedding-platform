import { zonedToUtc } from '@wp/shared';
import type { Audience } from './types';

/**
 * The texts every wedding starts with: the save the date, the invitation, two reminders before replies
 * close, the thank-you after each reply, the night-before guide and a thank-you the day after. All of
 * them start switched off ("Ready to switch on" on the Texts screen): nothing is ever sent until the
 * couple turns each one on. They are ordinary campaigns, so they go by every way the wedding sends (the
 * texting service, their own number, email, and their own phone).
 *
 * The dated ones get their send times from the wedding's date and reply-by date. While a message is still
 * as it was made (never switched on or edited) those times follow the wedding: change the date and they
 * move with it. Weddings with this set are marked content.starterTexts.
 */

export type StarterKey = 'savedate' | 'invite' | 'reminder' | 'lastcall' | 'thanks' | 'nightW' | 'after';
type DatedKey = 'savedate' | 'reminder' | 'lastcall' | 'nightW' | 'after';

interface Starter {
  key: StarterKey;
  name: (eventName: string) => string;
  body: string;
  mode: 'auto' | 'dates';
  trigger: 'invitation_created' | 'rsvp_changed' | null;
  audience: (firstEvent: string) => Audience;
}

const lower = (s: string) => s.replace(/^The\s/, 'the ');

export const STARTERS: Starter[] = [
  {
    key: 'savedate',
    name: () => 'Save the date',
    body: 'Hi {first}, save the date! {couple} are getting married, and we would love you there. Your invitation will follow: {savethedate}',
    mode: 'dates',
    trigger: null,
    audience: () => ({ all: true }),
  },
  {
    key: 'invite',
    name: () => 'Invitation',
    body: 'Hi {first}, {couple} would love you to celebrate with them. Your invitation and RSVP: {link}',
    mode: 'auto',
    trigger: 'invitation_created',
    audience: () => ({ all: true }),
  },
  {
    key: 'reminder',
    name: () => 'RSVP reminder',
    body: 'Hi {first}, a gentle reminder to RSVP for {pending} by {rsvp_by}. It only takes a minute: {link}',
    mode: 'dates',
    trigger: null,
    audience: () => ({ invitedBefore: true, awaitingAny: true }),
  },
  {
    key: 'lastcall',
    name: () => 'Last call to RSVP',
    body: 'Hi {first}, RSVPs for {pending} close on {rsvp_by}. Could you let us know if you can make it? {link}',
    mode: 'dates',
    trigger: null,
    audience: () => ({ invitedBefore: true, awaitingAny: true }),
  },
  {
    key: 'thanks',
    name: () => 'RSVP thank-you',
    body: 'Thanks {first}, we have your RSVP. You can change it until {rsvp_by}: {link}',
    mode: 'auto',
    trigger: 'rsvp_changed',
    audience: () => ({ all: true }),
  },
  {
    key: 'nightW',
    name: (ev) => `Night before: ${lower(ev)}`,
    body: 'Hi {first}, see you tomorrow! Your times, table and directions: {guide}',
    mode: 'dates',
    trigger: null,
    audience: (ev) => ({ attending: ev }),
  },
  {
    key: 'after',
    name: () => 'Thank you for coming',
    body: 'Thank you for celebrating with us, {first}! It meant so much to have you there. Love, {couple}',
    mode: 'dates',
    trigger: null,
    audience: (ev) => ({ attending: ev }),
  },
];

/** What the send times are worked out from. */
export interface StarterFacts {
  /** The first event's start (ISO). */
  startsAt: string;
  tz: string;
  /** Replies close (yyyy-mm-dd), or '' when not set (then six weeks before the day). */
  rsvpClose: string;
  /** False while the couple hasn't told us their date: no send times until they do. */
  dateSet: boolean;
}

const ymdIn = (iso: string, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const shift = (ymd: string, days: number, months = 0) => {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1 + months, d + days)).toISOString().slice(0, 10);
};

/**
 * When each dated message goes, in UTC (only times still to come):
 * - save the date: ten months before, 10am (before the invitations, which start eight months before);
 * - RSVP reminder: two weeks before replies close, 10am; last call: three days before, 10am;
 * - night before: the evening before, 5pm; thank you: the day after, 11am.
 */
export function starterTimes(f: StarterFacts, now: Date): Record<DatedKey, string[]> {
  const none: Record<DatedKey, string[]> = { savedate: [], reminder: [], lastcall: [], nightW: [], after: [] };
  if (!f.dateSet || Number.isNaN(Date.parse(f.startsAt))) return none;
  const day = ymdIn(f.startsAt, f.tz);
  const close = /^\d{4}-\d{2}-\d{2}$/.test(f.rsvpClose) ? f.rsvpClose : shift(day, -42);
  const at = (ymd: string, hm: string) => zonedToUtc(`${ymd}T${hm}`, f.tz).toISOString();
  const future = (iso: string) => (Date.parse(iso) > now.getTime() ? [iso] : []);
  return {
    savedate: future(at(shift(day, 0, -10), '10:00')),
    reminder: future(at(shift(close, -14), '10:00')),
    lastcall: future(at(shift(close, -3), '10:00')),
    nightW: future(at(shift(day, -1), '17:00')),
    after: future(at(shift(day, 1), '11:00')),
  };
}

const isDated = (k: StarterKey): k is DatedKey => k !== 'invite' && k !== 'thanks';

/** The facts for a wedding, from the database. Null when it has no events. */
async function factsOf(db: D1Database, weddingId: string) {
  const w = await db
    .prepare(
      `SELECT w.timezone AS tz, w.content AS content, e.key AS key, e.name AS name, e.starts_at AS startsAt
         FROM wedding w JOIN event e ON e.wedding_id = w.id AND e.deleted_at IS NULL
        WHERE w.id = ? ORDER BY e.sort LIMIT 1`,
    )
    .bind(weddingId)
    .first<{ tz: string; content: string | null; key: string; name: string; startsAt: string }>();
  if (!w) return null;
  let content: { dateToBeSet?: unknown; starterTexts?: unknown; invitation?: { rsvpClose?: unknown } } = {};
  try {
    content = JSON.parse(w.content || '{}') as typeof content;
  } catch {
    content = {};
  }
  const close = content.invitation?.rsvpClose;
  const facts: StarterFacts = { startsAt: w.startsAt, tz: w.tz, rsvpClose: typeof close === 'string' ? close : '', dateSet: content.dateToBeSet !== true };
  return { event: { key: w.key, name: w.name }, starter: content.starterTexts === true, facts };
}

/**
 * The statements that add the starting set to a wedding, all switched off. INSERT OR IGNORE: a wedding
 * that already has a message with one of these keys keeps its own, and two at once don't double up.
 */
export function starterStatements(db: D1Database, weddingId: string, firstEvent: { key: string; name: string }, facts: StarterFacts, now: Date, newId: () => string = () => crypto.randomUUID()) {
  const times = starterTimes(facts, now);
  const out: D1PreparedStatement[] = [];
  STARTERS.forEach((s, i) => {
    const id = newId();
    out.push(
      db
        .prepare(`INSERT OR IGNORE INTO campaign (id, wedding_id, key, name, body, mode, enabled, trigger, audience, excluded, sort) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, '[]', ?)`)
        .bind(id, weddingId, s.key, s.name(firstEvent.name), s.body, s.mode, s.trigger, JSON.stringify(s.audience(firstEvent.key)), i),
    );
    // Only when that campaign is the one just made (not someone else's with the same key).
    if (isDated(s.key)) for (const at of times[s.key]) out.push(db.prepare(`INSERT INTO campaign_slot (id, campaign_id, send_at) SELECT ?, id, ? FROM campaign WHERE id = ?`).bind(newId(), at, id));
  });
  out.push(db.prepare(`UPDATE wedding SET content = json_set(content, '$.starterTexts', json('true')) WHERE id = ? AND json_valid(content)`).bind(weddingId));
  return out;
}

/**
 * When the Texts screen opens: a wedding with no built-in messages gets the starting set (weddings made
 * before it existed), and the starting messages nobody has touched yet follow the wedding's dates.
 */
export async function ensureStarterTexts(db: D1Database, weddingId: string, now: Date) {
  const has = await db.prepare(`SELECT 1 FROM campaign WHERE wedding_id = ? AND key NOT LIKE 'custom-%' LIMIT 1`).bind(weddingId).first();
  const info = await factsOf(db, weddingId);
  if (!info) return;
  if (!has) {
    await db.batch(starterStatements(db, weddingId, info.event, info.facts, now));
    return;
  }
  if (!info.starter) return;
  // Untouched (version 1, still off): its send times are the ones worked out from today's dates.
  const { results } = await db
    .prepare(
      `SELECT c.id, c.key, s.send_at FROM campaign c LEFT JOIN campaign_slot s ON s.campaign_id = c.id AND s.status = 'pending'
        WHERE c.wedding_id = ? AND c.version = 1 AND c.enabled = 0 AND c.deleted_at IS NULL AND c.mode = 'dates'`,
    )
    .bind(weddingId)
    .all<{ id: string; key: string; send_at: string | null }>();
  const have = new Map<string, { key: string; times: string[] }>();
  for (const r of results) {
    const x = have.get(r.id) ?? { key: r.key, times: [] };
    if (r.send_at) x.times.push(r.send_at);
    have.set(r.id, x);
  }
  const times = starterTimes(info.facts, now);
  const stmts: D1PreparedStatement[] = [];
  for (const [id, x] of have) {
    const key = x.key as StarterKey;
    if (!STARTERS.some((s) => s.key === key) || !isDated(key)) continue;
    const want = times[key];
    if (want.join() === [...x.times].sort().join()) continue;
    const untouched = `SELECT id FROM campaign WHERE id = ? AND version = 1 AND enabled = 0`;
    stmts.push(db.prepare(`DELETE FROM campaign_slot WHERE status = 'pending' AND campaign_id IN (${untouched})`).bind(id));
    for (const at of want) stmts.push(db.prepare(`INSERT INTO campaign_slot (id, campaign_id, send_at) SELECT ?, id, ? FROM (${untouched})`).bind(crypto.randomUUID(), at, id));
  }
  if (stmts.length) await db.batch(stmts);
}
