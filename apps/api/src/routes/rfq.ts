import { dateIn, Quote, VENDOR_SEARCH } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { changeDoc, readDoc } from './planner';

/**
 * A vendor's quote request page: /api/p/:slug/rfq?k=<their key>. What the couple wants priced, line by
 * line, and only what a vendor needs to quote (first names, the date, the venue, about how many guests).
 * Their answer comes back as a quote under them in the couple's vendors, priced line by line; they can
 * change it until the couple decides. The couple send requests from Wedding planner → Vendors.
 */

type C = Context<{ Bindings: Env }>;
const first = (s: string) => s.trim().split(/\s+/)[0] ?? '';

async function requestOf(c: C, k: string) {
  if (k.length < 20 || k.length > 40) return null;
  const w = await c.env.DB.prepare(`SELECT id, name1, name2, timezone FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(c.req.param('slug') ?? '').first<{ id: string; name1: string; name2: string; timezone: string }>();
  if (!w) return null;
  const doc = await readDoc(c.env.DB, w.id, 'vendors', '');
  for (const rfq of doc.data.rfqs) {
    const rv = rfq.vendors.find((x) => x.key === k);
    if (!rv) continue;
    const vendor = doc.data.list.find((v) => v.id === rv.vendorId);
    if (vendor) return { w, rfq, rv, vendor };
  }
  return null;
}

const Answer = z
  .object({
    k: z.string().max(40),
    lines: z.array(z.object({ id: z.string().max(40), amount: z.number().min(0).max(10_000_000).nullable() })).max(40),
    deposit: z.number().min(0).max(10_000_000).default(0),
    validUntil: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(''),
    includes: z.string().max(1500).default(''),
    excludes: z.string().max(1500).default(''),
    notes: z.string().max(1500).default(''),
  })
  .strict();

export function rfqRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && !(c.req.header('content-type') ?? '').startsWith('application/json')) return c.json({ error: { code: 'json_required', message: 'Send JSON.' } }, 400);
    await next();
  });
  const ip = (c: C) => c.req.header('CF-Connecting-IP') ?? 'local';
  const gone = (c: C) => c.json({ error: { code: 'no_link', message: 'This quote link isn’t working. Please ask the couple for a new one.' } }, 404);

  app.get('/', async (c) => {
    if (!(await allow(c.env.DB, `rfq:${ip(c)}`, 120, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);
    const k = c.req.query('k') ?? '';
    const found = await requestOf(c, k);
    if (!found) return gone(c);
    const { w, rfq, rv, vendor } = found;
    const today = dateIn(w.timezone);
    if (!rv.openedOn) {
      await changeDoc(c.env.DB, w.id, 'vendors', '', (d) => {
        const x = d.rfqs.find((r) => r.id === rfq.id)?.vendors.find((v) => v.key === k);
        if (!x || x.openedOn) return false;
        x.openedOn = today;
      }).catch(() => false);
    }
    const ev = await c.env.DB.prepare(`SELECT id, name, starts_at, venue FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort LIMIT 1`).bind(w.id).first<{ id: string; name: string; starts_at: string; venue: string | null }>();
    // About how many guests: everyone invited to the first event who hasn't said no.
    const guests = ev
      ? ((
          await c.env.DB.prepare(
            `SELECT COUNT(*) AS n FROM person p JOIN invitation i ON i.id = p.invitation_id JOIN invite_event ie ON ie.invitation_id = i.id AND ie.event_id = ?1
              LEFT JOIN rsvp r ON r.invitation_id = i.id AND r.event_id = ?1
              WHERE i.wedding_id = ?2 AND i.deleted_at IS NULL AND p.deleted_at IS NULL AND COALESCE(r.attending, 1) != 0`,
          )
            .bind(ev.id, w.id)
            .first<{ n: number }>()
        )?.n ?? 0)
      : 0;
    const q = vendor.quotes.find((x) => x.id === rv.quoteId);
    return c.json({
      couple: `${first(w.name1)} & ${first(w.name2)}`,
      event: ev ? { name: ev.name, startsAt: ev.starts_at, venue: ev.venue ?? '' } : null,
      timezone: w.timezone,
      guests,
      vendor: vendor.name,
      title: rfq.title || `${VENDOR_SEARCH[rfq.service]?.label ?? 'Quote'} request`,
      lines: rfq.lines,
      due: rfq.due,
      closed: rfq.closed,
      answer: q ? { lines: q.lines, deposit: q.deposit, validUntil: q.validUntil, includes: q.includes, excludes: q.excludes, notes: q.notes, amount: q.amount, on: rv.answeredOn } : null,
    });
  });

  /** Their prices, line by line: saved as their quote (a new answer replaces their last one). */
  app.post('/', async (c) => {
    const b = Answer.safeParse(await readJson(c.req.raw));
    if (!b.success) return c.json({ error: { code: 'invalid', message: 'Please check the prices and try again.' } }, 400);
    if (!(await allow(c.env.DB, `rfq:${ip(c)}`, 120, 3_600_000)) || !(await allow(c.env.DB, `rfq-answer:${b.data.k}`, 20, 3_600_000))) {
      return c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);
    }
    const found = await requestOf(c, b.data.k);
    if (!found) return gone(c);
    const { w, rfq } = found;
    if (rfq.closed) return c.json({ error: { code: 'closed', message: 'The couple have already decided. Thank you for quoting!' } }, 409);
    const known = new Set(rfq.lines.map((l) => l.id));
    const lines = b.data.lines.filter((l) => known.has(l.id));
    const today = dateIn(w.timezone);
    let result = 'gone' as 'ok' | 'full' | 'gone'; // set inside the change below
    const saved = await changeDoc(c.env.DB, w.id, 'vendors', '', (d) => {
      const r = d.rfqs.find((x) => x.id === rfq.id);
      const rv = r?.vendors.find((x) => x.key === b.data.k);
      const v = rv ? d.list.find((x) => x.id === rv.vendorId) : undefined;
      if (!r || !rv || !v || r.closed) return false;
      const was = v.quotes.find((q) => q.id === rv.quoteId);
      if (!was && v.quotes.length >= 12) {
        result = 'full';
        return false;
      }
      const q = Quote.parse({
        ...(was ?? {}),
        id: was?.id ?? crypto.randomUUID().slice(0, 12),
        rfq: r.id,
        lines,
        amount: lines.reduce((a, l) => a + (l.amount ?? 0), 0),
        deposit: b.data.deposit,
        date: today,
        validUntil: b.data.validUntil,
        includes: b.data.includes,
        excludes: b.data.excludes,
        notes: b.data.notes,
      });
      v.quotes = was ? v.quotes.map((x) => (x.id === q.id ? q : x)) : [...v.quotes, q];
      if (v.status !== 'booked' && v.status !== 'declined') v.status = 'quoted';
      rv.quoteId = q.id;
      rv.answeredOn = today;
      result = 'ok';
    });
    if (result === 'full') return c.json({ error: { code: 'full', message: 'The couple have too many quotes from you already. Please email yours instead.' } }, 409);
    if (!saved || result !== 'ok') return c.json({ error: { code: 'busy', message: 'That didn’t save. Please try again.' } }, 409);
    return c.json({ ok: true });
  });

  return app;
}
