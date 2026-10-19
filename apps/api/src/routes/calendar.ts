import { Hono } from 'hono';
import type { Env } from '../env';

/**
 * Add to calendar: /api/p/:slug/calendar/:event.ics, a calendar file for one event (Apple Calendar,
 * Outlook, Google all open it). Only what the invitation already shows: the name, the time, the place.
 */

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Lines over 75 characters are folded, as the calendar format asks. */
const fold = (line: string) => line.match(/.{1,74}/g)!.join('\r\n ');

export function calendarRoutes() {
  const app = new Hono<{ Bindings: Env }>();
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
