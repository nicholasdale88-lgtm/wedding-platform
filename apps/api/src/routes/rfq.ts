import { beforeOf, dateIn, Quote, safeLink, VENDOR_SEARCH } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Env } from '../env';
import { SESSION_COOKIE, sessionId } from '../lib/auth';
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
 *
 * With their quote, a vendor can add virtual samples (photos, a spin view, short videos, what's in their sample
 * box), video tasting times the couple can book, and their own payment or booking page (the couple get a "Pay or
 * book with …" button: we never handle the money). Signed in to a free vendor account, they can save the wedding
 * to their dashboard (POST /save), where all their quotes live.
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
    /** Their own payment or booking page ('' for none). */
    payLink: z.string().max(500).default(''),
    samples: Samples.default({ photos: [], spin: [], videos: [], box: '' }),
    tastings: z.array(Slot).max(12).default([]),
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
const Samples = z
  .object({
    photos: z.array(z.string().max(40)).max(12).default([]),
    spin: z.array(z.string().max(40)).max(24).default([]),
    videos: z.array(z.object({ url: z.string().max(500), label: z.string().trim().max(80).default('') })).max(6).default([]),
    box: z.string().trim().max(1000).default(''),
  })
  .strict();
const Slot = z.object({ id: z.string().max(40).default(''), at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), mins: z.number().int().min(10).max(180).default(30), link: z.string().max(500).default('') }).strict();
/** Sample photos: small (made smaller on their phone first), and only real images. */
const MAX_SAMPLE = 450_000;
const SAMPLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_SAMPLES_PER_LINK = 48;

/** The vendor account signed in on this browser (their listing), if any: to save a wedding to their dashboard. */
async function signedInListing(c: C) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !c.env.SESSION_SECRET) return null;
  return c.env.DB.prepare(`SELECT l.id, l.name FROM session s JOIN vendor_listing l ON l.user_id = s.user_id WHERE s.id = ? AND s.expires_at > ?`)
    .bind(await sessionId(token, c.env.SESSION_SECRET), new Date().toISOString())
    .first<{ id: string; name: string }>();
}

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
    const listing = await signedInListing(c);
    const saved = listing ? !!(await c.env.DB.prepare(`SELECT 1 FROM vendor_couple WHERE listing_id = ? AND wedding_id = ? AND status = 'active'`).bind(listing.id, w.id).first()) : false;
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
        ? {
            lines: q.lines,
            package: !!q.package,
            deposit: q.deposit,
            validUntil: q.validUntil,
            includes: q.includes,
            excludes: q.excludes,
            notes: q.notes,
            amount: q.amount,
            fileId: q.fileId,
            fileName: q.fileName,
            on: rv.answeredOn,
            payLink: q.payLink ?? '',
            samples: q.samples ?? { photos: [], spin: [], videos: [], box: '' },
            tastings: q.tastings ?? [],
          }
        : null,
      // Signed in to a vendor account here: whether this wedding is already on their dashboard.
      account: listing ? { name: listing.name, saved } : null,
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

  /** A sample photo (or a frame of a spin view), up to about 450 KB: kept with this link, used in their answer. */
  app.post('/media', async (c) => {
    const body = z
      .object({ k: z.string().max(40), type: z.enum(SAMPLE_TYPES), data: z.string().max(Math.ceil(MAX_SAMPLE * 1.4)) })
      .strict()
      .safeParse(await readJson(c.req.raw, Math.ceil(MAX_SAMPLE * 1.4) + 1024));
    if (!body.success) return c.json({ error: { code: 'invalid', message: 'Choose a photo (JPEG, PNG or WebP).' } }, 400);
    if (!(await allow(c.env.DB, `rfq:${ip(c)}`, 120, 3_600_000)) || !(await allow(c.env.DB, `rfq-media:${body.data.k}`, 60, 3_600_000))) return slow(c);
    const found = await requestOf(c, body.data.k);
    if (!found) return gone(c);
    if (found.rfq.closed) return closed(c);
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(body.data.data), (ch) => ch.charCodeAt(0));
    } catch {
      return c.json({ error: { code: 'invalid', message: 'That photo could not be read.' } }, 400);
    }
    if (bytes.byteLength > MAX_SAMPLE) return c.json({ error: { code: 'too_large', message: 'That photo is too big. Try a smaller one.' } }, 400);
    const head = String.fromCharCode(...bytes.slice(0, 12));
    const t = body.data.type;
    const real = t === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 : t === 'image/png' ? bytes[0] === 0x89 && head.slice(1, 4) === 'PNG' : head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP';
    if (!real) return c.json({ error: { code: 'invalid', message: 'That isn’t the photo it says it is.' } }, 400);
    const n = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM quote_media WHERE wedding_id = ? AND rfq_key = ? AND deleted_at IS NULL`).bind(found.w.id, body.data.k).first<{ n: number }>();
    if ((n?.n ?? 0) >= MAX_SAMPLES_PER_LINK) return c.json({ error: { code: 'full', message: 'That’s as many sample photos as one quote can hold.' } }, 409);
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO quote_media (id, wedding_id, rfq_key, type, bytes, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, found.w.id, body.data.k, t, bytes.byteLength, bytes, new Date().toISOString())
      .run();
    return c.json({ id });
  });

  /** A sample photo, for the vendor's page and the couple's planner (its id can't be guessed). */
  app.get('/media/:id', async (c) => {
    if (!(await allow(c.env.DB, `rfq-img:${ip(c)}`, 1200, 3_600_000))) return slow(c);
    const row = await c.env.DB.prepare(
      `SELECT m.type, m.data FROM quote_media m JOIN wedding w ON w.id = m.wedding_id AND w.slug = ? AND w.deleted_at IS NULL WHERE m.id = ? AND m.deleted_at IS NULL`,
    )
      .bind(c.req.param('slug') ?? '', c.req.param('id'))
      .first<{ type: string; data: ArrayBuffer | number[] }>();
    if (!row) return c.json({ error: { code: 'not_found', message: 'That photo isn’t here.' } }, 404);
    const data = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data).buffer;
    return new Response(data, { headers: { 'content-type': row.type, 'cache-control': 'private, max-age=86400, immutable', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex' } });
  });

  /**
   * Save this wedding to the signed-in vendor's dashboard: linked to their account (their couples and the Quotes
   * area show it, with this request), and the couple's entry for them points at their listing.
   */
  app.post('/save', async (c) => {
    const b = z.object({ k: z.string().max(40) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return c.json({ error: { code: 'invalid', message: 'Please try again.' } }, 400);
    if (!(await allow(c.env.DB, `rfq:${ip(c)}`, 120, 3_600_000))) return slow(c);
    const found = await requestOf(c, b.data.k);
    if (!found) return gone(c);
    const listing = await signedInListing(c);
    if (!listing) return c.json({ error: { code: 'signed_out', message: 'Sign in to your vendor account first.' } }, 401);
    const db = c.env.DB;
    await db.prepare(`INSERT OR IGNORE INTO vendor_couple (listing_id, wedding_id, source, status, created_at) VALUES (?, ?, 'quote', 'active', ?)`).bind(listing.id, found.w.id, new Date().toISOString()).run();
    const link = await db.prepare(`SELECT status FROM vendor_couple WHERE listing_id = ? AND wedding_id = ?`).bind(listing.id, found.w.id).first<{ status: string }>();
    if (link?.status !== 'active') return c.json({ error: { code: 'ended', message: 'The couple ended the link with your account.' } }, 403);
    // The couple's entry for this vendor now points at their listing (their quotes and day pass reach the portal).
    await changeDoc(db, found.w.id, 'vendors', '', (d) => {
      const v = d.list.find((x) => x.id === found.vendor.id);
      if (!v || v.dirId) return false;
      v.dirId = `v:${listing.id}`;
    }).catch(() => false);
    return c.json({ ok: true });
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
    // Their payment or booking page, videos and tasting call links: real web addresses only, opened over https.
    const payLink = safeLink(b.data.payLink);
    if (b.data.payLink.trim() && !payLink) return c.json({ error: { code: 'invalid', message: 'Your payment or booking link doesn’t look like a web address.' } }, 400);
    // Sample photos must be ones added through this link.
    const asked = [...new Set([...b.data.samples.photos, ...b.data.samples.spin])];
    const mine = new Set<string>();
    if (asked.length) {
      const { results } = await c.env.DB.prepare(`SELECT id FROM quote_media WHERE wedding_id = ? AND rfq_key = ? AND deleted_at IS NULL AND id IN (${asked.map(() => '?').join(',')})`)
        .bind(w.id, b.data.k, ...asked)
        .all<{ id: string }>();
      for (const r of results) mine.add(r.id);
    }
    const samples = {
      photos: b.data.samples.photos.filter((x) => mine.has(x)),
      spin: b.data.samples.spin.filter((x) => mine.has(x)),
      videos: b.data.samples.videos.map((x) => ({ url: safeLink(x.url), label: x.label })).filter((x) => x.url),
      box: b.data.samples.box,
    };
    const hasSamples = !!(samples.photos.length || samples.spin.length || samples.videos.length || samples.box);
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
        // Their first price, kept when they change it (after the couple asked for a better one).
        before: beforeOf(was, amount),
        deposit: b.data.deposit,
        date: today,
        validUntil: b.data.validUntil,
        includes: b.data.includes,
        excludes: b.data.excludes,
        notes: b.data.notes,
        ...(file ? { fileId: file.id, fileName: file.name } : {}),
        payLink: payLink || undefined,
        samples: hasSamples ? samples : undefined,
        // Their times; one the couple already booked stays booked.
        tastings: b.data.tastings.length
          ? b.data.tastings.map((t) => {
              const before = was?.tastings?.find((x) => !!t.id && x.id === t.id);
              return { id: t.id || crypto.randomUUID().slice(0, 12), at: t.at, mins: t.mins, link: safeLink(t.link), bookedOn: before?.bookedOn ?? '' };
            })
          : undefined,
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
        hasSamples ? 'They’ve added samples to look through.' : '',
        b.data.tastings.length ? `They offer ${b.data.tastings.length === 1 ? 'a video tasting time' : `${b.data.tastings.length} video tasting times`} you can book.` : '',
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
