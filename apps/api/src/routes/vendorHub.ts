import { clockMinutes, dateIn, dropControls, guidesOf, isSerious, isVendorMoment, scheduleOf, VENDOR_PAGE_NOTE as FROM_PAGE, vendorShares, zonedToUtc, type Vendor } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { sessionId } from '../lib/auth';
import { allow } from '../lib/rateLimit';
import { readJson, safeJson } from '../lib/security';
import { changeDoc, readDoc } from './planner';
import { loadSeating } from './seating';
import { PLACES, REAL_INVITATION } from '../lib/realGuests';

/**
 * A vendor's own page (the celebrant, the caterer, the band…): /api/p/:slug/vendor/:vid/:key. The
 * details they need, always up to date: the day, the venue, when to arrive, the timeline, guest numbers,
 * dietary needs and meal choices (counts), their meals, their payments, and who to call on the day.
 * Nothing about guests by name, unless the couple shares the seating with this vendor (the caterer): then
 * each table, and who has a special meal at which seat. The band or DJ sees the song list.
 *
 * The same details as live files for the vendor's own tools (a spreadsheet, catering or booking software,
 * their calendar): /:vid/:key/dietary.csv, /songs.csv and /day.ics, always current. The vendor can also
 * confirm the details (POST /:vid/:key/confirm), which ticks them off in the couple's planner.
 *
 * The key is made from the vendor and the server secret: it can't be guessed, and removing the vendor ends it.
 */
export async function vendorHubKey(secret: string, weddingId: string, vendorId: string) {
  return (await sessionId(`vendor-hub:${weddingId}:${vendorId}`, secret)).slice(0, 24);
}

type C = Context<{ Bindings: Env }>;
type Wedding = { id: string; name1: string; name2: string; timezone: string; guide: string; admin_mobile: string | null };
type Ev = { id: string; key: string; name: string; starts_at: string; venue: string | null; address: string | null };
type Opened = { w: Wedding; v: Vendor; all: Vendor[]; ev: Ev | null };

const firstNames = (w: Wedding) => `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`;
const none = (c: C) => c.json({ error: { code: 'no_link', message: 'This page isn’t available. Please ask the couple for a new link.' } }, 404);
const slow = (c: C) => c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);
const ip = (c: C) => c.req.header('CF-Connecting-IP') ?? 'local';

/** The wedding and vendor behind a link, or null (a wrong key, a declined or removed vendor). */
async function open(c: C): Promise<Opened | null> {
  const secret = c.env.SESSION_SECRET;
  const db = c.env.DB;
  const vid = c.req.param('vid') ?? '';
  const w = await db.prepare(`SELECT id, name1, name2, timezone, guide, admin_mobile FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(c.req.param('slug')).first<Wedding>();
  if (!w || !secret || c.req.param('key') !== (await vendorHubKey(secret, w.id, vid))) return null;
  const all = (await readDoc(db, w.id, 'vendors', '')).data.list;
  const v = all.find((x) => x.id === vid);
  if (!v || v.status === 'declined') return null;
  const ev = await db.prepare(`SELECT id, key, name, starts_at, venue, address FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort LIMIT 1`).bind(w.id).first<Ev>();
  return { w, v, all, ev };
}

/**
 * The same details for a vendor signed in to their portal (the couple has them in their planner): the page's
 * contents, and the live files' links. Null when the wedding or that vendor isn't there (or declined).
 */
export async function vendorDetailsFor(db: D1Database, secret: string, origin: string, weddingId: string, vendorId: string) {
  const w = await db.prepare(`SELECT id, slug, name1, name2, timezone, guide, admin_mobile FROM wedding WHERE id = ? AND deleted_at IS NULL`).bind(weddingId).first<Wedding & { slug: string }>();
  if (!w) return null;
  const all = (await readDoc(db, w.id, 'vendors', '')).data.list;
  const v = all.find((x) => x.id === vendorId);
  if (!v || v.status === 'declined') return null;
  const ev = await db.prepare(`SELECT id, key, name, starts_at, venue, address FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort LIMIT 1`).bind(w.id).first<Ev>();
  const page = await pageOf(db, { w, v, all, ev });
  const key = await vendorHubKey(secret, w.id, v.id);
  const api = `${origin}/api/p/${w.slug}/vendor/${encodeURIComponent(v.id)}/${key}`;
  return { ...page, files: { dietary: `${api}/dietary.csv`, day: `${api}/day.ics`, songs: page.songs ? `${api}/songs.csv` : '' } };
}

/** Everything on the page. */
async function pageOf(db: D1Database, o: Opened) {
  const { w, v, all, ev } = o;
  const shares = vendorShares(v);
  // How many are coming, and what they can't eat (counts only, never names).
  const counts = ev
    ? await db
        .prepare(
          // Counted as the couple's overview counts them (shared/counts): coming, and the guests still to reply.
          `SELECT COALESCE(SUM(CASE WHEN r.attending = 1 THEN MAX(1, COALESCE(r.count, 1)) ELSE 0 END), 0) AS coming,
                  COALESCE(SUM(CASE WHEN r.attending IS NULL THEN ${PLACES} ELSE 0 END), 0) AS waiting
             FROM invitation i JOIN invite_event ie ON ie.invitation_id = i.id AND ie.event_id = ?1
             LEFT JOIN rsvp r ON r.invitation_id = i.id AND r.event_id = ?1
            WHERE i.wedding_id = ?2 AND i.deleted_at IS NULL AND ${REAL_INVITATION}`,
        )
        .bind(ev.id, w.id)
        .first<{ coming: number; waiting: number }>()
    : null;
  const { results: diets } = ev
    ? await db
        .prepare(
          // The named people coming (the first N named on each yes), as the dietary page counts them.
          `SELECT p.diet FROM person p JOIN invitation i ON i.id = p.invitation_id JOIN invite_event ie ON ie.invitation_id = i.id AND ie.event_id = ?1
             JOIN rsvp r ON r.invitation_id = i.id AND r.event_id = ?1 AND r.attending = 1
            WHERE i.wedding_id = ?2 AND i.deleted_at IS NULL AND p.deleted_at IS NULL AND trim(p.name) != '' AND trim(p.diet) != ''
              AND (SELECT COUNT(*) FROM person q WHERE q.invitation_id = p.invitation_id AND q.deleted_at IS NULL AND trim(q.name) != '' AND q.idx < p.idx) < MAX(1, COALESCE(r.count, 1))`,
        )
        .bind(ev.id, w.id)
        .all<{ diet: string }>()
    : { results: [] as { diet: string }[] };
  const tally = new Map<string, number>();
  for (const d of diets) for (const part of d.diet.split(/[;,]\s*/).map((x) => x.trim()).filter(Boolean)) tally.set(part, (tally.get(part) ?? 0) + 1);
  const guide = ev ? (guidesOf(safeJson(w.guide, {}), [ev.key])[ev.key] as Record<string, unknown> | undefined) : undefined;
  const contacts = (guide?.contacts as { name: string; role: string; phone: string }[] | undefined) ?? [];

  // The seating, read once: meal choice counts for everyone, and the caterer's table plan when shared.
  const s = ev ? await loadSeating(db, w.id) : null;
  const meals: { course: string; choice: string; n: number }[] = [];
  if (s) {
    const coming = [...s.view.couple, ...s.view.people].filter((p) => p.coming);
    for (const [course, k] of [['Entrée', 'e'], ['Main', 'm'], ['Dessert', 'd']] as const) {
      const by = new Map<string, number>();
      for (const p of coming) if (p.meal[k]) by.set(p.meal[k], (by.get(p.meal[k]) ?? 0) + 1);
      for (const [choice, n] of [...by.entries()].sort((a, b) => b[1] - a[1])) meals.push({ course, choice, n });
    }
  }
  let seating = null;
  if (shares.seating && s) {
    const plan = s.publishedPlan ?? s.draft;
    const people = [...s.view.couple, ...s.view.people].filter((p) => p.coming && plan.seats[p.id]); // the couple too, where they sit
    const num = (t: string) => (/^\d+$/.test(t) ? `Table ${t}` : t);
    const tables = [...plan.tables].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const special = (p: (typeof people)[number]) => !!(p.diet.trim() || p.meal.e || p.meal.m || p.meal.d);
    const rows = tables.flatMap((t) =>
      people
        .filter((p) => plan.seats[p.id] === t.id)
        .map((p, i) => ({ table: num(t.name), tableId: t.id, seat: i + 1, name: p.name, diet: p.diet, meal: p.meal, serious: isSerious(p.diet), special: special(p) })),
    );
    seating = {
      event: s.view.event.name,
      aspect: plan.aspect || s.view.aspect,
      published: !!s.publishedPlan,
      tables: tables.map((t) => {
        const here = rows.filter((r) => r.tableId === t.id);
        return { id: t.id, name: num(t.name), shape: t.shape, dir: t.dir, len: t.len, x: t.x, y: t.y, seats: t.seats, guests: here.length, special: here.filter((r) => r.special).length, serious: here.some((r) => r.serious) };
      }),
      areas: plan.areas,
      special: rows.filter((r) => r.special).map((r) => ({ table: r.table, seat: r.seat, name: r.name, diet: r.diet, meal: r.meal, serious: r.serious })),
      notSeated: s.view.people.filter((p) => p.coming && !plan.seats[p.id] && special(p)).map((p) => ({ name: p.name, diet: p.diet, meal: p.meal, serious: isSerious(p.diet) })),
    };
  }
  return {
    couple: firstNames(w),
    shares,
    seating,
    songs: shares.songs ? await songsOf(db, w.id) : null,
    // For the caterer: every booked vendor team's meals on the day, so they cook for them too.
    vendorMeals: shares.seating ? all.filter((x) => x.status === 'booked' && x.meals > 0).map((x) => ({ name: x.name, meals: x.meals })) : [],
    vendor: { name: v.name, category: v.category, arrival: v.arrival, meals: v.meals, confirmedOn: v.confirmedOn ?? '' },
    // The other suppliers booked for the day, so the photographer can find the band: who to ask for, their
    // phone and email (business contacts only, and only to the other vendors booked for this wedding).
    team: all
      .filter((x) => x.id !== v.id && x.status === 'booked')
      .map((x) => ({ name: x.name, category: x.category, arrival: x.arrival, contact: x.contact, phone: x.phone, email: x.email }))
      .sort((a, b) => (clockMinutes(a.arrival) ?? 9999) - (clockMinutes(b.arrival) ?? 9999) || a.name.localeCompare(b.name)),
    event: ev ? { name: ev.name, startsAt: ev.starts_at, venue: ev.venue ?? '', address: ev.address ?? '' } : null,
    timezone: w.timezone,
    parking: [guide?.parking, guide?.parkDirections].filter((x): x is string => typeof x === 'string' && !!x.trim()).join(' '),
    // The day's timeline, with this vendor's own moments marked.
    timeline: ((guide?.runsheet as { t: string; what: string; where: string }[] | undefined) ?? []).filter((r) => r.t || r.what).map((r) => ({ ...r, mine: isVendorMoment(v, `${r.what} ${r.where}`) })),
    guests: counts ? { coming: counts.coming, waiting: counts.waiting } : null,
    dietary: [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([diet, n]) => ({ diet, n, serious: isSerious(diet) })),
    meals,
    payments: scheduleOf(v).map((p) => ({ label: p.label, amount: p.amount, due: p.due, paid: p.paid })),
    // Who to call on the day: the guide's contacts (the coordinator first), else the couple.
    contacts: contacts.length ? contacts : w.admin_mobile ? [{ name: firstNames(w), role: 'The couple', phone: w.admin_mobile }] : [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * The song list for the band or DJ: what the couple marked must play, maybe and don't play, and guests'
 * requests not sorted yet. The same song asked for twice is one line with how many asked. Guests' names
 * and notes stay private; the couple's own notes (the first dance) are shown.
 */
async function songsOf(db: D1Database, weddingId: string) {
  const { results } = await db
    .prepare(`SELECT title, artist, note, status, invitation_id FROM song_request WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY created_at LIMIT 500`)
    .bind(weddingId)
    .all<{ title: string; artist: string; note: string; status: string; invitation_id: string | null }>();
  const rank: Record<string, number> = { must: 0, maybe: 1, no: 2, new: 3 };
  const by = new Map<string, { title: string; artist: string; note: string; status: string; asks: number }>();
  for (const r of results) {
    const k = `${r.title.trim().toLowerCase()}|${r.artist.trim().toLowerCase()}`;
    const mine = r.invitation_id === null;
    const cur = by.get(k);
    if (!cur) {
      by.set(k, { title: r.title, artist: r.artist, note: mine ? r.note : '', status: r.status, asks: mine ? 0 : 1 });
      continue;
    }
    if (!mine) cur.asks++;
    if (mine && r.note && !cur.note) cur.note = r.note;
    // The couple's firmest decision wins: must play, then maybe, then don't play; any decision over not sorted.
    if ((rank[r.status] ?? 9) < (rank[cur.status] ?? 9)) cur.status = r.status;
  }
  return [...by.values()].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.asks - a.asks);
}

/** A cell for a spreadsheet: quoted, and never read as a formula. */
const cell = (x: string | number) => {
  const s = String(x);
  return `"${(/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};
const csv = (name: string, rows: (string | number)[][]) =>
  new Response(`\ufeff${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `inline; filename="${name}"`, 'cache-control': 'private, max-age=60', 'x-robots-tag': 'noindex' },
  });

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Lines over 75 characters are folded (by whole characters). */
const fold = (line: string) => {
  const rows: string[] = [];
  let cur = '';
  let n = 0;
  for (const ch of line) {
    if (n === 72) {
      rows.push(cur);
      cur = ' ';
      n = 1;
    }
    cur += ch;
    n++;
  }
  rows.push(cur);
  return rows.join('\r\n');
};

type Page = Awaited<ReturnType<typeof pageOf>>;

function dietaryCsv(p: Page, slug: string) {
  const rows: (string | number)[][] = [];
  if (p.seating) {
    rows.push(['Table', 'Seat', 'Name', 'Dietary needs', 'Serious allergy', 'Entrée', 'Main', 'Dessert']);
    for (const r of p.seating.special) rows.push([r.table, r.seat, r.name, r.diet, r.serious ? 'Yes' : '', r.meal.e, r.meal.m, r.meal.d]);
    for (const r of p.seating.notSeated) rows.push(['Not seated yet', '', r.name, r.diet, r.serious ? 'Yes' : '', r.meal.e, r.meal.m, r.meal.d]);
    rows.push([]);
  }
  rows.push(['Summary', 'Count', 'Note']);
  if (p.guests) rows.push(['Guests coming', p.guests.coming, p.guests.waiting ? `Up to ${p.guests.waiting} more still to reply` : '']);
  for (const d of p.dietary) rows.push([d.diet, d.n, d.serious ? 'Serious' : '']);
  for (const m of p.meals) rows.push([`${m.course}: ${m.choice}`, m.n, 'Meal choice']);
  for (const m of p.vendorMeals) rows.push([`Vendor meals: ${m.name}`, m.meals, '']);
  return csv(`${slug}-dietary.csv`, rows);
}

function dayIcs(p: Page, vendorId: string, vendorName: string) {
  const now = stamp(new Date());
  const out: string[] = [];
  if (p.event?.startsAt) {
    const start = new Date(p.event.startsAt);
    const date = start.toLocaleDateString('en-CA', { timeZone: p.timezone });
    const m = clockMinutes(p.vendor.arrival);
    const arrive = m === null ? start : zonedToUtc(`${date}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, p.timezone);
    const where = [p.event.venue, p.event.address].filter(Boolean).join(', ');
    const note = [
      p.vendor.arrival && `You're expected: ${p.vendor.arrival}`,
      p.parking && `Parking: ${p.parking}`,
      p.guests && `Guests coming: ${p.guests.coming}`,
      p.contacts.length ? `On the day: ${p.contacts.map((x) => `${x.name}${x.role ? ` (${x.role})` : ''} ${x.phone}`).join('; ')}` : '',
      p.timeline.length ? `Timeline:\n${p.timeline.map((r) => `${r.t} ${r.what}${r.where ? ` (${r.where})` : ''}`).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const end = new Date(Math.max(arrive.getTime(), start.getTime()) + 6 * 3_600_000);
    out.push('BEGIN:VEVENT', `UID:vendor-${vendorId}-day@wedding-platform`, `DTSTAMP:${now}`, `DTSTART:${stamp(arrive)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(`${p.couple}'s wedding: ${vendorName}`)}`);
    if (where) out.push(`LOCATION:${esc(where)}`);
    out.push(`DESCRIPTION:${esc(note)}`, 'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Tomorrow: ${p.couple}'s wedding`)}`, 'END:VALARM', 'END:VEVENT');
  }
  // Their payments still to come, on the day each is due.
  for (const [i, pay] of p.payments.entries()) {
    if (pay.paid || !/^\d{4}-\d{2}-\d{2}$/.test(pay.due)) continue;
    const nextDay = new Date(Date.parse(`${pay.due}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
    out.push('BEGIN:VEVENT', `UID:vendor-${vendorId}-pay-${i}@wedding-platform`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${pay.due.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${nextDay}`, `SUMMARY:${esc(`${p.couple}: ${pay.label || 'payment'} due ($${Math.round(pay.amount)})`)}`, 'END:VEVENT');
  }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//wedding-platform//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(`${p.couple}'s wedding`)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H', ...out, 'END:VCALENDAR'];
  return new Response(lines.map(fold).join('\r\n') + '\r\n', { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300', 'x-robots-tag': 'noindex' } });
}

const SONG_LIST: Record<string, string> = { must: 'Must play', maybe: 'Maybe', no: 'Do not play', new: 'Guest request' };

export function vendorHubRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/:vid/:key', async (c) => {
    if (!(await allow(c.env.DB, `vendor-hub:${ip(c)}`, 120, 3_600_000))) return slow(c);
    const o = await open(c);
    return o ? c.json(await pageOf(c.env.DB, o)) : none(c);
  });

  /** The live files (dietary.csv, songs.csv, day.ics): spreadsheets and calendars fetch them again by themselves. */
  app.get('/:vid/:key/:file', async (c) => {
    if (!(await allow(c.env.DB, `vendor-feed:${ip(c)}`, 240, 3_600_000))) return slow(c);
    const file = c.req.param('file');
    if (!['dietary.csv', 'songs.csv', 'day.ics'].includes(file)) return none(c);
    const o = await open(c);
    if (!o) return none(c);
    const p = await pageOf(c.env.DB, o);
    const slug = (c.req.param('slug') ?? 'wedding').replace(/[^\w-]/g, '');
    if (file === 'dietary.csv') return dietaryCsv(p, slug);
    if (file === 'day.ics') return dayIcs(p, o.v.id, o.v.name);
    if (!p.songs) return none(c);
    return csv(`${slug}-songs.csv`, [['List', 'Song', 'Artist', 'Guests who asked', 'Note'], ...p.songs.map((s) => [SONG_LIST[s.status] ?? s.status, s.title, s.artist, s.asks, s.note])]);
  });

  /** The vendor confirms the details (with a note, if they like): ticked off in the couple's planner, the note in their log. */
  app.post('/:vid/:key/confirm', async (c) => {
    if (!(await allow(c.env.DB, `vendor-confirm:${ip(c)}`, 20, 3_600_000))) return slow(c);
    const body = z.object({ note: z.string().trim().max(800).default('') }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return c.json({ error: { code: 'invalid', message: 'Please keep the note under 800 characters.' } }, 400);
    const o = await open(c);
    if (!o) return none(c);
    const today = dateIn(o.w.timezone);
    const note = dropControls(body.data.note);
    const ok = await changeDoc(c.env.DB, o.w.id, 'vendors', '', (d) => {
      const v = d.list.find((x) => x.id === o.v.id);
      if (!v) return false;
      v.confirmedOn = today;
      // Newest first, as the planner keeps them.
      v.log = [{ id: crypto.randomUUID(), on: today, kind: 'note' as const, text: note ? `${FROM_PAGE}: ${note}` : `${FROM_PAGE}.` }, ...(v.log ?? [])].slice(0, 200);
    });
    if (!ok) return c.json({ error: { code: 'busy', message: 'That didn’t save. Please try again.' } }, 409);
    return c.json({ ok: true, confirmedOn: today });
  });
  return app;
}
