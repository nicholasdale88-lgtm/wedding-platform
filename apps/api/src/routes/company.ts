import { vendorCode, VendorProspects, PersonTargets, CustomRole, CustomRoles, isBuiltInRole, roleName, LAUNCH_TODOS, TodoItem, Todos, basQuarter, chargeCents, PRICE_CENTS, EVENT_ADDON_CENTS, dateIn, Expense, Expenses, FeedbackIn, FeedbackUpdate, financialYear, TaxSettings, PLAN_INFO, planOf, Promo, Promos, randomToken, SiteSettings, STAFF_INFO, StaffInviteIn, type PROMO_FOR, type StaffPerm } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import type { MiddlewareHandler } from 'hono';
import { hashPasscode, passcodeProblem, sessionId, verifyPasscode } from '../lib/auth';
import { buttonEmail, emailReady, sendEmail } from '../lib/email';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { mainAccountOf } from './accounts';
import { customRoles, jsonWritesOnly, requireMember, requireUser, signIn, superAdmins, type AdminEnv } from './auth';
import { applyPurchase } from './billing';
import { CONNECTION_KEYS, connectionStatus, saveConnections } from '../lib/connections';
import { PLANS } from './signup';

/**
 * The company portal (/api/a/company): for the people who run the app (staff), each route gated by what
 * their role can do (STAFF_CAN: owner, manager, support, developer, marketing). Every change is logged with
 * who made it (audit 'company.*': the Activity tab).
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
export async function readSetting<S extends z.ZodTypeAny>(db: D1Database, key: 'site' | 'promos' | 'tax' | 'expenses' | 'todo' | 'targets' | 'prospects', schema: S): Promise<z.output<S>> {
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
    if (!c.get('user').staff) return err(c, 403, 'forbidden', 'This is for the company only.');
    await next();
  });

  app.get('/stats', can('overview'), async (c) => {
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
      // Replies: answers (yes or no) to events the guest is still invited to, in weddings that still exist.
      one(
        `SELECT COUNT(*) AS n FROM rsvp r JOIN invitation i ON i.id = r.invitation_id JOIN wedding w ON w.id = i.wedding_id JOIN event e ON e.id = r.event_id
          JOIN invite_event ie ON ie.invitation_id = r.invitation_id AND ie.event_id = r.event_id
          WHERE r.attending IS NOT NULL AND i.deleted_at IS NULL AND w.deleted_at IS NULL AND e.deleted_at IS NULL`,
      ),
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
      .prepare(`SELECT detail, at FROM audit WHERE action IN ('plan.paid', 'plan.refund') AND json_valid(detail)`)
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
    const revenue = { total: paid.reduce((a, p) => a + cents(p.detail), 0), thisMonth: paid.filter((p) => p.at >= monthStart).reduce((a, p) => a + cents(p.detail), 0), payments: paid.filter((p) => cents(p.detail) >= 0).length }; // a free code's $0 is still a payment; refunds aren't
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
  app.get('/weddings', can('couples'), async (c) => {
    const q = `%${(c.req.query('q') ?? '').trim().toLowerCase().replace(/[%_]/g, '')}%`;
    const onlyRequests = c.req.query('requests') === '1';
    const { results } = await c.env.DB.prepare(
      `SELECT w.id, w.slug, w.name1, w.name2, w.plan, w.created_at,
              COALESCE(json_extract(w.content, '$.planRequested'), '') AS requested,
              COALESCE(json_extract(w.content, '$.planRequestedAt'), '') AS requested_at,
              COALESCE(json_extract(w.content, '$.planLinkSentAt'), '') AS link_sent_at,
              (SELECT COALESCE(SUM(json_extract(a.detail, '$.amount')), 0) FROM audit a WHERE a.wedding_id = w.id AND a.action IN ('plan.paid', 'plan.refund') AND json_valid(a.detail)) AS paid_cents,
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
  app.put('/weddings/:slug/plan', can('money'), async (c) => {
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
  app.post('/weddings/:slug/send-link', can('couples'), async (c) => {
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
    await logCompany(c, 'company.link', c.req.param('slug'), { what, emailed }, w.id);
    // Not emailed (email isn't set up, or it failed): the portal shows the link and address to send by hand.
    return c.json({ ok: true, emailed, email: to.email, link, cents: cents ?? 0 });
  });

  /** A plan request, step 2: they paid (by the link, a transfer, cash): switch it on and count the money. */
  app.post('/weddings/:slug/paid', can('money'), async (c) => {
    const b = z.object({ what: z.enum(['essentials', 'complete', 'event']), cents: z.number().int().min(0).max(1_000_000) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'What did they pay for, and how much?');
    const w = await c.env.DB.prepare(`SELECT id FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(c.req.param('slug')).first<{ id: string }>();
    if (!w) return err(c, 404, 'not_found', 'No wedding at that address.');
    await applyPurchase(c.env.DB, w.id, b.data.what, `manual:${crypto.randomUUID()}`, { amount: b.data.cents, currency: 'aud', manual: true, by: c.get('user').id });
    await logCompany(c, 'company.paid', c.req.param('slug'), b.data, w.id);
    await c.env.DB.prepare(`UPDATE wedding SET content = json_remove(content, '$.planLinkSentAt') WHERE id = ? AND json_valid(content) AND json_extract(content, '$.planRequested') IS NULL`).bind(w.id).run();
    return c.json({ ok: true });
  });

  /** Feedback, newest first (?status= to filter), with counts by status. */
  app.get('/feedback', can('feedback'), async (c) => {
    const status = c.req.query('status') ?? '';
    const { results } = await c.env.DB.prepare(
      `SELECT f.id, f.kind, f.text, f.page, f.status, f.note, f.created_at, COALESCE(f.assignee, '') AS assignee, COALESCE(w.name1 || ' & ' || w.name2, '') AS names, COALESCE(w.slug, '') AS slug, COALESCE(u.email, '') AS email
         FROM feedback f LEFT JOIN wedding w ON w.id = f.wedding_id LEFT JOIN user u ON u.id = f.user_id
        WHERE (?1 = '' OR f.status = ?1) ORDER BY f.created_at DESC LIMIT 300`,
    )
      .bind(status)
      .all<{ id: string; kind: string; text: string; page: string; status: string; note: string; created_at: string; assignee: string; names: string; slug: string; email: string }>();
    const { results: counts } = await c.env.DB.prepare(`SELECT status, COUNT(*) AS n FROM feedback GROUP BY status`).all<{ status: string; n: number }>();
    return c.json({
      // Developers see what was said and where, not who said it (no couple's email or names).
      feedback: results.map((r) => ({ id: r.id, kind: r.kind, text: r.text, page: r.page, status: r.status, note: r.note, createdAt: r.created_at, assignee: r.assignee, ...(c.get('user').perms.includes('couples') ? { names: r.names, slug: r.slug, email: r.email } : { names: '', slug: '', email: '' }) })),
      counts: Object.fromEntries(counts.map((r) => [r.status, r.n])),
    });
  });
  app.put('/feedback/:id', can('feedback'), async (c) => {
    const b = FeedbackUpdate.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check that.');
    // Who's on it: a staff member (or '' for nobody).
    if (b.data.assignee && !(await staffList(c.env)).some((m) => m.id === b.data.assignee)) return err(c, 400, 'invalid', 'That person isn’t on the team.');
    const r = await c.env.DB.prepare(
      `UPDATE feedback SET status = COALESCE(?1, status), note = COALESCE(?2, note), assignee = CASE WHEN ?3 IS NULL THEN assignee ELSE NULLIF(?3, '') END, updated_at = ?4, updated_by = ?5 WHERE id = ?6`,
    )
      .bind(b.data.status ?? null, b.data.note ?? null, b.data.assignee ?? null, new Date().toISOString(), c.get('user').id, c.req.param('id'))
      .run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'Not found.');
    await logCompany(c, 'company.feedback', c.req.param('id'), b.data);
    return c.json({ ok: true });
  });

  /** Who's on the team (for "who's on it"), any staff member. */
  app.get('/staff', async (c) => c.json({ staff: (await staffList(c.env)).map(({ id, name, role, roleName }) => ({ id, name, role, roleName })), me: { id: c.get('user').id, role: c.get('user').staff } }));

  /** The team: everyone with a role, and invitations not yet taken up. */
  app.get('/team', can('team'), async (c) => {
    const { results: invites } = await c.env.DB.prepare(`SELECT id, email, role, expires_at, created_at FROM staff_invite WHERE expires_at > ? ORDER BY created_at DESC`)
      .bind(new Date().toISOString())
      .all<{ id: string; email: string; role: string; expires_at: string; created_at: string }>();
    const made = await customRoles(c.env.DB);
    return c.json({ staff: await staffList(c.env), invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, roleName: roleName(i.role, made), expiresAt: i.expires_at })) });
  });
  /** Invite someone by email: a link (a week, once) that signs them in, or sets up their sign-in. */
  app.post('/team/invite', can('team'), async (c) => {
    const b = StaffInviteIn.safeParse(await readJson(c.req.raw));
    if (!b.success || !(await roleExists(c.env, b.data.role))) return err(c, 400, 'invalid', 'An email and a role, please.');
    if (!c.env.SESSION_SECRET) return err(c, 400, 'invalid', 'Sign-in isn’t set up.');
    const token = randomToken(32);
    const now = new Date();
    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM staff_invite WHERE email = ?`).bind(b.data.email),
      c.env.DB.prepare(`INSERT INTO staff_invite (id, hash, email, role, invited_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), await sessionId(token, c.env.SESSION_SECRET), b.data.email, b.data.role, c.get('user').id, new Date(now.getTime() + 7 * 86_400_000).toISOString(), now.toISOString(),
      ),
    ]);
    const link = `${c.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/company/join?t=${token}`;
    const made = await customRoles(c.env.DB);
    const name = roleName(b.data.role, made);
    const does = isBuiltInRole(b.data.role) ? STAFF_INFO[b.data.role].does : (made.find((r) => `custom:${r.id}` === b.data.role)?.does ?? '');
    const m = buttonEmail({ heading: 'Join the team', lines: [`You’ve been invited to help run The Yes List as ${name}.`, ...(does ? [does] : []), 'The link works once, for a week.'], button: 'Join', link });
    const emailed = await sendEmail(c.env, { to: b.data.email, subject: 'Join The Yes List team', ...m });
    await logCompany(c, 'company.team.invite', b.data.email, { role: b.data.role });
    return c.json({ ok: true, emailed, link, emailReady: emailReady(c.env) });
  });
  app.delete('/team/invites/:id', can('team'), async (c) => {
    await c.env.DB.prepare(`DELETE FROM staff_invite WHERE id = ?`).bind(c.req.param('id')).run();
    return c.json({ ok: true });
  });
  /** Change someone's role, or remove them (role ''). The founder (SUPER_ADMINS) and you yourself can't be changed here. */
  app.put('/team/:userId', can('team'), async (c) => {
    const b = z.object({ role: z.string().max(60) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success || (b.data.role && !(await roleExists(c.env, b.data.role)))) return err(c, 400, 'invalid', 'Choose a role.');
    const id = c.req.param('userId');
    if (id === c.get('user').id) return err(c, 400, 'invalid', 'Ask another owner to change your own role.');
    const who = (await staffList(c.env)).find((m) => m.id === id);
    if (!who) return err(c, 404, 'not_found', 'Not on the team.');
    if (who.founder) return err(c, 400, 'invalid', 'The founder’s account is set by SUPER_ADMINS.');
    if (b.data.role) await c.env.DB.prepare(`UPDATE staff SET role = ? WHERE user_id = ?`).bind(b.data.role, id).run();
    else
      await c.env.DB.batch([
        c.env.DB.prepare(`DELETE FROM staff WHERE user_id = ?`).bind(id),
        // Removed: signed out everywhere, so the portal closes for them straight away.
        c.env.DB.prepare(`DELETE FROM session WHERE user_id = ?`).bind(id),
        c.env.DB.prepare(`UPDATE feedback SET assignee = NULL WHERE assignee = ?`).bind(id),
      ]);
    await logCompany(c, b.data.role ? 'company.team.role' : 'company.team.remove', who.email, { role: b.data.role });
    return c.json({ ok: true });
  });

  /** Money and tax for one financial year (?fy=2027 is Jul 2026 to Jun 2027): sales, fees, GST, expenses, what to set aside. */
  app.get('/money', can('money'), async (c) => {
    const db = c.env.DB;
    const tax = await readSetting(db, 'tax', TaxSettings);
    const fy = Number(c.req.query('fy')) || financialYear(new Date().toISOString().slice(0, 10));
    const from = `${fy - 1}-07-01`;
    const to = `${fy}-07-01`;
    const { results } = await db
      .prepare(
        `SELECT a.at, a.detail, COALESCE(w.name1 || ' & ' || w.name2, '') AS names FROM audit a LEFT JOIN wedding w ON w.id = a.wedding_id
          WHERE a.action IN ('plan.paid', 'plan.refund') AND json_valid(a.detail) AND a.at >= ? AND a.at < ? ORDER BY a.at`,
      )
      .bind(from, to)
      .all<{ at: string; detail: string; names: string }>();
    const sales = results.map((r) => {
      const d = safeDetail(r.detail);
      const cents = typeof d.amount === 'number' ? d.amount : 0;
      const card = !d.manual && cents > 0;
      const fee = card ? Math.round((cents * tax.feePct) / 100 + tax.feeCents) : 0;
      const gst = tax.gstRegistered && tax.gstFrom && r.at.slice(0, 10) >= tax.gstFrom ? Math.round(cents / 11) : 0;
      return { at: r.at, names: r.names, what: String(d.what ?? ''), cents, fee, gst, promo: String(d.promo ?? ''), manual: !!d.manual };
    });
    const expenses = (await readSetting(db, 'expenses', Expenses)).list.filter((e) => e.date >= from && e.date < to).sort((a, b) => a.date.localeCompare(b.date));
    const quarters = [1, 2, 3, 4].map((q) => {
      const s = sales.filter((x) => basQuarter(x.at) === q);
      const e = expenses.filter((x) => basQuarter(x.date) === q);
      const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
      const gross = sum(s, (x) => x.cents);
      const fees = sum(s, (x) => x.fee);
      const gstCollected = sum(s, (x) => x.gst);
      const spent = sum(e, (x) => x.cents);
      const gstPaid = tax.gstRegistered ? sum(e, (x) => (tax.gstFrom && x.date >= tax.gstFrom ? x.gstCents : 0)) : 0;
      const profit = gross - gstCollected - fees - (spent - gstPaid);
      return { q, sales: s.length, gross, fees, gstCollected, gstPaid, gstOwed: Math.max(0, gstCollected - gstPaid), spent, profit, setAside: Math.max(0, Math.round((profit * tax.setAsidePct) / 100)) };
    });
    const total = quarters.reduce(
      (a, q) => ({ sales: a.sales + q.sales, gross: a.gross + q.gross, fees: a.fees + q.fees, gstCollected: a.gstCollected + q.gstCollected, gstPaid: a.gstPaid + q.gstPaid, gstOwed: a.gstOwed + q.gstOwed, spent: a.spent + q.spent, profit: a.profit + q.profit, setAside: 0 }),
      { sales: 0, gross: 0, fees: 0, gstCollected: 0, gstPaid: 0, gstOwed: 0, spent: 0, profit: 0, setAside: 0 },
    );
    total.setAside = Math.max(0, Math.round((total.profit * tax.setAsidePct) / 100));
    // GST registration is required once turnover reaches $75,000 in 12 months: warn from $60,000.
    const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString();
    const last12 = (await db.prepare(`SELECT COALESCE(SUM(json_extract(detail, '$.amount')), 0) AS n FROM audit WHERE action IN ('plan.paid', 'plan.refund') AND json_valid(detail) AND at >= ?`).bind(yearAgo).first<{ n: number }>())?.n ?? 0;
    // Are we making money? The last 12 months, month by month: real sales and fees, the running costs
    // (every month) and one-off expenses, and the profit left.
    const monthly = tax.monthlyCosts.reduce((a, m) => a + m.cents, 0);
    const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1)).toISOString();
    const { results: paidRows } = await db.prepare(`SELECT at, detail FROM audit WHERE action IN ('plan.paid', 'plan.refund') AND json_valid(detail) AND at >= ? ORDER BY at`).bind(since).all<{ at: string; detail: string }>();
    const allExpenses = (await readSetting(db, 'expenses', Expenses)).list;
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11 + i, 1));
      const ym = d.toISOString().slice(0, 7);
      const all = paidRows.filter((r) => r.at.slice(0, 7) === ym).map((r) => safeDetail(r.detail));
      // Refunds (negative amounts) take money off, not a sale.
      const rows = all.filter((r) => typeof r.amount !== 'number' || r.amount >= 0);
      const refunded = all.filter((r) => typeof r.amount === 'number' && r.amount < 0).reduce((a, r) => a + (r.amount as number), 0);
      const gross = rows.reduce((a, r) => a + (typeof r.amount === 'number' ? r.amount : 0), 0) + refunded;
      const fees = rows.reduce((a, r) => a + (!r.manual && typeof r.amount === 'number' && r.amount > 0 ? Math.round((r.amount * tax.feePct) / 100 + tax.feeCents) : 0), 0);
      const oneOff = allExpenses.filter((e) => e.date.slice(0, 7) === ym).reduce((a, e) => a + e.cents, 0);
      const count = (w: string) => rows.filter((r) => r.what === w).length;
      return { month: ym, sales: rows.length, essentials: count('essentials'), deluxe: count('complete'), events: count('event'), gross, fees, running: monthly, oneOff, profit: gross - fees - monthly - oneOff };
    });
    return c.json({ fy, tax, quarters, total, sales, expenses, last12Cents: last12, gstThresholdCents: 7_500_000, months, prices: { essentials: PRICE_CENTS.essentials, deluxe: PRICE_CENTS.complete, event: EVENT_ADDON_CENTS } });
  });
  app.put('/money/settings', can('money'), async (c) => {
    const b = TaxSettings.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check that.');
    if (b.data.gstRegistered && !b.data.gstFrom) return err(c, 400, 'invalid', 'The date your GST registration started, please.');
    await writeSetting(c.env.DB, 'tax', b.data);
    await logCompany(c, 'company.tax', 'tax', { gstRegistered: b.data.gstRegistered, setAsidePct: b.data.setAsidePct });
    return c.json(b.data);
  });
  app.post('/money/expenses', can('money'), async (c) => {
    const b = Expense.omit({ id: true }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'A date, what it was and the amount, please.');
    const all = await readSetting(c.env.DB, 'expenses', Expenses);
    const e = { ...b.data, id: crypto.randomUUID().slice(0, 12) };
    await writeSetting(c.env.DB, 'expenses', { list: [...all.list, e].slice(-2000) });
    await logCompany(c, 'company.expense', e.what, { cents: e.cents });
    return c.json(e);
  });
  app.delete('/money/expenses/:id', can('money'), async (c) => {
    const all = await readSetting(c.env.DB, 'expenses', Expenses);
    await writeSetting(c.env.DB, 'expenses', { list: all.list.filter((e) => e.id !== c.req.param('id')) });
    return c.json({ ok: true });
  });
  /** The year for the accountant: every sale and expense, as a spreadsheet (CSV). */
  app.get('/money.csv', can('money'), async (c) => {
    const fy = Number(c.req.query('fy')) || financialYear(new Date().toISOString().slice(0, 10));
    const r = await app.request(`/money?fy=${fy}`, { headers: c.req.raw.headers }, c.env);
    const m = (await r.json()) as { sales: { at: string; names: string; what: string; cents: number; fee: number; gst: number; promo: string; manual: boolean }[]; expenses: Expense[] };
    const cell = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    const $ = (n: number) => (n / 100).toFixed(2);
    const rows = [
      ['Type', 'Date', 'Who / what', 'Item', 'Amount', 'GST in it', 'Card fee', 'Notes'],
      ...m.sales.map((s) => ['Sale', s.at.slice(0, 10), s.names, s.what, $(s.cents), $(s.gst), $(s.fee), [s.manual ? 'paid by link/transfer' : 'card', s.promo && `code ${s.promo}`].filter(Boolean).join(', ')]),
      ...m.expenses.map((e) => ['Expense', e.date, e.what, e.kind, $(e.cents), $(e.gstCents), '', '']),
    ];
    return new Response(rows.map((row) => row.map(cell).join(',')).join('\r\n'), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="the-yes-list-FY${fy}.csv"`, 'cache-control': 'no-store' },
    });
  });

  /** Bots (Grok, say) that help run the company: each with a role like a person's, and a key shown once. */
  app.get('/bots', can('team'), async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT b.id, b.name, COALESCE(st.role, '') AS role, b.created_at, b.last_used_at, b.revoked_at FROM bot_key b LEFT JOIN staff st ON st.user_id = b.user_id ORDER BY b.created_at DESC`,
    ).all<{ id: string; name: string; role: string; created_at: string; last_used_at: string | null; revoked_at: string | null }>();
    const made = await customRoles(c.env.DB);
    return c.json({ bots: results.map((r) => ({ id: r.id, name: r.name, role: r.role, roleName: roleName(r.role, made), createdAt: r.created_at, lastUsedAt: r.last_used_at ?? '', revoked: !!r.revoked_at })) });
  });
  app.post('/bots', can('team'), async (c) => {
    const b = z.object({ name: z.string().trim().min(1).max(40), role: z.string().max(60) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success || b.data.role === 'owner' || !(await roleExists(c.env, b.data.role))) return err(c, 400, 'invalid', 'A name and a role (not owner), please.');
    if (!c.env.SESSION_SECRET) return err(c, 400, 'invalid', 'Sign-in isn’t set up.');
    const key = `yl_bot_${randomToken(40)}`;
    const id = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB.batch([
      // Its own user (no passcode: it can only use its key), so its actions show under its name.
      c.env.DB.prepare(`INSERT INTO user (id, email, name, pass_hash, first_name, marketing_opt_in, marketing_opt_in_at, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 0, ?, ?, ?)`).bind(userId, `bot-${id.slice(0, 8)}@bots.invalid`, b.data.name, b.data.name, now, now, now),
      c.env.DB.prepare(`INSERT INTO staff (user_id, role, added_by, created_at) VALUES (?, ?, ?, ?)`).bind(userId, b.data.role, c.get('user').id, now),
      c.env.DB.prepare(`INSERT INTO bot_key (id, user_id, name, hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(id, userId, b.data.name, await sessionId(key, c.env.SESSION_SECRET), c.get('user').id, now),
    ]);
    await logCompany(c, 'company.bot.add', b.data.name, { role: b.data.role });
    return c.json({ id, key });
  });
  app.delete('/bots/:id', can('team'), async (c) => {
    const row = await c.env.DB.prepare(`SELECT user_id, name FROM bot_key WHERE id = ?`).bind(c.req.param('id')).first<{ user_id: string; name: string }>();
    if (!row) return err(c, 404, 'not_found', 'No such bot.');
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE bot_key SET revoked_at = ? WHERE id = ?`).bind(new Date().toISOString(), c.req.param('id')),
      c.env.DB.prepare(`DELETE FROM staff WHERE user_id = ?`).bind(row.user_id),
    ]);
    await logCompany(c, 'company.bot.revoke', row.name, {});
    return c.json({ ok: true });
  });

  /**
   * The company assistant (free Workers AI): a weekly brief from the real numbers, a reply to a piece of
   * feedback, posts for social media, an outreach email to a celebrant or planner. It drafts; a person sends.
   */
  app.get('/assistant', async (c) => c.json({ on: !!c.env.AI }));
  app.post('/assistant', async (c) => {
    const b = z
      .object({ task: z.enum(['brief', 'feedback', 'posts', 'outreach', 'ask']), id: z.string().max(60).default(''), note: z.string().trim().max(600).default('') })
      .strict()
      .safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'What would you like help with?');
    if (!c.env.AI) return err(c, 400, 'off', 'The assistant isn’t switched on for this site yet (Workers AI).');
    if (!(await allow(c.env.DB, `company-ai:${c.get('user').id}`, 40, 86_400_000))) return err(c, 429, 'slow_down', 'That’s plenty for today. Try again tomorrow.');
    const need: Record<typeof b.data.task, StaffPerm> = { brief: 'overview', feedback: 'feedback', posts: 'promote', outreach: 'promote', ask: 'overview' };
    if (!c.get('user').perms.includes(need[b.data.task])) return err(c, 403, 'forbidden', 'Your role can’t do that. Ask an owner.');
    const db = c.env.DB;
    const one = async (sql: string, ...v: unknown[]) => (await db.prepare(sql).bind(...v).first<{ n: number }>())?.n ?? 0;
    const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const facts = {
      weddings: await one(`SELECT COUNT(*) AS n FROM wedding WHERE deleted_at IS NULL`),
      newThisWeek: await one(`SELECT COUNT(*) AS n FROM wedding WHERE deleted_at IS NULL AND created_at >= ?`, week),
      paidThisWeek: await one(`SELECT COUNT(*) AS n FROM audit WHERE action = 'plan.paid' AND at >= ?`, week),
      revenueThisWeekCents: await one(`SELECT COALESCE(SUM(json_extract(detail, '$.amount')), 0) AS n FROM audit WHERE action IN ('plan.paid', 'plan.refund') AND json_valid(detail) AND at >= ?`, week),
      planRequests: await one(`SELECT COUNT(*) AS n FROM wedding WHERE deleted_at IS NULL AND json_valid(content) AND json_extract(content, '$.planRequested') IS NOT NULL`),
      newFeedback: await one(`SELECT COUNT(*) AS n FROM feedback WHERE status = 'new'`),
      prices: `Essentials $${PRICE_CENTS.essentials / 100}, Deluxe $${PRICE_CENTS.complete / 100}, extra event $${EVENT_ADDON_CENTS / 100}, all once per wedding`,
    };
    const brand = `The Yes List is an Australian online wedding invitation, RSVP and planning app (animated wax-sealed invitations on the phone, replies by text or email into one guest list, seating with rules, budget, vendors, wedding party pages). ${facts.prices}. Free plan up to 50 guests.`;
    let ask = '';
    if (b.data.task === 'brief') ask = `Write a short Monday brief for the founder from these numbers: ${JSON.stringify(facts)}. Then the three most useful things to do this week. Plain words, under 180 words.`;
    else if (b.data.task === 'feedback') {
      const f = await db.prepare(`SELECT kind, text FROM feedback WHERE id = ?`).bind(b.data.id).first<{ kind: string; text: string }>();
      if (!f) return err(c, 404, 'not_found', 'That feedback is gone.');
      ask = `A couple sent this ${f.kind}: "${f.text.slice(0, 1500)}". Draft a warm, short reply from the founder (under 90 words), and a one-line note for the roadmap if it's worth doing.${b.data.note ? ` Keep in mind: ${b.data.note}` : ''}`;
    } else if (b.data.task === 'posts')
      ask = `Write three short social posts (Instagram caption, Facebook post, TikTok hook with a 3-shot idea) about ${b.data.note || 'the animated invitation and replies landing in your guest list'}. Include the link placeholder [link]. Australian spelling, warm, no hashtags spam (max 5), no false claims, no "was/now" prices.`;
    else if (b.data.task === 'outreach')
      ask = `Draft a short, friendly first email from the founder to ${b.data.note || 'a wedding celebrant'} offering their couples 10% off with a partner code [CODE] and a free Deluxe for their own events. Say who it's from, keep it under 120 words, and end with "Reply STOP and we won't email again."`;
    else ask = `${b.data.note || 'What should we focus on this week?'} Use these numbers if helpful: ${JSON.stringify(facts)}. Under 150 words.`;
    try {
      const out = (await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: `You help run a small business. ${brand} Be accurate: only use the numbers given; never invent figures, reviews or customers.` },
          { role: 'user', content: ask },
        ],
        max_tokens: 600,
      })) as { response?: string };
      const text = (out.response ?? '').trim();
      if (!text) return err(c, 400, 'empty', 'No answer came back. Try again in a minute.');
      await logCompany(c, 'company.assistant', b.data.task, {});
      return c.json({ text, facts });
    } catch {
      return err(c, 400, 'failed', 'The assistant didn’t answer. Try again in a minute.');
    }
  });

  /** The site's connections (owners only): which services are set up, never the keys themselves. */
  app.get('/connections', async (c) => {
    if (c.get('user').staff !== 'owner') return err(c, 403, 'forbidden', 'Only an owner can see the connections.');
    return c.json({ status: await connectionStatus(c.env), redirectUri: `${c.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/oauth/callback`, stripeHook: `${c.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/hooks/stripe` });
  });
  app.put('/connections', async (c) => {
    if (c.get('user').staff !== 'owner') return err(c, 403, 'forbidden', 'Only an owner can change the connections.');
    const b = z.record(z.enum(CONNECTION_KEYS), z.string().max(400)).safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Please check what you pasted.');
    if (!c.env.SESSION_SECRET) return err(c, 400, 'invalid', 'Sign-in isn’t set up.');
    await saveConnections(c.env, b.data);
    await logCompany(c, 'company.connections', Object.keys(b.data).join(', '), {});
    return c.json({ status: await connectionStatus(c.env) });
  });

  /** The company's to-do list: anyone on the team reads it; owners and managers tick, add and remove. */
  app.get('/todo', async (c) => {
    const saved = await readSetting(c.env.DB, 'todo', Todos);
    // The first time: the launch jobs, ready to tick.
    const items = saved.seeded ? saved.items : LAUNCH_TODOS;
    return c.json({ items, canEdit: c.get('user').perms.includes('money') });
  });
  app.put('/todo', can('money'), async (c) => {
    const b = z.object({ items: z.array(TodoItem).max(200) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Please check the list.');
    const before = await readSetting(c.env.DB, 'todo', Todos);
    const was = new Map((before.seeded ? before.items : LAUNCH_TODOS).map((i) => [i.id, i]));
    const who = c.get('user').email;
    // Who ticked what, and when (kept from before for anything not newly ticked).
    const items = b.data.items.map((i) => {
      const old = was.get(i.id);
      if (i.done && !old?.done) return { ...i, doneAt: new Date().toISOString(), doneBy: who };
      if (!i.done) return { ...i, doneAt: '', doneBy: '' };
      return { ...i, doneAt: old?.doneAt ?? i.doneAt, doneBy: old?.doneBy ?? i.doneBy };
    });
    await writeSetting(c.env.DB, 'todo', { items, seeded: true });
    return c.json({ items, canEdit: true });
  });

  /** An idea from the team or a bot (Grok's scout and test drives): straight into Feedback as new, to sort with the rest. */
  app.post('/ideas', can('feedback', 'promote'), async (c) => {
    const b = z.object({ kind: z.enum(['idea', 'problem']).default('idea'), text: z.string().trim().min(3).max(2000), source: z.string().trim().max(60).default('') }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'A few words, please.');
    if (!(await allow(c.env.DB, `ideas:${c.get('user').id}`, 30, 86_400_000))) return err(c, 429, 'slow_down', 'That’s plenty of ideas for today.');
    const at = new Date().toISOString();
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO feedback (id, wedding_id, user_id, kind, text, page, status, note, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?, 'new', '', ?, ?)`)
      .bind(id, c.get('user').id, b.data.kind, b.data.text, (b.data.source || 'team').slice(0, 120), at, at)
      .run();
    return c.json({ id });
  });

  /** Made roles (owners): a name, what it's for, and exactly which parts of the portal it reaches. */
  app.get('/roles', can('team'), async (c) => {
    const roles = await customRoles(c.env.DB);
    const { results } = await c.env.DB.prepare(`SELECT role, COUNT(*) AS n FROM staff WHERE role LIKE 'custom:%' GROUP BY role`).all<{ role: string; n: number }>();
    const used = Object.fromEntries(results.map((r) => [r.role, r.n]));
    return c.json({ roles: roles.map((r) => ({ ...r, people: used[`custom:${r.id}`] ?? 0 })) });
  });
  app.put('/roles', can('team'), async (c) => {
    const b = z.object({ roles: z.array(CustomRole).max(20) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check the roles.');
    if (new Set(b.data.roles.map((r) => r.id)).size !== b.data.roles.length) return err(c, 400, 'invalid', 'Each role needs its own name.');
    // A role someone still has can't be deleted (they'd lose the portal without warning): change their role first.
    const kept = new Set(b.data.roles.map((r) => `custom:${r.id}`));
    const { results } = await c.env.DB.prepare(`SELECT DISTINCT role FROM staff WHERE role LIKE 'custom:%'`).all<{ role: string }>();
    const orphan = results.find((r) => !kept.has(r.role));
    if (orphan) return err(c, 400, 'in_use', `Someone still has the role ${roleName(orphan.role, await customRoles(c.env.DB))}. Give them another role first.`);
    const roles = b.data.roles.map((r) => ({ ...r, perms: r.perms.filter((p) => p !== 'team') }));
    await writeSetting(c.env.DB, 'roles', CustomRoles.parse({ roles }));
    await logCompany(c, 'company.roles', roles.map((r) => r.name).join(', '), {});
    return c.json({ roles });
  });

  /**
   * A refund (Manager, Owner, or a bot with Money): through Stripe when the payment was by card, otherwise
   * recorded for you to pay back by bank. It comes off revenue and profit. Bots may refund up to one Deluxe
   * plan's price, three a day; anything bigger is for a person. Optionally switches the plan back to Free.
   */
  app.post('/weddings/:slug/refund', can('money'), async (c) => {
    const b = z.object({ cents: z.number().int().min(1).max(1_000_000), reason: z.string().trim().min(3).max(300), downgrade: z.boolean().default(false) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'How much, and why?');
    const db = c.env.DB;
    const w = await db.prepare(`SELECT id, name1, name2 FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(c.req.param('slug')).first<{ id: string; name1: string; name2: string }>();
    if (!w) return err(c, 404, 'not_found', 'No wedding at that address.');
    const bot = c.get('user').email.endsWith('@bots.invalid');
    if (bot && b.data.cents > PRICE_CENTS.complete) return err(c, 403, 'too_big', 'A refund that big needs a person (an owner or manager).');
    if (bot && !(await allow(db, `bot-refunds:${c.get('user').id}`, 3, 86_400_000))) return err(c, 429, 'slow_down', 'Three refunds a day is a bot’s limit. Ask a person.');
    const { results } = await db.prepare(`SELECT action, target, detail FROM audit WHERE wedding_id = ? AND action IN ('plan.paid', 'plan.refund') AND json_valid(detail) ORDER BY at`).bind(w.id).all<{ action: string; target: string | null; detail: string }>();
    const net = results.reduce((a, r) => a + (Number(safeDetail(r.detail).amount) || 0), 0);
    if (b.data.cents > net) return err(c, 400, 'too_much', `They’ve paid ${(net / 100).toFixed(2)} in all (after earlier refunds): refund that or less.`);
    // The latest card payment, if any: Stripe refunds it.
    const card = [...results].reverse().find((r) => r.action === 'plan.paid' && (r.target ?? '').startsWith('cs_'));
    let refundId: string | null = null;
    if (card && c.env.STRIPE_SECRET_KEY) {
      const auth = { authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}` };
      const session = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(card.target!)}`, { headers: auth }).then((r) => r.json() as Promise<{ payment_intent?: string; error?: { message?: string } }>).catch(() => ({}) as { payment_intent?: string; error?: { message?: string } });
      if (!session.payment_intent) return err(c, 400, 'stripe', `Stripe couldn’t find that payment${session.error?.message ? `: ${session.error.message}` : ''}.`);
      const res = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ payment_intent: session.payment_intent, amount: String(b.data.cents), reason: 'requested_by_customer', 'metadata[wedding]': w.id }).toString(),
      });
      const out = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
      if (!res.ok || !out.id) return err(c, 400, 'stripe', `Stripe didn’t refund it${out.error?.message ? `: ${out.error.message}` : ''}.`);
      refundId = out.id;
    }
    const at = new Date().toISOString();
    const stmts = [
      db.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'plan.refund', ?, ?, ?)`).bind(
        crypto.randomUUID(), w.id, c.get('user').id, refundId ?? `manual:${crypto.randomUUID()}`, JSON.stringify({ amount: -b.data.cents, currency: 'aud', reason: b.data.reason, stripe: refundId, manual: !refundId }), at,
      ),
    ];
    if (b.data.downgrade) stmts.push(db.prepare(`UPDATE wedding SET plan = 'free', updated_at = ? WHERE id = ?`).bind(at, w.id));
    await db.batch(stmts);
    await logCompany(c, 'company.refund', c.req.param('slug'), { cents: b.data.cents, reason: b.data.reason, downgrade: b.data.downgrade }, w.id);
    // Tell the couple's main account.
    const main = await mainAccountOf(db, w.id);
    const to = main ? await db.prepare(`SELECT email FROM user WHERE id = ?`).bind(main).first<{ email: string }>() : null;
    if (to) {
      const m = buttonEmail({
        heading: 'Your refund',
        lines: [`We’ve refunded $${(b.data.cents / 100).toFixed(2)} for ${w.name1} & ${w.name2}.`, refundId ? 'It goes back to the card you paid with, usually within 5 to 10 business days.' : 'We’ll pay it back to you directly.'],
        button: 'Open your wedding',
        link: `${c.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/admin`,
      });
      await sendEmail(c.env, { to: to.email, subject: 'Your refund from The Yes List', ...m });
    }
    return c.json({ ok: true, stripe: !!refundId, refundId });
  });

  /** Reply to whoever sent a piece of feedback, by email from the support address; kept in Activity. */
  app.post('/feedback/:id/reply', can('feedback'), async (c) => {
    const b = z.object({ text: z.string().trim().min(3).max(3000) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Write a reply first.');
    if (!(await allow(c.env.DB, `fb-reply:${c.get('user').id}`, 60, 86_400_000))) return err(c, 429, 'slow_down', 'That’s plenty of replies for today.');
    const f = await c.env.DB.prepare(`SELECT f.text, u.email, COALESCE(u.first_name, '') AS first FROM feedback f LEFT JOIN user u ON u.id = f.user_id WHERE f.id = ?`).bind(c.req.param('id')).first<{ text: string; email: string | null; first: string }>();
    if (!f) return err(c, 404, 'not_found', 'That feedback is gone.');
    if (!f.email || f.email.endsWith('@bots.invalid')) return err(c, 400, 'no_email', 'There’s no one to reply to (it came from the team).');
    const site = await readSetting(c.env.DB, 'site', SiteSettings);
    const text = `${b.data.text}\n\nYou wrote: “${f.text.slice(0, 500)}”`;
    const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:24px 18px;color:#33402f">${text
      .split('\n')
      .map((l) => `<p style="font-size:16px;line-height:1.5;margin:0 0 10px">${l.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)}</p>`)
      .join('')}</div>`;
    const sent = await sendEmail(c.env, { to: f.email, subject: 'About your feedback to The Yes List', text, html, ...(site.supportEmail ? { replyTo: [site.supportEmail] } : {}) });
    if (!sent) return err(c, 400, 'not_sent', 'Email isn’t set up yet (Settings → Connections → Email), so the reply couldn’t go.');
    await c.env.DB.prepare(`UPDATE feedback SET updated_at = ?, updated_by = ? WHERE id = ?`).bind(new Date().toISOString(), c.get('user').id, c.req.param('id')).run();
    await logCompany(c, 'company.feedback.reply', c.req.param('id'), { chars: b.data.text.length });
    return c.json({ ok: true, to: f.email });
  });

  /**
   * The goals, for everyone on the team and every bot (no money details beyond the goal): the big goal and
   * how far along, this week's paying weddings against the weekly number, and each person's own target.
   * A bot reads this first on every run (docs/GROK_PLAYBOOK.md).
   */
  app.get('/goals', async (c) => {
    const db = c.env.DB;
    const tax = await readSetting(db, 'tax', TaxSettings);
    const from = tax.targetFrom || new Date().toISOString().slice(0, 7);
    const { results } = await db.prepare(`SELECT at, detail FROM audit WHERE action IN ('plan.paid', 'plan.refund') AND json_valid(detail) AND at >= ?`).bind(`${from}-01`).all<{ at: string; detail: string }>();
    const fee = (cents: number, manual: boolean) => (!manual && cents > 0 ? Math.round((cents * tax.feePct) / 100 + tax.feeCents) : 0);
    const rows = results.map((r) => ({ at: r.at, d: safeDetail(r.detail) })).map((r) => ({ at: r.at, cents: typeof r.d.amount === 'number' ? r.d.amount : 0, manual: !!r.d.manual }));
    const running = tax.monthlyCosts.reduce((a, m) => a + m.cents, 0);
    const monthsSince = Math.max(1, new Set(rows.map((r) => r.at.slice(0, 7))).size || 1);
    const kept = rows.reduce((a, r) => a + r.cents - fee(r.cents, r.manual), 0);
    const profit = kept - running * monthsSince;
    const sales = rows.filter((r) => r.cents > 0);
    // What each paying wedding leaves, from the real sales (or the price list until there are some).
    const each = sales.length ? Math.round(sales.reduce((a, r) => a + r.cents - fee(r.cents, r.manual), 0) / sales.length) : Math.round(PRICE_CENTS.essentials * 0.98 - 30);
    const by = tax.goalBy ? Date.parse(`${tax.goalBy}T00:00:00Z`) : Date.now() + 365 * 86_400_000;
    const weeksLeft = Math.max(1, (by - Date.now()) / (7 * 86_400_000));
    const weekly = (goal: number) => Math.ceil(((goal - profit) / weeksLeft + (running * 12) / 52) / Math.max(1, each));
    const weekStart = new Date(Date.now() - ((new Date().getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
    const thisWeek = sales.filter((r) => r.at >= weekStart).length;
    const people = await readSetting(db, 'targets', PersonTargets);
    const team = await staffList(c.env);
    return c.json({
      goal: { at_least: tax.goalCents, ideally: tax.stretchCents, then_a_year: tax.longTermCents, by: tax.goalBy, profitSoFar: profit },
      week: { paidWeddings: thisWeek, needed: Math.max(0, weekly(tax.goalCents)), neededForIdeal: Math.max(0, weekly(tax.stretchCents)) },
      keptPerWedding: each,
      people: people.people.map((p) => ({ ...p, name: team.find((m) => m.id === p.userId)?.name ?? 'Removed' })),
      mine: people.people.find((p) => p.userId === c.get('user').id) ?? null,
    });
  });
  app.put('/goals/people', can('team'), async (c) => {
    const b = PersonTargets.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Please check the targets.');
    await writeSetting(c.env.DB, 'targets', b.data);
    await logCompany(c, 'company.targets', `${b.data.people.length} people`, {});
    return c.json(b.data);
  });

  /** A listing's partner code (10% off for their couples), made if it hasn't one; uses counted from payments. */
  app.post('/listings/:id/code', can('vendors', 'promote'), async (c) => {
    const l = await c.env.DB.prepare(`SELECT id, name FROM vendor_listing WHERE id = ?`).bind(c.req.param('id')).first<{ id: string; name: string }>();
    if (!l) return err(c, 404, 'not_found', 'Listing not found.');
    const code = await ensureVendorCode(c.env.DB, l.id, l.name);
    await logCompany(c, 'company.vendor.code', l.name, { code });
    return c.json({ code });
  });

  /** Vendors we'd like in the directory: who, where, and where they're up to. */
  app.get('/prospects', can('vendors', 'promote'), async (c) => {
    const all = await readSetting(c.env.DB, 'prospects', VendorProspects);
    // Joined: a listing now uses their email.
    const { results } = await c.env.DB.prepare(`SELECT lower(email) AS e FROM vendor_listing`).all<{ e: string }>();
    const joined = new Set(results.map((r) => r.e));
    return c.json({ list: all.list.map((p) => (joined.has(p.email) && p.status !== 'stopped' ? { ...p, status: 'joined' as const } : p)), emailOn: emailReady(c.env) });
  });
  app.put('/prospects', can('vendors', 'promote'), async (c) => {
    const b = VendorProspects.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check the list.');
    // One per email; anyone who asked not to hear from us stays that way.
    const before = await readSetting(c.env.DB, 'prospects', VendorProspects);
    const stopped = new Set(before.list.filter((p) => p.status === 'stopped').map((p) => p.email));
    const seen = new Set<string>();
    const list = b.data.list.filter((p) => !seen.has(p.email) && !!seen.add(p.email)).map((p) => (stopped.has(p.email) ? { ...p, status: 'stopped' as const } : p));
    await writeSetting(c.env.DB, 'prospects', { list });
    return c.json({ list });
  });
  /** Invite some to list free (and to give their couples 10% off with their own code). At most 50 a day. */
  app.post('/prospects/invite', can('vendors', 'promote'), async (c) => {
    const b = z.object({ ids: z.array(z.string().max(40)).min(1).max(50) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Choose who to invite.');
    if (!emailReady(c.env) || !c.env.SESSION_SECRET) return err(c, 400, 'no_email', 'Email isn’t set up yet (Settings → Connections → Email).');
    const all = await readSetting(c.env.DB, 'prospects', VendorProspects);
    const base = c.env.PUBLIC_BASE_URL.replace(/\/$/, '');
    const site = await readSetting(c.env.DB, 'site', SiteSettings);
    let sent = 0;
    const skipped: string[] = [];
    for (const p of all.list.filter((x) => b.data.ids.includes(x.id))) {
      if (p.status === 'stopped' || p.status === 'joined') {
        skipped.push(p.business);
        continue;
      }
      if (!(await allow(c.env.DB, 'vendor-invites', 50, 86_400_000))) {
        skipped.push(p.business);
        continue;
      }
      const stop = `${base}/api/site/unsubscribe?p=${encodeURIComponent(p.id)}.${(await sessionId(`vendor-stop:${p.id}`, c.env.SESSION_SECRET)).slice(0, 16)}`;
      const m = buttonEmail({
        heading: `List ${p.business} free on The Yes List`,
        lines: [
          `Hi ${p.contact || 'there'},`,
          `The Yes List is a new Australian wedding invitation and planning app. Couples planning their weddings look for ${p.category ? `${p.category.toLowerCase()}s` : 'vendors'}${p.region ? ` around ${p.region}` : ''} in our directory, and we’d love ${p.business} to be there.`,
          'Listing is free. You also get your own code that gives your couples 10% off The Yes List: a small thank-you you can pass on.',
          `From The Yes List team. If you’d rather not hear from us again: ${stop}`,
        ],
        button: 'List my business free',
        link: `${base}/vendors/join?ref=${encodeURIComponent(p.id)}`,
        footer: 'The Yes List, made in Australia.',
      });
      const ok = await sendEmail(c.env, { to: p.email, subject: `List ${p.business} free on The Yes List`, ...m, ...(site.supportEmail ? { replyTo: [site.supportEmail] } : {}) });
      if (ok) {
        sent++;
        p.status = 'invited';
        p.invitedAt = new Date().toISOString();
      } else skipped.push(p.business);
    }
    await writeSetting(c.env.DB, 'prospects', all);
    await logCompany(c, 'company.vendor.invite', `${sent} invited`, { sent, skipped: skipped.length });
    return c.json({ sent, skipped });
  });

  /** What the team did, newest first: plans, payments, links, feedback, settings, the team. */
  app.get('/activity', can('activity'), async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT a.id, a.action, a.target, a.detail, a.at, COALESCE(u.first_name, u.name, u.email, '') AS who, COALESCE(w.name1 || ' & ' || w.name2, '') AS names
         FROM audit a LEFT JOIN user u ON u.id = a.user_id LEFT JOIN wedding w ON w.id = a.wedding_id
        WHERE a.action LIKE 'company.%' OR a.action IN ('plan.paid', 'plan.refund')
        ORDER BY a.at DESC LIMIT 200`,
    ).all<{ id: string; action: string; target: string | null; detail: string | null; at: string; who: string; names: string }>();
    return c.json({ activity: results.map((r) => ({ id: r.id, action: r.action, target: r.target ?? '', detail: r.detail ?? '', at: r.at, who: r.action === 'plan.paid' && !r.who ? 'Card payment' : r.who, names: r.names })) });
  });

  /** The directory's vendor listings, newest first, hidden ones included. */
  app.get('/listings', can('vendors'), async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT l.id, l.slug, l.name, l.category, l.region, l.email, l.hidden, l.created_at,
              (SELECT COUNT(*) FROM vendor_enquiry e WHERE e.listing_id = l.id) AS enquiries
         FROM vendor_listing l ORDER BY l.created_at DESC LIMIT 300`,
    ).all<{ id: string; slug: string; name: string; category: string; region: string; email: string; hidden: number; created_at: string; enquiries: number }>();
    const [codes, uses] = await Promise.all([readSetting(c.env.DB, 'promos', Promos), promoUses(c.env.DB)]);
    const codeOf = new Map(codes.codes.filter((p) => p.note.startsWith('vendor:')).map((p) => [p.note.slice(7), p.code]));
    return c.json({ listings: results.map((r) => ({ ...r, hidden: !!r.hidden, code: codeOf.get(r.id) ?? '', codeUses: uses[codeOf.get(r.id) ?? ''] ?? 0 })) });
  });
  app.put('/listings/:id', can('vendors'), async (c) => {
    const b = z.object({ hidden: z.boolean() }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Hidden or not?');
    const r = await c.env.DB.prepare(`UPDATE vendor_listing SET hidden = ?, updated_at = ? WHERE id = ?`).bind(b.data.hidden ? 1 : 0, new Date().toISOString(), c.req.param('id')).run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'Listing not found.');
    await logCompany(c, b.data.hidden ? 'company.vendor.hide' : 'company.vendor.show', c.req.param('id'), {});
    return c.json({ ok: true });
  });

  app.get('/settings', can('settings', 'promote'), async (c) => c.json(await readSetting(c.env.DB, 'site', SiteSettings)));
  /** The front-page banner on its own, for marketing (who can't change the rest of the settings). */
  app.put('/banner', can('promote'), async (c) => {
    const b = SiteSettings.shape.banner.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Please check the banner.');
    if (b.data.link && !/^(https:\/\/|\/)/.test(b.data.link)) return err(c, 400, 'invalid', 'Links start with https:// or /.');
    const site = { ...(await readSetting(c.env.DB, 'site', SiteSettings)), banner: b.data };
    await writeSetting(c.env.DB, 'site', site);
    await logCompany(c, 'company.banner', 'site', { on: b.data.on });
    return c.json(site);
  });
  app.put('/settings', can('settings'), async (c) => {
    const b = SiteSettings.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check the settings.');
    const bad = [...Object.values(b.data.social), ...Object.values(b.data.paymentLinks)].find((u) => u && !/^https:\/\//.test(u)) ?? (b.data.banner.link && !/^(https:\/\/|\/)/.test(b.data.banner.link) ? b.data.banner.link : '');
    if (bad) return err(c, 400, 'invalid', `Links start with https:// (check ${bad.slice(0, 60)}).`);
    await writeSetting(c.env.DB, 'site', b.data);
    await logCompany(c, 'company.settings', 'site', {});
    return c.json(b.data);
  });

  app.get('/promos', can('promote'), async (c) => {
    const [all, uses] = await Promise.all([readSetting(c.env.DB, 'promos', Promos), promoUses(c.env.DB)]);
    return c.json({ codes: all.codes.map((p) => ({ ...p, used: uses[p.code] ?? 0 })) });
  });
  app.put('/promos', can('promote'), async (c) => {
    const raw = (await readJson(c.req.raw)) as { codes?: unknown[] } | null;
    // `used` comes back from the list; it's counted from payments, never stored.
    const codes = Array.isArray(raw?.codes) ? raw.codes.map((x) => (x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'used')) : x)) : null;
    const b = Promos.safeParse({ codes });
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check the codes.');
    if (new Set(b.data.codes.map((p) => p.code)).size !== b.data.codes.length) return err(c, 400, 'invalid', 'Each code can only be listed once.');
    await writeSetting(c.env.DB, 'promos', b.data);
    await logCompany(c, 'company.promos', 'promos', { codes: b.data.codes.map((x) => x.code) });
    const uses = await promoUses(c.env.DB);
    return c.json({ codes: b.data.codes.map((p) => ({ ...p, used: uses[p.code] ?? 0 })) });
  });

  /** Who said yes to news (at sign-up): name, email, wedding date and plan, as CSV for a mailing tool. */
  app.get('/optins.csv', can('promote'), async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT u.first_name, u.email, u.created_at,
              (SELECT w.plan FROM membership m JOIN wedding w ON w.id = m.wedding_id WHERE m.user_id = u.id AND w.deleted_at IS NULL LIMIT 1) AS plan,
              (SELECT MIN(e.starts_at) FROM membership m JOIN event e ON e.wedding_id = m.wedding_id WHERE m.user_id = u.id AND e.deleted_at IS NULL) AS day
         FROM user u WHERE u.marketing_opt_in = 1 ORDER BY u.created_at DESC`,
    ).all<{ first_name: string | null; email: string; created_at: string; plan: string | null; day: string | null }>();
    // A leading = + - @ would run as a formula in a spreadsheet: a ' keeps it text.
    const cell = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
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
  app.get('/unsubscribe', async (c) => {
    const ok = await stopProspect(c.env, c.req.query('p') ?? '');
    return c.html(
      `<!doctype html><meta name="viewport" content="width=device-width"><title>The Yes List</title><body style="font-family:Georgia,serif;max-width:480px;margin:60px auto;padding:0 16px;color:#33402f"><h1 style="font-weight:normal">${ok ? 'Done: we won’t email you again.' : 'That link didn’t work.'}</h1><p>${ok ? 'Sorry to have bothered you.' : 'Reply to the email and we’ll take you off by hand.'}</p></body>`,
    );
  });
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

/** Only staff whose role can do one of these. */
const can =
  (...perms: StaffPerm[]): MiddlewareHandler<AdminEnv> =>
  async (c, next) => {
    if (!perms.some((p) => c.get('user').perms.includes(p))) return err(c as C, 403, 'forbidden', 'Your role can’t do that. Ask an owner.');
    await next();
  };

/** Notes a company action, with who did it (the Activity tab). */
async function logCompany(c: C, action: string, target: string, detail: unknown, weddingId: string | null = null) {
  await c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), weddingId, c.get('user').id, action, target, JSON.stringify(detail), new Date().toISOString())
    .run();
}

/** Everyone on the team: the staff table, and the founder's account (SUPER_ADMINS) as an owner. */
async function staffList(env: Env): Promise<{ id: string; name: string; email: string; role: string; roleName: string; founder: boolean; since: string; lastIn: string }[]> {
  const founders = [...superAdmins(env)];
  const { results } = await env.DB.prepare(
    `SELECT u.id, COALESCE(u.first_name, u.name, '') AS name, u.email, COALESCE(st.role, 'owner') AS role, COALESCE(st.created_at, u.created_at) AS since, COALESCE(u.last_login_at, '') AS last_in
       FROM user u LEFT JOIN staff st ON st.user_id = u.id
      WHERE st.user_id IS NOT NULL OR lower(u.email) IN (SELECT value FROM json_each(?))
      ORDER BY since`,
  )
    .bind(JSON.stringify(founders))
    .all<{ id: string; name: string; email: string; role: string; since: string; last_in: string }>();
  const made = await customRoles(env.DB);
  return results.map((r) => {
    const founder = founders.includes(r.email.toLowerCase());
    const role = founder ? 'owner' : r.role;
    return { id: r.id, name: r.name || r.email, email: r.email, role, roleName: roleName(role, made), founder, since: r.since, lastIn: r.last_in };
  });
}

/**
 * Joining the team from an invitation (/company/join?t=…), mounted at /a/staff-join. No account yet: their
 * name and a passcode make one. Already have one (a couple's, say): their passcode signs them in. Either
 * way they're signed in, with their role.
 */
export function staffJoinRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly);
  const open = async (c: C) => {
    if (!c.env.SESSION_SECRET) return null;
    return c.env.DB.prepare(`SELECT id, email, role FROM staff_invite WHERE hash = ? AND expires_at > ?`)
      .bind(await sessionId(c.req.param('token') ?? '', c.env.SESSION_SECRET), new Date().toISOString())
      .first<{ id: string; email: string; role: string }>();
  };
  app.get('/:token', async (c) => {
    if (!(await allow(c.env.DB, `sjoin:${c.req.header('CF-Connecting-IP') ?? 'local'}`, 30, 15 * 60_000))) return err(c, 429, 'slow_down', 'Too many tries. Wait 15 minutes.');
    const inv = await open(c);
    if (!inv) return err(c, 404, 'not_found', 'This invitation has expired or was already used. Ask for a new one.');
    const has = await c.env.DB.prepare(`SELECT 1 FROM user WHERE email = ?`).bind(inv.email).first();
    return c.json({ email: inv.email, role: inv.role, roleName: roleName(inv.role, await customRoles(c.env.DB)), hasAccount: !!has });
  });
  app.post('/:token', async (c) => {
    if (!(await allow(c.env.DB, `sjoin:${c.req.header('CF-Connecting-IP') ?? 'local'}`, 30, 15 * 60_000))) return err(c, 429, 'slow_down', 'Too many tries. Wait 15 minutes.');
    const b = z.object({ passcode: z.string().min(1).max(200), firstName: z.string().trim().max(60).default('') }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Your passcode, please.');
    const inv = await open(c);
    if (!inv) return err(c, 404, 'not_found', 'This invitation has expired or was already used. Ask for a new one.');
    const now = new Date().toISOString();
    let user = await c.env.DB.prepare(`SELECT id, email, pass_hash FROM user WHERE email = ?`).bind(inv.email).first<{ id: string; email: string; pass_hash: string | null }>();
    if (user) {
      if (!(await verifyPasscode(b.data.passcode, user.pass_hash))) return err(c, 400, 'bad_passcode', 'That passcode isn’t right for this email.');
    } else {
      if (!b.data.firstName) return err(c, 400, 'invalid', 'Your first name, please.');
      const weak = passcodeProblem(b.data.passcode);
      if (weak) return err(c, 400, 'weak_passcode', weak);
      const id = crypto.randomUUID();
      await c.env.DB.prepare(`INSERT INTO user (id, email, name, pass_hash, first_name, marketing_opt_in, marketing_opt_in_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`)
        .bind(id, inv.email, b.data.firstName, await hashPasscode(b.data.passcode), b.data.firstName, now, now, now)
        .run();
      user = { id, email: inv.email, pass_hash: null };
    }
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO staff (user_id, role, added_by, created_at) VALUES (?1, ?2, NULL, ?3) ON CONFLICT (user_id) DO UPDATE SET role = ?2`).bind(user.id, inv.role, now),
      c.env.DB.prepare(`DELETE FROM staff_invite WHERE id = ?`).bind(inv.id),
      c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, NULL, ?, 'company.team.join', ?, ?, ?)`).bind(crypto.randomUUID(), user.id, inv.email, JSON.stringify({ role: inv.role }), now),
    ]);
    return c.json(await signIn(c, { id: user.id, email: user.email }));
  });
  return app;
}

/** A payment's audit detail, or {} if it can't be read. */
function safeDetail(s: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(s);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** True for a built-in role or a made role that exists. */
async function roleExists(env: Env, role: string): Promise<boolean> {
  if (isBuiltInRole(role)) return true;
  return role.startsWith('custom:') && (await customRoles(env.DB)).some((r) => `custom:${r.id}` === role);
}

/** A vendor's partner code (10% off for their couples), made once and kept in the promo codes. */
export async function ensureVendorCode(db: D1Database, listingId: string, name: string): Promise<string> {
  const all = await readSetting(db, 'promos', Promos);
  const had = all.codes.find((p) => p.note === `vendor:${listingId}`);
  if (had) return had.code;
  let code = vendorCode(name);
  for (let n = 2; all.codes.some((p) => p.code === code); n++) code = `${vendorCode(name).replace(/10$/, '')}${n}10`.slice(0, 24);
  if (all.codes.length >= 200) return '';
  await writeSetting(db, 'promos', { codes: [...all.codes, Promo.parse({ code, percentOff: 10, note: `vendor:${listingId}`, on: true })] });
  return code;
}

/** Vendor invitations' "don't email me again" link (public, signed). */
export async function stopProspect(env: Env, token: string): Promise<boolean> {
  const [id, sig] = token.split('.');
  if (!id || !sig || !env.SESSION_SECRET) return false;
  if ((await sessionId(`vendor-stop:${id}`, env.SESSION_SECRET)).slice(0, 16) !== sig) return false;
  const all = await readSetting(env.DB, 'prospects', VendorProspects);
  const p = all.list.find((x) => x.id === id);
  if (!p) return false;
  p.status = 'stopped';
  await writeSetting(env.DB, 'prospects', all);
  return true;
}
