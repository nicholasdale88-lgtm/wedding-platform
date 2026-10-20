import { zonedToUtc } from '@wp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { hashPasscode, passcodeProblem } from '../lib/auth';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { mainAccountOf } from './accounts';
import { jsonWritesOnly, requireMember, requireUser, signIn, type AdminEnv } from './auth';

/**
 * Sign up from the front page (/api/a/signup): a couple makes their account and their wedding in one
 * go and lands in it, signed in. The plan they picked is noted (paying comes later, from inside), and
 * nothing is sent anywhere: texts only go once they set texting up themselves.
 */

export const PLANS = ['free', 'essentials', 'complete'] as const;

const Signup = z
  .object({
    firstName: z.string().trim().min(1, 'Add your first name.').max(60),
    partnerName: z.string().trim().min(1, "Add your partner's first name.").max(60),
    email: z.string().trim().toLowerCase().email('Check your email address.').max(200),
    passcode: z.string().max(200),
    date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(''),
    plan: z.enum(PLANS).default('free'),
    marketing: z.boolean().default(false),
    /** Left empty by people; filled in by bots. */
    website: z.string().max(200).default(''),
  })
  .strict();

const slugPart = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'us';

export function signupRoutes() {
  const app = new Hono<AdminEnv>();

  app.post('/', async (c) => {
    const err = (status: 400 | 409 | 429 | 500, code: string, message: string) => c.json({ error: { code, message } }, status);
    if (!c.env.SESSION_SECRET) return err(500, 'not_configured', 'Sign-up is not set up yet.');
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await allow(c.env.DB, `signup:${ip}`, 5, 3_600_000))) return err(429, 'slow_down', 'Too many sign-ups from here. Try again in an hour.');
    const parsed = Signup.safeParse(await readJson(c.req.raw));
    if (!parsed.success) return err(400, 'invalid', parsed.error.issues[0]?.message ?? 'Please check the form.');
    const b = parsed.data;
    if (b.website) return c.json({ ok: true }); // a bot: looks fine to it, makes nothing
    const weak = passcodeProblem(b.passcode);
    if (weak) return err(400, 'weak_passcode', weak);
    const db = c.env.DB;
    if (await db.prepare(`SELECT 1 FROM user WHERE email = ?`).bind(b.email).first()) {
      return err(409, 'exists', 'There is already an account with that email. Sign in instead.');
    }
    const tz = 'Australia/Sydney';
    // The wedding's address: "alex-and-sam", made unique.
    const base = `${slugPart(b.firstName)}-and-${slugPart(b.partnerName)}`;
    const { results: taken } = await db.prepare(`SELECT slug FROM wedding WHERE slug = ? OR slug LIKE ?`).bind(base, `${base}-%`).all<{ slug: string }>();
    const used = new Set(taken.map((r) => r.slug));
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const weddingId = crypto.randomUUID();
    // The wedding day at 3pm where they are (they set the real time in Setup).
    const startsAt = b.date ? zonedToUtc(`${b.date}T15:00`, tz).toISOString() : zonedToUtc(`${new Date().getUTCFullYear() + 1}-01-01T15:00`, tz).toISOString();
    const monogram = `${b.firstName.charAt(0).toUpperCase()}&${b.partnerName.charAt(0).toUpperCase()}`;
    // Private from the start: their pages open only with each guest's own link.
    // The person signing up is the main account: the plan and billing are theirs (partners join as owners).
    const content = JSON.stringify({ private: true, planChosen: b.plan, planChosenAt: now, mainAccount: userId, ...(b.date ? {} : { dateToBeSet: true }) });
    const stmts: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO user (id, email, name, pass_hash, first_name, marketing_opt_in, marketing_opt_in_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        userId, b.email, b.firstName, await hashPasscode(b.passcode), b.firstName, b.marketing ? 1 : 0, now, now, now,
      ),
      db.prepare(`INSERT INTO wedding (id, slug, name1, name2, monogram, timezone, content, plan, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'free', ?, ?)`).bind(
        weddingId, slug, b.firstName, b.partnerName, monogram, tz, content, now, now,
      ),
      db.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES (?, ?, 'owner')`).bind(weddingId, userId),
      db.prepare(`INSERT INTO event (id, wedding_id, key, name, pending_label, starts_at, sort) VALUES (?, ?, 'wedding', 'The wedding', 'the wedding', ?, 0)`).bind(crypto.randomUUID(), weddingId, startsAt),
      db.prepare(`INSERT INTO consent_log (id, user_id, kind, granted, source, at) VALUES (?, ?, 'marketing', ?, 'signup', ?)`).bind(crypto.randomUUID(), userId, b.marketing ? 1 : 0, now),
      db.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'account.signup', ?, ?, ?)`).bind(crypto.randomUUID(), weddingId, userId, weddingId, JSON.stringify({ plan: b.plan }), now),
    ];
    try {
      await db.batch(stmts);
    } catch {
      // Two sign-ups with the same email (or address) at once: the second is told to sign in.
      return err(409, 'exists', 'There is already an account with that email. Sign in instead.');
    }
    const me = await signIn(c, { id: userId, email: b.email });
    return c.json({ ...me, weddingId });
  });

  return app;
}

/**
 * Plans from inside the admin. A couple asks to upgrade (Account → Settings → Your plan): it's noted, and
 * the platform owner sends a payment link. The platform owner (a super admin) sets the plan once paid.
 */
export function planRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('/w/:wid/plan/*', jsonWritesOnly);
  app.use('/super/*', jsonWritesOnly);
  app.use('/w/:wid/privacy', jsonWritesOnly);
  app.post('/w/:wid/plan/request', requireUser, requireMember('owner'), async (c) => {
    if (c.get('user').id !== (await mainAccountOf(c.env.DB, c.req.param('wid')))) {
      return c.json({ error: { code: 'main_account', message: 'Only the main account (payments) can change the plan. Ask them, or see Settings → Who can sign in.' } }, 403);
    }
    const b = z.object({ plan: z.enum(['essentials', 'complete']) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return c.json({ error: { code: 'invalid', message: 'Choose a plan.' } }, 400);
    const at = new Date().toISOString();
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE wedding SET content = json_set(content, '$.planRequested', ?, '$.planRequestedAt', ?) WHERE id = ? AND json_valid(content)`).bind(b.data.plan, at, c.req.param('wid')),
      c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'plan.request', ?, ?, ?)`).bind(crypto.randomUUID(), c.req.param('wid'), c.get('user').id, c.req.param('wid'), JSON.stringify({ plan: b.data.plan }), at),
    ]);
    return c.json({ ok: true, requested: b.data.plan });
  });

  /** Private (pages only with a guest's own link) or not. */
  app.put('/w/:wid/privacy', requireUser, requireMember('owner'), async (c) => {
    const b = z.object({ private: z.boolean() }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return c.json({ error: { code: 'invalid', message: 'On or off?' } }, 400);
    await c.env.DB.prepare(`UPDATE wedding SET content = json_set(content, '$.private', json(?)) WHERE id = ? AND json_valid(content)`).bind(b.data.private ? 'true' : 'false', c.req.param('wid')).run();
    return c.json({ ok: true, private: b.data.private });
  });

  /** Super admins only: set a wedding's plan (after payment), by its address. */
  app.put('/super/plan', requireUser, async (c) => {
    if (!c.get('user').superAdmin) return c.json({ error: { code: 'forbidden', message: 'Not allowed.' } }, 403);
    const b = z.object({ slug: z.string().max(80), plan: z.enum(PLANS) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return c.json({ error: { code: 'invalid', message: 'A wedding address and a plan, please.' } }, 400);
    const r = await c.env.DB.prepare(`UPDATE wedding SET plan = ?, content = json_remove(content, '$.planRequested', '$.planRequestedAt'), updated_at = ? WHERE slug = ? AND deleted_at IS NULL AND json_valid(content)`)
      .bind(b.data.plan, new Date().toISOString(), b.data.slug)
      .run();
    if (!r.meta.changes) return c.json({ error: { code: 'not_found', message: 'No wedding at that address.' } }, 404);
    return c.json({ ok: true });
  });
  return app;
}
