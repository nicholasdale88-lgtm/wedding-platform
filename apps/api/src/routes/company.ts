import { chargeCents, dateIn, FeedbackIn, FeedbackUpdate, PLAN_INFO, planOf, Promo, Promos, SiteSettings, type PROMO_FOR } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { buttonEmail, sendEmail } from '../lib/email';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { mainAccountOf } from './accounts';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';
import { applyPurchase } from './billing';
import { PLANS } from './signup';

/**
 * The company portal (/api/a/company): for the platform owner (super admins: SUPER_ADMINS) only.
 * - stats: sign-ups by week, plans, money taken, plan requests waiting, guests and replies, the vendor
 *   directory, quote requests, where sign-ups came from (referrals and campaigns), marketing opt-ins;
 * - weddings: find one, see its plan and size, set its plan; a plan request's two steps: email the payment
 *   link (Settings → Payment links), then mark it paid (switched on and counted, like a card payment);
 * - feedback: what couples told us (Help → Tell us), new → planned → done (or not now), with a note;
 * - the directory's vendor listings: hide or show;
 * - settings: social links, the front-page banner, the "Made with" link on guest pages;
 * - promo codes: made here, used when couples pay (billing.ts), counted from payments;
 * - the marketing list: who said yes to news, as a CSV.
 * Public (/api/site): the settings the front page and guest pages show.
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 403 | 404 | 429, code: string, message: string) => c.json({ error: { code, message } }, status);

/** A setting's JSON (the schema's defaults when it isn't set). */
export async function readSetting<S extends z.ZodTypeAny>(db: D1Database, key: 'site' | 'promos', schema: S): Promise<z.output<S>> {
  const row = await db.prepare(`SELECT value FROM platform_setting WHERE key = ?`).bind(key).first<{ value: string }>();
  let raw: unknown = {};
  try {
    raw = row ? JSON.parse(row.value) : {};
  } catch {
    raw = {};
  }
  const p = schema.safeParse(raw);
  return (p.success ? p.data : schema.parse({})) as z.output<S>;
}
const writeSetting = (db: D1Database, key: string, value: unknown) =>
  db.prepare(`INSERT INTO platform_setting (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = ?3`).bind(key, JSON.stringify(value), new Date().toISOString()).run();

/** How many paid purchases used each promo code. */
export async function promoUses(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db
    .prepare(`SELECT json_extract(detail, '$.promo') AS code, COUNT(*) AS n FROM audit WHERE action = 'plan.paid' AND json_valid(detail) AND json_extract(detail, '$.promo') IS NOT NULL GROUP BY code`)
    .all<{ code: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.code, r.n]));
}

/** A promo code by name (on or off), and how often it's been used. */
export async function findPromo(db: D1Database, code: string): Promise<{ promo: Promo | undefined; used: number }> {
  const c = code.trim().toUpperCase();
  const all = await readSetting(db, 'promos', Promos);
  const promo = all.codes.find((p) => p.code === c);
  return { promo, used: promo ? ((await promoUses(db))[c] ?? 0) : 0 };
}
export type PromoFor = (typeof PROMO_FOR)[number];

export function companyRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, async (c, next) => {
    if (!c.get('user').superAdmin) return err(c, 403, 'forbidden', 'This is for the company only.');
    await next();
  });

  app.get('/stats', async (c) => {
    const db = c.env.DB;
    const now = new Date();
    const weeksBack = 12;
    const since = new Date(now.getTime() - weeksBack * 7 * 86_400_000).toISOString();
    const one = async (sql: string, ...b: unknown[]) => (await db.prepare(sql).bind(...b).first<{ n: number }>())?.n ?? 0;
    const [weddings, last7, last30, guests, replies, listings, enquiries, optIns] = await Promise.all([
      one(`SELECT COUNT(*) AS n FROM wedding WHERE deleted_at IS NULL`),
      one(`SELECT COUNT(*) AS n FROM wedding WHERE deleted_at IS NULL AND created_at >= ?`, new Date(now.getTime() - 7 * 86_400_000).toISOString()),
      one(`SELECT COUNT(*) AS n FROM wedding WHERE deleted_at IS NULL AND created_at >= ?`, new Date(now.getTime() - 30 * 86_400_000).toISOString()),
      one(`SELECT COUNT(*) AS n FROM person p JOIN invitation i ON i.id = p.invitation_id JOIN wedding w ON w.id = i.wedding_id WHERE p.deleted_at IS NULL AND i.deleted_at IS NULL AND w.deleted_at IS NULL`),
      one(`SELECT COUNT(*) AS n FROM rsvp r JOIN invitation i ON i.id = r.invitation_id WHERE i.deleted_at IS NULL`),
      one(`SELECT COUNT(*) AS n FROM vendor_listing WHERE hidden = 0`),
      one(`SELECT COUNT(*) AS n FROM vendor_enquiry`),
      one(`SELECT COUNT(*) AS n FROM user WHERE marketing_opt_in = 1`),
    ]);
    const { results: plans } = await db.prepare(`SELECT plan, COUNT(*) AS n FROM wedding WHERE deleted_at IS NULL GROUP BY plan`).all<{ plan: string; n: number }>();
    const { results: recent } = await db.prepare(`SELECT created_at FROM wedding WHERE deleted_at IS NULL AND created_at >= ?`).bind(since).all<{ created_at: string }>();
    // Sign-ups per week, oldest first (the last is this week so far).
    const weekly = Array.from({ length: weeksBack }, (_, i) => {
      const end = now.getTime() - (weeksBack - 1 - i) * 7 * 86_400_000;
      const start = end - 7 * 86_400_000;
      return { weekOf: new Date(start).toISOString().slice(0, 10), n: recent.filter((r) => Date.parse(r.created_at) > start && Date.parse(r.created_at) <= end).length };
    });
    const { results: paid } = await db
      .prepare(`SELECT detail, at FROM audit WHERE action = 'plan.paid' AND json_valid(detail)`)
      .all<{ detail: string; at: string }>();
    const cents = (d: string) => {
      try {
        const j = JSON.parse(d) as { amount?: number | null };
        return typeof j.amount === 'number' ? j.amount : 0;
      } catch {
        return 0;
      }
    };
    const monthStart = `${now.toISOString().slice(0, 7)}-01`;
    const revenue = { total: paid.reduce((a, p) => a + cents(p.detail), 0), thisMonth: paid.filter((p) => p.at >= monthStart).reduce((a, p) => a + cents(p.detail), 0), payments: paid.length };
    const requests = await one(`SELECT COUNT(*) AS n FROM wedding WHERE deleted_at IS NULL AND json_valid(content) AND json_extract(content, '$.planRequested') IS NOT NULL`);
    const { results: refs } = await db
      .prepare(
        `SELECT json_extract(content, '$.ref') AS ref, COUNT(*) AS n, SUM(CASE WHEN plan != 'free' THEN 1 ELSE 0 END) AS paid
           FROM wedding WHERE deleted_at IS NULL AND json_valid(content) AND COALESCE(json_extract(content, '$.ref'), '') != ''
          GROUP BY ref ORDER BY n DESC LIMIT 20`,
      )
      .all<{ ref: string; n: number; paid: number }>();
    const quoteRequests = await one(`SELECT COALESCE(SUM(json_array_length(data, '$.rfqs')), 0) AS n FROM planner_doc WHERE kind = 'vendors' AND scope = '' AND json_valid(data)`);
    return c.json({
      weddings,
      signups: { last7, last30, weekly },
      plans: Object.fromEntries(plans.map((p) => [p.plan, p.n])),
      revenue,
      requests,
      guests,
      replies,
      directory: { listings, enquiries },
      quoteRequests,
      referrals: refs,
      optIns,
    });
  });

  /** Weddings, newest first: search by names, address or the owner's email; ?requests=1 for plan requests only. */
  app.get('/weddings', async (c) => {
    const q = `%${(c.req.query('q') ?? '').trim().toLowerCase().replace(/[%_]/g, '')}%`;
    const onlyRequests = c.req.query('requests') === '1';
    const { results } = await c.env.DB.prepare(
      `SELECT w.id, w.slug, w.name1, w.name2, w.plan, w.created_at,
              COALESCE(json_extract(w.content, '$.planRequested'), '') AS requested,
              COALESCE(json_extract(w.content, '$.planRequestedAt'), '') AS requested_at,
              COALESCE(json_extract(w.content, '$.planLinkSentAt'), '') AS link_sent_at,
              (SELECT COALESCE(SUM(json_extract(a.detail, '$.amount')), 0) FROM audit a WHERE a.wedding_id = w.id AND a.action = 'plan.paid' AND json_valid(a.detail)) AS paid_cents,
              COALESCE(json_extract(w.content, '$.extraEvents'), 0) AS extra_events,
              COALESCE(json_extract(w.content, '$.ref'), '') AS ref,
              (SELECT MIN(e.starts_at) FROM event e WHERE e.wedding_id = w.id AND e.deleted_at IS NULL) AS day,
              (SELECT COUNT(*) FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.wedding_id = w.id AND p.deleted_at IS NULL AND i.deleted_at IS NULL) AS guests,
              (SELECT u.email FROM membership m JOIN user u ON u.id = m.user_id WHERE m.wedding_id = w.id AND m.role = 'owner' ORDER BY u.created_at LIMIT 1) AS email
         FROM wedding w
        WHERE w.deleted_at IS NULL AND json_valid(w.content)
          AND (?1 = '%%' OR lower(w.name1 || ' ' || w.name2 || ' ' || w.slug) LIKE ?1
               OR EXISTS (SELECT 1 FROM membership m JOIN user u ON u.id = m.user_id WHERE m.wedding_id = w.id AND lower(u.email) LIKE ?1))
          AND (?2 = 0 OR json_extract(w.content, '$.planRequested') IS NOT NULL)
        ORDER BY (json_extract(w.content, '$.planRequested') IS NOT NULL) DESC, w.created_at DESC
        LIMIT 100`,
    )
      .bind(q, onlyRequests ? 1 : 0)
      .all<{ id: string; slug: string; name1: string; name2: string; plan: string; created_at: string; requested: string; requested_at: string; link_sent_at: string; paid_cents: number; extra_events: number; ref: string; day: string | null; guests: number; email: string | null }>();
    return c.json({
      weddings: results.map((r) => ({ id: r.id, slug: r.slug, names: `${r.name1} & ${r.name2}`, plan: r.plan, createdAt: r.created_at, requested: r.requested, requestedAt: r.requested_at, linkSentAt: r.link_sent_at, paidCents: r.paid_cents, extraEvents: r.extra_events, ref: r.ref, day: r.day ?? '', guests: r.guests, email: r.email ?? '' })),
    });
  });

  /** Set a wedding's plan (and extra events), by its address: clears its request. */
  app.put('/weddings/:slug/plan', async (c) => {
    const b = z.object({ plan: z.enum(PLANS).optional(), extraEvents: z.number().int().min(0).max(20).optional() }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success || (b.data.plan === undefined && b.data.extraEvents === undefined)) return err(c, 400, 'invalid', 'A plan (or extra events), please.');
    const r = await c.env.DB.prepare(
      `UPDATE wedding SET plan = COALESCE(?1, plan),
              content = json_remove(CASE WHEN ?2 IS NULL THEN content ELSE json_set(content, '$.extraEvents', ?2) END, '$.planRequested', '$.planRequestedAt', '$.planLinkSentAt'),
              updated_at = ?3
        WHERE slug = ?4 AND deleted_at IS NULL AND json_valid(content)`,
    )
      .bind(b.data.plan ?? null, b.data.extraEvents ?? null, new Date().toISOString(), c.req.param('slug'))
      .run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'No wedding at that address.');
    await c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) SELECT ?, id, ?, 'company.plan', slug, ?, ? FROM wedding WHERE slug = ?`)
      .bind(crypto.randomUUID(), c.get('user').id, JSON.stringify(b.data), new Date().toISOString(), c.req.param('slug'))
      .run();
    return c.json({ ok: true });
  });

  /** A plan request, step 1: email the couple's main account the payment link for what they asked for. */
  app.post('/weddings/:slug/send-link', async (c) => {
    const w = await c.env.DB.prepare(`SELECT id, name1, name2, plan, COALESCE(json_extract(content, '$.planRequested'), '') AS requested FROM wedding WHERE slug = ? AND deleted_at IS NULL AND json_valid(content)`)
      .bind(c.req.param('slug'))
      .first<{ id: string; name1: string; name2: string; plan: string; requested: string }>();
    if (!w) return err(c, 404, 'not_found', 'No wedding at that address.');
    if (!w.requested) return err(c, 400, 'no_request', 'They haven’t asked for a plan.');
    const what = w.requested as 'essentials' | 'complete' | 'event';
    const site = await readSetting(c.env.DB, 'site', SiteSettings);
    const link = site.paymentLinks[what];
    if (!link) return err(c, 400, 'no_link', 'Add your payment links first (Settings → Payment links).');
    const main = await mainAccountOf(c.env.DB, w.id);
    const to = main ? await c.env.DB.prepare(`SELECT email, first_name FROM user WHERE id = ?`).bind(main).first<{ email: string; first_name: string | null }>() : null;
    if (!to) return err(c, 404, 'not_found', 'That wedding has no account to email.');
    const name = what === 'event' ? 'an extra event' : PLAN_INFO[what].name;
    const cents = chargeCents(planOf(w.plan), what);
    const m = buttonEmail({
      heading: `Your ${what === 'event' ? 'extra event' : name} payment link`,
      lines: [`Hi ${to.first_name || w.name1},`, `Thanks for asking for ${name}${cents ? ` ($${(cents / 100).toFixed(0)} AUD, once)` : ''}. Pay with the button below and we’ll switch it on for ${w.name1} & ${w.name2}, usually within a day.`],
      button: 'Pay now',
      link,
      footer: 'Questions? Just reply to this email.',
    });
    const emailed = await sendEmail(c.env, { to: to.email, subject: `Your payment link: ${name}`, ...m, ...(site.supportEmail ? { replyTo: [site.supportEmail] } : {}) });
    await c.env.DB.prepare(`UPDATE wedding SET content = json_set(content, '$.planLinkSentAt', ?) WHERE id = ? AND json_valid(content)`).bind(new Date().toISOString(), w.id).run();
    // Not emailed (email isn't set up, or it failed): the portal shows the link and address to send by hand.
    return c.json({ ok: true, emailed, email: to.email, link, cents: cents ?? 0 });
  });

  /** A plan request, step 2: they paid (by the link, a transfer, cash): switch it on and count the money. */
  app.post('/weddings/:slug/paid', async (c) => {
    const b = z.object({ what: z.enum(['essentials', 'complete', 'event']), cents: z.number().int().min(0).max(1_000_000) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'What did they pay for, and how much?');
    const w = await c.env.DB.prepare(`SELECT id FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(c.req.param('slug')).first<{ id: string }>();
    if (!w) return err(c, 404, 'not_found', 'No wedding at that address.');
    await applyPurchase(c.env.DB, w.id, b.data.what, `manual:${crypto.randomUUID()}`, { amount: b.data.cents, currency: 'aud', manual: true });
    await c.env.DB.prepare(`UPDATE wedding SET content = json_remove(content, '$.planLinkSentAt') WHERE id = ? AND json_valid(content) AND json_extract(content, '$.planRequested') IS NULL`).bind(w.id).run();
    return c.json({ ok: true });
  });

  /** Feedback, newest first (?status= to filter), with counts by status. */
  app.get('/feedback', async (c) => {
    const status = c.req.query('status') ?? '';
    const { results } = await c.env.DB.prepare(
      `SELECT f.id, f.kind, f.text, f.page, f.status, f.note, f.created_at, COALESCE(w.name1 || ' & ' || w.name2, '') AS names, COALESCE(w.slug, '') AS slug, COALESCE(u.email, '') AS email
         FROM feedback f LEFT JOIN wedding w ON w.id = f.wedding_id LEFT JOIN user u ON u.id = f.user_id
        WHERE (?1 = '' OR f.status = ?1) ORDER BY f.created_at DESC LIMIT 300`,
    )
      .bind(status)
      .all<{ id: string; kind: string; text: string; page: string; status: string; note: string; created_at: string; names: string; slug: string; email: string }>();
    const { results: counts } = await c.env.DB.prepare(`SELECT status, COUNT(*) AS n FROM feedback GROUP BY status`).all<{ status: string; n: number }>();
    return c.json({
      feedback: results.map((r) => ({ id: r.id, kind: r.kind, text: r.text, page: r.page, status: r.status, note: r.note, createdAt: r.created_at, names: r.names, slug: r.slug, email: r.email })),
      counts: Object.fromEntries(counts.map((r) => [r.status, r.n])),
    });
  });
  app.put('/feedback/:id', async (c) => {
    const b = FeedbackUpdate.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check that.');
    const r = await c.env.DB.prepare(`UPDATE feedback SET status = COALESCE(?1, status), note = COALESCE(?2, note), updated_at = ?3 WHERE id = ?4`)
      .bind(b.data.status ?? null, b.data.note ?? null, new Date().toISOString(), c.req.param('id'))
      .run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'Not found.');
    return c.json({ ok: true });
  });

  /** The directory's vendor listings, newest first, hidden ones included. */
  app.get('/listings', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT l.id, l.slug, l.name, l.category, l.region, l.email, l.hidden, l.created_at,
              (SELECT COUNT(*) FROM vendor_enquiry e WHERE e.listing_id = l.id) AS enquiries
         FROM vendor_listing l ORDER BY l.created_at DESC LIMIT 300`,
    ).all<{ id: string; slug: string; name: string; category: string; region: string; email: string; hidden: number; created_at: string; enquiries: number }>();
    return c.json({ listings: results.map((r) => ({ ...r, hidden: !!r.hidden })) });
  });
  app.put('/listings/:id', async (c) => {
    const b = z.object({ hidden: z.boolean() }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Hidden or not?');
    const r = await c.env.DB.prepare(`UPDATE vendor_listing SET hidden = ?, updated_at = ? WHERE id = ?`).bind(b.data.hidden ? 1 : 0, new Date().toISOString(), c.req.param('id')).run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'Listing not found.');
    return c.json({ ok: true });
  });

  app.get('/settings', async (c) => c.json(await readSetting(c.env.DB, 'site', SiteSettings)));
  app.put('/settings', async (c) => {
    const b = SiteSettings.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check the settings.');
    const bad = [...Object.values(b.data.social), ...Object.values(b.data.paymentLinks)].find((u) => u && !/^https:\/\//.test(u)) ?? (b.data.banner.link && !/^(https:\/\/|\/)/.test(b.data.banner.link) ? b.data.banner.link : '');
    if (bad) return err(c, 400, 'invalid', `Links start with https:// (check ${bad.slice(0, 60)}).`);
    await writeSetting(c.env.DB, 'site', b.data);
    return c.json(b.data);
  });

  app.get('/promos', async (c) => {
    const [all, uses] = await Promise.all([readSetting(c.env.DB, 'promos', Promos), promoUses(c.env.DB)]);
    return c.json({ codes: all.codes.map((p) => ({ ...p, used: uses[p.code] ?? 0 })) });
  });
  app.put('/promos', async (c) => {
    const raw = (await readJson(c.req.raw)) as { codes?: unknown[] } | null;
    // `used` comes back from the list; it's counted from payments, never stored.
    const codes = Array.isArray(raw?.codes) ? raw.codes.map((x) => (x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'used')) : x)) : null;
    const b = Promos.safeParse({ codes });
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check the codes.');
    if (new Set(b.data.codes.map((p) => p.code)).size !== b.data.codes.length) return err(c, 400, 'invalid', 'Each code can only be listed once.');
    await writeSetting(c.env.DB, 'promos', b.data);
    const uses = await promoUses(c.env.DB);
    return c.json({ codes: b.data.codes.map((p) => ({ ...p, used: uses[p.code] ?? 0 })) });
  });

  /** Who said yes to news (at sign-up): name, email, wedding date and plan, as CSV for a mailing tool. */
  app.get('/optins.csv', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT u.first_name, u.email, u.created_at,
              (SELECT w.plan FROM membership m JOIN wedding w ON w.id = m.wedding_id WHERE m.user_id = u.id AND w.deleted_at IS NULL LIMIT 1) AS plan,
              (SELECT MIN(e.starts_at) FROM membership m JOIN event e ON e.wedding_id = m.wedding_id WHERE m.user_id = u.id AND e.deleted_at IS NULL) AS day
         FROM user u WHERE u.marketing_opt_in = 1 ORDER BY u.created_at DESC`,
    ).all<{ first_name: string | null; email: string; created_at: string; plan: string | null; day: string | null }>();
    const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [['First name', 'Email', 'Signed up', 'Plan', 'Wedding day'], ...results.map((r) => [r.first_name ?? '', r.email, r.created_at.slice(0, 10), r.plan ?? '', (r.day ?? '').slice(0, 10)])]
      .map((row) => row.map(cell).join(','))
      .join('\r\n');
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="opted-in-${dateIn('Australia/Sydney')}.csv"`, 'cache-control': 'no-store' } });
  });

  return app;
}

/** Public: what the front page and guest pages show (social links, the banner, the "Made with" link). */
export function siteRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/', async (c) => {
    const s = await readSetting(c.env.DB, 'site', SiteSettings);
    return c.json({ social: s.social, supportEmail: s.supportEmail, banner: s.banner.on && s.banner.text ? { text: s.banner.text, link: s.banner.link } : null, madeWith: s.madeWith }, 200, { 'cache-control': 'public, max-age=300' });
  });
  return app;
}

/** A couple tells us something (Help → Tell us): any member, a few a day. Mounted at /a/w/:wid/feedback. */
export function feedbackRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  app.post('/', async (c) => {
    const b = FeedbackIn.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check that.');
    if (!(await allow(c.env.DB, `feedback:${c.get('user').id}`, 10, 86_400_000))) return err(c, 429, 'slow_down', 'Thanks! That’s plenty for today: send more tomorrow.');
    const at = new Date().toISOString();
    await c.env.DB.prepare(`INSERT INTO feedback (id, wedding_id, user_id, kind, text, page, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'new', '', ?, ?)`)
      .bind(crypto.randomUUID(), c.req.param('wid'), c.get('user').id, b.data.kind, b.data.text, b.data.page, at, at)
      .run();
    return c.json({ ok: true });
  });
  /** What's planned or done from everyone's feedback: the company's own notes only, never anyone's words. */
  app.get('/updates', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT note, MAX(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done, MAX(updated_at) AS at FROM feedback WHERE status IN ('planned', 'done') AND note != '' GROUP BY note ORDER BY at DESC LIMIT 30`,
    ).all<{ note: string; done: number; at: string }>();
    return c.json({ updates: results.map((r) => ({ text: r.note, done: !!r.done, at: r.at })) });
  });
  return app;
}
