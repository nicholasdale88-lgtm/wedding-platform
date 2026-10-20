import { allPayments, dateIn, randomToken } from '@wp/shared';
import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';
import { readDoc } from './planner';

/**
 * The planner on the couple's phone calendar: a private link (Apple Calendar, Google, Outlook all subscribe
 * to it) with every date in the plan, as all-day reminders: tasks when due, payments, quotes running out,
 * fittings, the hens and bucks, replies closing, and the events themselves. Their phone checks it daily.
 * Admin: /api/a/w/:wid/planner-calendar (switch on, a new link, off). The feed: /api/cal/:wid/:key.ics
 */

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Lines over 75 characters are folded (by whole characters, so nothing is cut in half). */
const fold = (line: string) => {
  const rows: string[] = [];
  let cur = '';
  let n = 0;
  for (const ch of line) {
    if (n === 72) {
      rows.push(cur);
      cur = '';
      n = 0;
    }
    cur += ch;
    n++;
  }
  rows.push(cur);
  return rows.join('\r\n ');
};
const ymd = (d: string) => d.replace(/-/g, '');
const DAY = 86_400_000;

type C = Context<AdminEnv>;
const keyOf = async (db: D1Database, wid: string) =>
  (await db.prepare(`SELECT json_extract(content, '$.plannerCal') AS k FROM wedding WHERE id = ?`).bind(wid).first<{ k: string | null }>())?.k ?? '';

export function plannerCalendarAdminRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const url = (c: C, k: string) => (k ? `${(c.env.PUBLIC_BASE_URL ?? new URL(c.req.url).origin).replace(/\/+$/, '')}/api/cal/${c.req.param('wid')}/${k}.ics` : '');
  app.get('/', async (c) => c.json({ url: url(c, await keyOf(c.env.DB, c.req.param('wid')!)) }));
  /** On (a new private link; the old one stops working) or off. */
  app.put('/', requireMember('owner', 'editor'), async (c) => {
    const on = ((await readJson(c.req.raw)) as { on?: unknown } | null)?.on === true;
    const k = on ? randomToken(24) : '';
    await c.env.DB.prepare(on ? `UPDATE wedding SET content = json_set(content, '$.plannerCal', ?) WHERE id = ? AND json_valid(content)` : `UPDATE wedding SET content = json_remove(content, '$.plannerCal') WHERE id = ? AND json_valid(content)`)
      .bind(...(on ? [k, c.req.param('wid')] : [c.req.param('wid')]))
      .run();
    return c.json({ url: url(c, k) });
  });
  return app;
}

export function plannerCalendarFeed() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/:wid/:file', async (c) => {
    const wid = c.req.param('wid');
    const key = c.req.param('file').replace(/\.ics$/, '');
    if (!(await allow(c.env.DB, `cal:${wid}`, 240, 3_600_000))) return c.text('Slow down', 429);
    const db = c.env.DB;
    const w = await db.prepare(`SELECT name1, name2, timezone, content FROM wedding WHERE id = ? AND deleted_at IS NULL`).bind(wid).first<{ name1: string; name2: string; timezone: string; content: string }>();
    const stored = w ? await keyOf(db, wid) : '';
    if (!w || !stored || key.length < 20 || key !== stored) return c.text('Not found', 404);
    const { results: events } = await db.prepare(`SELECT key, name, starts_at FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`).bind(wid).all<{ key: string; name: string; starts_at: string }>();
    const tz = w.timezone;
    const first = events[0];
    const day = first ? Date.parse(first.starts_at) : NaN;
    const [plan, budget, vendors, p1, p2] = await Promise.all([
      readDoc(db, wid, 'checklist', ''),
      readDoc(db, wid, 'budget', ''),
      readDoc(db, wid, 'vendors', ''),
      readDoc(db, wid, 'party-p1', ''),
      readDoc(db, wid, 'party-p2', ''),
    ]);
    const items: { id: string; date: string; title: string; note?: string; alarm?: boolean }[] = [];
    for (const e of events) items.push({ id: `event-${e.key}`, date: dateIn(tz, new Date(e.starts_at)), title: e.name });
    if (!Number.isNaN(day)) {
      for (const t of plan.data.tasks.filter((x) => !x.done)) items.push({ id: `task-${t.id}`, date: dateIn(tz, new Date(day - t.before * DAY)), title: `${t.legal ? 'Legal: ' : ''}${t.text}`, note: t.note });
    }
    for (const p of allPayments(budget.data.lines, vendors.data.list)) {
      if (!p.paid && p.due && p.amount > 0) items.push({ id: `pay-${p.key}-${p.due}`, alarm: true, date: p.due, title: `Pay ${p.who}${p.label === 'Payment' ? '' : ` (${p.label.toLowerCase()})`} ($${Math.round(p.amount)})` });
    }
    for (const v of vendors.data.list) {
      if (v.status !== 'booked' && v.status !== 'declined') for (const q of v.quotes.filter((x) => x.validUntil)) items.push({ id: `quote-${q.id}`, date: q.validUntil, title: `${v.name}'s quote runs out` });
    }
    for (const [side, doc] of [
      ['p1', p1],
      ['p2', p2],
    ] as const) {
      if (doc.data.party.date) items.push({ id: `party-${side}`, date: doc.data.party.date, title: doc.data.party.title || (side === 'p1' ? 'The hens' : 'The bucks'), note: doc.data.party.place });
      for (const t of doc.data.tasks.filter((x) => x.due && !x.done)) items.push({ id: `side-${t.id}`, date: t.due, title: t.text });
      for (const [pid, p] of Object.entries(doc.data.people)) if (p.fitting) items.push({ id: `fit-${pid}`, date: p.fitting, title: `Fitting${p.outfit ? `: ${p.outfit}` : ''}` });
    }
    const close = (JSON.parse(w.content || '{}') as { invitation?: { rsvpClose?: string } }).invitation?.rsvpClose;
    if (close) items.push({ id: 'rsvp-close', date: close, title: 'Replies close' });

    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const couple = `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//wedding-platform//planner//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(`${couple}: wedding plan`)}`,
      'X-PUBLISHED-TTL:PT12H',
      'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
      ...items
        .filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.date))
        .flatMap((i) => {
          const next = new Date(Date.parse(`${i.date}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
          return [
            'BEGIN:VEVENT',
            `UID:${esc(i.id)}-${wid}@wedding-platform`,
            `DTSTAMP:${now}`,
            `DTSTART;VALUE=DATE:${ymd(i.date)}`,
            `DTEND;VALUE=DATE:${ymd(next)}`,
            `SUMMARY:${esc(i.title)}`,
            ...(i.note ? [`DESCRIPTION:${esc(i.note)}`] : []),
            'TRANSP:TRANSPARENT',
            // A payment's alert: 9am, three days before it's due.
            ...(i.alarm ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(i.title)}`, 'TRIGGER:-P2DT15H', 'END:VALARM'] : []),
            'END:VEVENT',
          ];
        }),
      'END:VCALENDAR',
    ];
    return new Response(lines.map(fold).join('\r\n') + '\r\n', {
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=600', 'content-disposition': 'inline; filename="wedding-plan.ics"' },
    });
  });
  return app;
}
