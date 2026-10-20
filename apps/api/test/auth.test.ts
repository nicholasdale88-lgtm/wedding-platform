import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode, passcodeProblem, verifyPasscode } from '../src/lib/auth';
import { testD1 } from './support/d1';

describe('passcodes', () => {
  it('hash and verify', async () => {
    const h = await hashPasscode('correct horse');
    expect(h).toMatch(/^pbkdf2\$100000\$/);
    expect(await verifyPasscode('correct horse', h)).toBe(true);
    expect(await verifyPasscode('correct hors', h)).toBe(false);
    expect(await verifyPasscode('anything', null)).toBe(false);
    expect(await hashPasscode('same')).not.toBe(await hashPasscode('same')); // salted
  });
  it('needs 8+ characters', () => {
    expect(passcodeProblem('2027')).toBe('Use at least 8 characters.');
    expect(passcodeProblem('long enough')).toBeNull();
  });
});

/** M1.4: email + passcode sign-in, sessions, and per-wedding membership. */
describe('admin sign-in', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}, cookie?: string) =>
    app.request(path, { ...init, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...init.headers } }, env, ctx);
  const login = (email: string, passcode: string, ip = '1.1.1.1') =>
    call('/api/a/auth/login', { method: 'POST', body: JSON.stringify({ email, passcode }), headers: { 'CF-Connecting-IP': ip } });
  const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0]!;

  beforeEach(async () => {
    t = await testD1();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-session-secret-0123456789', SUPER_ADMINS: 'boss@example.com' };
    const now = new Date().toISOString();
    await t.db.batch([
      t.db.prepare(`INSERT INTO user (id, email, pass_hash, created_at) VALUES ('u1', 'owner@example.com', ?, ?)`).bind(await hashPasscode('valley-2027'), now),
      t.db.prepare(`INSERT INTO user (id, email, pass_hash, created_at) VALUES ('u2', 'boss@example.com', ?, ?)`).bind(await hashPasscode('boss-pass-1'), now),
      t.db.prepare(`INSERT INTO wedding (id, slug, name1, name2, created_at, updated_at) VALUES ('w1', 'a-and-b', 'A', 'B', ?, ?)`).bind(now, now),
      t.db.prepare(`INSERT INTO wedding (id, slug, name1, name2, created_at, updated_at) VALUES ('w2', 'c-and-d', 'C', 'D', ?, ?)`).bind(now, now),
      t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES ('w1', 'u1', 'owner')`),
    ]);
  });
  afterEach(() => t.dispose());

  it('signs in with a secure HttpOnly cookie and lists the weddings', async () => {
    const res = await login(' Owner@Example.com ', 'valley-2027');
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/wp_session=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(await res.json()).toMatchObject({ user: { email: 'owner@example.com', superAdmin: false }, weddings: [{ id: 'w1', role: 'owner' }] });
  });

  it('never stores the session token itself', async () => {
    const token = cookieOf(await login('owner@example.com', 'valley-2027')).split('=')[1]!;
    const { results } = await t.db.prepare(`SELECT id FROM session`).all<{ id: string }>();
    expect(results).toHaveLength(1);
    expect(results[0]!.id).not.toBe(token);
  });

  it('wrong passcode and unknown email get the same answer', async () => {
    const a = await login('owner@example.com', 'wrong');
    const b = await login('nobody@example.com', 'wrong');
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(await a.json()).toEqual(await b.json());
  });

  it('slows down repeated guessing', async () => {
    for (let i = 0; i < 10; i++) expect((await login('owner@example.com', `guess-${i}`)).status).toBe(401);
    expect((await login('owner@example.com', 'valley-2027')).status).toBe(429);
    expect((await login('owner@example.com', 'valley-2027', '2.2.2.2')).status).toBe(200); // another network is unaffected
  });

  it('/me needs a session; logout ends it', async () => {
    expect((await call('/api/a/me')).status).toBe(401);
    const cookie = cookieOf(await login('owner@example.com', 'valley-2027'));
    expect((await call('/api/a/me', {}, cookie)).status).toBe(200);
    await call('/api/a/auth/logout', { method: 'POST', body: '{}' }, cookie);
    expect((await call('/api/a/me', {}, cookie)).status).toBe(401);
  });

  it('expired sessions are rejected', async () => {
    const cookie = cookieOf(await login('owner@example.com', 'valley-2027'));
    await t.db.prepare(`UPDATE session SET expires_at = '2000-01-01T00:00:00.000Z'`).run();
    expect((await call('/api/a/me', {}, cookie)).status).toBe(401);
  });

  it('a wedding is only visible to its members; others get 404 so ids cannot be probed', async () => {
    const cookie = cookieOf(await login('owner@example.com', 'valley-2027'));
    const mine = await call('/api/a/w/w1', {}, cookie);
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({ wedding: { slug: 'a-and-b' }, role: 'owner' });
    expect((await call('/api/a/w/w2', {}, cookie)).status).toBe(404);
    expect((await call('/api/a/w/nope', {}, cookie)).status).toBe(404);
    expect((await call('/api/a/w/w1')).status).toBe(401);
  });

  it('flags super-admins from SUPER_ADMINS', async () => {
    const res = await login('boss@example.com', 'boss-pass-1');
    expect(await res.json()).toMatchObject({ user: { superAdmin: true }, weddings: [] });
  });

  it('refuses non-JSON writes (CSRF) and bad input', async () => {
    const form = await app.request('/api/a/auth/login', { method: 'POST', body: 'email=a&passcode=b', headers: { 'content-type': 'application/x-www-form-urlencoded' } }, env, ctx);
    expect(form.status).toBe(415);
    expect((await call('/api/a/auth/login', { method: 'POST', body: '{"email":"not-an-email"}' })).status).toBe(400);
  });

  it('forgot your passcode: an emailed link sets a new one once, signs out everywhere else, and says nothing about who has an account', async () => {
    const forgot = (email: string, ip = '7.7.7.7') => call('/api/a/auth/forgot', { method: 'POST', body: JSON.stringify({ email }), headers: { 'CF-Connecting-IP': ip } });
    // Without email set up for the site, it says so (nothing to send).
    expect(await (await forgot('owner@example.com')).json()).toEqual({ ok: true, emailed: false });
    env = { ...env, RESEND_API_KEY: 're_test', EMAIL_FROM: 'Weddings <hello@example.com>' };
    const sent: { to: string[]; text: string }[] = [];
    vi.stubGlobal('fetch', async (_u: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)) as { to: string[]; text: string });
      return new Response('{}', { status: 200 });
    });
    try {
      const oldSession = cookieOf(await login('owner@example.com', 'valley-2027'));
      expect(await (await forgot('nobody@example.com', '7.7.7.8')).json()).toEqual({ ok: true, emailed: true }); // same answer
      expect(sent).toHaveLength(0);
      expect(await (await forgot('Owner@Example.com', '7.7.7.9')).json()).toEqual({ ok: true, emailed: true });
      expect(sent[0]!.to).toEqual(['owner@example.com']);
      const token = /\/admin\/reset\?t=([\w-]+)/.exec(sent[0]!.text)![1]!;
      const reset = (passcode: string, tok = token) => call('/api/a/auth/reset', { method: 'POST', body: JSON.stringify({ token: tok, passcode }) });
      expect((await reset('short')).status).toBe(400);
      const ok = await reset('new-valley-2028');
      expect(ok.status).toBe(200);
      expect(cookieOf(ok)).toMatch(/=/);
      expect((await reset('another-one-2029')).status).toBe(400); // once only
      expect((await call('/api/a/me', {}, oldSession)).status).toBe(401); // signed out everywhere else
      expect((await login('owner@example.com', 'valley-2027', '2.2.2.2')).status).toBe(401);
      expect((await login('owner@example.com', 'new-valley-2028', '2.2.2.3')).status).toBe(200);
      expect((await reset('new-valley-2030', 'x'.repeat(43))).status).toBe(400); // a made-up link
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses to sign anyone in when SESSION_SECRET is missing', async () => {
    delete env.SESSION_SECRET;
    expect((await login('owner@example.com', 'valley-2027')).status).toBe(500);
  });
});
