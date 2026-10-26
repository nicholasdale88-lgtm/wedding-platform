import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { readJson } from '../lib/security';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Env } from '../env';
import { hashPasscode, newSessionToken, passcodeProblem, SESSION_COOKIE, SESSION_DAYS, sessionId, verifyPasscode } from '../lib/auth';
import { allow } from '../lib/rateLimit';
import { buttonEmail, emailReady, sendEmail } from '../lib/email';

export type Role = 'owner' | 'editor' | 'viewer';
export interface SessionUser {
  id: string;
  email: string;
  superAdmin: boolean;
}
export type AdminEnv = { Bindings: Env; Variables: { user: SessionUser; role: Role } };

const err = (c: Context, status: 400 | 401 | 403 | 404 | 415 | 429 | 500, code: string, message: string) =>
  c.json({ error: { code, message } }, status);

const Login = z.object({ email: z.string().trim().toLowerCase().email().max(200), passcode: z.string().min(1).max(200) });

const superAdmins = (env: Env) => new Set((env.SUPER_ADMINS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));

/** Forms can't send JSON cross-site without a CORS preflight, so requiring it blocks CSRF on writes. */
export const jsonWritesOnly: MiddlewareHandler<AdminEnv> = async (c, next) => {
  // The one exception: the couple's photo upload sends the photo itself. Its custom X-Photo-Upload header
  // still forces a CORS preflight, so another site can't post here with the couple's cookie.
  const photoUpload = c.req.method === 'PUT' && c.req.header('X-Photo-Upload') === '1' && /\/a\/w\/[^/]+\/photos\/upload$/.test(new URL(c.req.url).pathname);
  if (!photoUpload && c.req.method !== 'GET' && c.req.method !== 'HEAD' && !(c.req.header('content-type') ?? '').startsWith('application/json')) {
    return err(c, 415, 'json_required', 'Send JSON.');
  }
  await next();
};

export const requireUser: MiddlewareHandler<AdminEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !c.env.SESSION_SECRET) return err(c, 401, 'signed_out', 'Please sign in.');
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email FROM session s JOIN user u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`,
  )
    .bind(await sessionId(token, c.env.SESSION_SECRET), new Date().toISOString())
    .first<{ id: string; email: string }>();
  if (!row) return err(c, 401, 'signed_out', 'Please sign in.');
  c.set('user', { ...row, superAdmin: superAdmins(c.env).has(row.email) });
  await next();
};

/** The signed-in user must belong to the wedding in :wid, with one of these roles. */
export const requireMember =
  (...roles: Role[]): MiddlewareHandler<AdminEnv> =>
  async (c, next) => {
    const row = await c.env.DB.prepare(
      `SELECT m.role FROM membership m JOIN wedding w ON w.id = m.wedding_id WHERE m.wedding_id = ? AND m.user_id = ? AND w.deleted_at IS NULL`,
    )
      .bind(c.req.param('wid') ?? '', c.get('user').id)
      .first<{ role: Role }>();
    // Same answer for "no such wedding" and "not yours", so ids can't be probed.
    if (!row) return err(c, 404, 'not_found', 'Wedding not found.');
    if (roles.length && !roles.includes(row.role)) return err(c, 403, 'forbidden', "Your role can't do that.");
    c.set('role', row.role);
    await next();
  };

export async function me(env: Env, user: SessionUser) {
  const { results } = await env.DB.prepare(
    `SELECT w.id, w.slug, w.name1, w.name2, m.role FROM membership m JOIN wedding w ON w.id = m.wedding_id
      WHERE m.user_id = ? AND w.deleted_at IS NULL ORDER BY w.created_at`,
  )
    .bind(user.id)
    .all<{ id: string; slug: string; name1: string; name2: string; role: Role }>();
  // Their vendor listing, if they have one: one sign-in reaches it too.
  const vendor = await env.DB.prepare(`SELECT slug, name FROM vendor_listing WHERE user_id = ? ORDER BY created_at LIMIT 1`)
    .bind(user.id)
    .first<{ slug: string; name: string }>()
    .catch(() => null);
  return { user: { id: user.id, email: user.email, superAdmin: user.superAdmin }, weddings: results, vendor: vendor ?? null };
}

/** Start a session for this user (a cookie with a random token; only its HMAC is stored) and note the sign-in. */
export async function signIn(c: Context<AdminEnv>, user: { id: string; email: string }) {
  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?)`).bind(await sessionId(token, c.env.SESSION_SECRET!), user.id, expires.toISOString()),
    c.env.DB.prepare(`UPDATE user SET last_login_at = ? WHERE id = ?`).bind(new Date().toISOString(), user.id),
  ]);
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', expires });
  return me(c.env, { id: user.id, email: user.email, superAdmin: superAdmins(c.env).has(user.email) });
}

export function authRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly);

  app.post('/auth/login', async (c) => {
    if (!c.env.SESSION_SECRET) return err(c, 500, 'not_configured', 'Sign-in is not set up yet (SESSION_SECRET).');
    const body = Login.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Enter your email and passcode.');
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    const fifteenMin = 15 * 60_000;
    // Per network, per network and email, and per email from anywhere (many networks guessing one account).
    const email = body.data.email.trim().toLowerCase();
    const ok =
      (await allow(c.env.DB, `login:ip:${ip}`, 30, fifteenMin)) &&
      (await allow(c.env.DB, `login:${ip}:${email}`, 10, fifteenMin)) &&
      (await allow(c.env.DB, `login:email:${email}`, 30, 60 * 60_000));
    if (!ok) return err(c, 429, 'slow_down', 'Too many tries. Wait 15 minutes and try again.');

    const user = await c.env.DB.prepare(`SELECT id, email, pass_hash FROM user WHERE email = ?`)
      .bind(body.data.email)
      .first<{ id: string; email: string; pass_hash: string | null }>();
    if (!(await verifyPasscode(body.data.passcode, user?.pass_hash ?? null)) || !user) {
      return err(c, 401, 'bad_login', "That email and passcode don't match.");
    }

    return c.json(await signIn(c, user));
  });

  app.post('/auth/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token && c.env.SESSION_SECRET) {
      await c.env.DB.prepare(`DELETE FROM session WHERE id = ?`).bind(await sessionId(token, c.env.SESSION_SECRET)).run();
    }
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
    return c.json({ ok: true });
  });

  app.get('/me', requireUser, async (c) => c.json(await me(c.env, c.get('user'))));

  /**
   * Forgot your passcode: a link to set a new one is emailed to the account (works once, for an hour).
   * The answer is the same whether or not there's an account with that email.
   */
  app.post('/auth/forgot', async (c) => {
    const body = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Enter the email you sign in with.');
    if (!c.env.SESSION_SECRET) return err(c, 500, 'not_configured', 'Sign-in is not set up yet.');
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    const email = body.data.email;
    if (!(await allow(c.env.DB, `forgot:ip:${ip}`, 10, 60 * 60_000)) || !(await allow(c.env.DB, `forgot:${email}`, 3, 60 * 60_000))) {
      return err(c, 429, 'slow_down', 'Too many tries. Wait an hour and try again.');
    }
    if (!emailReady(c.env)) return c.json({ ok: true, emailed: false });
    const user = await c.env.DB.prepare(`SELECT id FROM user WHERE email = ?`).bind(email).first<{ id: string }>();
    if (user) {
      const token = newSessionToken();
      await c.env.DB.prepare(`INSERT INTO passcode_reset (hash, user_id, expires_at) VALUES (?, ?, ?)`)
        .bind(await sessionId(`reset:${token}`, c.env.SESSION_SECRET), user.id, new Date(Date.now() + 3_600_000).toISOString())
        .run();
      const link = `${(c.env.PUBLIC_BASE_URL ?? new URL(c.req.url).origin).replace(/\/+$/, '')}/admin/reset?t=${token}`;
      const m = buttonEmail({
        heading: 'Set a new passcode',
        lines: ['Someone (hopefully you) asked to reset the passcode for your wedding admin.', 'The button works once, for the next hour.'],
        button: 'Set a new passcode',
        link,
        footer: 'Didn’t ask? You can ignore this: your passcode hasn’t changed.',
      });
      await sendEmail(c.env, { to: email, subject: 'Set a new passcode', ...m });
    }
    return c.json({ ok: true, emailed: true });
  });

  /** The emailed link: set the new passcode, sign out everywhere else, and sign in here. */
  app.post('/auth/reset', async (c) => {
    const body = z.object({ token: z.string().min(20).max(200), passcode: z.string().max(200) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success || !c.env.SESSION_SECRET) return err(c, 400, 'invalid', 'This link isn’t working. Ask for a new one.');
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await allow(c.env.DB, `reset:ip:${ip}`, 20, 60 * 60_000))) return err(c, 429, 'slow_down', 'Too many tries. Wait an hour and try again.');
    const problem = passcodeProblem(body.data.passcode);
    if (problem) return err(c, 400, 'weak', problem);
    const hash = await sessionId(`reset:${body.data.token}`, c.env.SESSION_SECRET);
    const now = new Date().toISOString();
    // Used up as it's checked, so the same link can't set the passcode twice.
    const used = await c.env.DB.prepare(`UPDATE passcode_reset SET used_at = ? WHERE hash = ? AND used_at IS NULL AND expires_at > ?`).bind(now, hash, now).run();
    if (!used.meta.changes) return err(c, 400, 'expired', 'This link has expired or was already used. Ask for a new one.');
    const row = await c.env.DB.prepare(`SELECT u.id, u.email FROM passcode_reset r JOIN user u ON u.id = r.user_id WHERE r.hash = ?`).bind(hash).first<{ id: string; email: string }>();
    if (!row) return err(c, 400, 'expired', 'This link has expired or was already used. Ask for a new one.');
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE user SET pass_hash = ? WHERE id = ?`).bind(await hashPasscode(body.data.passcode), row.id),
      c.env.DB.prepare(`DELETE FROM session WHERE user_id = ?`).bind(row.id),
      c.env.DB.prepare(`UPDATE passcode_reset SET used_at = ? WHERE user_id = ? AND used_at IS NULL`).bind(now, row.id),
    ]);
    return c.json(await signIn(c, row));
  });

  /** Change your passcode: needs the current one; every other signed-in device is signed out. */
  app.post('/auth/passcode', requireUser, async (c) => {
    const body = z.object({ current: z.string().min(1).max(200), next: z.string().max(200) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Enter your current and new passcode.');
    const user = c.get('user');
    if (!(await allow(c.env.DB, `passcode:${user.id}`, 5, 15 * 60_000))) return err(c, 429, 'slow_down', 'Too many tries. Wait 15 minutes and try again.');
    const row = await c.env.DB.prepare(`SELECT pass_hash FROM user WHERE id = ?`).bind(user.id).first<{ pass_hash: string | null }>();
    if (!(await verifyPasscode(body.data.current, row?.pass_hash ?? null))) return err(c, 400, 'bad_passcode', 'Your current passcode is not right.');
    const problem = passcodeProblem(body.data.next);
    if (problem) return err(c, 400, 'weak', problem);
    const keep = await sessionId(getCookie(c, SESSION_COOKIE) ?? '', c.env.SESSION_SECRET!);
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE user SET pass_hash = ? WHERE id = ?`).bind(await hashPasscode(body.data.next), user.id),
      c.env.DB.prepare(`DELETE FROM session WHERE user_id = ? AND id != ?`).bind(user.id, keep),
    ]);
    return c.json({ ok: true });
  });

  // First per-wedding route; the admin API (M3) hangs off this same guard.
  app.get('/w/:wid', requireUser, requireMember(), async (c) => {
    const w = await c.env.DB.prepare(`SELECT id, slug, name1, name2, timezone FROM wedding WHERE id = ?`).bind(c.req.param('wid')).first();
    return c.json({ wedding: w, role: c.get('role') });
  });

  return app;
}
