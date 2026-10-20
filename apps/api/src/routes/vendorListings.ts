import { Enquiry, ListingFields, ListingJoin, regionOf, REGIONS, type Listing, type ListingCard } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { hashPasscode, passcodeProblem } from '../lib/auth';
import { cellOf, kmBetween } from '../lib/directory';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { jsonWritesOnly, requireUser, signIn, type AdminEnv } from './auth';
import { slugPart } from './signup';

/**
 * The vendor directory of vendors who've signed up (/api/directory, public) and a vendor's own listing
 * (/api/a/vendor, signed in). Listing is free and goes live straight away; the platform owner can hide a
 * listing. Couples' enquiries are kept for the vendor to read when they sign in (their email isn't shown
 * publicly). Each listing is mirrored into vendor_directory so the planner's finder shows it near a venue.
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 401 | 403 | 404 | 409 | 429 | 500, code: string, message: string) => c.json({ error: { code, message } }, status);
const list = (s: string): string[] => {
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

interface Row {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  category: string;
  region: string;
  regions: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  about: string;
  price_from: number;
  photos: string;
  hidden: number;
  created_at: string;
  booked?: number;
}
const card = (r: Row): ListingCard => ({
  slug: r.slug,
  name: r.name,
  category: r.category,
  region: r.region,
  regions: list(r.regions),
  about: r.about.length > 220 ? `${r.about.slice(0, 217).trimEnd()}…` : r.about,
  priceFrom: r.price_from,
  photo: list(r.photos)[0] ?? '',
  booked: r.booked ?? 0,
});
const full = (r: Row): Listing => ({ ...card(r), about: r.about, contactName: r.contact_name, phone: r.phone, website: r.website, instagram: r.instagram.replace(/^@/, ''), photos: list(r.photos) });
const BOOKED = `(SELECT COUNT(*) FROM vendor_use u WHERE u.dir_id = 'v:' || l.id AND u.booked = 1)`;

/** Keep the listing's row in the shared directory in step (at its home region's centre). */
function mirror(db: D1Database, id: string, f: { name: string; category: string; region: string; phone: string; website: string }, hidden: boolean, now: string) {
  const r = regionOf(f.region)!;
  return db
    .prepare(
      `INSERT INTO vendor_directory (id, source, category, name, lat, lon, cell, address, phone, email, website, hidden, first_seen, updated_at)
       VALUES (?, 'listed', ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET category = excluded.category, name = excluded.name, lat = excluded.lat, lon = excluded.lon, cell = excluded.cell,
         address = excluded.address, phone = excluded.phone, website = excluded.website, hidden = excluded.hidden, updated_at = excluded.updated_at`,
    )
    .bind(`v:${id}`, f.category, f.name, r.lat, r.lon, cellOf(r.lat, r.lon), r.name, f.phone, f.website, hidden ? 1 : 0, now, now);
}

/** Listed vendors who work within `km` of a point (their home region or one they travel to), most booked first. */
export async function listedNear(db: D1Database, category: string, lat: number, lon: number, km: number): Promise<(ListingCard & { km: number; id: string; phone: string; website: string })[]> {
  const near = REGIONS.filter((r) => kmBetween(lat, lon, r.lat, r.lon) <= Math.max(km, 60)).map((r) => r.slug);
  if (!near.length) return [];
  const { results } = await db.prepare(`SELECT l.*, ${BOOKED} AS booked FROM vendor_listing l WHERE l.hidden = 0 AND l.category = ?`).bind(category).all<Row>();
  return results
    .filter((r) => near.includes(r.region) || list(r.regions).some((x) => near.includes(x)))
    .map((r) => {
      const home = regionOf(r.region)!;
      return { ...card(r), id: `v:${r.id}`, phone: r.phone, website: r.website, km: Math.round(kmBetween(lat, lon, home.lat, home.lon)) };
    })
    .sort((a, b) => b.booked - a.booked || a.km - b.km);
}

export function directoryRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly);
  const ipOf = (c: C) => c.req.header('CF-Connecting-IP') ?? 'local';

  /** Browse: by what they do, where they work, and words in their name or description. */
  app.get('/', async (c) => {
    if (!(await allow(c.env.DB, `dir:${ipOf(c)}`, 600, 3_600_000))) return err(c, 429, 'slow_down', 'Please wait a minute.');
    const category = c.req.query('category') ?? '';
    const region = c.req.query('region') ?? '';
    const q = (c.req.query('q') ?? '').trim().toLowerCase().slice(0, 60);
    const where = ['l.hidden = 0'];
    const args: string[] = [];
    if (category) {
      where.push('l.category = ?');
      args.push(category);
    }
    if (region && regionOf(region)) {
      where.push(`(l.region = ? OR l.regions LIKE ?)`);
      args.push(region, `%"${region}"%`);
    }
    if (q) {
      where.push(`(LOWER(l.name) LIKE ? OR LOWER(l.about) LIKE ?)`);
      args.push(`%${q}%`, `%${q}%`);
    }
    const { results } = await c.env.DB.prepare(`SELECT l.*, ${BOOKED} AS booked FROM vendor_listing l WHERE ${where.join(' AND ')} ORDER BY booked DESC, l.created_at DESC LIMIT 120`)
      .bind(...args)
      .all<Row>();
    return c.json({ results: results.map(card) });
  });

  /** One vendor's page (no email: couples reach them with an enquiry). */
  app.get('/v/:slug', async (c) => {
    const r = await c.env.DB.prepare(`SELECT l.*, ${BOOKED} AS booked FROM vendor_listing l WHERE l.slug = ? AND l.hidden = 0`).bind(c.req.param('slug')).first<Row>();
    if (!r) return err(c, 404, 'not_found', 'That vendor isn’t listed any more.');
    return c.json(full(r));
  });

  /** A couple asks a vendor about their wedding: kept for the vendor to read when they sign in. */
  app.post('/v/:slug/enquire', async (c) => {
    if (!(await allow(c.env.DB, `enquire:${ipOf(c)}`, 12, 3_600_000))) return err(c, 429, 'slow_down', 'That’s a lot of enquiries. Try again in an hour.');
    const b = Enquiry.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check the form.');
    if (b.data.company) return c.json({ ok: true }); // a bot
    const l = await c.env.DB.prepare(`SELECT id FROM vendor_listing WHERE slug = ? AND hidden = 0`).bind(c.req.param('slug')).first<{ id: string }>();
    if (!l) return err(c, 404, 'not_found', 'That vendor isn’t listed any more.');
    const e = b.data;
    await c.env.DB.prepare(`INSERT INTO vendor_enquiry (id, listing_id, name, email, phone, date, guests, message, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
      .bind(crypto.randomUUID(), l.id, e.name, e.email, e.phone, e.date, e.guests, e.message, new Date().toISOString())
      .run();
    return c.json({ ok: true });
  });

  /** A vendor joins: their account and their listing in one go, then signed in. */
  app.post('/join', async (c) => {
    if (!c.env.SESSION_SECRET) return err(c, 500, 'not_configured', 'Sign-up is not set up yet.');
    if (!(await allow(c.env.DB, `vjoin:${ipOf(c)}`, 5, 3_600_000))) return err(c, 429, 'slow_down', 'Too many sign-ups from here. Try again in an hour.');
    const b = ListingJoin.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check the form.');
    const f = b.data;
    if (f.company) return c.json({ ok: true }); // a bot
    const weak = passcodeProblem(f.passcode);
    if (weak) return err(c, 400, 'weak_passcode', weak);
    const db = c.env.DB;
    if (await db.prepare(`SELECT 1 FROM user WHERE email = ?`).bind(f.email).first()) return err(c, 409, 'exists', 'There is already an account with that email. Sign in instead.');
    const base = slugPart(f.name);
    const { results: taken } = await db.prepare(`SELECT slug FROM vendor_listing WHERE slug = ? OR slug LIKE ?`).bind(base, `${base}-%`).all<{ slug: string }>();
    const used = new Set(taken.map((r) => r.slug));
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const id = crypto.randomUUID();
    const regions = [...new Set(f.regions.filter((r) => r !== f.region))];
    try {
      await db.batch([
        db.prepare(`INSERT INTO user (id, email, name, pass_hash, first_name, marketing_opt_in, marketing_opt_in_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`).bind(
          userId, f.email, f.contactName || f.name, await hashPasscode(f.passcode), f.contactName.split(' ')[0] ?? '', now, now, now,
        ),
        db.prepare(
          `INSERT INTO vendor_listing (id, user_id, slug, name, category, region, regions, contact_name, email, phone, website, instagram, about, price_from, photos, hidden, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        ).bind(id, userId, slug, f.name, f.category, f.region, JSON.stringify(regions), f.contactName, f.email, f.phone, f.website, f.instagram.replace(/^@/, ''), f.about, f.priceFrom, JSON.stringify(f.photos), now, now),
        mirror(db, id, f, false, now),
      ]);
    } catch {
      return err(c, 409, 'exists', 'There is already an account with that email. Sign in instead.');
    }
    await signIn(c, { id: userId, email: f.email });
    return c.json({ slug });
  });

  return app;
}

/** A vendor's own listing and enquiries, signed in. */
export function vendorAccountRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly);
  app.use('*', requireUser);
  const mine = (c: C) => c.env.DB.prepare(`SELECT l.*, ${BOOKED} AS booked FROM vendor_listing l WHERE l.user_id = ?`).bind(c.get('user').id).first<Row>();

  app.get('/', async (c) => {
    const r = await mine(c);
    if (!r) return err(c, 404, 'no_listing', 'This account has no vendor listing.');
    const { results } = await c.env.DB.prepare(`SELECT id, name, email, phone, date, guests, message, read, created_at FROM vendor_enquiry WHERE listing_id = ? ORDER BY created_at DESC LIMIT 200`)
      .bind(r.id)
      .all<{ id: string; name: string; email: string; phone: string; date: string; guests: number; message: string; read: number; created_at: string }>();
    return c.json({
      listing: { ...full(r), email: r.email, hidden: !!r.hidden },
      enquiries: results.map((e) => ({ id: e.id, name: e.name, email: e.email, phone: e.phone, date: e.date, guests: e.guests, message: e.message, read: !!e.read, at: e.created_at })),
    });
  });

  app.put('/', async (c) => {
    const r = await mine(c);
    if (!r) return err(c, 404, 'no_listing', 'This account has no vendor listing.');
    const b = ListingFields.strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check the form.');
    const f = b.data;
    const now = new Date().toISOString();
    const regions = [...new Set(f.regions.filter((x) => x !== f.region))];
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE vendor_listing SET name = ?, category = ?, region = ?, regions = ?, contact_name = ?, phone = ?, website = ?, instagram = ?, about = ?, price_from = ?, photos = ?, updated_at = ? WHERE id = ?`,
      ).bind(f.name, f.category, f.region, JSON.stringify(regions), f.contactName, f.phone, f.website, f.instagram.replace(/^@/, ''), f.about, f.priceFrom, JSON.stringify(f.photos), now, r.id),
      mirror(c.env.DB, r.id, f, !!r.hidden, now),
    ]);
    return c.json({ ok: true, slug: r.slug });
  });

  app.post('/enquiries/:id/read', async (c) => {
    const r = await mine(c);
    if (!r) return err(c, 404, 'no_listing', 'This account has no vendor listing.');
    await c.env.DB.prepare(`UPDATE vendor_enquiry SET read = 1 WHERE id = ? AND listing_id = ?`).bind(c.req.param('id'), r.id).run();
    return c.json({ ok: true });
  });

  /** The platform owner hides (or shows again) a listing. */
  app.put('/super/hidden', async (c) => {
    if (!c.get('user').superAdmin) return err(c, 403, 'forbidden', 'Not allowed.');
    const b = (await readJson(c.req.raw)) as { slug?: unknown; hidden?: unknown } | null;
    if (typeof b?.slug !== 'string' || typeof b.hidden !== 'boolean') return err(c, 400, 'invalid', 'Send { slug, hidden }.');
    const l = await c.env.DB.prepare(`SELECT id FROM vendor_listing WHERE slug = ?`).bind(b.slug).first<{ id: string }>();
    if (!l) return err(c, 404, 'not_found', 'No such listing.');
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE vendor_listing SET hidden = ? WHERE id = ?`).bind(b.hidden ? 1 : 0, l.id),
      c.env.DB.prepare(`UPDATE vendor_directory SET hidden = ? WHERE id = ?`).bind(b.hidden ? 1 : 0, `v:${l.id}`),
    ]);
    return c.json({ ok: true });
  });
  return app;
}
