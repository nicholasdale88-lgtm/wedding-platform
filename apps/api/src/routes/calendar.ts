import { isToken } from '@wp/shared';
import { Hono } from 'hono';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';

/**
 * Add to calendar: /api/p/:slug/calendar/:event.ics, a calendar file for one event (Apple Calendar,
 * Outlook, Google all open it). Only what the invitation already shows: the name, the time, the place.
 *
 * A guest's own calendar: /api/p/:slug/calendar/mine.ics?g=<their link>, every event they're invited to,
 * to subscribe to on their phone (iPhone, Android via Google Calendar, Outlook): a change of time or place
 * reaches their calendar by itself, with a reminder the day before and two hours before.
 */

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n'); // a lone CR too: some calendar apps read it as a new line
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Lines over 75 characters are folded, as the calendar format asks. */
const fold = (line: string) => line.match(/.{1,74}/g)!.join('\r\n ');

export function calendarRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/mine.ics', async (c) => {
    const token = c.req.query('g') ?? '';
    const none = () => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    if (!isToken(token)) return none();
    if (!(await allow(c.env.DB, `cal-mine:${c.req.header('CF-Connecting-IP') ?? 'local'}`, 240, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);
    const inv = await c.env.DB.prepare(
      `SELECT i.id, w.id AS wid, w.slug, w.name1, w.name2 FROM invitation i JOIN wedding w ON w.id = i.wedding_id
        WHERE i.token = ? AND w.slug = ? AND i.deleted_at IS NULL AND w.deleted_at IS NULL`,
    )
      .bind(token, c.req.param('slug'))
      .first<{ id: string; wid: string; slug: string; name1: string; name2: string }>();
    if (!inv) return none();
    // Their events (not ones they've said no to).
    const { results } = await c.env.DB.prepare(
      `SELECT e.key, e.name, e.starts_at, e.venue, e.address FROM event e JOIN invite_event ie ON ie.event_id = e.id AND ie.invitation_id = ?1
         LEFT JOIN rsvp r ON r.invitation_id = ?1 AND r.event_id = e.id
        WHERE e.wedding_id = ?2 AND e.deleted_at IS NULL AND COALESCE(r.attending, 1) != 0 ORDER BY e.starts_at`,
    )
      .bind(inv.id, inv.wid)
      .all<{ key: string; name: string; starts_at: string; venue: string | null; address: string | null }>();
    const couple = `${inv.name1.split(' ')[0]} & ${inv.name2.split(' ')[0]}`;
    const base = c.env.PUBLIC_BASE_URL.replace(/\/$/, '');
    const mine = `${base}/w/${inv.slug}?g=${token}`;
    const events = results.flatMap((e) => {
      const start = new Date(e.starts_at);
      if (Number.isNaN(start.getTime())) return [];
      const where = [e.venue, e.address].filter(Boolean).join(', ');
      return [
        'BEGIN:VEVENT',
        `UID:${inv.slug}-${e.key}@wedding-platform`,
        `DTSTAMP:${stamp(new Date())}`,
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(new Date(start.getTime() + 6 * 3_600_000))}`,
        `SUMMARY:${esc(`${couple}: ${e.name}`)}`,
        ...(where ? [`LOCATION:${esc(where)}`] : []),
        `DESCRIPTION:${esc(`Your invitation, the details and your RSVP: ${mine}`)}`,
        `URL:${mine}`,
        'BEGIN:VALARM',
        'TRIGGER:-P1D',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(`Tomorrow: ${e.name}`)}`,
        'END:VALARM',
        'BEGIN:VALARM',
        'TRIGGER:-PT2H',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(`In two hours: ${e.name}`)}`,
        'END:VALARM',
        'END:VEVENT',
      ];
    });
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//wedding-platform//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(`${couple}'s wedding`)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H', ...events, 'END:VCALENDAR'];
    return new Response(lines.map(fold).join('\r\n') + '\r\n', {
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300', 'x-robots-tag': 'noindex' },
    });
  });

  app.get('/:file', async (c) => {
    const key = c.req.param('file').replace(/\.ics$/, '');
    const row = await c.env.DB.prepare(
      `SELECT e.key, e.name, e.starts_at, e.venue, e.address, w.name1, w.name2, w.slug
         FROM event e JOIN wedding w ON w.id = e.wedding_id
        WHERE w.slug = ? AND w.deleted_at IS NULL AND e.key = ? AND e.deleted_at IS NULL`,
    )
      .bind(c.req.param('slug'), key)
      .first<{ key: string; name: string; starts_at: string; venue: string | null; address: string | null; name1: string; name2: string; slug: string }>();
    if (!row) return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    const start = new Date(row.starts_at);
    if (Number.isNaN(start.getTime())) return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    const end = new Date(start.getTime() + 6 * 3_600_000); // a sensible length; the invitation has the details
    const couple = `${row.name1.split(' ')[0]} & ${row.name2.split(' ')[0]}`;
    const base = c.env.PUBLIC_BASE_URL.replace(/\/$/, '');
    const where = [row.venue, row.address].filter(Boolean).join(', ');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//wedding-platform//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${row.slug}-${row.key}@wedding-platform`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(`${couple}: ${row.name}`)}`,
      ...(where ? [`LOCATION:${esc(where)}`] : []),
      `DESCRIPTION:${esc(`Details, timeline and your RSVP: ${base}/w/${row.slug}`)}`,
      `URL:${base}/w/${row.slug}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`Tomorrow: ${row.name}`)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    return new Response(lines.map(fold).join('\r\n') + '\r\n', {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': `attachment; filename="${row.slug}-${row.key}.ics"`,
        'cache-control': 'public, max-age=300',
      },
    });
  });
  return app;
}
