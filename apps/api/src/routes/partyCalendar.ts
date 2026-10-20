import { clockMinutes, itemsFor, sideDoc, sideOf, zonedToUtc } from '@wp/shared';
import { Hono } from 'hono';
import type { Env } from '../env';
import { sessionId } from '../lib/auth';
import { allow } from '../lib/rateLimit';
import { readDoc } from './planner';

/**
 * A wedding party member's own calendar, to subscribe to on their phone (iPhone, Android via Google
 * Calendar, Outlook): /api/p/:slug/party/cal/<person id>/<key>.ics. Their jobs with a reminder the
 * morning before (pick up the suits, the rings), their fittings, the hens or bucks, and on the day their
 * moments from the run sheet and what they're looking after. A change by the couple reaches their phone
 * by itself. The key is made from the person and the server secret, so it can't be guessed.
 */

export async function partyCalKey(secret: string, personId: string) {
  return (await sessionId(`party-cal:${personId}`, secret)).slice(0, 24);
}

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
const day = (ymd: string) => ymd.replace(/-/g, '');
const next = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');

export function partyCalendarRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/:pid/:file', async (c) => {
    const none = () => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    if (!(await allow(c.env.DB, `party-cal:${c.req.header('CF-Connecting-IP') ?? 'local'}`, 240, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);
    const secret = c.env.SESSION_SECRET;
    const pid = c.req.param('pid');
    const key = c.req.param('file').replace(/\.ics$/, '');
    if (!secret || key.length !== 24 || key !== (await partyCalKey(secret, pid))) return none();
    const db = c.env.DB;
    const p = await db
      .prepare(
        `SELECT p.id, p.name, p.party_role, w.id AS wid, w.slug, w.timezone, w.name1, w.name2 FROM person p JOIN invitation i ON i.id = p.invitation_id JOIN wedding w ON w.id = i.wedding_id
          WHERE p.id = ? AND w.slug = ? AND p.deleted_at IS NULL AND i.deleted_at IS NULL AND w.deleted_at IS NULL AND p.party_role != ''`,
      )
      .bind(pid, c.req.param('slug'))
      .first<{ id: string; name: string; party_role: string; wid: string; slug: string; timezone: string; name1: string; name2: string }>();
    if (!p) return none();
    const setup = (await readDoc(db, p.wid, 'party-setup', '')).data;
    if (setup.access[p.id] === false) return none(); // their page is paused
    const ev = await db.prepare(`SELECT key, name, starts_at FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort LIMIT 1`).bind(p.wid).first<{ key: string; name: string; starts_at: string }>();
    const couple = `${p.name1.split(' ')[0]} & ${p.name2.split(' ')[0]}`;
    const side = sideOf(p.party_role);
    const doc = side ? (await readDoc(db, p.wid, sideDoc(side), '')).data : null;
    const now = stamp(new Date());
    const out: string[] = [];
    const allDay = (uid: string, date: string, title: string, note = '', remind = true) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      out.push('BEGIN:VEVENT', `UID:${uid}@wedding-platform`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${day(date)}`, `DTEND;VALUE=DATE:${next(date)}`, `SUMMARY:${esc(title)}`);
      if (note) out.push(`DESCRIPTION:${esc(note)}`);
      // 9am the day before (an all-day event starts at midnight).
      if (remind) out.push('BEGIN:VALARM', 'TRIGGER:-PT15H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Tomorrow: ${title}`)}`, 'END:VALARM');
      out.push('END:VEVENT');
    };
    // Their jobs.
    for (const t of doc?.tasks ?? []) if (t.person === p.id && !t.done && t.due) allDay(`job-${t.id}`, t.due, t.text, `Your job for ${couple}'s wedding`);
    // Their fitting, and the hens or bucks.
    const me = doc?.people[p.id];
    if (me?.fitting) allDay(`fit-${p.id}`, me.fitting, `Fitting${me.outfit ? `: ${me.outfit}` : ''}`, `For ${couple}'s wedding`);
    if (doc?.party.date) allDay(`party-${side}`, doc.party.date, doc.party.title || (side === 'p1' ? 'The hens' : 'The bucks'), doc.party.place ? `At ${doc.party.place}` : '');
    // The day: their moments from the run sheet, and what they're looking after.
    if (ev) {
      const date = ev.starts_at ? new Date(ev.starts_at).toLocaleDateString('en-CA', { timeZone: p.timezone }) : '';
      const rs = (await readDoc(db, p.wid, 'party-runsheet', ev.key)).data;
      itemsFor(rs.items, p.party_role).forEach((it, i) => {
        const m = clockMinutes(it.time);
        if (m === null || !date) return;
        const start = zonedToUtc(`${date}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, p.timezone);
        const um = clockMinutes(it.until);
        const end = um !== null && um > m ? new Date(start.getTime() + (um - m) * 60_000) : new Date(start.getTime() + 30 * 60_000);
        out.push('BEGIN:VEVENT', `UID:run-${ev.key}-${i}-${p.id}@wedding-platform`, `DTSTAMP:${now}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(it.title)}`);
        if (it.place) out.push(`LOCATION:${esc(it.place)}`);
        if (it.detail) out.push(`DESCRIPTION:${esc(it.detail)}`);
        out.push('BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`In 30 minutes: ${it.title}`)}`, 'END:VALARM', 'END:VEVENT');
      });
      const roles = (await readDoc(db, p.wid, 'day-roles', ev.key)).data;
      const first = p.name.split(' ')[0]!.toLowerCase();
      const holding = roles.holds.filter((h) => h.who && [p.name.toLowerCase(), first, p.party_role.toLowerCase()].some((x) => h.who.toLowerCase().includes(x))).map((h) => h.what);
      if (holding.length && date) allDay(`hold-${p.id}`, date, `You're looking after: ${holding.join(', ')}`, `On ${couple}'s wedding day`);
    }
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//wedding-platform//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(`${couple}'s wedding: ${p.party_role}`)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H', ...out, 'END:VCALENDAR'];
    return new Response(lines.map(fold).join('\r\n') + '\r\n', { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300', 'x-robots-tag': 'noindex' } });
  });
  return app;
}
