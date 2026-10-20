import { toE164 } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { hashPasscode, newSessionToken, passcodeProblem, sessionId, verifyPasscode } from '../lib/auth';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, signIn, type AdminEnv, type Role } from './auth';

/**
 * Customer accounts (Settings → Your details, People). The signed-in person's own details, kept the way a
 * CRM will want them (user.id is the stable customer id; every marketing choice is logged with its time),
 * and the people who run each wedding: owners invite a partner, planner or viewer by a link that sets
 * their passcode (or adds the wedding to an account they already have).
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 401 | 403 | 404 | 409 | 410 | 429, code: string, message: string) => c.json({ error: { code, message } }, status);
const now = () => new Date().toISOString();
const INVITE_DAYS = 14;
const STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA', 'Overseas'] as const;
const HEARD = ['Instagram', 'TikTok', 'Facebook', 'Google', 'A friend', 'Our venue', 'A wedding expo', 'Other'] as const;

const opt = (n: number) => z.string().trim().max(n);
const Profile = z
  .object({
    firstName: opt(60),
    lastName: opt(60),
    mobile: opt(30),
    state: z.union([z.literal(''), z.enum(STATES)]),
    postcode: z.string().trim().regex(/^(\d{4})?$/, 'Postcode is four digits.'),
    heardFrom: z.union([z.literal(''), z.enum(HEARD)]),
    marketingOptIn: z.boolean(),
  })
  .partial()
  .strict();

interface UserRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  mobile: string | null;
  state: string | null;
  postcode: string | null;
  heard_from: string | null;
  marketing_opt_in: number;
  marketing_opt_in_at: string | null;
  created_at: string;
  last_login_at: string | null;
}
const profileOf = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  firstName: u.first_name ?? '',
  lastName: u.last_name ?? '',
  mobile: u.mobile ?? '',
  state: u.state ?? '',
  postcode: u.postcode ?? '',
  heardFrom: u.heard_from ?? '',
  marketing: { optIn: !!u.marketing_opt_in, at: u.marketing_opt_in_at },
  createdAt: u.created_at,
  lastLoginAt: u.last_login_at,
});
const loadUser = (c: C, id: string) =>
  c.env.DB.prepare(
    `SELECT id, email, first_name, last_name, mobile, state, postcode, heard_from, marketing_opt_in, marketing_opt_in_at, created_at, last_login_at FROM user WHERE id = ?`,
  )
    .bind(id)
    .first<UserRow>();
const consent = (c: C, userId: string, granted: boolean, source: string) =>
  c.env.DB.prepare(`INSERT INTO consent_log (id, user_id, kind, granted, source, at) VALUES (?, ?, 'marketing', ?, ?, ?)`).bind(crypto.randomUUID(), userId, granted ? 1 : 0, source, now());
const inviteHash = (c: C, token: string) => sessionId(`invite:${token}`, c.env.SESSION_SECRET!);
const base = (c: C) => (c.env.PUBLIC_BASE_URL ?? new URL(c.req.url).origin).replace(/\/+$/, '');

/** /api/a/me/... and /api/a/invite/... */
export function accountRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly);

  app.get('/me/profile', requireUser, async (c) => {
    const u = await loadUser(c, c.get('user').id);
    return u ? c.json({ profile: profileOf(u), states: STATES, heardFrom: HEARD }) : err(c, 404, 'not_found', 'Account not found.');
  });

  app.put('/me/profile', requireUser, async (c) => {
    const body = Profile.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', body.error.issues[0]?.message ?? 'Check your details.');
    const id = c.get('user').id;
    const cur = await loadUser(c, id);
    if (!cur) return err(c, 404, 'not_found', 'Account not found.');
    const d = body.data;
    let mobile = cur.mobile;
    if (d.mobile !== undefined) {
      mobile = d.mobile ? toE164(d.mobile) : null;
      if (d.mobile && !mobile) return err(c, 400, 'invalid', 'That mobile number doesn’t look right.');
    }
    const optInChanged = d.marketingOptIn !== undefined && d.marketingOptIn !== !!cur.marketing_opt_in;
    const stamp = now();
    const stmts = [
      c.env.DB.prepare(
        `UPDATE user SET first_name = ?, last_name = ?, name = ?, mobile = ?, state = ?, postcode = ?, heard_from = ?, marketing_opt_in = ?, marketing_opt_in_at = ?, updated_at = ? WHERE id = ?`,
      ).bind(
        d.firstName ?? cur.first_name,
        d.lastName ?? cur.last_name,
        [d.firstName ?? cur.first_name, d.lastName ?? cur.last_name].filter(Boolean).join(' ') || null,
        mobile,
        d.state === undefined ? cur.state : d.state || null,
        d.postcode === undefined ? cur.postcode : d.postcode || null,
        d.heardFrom === undefined ? cur.heard_from : d.heardFrom || null,
        (d.marketingOptIn ?? !!cur.marketing_opt_in) ? 1 : 0,
        optInChanged ? stamp : cur.marketing_opt_in_at,
        stamp,
        id,
      ),
    ];
    if (optInChanged) stmts.push(consent(c, id, d.marketingOptIn!, 'profile'));
    await c.env.DB.batch(stmts);
    return c.json({ profile: profileOf((await loadUser(c, id))!) });
  });

  /** Change your sign-in email: needs your passcode; the new address must not belong to another account. */
  app.post('/me/email', requireUser, async (c) => {
    const body = z.object({ email: z.string().trim().toLowerCase().email().max(200), passcode: z.string().min(1).max(200) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Enter the new email and your passcode.');
    const user = c.get('user');
    if (!(await allow(c.env.DB, `email:${user.id}`, 5, 15 * 60_000))) return err(c, 429, 'slow_down', 'Too many tries. Wait 15 minutes and try again.');
    const row = await c.env.DB.prepare(`SELECT pass_hash FROM user WHERE id = ?`).bind(user.id).first<{ pass_hash: string | null }>();
    if (!(await verifyPasscode(body.data.passcode, row?.pass_hash ?? null))) return err(c, 400, 'bad_passcode', 'Your passcode is not right.');
    const taken = await c.env.DB.prepare(`SELECT 1 FROM user WHERE email = ? AND id != ?`).bind(body.data.email, user.id).first();
    if (taken) return err(c, 409, 'taken', 'That email already has an account.');
    await c.env.DB.prepare(`UPDATE user SET email = ?, updated_at = ? WHERE id = ?`).bind(body.data.email, now(), user.id).run();
    return c.json({ ok: true, email: body.data.email });
  });

  /** An invite link: which wedding, as what, and whether that email already has an account (sign in) or not (set up). */
  app.get('/invite/:token', async (c) => {
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await allow(c.env.DB, `invite:ip:${ip}`, 60, 15 * 60_000))) return err(c, 429, 'slow_down', 'Too many tries. Wait 15 minutes and try again.');
    if (!c.env.SESSION_SECRET) return err(c, 410, 'gone', 'This invitation has expired or was already used.');
    const inv = await openInvite(c, c.req.param('token'));
    if (!inv) return err(c, 410, 'gone', 'This invitation has expired or was already used. Ask for a new link.');
    const existing = await c.env.DB.prepare(`SELECT 1 FROM user WHERE email = ?`).bind(inv.email).first();
    return c.json({ email: inv.email, role: inv.role, couple: `${first(inv.name1)} & ${first(inv.name2)}`, hasAccount: !!existing });
  });

  /** Accept: a new account (names and a passcode) or an existing one (its passcode); then signed in. */
  app.post('/invite/:token', async (c) => {
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await allow(c.env.DB, `invite:ip:${ip}`, 60, 15 * 60_000))) return err(c, 429, 'slow_down', 'Too many tries. Wait 15 minutes and try again.');
    if (!c.env.SESSION_SECRET) return err(c, 410, 'gone', 'This invitation has expired or was already used.');
    const body = z
      .object({ passcode: z.string().min(1).max(200), firstName: opt(60).optional(), lastName: opt(60).optional(), marketingOptIn: z.boolean().optional() })
      .strict()
      .safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Enter a passcode.');
    const inv = await openInvite(c, c.req.param('token'));
    if (!inv) return err(c, 410, 'gone', 'This invitation has expired or was already used. Ask for a new link.');
    let user = await c.env.DB.prepare(`SELECT id, email, pass_hash FROM user WHERE email = ?`).bind(inv.email).first<{ id: string; email: string; pass_hash: string | null }>();
    const stmts: D1PreparedStatement[] = [];
    const stamp = now();
    if (user) {
      if (!(await allow(c.env.DB, `invite:${inv.id}`, 10, 15 * 60_000))) return err(c, 429, 'slow_down', 'Too many tries. Wait 15 minutes and try again.');
      if (!(await verifyPasscode(body.data.passcode, user.pass_hash))) return err(c, 400, 'bad_passcode', 'That passcode is not right for this email.');
    } else {
      const problem = passcodeProblem(body.data.passcode);
      if (problem) return err(c, 400, 'weak', problem);
      if (!body.data.firstName) return err(c, 400, 'invalid', 'Enter your first name.');
      user = { id: crypto.randomUUID(), email: inv.email, pass_hash: null };
      const optIn = !!body.data.marketingOptIn;
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO user (id, email, name, pass_hash, first_name, last_name, marketing_opt_in, marketing_opt_in_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(user.id, inv.email, [body.data.firstName, body.data.lastName].filter(Boolean).join(' '), await hashPasscode(body.data.passcode), body.data.firstName, body.data.lastName || null, optIn ? 1 : 0, stamp, stamp, stamp),
        consent(c, user.id, optIn, 'invite'),
      );
    }
    // Used once: claim it first, so two tabs can't both join.
    const claim = await c.env.DB.prepare(`UPDATE member_invite SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL`).bind(stamp, inv.id).run();
    if (!claim.meta.changes) return err(c, 410, 'gone', 'This invitation was already used.');
    stmts.push(
      c.env.DB.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT (wedding_id, user_id) DO UPDATE SET role = CASE WHEN membership.role = 'owner' THEN 'owner' ELSE excluded.role END`).bind(
        inv.wedding_id,
        user.id,
        inv.role,
      ),
    );
    await c.env.DB.batch(stmts);
    return c.json(await signIn(c, user));
  });

  return app;
}

const first = (n: string) => n.trim().split(/\s+/)[0] ?? n;

async function openInvite(c: C, token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return c.env.DB.prepare(
    `SELECT i.id, i.wedding_id, i.email, i.role, w.name1, w.name2 FROM member_invite i JOIN wedding w ON w.id = i.wedding_id AND w.deleted_at IS NULL
      WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.expires_at > ?`,
  )
    .bind(await inviteHash(c, token), now())
    .first<{ id: string; wedding_id: string; email: string; role: Role; name1: string; name2: string }>();
}

/** /api/a/w/:wid/members: who runs this wedding, and (owners) inviting and managing them. */
export function memberRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const owner = requireMember('owner');
  const wid = (c: C) => c.req.param('wid')!;

  app.get('/', async (c) => {
    const { results: members } = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.name, u.last_login_at, m.role FROM membership m JOIN user u ON u.id = m.user_id WHERE m.wedding_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, u.created_at`,
    )
      .bind(wid(c))
      .all<{ id: string; email: string; first_name: string | null; last_name: string | null; name: string | null; last_login_at: string | null; role: Role }>();
    const self = c.get('user').id;
    const isOwner = c.get('role') === 'owner';
    const invites = isOwner
      ? (
          await c.env.DB.prepare(`SELECT id, email, role, expires_at FROM member_invite WHERE wedding_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY created_at DESC`)
            .bind(wid(c), now())
            .all<{ id: string; email: string; role: Role; expires_at: string }>()
        ).results.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at }))
      : [];
    return c.json({
      you: { id: self, role: c.get('role') },
      members: members.map((m) => ({
        id: m.id,
        // A viewer sees who's who, not everyone's email.
        email: isOwner || m.id === self ? m.email : '',
        name: [m.first_name, m.last_name].filter(Boolean).join(' ') || m.name || '',
        role: m.role,
        lastLoginAt: isOwner ? m.last_login_at : null,
      })),
      invites,
    });
  });

  app.post('/invite', owner, async (c) => {
    const body = z.object({ email: z.string().trim().toLowerCase().email().max(200), role: z.enum(['owner', 'editor', 'viewer']) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Enter their email and choose what they can do.');
    if (!c.env.SESSION_SECRET) return err(c, 400, 'invalid', 'Sign-in is not set up yet.');
    if (!(await allow(c.env.DB, `member-invite:${wid(c)}`, 30, 24 * 3_600_000))) return err(c, 429, 'slow_down', 'That’s a lot of invitations today. Try again tomorrow.');
    const already = await c.env.DB.prepare(`SELECT 1 FROM membership m JOIN user u ON u.id = m.user_id WHERE m.wedding_id = ? AND u.email = ?`).bind(wid(c), body.data.email).first();
    if (already) return err(c, 409, 'member', 'They can already sign in to this wedding.');
    const token = newSessionToken();
    const expires = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();
    await c.env.DB.batch([
      // One live invitation per email: a new link replaces the old one.
      c.env.DB.prepare(`DELETE FROM member_invite WHERE wedding_id = ? AND email = ? AND accepted_at IS NULL`).bind(wid(c), body.data.email),
      c.env.DB.prepare(`INSERT INTO member_invite (id, wedding_id, email, role, token_hash, invited_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(),
        wid(c),
        body.data.email,
        body.data.role,
        await inviteHash(c, token),
        c.get('user').id,
        expires,
        now(),
      ),
    ]);
    return c.json({ link: `${base(c)}/admin/join?t=${token}`, expiresAt: expires });
  });

  app.delete('/invites/:id', owner, async (c) => {
    await c.env.DB.prepare(`DELETE FROM member_invite WHERE id = ? AND wedding_id = ? AND accepted_at IS NULL`).bind(c.req.param('id'), wid(c)).run();
    return c.json({ ok: true });
  });

  /** Change what someone can do. A wedding always keeps at least one owner. */
  app.patch('/:uid', owner, async (c) => {
    const body = z.object({ role: z.enum(['owner', 'editor', 'viewer']) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Choose what they can do.');
    const uid = c.req.param('uid');
    if (body.data.role !== 'owner' && (await lastOwner(c, uid))) return err(c, 409, 'last_owner', 'Someone else must be an owner first.');
    const r = await c.env.DB.prepare(`UPDATE membership SET role = ? WHERE wedding_id = ? AND user_id = ?`).bind(body.data.role, wid(c), uid).run();
    return r.meta.changes ? c.json({ ok: true }) : err(c, 404, 'not_found', 'They aren’t part of this wedding.');
  });

  /** Remove someone (owners), or leave yourself. Never the last owner. */
  app.delete('/:uid', async (c) => {
    const uid = c.req.param('uid');
    if (uid !== c.get('user').id && c.get('role') !== 'owner') return err(c, 403, 'forbidden', "Your role can't do that.");
    if (await lastOwner(c, uid)) return err(c, 409, 'last_owner', 'Someone else must be an owner first.');
    const r = await c.env.DB.prepare(`DELETE FROM membership WHERE wedding_id = ? AND user_id = ?`).bind(wid(c), uid).run();
    return r.meta.changes ? c.json({ ok: true }) : err(c, 404, 'not_found', 'They aren’t part of this wedding.');
  });

  async function lastOwner(c: C, uid: string) {
    const row = await c.env.DB.prepare(
      `SELECT (SELECT role FROM membership WHERE wedding_id = ?1 AND user_id = ?2) AS role, (SELECT COUNT(*) FROM membership WHERE wedding_id = ?1 AND role = 'owner') AS owners`,
    )
      .bind(wid(c), uid)
      .first<{ role: Role | null; owners: number }>();
    return row?.role === 'owner' && Number(row.owners) <= 1;
  }

  return app;
}

