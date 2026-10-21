import { dateIn, Quote, VENDOR_SEARCH } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { FILE_TYPES, storePlannerFile, tellCouple, weddingFacts } from '../lib/quoteRequests';
import { allow } from '../lib/rateLimit';
import { MAX_PLANNER_FILE, readJson } from '../lib/security';
import { changeDoc, readDoc } from './planner';

/**
 * A vendor's quote request page: /api/p/:slug/rfq?k=<their key>. What the couple wants priced, line by
 * line, and only what a vendor needs to quote (first names, the date, the venue, about how many guests).
 * The vendor prices each line, or gives one total for the lot (a package) with their own quote attached,
 * or says they can't quote. Their answer comes back as a quote under them in the couple's vendors, and the
 * couple get an email; they can change it until the couple decides. The couple send requests from Wedding
 * planner → Vendors.
 */

type C = Context<{ Bindings: Env }>;

async function requestOf(c: C, k: string) {
  if (k.length < 20 || k.length > 40) return null;
  const w = await c.env.DB.prepare(`SELECT id, timezone FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(c.req.param('slug') ?? '').first<{ id: string; timezone: string }>();
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

const money = z.number().min(0).max(10_000_000);
const Answer = z
  .object({
    k: z.string().max(40),
    lines: z.array(z.object({ id: z.string().max(40), amount: money.nullable() })).max(40),
    /** One total for everything asked (instead of line by line). */
    package: z.boolean().default(false),
    total: money.default(0),
    deposit: money.default(0),
    validUntil: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(''),
    includes: z.string().max(1500).default(''),
    excludes: z.string().max(1500).default(''),
    notes: z.string().max(1500).default(''),
    /** Their own quote, attached first (POST /file). */
    fileId: z.string().max(40).default(''),
    fileName: z.string().max(160).default(''),
  })
  .strict();

const aud = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;

export function rfqRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && !(c.req.header('content-type') ?? '').startsWith('application/json')) return c.json({ error: { code: 'json_required', message: 'Send JSON.' } }, 400);
    await next();
  });
  const ip = (c: C) => c.req.header('CF-Connecting-IP') ?? 'local';
  const gone = (c: C) => c.json({ error: { code: 'no_link', message: 'This quote link isn’t working. Please ask the couple for a new one.' } }, 404);
  const closed = (c: C) => c.json({ error: { code: 'closed', message: 'The couple have already decided. Thank you for quoting!' } }, 409);
  const slow = (c: C) => c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);

  app.get('/', async (c) => {
    if (!(await allow(c.env.DB, `rfq:${ip(c)}`, 120, 3_600_000))) return slow(c);
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
    const f = await weddingFacts(c.env.DB, w.id);
    const q = vendor.quotes.find((x) => x.id === rv.quoteId);
    return c.json({
      couple: f?.couple ?? '',
      event: f?.ev ? { name: f.ev.name, startsAt: f.ev.starts_at, venue: f.ev.venue ?? '' } : null,
      timezone: w.timezone,
      guests: f?.guests ?? 0,
      vendor: vendor.name,
      title: rfq.title || `${VENDOR_SEARCH[rfq.service]?.label ?? 'Quote'} request`,
      lines: rfq.lines,
      due: rfq.due,
      closed: rfq.closed,
      declined: rv.declinedOn ? { on: rv.declinedOn, why: rv.declinedWhy } : null,
      answer: q
        ? { lines: q.lines, package: !!q.package, deposit: q.deposit, validUntil: q.validUntil, includes: q.includes, excludes: q.excludes, notes: q.notes, amount: q.amount, fileId: q.fileId, fileName: q.fileName, on: rv.answeredOn }
        : null,
    });
  });

  /** Their own quote (a PDF or photo, up to 1.5 MB): filed with the couple's planning files, then sent with their answer. */
  app.post('/file', async (c) => {
    const body = z
      .object({ k: z.string().max(40), name: z.string().trim().min(1).max(160), type: z.enum(FILE_TYPES), data: z.string().max(Math.ceil(MAX_PLANNER_FILE * 1.4)) })
      .strict()
      .safeParse(await readJson(c.req.raw, Math.ceil(MAX_PLANNER_FILE * 1.4) + 4096));
    if (!body.success) return c.json({ error: { code: 'invalid', message: 'Choose a PDF or a photo of your quote, up to 1.5 MB.' } }, 400);
    if (!(await allow(c.env.DB, `rfq:${ip(c)}`, 120, 3_600_000)) || !(await allow(c.env.DB, `rfq-file:${body.data.k}`, 10, 3_600_000))) return slow(c);
    const found = await requestOf(c, body.data.k);
    if (!found) return gone(c);
    if (found.rfq.closed) return closed(c);
    const r = await storePlannerFile(c.env, found.w.id, { name: `${found.vendor.name} quote - ${body.data.name}`.slice(0, 160), type: body.data.type, data: body.data.data });
    if (!r.ok) return c.json({ error: { code: r.code, message: r.message } }, 400);
    return c.json({ id: r.id, name: r.name });
  });

  /** Their prices, line by line (or one total): saved as their quote (a new answer replaces their last one). */
  app.post('/', async (c) => {
    const b = Answer.safeParse(await readJson(c.req.raw));
    if (!b.success) return c.json({ error: { code: 'invalid', message: 'Please check the prices and try again.' } }, 400);
    if (!(await allow(c.env.DB, `rfq:${ip(c)}`, 120, 3_600_000)) || !(await allow(c.env.DB, `rfq-answer:${b.data.k}`, 20, 3_600_000))) return slow(c);
    const found = await requestOf(c, b.data.k);
    if (!found) return gone(c);
    const { w, rfq } = found;
    if (rfq.closed) return closed(c);
    const known = new Set(rfq.lines.map((l) => l.id));
    const lines = b.data.package ? [] : b.data.lines.filter((l) => known.has(l.id));
    const amount = b.data.package ? b.data.total : lines.reduce((a, l) => a + (l.amount ?? 0), 0);
    if (b.data.package && !amount) return c.json({ error: { code: 'invalid', message: 'Add your total price.' } }, 400);
    // The attached file must be one filed for this wedding (by this link, moments ago).
    const file = b.data.fileId ? await c.env.DB.prepare(`SELECT id, name FROM planner_file WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(b.data.fileId, w.id).first<{ id: string; name: string }>() : null;
    const today = dateIn(w.timezone);
    let result = 'gone' as 'ok' | 'full' | 'gone'; // set inside the change below
    let first = false;
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
      first = !was;
      const q = Quote.parse({
        ...(was ?? {}),
        id: was?.id ?? crypto.randomUUID().slice(0, 12),
        rfq: r.id,
        lines,
        package: b.data.package || undefined,
        amount,
        deposit: b.data.deposit,
        date: today,
        validUntil: b.data.validUntil,
        includes: b.data.includes,
        excludes: b.data.excludes,
        notes: b.data.notes,
        ...(file ? { fileId: file.id, fileName: file.name } : {}),
      });
      v.quotes = was ? v.quotes.map((x) => (x.id === q.id ? q : x)) : [...v.quotes, q];
      // Quoted now (also after saying they couldn't); not when the couple have already ruled them out.
      if (v.status !== 'booked' && (v.status !== 'declined' || rv.declinedOn)) {
        if (rv.declinedOn) v.declinedWhy = '';
        v.status = 'quoted';
      }
      rv.quoteId = q.id;
      rv.answeredOn = today;
      rv.declinedOn = '';
      rv.declinedWhy = '';
      result = 'ok';
    });
    if (result === 'full') return c.json({ error: { code: 'full', message: 'The couple have too many quotes from you already. Please email yours instead.' } }, 409);
    if (!saved || result !== 'ok') return c.json({ error: { code: 'busy', message: 'That didn’t save. Please try again.' } }, 409);
    const f = await weddingFacts(c.env.DB, w.id);
    if (f) {
      const what = rfq.title || 'your quote request';
      await tellCouple(c.env, f, `${found.vendor.name} ${first ? 'sent their quote' : 'updated their quote'}: ${aud(amount)}`, [
        `${found.vendor.name} ${first ? 'has quoted' : 'has changed their quote'} for ${what}: ${aud(amount)}${b.data.package ? ' for everything you asked' : ''}${b.data.deposit ? `, with a ${aud(b.data.deposit)} deposit` : ''}.`,
        file ? 'Their own quote is attached in your planner.' : '',
        'It’s side by side with the others, like for like.',
      ].filter(Boolean));
    }
    return c.json({ ok: true });
  });

  /** They can't quote (booked that day, not their thing): the couple are told, and stop waiting on them. */
  app.post('/decline', async (c) => {
    const b = z.object({ k: z.string().max(40), why: z.string().trim().max(200).default('') }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return c.json({ error: { code: 'invalid', message: 'Please try again.' } }, 400);
    if (!(await allow(c.env.DB, `rfq:${ip(c)}`, 120, 3_600_000)) || !(await allow(c.env.DB, `rfq-answer:${b.data.k}`, 20, 3_600_000))) return slow(c);
    const found = await requestOf(c, b.data.k);
    if (!found) return gone(c);
    const { w, rfq } = found;
    if (rfq.closed) return closed(c);
    const why = b.data.why || 'Can’t quote';
    const today = dateIn(w.timezone);
    const saved = await changeDoc(c.env.DB, w.id, 'vendors', '', (d) => {
      const r = d.rfqs.find((x) => x.id === rfq.id);
      const rv = r?.vendors.find((x) => x.key === b.data.k);
      const v = rv ? d.list.find((x) => x.id === rv.vendorId) : undefined;
      if (!r || !rv || !v || r.closed) return false;
      rv.declinedOn = today;
      rv.declinedWhy = why;
      if (v.status !== 'booked' && !v.quotes.some((q) => q.rfq !== r.id)) {
        v.status = 'declined';
        v.declinedWhy = `They said: ${why}`.slice(0, 200);
      }
    });
    if (!saved) return c.json({ error: { code: 'busy', message: 'That didn’t save. Please try again.' } }, 409);
    const f = await weddingFacts(c.env.DB, w.id);
    if (f) await tellCouple(c.env, f, `${found.vendor.name} can’t quote`, [`${found.vendor.name} said they can’t quote for ${rfq.title || 'your request'}: ${why}.`, 'Ask someone else from your quote request in the planner.']);
    return c.json({ ok: true });
  });

  return app;
}
