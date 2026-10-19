import { PARTY_PERMS, permsOf, segments, toE164, type PartyPerm } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { hashPasscode, newSessionToken, passcodeProblem, sessionId, verifyPasscode } from '../lib/auth';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { engineDeps, type Env } from '../env';
import { flush } from '../sms/engine';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';
import { changeDoc, members, readDoc } from './planner';

/**
 * The wedding party portal: bridesmaids, groomsmen and helpers sign in with an email and password.
 * - The couple invites each member (a link to set their password), sets what they can see and do, can
 *   send a password reset link, sign them out everywhere, or remove their sign-in.
 * - Members sign in, change their password, or reset it (a link texted to the mobile on their invitation).
 * - Invite and reset links, and sessions, are stored only as hashes. Five wrong passwords lock the
 *   sign-in for 15 minutes.
 * Admin: /api/a/w/:wid/party-accounts. Portal: /api/p/:slug/portal.
 */

const COOKIE = 'wp_party';
const DAYS = 30;
const INVITE_DAYS = 14;
const RESET_HOURS = 48;
const now = () => new Date().toISOString();
const secret = (env: Env) => env.SESSION_SECRET ?? 'dev-only-party-secret';
const hashOf = (env: Env, token: string) => sessionId(token, secret(env));
const err = (c: Context, status: 400 | 401 | 403 | 404 | 409 | 429, code: string, message: string) => c.json({ error: { code, message } }, status);

type Account = {
  id: string;
  wedding_id: string;
  person_id: string;
  email: string | null;
  pass_hash: string | null;
  perms: string;
  invite_expires: string | null;
  reset_expires: string | null;
  failed: number;
  locked_until: string | null;
  last_login: string | null;
};
const accountOf = (db: D1Database, where: string, ...bind: unknown[]) =>
  db.prepare(`SELECT id, wedding_id, person_id, email, pass_hash, perms, invite_expires, reset_expires, failed, locked_until, last_login FROM party_account WHERE ${where} AND deleted_at IS NULL`).bind(...bind).first<Account>();
const personOf = (db: D1Database, weddingId: string, personId: string) =>
  db
    .prepare(`SELECT p.id, p.name, p.party_role, p.invitation_id, i.token, i.phone FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE p.id = ? AND i.wedding_id = ? AND p.deleted_at IS NULL AND i.deleted_at IS NULL`)
    .bind(personId, weddingId)
    .first<{ id: string; name: string; party_role: string; invitation_id: string; token: string; phone: string | null }>();

/** Who's signed in to the portal on this request (for this wedding), with what they may do. */
export async function portalWho(c: Context<{ Bindings: Env }>, weddingId: string) {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const row = await c.env.DB.prepare(
    `SELECT a.id, a.person_id, a.perms FROM party_session s JOIN party_account a ON a.id = s.account_id AND a.deleted_at IS NULL WHERE s.id = ? AND s.wedding_id = ? AND s.expires_at > ?`,
  )
    .bind(await hashOf(c.env, token), weddingId, now())
    .first<{ id: string; person_id: string; perms: string }>();
  if (!row) return null;
  const person = await personOf(c.env.DB, weddingId, row.person_id);
  if (!person || !person.party_role) return null;
  return { accountId: row.id, person, perms: permsOf(safe(row.perms), person.party_role) };
}
const safe = (s: string) => {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return {};
  }
};

/** Start a session: the cookie (for this wedding's portal only) and its hash in the database. */
async function signIn(c: Context<{ Bindings: Env }>, account: { id: string; wedding_id: string }, slug: string) {
  const token = newSessionToken();
  const expires = new Date(Date.now() + DAYS * 86_400_000);
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO party_session (id, account_id, wedding_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`).bind(await hashOf(c.env, token), account.id, account.wedding_id, expires.toISOString(), now()),
    c.env.DB.prepare(`UPDATE party_account SET last_login = ?, failed = 0, locked_until = NULL WHERE id = ?`).bind(now(), account.id),
  ]);
  setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Lax', path: `/api/p/${slug}/`, expires });
}

// ---------------------------------------------------------------- the portal (members)

export function partyPortalRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  const weddingOf = (c: Context<{ Bindings: Env }>) =>
    c.env.DB.prepare(`SELECT id, slug, name1, name2, theme FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(c.req.param('slug') ?? '').first<{ id: string; slug: string; name1: string; name2: string; theme: string }>();
  const couple = (w: { name1: string; name2: string }) => `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`;

  /** Who's signed in: their name, role and permissions (and their invitation's link for the rest of the site). */
  app.get('/me', async (c) => {
    const w = await weddingOf(c);
    if (!w) return err(c, 404, 'not_found', 'Not found');
    const who = await portalWho(c, w.id);
    const setup = (await readDoc(c.env.DB, w.id, 'party-setup', '')).data;
    if (!who) return c.json({ signedIn: false, couple: couple(w), theme: w.theme, signInRequired: setup.signIn });
    const acc = await accountOf(c.env.DB, 'id = ?', who.accountId);
    return c.json({ signedIn: true, couple: couple(w), theme: w.theme, signInRequired: setup.signIn, name: who.person.name, role: who.person.party_role, email: acc?.email ?? '', perms: who.perms, token: who.person.token });
  });

  app.post('/login', async (c) => {
    const b = z.object({ email: z.string().trim().max(200), password: z.string().max(200) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Enter your email and password.');
    const w = await weddingOf(c);
    if (!w) return err(c, 404, 'not_found', 'Not found');
    const email = b.data.email.toLowerCase();
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    const ok = (await allow(c.env.DB, `plogin:ip:${ip}`, 30, 15 * 60_000)) && (await allow(c.env.DB, `plogin:${w.id}:${email}`, 20, 60 * 60_000));
    if (!ok) return err(c, 429, 'slow_down', 'Too many tries. Wait 15 minutes and try again.');
    const acc = await accountOf(c.env.DB, 'wedding_id = ? AND email = ?', w.id, email);
    if (acc?.locked_until && acc.locked_until > now()) return err(c, 429, 'locked', 'Too many wrong passwords. Wait 15 minutes, or reset your password.');
    if (!(await verifyPasscode(b.data.password, acc?.pass_hash ?? null)) || !acc) {
      if (acc) {
        const failed = acc.failed + 1;
        await c.env.DB.prepare(`UPDATE party_account SET failed = ?, locked_until = ? WHERE id = ?`).bind(failed >= 5 ? 0 : failed, failed >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null, acc.id).run();
      }
      return err(c, 401, 'bad_login', 'That email and password don’t match.');
    }
    const setup = (await readDoc(c.env.DB, w.id, 'party-setup', '')).data;
    if (setup.access[acc.person_id] === false) return err(c, 403, 'paused', 'Your page is paused for now. The couple will let you know when it’s back.');
    await signIn(c, acc, w.slug);
    return c.json({ ok: true });
  });

  app.post('/logout', async (c) => {
    const token = getCookie(c, COOKIE);
    if (token) await c.env.DB.prepare(`DELETE FROM party_session WHERE id = ?`).bind(await hashOf(c.env, token)).run();
    deleteCookie(c, COOKIE, { path: `/api/p/${c.req.param('slug') ?? ''}/`, secure: true });
    return c.json({ ok: true });
  });

  /** An invite or reset link: whose it is (to greet them), if it's still good. */
  app.get('/link', async (c) => {
    const w = await weddingOf(c);
    const t = c.req.query('t') ?? '';
    if (!w || t.length < 20) return err(c, 404, 'no_link', 'This link isn’t working. Ask the couple for a new one.');
    const h = await hashOf(c.env, t);
    const acc = (await accountOf(c.env.DB, 'wedding_id = ? AND invite_hash = ? AND invite_expires > ?', w.id, h, now())) ?? (await accountOf(c.env.DB, 'wedding_id = ? AND reset_hash = ? AND reset_expires > ?', w.id, h, now()));
    const person = acc ? await personOf(c.env.DB, w.id, acc.person_id) : null;
    if (!acc || !person) return err(c, 404, 'no_link', 'This link has expired or been used. Ask the couple for a new one.');
    return c.json({ name: person.name, role: person.party_role, couple: couple(w), theme: w.theme, email: acc.email ?? '', setUp: !!acc.pass_hash });
  });

  /** Accept an invite, or use a reset link: set the password (and the email, the first time); signed in. */
  app.post('/password-link', async (c) => {
    const b = z.object({ t: z.string().max(100), email: z.string().trim().max(200).optional(), password: z.string().max(200) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Choose a password.');
    const w = await weddingOf(c);
    if (!w) return err(c, 404, 'not_found', 'Not found');
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await allow(c.env.DB, `plink:${ip}`, 20, 15 * 60_000))) return err(c, 429, 'slow_down', 'Too many tries. Wait 15 minutes and try again.');
    const h = await hashOf(c.env, b.data.t);
    const acc = (await accountOf(c.env.DB, 'wedding_id = ? AND invite_hash = ? AND invite_expires > ?', w.id, h, now())) ?? (await accountOf(c.env.DB, 'wedding_id = ? AND reset_hash = ? AND reset_expires > ?', w.id, h, now()));
    if (!acc) return err(c, 404, 'no_link', 'This link has expired or been used. Ask the couple for a new one.');
    const problem = passcodeProblem(b.data.password);
    if (problem) return err(c, 400, 'weak', problem);
    const email = (b.data.email ?? acc.email ?? '').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(c, 400, 'email', 'Enter your email: it’s how you’ll sign in.');
    const taken = await accountOf(c.env.DB, 'wedding_id = ? AND email = ? AND id != ?', w.id, email, acc.id);
    if (taken) return err(c, 409, 'email_taken', 'Someone in the wedding party already signs in with that email.');
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE party_account SET email = ?, pass_hash = ?, invite_hash = NULL, invite_expires = NULL, reset_hash = NULL, reset_expires = NULL, failed = 0, locked_until = NULL, updated_at = ? WHERE id = ?`).bind(
        email,
        await hashPasscode(b.data.password),
        now(),
        acc.id,
      ),
      // A new password signs out every other device.
      c.env.DB.prepare(`DELETE FROM party_session WHERE account_id = ?`).bind(acc.id),
    ]);
    await signIn(c, acc, w.slug);
    return c.json({ ok: true });
  });

  /** Forgot it: a reset link is texted to the mobile on their invitation (no answer says whether the email exists). */
  app.post('/forgot', async (c) => {
    const b = z.object({ email: z.string().trim().max(200) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Enter your email.');
    const w = await weddingOf(c);
    if (!w) return err(c, 404, 'not_found', 'Not found');
    const email = b.data.email.toLowerCase();
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await allow(c.env.DB, `pforgot:ip:${ip}`, 10, 60 * 60_000)) || !(await allow(c.env.DB, `pforgot:${w.id}:${email}`, 3, 60 * 60_000))) {
      return err(c, 429, 'slow_down', 'Too many tries. Wait an hour, or ask the couple for a reset link.');
    }
    const acc = await accountOf(c.env.DB, 'wedding_id = ? AND email = ?', w.id, email);
    const person = acc ? await personOf(c.env.DB, w.id, acc.person_id) : null;
    const phone = toE164(person?.phone ?? '');
    if (acc && person && phone) {
      const t = newSessionToken();
      await c.env.DB.prepare(`UPDATE party_account SET reset_hash = ?, reset_expires = ?, updated_at = ? WHERE id = ?`).bind(await hashOf(c.env, t), new Date(Date.now() + RESET_HOURS * 3_600_000).toISOString(), now(), acc.id).run();
      const d = engineDeps(c.env);
      const ctx = await d.store.wedding(w.id);
      if (ctx?.sender && !ctx.paused) {
        const body = `${couple(w)}’s wedding party: reset your password here ${ctx.baseUrl.replace(/\/+$/, '')}/w/${w.slug}/party/reset?t=${t} (works for 48 hours). Didn’t ask? Ignore this.`;
        await d.store.enqueue([{ weddingId: w.id, invitationId: person.invitation_id, campaignId: null, dedupeKey: `preset:${acc.id}:${Date.now()}`, kind: 'test', to: phone, body, parts: segments(body).parts }]);
        await flush(d, ctx).catch(() => undefined);
      }
    }
    return c.json({ ok: true, message: 'If that email signs in here, we’ve texted a reset link to the mobile on your invitation. No text? Ask the couple to send you one.' });
  });

  /** Change their password (needs the current one); every other device is signed out. */
  app.post('/password', async (c) => {
    const b = z.object({ current: z.string().max(200), next: z.string().max(200) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Enter your current and new password.');
    const w = await weddingOf(c);
    const who = w ? await portalWho(c, w.id) : null;
    if (!w || !who) return err(c, 401, 'sign_in', 'Please sign in.');
    if (!(await allow(c.env.DB, `ppass:${who.accountId}`, 5, 15 * 60_000))) return err(c, 429, 'slow_down', 'Too many tries. Wait 15 minutes.');
    const acc = await accountOf(c.env.DB, 'id = ?', who.accountId);
    if (!(await verifyPasscode(b.data.current, acc?.pass_hash ?? null))) return err(c, 400, 'bad_password', 'Your current password isn’t right.');
    const problem = passcodeProblem(b.data.next);
    if (problem) return err(c, 400, 'weak', problem);
    const keep = await hashOf(c.env, getCookie(c, COOKIE) ?? '');
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE party_account SET pass_hash = ?, updated_at = ? WHERE id = ?`).bind(await hashPasscode(b.data.next), now(), who.accountId),
      c.env.DB.prepare(`DELETE FROM party_session WHERE account_id = ? AND id != ?`).bind(who.accountId, keep),
    ]);
    return c.json({ ok: true });
  });
  return app;
}

// ---------------------------------------------------------------- the couple's side

export function partyAccountRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');
  const wid = (c: Context<AdminEnv>) => c.req.param('wid')!;
  const base = (c: Context<AdminEnv>) => (c.env.PUBLIC_BASE_URL ?? new URL(c.req.url).origin).replace(/\/+$/, '');
  const slugOf = async (c: Context<AdminEnv>) => (await c.env.DB.prepare(`SELECT slug FROM wedding WHERE id = ?`).bind(wid(c)).first<{ slug: string }>())?.slug ?? '';

  /** Everyone in the party: their sign-in (none, invited, signed up), its permissions, when they last signed in. */
  app.get('/', async (c) => {
    const db = c.env.DB;
    const [people, setup, { results: accounts }] = await Promise.all([
      members(db, wid(c)),
      readDoc(db, wid(c), 'party-setup', ''),
      db.prepare(`SELECT id, person_id, email, pass_hash, perms, invite_expires, last_login, locked_until FROM party_account WHERE wedding_id = ? AND deleted_at IS NULL`).bind(wid(c)).all<{
        id: string;
        person_id: string;
        email: string | null;
        pass_hash: string | null;
        perms: string;
        invite_expires: string | null;
        last_login: string | null;
        locked_until: string | null;
      }>(),
    ]);
    const byPerson = new Map(accounts.map((a) => [a.person_id, a]));
    return c.json({
      signIn: setup.data.signIn,
      members: people.map((p) => {
        const a = byPerson.get(p.personId);
        return {
          personId: p.personId,
          name: p.name,
          role: p.role,
          side: p.side,
          hasMobile: !!p.phone,
          paused: setup.data.access[p.personId] === false,
          account: a
            ? { status: a.pass_hash ? 'active' : 'invited', email: a.email ?? '', lastLogin: a.last_login, inviteExpires: a.invite_expires, locked: !!a.locked_until && a.locked_until > now(), perms: permsOf(safe(a.perms), p.role) }
            : null,
          perms: permsOf(safe(a?.perms ?? '{}'), p.role),
        };
      }),
    });
  });

  /** Sign-in needed for the portal (or private links still open it). */
  app.put('/settings', writer, async (c) => {
    const b = z.object({ signIn: z.boolean() }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'That didn’t save.');
    const ok = await changeDoc(c.env.DB, wid(c), 'party-setup', '', (d) => {
      d.signIn = b.data.signIn;
    });
    return ok ? c.json({ signIn: b.data.signIn }) : err(c, 409, 'busy', 'Busy, try again.');
  });

  const memberOf = async (c: Context<AdminEnv>) => {
    const p = await personOf(c.env.DB, wid(c), c.req.param('pid') ?? '');
    return p && p.party_role ? p : null;
  };

  /** Invite them (or a fresh invite link): a link to set their password, good for 14 days. */
  app.post('/:pid/invite', writer, async (c) => {
    const p = await memberOf(c);
    if (!p) return err(c, 404, 'not_found', 'They’re not in the wedding party.');
    const b = z.object({ email: z.string().trim().max(200).optional() }).strict().safeParse((await readJson(c.req.raw)) ?? {});
    const email = b.success && b.data.email ? b.data.email.toLowerCase() : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(c, 400, 'email', 'That email doesn’t look right.');
    if (email && (await accountOf(c.env.DB, 'wedding_id = ? AND email = ? AND person_id != ?', wid(c), email, p.id))) return err(c, 409, 'email_taken', 'Someone else in the party signs in with that email.');
    const t = newSessionToken();
    const h = await hashOf(c.env, t);
    const expires = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();
    const cur = await accountOf(c.env.DB, 'wedding_id = ? AND person_id = ?', wid(c), p.id);
    if (cur) {
      await c.env.DB.prepare(`UPDATE party_account SET invite_hash = ?, invite_expires = ?, email = COALESCE(?, email), updated_at = ? WHERE id = ?`).bind(h, expires, email, now(), cur.id).run();
    } else {
      await c.env.DB.prepare(`INSERT INTO party_account (id, wedding_id, person_id, email, perms, invite_hash, invite_expires, failed, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?, 0, ?, ?)`)
        .bind(crypto.randomUUID(), wid(c), p.id, email, h, expires, now(), now())
        .run();
    }
    return c.json({ link: `${base(c)}/w/${await slugOf(c)}/party/join?t=${t}`, expires, phone: p.phone ?? '' });
  });

  /** What they can see and do. */
  app.put('/:pid/perms', writer, async (c) => {
    const b = z.object({ perms: z.record(z.enum(PARTY_PERMS), z.boolean()) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'That didn’t save.');
    const p = await memberOf(c);
    if (!p) return err(c, 404, 'not_found', 'They’re not in the wedding party.');
    const perms = permsOf(b.data.perms as Partial<Record<PartyPerm, boolean>>, p.party_role);
    const cur = await accountOf(c.env.DB, 'wedding_id = ? AND person_id = ?', wid(c), p.id);
    if (cur) await c.env.DB.prepare(`UPDATE party_account SET perms = ?, updated_at = ? WHERE id = ?`).bind(JSON.stringify(perms), now(), cur.id).run();
    else
      await c.env.DB.prepare(`INSERT INTO party_account (id, wedding_id, person_id, perms, failed, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)`)
        .bind(crypto.randomUUID(), wid(c), p.id, JSON.stringify(perms), now(), now())
        .run();
    return c.json({ perms });
  });

  /** A password reset link for them (48 hours): copy it or text it. */
  app.post('/:pid/reset', writer, async (c) => {
    const p = await memberOf(c);
    const acc = p ? await accountOf(c.env.DB, 'wedding_id = ? AND person_id = ?', wid(c), p.id) : null;
    if (!p || !acc?.pass_hash) return err(c, 404, 'no_account', 'They haven’t set up their sign-in yet: send them an invite instead.');
    const t = newSessionToken();
    await c.env.DB.prepare(`UPDATE party_account SET reset_hash = ?, reset_expires = ?, failed = 0, locked_until = NULL, updated_at = ? WHERE id = ?`).bind(await hashOf(c.env, t), new Date(Date.now() + RESET_HOURS * 3_600_000).toISOString(), now(), acc.id).run();
    return c.json({ link: `${base(c)}/w/${await slugOf(c)}/party/reset?t=${t}`, phone: p.phone ?? '' });
  });

  /** Sign them out on every device. */
  app.post('/:pid/signout', writer, async (c) => {
    const acc = await accountOf(c.env.DB, 'wedding_id = ? AND person_id = ?', wid(c), c.req.param('pid') ?? '');
    if (acc) await c.env.DB.prepare(`DELETE FROM party_session WHERE account_id = ?`).bind(acc.id).run();
    return c.json({ ok: true });
  });

  /** Remove their sign-in (they can be invited again). */
  app.delete('/:pid', writer, async (c) => {
    const acc = await accountOf(c.env.DB, 'wedding_id = ? AND person_id = ?', wid(c), c.req.param('pid') ?? '');
    if (acc) {
      await c.env.DB.batch([
        c.env.DB.prepare(`DELETE FROM party_session WHERE account_id = ?`).bind(acc.id),
        c.env.DB.prepare(`UPDATE party_account SET deleted_at = ?, email = NULL, pass_hash = NULL, invite_hash = NULL, reset_hash = NULL WHERE id = ?`).bind(now(), acc.id),
      ]);
    }
    return c.json({ ok: true });
  });
  return app;
}
